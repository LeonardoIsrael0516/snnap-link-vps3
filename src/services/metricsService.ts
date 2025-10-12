import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Criar registry para métricas
const register = new Registry();

// Métricas de requisições HTTP
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total de requisições HTTP',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Métricas de páginas de IA
export const aiPagesCreated = new Counter({
  name: 'ai_pages_created_total',
  help: 'Total de páginas de IA criadas',
  labelNames: ['user_id'],
  registers: [register],
});

export const aiPagesViews = new Counter({
  name: 'ai_pages_views_total',
  help: 'Total de visualizações de páginas',
  labelNames: ['slug'],
  registers: [register],
});

export const aiGenerationDuration = new Histogram({
  name: 'ai_generation_duration_seconds',
  help: 'Duração da geração de conteúdo com IA',
  labelNames: ['model'],
  buckets: [1, 3, 5, 10, 20, 30, 60],
  registers: [register],
});

// Métricas de cache
export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total de cache hits',
  labelNames: ['type'],
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total de cache misses',
  labelNames: ['type'],
  registers: [register],
});

// Métricas de banco de dados
export const dbQueriesTotal = new Counter({
  name: 'db_queries_total',
  help: 'Total de queries no banco de dados',
  labelNames: ['operation', 'model'],
  registers: [register],
});

export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duração das queries no banco',
  labelNames: ['operation', 'model'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

// Gauge para páginas ativas
export const activePagesGauge = new Gauge({
  name: 'active_pages_total',
  help: 'Número total de páginas ativas',
  registers: [register],
});

// Gauge para usuários ativos
export const activeUsersGauge = new Gauge({
  name: 'active_users_total',
  help: 'Número total de usuários ativos',
  registers: [register],
});

// Exportar registry para endpoint de métricas
export { register };







