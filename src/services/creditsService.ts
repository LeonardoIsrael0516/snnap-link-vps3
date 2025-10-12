import { PrismaClient } from '@prisma/client';

// Usar o banco principal onde estão os planos e créditos
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.MAIN_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/meulink"
    }
  }
});

export interface CreditCost {
  PAGE_CREATION_SMALL: number;
  PAGE_CREATION_LARGE: number;
  PAGE_EDIT: number;
  TEMPLATE_IMPORT: number;
}

export const CREDIT_COSTS: CreditCost = {
  PAGE_CREATION_SMALL: 2,   // Criação de página nova (sempre 2 créditos)
  PAGE_CREATION_LARGE: 2,   // Criação de página nova (sempre 2 créditos)
  PAGE_EDIT: 1.4,           // Edições de página (1.4 créditos)
  TEMPLATE_IMPORT: 1        // Importação de templates (1 crédito)
};

/**
 * Verifica se o usuário tem créditos suficientes
 */
export async function hasCredits(userId: string, requiredCredits: number): Promise<boolean> {
  try {
    console.log(`🔍 hasCredits - Verificando créditos para usuário ${userId}, necessário: ${requiredCredits}`);
    
    const userPlan = await (prisma as any).userPlan.findUnique({
      where: { userId }
    });

    if (!userPlan) {
      console.log(`❌ hasCredits - Usuário ${userId} não possui plano`);
      return false;
    }

    if (userPlan.status !== 'ACTIVE') {
      console.log(`❌ hasCredits - Plano do usuário ${userId} não está ativo (status: ${userPlan.status})`);
      return false;
    }

    const hasEnough = userPlan.creditsAvailable >= requiredCredits;
    console.log(`✅ hasCredits - Usuário ${userId}: ${userPlan.creditsAvailable} créditos disponíveis, necessário: ${requiredCredits}, resultado: ${hasEnough}`);
    
    return hasEnough;
  } catch (error) {
    console.error('❌ hasCredits - Erro ao verificar créditos:', error);
    return false;
  }
}

/**
 * Consome créditos do usuário
 */
export async function consumeCredits(
  userId: string,
  amount: number,
  type: 'PAGE_CREATION' | 'PAGE_EDIT' | 'TEMPLATE_IMPORT',
  description: string,
  reference?: string
): Promise<{ success: boolean; message: string; newBalance?: number }> {
  try {
    console.log(`💰 consumeCredits - Consumindo ${amount} créditos para usuário ${userId}, tipo: ${type}`);
    
    const userPlan = await (prisma as any).userPlan.findUnique({
      where: { userId }
    });

    if (!userPlan) {
      console.log(`❌ consumeCredits - Usuário ${userId} não possui plano`);
      return { success: false, message: 'Usuário não possui plano ativo' };
    }

    if (userPlan.status !== 'ACTIVE') {
      console.log(`❌ consumeCredits - Plano do usuário ${userId} não está ativo (status: ${userPlan.status})`);
      return { success: false, message: 'Plano não está ativo' };
    }

    if (userPlan.creditsAvailable < amount) {
      console.log(`❌ consumeCredits - Usuário ${userId} não tem créditos suficientes (${userPlan.creditsAvailable} < ${amount})`);
      return { success: false, message: 'Créditos insuficientes' };
    }

    console.log(`🔄 consumeCredits - Atualizando créditos do usuário ${userId}...`);
    
    // Atualizar créditos do usuário
    const updatedUserPlan = await (prisma as any).userPlan.update({
      where: { userId },
      data: {
        creditsAvailable: userPlan.creditsAvailable - amount,
        creditsUsed: userPlan.creditsUsed + amount
      }
    });

    console.log(`✅ consumeCredits - Créditos atualizados: ${updatedUserPlan.creditsAvailable} disponíveis`);

    // Registrar transação
    await (prisma as any).creditTransaction.create({
      data: {
        userId,
        type,
        amount: -amount,
        balance: updatedUserPlan.creditsAvailable,
        description,
        reference
      }
    });

    console.log(`✅ consumeCredits - Transação registrada para usuário ${userId}`);

    return {
      success: true,
      message: 'Créditos consumidos com sucesso',
      newBalance: updatedUserPlan.creditsAvailable
    };
  } catch (error) {
    console.error('Erro ao consumir créditos:', error);
    return { success: false, message: 'Erro ao processar créditos' };
  }
}

/**
 * Calcula custo de créditos para criação de página (sempre 2 créditos)
 */
export function calculatePageCreationCost(htmlContent: string): number {
  // Criação de página sempre custa 2 créditos
  return CREDIT_COSTS.PAGE_CREATION_SMALL;
}

/**
 * Calcula custo de créditos para edição de página (sempre 1.4 créditos)
 */
export function calculatePageEditCost(htmlContent: string): number {
  // Edição de página sempre custa 1.4 créditos
  return CREDIT_COSTS.PAGE_EDIT;
}

/**
 * Verifica permissões do plano do usuário
 */
export async function checkPlanPermission(userId: string) {
  try {
    const userPlan = await (prisma as any).userPlan.findUnique({
      where: { userId },
      include: {
        plan: true
      }
    });

    if (!userPlan) {
      return {
        hasActivePlan: false,
        canCreatePages: false,
        customDomainsLimit: 0,
        customDomainsUsed: 0,
        canCreateMoreDomains: false,
        pwaEnabled: false
      };
    }

    // Contar domínios personalizados do usuário
    const customDomainsUsed = await prisma.customDomain.count({
      where: { userId }
    });

    const customDomainsLimit = userPlan.plan.customDomainsLimit;
    const canCreateMoreDomains = customDomainsLimit === -1 || customDomainsUsed < customDomainsLimit;

    return {
      hasActivePlan: userPlan.status === 'ACTIVE',
      canCreatePages: userPlan.creditsAvailable > 0,
      customDomainsLimit,
      customDomainsUsed,
      canCreateMoreDomains,
      pwaEnabled: userPlan.plan.pwaEnabled,
      creditsAvailable: userPlan.creditsAvailable
    };
  } catch (error) {
    console.error('Erro ao verificar permissões:', error);
    return {
      hasActivePlan: false,
      canCreatePages: false,
      customDomainsLimit: 0,
      customDomainsUsed: 0,
      canCreateMoreDomains: false,
      pwaEnabled: false
    };
  }
}
