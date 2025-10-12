import { Router, Request, Response } from 'express';
import { register } from '../services/metricsService';
import { cacheService } from '../services/cacheService';
import { prisma } from '../config/database';

const router = Router();

// GET - Prometheus metrics endpoint
router.get('/', async (req: Request, res: Response) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).json({ error: 'Erro ao gerar métricas' });
  }
});

// GET - Cache statistics
router.get('/cache', async (req: Request, res: Response) => {
  try {
    const stats = await cacheService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas do cache' });
  }
});

// GET - Database statistics
router.get('/database', async (req: Request, res: Response) => {
  try {
    const totalPages = await prisma.aiPage.count();
    const totalViews = await prisma.aiPage.aggregate({
      _sum: {
        views: true,
      },
    });
    const totalUsers = await prisma.user.count();

    const recentPages = await prisma.aiPage.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        slug: true,
        title: true,
        views: true,
        createdAt: true,
      },
    });

    res.json({
      totalPages,
      totalViews: totalViews._sum.views || 0,
      totalUsers,
      recentPages,
    });
  } catch (error) {
    console.error('Error getting database stats:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas do banco' });
  }
});

// POST - Clear cache
router.post('/cache/clear', async (req: Request, res: Response) => {
  try {
    const { pattern } = req.body;
    
    if (pattern) {
      const deleted = await cacheService.delPattern(pattern);
      res.json({ 
        message: 'Cache limpo com sucesso',
        deletedKeys: deleted 
      });
    } else {
      await cacheService.flushAll();
      res.json({ message: 'Todo o cache foi limpo' });
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Erro ao limpar cache' });
  }
});

export default router;







