import { Router, Request, Response } from 'express';
import { saveAnalyticsData, getPageStats } from '../lib/analytics-db';
import { verifyJWT } from '../middleware/auth';

const router = Router();

// POST /api/analytics/track - Rastrear visualização de página
router.post('/track', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    
    console.log('[Analytics] Dados recebidos:', JSON.stringify(data, null, 2));
    
    // Validar dados obrigatórios
    if (!data.pageId || !data.pageType) {
      return res.status(400).json({ error: 'pageId e pageType são obrigatórios' });
    }
    
    // Sanitizar valores numéricos para evitar overflow
    if (data.pageLoadTime && data.pageLoadTime > 2147483647) {
      data.pageLoadTime = 2147483647; // Max INT
    }
    if (data.screenWidth && data.screenWidth > 32767) {
      data.screenWidth = 32767; // Max SMALLINT
    }
    if (data.screenHeight && data.screenHeight > 32767) {
      data.screenHeight = 32767;
    }
    if (data.viewportWidth && data.viewportWidth > 32767) {
      data.viewportWidth = 32767;
    }
    if (data.viewportHeight && data.viewportHeight > 32767) {
      data.viewportHeight = 32767;
    }
    if (data.colorDepth && data.colorDepth > 32767) {
      data.colorDepth = 32767;
    }
    
    // Salvar dados de analytics
    await saveAnalyticsData(data);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Analytics Track] Erro:', error);
    res.status(500).json({ error: 'Erro ao salvar analytics' });
  }
});

// GET /api/analytics/stats/:pageId - Obter estatísticas de uma página
router.get('/stats/:pageId', verifyJWT, async (req: Request, res: Response) => {
  try {
    const { pageId } = req.params;
    const { pageType = 'AI_PAGE', dateFrom, dateTo } = req.query;
    
    // Verificar se o usuário tem acesso à página
    // Por enquanto, permitir acesso a todas as páginas
    // TODO: Implementar verificação de propriedade da página
    
    // Obter estatísticas
    const stats = await getPageStats(
      pageId, 
      pageType as 'AI_PAGE' | 'BIOLINK' | 'SHORTLINK',
      dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo ? new Date(dateTo as string) : undefined
    );
    
    res.json({ stats });
  } catch (error: any) {
    console.error('[Analytics Stats] Erro:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
});

export default router;
