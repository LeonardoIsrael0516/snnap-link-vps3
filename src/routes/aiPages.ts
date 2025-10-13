import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { generatePageWithAI } from '../services/aiService';
import { verifyJWT } from '../middleware/auth';
import { ensureUserExists } from '../middleware/syncUser';
import { generateSlug } from '../utils/slug';
import { cacheService } from '../services/cacheService';
import { hasCredits, consumeCredits, calculatePageCreationCost } from '../services/creditsService';

const router = Router();

// Função para sincronizar página com o backend principal
async function syncPageToMainBackend(page: any, userId: string): Promise<void> {
  try {
    const backendUrl = process.env.BACKEND_URL || 'https://snnap-backend.onrender.com';
    const syncUrl = `${backendUrl}/api/ai-pages/sync`;
    
    console.log(`🔄 Enviando página ${page.id} para sincronização no backend: ${syncUrl}`);
    
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERNAL_API_KEY || 'internal-sync-key'}`
      },
      body: JSON.stringify({
        id: page.id,
        title: page.title,
        slug: page.slug,
        htmlContent: page.htmlContent,
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
        ogTitle: page.ogTitle,
        ogDescription: page.ogDescription,
        ogImage: page.ogImage,
        faviconUrl: page.faviconUrl,
        customCss: page.customCss,
        thumbnailUrl: page.thumbnailUrl,
        userId: userId,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend sync failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ Página ${page.id} sincronizada com sucesso:`, result);
  } catch (error) {
    console.error(`❌ Erro na sincronização da página ${page.id}:`, error);
    throw error;
  }
}

const createPageSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  prompt: z.string().optional(), // Opcional para criação direta
  slug: z.string().optional(),
  // Campos para criação direta (importação)
  directCreation: z.boolean().optional(),
  htmlContent: z.string().optional(),
  metaTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
  ogTitle: z.string().nullable().optional(),
  ogDescription: z.string().nullable().optional(),
  ogImage: z.string().nullable().optional(),
  faviconUrl: z.string().nullable().optional(),
  customCss: z.string().nullable().optional(),
  pageTitle: z.string().nullable().optional(),
  pageDescription: z.string().nullable().optional(),
  keywords: z.string().nullable().optional(),
  canonicalUrl: z.string().nullable().optional(),
  robots: z.string().nullable().optional(),
  facebookPixel: z.string().nullable().optional(),
  googleAnalytics: z.string().nullable().optional(),
  googleTagManager: z.string().nullable().optional(),
  tiktokPixel: z.string().nullable().optional(),
  linkedinPixel: z.string().nullable().optional(),
  twitterPixel: z.string().nullable().optional(),
  customHead: z.string().nullable().optional(),
  customBody: z.string().nullable().optional(),
  customFooter: z.string().nullable().optional(),
  // Campos PWA
  pwaEnabled: z.boolean().optional(),
  pwaName: z.string().nullable().optional(),
  pwaShortName: z.string().nullable().optional(),
  pwaDescription: z.string().nullable().optional(),
  pwaIconUrl: z.string().nullable().optional(),
  pwaThemeColor: z.string().nullable().optional(),
  pwaBackgroundColor: z.string().nullable().optional(),
  pwaDisplayMode: z.string().nullable().optional(),
  pwaStartUrl: z.string().nullable().optional(),
  pwaScope: z.string().nullable().optional(),
  pwaShowInstallPrompt: z.boolean().optional(),
});

const updatePageSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  htmlContent: z.string().optional(),
  faviconUrl: z.string().nullable().optional(),
  metaTitle: z.string().nullable().optional(),
  metaDescription: z.string().nullable().optional(),
  ogTitle: z.string().nullable().optional(),
  ogDescription: z.string().nullable().optional(),
  ogImage: z.string().nullable().optional(),
  customCss: z.string().nullable().optional(),
  pageTitle: z.string().nullable().optional(),
  pageDescription: z.string().nullable().optional(),
  keywords: z.string().nullable().optional(),
  canonicalUrl: z.string().nullable().optional(),
  robots: z.string().nullable().optional(),
  facebookPixel: z.string().nullable().optional(),
  googleAnalytics: z.string().nullable().optional(),
  googleTagManager: z.string().nullable().optional(),
  tiktokPixel: z.string().nullable().optional(),
  linkedinPixel: z.string().nullable().optional(),
  twitterPixel: z.string().nullable().optional(),
  customHead: z.string().nullable().optional(),
  customBody: z.string().nullable().optional(),
  customFooter: z.string().nullable().optional(),
  // Campos PWA
  pwaEnabled: z.boolean().optional(),
  pwaName: z.string().nullable().optional(),
  pwaShortName: z.string().nullable().optional(),
  pwaDescription: z.string().nullable().optional(),
  pwaIconUrl: z.string().nullable().optional(),
  pwaThemeColor: z.string().nullable().optional(),
  pwaBackgroundColor: z.string().nullable().optional(),
  pwaDisplayMode: z.string().nullable().optional(),
  pwaStartUrl: z.string().nullable().optional(),
  pwaScope: z.string().nullable().optional(),
  pwaShowInstallPrompt: z.boolean().optional(),
  // Custom Domain
  customDomainId: z.string().nullable().optional(),
});

// GET - List all AI pages for the user
router.get('/', verifyJWT, ensureUserExists, async (req: Request, res: Response) => {
  try {
    console.log('📋 GET /api/ai-pages - Listando páginas');
    const userId = (req as any).user.userId;
    const userRole = (req as any).user.role;
    console.log('👤 User ID:', userId, 'Role:', userRole);

    // Admin vê todas as páginas, usuários normais veem apenas suas próprias
    const whereClause = userRole === 'ADMIN' ? {} : { userId };
    console.log('🔍 Where clause:', JSON.stringify(whereClause));

    const pages = await prisma.aiPage.findMany({
      where: whereClause,
      orderBy: {
        createdAt: "desc"
      }
    });

    console.log(`✅ Encontradas ${pages.length} páginas`);

    // Convert to format expected by frontend
    const formattedPages = pages.map(page => ({
      id: page.id,
      title: page.title,
      slug: page.slug,
      html_content: page.htmlContent,
      thumbnail_url: page.thumbnailUrl,
      views: page.views,
      created_at: page.createdAt,
      updated_at: page.updatedAt,
      favicon_url: page.faviconUrl,
      meta_title: page.metaTitle,
      meta_description: page.metaDescription,
      og_title: page.ogTitle,
      og_description: page.ogDescription,
      og_image: page.ogImage,
      custom_css: page.customCss,
      pageTitle: page.pageTitle,
      pageDescription: page.pageDescription,
      keywords: page.keywords,
      canonicalUrl: page.canonicalUrl,
      robots: page.robots,
      facebookPixel: page.facebookPixel,
      googleAnalytics: page.googleAnalytics,
      googleTagManager: page.googleTagManager,
      tiktokPixel: page.tiktokPixel,
      linkedinPixel: page.linkedinPixel,
      twitterPixel: page.twitterPixel,
      customHead: page.customHead,
      customBody: page.customBody,
      customFooter: page.customFooter,
      // Campos PWA
      pwaEnabled: page.pwaEnabled,
      pwaName: page.pwaName,
      pwaShortName: page.pwaShortName,
      pwaDescription: page.pwaDescription,
      pwaIconUrl: page.pwaIconUrl,
      pwaThemeColor: page.pwaThemeColor,
      pwaBackgroundColor: page.pwaBackgroundColor,
      pwaDisplayMode: page.pwaDisplayMode,
      pwaStartUrl: page.pwaStartUrl,
      pwaScope: page.pwaScope,
      pwaShowInstallPrompt: page.pwaShowInstallPrompt,
      // Custom Domain
      customDomainId: (page as any).customDomainId,
    }));

    res.json(formattedPages);
  } catch (error) {
    console.error("❌ Error fetching AI pages:", error);
    console.error("Error details:", error instanceof Error ? error.message : error);
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack');
    res.status(500).json({ error: "Erro interno do servidor", details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET - Get specific AI page by ID
router.get('/:id', verifyJWT, ensureUserExists, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    const page = await prisma.aiPage.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!page) {
      return res.status(404).json({ error: "Página não encontrada" });
    }

    // Convert to format expected by frontend
    const formattedPage = {
      ...page,
      html_content: page.htmlContent,
      thumbnail_url: page.thumbnailUrl,
      favicon_url: page.faviconUrl,
      meta_title: page.metaTitle,
      meta_description: page.metaDescription,
      og_title: page.ogTitle,
      og_description: page.ogDescription,
      og_image: page.ogImage,
      custom_css: page.customCss,
      created_at: page.createdAt,
      updated_at: page.updatedAt,
      // Campos PWA
      pwaEnabled: page.pwaEnabled,
      pwaName: page.pwaName,
      pwaShortName: page.pwaShortName,
      pwaDescription: page.pwaDescription,
      pwaIconUrl: page.pwaIconUrl,
      pwaThemeColor: page.pwaThemeColor,
      pwaBackgroundColor: page.pwaBackgroundColor,
      pwaDisplayMode: page.pwaDisplayMode,
      pwaStartUrl: page.pwaStartUrl,
      pwaScope: page.pwaScope,
      pwaShowInstallPrompt: page.pwaShowInstallPrompt,
      // Custom Domain
      customDomainId: (page as any).customDomainId,
    };

    res.json(formattedPage);
  } catch (error) {
    console.error("Error fetching AI page:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// POST - Create new AI page
router.post('/', verifyJWT, ensureUserExists, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const body = createPageSchema.parse(req.body);
    const { title, prompt, slug: customSlug, directCreation } = body;

    console.log('🔄 POST /api/ai-pages - Criando página:', {
      title,
      slug: customSlug,
      directCreation: !!directCreation,
      hasHtmlContent: !!(body as any).htmlContent,
    });

    // Verificar créditos apenas para criação com IA (não para importação direta)
    if (!directCreation) {
      console.log(`🔍 Verificando créditos para criação de página com IA - usuário: ${userId}`);
      const requiredCredits = 2; // Custo para criação de página nova
      const hasEnoughCredits = await hasCredits(userId, requiredCredits);
      
      console.log(`💰 Resultado da verificação de créditos: ${hasEnoughCredits}`);
      
      if (!hasEnoughCredits) {
        console.log(`❌ Usuário ${userId} não tem créditos suficientes para criar página`);
        return res.status(402).json({
          error: 'Créditos insuficientes',
          message: 'Você não possui créditos suficientes para criar uma nova página. Considere adquirir um plano ou pacote de créditos.',
          requiredCredits,
          code: 'INSUFFICIENT_CREDITS'
        });
      }
      
      console.log(`✅ Usuário ${userId} tem créditos suficientes para criar página`);
    }

    // Generate slug
    const baseSlug = customSlug || generateSlug(title);
    let finalSlug = baseSlug;
    let counter = 1;

    // Ensure slug is unique
    while (await prisma.aiPage.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    let page;

    if (directCreation) {
      // Criação direta com HTML (importação)
      console.log('🔄 Criação direta - usando HTML fornecido');
      const htmlContent = (body as any).htmlContent || '';
      
      page = await prisma.aiPage.create({
        data: {
          title,
          slug: finalSlug,
          htmlContent,
          metaTitle: (body as any).metaTitle || null,
          metaDescription: (body as any).metaDescription || null,
          ogTitle: (body as any).ogTitle || null,
          ogDescription: (body as any).ogDescription || null,
          ogImage: (body as any).ogImage || null,
          faviconUrl: (body as any).faviconUrl || null,
          customCss: (body as any).customCss || null,
          pageTitle: (body as any).pageTitle || null,
          pageDescription: (body as any).pageDescription || null,
          keywords: (body as any).keywords || null,
          canonicalUrl: (body as any).canonicalUrl || null,
          robots: (body as any).robots || 'index,follow',
          facebookPixel: (body as any).facebookPixel || null,
          googleAnalytics: (body as any).googleAnalytics || null,
          googleTagManager: (body as any).googleTagManager || null,
          tiktokPixel: (body as any).tiktokPixel || null,
          linkedinPixel: (body as any).linkedinPixel || null,
          twitterPixel: (body as any).twitterPixel || null,
          customHead: (body as any).customHead || null,
          customBody: (body as any).customBody || null,
          customFooter: (body as any).customFooter || null,
          // Campos PWA
          pwaEnabled: (body as any).pwaEnabled || false,
          pwaName: (body as any).pwaName || null,
          pwaShortName: (body as any).pwaShortName || null,
          pwaDescription: (body as any).pwaDescription || null,
          pwaIconUrl: (body as any).pwaIconUrl || null,
          pwaThemeColor: (body as any).pwaThemeColor || null,
          pwaBackgroundColor: (body as any).pwaBackgroundColor || null,
          pwaDisplayMode: (body as any).pwaDisplayMode || null,
          pwaStartUrl: (body as any).pwaStartUrl || null,
          pwaScope: (body as any).pwaScope || null,
          userId,
        },
      });
    } else {
      // Criação normal com IA
      console.log('🔄 Criação com IA - gerando conteúdo');
      const generatedContent = await generatePageWithAI({
        title,
        prompt: prompt || '',
        slug: finalSlug,
      });

      page = await prisma.aiPage.create({
        data: {
          title,
          slug: finalSlug,
          htmlContent: generatedContent.htmlContent,
          metaTitle: generatedContent.metaTitle,
          metaDescription: generatedContent.metaDescription,
          ogTitle: generatedContent.ogTitle,
          ogDescription: generatedContent.ogDescription,
          userId,
        },
      });
    }

    // Consumir créditos após criação bem-sucedida (apenas para criação com IA)
    if (!directCreation) {
      console.log(`💰 Consumindo créditos após criação bem-sucedida da página ${page.id}`);
      const cost = calculatePageCreationCost(page.htmlContent);
      console.log(`💰 Custo calculado: ${cost} créditos`);
      
      const creditResult = await consumeCredits(
        userId,
        cost,
        'PAGE_CREATION',
        `Criação da página: ${title}`,
        page.id
      );

      if (!creditResult.success) {
        console.error('❌ Erro ao consumir créditos:', creditResult.message);
        // Não falhar a criação, apenas logar o erro
      } else {
        console.log(`✅ Créditos consumidos: ${cost} créditos para página ${page.id}`);
        console.log(`✅ Novo saldo: ${creditResult.newBalance} créditos`);
      }
    }

    // Sincronizar página com o backend principal
    try {
      console.log(`🔄 Sincronizando página ${page.id} com o backend principal...`);
      await syncPageToMainBackend(page, userId);
      console.log(`✅ Página ${page.id} sincronizada com sucesso!`);
    } catch (syncError) {
      console.error(`❌ Erro ao sincronizar página ${page.id}:`, syncError);
      // Não falhar a criação da página por causa da sincronização
    }

    // Convert to format expected by frontend
    const response = {
      ...page,
      html_content: page.htmlContent,
      thumbnail_url: page.thumbnailUrl,
      favicon_url: page.faviconUrl,
      meta_title: page.metaTitle,
      meta_description: page.metaDescription,
      og_title: page.ogTitle,
      og_description: page.ogDescription,
      og_image: page.ogImage,
      custom_css: page.customCss,
      created_at: page.createdAt,
      updated_at: page.updatedAt,
    };

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Dados inválidos",
        details: error.errors
      });
    }

    console.error("Error creating AI page:", error);
    res.status(500).json({ error: "Erro ao criar página" });
  }
});

// PUT - Update AI page
router.put('/:id', verifyJWT, ensureUserExists, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;
    
    console.log('🔄 PUT /api/ai-pages/:id - Atualizando página:', {
      id,
      userId,
      body: req.body
    });
    
    const updates = updatePageSchema.parse(req.body);
    
    console.log('✅ Dados validados:', updates);

    // Check if page exists and belongs to user
    const existingPage = await prisma.aiPage.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!existingPage) {
      return res.status(404).json({ error: "Página não encontrada" });
    }

    // Check slug uniqueness if slug is being updated
    if (updates.slug && updates.slug !== existingPage.slug) {
      const slugExists = await prisma.aiPage.findUnique({
        where: { slug: updates.slug }
      });
      
      if (slugExists) {
        return res.status(400).json({ error: "Este slug já existe" });
      }
    }

    // Convert frontend format to database format
    const dbUpdates: any = {};
    if (updates.title) dbUpdates.title = updates.title;
    if (updates.slug) dbUpdates.slug = updates.slug;
    if (updates.htmlContent) dbUpdates.htmlContent = updates.htmlContent;
    if (updates.faviconUrl) dbUpdates.faviconUrl = updates.faviconUrl;
    if (updates.metaTitle) dbUpdates.metaTitle = updates.metaTitle;
    if (updates.metaDescription) dbUpdates.metaDescription = updates.metaDescription;
    if (updates.ogTitle) dbUpdates.ogTitle = updates.ogTitle;
    if (updates.ogDescription) dbUpdates.ogDescription = updates.ogDescription;
    if (updates.ogImage) dbUpdates.ogImage = updates.ogImage;
    if (updates.customCss) dbUpdates.customCss = updates.customCss;
    if (updates.pageTitle) dbUpdates.pageTitle = updates.pageTitle;
    if (updates.pageDescription) dbUpdates.pageDescription = updates.pageDescription;
    if (updates.keywords) dbUpdates.keywords = updates.keywords;
    if (updates.canonicalUrl) dbUpdates.canonicalUrl = updates.canonicalUrl;
    if (updates.robots) dbUpdates.robots = updates.robots;
    if (updates.facebookPixel) dbUpdates.facebookPixel = updates.facebookPixel;
    if (updates.googleAnalytics) dbUpdates.googleAnalytics = updates.googleAnalytics;
    if (updates.googleTagManager) dbUpdates.googleTagManager = updates.googleTagManager;
    if (updates.tiktokPixel) dbUpdates.tiktokPixel = updates.tiktokPixel;
    if (updates.linkedinPixel) dbUpdates.linkedinPixel = updates.linkedinPixel;
    if (updates.twitterPixel) dbUpdates.twitterPixel = updates.twitterPixel;
    if (updates.customHead) dbUpdates.customHead = updates.customHead;
    if (updates.customBody) dbUpdates.customBody = updates.customBody;
    if (updates.customFooter) dbUpdates.customFooter = updates.customFooter;
    // Campos PWA
    if (updates.pwaEnabled !== undefined) {
      dbUpdates.pwaEnabled = updates.pwaEnabled;
      console.log('🔧 PWA: Salvando pwaEnabled:', updates.pwaEnabled);
    }
    if (updates.pwaName !== undefined) {
      dbUpdates.pwaName = updates.pwaName;
      console.log('🔧 PWA: Salvando pwaName:', updates.pwaName);
    }
    if (updates.pwaShortName !== undefined) {
      dbUpdates.pwaShortName = updates.pwaShortName;
      console.log('🔧 PWA: Salvando pwaShortName:', updates.pwaShortName);
    }
    if (updates.pwaDescription !== undefined) dbUpdates.pwaDescription = updates.pwaDescription;
    if (updates.pwaIconUrl !== undefined) dbUpdates.pwaIconUrl = updates.pwaIconUrl;
    if (updates.pwaThemeColor !== undefined) dbUpdates.pwaThemeColor = updates.pwaThemeColor;
    if (updates.pwaBackgroundColor !== undefined) dbUpdates.pwaBackgroundColor = updates.pwaBackgroundColor;
    if (updates.pwaDisplayMode !== undefined) dbUpdates.pwaDisplayMode = updates.pwaDisplayMode;
    if (updates.pwaStartUrl !== undefined) dbUpdates.pwaStartUrl = updates.pwaStartUrl;
    if (updates.pwaScope !== undefined) dbUpdates.pwaScope = updates.pwaScope;
    if (updates.pwaShowInstallPrompt !== undefined) {
      console.log('🔔 Backend PWA: pwaShowInstallPrompt recebido:', updates.pwaShowInstallPrompt);
      dbUpdates.pwaShowInstallPrompt = updates.pwaShowInstallPrompt;
    }
    // Custom Domain
    if (updates.customDomainId !== undefined) {
      dbUpdates.customDomainId = updates.customDomainId;
      console.log('🌐 Custom Domain: Salvando customDomainId:', updates.customDomainId);
    }

    console.log('🔧 PWA: Dados para salvar no banco:', dbUpdates);
    
    const updatedPage = await prisma.aiPage.update({
      where: { id },
      data: dbUpdates
    });
    
    console.log('🔧 PWA: Página atualizada no banco:', {
      id: updatedPage.id,
      pwaEnabled: updatedPage.pwaEnabled,
      pwaShowInstallPrompt: updatedPage.pwaShowInstallPrompt,
      pwaName: updatedPage.pwaName,
      pwaShortName: updatedPage.pwaShortName
    });

    // Invalidar cache SSR da página (importante para refletir mudanças de título/favicon)
    const cacheKey = `ssr:page:${updatedPage.slug}`;
    await cacheService.del(cacheKey);
    
    // Invalidar cache PWA se campos PWA foram alterados
    const pwaFieldsChanged = Object.keys(updates).some(key => 
      key.startsWith('pwa') && updates[key as keyof typeof updates] !== undefined
    );
    
    if (pwaFieldsChanged) {
      await cacheService.del(`pwa:manifest:${updatedPage.slug}`);
      await cacheService.del(`pwa:sw:${updatedPage.slug}`);
      await cacheService.del(`pwa:offline:${updatedPage.slug}`);
      console.log(`🗑️  Cache PWA invalidado para página: ${updatedPage.slug}`);
    }
    
    // Se mudou o slug, invalidar cache antigo também
    if (updates.slug && updates.slug !== existingPage.slug) {
      await cacheService.del(`ssr:page:${existingPage.slug}`);
      await cacheService.del(`pwa:manifest:${existingPage.slug}`);
      await cacheService.del(`pwa:sw:${existingPage.slug}`);
      await cacheService.del(`pwa:offline:${existingPage.slug}`);
      console.log(`🗑️  Cache invalidado para slug antigo: ${existingPage.slug}`);
    }
    
    console.log(`🗑️  Cache invalidado para página: ${updatedPage.slug}`);

    // Convert to format expected by frontend
    const response = {
      ...updatedPage,
      html_content: updatedPage.htmlContent,
      thumbnail_url: updatedPage.thumbnailUrl,
      favicon_url: updatedPage.faviconUrl,
      meta_title: updatedPage.metaTitle,
      meta_description: updatedPage.metaDescription,
      og_title: updatedPage.ogTitle,
      og_description: updatedPage.ogDescription,
      og_image: updatedPage.ogImage,
      custom_css: updatedPage.customCss,
      created_at: updatedPage.createdAt,
      updated_at: updatedPage.updatedAt,
      // Campos PWA
      pwaEnabled: updatedPage.pwaEnabled,
      pwaName: updatedPage.pwaName,
      pwaShortName: updatedPage.pwaShortName,
      pwaDescription: updatedPage.pwaDescription,
      pwaIconUrl: updatedPage.pwaIconUrl,
      pwaThemeColor: updatedPage.pwaThemeColor,
      pwaBackgroundColor: updatedPage.pwaBackgroundColor,
      pwaDisplayMode: updatedPage.pwaDisplayMode,
      pwaStartUrl: updatedPage.pwaStartUrl,
      pwaScope: updatedPage.pwaScope,
      pwaShowInstallPrompt: updatedPage.pwaShowInstallPrompt,
      // Custom Domain (workaround para cache do TypeScript)
      customDomainId: (updatedPage as any).customDomainId,
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Erro na atualização da página:', error);
    
    if (error instanceof z.ZodError) {
      console.error('❌ Erro de validação Zod:', error.errors);
      return res.status(400).json({
        error: "Dados inválidos",
        details: error.errors
      });
    }

    console.error("Error updating AI page:", error);
    res.status(500).json({ error: "Erro ao atualizar página" });
  }
});

// DELETE - Delete AI page
router.delete('/:id', verifyJWT, ensureUserExists, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.userId;

    // Check if page exists and belongs to user
    const existingPage = await prisma.aiPage.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!existingPage) {
      return res.status(404).json({ error: "Página não encontrada" });
    }

    await prisma.aiPage.delete({
      where: { id }
    });

    res.json({ message: "Página deletada com sucesso" });
  } catch (error) {
    console.error("Error deleting AI page:", error);
    res.status(500).json({ error: "Erro ao deletar página" });
  }
});

export default router;
