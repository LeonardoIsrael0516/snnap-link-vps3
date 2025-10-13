import { PrismaClient } from '@prisma/client';

// Singleton pattern para evitar múltiplas instâncias do Prisma Client
let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

// Banco de dados do microserviço
const DATABASE_URL = "postgresql://postgres:Da05As02He02$@db.awetbsslwdbltvhahozo.supabase.co:5432/postgres";

console.log('🗄️  Conectando no banco de dados:', DATABASE_URL.split('@')[1]?.split('?')[0]);

if (process.env.NODE_ENV === 'production') {
  // Em produção, criar uma única instância
  prisma = new PrismaClient({
    log: ['error'],
    datasources: {
      db: {
        url: DATABASE_URL
      }
    }
  });
} else {
  // Em desenvolvimento, usar global para evitar múltiplas instâncias durante hot reload
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
      datasources: {
        db: {
          url: DATABASE_URL
        }
      }
    });
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
