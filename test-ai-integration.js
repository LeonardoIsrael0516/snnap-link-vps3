#!/usr/bin/env node

/**
 * Teste de integração das APIs de IA
 * Este script testa o sistema de fallback e colaboração entre Claude e OpenAI
 */

const { generatePageWithAI } = require('./dist/services/aiService');

async function testAIIntegration() {
  console.log('🧪 Iniciando teste de integração das APIs de IA...\n');

  const testRequest = {
    title: 'Página de Teste',
    prompt: 'Crie uma página simples com um botão azul e um título',
    slug: 'teste-ai-integration'
  };

  try {
    console.log('📝 Testando criação de página...');
    console.log('📋 Request:', testRequest);
    
    const result = await generatePageWithAI(testRequest);
    
    console.log('✅ Sucesso!');
    console.log('📄 HTML gerado:', result.htmlContent.substring(0, 200) + '...');
    console.log('🏷️ Meta Title:', result.metaTitle);
    console.log('📝 Meta Description:', result.metaDescription);
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
    console.error('📊 Stack:', error.stack);
  }
}

// Executar teste se chamado diretamente
if (require.main === module) {
  testAIIntegration()
    .then(() => {
      console.log('\n🏁 Teste concluído');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Teste falhou:', error);
      process.exit(1);
    });
}

module.exports = { testAIIntegration };


