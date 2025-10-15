interface ApiKeyInfo {
  id: string;
  keyName: string;
  apiKey: string;
  priority: number;
  lastUsed?: Date;
  usageCount: number;
}

interface ProviderKeys {
  [provider: string]: ApiKeyInfo[];
}

export class ApiKeyService {
  private static instance: ApiKeyService;
  private cache: Map<string, ApiKeyInfo[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
  private readonly BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

  private constructor() {}

  public static getInstance(): ApiKeyService {
    if (!ApiKeyService.instance) {
      ApiKeyService.instance = new ApiKeyService();
    }
    return ApiKeyService.instance;
  }

  /**
   * Obter todas as chaves ativas de um provider, ordenadas por prioridade
   */
  public async getActiveKeys(provider: string): Promise<ApiKeyInfo[]> {
    const cacheKey = `active_${provider}`;
    const now = Date.now();

    // Verificar cache
    if (this.cache.has(cacheKey) && this.cacheExpiry.get(cacheKey)! > now) {
      return this.cache.get(cacheKey)!;
    }

    try {
      const backendUrl = `${this.BACKEND_URL}/api/admin/api-keys/active`;
      console.log(`🔍 Buscando chaves ativas em: ${backendUrl}`);
      
      const response = await fetch(backendUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.INTERNAL_API_KEY || 'internal-sync-key'}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`❌ Erro ao buscar chaves ativas: ${response.status} - ${response.statusText}`);
        const errorText = await response.text();
        console.error(`❌ Resposta de erro: ${errorText}`);
        return [];
      }

      const data = await response.json() as any;
      const providerKeys = data.data[provider] || [];

      // Atualizar cache
      this.cache.set(cacheKey, providerKeys);
      this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);

      return providerKeys;
    } catch (error) {
      console.error(`❌ Erro ao buscar chaves do provider ${provider}:`, error);
      return [];
    }
  }

  /**
   * Obter a próxima chave disponível para um provider (com fallback)
   */
  public async getNextAvailableKey(provider: string): Promise<ApiKeyInfo | null> {
    const keys = await this.getActiveKeys(provider);
    
    if (keys.length === 0) {
      console.log(`⚠️ Nenhuma chave ativa encontrada para ${provider}`);
      return null;
    }

    // Retornar a chave com menor prioridade (mais alta prioridade = menor número)
    const selectedKey = keys[0];
    console.log(`🔑 Usando chave ${selectedKey.keyName} (prioridade ${selectedKey.priority}) para ${provider}`);
    
    return selectedKey;
  }

  /**
   * Marcar uma chave como usada
   */
  public async markKeyAsUsed(keyId: string): Promise<void> {
    try {
      await fetch(`${this.BACKEND_URL}/api/admin/api-keys/active`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.INTERNAL_API_KEY || 'internal-sync-key'}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ keyId })
      });

      // Limpar cache para forçar atualização
      this.clearCache();
    } catch (error) {
      console.error('❌ Erro ao marcar chave como usada:', error);
    }
  }

  /**
   * Obter chaves de todos os providers
   */
  public async getAllActiveKeys(): Promise<ProviderKeys> {
    const providers = ['openai', 'anthropic', 'gemini'];
    const result: ProviderKeys = {};

    for (const provider of providers) {
      result[provider] = await this.getActiveKeys(provider);
    }

    return result;
  }

  /**
   * Verificar se há chaves disponíveis para um provider
   */
  public async hasAvailableKeys(provider: string): Promise<boolean> {
    const keys = await this.getActiveKeys(provider);
    return keys.length > 0;
  }

  /**
   * Obter chave com fallback automático entre providers
   */
  public async getKeyWithFallback(preferredProvider: string): Promise<{ key: ApiKeyInfo; provider: string } | null> {
    // Tentar o provider preferido primeiro
    const preferredKey = await this.getNextAvailableKey(preferredProvider);
    if (preferredKey) {
      return { key: preferredKey, provider: preferredProvider };
    }

    // Se não encontrar, tentar outros providers como fallback
    const fallbackProviders = ['openai', 'anthropic', 'gemini'].filter(p => p !== preferredProvider);
    
    for (const provider of fallbackProviders) {
      const fallbackKey = await this.getNextAvailableKey(provider);
      if (fallbackKey) {
        console.log(`🔄 Fallback: usando ${provider} em vez de ${preferredProvider}`);
        return { key: fallbackKey, provider };
      }
    }

    console.error(`❌ Nenhuma chave disponível para ${preferredProvider} nem para fallback`);
    return null;
  }

  /**
   * Limpar cache
   */
  public clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Obter estatísticas de uso das chaves
   */
  public async getUsageStats(): Promise<Record<string, any>> {
    try {
      const allKeys = await this.getAllActiveKeys();
      const stats: Record<string, any> = {};

      for (const [provider, keys] of Object.entries(allKeys)) {
        stats[provider] = {
          totalKeys: keys.length,
          totalUsage: keys.reduce((sum, key) => sum + key.usageCount, 0),
          lastUsed: keys.length > 0 ? Math.max(...keys.map(k => k.lastUsed ? new Date(k.lastUsed).getTime() : 0)) : null
        };
      }

      return stats;
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error);
      return {};
    }
  }
}

// Exportar instância singleton
export const apiKeyService = ApiKeyService.getInstance();
