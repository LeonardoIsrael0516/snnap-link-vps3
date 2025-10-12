import { prisma } from '../config/database';

export async function creditSignupReward(referredUserId: string) {
  try {
    console.log(`🎁 Verificando recompensa de indicação para usuário: ${referredUserId}`);
    
    // Fazer requisição para o backend para processar a recompensa
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    console.log(`🔗 Fazendo requisição para: ${backendUrl}/api/referrals/credit-signup-reward`);
    
    const response = await fetch(`${backendUrl}/api/referrals/credit-signup-reward`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERNAL_API_KEY || 'internal-key'}`
      },
      body: JSON.stringify({
        referredUserId
      })
    });

    console.log(`📡 Resposta do backend: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Erro na resposta do backend:`, errorText);
      throw new Error(`Backend retornou status ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ Recompensa de indicação processada:`, result);
    
  } catch (error) {
    console.error(`❌ Erro ao processar recompensa de indicação:`, error);
  }
}

