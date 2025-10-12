import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';

const router = Router();

// GET - Get page by slug (public access)
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    // Find AI page by slug
    const aiPage = await prisma.aiPage.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        slug: true,
        htmlContent: true,
        metaTitle: true,
        metaDescription: true,
        ogTitle: true,
        ogDescription: true,
        ogImage: true,
        customCss: true,
        views: true,
        createdAt: true,
      }
    });

    if (aiPage) {
      // Increment views for AI page
      await prisma.aiPage.update({
        where: { slug },
        data: { views: { increment: 1 } }
      });

      return res.json({
        type: "ai-page",
        data: aiPage
      });
    }

    // If not found, return 404
    return res.status(404).json({
      error: "Página não encontrada"
    });

  } catch (error) {
    console.error("Error fetching public content:", error);
    return res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

export default router;

