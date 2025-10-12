import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { prisma } from './config/database';
import { cacheService } from './services/cacheService';
import { metricsMiddleware } from './middleware/metrics';
import { customDomainMiddleware } from './middleware/customDomain';
// Rate limiters removidos - sem limitações

// Import routes
import aiPagesRouter from './routes/aiPages';
import streamRouter from './routes/stream';
import publicRouter from './routes/public';
import ssrRouter from './routes/ssr';
import metricsRouter from './routes/metrics';
import pwaRouter from './routes/pwa';
import analyticsRouter from './routes/analytics';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware - Helmet com configurações para permitir Tailwind CDN e iframes
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:", "http:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "http:"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "https:", "http:", "wss:", "ws:"],
      fontSrc: ["'self'", "data:", "https:", "http:"],
      objectSrc: ["'self'", "data:", "https:", "http:"],
      mediaSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      frameSrc: ["'self'", "https:", "http:", "data:", "blob:"],
      childSrc: ["'self'", "https:", "http:", "data:", "blob:"],
      workerSrc: ["'self'", "blob:"],
      // Permitir que o frontend (localhost:8080) carregue páginas em iframes
      frameAncestors: ["'self'", "http://localhost:8080", "http://localhost:3000"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Remover X-Frame-Options para permitir CSP frame-ancestors
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  next();
});
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8080', 'http://localhost:3000'],
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Custom domain middleware - must be before routes
app.use(customDomainMiddleware);

// Middleware de métricas
app.use(metricsMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'link-ai-microservice',
    timestamp: new Date().toISOString()
  });
});

// API routes SEM rate limiting
app.use('/api/ai-pages/stream', streamRouter);
app.use('/api/ai-pages', aiPagesRouter);
app.use('/api/public', publicRouter);
app.use('/api/analytics', analyticsRouter);

// Rota para limpar cache (útil durante desenvolvimento)
app.post('/api/clear-cache', async (req, res) => {
  try {
    const redis = cacheService['redis'];
    const keys = await redis.keys('ssr:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    res.json({ success: true, message: `Cache limpo: ${keys.length} chaves removidas` });
  } catch (error) {
    console.error('Erro ao limpar cache:', error);
    res.status(500).json({ success: false, error: 'Erro ao limpar cache' });
  }
});

// Métricas (sem rate limit)
app.use('/metrics', metricsRouter);

// PWA routes (manifest, service worker, offline) SEM rate limiting
app.use('/', pwaRouter);

// SSR routes (for public page rendering) SEM rate limiting
app.use('/', ssrRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo deu errado'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    path: req.originalUrl
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await cacheService.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await cacheService.close();
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Link AI Microservice running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API Base: http://localhost:${PORT}/api`);
});

export default app;
