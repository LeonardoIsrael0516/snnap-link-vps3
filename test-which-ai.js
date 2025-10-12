#!/usr/bin/env node

/**
 * Script para testar qual IA está sendo usada
 * Executa uma operação simples e mostra qual API foi utilizada
 */

const { PrismaClient } = require('@prisma/client');

async function testWhichAI() {
  console.log('🔍 Testando qual IA está sendo usada...\n');

  // Conectar ao banco principal para verificar configurações
  const mainDbPrisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.MAIN_DATABASE_URL || "postgresql://postgres:12345678@localhost:5432/meulink?schema=public"
      }
    }
  });

  try {
    console.log('📊 Verificando configurações das APIs...');
    
    const settings = await mainDbPrisma.$queryRaw`
      SELECT key, value FROM system_settings 
      WHERE key IN ('anthropic_api_key', 'openai_api_key', 'gemini_api_key')
    `;

    const settingsMap = {};
    settings.forEach(setting => {
      settingsMap[setting.key] = setting.value;
    });

    console.log('🔑 Configurações encontradas:');
    console.log(`  anthropic_api_key: ${settingsMap.anthropic_api_key ? '✅ Configurada' : '❌ Não configurada'}`);
    console.log(`  openai_api_key: ${settingsMap.openai_api_key ? '✅ Configurada' : '❌ Não configurada'}`);
    console.log(`  gemini_api_key: ${settingsMap.gemini_api_key ? '✅ Configurada' : '❌ Não configurada'}`);

    // Verificar variáveis de ambiente
    console.log('\n🌍 Variáveis de ambiente:');
    console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ Definida' : '❌ Não definida'}`);
    console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Definida' : '❌ Não definida'}`);

    // Determinar qual API será usada
    const hasAnthropic = settingsMap.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
    const hasOpenAI = settingsMap.openai_api_key || process.env.OPENAI_API_KEY;

    console.log('\n🎯 Previsão de qual API será usada:');
    if (hasAnthropic && hasOpenAI) {
      console.log('  🤝 Modo colaborativo: Claude primeiro, OpenAI como fallback');
    } else if (hasAnthropic) {
      console.log('  🎯 Apenas Claude será usada');
    } else if (hasOpenAI) {
      console.log('  🎯 Apenas OpenAI será usada');
    } else {
      console.log('  ❌ Nenhuma API configurada - operação falhará');
    }

    // Testar uma operação real se possível
    console.log('\n🧪 Testando operação real...');
    try {
      // Importar o serviço de IA
      const { generatePageWithAI } = require('./dist/services/aiService');
      
      const testRequest = {
        title: 'Teste de API',
        prompt: 'Crie uma página simples com um título',
        slug: 'teste-api-' + Date.now()
      };

      console.log('📝 Executando teste...');
      const result = await generatePageWithAI(testRequest);
      
      console.log('✅ Teste concluído com sucesso!');
      console.log('📄 HTML gerado (primeiros 100 chars):', result.htmlContent.substring(0, 100) + '...');
      
    } catch (error) {
      console.log('❌ Erro no teste:', error.message);
    }

  } catch (error) {
    console.error('❌ Erro ao verificar configurações:', error.message);
  } finally {
    await mainDbPrisma.$disconnect();
  }
}

// Executar teste se chamado diretamente
if (require.main === module) {
  testWhichAI()
    .then(() => {
      console.log('\n🏁 Verificação concluída');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Verificação falhou:', error);
      process.exit(1);
    });
}

module.exports = { testWhichAI };


