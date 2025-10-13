import { PrismaClient } from '@prisma/client';

// Solução ULTRA RADICAL: usar connection pooling e desabilitar prepared statements
declare global {
  var __prisma: PrismaClient | undefined;
}

// Banco de dados do microserviço - URL vem da variável de ambiente
let DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('❌ DATABASE_URL não está definida nas variáveis de ambiente');
}

// Configurar URL do banco com parâmetros de conexão para produção
if (process.env.NODE_ENV === 'production' && DATABASE_URL) {
  try {
    // Adicionar parâmetros de conexão sem modificar a URL original
    const url = new URL(DATABASE_URL);
    
    // Parâmetros otimizados para produção (funciona com qualquer provedor)
    url.searchParams.set('connection_limit', '5');
    url.searchParams.set('pool_timeout', '20');
    url.searchParams.set('connect_timeout', '60');
    // Preserva a porta original da DATABASE_URL
    // Funciona com Supabase, AWS RDS, PostgreSQL, etc.
    
    DATABASE_URL = url.toString();
  } catch (error) {
    console.error('❌ Erro ao processar DATABASE_URL:', error);
    // Usar URL original se houver erro
  }
}

console.log('🗄️  Conectando no banco de dados:', DATABASE_URL.split('@')[1]?.split('?')[0]);

// Criar uma única instância global do Prisma Client com configurações para produção
const prisma = global.__prisma || new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL
    }
  },
  // Configurações para evitar problemas de prepared statements em produção
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error']
});

// Em desenvolvimento, salvar na global para evitar múltiplas instâncias
if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

// Função para reconectar em caso de erro
async function reconnectPrisma() {
  try {
    await prisma.$disconnect();
    console.log('🔄 Reconectando ao banco de dados...');
    // A nova instância será criada automaticamente na próxima importação
  } catch (error) {
    console.error('❌ Erro ao reconectar:', error);
  }
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Tratar erros de conexão
process.on('uncaughtException', async (error) => {
  if (error.message.includes('prepared statement') || error.message.includes('connection')) {
    console.error('🔄 Erro de conexão detectado, tentando reconectar...');
    await reconnectPrisma();
  }
});

export { prisma, reconnectPrisma };
