const { PrismaClient } = require('@prisma/client');

// Cliente para o banco principal (backend)
const mainDbPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.MAIN_DATABASE_URL
    }
  }
});

// Cliente para o banco local (microserviço)
const localPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function syncAdmin() {
  try {
    console.log('🔄 Iniciando sincronização do admin...');
    
    // Buscar admin no banco principal
    const admin = await mainDbPrisma.user.findFirst({
      where: { role: 'ADMIN' },
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

    if (!admin) {
      console.log('❌ Nenhum admin encontrado no banco principal');
      return;
    }

    console.log('👤 Admin encontrado:', { id: admin.id, email: admin.email });

    // Verificar se já existe no banco local
    const existingAdmin = await localPrisma.user.findUnique({
      where: { id: admin.id }
    });

    if (existingAdmin) {
      console.log('✅ Admin já existe no banco local');
      return;
    }

    // Criar admin no banco local
    const createdAdmin = await localPrisma.user.create({
      data: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        emailVerified: admin.emailVerified,
        image: admin.image,
        role: admin.role,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
      }
    });

    console.log('✅ Admin sincronizado com sucesso:', { id: createdAdmin.id, email: createdAdmin.email });

  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
  } finally {
    await mainDbPrisma.$disconnect();
    await localPrisma.$disconnect();
  }
}

syncAdmin();




