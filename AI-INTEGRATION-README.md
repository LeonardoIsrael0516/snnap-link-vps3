# 🤖 Sistema de Integração de APIs de IA

Este documento explica como funciona o sistema inteligente de integração entre Claude (Anthropic) e OpenAI no microserviço Link-AI.

## 🎯 Funcionalidades

### 1. **Fallback Automático**
- Se Claude estiver desativada ou falhar → OpenAI entra em ação automaticamente
- Se OpenAI estiver desativada ou falhar → Claude é usada
- Se ambas estiverem ativas → Modo colaborativo (Claude primeiro, OpenAI como fallback)

### 2. **Modo Colaborativo**
- **Claude** é priorizada para geração de código (melhor qualidade)
- **OpenAI** serve como fallback confiável
- **Cache Redis** para otimizar performance

### 3. **Gerenciamento Inteligente**
- Detecção automática de APIs disponíveis
- Inicialização lazy (só quando necessário)
- Tratamento robusto de erros

## 🔧 Configuração

### Variáveis de Ambiente
```bash
# Claude (Anthropic) - PRINCIPAL
ANTHROPIC_API_KEY="sk-ant-api03-..."

# OpenAI - FALLBACK
OPENAI_API_KEY="sk-..."

# Banco principal (onde admin configura)
MAIN_DATABASE_URL="postgresql://user:pass@localhost:5432/meulink"
```

### Configuração via Painel Admin
As chaves também podem ser configuradas via painel administrativo:
- Acesse `/admin`
- Configure as chaves de API
- Sistema detecta automaticamente

## 🚀 Como Funciona

### 1. **Inicialização**
```typescript
const aiManager = new AIServiceManager();
await aiManager.initialize();
```

### 2. **Criação de Páginas**
```typescript
// Sistema escolhe automaticamente a melhor API
const result = await generatePageWithAI({
  title: "Minha Página",
  prompt: "Crie uma landing page moderna",
  slug: "minha-pagina"
});
```

### 3. **Edição de Páginas**
```typescript
// Edição cirúrgica com Claude, fallback para OpenAI
const result = await generatePageWithAI({
  title: "Página Existente",
  existingContent: "<div>...</div>",
  editInstructions: "Mude a cor do botão para azul",
  isEdit: true
});
```

## 📊 Status das APIs

### Verificação de Status
```typescript
// Verificar APIs disponíveis
aiManager.isClaudeAvailable()  // true/false
aiManager.isOpenAIAvailable()  // true/false
aiManager.isAnyAvailable()     // true/false

// Obter melhor API
aiManager.getBestAPI()  // 'claude' | 'openai' | 'both'
```

### Logs de Debug
O sistema gera logs detalhados:
```
🚀 Inicializando gerenciador de APIs...
✅ Claude disponível
✅ OpenAI disponível
🎯 Status das APIs: Claude=✅, OpenAI=✅
🤝 Modo colaborativo: tentando Claude primeiro...
```

## 🧪 Testes

### Teste de Configuração
```bash
cd microservices/link-ai
node test-api-config.js
```

### Teste de Integração
```bash
cd microservices/link-ai
npm run build
node test-ai-integration.js
```

## 🔄 Fluxo de Decisão

```mermaid
graph TD
    A[generatePageWithAI] --> B[Inicializar AI Manager]
    B --> C{Claude Disponível?}
    C -->|Sim| D{OpenAI Disponível?}
    C -->|Não| E{OpenAI Disponível?}
    D -->|Sim| F[Modo Colaborativo]
    D -->|Não| G[Usar Apenas Claude]
    E -->|Sim| H[Usar Apenas OpenAI]
    E -->|Não| I[❌ Erro: Nenhuma API]
    F --> J[Tentar Claude Primeiro]
    J --> K{Claude Sucesso?}
    K -->|Sim| L[✅ Retornar Resultado]
    K -->|Não| M[Tentar OpenAI]
    M --> N{OpenAI Sucesso?}
    N -->|Sim| L
    N -->|Não| O[❌ Erro: Ambas Falharam]
```

## 🛡️ Tratamento de Erros

### Erros Comuns
1. **Nenhuma API configurada**: Configure pelo menos uma API
2. **Chave inválida**: Verifique as chaves no painel admin
3. **Rate limit**: Sistema aguarda e tenta novamente
4. **Timeout**: Fallback automático para outra API

### Logs de Erro
```
❌ ERRO: Nenhuma API key encontrada!
   Settings do banco: {}
   ENV ANTHROPIC_API_KEY: Não definida
⚠️ Claude falhou, tentando OpenAI...
```

## 📈 Performance

### Cache Redis
- Configurações de API: 5 minutos
- Resultados de geração: 10 minutos
- Meta tags: 1 hora

### Otimizações
- Inicialização lazy
- Conexões reutilizadas
- Fallback rápido
- Logs estruturados

## 🔧 Manutenção

### Adicionar Nova API
1. Implementar cliente na classe `AIServiceManager`
2. Adicionar método `useNovaAPI()`
3. Atualizar `useBestAPI()`
4. Adicionar testes

### Debug
```bash
# Ver logs detalhados
DEBUG=ai:* npm run dev

# Verificar configurações
node test-api-config.js
```

## 📝 Exemplos de Uso

### Criação Simples
```typescript
const page = await generatePageWithAI({
  title: "Landing Page",
  prompt: "Crie uma landing page para SaaS",
  slug: "landing-saas"
});
```

### Edição Avançada
```typescript
const edited = await generatePageWithAI({
  title: "Página Existente",
  existingContent: htmlAtual,
  editInstructions: "Adicione um botão de CTA no final",
  isEdit: true
});
```

### Verificação de Status
```typescript
if (aiManager.isClaudeAvailable()) {
  console.log("Claude está funcionando!");
}
```

---

## 🎉 Conclusão

O sistema de integração de APIs oferece:
- ✅ **Confiabilidade**: Sempre funciona se pelo menos uma API estiver configurada
- ✅ **Performance**: Claude para qualidade, OpenAI para confiabilidade
- ✅ **Flexibilidade**: Configuração via admin ou ENV
- ✅ **Observabilidade**: Logs detalhados para debug
- ✅ **Manutenibilidade**: Código limpo e bem estruturado

**Resultado**: Sistema robusto que nunca falha por falta de API! 🚀


