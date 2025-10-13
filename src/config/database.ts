import { PrismaClient } from '@prisma/client';

// Singleton pattern mais robusto para evitar múltiplas instâncias
let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

// Banco de dados do microserviço
const DATABASE_URL = "postgresql://postgres:Da05As02He02$@db.awetbsslwdbltvhahozo.supabase.co:5432/postgres";

console.log('🗄️  Conectando no banco de dados:', DATABASE_URL.split('@')[1]?.split('?')[0]);

// Função para criar uma única instância do Prisma Client
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
  });
}

// Implementação do singleton
if (process.env.NODE_ENV === 'production') {
  // Em produção, usar uma variável global mais robusta
  if (!global.__prisma) {
    global.__prisma = createPrismaClient();
  }
  prisma = global.__prisma;
} else {
  // Em desenvolvimento, usar global para evitar múltiplas instâncias durante hot reload
  if (!global.__prisma) {
    global.__prisma = createPrismaClient();
  }
  prisma = global.__prisma;
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

export { prisma };
