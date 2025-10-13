import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import * as diff from 'diff';
import { prisma } from '../config/database';
import { PrismaClient } from '@prisma/client';
import { cacheService } from './cacheService';

// Cliente Prisma para conectar ao banco PRINCIPAL (meulink)
// Isso permite buscar configurações de API diretamente do painel admin
const mainDbPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.MAIN_DATABASE_URL
    }
  }
});

// Função para obter as configurações da API do banco PRINCIPAL com cache
async function getAPISettings() {
  const cacheKey = 'api_settings:all';
  
  try {
    // Tentar buscar do cache primeiro
    const cached = await cacheService.get<Record<string, string>>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Buscar do banco PRINCIPAL (meulink) onde o admin configura
    const settings = await mainDbPrisma.$queryRaw`
      SELECT key, value FROM system_settings 
      WHERE key IN ('anthropic_api_key', 'openai_api_key', 'gemini_api_key')
    ` as Array<{ key: string; value: string }>;
    
    const settingsMap: Record<string, string> = {};
    settings.forEach((setting: { key: string; value: string }) => {
      // Só usar chave do banco se não estiver vazia
      if (setting.value && setting.value.trim().length > 0) {
        settingsMap[setting.key] = setting.value;
      }
    });
    
    // Cachear por 5 minutos (300 segundos)
    await cacheService.set(cacheKey, settingsMap, 300);
    
    return settingsMap;
  } catch (error) {
    // Fallback: tentar buscar do banco local do microserviço
    try {
      const localSettings = await prisma.$queryRaw`
        SELECT key, value FROM system_settings 
        WHERE key IN ('anthropic_api_key', 'openai_api_key', 'gemini_api_key')
      ` as Array<{ key: string; value: string }>;
      
      const settingsMap: Record<string, string> = {};
      localSettings.forEach((setting: { key: string; value: string }) => {
        settingsMap[setting.key] = setting.value;
      });
      
      return settingsMap;
    } catch (fallbackError) {
      return {};
    }
  }
}

// Função para obter cliente Anthropic configurado
async function getAnthropicClient() {
  const settings = await getAPISettings();
  const apiKey = settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error('Chave da API do Claude não configurada. Entre em contato com o administrador.');
  }
  
  return new Anthropic({ apiKey });
}

// Função para obter cliente OpenAI configurado
async function getOpenAIClient() {
  const settings = await getAPISettings();
  const apiKey = settings.openai_api_key || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Chave da API do OpenAI não configurada. Entre em contato com o administrador.');
  }
  
  return new OpenAI({ apiKey });
}

// Gerenciador inteligente de APIs
class AIServiceManager {
  private anthropicClient: Anthropic | null = null;
  private openaiClient: OpenAI | null = null;
  private anthropicAvailable = false;
  private openaiAvailable = false;

  async initialize() {
    // Tentar inicializar Claude
    try {
      this.anthropicClient = await getAnthropicClient();
      this.anthropicAvailable = true;
    } catch (error) {
      this.anthropicAvailable = false;
    }

    // Tentar inicializar OpenAI
    try {
      this.openaiClient = await getOpenAIClient();
      this.openaiAvailable = true;
    } catch (error) {
      this.openaiAvailable = false;
    }

    if (!this.anthropicAvailable && !this.openaiAvailable) {
      throw new Error('Nenhuma API de IA está configurada. Configure pelo menos uma API no painel administrativo.');
    }
  }

  // Método para obter a melhor API disponível
  getBestAPI(): 'claude' | 'openai' | 'both' {
    if (this.anthropicAvailable && this.openaiAvailable) {
      return 'both'; // Modo colaborativo
    } else if (this.anthropicAvailable) {
      return 'claude';
    } else if (this.openaiAvailable) {
      return 'openai';
    } else {
      throw new Error('Nenhuma API disponível');
    }
  }

  // Método para usar Claude (se disponível)
  async useClaude<T>(operation: (client: Anthropic) => Promise<T>): Promise<T> {
    if (!this.anthropicAvailable || !this.anthropicClient) {
      throw new Error('Claude não está disponível');
    }
    return await operation(this.anthropicClient);
  }

  // Método para usar OpenAI (se disponível)
  async useOpenAI<T>(operation: (client: OpenAI) => Promise<T>): Promise<T> {
    if (!this.openaiAvailable || !this.openaiClient) {
      throw new Error('OpenAI não está disponível');
    }
    return await operation(this.openaiClient);
  }

  // Método para usar a melhor API disponível com fallback
  async useBestAPI<T>(
    claudeOperation: (client: Anthropic) => Promise<T>,
    openaiOperation: (client: OpenAI) => Promise<T>
  ): Promise<T> {
    const bestAPI = this.getBestAPI();
    
    if (bestAPI === 'claude') {
      return await this.useClaude(claudeOperation);
    } else if (bestAPI === 'openai') {
      return await this.useOpenAI(openaiOperation);
    } else {
      // Modo colaborativo - tentar Claude primeiro, fallback para OpenAI
      try {
        return await this.useClaude(claudeOperation);
      } catch (error) {
        return await this.useOpenAI(openaiOperation);
      }
    }
  }

  // Verificar se APIs estão disponíveis
  isClaudeAvailable(): boolean {
    return this.anthropicAvailable;
  }

  isOpenAIAvailable(): boolean {
    return this.openaiAvailable;
  }

  isAnyAvailable(): boolean {
    return this.anthropicAvailable || this.openaiAvailable;
  }
}

// Instância global do gerenciador
const aiManager = new AIServiceManager();

export interface GeneratePageRequest {
  title: string;
  prompt: string;
  slug: string;
  isEdit?: boolean;
  existingContent?: string;
  editInstructions?: string;
}

export interface GeneratedPage {
  htmlContent: string;
  metaTitle?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
}

// Função para limpar o HTML gerado
function cleanGeneratedHTML(html: string): string {
  let cleanedHTML = html.trim();
  
  const unwantedPatterns = [
    /\*\*HTML_END.*$/gi,
    /\*\*\*+.*$/gi,
    /^END\s*$/gm,
    /^HTML_END\s*$/gm,
    /Personalize.*$/gi,
    /Ajuste.*$/gi,
    /Modifique.*$/gi,
    /Lembre-se.*$/gi,
    /Observação:.*$/gi,
    /Nota:.*$/gi,
    // Padrões para remover blocos de código
    /^```html\s*$/gm,
    /^```[a-zA-Z]*\s*$/gm,
    /```[a-zA-Z]*\s*$/gm,
    /^```\s*$/gm,
    /```\s*$/gm,
    /^```.*$/gm,
    /```.*$/gm,
  ];

  unwantedPatterns.forEach(pattern => {
    cleanedHTML = cleanedHTML.replace(pattern, '');
  });

  cleanedHTML = cleanedHTML.replace(/\n\s*\n\s*$/g, '');
  
  const openTags = (cleanedHTML.match(/<[^/][^>]*>/g) || []).length;
  const closeTags = (cleanedHTML.match(/<\/[^>]*>/g) || []).length;
  
  if (openTags > closeTags) {
    const divCount = (cleanedHTML.match(/<div[^>]*>/gi) || []).length;
    const divCloseCount = (cleanedHTML.match(/<\/div>/gi) || []).length;
    
    for (let i = 0; i < divCount - divCloseCount; i++) {
      cleanedHTML += '</div>';
    }
  }

  return cleanedHTML.trim();
}

export async function generatePageWithAI(request: GeneratePageRequest): Promise<GeneratedPage> {
  try {
    // Inicializar o gerenciador de APIs se ainda não foi inicializado
    if (!aiManager.isAnyAvailable()) {
      await aiManager.initialize();
    }

    if (request.isEdit && request.existingContent && request.editInstructions) {
      return await editPageWithAI(request);
    }

    return await createNewPageWithAI(request);
  } catch (error) {
    throw new Error("Falha ao gerar página com IA");
  }
}

// Função para editar páginas existentes de forma cirúrgica
async function editPageWithAI(request: GeneratePageRequest): Promise<GeneratedPage> {
  return await aiManager.useBestAPI(
    // Operação com Claude
    async (claude) => {
      return await editPageWithClaude(request, claude);
    },
    // Operação com OpenAI
    async (openai) => {
      return await editPageWithOpenAI(request, openai);
    }
  );
}

// Função específica para editar com Claude
async function editPageWithClaude(request: GeneratePageRequest, anthropic: Anthropic): Promise<GeneratedPage> {
  
  const analysisPrompt = `
    Você é um especialista em análise precisa de código HTML.
    
    CONTEXTO: O usuário quer fazer uma mudança específica numa página existente.
    SUA MISSÃO: Identificar EXATAMENTE onde e o que mudar, sendo o mais conservador possível.
    
    HTML ATUAL:
    \`\`\`html
    ${request.existingContent}
    \`\`\`
    
    INSTRUÇÃO DE EDIÇÃO:
    "${request.editInstructions}"
    
    ARQUIVOS ANEXADOS (use URLs EXATAS):
    - Se encontrar "CAMINHO DO ARQUIVO:" ou "CAMINHO DA IMAGEM:", use o caminho EXATO no HTML
    - Para imagens: <img src="url_completa" />
    - Para vídeos: <video src="url_completa" controls></video>
    - NÃO modifique as URLs fornecidas
    
    ANÁLISE REQUERIDA - Responda APENAS com este JSON:
    {
      "changes": [
        {
          "target": "exato texto/elemento a ser alterado",
          "replacement": "novo conteúdo exato",
          "context": "fragmento maior onde está localizado (para precisão)",
          "type": "text|color|size|attribute|content"
        }
      ],
      "summary": "resumo das mudanças mínimas necessárias"
    }
    
    REGRAS ABSOLUTAS:
    1. Identifique APENAS o que deve mudar na instrução
    2. Se pedir "mude a cor do botão para azul", encontre APENAS a cor do botão
    3. Se pedir "altere o título", encontre APENAS o título
    4. NÃO sugira mudanças não solicitadas
    5. Use o texto EXATO que existe no HTML
    6. Seja cirúrgico: mínima intervenção possível
    
    EXEMPLO:
    Instrução: "mude a cor do botão para azul"
    HTML: '<button class="bg-red-500 text-white">Clique</button>'
    Resposta: {"changes":[{"target":"bg-red-500","replacement":"bg-blue-500","context":"<button class=\"bg-red-500 text-white\">","type":"color"}]}
  `;

  try {
    const analysisCompletion = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000, // Claude Sonnet 4.5 suporta até 8.192 tokens
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: analysisPrompt
        }
      ],
    });

    const analysisText = analysisCompletion.content[0]?.type === 'text' ? analysisCompletion.content[0].text : "{}";
    let analysis;
    
    try {
      const cleanedAnalysisText = analysisText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .replace(/^\s*[\r\n]/gm, '')
        .trim();
      
      analysis = JSON.parse(cleanedAnalysisText);
    } catch (e) {
      return await editPageWithClaudeFallback(request, anthropic);
    }

    let modifiedHTML = request.existingContent || "";
    
    for (const change of analysis.changes || []) {
      modifiedHTML = applySurgicalChange(modifiedHTML, change);
    }

    const changesApplied = analysis.changes?.every((change: any) => 
      !modifiedHTML.includes(change.target) || modifiedHTML.includes(change.replacement)
    );

    if (!changesApplied) {
      return await editPageWithClaudeFallback(request, anthropic);
    }

    const cleanedHTML = cleanGeneratedHTML(modifiedHTML);

    return {
      htmlContent: cleanedHTML,
      metaTitle: request.title,
      metaDescription: `Página editada: ${request.title}`,
      ogTitle: request.title,
      ogDescription: `Página editada: ${request.title}`,
    };

  } catch (error) {
    return await editPageWithClaudeFallback(request, anthropic);
  }
}

// Função específica para editar com OpenAI
async function editPageWithOpenAI(request: GeneratePageRequest, openai: OpenAI): Promise<GeneratedPage> {
  const systemPrompt = `
    Você é um especialista em editar páginas web HTML existentes.
    
    INSTRUÇÕES CRÍTICAS:
    - Você receberá o HTML atual da página e instruções de edição
    - Faça APENAS as alterações solicitadas
    - PRESERVE todo o resto do conteúdo, CSS, estrutura e design
    - NÃO recrie a página do zero
    - Mantenha todas as classes CSS, IDs e estrutura HTML existente
    - Faça modificações pontuais e precisas
    
    ARQUIVOS ANEXADOS:
    - Quando o usuário fornecer "CAMINHO DO ARQUIVO:" ou "CAMINHO DA IMAGEM:", use o caminho EXATO fornecido
    - Para imagens: use <img src="caminho_fornecido" /> com a URL completa fornecida
    - Para vídeos: use <video src="caminho_fornecido" controls></video> com a URL completa fornecida
    - NÃO modifique ou altere as URLs fornecidas
    - As URLs já estão hospedadas e prontas para uso direto
    
    FORMATO DE RESPOSTA:
    - Retorne APENAS o HTML modificado
    - NÃO inclua tags <html>, <head>, <body>
    - NÃO adicione comentários explicativos
    - NÃO adicione texto adicional no final
    - Termine com uma tag HTML válida
  `;

  const userPrompt = `
    HTML ATUAL:
    ${request.existingContent}
    
    ALTERAÇÕES SOLICITADAS:
    ${request.editInstructions}
    
    Faça APENAS as alterações solicitadas, preservando todo o resto do HTML e CSS existente.
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      max_completion_tokens: 2000,
      temperature: 1, // GPT-5 só aceita temperatura padrão (1)
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
    });

    const htmlContent = completion.choices[0]?.message?.content || "";
    const cleanedHTML = cleanGeneratedHTML(htmlContent);

    return {
      htmlContent: cleanedHTML,
      metaTitle: request.title,
      metaDescription: `Página editada: ${request.title}`,
      ogTitle: request.title,
      ogDescription: `Página editada: ${request.title}`,
    };
  } catch (error) {
    throw error;
  }
}

// Função para aplicar mudança cirúrgica específica
function applySurgicalChange(html: string, change: any): string {
  const { target, replacement, context, type } = change;
  
  try {
    if (context && target && replacement) {
      const contextIndex = html.indexOf(context);
      if (contextIndex !== -1) {
        const beforeContext = html.substring(0, contextIndex);
        const contextSection = html.substring(contextIndex, contextIndex + context.length + 200);
        const afterContext = html.substring(contextIndex + context.length + 200);
        
        const modifiedContext = contextSection.replace(target, replacement);
        return beforeContext + modifiedContext + afterContext;
      }
    }
    
    if (target && replacement) {
      const targetIndex = html.indexOf(target);
      if (targetIndex !== -1) {
        return html.substring(0, targetIndex) + 
               replacement + 
               html.substring(targetIndex + target.length);
      }
    }
    
    return html;
  } catch (error) {
    return html;
  }
}

// Função fallback para Claude (método anterior)
async function editPageWithClaudeFallback(request: GeneratePageRequest, anthropic: Anthropic): Promise<GeneratedPage> {
  
  const systemPrompt = `
    Você é um especialista em editar páginas web HTML existentes.
    
    INSTRUÇÕES CRÍTICAS:
    - Você receberá o HTML atual da página e instruções de edição
    - Faça APENAS as alterações solicitadas
    - PRESERVE todo o resto do conteúdo, CSS, estrutura e design
    - NÃO recrie a página do zero
    - Mantenha todas as classes CSS, IDs e estrutura HTML existente
    - Faça modificações pontuais e precisas
    
    ARQUIVOS ANEXADOS:
    - Quando o usuário fornecer "CAMINHO DO ARQUIVO:" ou "CAMINHO DA IMAGEM:", use o caminho EXATO fornecido
    - Para imagens: use <img src="caminho_fornecido" /> com a URL completa fornecida
    - Para vídeos: use <video src="caminho_fornecido" controls></video> com a URL completa fornecida
    - NÃO modifique ou altere as URLs fornecidas
    - As URLs já estão hospedadas e prontas para uso direto
    
    FORMATO DE RESPOSTA:
    - Retorne APENAS o HTML modificado
    - NÃO inclua tags <html>, <head>, <body>
    - NÃO adicione comentários explicativos
    - NÃO adicione texto adicional no final
    - Termine com uma tag HTML válida
  `;

  const userPrompt = `
    HTML ATUAL:
    ${request.existingContent}
    
    ALTERAÇÕES SOLICITADAS:
    ${request.editInstructions}
    
    Faça APENAS as alterações solicitadas, preservando todo o resto do HTML e CSS existente.
  `;

  const completion = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8000, // Claude Sonnet 4.5 suporta até 8.192 tokens
    temperature: 0.6,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt
      }
    ],
  });

  const htmlContent = completion.content[0]?.type === 'text' ? completion.content[0].text : "";
  const cleanedHTML = cleanGeneratedHTML(htmlContent);

  return {
    htmlContent: cleanedHTML,
    metaTitle: request.title,
    metaDescription: `Página editada: ${request.title}`,
    ogTitle: request.title,
    ogDescription: `Página editada: ${request.title}`,
  };
}

// Função para criar páginas novas
async function createNewPageWithAI(request: GeneratePageRequest): Promise<GeneratedPage> {
  return await aiManager.useBestAPI(
    // Operação com Claude
    async (claude) => {
      return await createNewPageWithClaude(request, claude);
    },
    // Operação com OpenAI
    async (openai) => {
      return await createNewPageWithOpenAI(request, openai);
    }
  );
}

// Função específica para criar páginas com Claude
async function createNewPageWithClaude(request: GeneratePageRequest, anthropic: Anthropic): Promise<GeneratedPage> {
  
  try {
    const systemPrompt = `
      Você é um especialista em criar páginas web modernas, responsivas e visualmente atraentes.
      
      DIRETRIZES DE DESIGN:
      - Use HTML5 semântico com estrutura clara
      - CSS inline moderno com gradientes, sombras e animações.
      - Layout responsivo que funciona em mobile e desktop
      - Tipografia hierárquica e legível
      - Cores harmoniosas e contrastantes
      - Espaçamento adequado entre elementos
      - Botões e links com hover effects
      - Imagens placeholder quando necessário
      
      ESTRUTURA PADRÃO:
      De acordo com o prompt, crie a estrutura da página.
      Ou se não tiver prompt especifico:
      - Header com título principal
      - Seção de conteúdo principal
      - Call-to-action ou botões de ação
      - Use classes Tailwind CSS quando apropriado
      
      ARQUIVOS ANEXADOS:
      - Quando o usuário fornecer "CAMINHO DO ARQUIVO:" ou "CAMINHO DA IMAGEM:", use o caminho EXATO fornecido
      - Para imagens: use <img src="caminho_fornecido" /> com a URL completa fornecida
      - Para vídeos: use <video src="caminho_fornecido" controls></video> com a URL completa fornecida
      - NÃO modifique ou altere as URLs fornecidas
      - As URLs já estão hospedadas e prontas para uso direto
      
      FORMATO DE RESPOSTA:
      - Retorne APENAS HTML válido e completo
      - NÃO inclua <html>, <head>, <body>
      - NÃO adicione comentários ou texto explicativo
      - NÃO termine com texto solto ou instruções
      - Termine com uma tag de fechamento válida (</div>, </section>, etc)
      - HTML deve estar pronto para uso direto
      
      EXEMPLO DE ESTRUTURA:
      <div class="min-h-screen bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500">
        <div class="container mx-auto px-4 py-8">
          <header class="text-center mb-12">
            <h1 class="text-5xl font-bold text-white mb-4">Título Principal</h1>
            <p class="text-xl text-white/90">Subtítulo descritivo</p>
          </header>
          <!-- Conteúdo principal -->
        </div>
      </div>
    `;

    const userPrompt = `
      CRIE UMA PÁGINA WEB COMPLETA E PROFISSIONAL:
      
      Título: ${request.title}
      Descrição: ${request.prompt}
      
      INSTRUÇÕES ESPECÍFICAS:
      - Crie uma página visualmente atraente e moderna
      - Use gradientes, sombras e efeitos visuais
      - Inclua botões de ação relevantes
      - Torne a página responsiva para mobile
      - Use cores que combinem com o tema
      - Adicione elementos interativos (hover effects)
      - Inclua seções bem definidas
      
      IMPORTANTE: Retorne APENAS o código HTML completo e válido, sem texto adicional.
    `;

    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000, // Claude Sonnet 4.5 suporta até 8.192 tokens
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt
        }
      ],
    });

    const htmlContent = completion.content[0]?.type === 'text' ? completion.content[0].text : "";
    const cleanedHTML = cleanGeneratedHTML(htmlContent);

    // Generate meta information with Claude
    const metaCompletion = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 500, // Claude Sonnet 4.5 suporta até 8.192 tokens
      temperature: 0.3,
      system: "Você é um especialista em SEO. Gere meta tags otimizadas para a página baseada no conteúdo fornecido. Retorne apenas um JSON válido com metaTitle, metaDescription, ogTitle e ogDescription.",
      messages: [
        {
          role: "user",
          content: `Título: ${request.title}\nPrompt: ${request.prompt}\nCrie meta tags SEO-friendly para esta página. Responda APENAS com JSON válido.`
        }
      ],
    });

    let metaData: any = {};
    try {
      const metaText = metaCompletion.content[0]?.type === 'text' ? metaCompletion.content[0].text : "{}";
      
      const cleanedMetaText = metaText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .replace(/^\s*[\r\n]/gm, '')
        .trim();
      
      metaData = JSON.parse(cleanedMetaText);
    } catch (e) {
      metaData = {};
    }

    return {
      htmlContent: cleanedHTML,
      metaTitle: metaData?.metaTitle || request.title,
      metaDescription: metaData?.metaDescription || `Página criada com IA: ${request.title}`,
      ogTitle: metaData?.ogTitle || request.title,
      ogDescription: metaData?.ogDescription || `Página criada com IA: ${request.title}`,
    };
  } catch (error) {
    throw new Error("Falha ao criar página com Claude");
  }
}

// Função específica para criar páginas com OpenAI
async function createNewPageWithOpenAI(request: GeneratePageRequest, openai: OpenAI): Promise<GeneratedPage> {
  console.log('✨ [OPENAI] Iniciando criação de página...');
  try {
    const systemPrompt = `
      Você é um especialista em criar páginas web modernas, responsivas e visualmente atraentes.
      
      DIRETRIZES DE DESIGN:
      - Use HTML5 semântico com estrutura clara
      - CSS inline moderno com gradientes, sombras e animações.
      - Layout responsivo que funciona em mobile e desktop
      - Tipografia hierárquica e legível
      - Cores harmoniosas e contrastantes
      - Espaçamento adequado entre elementos
      - Botões e links com hover effects
      - Imagens placeholder quando necessário
      
      ESTRUTURA PADRÃO:
      De acordo com o prompt, crie a estrutura da página.
      Ou se não tiver prompt especifico:
      - Header com título principal
      - Seção de conteúdo principal
      - Call-to-action ou botões de ação
      - Use classes Tailwind CSS quando apropriado
      
      ARQUIVOS ANEXADOS:
      - Quando o usuário fornecer "CAMINHO DO ARQUIVO:" ou "CAMINHO DA IMAGEM:", use o caminho EXATO fornecido
      - Para imagens: use <img src="caminho_fornecido" /> com a URL completa fornecida
      - Para vídeos: use <video src="caminho_fornecido" controls></video> com a URL completa fornecida
      - NÃO modifique ou altere as URLs fornecidas
      - As URLs já estão hospedadas e prontas para uso direto
      
      FORMATO DE RESPOSTA:
      - Retorne APENAS HTML válido e completo
      - NÃO inclua <html>, <head>, <body>
      - NÃO adicione comentários ou texto explicativo
      - NÃO termine com texto solto ou instruções
      - Termine com uma tag de fechamento válida (</div>, </section>, etc)
      - HTML deve estar pronto para uso direto
      
      EXEMPLO DE ESTRUTURA:
      <div class="min-h-screen bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500">
        <div class="container mx-auto px-4 py-8">
          <header class="text-center mb-12">
            <h1 class="text-5xl font-bold text-white mb-4">Título Principal</h1>
            <p class="text-xl text-white/90">Subtítulo descritivo</p>
          </header>
          <!-- Conteúdo principal -->
        </div>
      </div>
    `;

    const userPrompt = `
      CRIE UMA PÁGINA WEB COMPLETA E PROFISSIONAL:
      
      Título: ${request.title}
      Descrição: ${request.prompt}
      
      INSTRUÇÕES ESPECÍFICAS:
      - Crie uma página visualmente atraente e moderna
      - Use gradientes, sombras e efeitos visuais
      - Inclua botões de ação relevantes
      - Torne a página responsiva para mobile
      - Use cores que combinem com o tema
      - Adicione elementos interativos (hover effects)
      - Inclua seções bem definidas
      
      IMPORTANTE: Retorne APENAS o código HTML completo e válido, sem texto adicional.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      max_completion_tokens: 16000, // gpt-5 suporta até 16384 tokens
      temperature: 1, // GPT-5 só aceita temperatura padrão (1)
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
    });

    const htmlContent = completion.choices[0]?.message?.content || "";
    const cleanedHTML = cleanGeneratedHTML(htmlContent);

    // Generate meta information with OpenAI
    const metaCompletion = await openai.chat.completions.create({
      model: "gpt-5",
      max_completion_tokens: 500,
      temperature: 1, // GPT-5 só aceita temperatura padrão (1)
      messages: [
        {
          role: "system",
          content: "Você é um especialista em SEO. Gere meta tags otimizadas para a página baseada no conteúdo fornecido. Retorne apenas um JSON válido com metaTitle, metaDescription, ogTitle e ogDescription."
        },
        {
          role: "user",
          content: `Título: ${request.title}\nPrompt: ${request.prompt}\nCrie meta tags SEO-friendly para esta página. Responda APENAS com JSON válido.`
        }
      ],
    });

    let metaData: any = {};
    try {
      const metaText = metaCompletion.choices[0]?.message?.content || "";
      const cleanedMetaText = metaText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .replace(/^\s*[\r\n]/gm, '')
        .trim();
      
      metaData = JSON.parse(cleanedMetaText);
    } catch (e) {
      metaData = {};
    }

    return {
      htmlContent: cleanedHTML,
      metaTitle: metaData?.metaTitle || request.title,
      metaDescription: metaData?.metaDescription || `Página criada com IA: ${request.title}`,
      ogTitle: metaData?.ogTitle || request.title,
      ogDescription: metaData?.ogDescription || `Página criada com IA: ${request.title}`,
    };
  } catch (error) {
    console.error("Error creating page with OpenAI:", error);
    throw new Error("Falha ao criar página com OpenAI");
  }
}
