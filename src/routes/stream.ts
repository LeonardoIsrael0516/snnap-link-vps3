import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { generatePageWithAI } from '../services/aiService';
import { verifyJWT } from '../middleware/auth';
import { ensureUserExists } from '../middleware/syncUser';
import { generateSlug } from '../utils/slug';
import { hasCredits, consumeCredits, calculatePageCreationCost, calculatePageEditCost, checkUserCreditStatus } from '../services/creditsService';
import { creditSignupReward } from '../utils/referralRewards';

const router = Router();

// Função para sincronizar página com o backend principal
async function syncPageToMainBackend(page: any, userId: string): Promise<void> {
  try {
    const backendUrl = process.env.BACKEND_URL || 'https://snnap-backend.onrender.com';
    const syncUrl = `${backendUrl}/api/ai-pages/sync`;
    
    console.log(`🔄 Enviando página ${page.id} para sincronização no backend: ${syncUrl}`);
    
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERNAL_API_KEY || 'internal-sync-key'}`
      },
      body: JSON.stringify({
        id: page.id,
        title: page.title,
        slug: page.slug,
        htmlContent: page.htmlContent,
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
        ogTitle: page.ogTitle,
        ogDescription: page.ogDescription,
        ogImage: page.ogImage,
        faviconUrl: page.faviconUrl,
        customCss: page.customCss,
        thumbnailUrl: page.thumbnailUrl,
        userId: userId,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend sync failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ Página ${page.id} sincronizada com sucesso:`, result);
  } catch (error) {
    console.error(`❌ Erro na sincronização da página ${page.id}:`, error);
    throw error;
  }
}

const streamCreatePageSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  prompt: z.string().min(1, "Prompt é obrigatório"),
  messages: z.array(z.any()).optional(),
  id: z.string().optional(), // For edit requests
});

// POST - Create page with real streaming
router.post('/', verifyJWT, ensureUserExists, async (req: Request, res: Response) => {
  console.log('🚀 Stream endpoint called');
  
  try {
    const userId = (req as any).user.userId;
    console.log('👤 User ID:', userId);
    
    // Verificar se o usuário existe no banco local antes de prosseguir
    const userExists = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!userExists) {
      console.error(`❌ Usuário ${userId} não existe no banco local após middleware!`);
      return res.status(500).json({ 
        error: 'Erro de sincronização de usuário. Tente novamente.' 
      });
    }
    
    console.log(`✅ Usuário ${userId} confirmado no banco local`);
    
    const body = streamCreatePageSchema.parse(req.body);
    const { title, prompt, slug: customSlug, messages, id: pageIdFromRequest } = body;
    
    console.log('📝 Request:', { title, promptLength: prompt?.length, customSlug, hasMessages: !!messages });

    // Check if this is an edit request
    const hasEditSystemMessage = messages && messages.some((msg: any) => 
      msg.role === 'system' && 
      msg.content && 
      msg.content.includes('🔧 MODO EDIÇÃO PONTUAL 🔧')
    );
    
    const hasHtmlInMessage = messages && messages.some((msg: any) => 
      msg.role === 'user' && 
      msg.content && 
      msg.content.includes('HTML ATUAL DA PÁGINA')
    );
    
    const isEditRequest = hasEditSystemMessage && (pageIdFromRequest || hasHtmlInMessage);
    
    console.log('🔍 Edit detection:', {
      hasEditSystemMessage,
      hasHtmlInMessage,
      pageIdFromRequest,
      isEditRequest,
      messagesCount: messages?.length || 0
    });

    // Verificar créditos para criação e edição de páginas
    const requiredCredits = isEditRequest ? 1.4 : 2; // Custo específico para cada ação
    console.log(`🔍 Verificando créditos para ${isEditRequest ? 'edição' : 'criação'} de página com IA - usuário: ${userId}`);
    
    const creditStatus = await checkUserCreditStatus(userId, requiredCredits);
    
    console.log(`💰 Status detalhado do usuário:`, creditStatus);
    
    if (!creditStatus.hasCredits) {
      console.log(`❌ Usuário ${userId} não tem créditos suficientes para ${isEditRequest ? 'editar' : 'criar'} página`);
      const errorData = {
        type: 'error',
        error: `INSUFFICIENT_CREDITS:${requiredCredits}:${isEditRequest ? 'edição' : 'criação'}:${creditStatus.status}:${creditStatus.hasActivePlan}:${creditStatus.isFreePlan}:${creditStatus.planName}:${creditStatus.availableCredits}`,
        code: 'INSUFFICIENT_CREDITS',
        requiredCredits,
        action: isEditRequest ? 'edição' : 'criação',
        status: creditStatus.status,
        hasActivePlan: creditStatus.hasActivePlan,
        isFreePlan: creditStatus.isFreePlan,
        planName: creditStatus.planName,
        availableCredits: creditStatus.availableCredits
      };
      console.log('📤 Enviando erro de créditos insuficientes:', JSON.stringify(errorData));
      res.write(`data: ${JSON.stringify(errorData)}\n\n`);
      res.end();
      return;
    }
    
    console.log(`✅ Usuário ${userId} tem créditos suficientes para ${isEditRequest ? 'editar' : 'criar'} página`);

    let finalSlug = customSlug || generateSlug(title || prompt.slice(0, 50));
    let pageId: string | null = null;

    if (isEditRequest && pageIdFromRequest) {
      // Edit existing page
      const existingPage = await prisma.aiPage.findFirst({
        where: {
          id: pageIdFromRequest,
          userId
        }
      });

      if (!existingPage) {
        return res.status(404).json({ error: "Página não encontrada" });
      }

      pageId = pageIdFromRequest;
      finalSlug = existingPage.slug;
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Send initial message
    res.write(`data: ${JSON.stringify({
      type: 'start',
      message: isEditRequest ? 'Iniciando edição da página...' : 'Iniciando criação da página...'
    })}\n\n`);

    let htmlContent = '';
    let currentTitle = title || (prompt.slice(0, 50) + (prompt.length > 50 ? '...' : ''));
    let currentSlug = finalSlug;

    try {
      // Extract the actual prompt from messages if available
      let actualPrompt = prompt;
      if (messages && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
          actualPrompt = lastMessage.content;
        }
      }

      console.log('🤖 Gerando conteúdo com IA...');
      let generatedContent: any;

      if (isEditRequest && pageId) {
        // Edit existing page
        console.log('✏️  Modo: Edição de página existente');
        const existingPage = await prisma.aiPage.findUnique({
          where: { id: pageId }
        });

        if (existingPage) {
          generatedContent = await generatePageWithAI({
            title: currentTitle,
            prompt: actualPrompt,
            slug: currentSlug,
            isEdit: true,
            existingContent: existingPage.htmlContent,
            editInstructions: actualPrompt
          });
        } else {
          throw new Error('Página não encontrada para edição');
        }
      } else {
        // Create new page
        console.log('✨ Modo: Criação de nova página');
        generatedContent = await generatePageWithAI({
          title: currentTitle,
          prompt: actualPrompt,
          slug: currentSlug
        });
      }
      
      console.log('✅ Conteúdo gerado, iniciando streaming...');

      // Stream the HTML content in chunks
      const html = generatedContent.htmlContent;
      const chunkSize = 100; // Characters per chunk
      
      for (let i = 0; i < html.length; i += chunkSize) {
        const chunk = html.slice(i, i + chunkSize);
        htmlContent += chunk;
        
        res.write(`data: ${JSON.stringify({
          type: 'content',
          content: chunk
        })}\n\n`);
        
        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Save or update the page
      let savedPage;
      
      if (isEditRequest && pageId) {
        // Update existing page
        savedPage = await prisma.aiPage.update({
          where: { id: pageId },
          data: {
            title: currentTitle,
            htmlContent: htmlContent,
            metaTitle: generatedContent.metaTitle,
            metaDescription: generatedContent.metaDescription,
            ogTitle: generatedContent.ogTitle,
            ogDescription: generatedContent.ogDescription,
          }
        });
      } else {
        // Create new page
        savedPage = await prisma.aiPage.create({
          data: {
            title: currentTitle,
            slug: currentSlug,
            htmlContent: htmlContent,
            metaTitle: generatedContent.metaTitle,
            metaDescription: generatedContent.metaDescription,
            ogTitle: generatedContent.ogTitle,
            ogDescription: generatedContent.ogDescription,
            userId,
          }
        });
      }

      // Consumir créditos após criação/edição bem-sucedida
      console.log(`💰 Consumindo créditos após ${isEditRequest ? 'edição' : 'criação'} bem-sucedida da página ${savedPage.id}`);
      console.log(`🔍 Debug - isEditRequest: ${isEditRequest}`);
      const cost = isEditRequest ? calculatePageEditCost(htmlContent) : calculatePageCreationCost(htmlContent);
      console.log(`💰 Custo calculado: ${cost} créditos (${isEditRequest ? 'edição' : 'criação'})`);
      
      const creditResult = await consumeCredits(
        userId,
        cost,
        isEditRequest ? 'PAGE_EDIT' : 'PAGE_CREATION',
        `${isEditRequest ? 'Edição' : 'Criação'} da página: ${currentTitle}`,
        savedPage.id
      );

      if (!creditResult.success) {
        console.error('❌ Erro ao consumir créditos:', creditResult.message);
        // Não falhar a criação/edição, apenas logar o erro
      } else {
        console.log(`✅ Créditos consumidos: ${cost} créditos para ${isEditRequest ? 'edição' : 'criação'} da página ${savedPage.id}`);
        console.log(`✅ Novo saldo: ${creditResult.newBalance} créditos`);
        
        // Se for criação de página (não edição), verificar se é primeira página para creditar recompensa de indicação
        if (!isEditRequest) {
          try {
            const pagesCount = await prisma.aiPage.count({
              where: { userId }
            });
            
            if (pagesCount === 1) {
              console.log(`🎁 Primeira página criada pelo usuário ${userId}, processando recompensa de indicação...`);
              await creditSignupReward(userId);
            }
          } catch (error) {
            console.error(`❌ Erro ao processar recompensa de indicação:`, error);
            // Não falhar a criação da página por causa disso
          }
        }
      }

      // Sincronizar página com o backend principal (apenas para criação, não edição)
      if (!isEditRequest) {
        try {
          console.log(`🔄 Sincronizando página ${savedPage.id} com o backend principal...`);
          await syncPageToMainBackend(savedPage, userId);
          console.log(`✅ Página ${savedPage.id} sincronizada com sucesso!`);
        } catch (syncError) {
          console.error(`❌ Erro ao sincronizar página ${savedPage.id}:`, syncError);
          // Não falhar a criação da página por causa da sincronização
        }
      }

      // Send completion message
      res.write(`data: ${JSON.stringify({
        type: 'done',
        page: {
          id: savedPage.id,
          title: savedPage.title,
          slug: savedPage.slug,
          html_content: savedPage.htmlContent,
          created_at: savedPage.createdAt,
          updated_at: savedPage.updatedAt,
        }
      })}\n\n`);

    } catch (error) {
      console.error('❌ Error during streaming:', error);
      console.error('Error details:', error instanceof Error ? error.message : error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      
      try {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Erro desconhecido'
        })}\n\n`);
      } catch (writeError) {
        console.error('❌ Erro ao enviar mensagem de erro:', writeError);
      }
    }

    try {
      res.end();
    } catch (endError) {
      console.error('❌ Erro ao finalizar resposta:', endError);
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Dados inválidos",
        details: error.errors
      });
    }

    console.error("Error in stream endpoint:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

export default router;
