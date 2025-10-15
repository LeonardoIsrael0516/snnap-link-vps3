import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { PrismaClient } from '@prisma/client';

// Cliente para o banco principal
const mainDbPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.MAIN_DATABASE_URL
    }
  }
});

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

/**
 * Middleware para garantir que o usuário existe no banco do microserviço
 * Se não existir, sincroniza do banco principal automaticamente
 */
export const ensureUserExists = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    console.log('🔄 Middleware ensureUserExists chamado');
    
    if (!req.user?.userId) {
      console.log('⚠️ Nenhum userId encontrado na requisição');
      return next();
    }

    const userId = req.user.userId;
    console.log(`👤 Verificando usuário: ${userId}`);

    // Verificar se usuário existe no banco local (por ID ou email)
    const userExists = await prisma.user.findFirst({
      where: {
        OR: [
          { id: userId },
          { email: req.user.email }
        ]
      }
    });

    console.log(`🔍 Busca no banco local - userId: ${userId}, email: ${req.user.email}`);
    console.log(`🔍 Usuário encontrado:`, userExists ? { id: userExists.id, email: userExists.email } : 'Nenhum');

    if (userExists) {
      // Usuário já existe, continuar
      console.log(`✅ Usuário já existe no banco local: ${userExists.email} (ID: ${userExists.id})`);
      return next();
    }

    // Usuário NÃO existe no banco local, sincronizar do banco principal
    console.log(`🔄 Usuário ${userId} não encontrado no banco local, sincronizando...`);

    try {
      console.log('🔍 Conectando ao banco principal...');
      console.log('🔍 MAIN_DATABASE_URL configurada:', process.env.MAIN_DATABASE_URL ? 'SIM' : 'NÃO');
      
      // Testar conectividade com o banco principal
      try {
        await mainDbPrisma.$connect();
        console.log('✅ Conexão com banco principal estabelecida');
      } catch (connectError) {
        console.error('❌ Erro ao conectar com banco principal:', connectError);
        throw connectError;
      }
      
      // Buscar usuário do banco principal
      const mainUser = await mainDbPrisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        }
      });

      console.log('🔍 Usuário encontrado no banco principal:', mainUser ? { id: mainUser.id, email: mainUser.email } : 'Nenhum');

      if (!mainUser) {
        console.error(`❌ Usuário ${userId} não encontrado nem no banco principal!`);
        return res.status(404).json({ 
          error: 'Usuário não encontrado. Faça login novamente.' 
        });
      }

      // Criar ou atualizar usuário no banco local
      console.log('🔄 Criando/atualizando usuário no banco local...');
      const upsertedUser = await prisma.user.upsert({
        where: { id: mainUser.id },
        update: {
          name: mainUser.name,
          email: mainUser.email,
          emailVerified: mainUser.emailVerified,
          image: mainUser.image,
          role: mainUser.role,
          updatedAt: mainUser.updatedAt,
        },
        create: {
          id: mainUser.id,
          name: mainUser.name,
          email: mainUser.email,
          emailVerified: mainUser.emailVerified,
          image: mainUser.image,
          role: mainUser.role,
          createdAt: mainUser.createdAt,
          updatedAt: mainUser.updatedAt,
        }
      });
      console.log('✅ Usuário criado/atualizado no banco local:', { id: upsertedUser.id, email: upsertedUser.email });

      console.log(`✅ Usuário ${mainUser.email} sincronizado com sucesso!`);
      
      // Verificar se a sincronização foi bem-sucedida
      const verifyUser = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (!verifyUser) {
        console.error(`❌ Falha na verificação pós-sincronização do usuário ${userId}`);
        return res.status(500).json({ 
          error: 'Erro na sincronização de usuário. Tente novamente.' 
        });
      }
      
      console.log(`✅ Usuário ${userId} verificado após sincronização`);
      next();

    } catch (syncError) {
      console.error('❌ Erro ao sincronizar usuário:', syncError);
      console.error('❌ Tipo do erro:', typeof syncError);
      console.error('❌ Mensagem do erro:', syncError instanceof Error ? syncError.message : 'Erro desconhecido');
      console.error('❌ Stack do erro:', syncError instanceof Error ? syncError.stack : 'Sem stack');
      
      // Se for erro de duplicação (já existe), ignorar e continuar
      if (syncError instanceof Error && syncError.message.includes('Unique constraint')) {
        console.log('ℹ️  Usuário já existe (race condition), continuando...');
        return next();
      }
      
      return res.status(500).json({ 
        error: 'Erro de sincronização de usuário. Tente novamente.' 
      });
    }

  } catch (error) {
    console.error('❌ Erro no middleware de sincronização:', error);
    next(); // Continuar mesmo com erro para não quebrar a aplicação
  }
};







