#!/usr/bin/env node

/**
 * Teste de configuração das APIs
 * Verifica se as chaves de API estão configuradas corretamente
 */

const { PrismaClient } = require('@prisma/client');

async function testAPIConfig() {
  console.log('🔧 Testando configuração das APIs...\n');

  // Conectar ao banco principal
  const mainDbPrisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.MAIN_DATABASE_URL || "postgresql://postgres:12345678@localhost:5432/meulink?schema=public"
      }
    }
  });

  try {
    console.log('🔍 Verificando configurações no banco principal...');
    
    const settings = await mainDbPrisma.$queryRaw`
      SELECT key, value FROM system_settings 
      WHERE key IN ('anthropic_api_key', 'openai_api_key', 'gemini_api_key')
    `;

    console.log('📊 Configurações encontradas:');
    settings.forEach(setting => {
      const hasValue = setting.value && setting.value.length > 0;
      console.log(`  ${setting.key}: ${hasValue ? '✅ Configurada' : '❌ Não configurada'}`);
    });

    // Verificar variáveis de ambiente
    console.log('\n🌍 Verificando variáveis de ambiente:');
    console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ Definida' : '❌ Não definida'}`);
    console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Definida' : '❌ Não definida'}`);

    // Verificar se pelo menos uma API está configurada
    const hasAnthropic = settings.some(s => s.key === 'anthropic_api_key' && s.value) || process.env.ANTHROPIC_API_KEY;
    const hasOpenAI = settings.some(s => s.key === 'openai_api_key' && s.value) || process.env.OPENAI_API_KEY;

    console.log('\n🎯 Status das APIs:');
    console.log(`  Claude (Anthropic): ${hasAnthropic ? '✅ Disponível' : '❌ Indisponível'}`);
    console.log(`  OpenAI: ${hasOpenAI ? '✅ Disponível' : '❌ Indisponível'}`);

    if (!hasAnthropic && !hasOpenAI) {
      console.log('\n⚠️ ATENÇÃO: Nenhuma API está configurada!');
      console.log('   Configure pelo menos uma API no painel administrativo ou nas variáveis de ambiente.');
    } else {
      console.log('\n✅ Pelo menos uma API está configurada e pronta para uso!');
    }

  } catch (error) {
    console.error('❌ Erro ao verificar configurações:', error.message);
  } finally {
    await mainDbPrisma.$disconnect();
  }
}

// Executar teste se chamado diretamente
if (require.main === module) {
  testAPIConfig()
    .then(() => {
      console.log('\n🏁 Verificação concluída');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Verificação falhou:', error);
      process.exit(1);
    });
}

module.exports = { testAPIConfig };


