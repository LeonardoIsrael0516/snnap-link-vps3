import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Banco de dados do microserviço
const DATABASE_URL = "postgresql://postgres:Da05As02He02$@db.awetbsslwdbltvhahozo.supabase.co:5432/postgres";

console.log('🗄️  Conectando no banco de dados:', DATABASE_URL.split('@')[1]?.split('?')[0]);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL
    }
  }
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
