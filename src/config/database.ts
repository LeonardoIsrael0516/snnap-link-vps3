import { PrismaClient } from '@prisma/client';

// Solução ULTRA RADICAL: usar connection pooling e desabilitar prepared statements
declare global {
  var __prisma: PrismaClient | undefined;
}

// Banco de dados do microserviço
const DATABASE_URL = "postgresql://postgres:Da05As02He02$@db.awetbsslwdbltvhahozo.supabase.co:5432/postgres";

console.log('🗄️  Conectando no banco de dados:', DATABASE_URL.split('@')[1]?.split('?')[0]);

// Criar uma única instância global do Prisma Client (sem configuração de log para evitar problemas de tipos)
const prisma = global.__prisma || new PrismaClient();

// Em desenvolvimento, salvar na global para evitar múltiplas instâncias
if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
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
