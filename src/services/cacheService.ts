import Redis from 'ioredis';

class CacheService {
  private redis: Redis;
  private isConnected: boolean = false;

  constructor() {
    // Tentar REDIS_URL primeiro, depois variáveis separadas do Upstash
    if (process.env.REDIS_URL) {
      console.log('✅ Redis: Usando REDIS_URL');
      this.redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableAutoPipelining: true,
        enableOfflineQueue: false,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 3) {
            console.error('❌ Redis: Máximo de tentativas de reconexão atingido');
            return null;
          }
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError: (err) => {
          if (err.message.includes('SETINFO')) {
            return false;
          }
          console.error('⚠️  Redis: Erro de conexão, tentando reconectar...', err.message);
          return true;
        },
      });
    } else if (process.env.REDIS_HOST && process.env.REDIS_PORT && process.env.REDIS_PASSWORD) {
      console.log('✅ Redis: Usando variáveis separadas do Upstash');
      this.redis = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        tls: {
          servername: process.env.REDIS_HOST
        },
        maxRetriesPerRequest: 3,
        enableAutoPipelining: true,
        enableOfflineQueue: false,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 3) {
            console.error('❌ Redis: Máximo de tentativas de reconexão atingido');
            return null;
          }
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError: (err) => {
          if (err.message.includes('SETINFO')) {
            return false;
          }
          console.error('⚠️  Redis: Erro de conexão, tentando reconectar...', err.message);
          return true;
        },
      });
    } else {
      console.warn('⚠️  Redis não configurado (REDIS_URL ou REDIS_HOST/PORT/PASSWORD), cache desabilitado');
      this.redis = null as any;
      return;
    }

    this.redis.on('connect', () => {
      console.log('✅ Redis: Conectado com sucesso');
      this.isConnected = true;
    });

    this.redis.on('error', (err) => {
      console.error('❌ Redis: Erro de conexão:', err.message);
      this.isConnected = false;
    });

    this.redis.on('close', () => {
      console.log('⚠️  Redis: Conexão fechada');
      this.isConnected = false;
    });
  }

  /**
   * Verifica se o Redis está conectado
   */
  isReady(): boolean {
    return this.redis && this.isConnected && this.redis.status === 'ready';
  }

  /**
   * Obtém um valor do cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.redis || !this.isReady()) {
      console.warn('⚠️  Redis não disponível, pulando cache');
      return null;
    }

    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('❌ Erro ao buscar do cache:', error);
      return null;
    }
  }

  /**
   * Define um valor no cache com TTL
   */
  async set(key: string, value: any, ttlSeconds: number = 300): Promise<boolean> {
    if (!this.redis || !this.isReady()) {
      console.warn('⚠️  Redis não disponível, pulando cache');
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttlSeconds, serialized);
      return true;
    } catch (error) {
      console.error('❌ Erro ao salvar no cache:', error);
      return false;
    }
  }

  /**
   * Deleta um valor do cache
   */
  async del(key: string): Promise<boolean> {
    if (!this.redis || !this.isReady()) {
      return false;
    }

    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error('❌ Erro ao deletar do cache:', error);
      return false;
    }
  }

  /**
   * Deleta múltiplas chaves por padrão
   */
  async delPattern(pattern: string): Promise<number> {
    if (!this.redis || !this.isReady()) {
      return 0;
    }

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;
      
      await this.redis.del(...keys);
      return keys.length;
    } catch (error) {
      console.error('❌ Erro ao deletar padrão do cache:', error);
      return 0;
    }
  }

  /**
   * Incrementa um contador (para rate limiting)
   */
  async increment(key: string, ttlSeconds: number = 60): Promise<number> {
    if (!this.redis || !this.isReady()) {
      return 0;
    }

    try {
      const value = await this.redis.incr(key);
      if (value === 1) {
        // Primeira vez, define o TTL
        await this.redis.expire(key, ttlSeconds);
      }
      return value;
    } catch (error) {
      console.error('❌ Erro ao incrementar contador:', error);
      return 0;
    }
  }

  /**
   * Obtém TTL de uma chave
   */
  async ttl(key: string): Promise<number> {
    if (!this.redis || !this.isReady()) {
      return -1;
    }

    try {
      return await this.redis.ttl(key);
    } catch (error) {
      console.error('❌ Erro ao obter TTL:', error);
      return -1;
    }
  }

  /**
   * Limpa todo o cache
   */
  async flushAll(): Promise<boolean> {
    if (!this.redis || !this.isReady()) {
      return false;
    }

    try {
      await this.redis.flushall();
      console.log('🗑️  Cache limpo completamente');
      return true;
    } catch (error) {
      console.error('❌ Erro ao limpar cache:', error);
      return false;
    }
  }

  /**
   * Obtém estatísticas do Redis
   */
  async getStats(): Promise<any> {
    if (!this.redis || !this.isReady()) {
      return { connected: false };
    }

    try {
      const info = await this.redis.info('stats');
      const dbSize = await this.redis.dbsize();
      
      return {
        connected: true,
        dbSize,
        info: info.split('\r\n').reduce((acc: any, line) => {
          const [key, value] = line.split(':');
          if (key && value) acc[key] = value;
          return acc;
        }, {}),
      };
    } catch (error) {
      console.error('❌ Erro ao obter stats:', error);
      return { connected: false, error: 'Failed to get stats' };
    }
  }

  /**
   * Fecha a conexão com o Redis
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      console.log('👋 Redis: Conexão fechada');
    }
  }
}

// Exporta instância singleton
export const cacheService = new CacheService();

