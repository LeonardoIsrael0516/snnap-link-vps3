import { Request, Response, NextFunction } from 'express';

interface CustomDomain {
  domain: string;
  slug?: string | null;
  isRootDomain: boolean;
  pageId: string;
  status: string;
}

interface CustomDomainRequest extends Request {
  customDomain?: CustomDomain;
}

/**
 * Busca domínio personalizado no backend
 */
async function fetchCustomDomain(domain: string): Promise<CustomDomain | null> {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const response = await fetch(`${backendUrl}/api/domains/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domain })
    });

    if (response.ok) {
      const data = await response.json() as any;
      return data.domain || null;
    }
    return null;
  } catch (error) {
    console.error(`🚨 [CustomDomain] Erro ao buscar domínio no backend:`, error);
    return null;
  }
}

/**
 * Middleware para detectar e processar domínios personalizados
 */
export const customDomainMiddleware = async (
  req: CustomDomainRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const host = req.get('host') || req.hostname;
    
    // Ignorar localhost e domínios padrão do sistema
    if (!host || 
        host.includes('localhost') || 
        host.includes('127.0.0.1') || 
        host.includes('vercel.app') ||
        host.includes('herokuapp.com') ||
        host.includes('railway.app')) {
      return next();
    }

    // Remover porta se houver
    const domain = host.split(':')[0];
    
    console.log(`🌐 [CustomDomain] Verificando domínio: ${domain}`);

    // Buscar domínio personalizado no backend
    const customDomainData = await fetchCustomDomain(domain);

    if (customDomainData && customDomainData.domain) {
      console.log(`✅ [CustomDomain] Domínio encontrado:`, customDomainData);

      // Adicionar informações do domínio customizado ao request
      req.customDomain = {
        domain: customDomainData.domain,
        slug: customDomainData.slug,
        isRootDomain: customDomainData.isRootDomain,
        pageId: customDomainData.pageId,
        status: customDomainData.status
      };
    } else {
      console.log(`❌ [CustomDomain] Domínio não encontrado ou inativo: ${domain}`);
    }

    next();
  } catch (error) {
    console.error(`🚨 [CustomDomain] Erro ao processar domínio:`, error);
    next(); // Continuar mesmo com erro
  }
};