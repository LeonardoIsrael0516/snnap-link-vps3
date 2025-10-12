import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { cacheService } from '../services/cacheService';

const router = Router();

// GET - Manifest dinâmico para PWA
router.get('/:slug/manifest.json', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const customDomain = (req as any).customDomain;
    
    // Determinar cache key baseado no tipo de acesso
    const cacheKey = customDomain 
      ? `pwa:manifest:custom:${customDomain.domain}:${slug}`
      : `pwa:manifest:${slug}`;

    // Tentar buscar do cache primeiro
    const cachedManifest = await cacheService.get<any>(cacheKey);
    if (cachedManifest) {
      console.log(`💾 PWA: Manifest servido do cache`);
      res.setHeader('Content-Type', 'application/manifest+json');
      res.setHeader('X-Cache', 'HIT');
      return res.json(cachedManifest);
    }

    console.log(`🔍 PWA: Buscando manifest no banco...`);

    // Buscar página no banco baseado no tipo de acesso
    let page;
    if (customDomain) {
      // Para domínios personalizados, buscar por pageId
      if (customDomain.isRootDomain && slug === 'root') {
        page = await prisma.aiPage.findUnique({
          where: { id: customDomain.pageId },
          select: {
            pwaEnabled: true,
            pwaName: true,
            pwaShortName: true,
            pwaDescription: true,
            pwaIconUrl: true,
            pwaThemeColor: true,
            pwaBackgroundColor: true,
            pwaDisplayMode: true,
            pwaStartUrl: true,
            pwaScope: true,
            title: true,
            faviconUrl: true,
            slug: true
          }
        });
      } else if (!customDomain.isRootDomain && slug === customDomain.slug) {
        page = await prisma.aiPage.findUnique({
          where: { id: customDomain.pageId },
          select: {
            pwaEnabled: true,
            pwaName: true,
            pwaShortName: true,
            pwaDescription: true,
            pwaIconUrl: true,
            pwaThemeColor: true,
            pwaBackgroundColor: true,
            pwaDisplayMode: true,
            pwaStartUrl: true,
            pwaScope: true,
            title: true,
            faviconUrl: true,
            slug: true
          }
        });
      }
    } else {
      // Acesso normal por slug
      page = await prisma.aiPage.findUnique({
        where: { slug },
        select: {
          pwaEnabled: true,
          pwaName: true,
          pwaShortName: true,
          pwaDescription: true,
          pwaIconUrl: true,
          pwaThemeColor: true,
          pwaBackgroundColor: true,
          pwaDisplayMode: true,
          pwaStartUrl: true,
          pwaScope: true,
          title: true,
          faviconUrl: true,
          slug: true
        }
      });
    }

    if (!page) {
      return res.status(404).json({ error: 'Página não encontrada' });
    }

    if (!page.pwaEnabled) {
      return res.status(404).json({ error: 'PWA não habilitado para esta página' });
    }

    // Função helper para gerar ícone SVG
    const generateSvgIcon = (size: string) => {
      const firstLetter = (page.pwaShortName || page.title).charAt(0).toUpperCase();
      const themeColor = (page.pwaThemeColor || '000000').replace('#', '');
      return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23${themeColor}"/><text x="50" y="50" font-size="48" text-anchor="middle" dominant-baseline="middle" fill="white">${firstLetter}</text></svg>`;
    };

    // Gerar múltiplos tamanhos de ícones (seguindo spec PWA)
    const iconSizes = ['72x72', '96x96', '128x128', '144x144', '152x152', '192x192', '384x384', '512x512'];
    const iconUrl = page.pwaIconUrl || page.faviconUrl;
    
    const icons = iconUrl ? [
      // Ícones normais
      ...iconSizes.map(size => ({
        src: iconUrl,
        sizes: size,
        type: 'image/png',
        purpose: 'any'
      })),
      // Ícone maskable (para adaptive icons no Android)
      {
        src: iconUrl,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ] : [
      // Fallback: ícones SVG gerados
      ...iconSizes.map(size => ({
        src: generateSvgIcon(size),
        sizes: size,
        type: 'image/svg+xml',
        purpose: 'any'
      })),
      {
        src: generateSvgIcon('512x512'),
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable'
      }
    ];

    // Gerar manifest dinâmico
    const manifest = {
      name: page.pwaName || page.title,
      short_name: page.pwaShortName || page.title.slice(0, 12),
      description: page.pwaDescription || `App: ${page.title}`,
      start_url: page.pwaStartUrl || `/${slug}`,
      display: page.pwaDisplayMode || 'standalone',
      background_color: page.pwaBackgroundColor || '#ffffff',
      theme_color: page.pwaThemeColor || '#000000',
      orientation: 'portrait-primary',
      scope: page.pwaScope || `/${slug}/`,
      icons,
      // Shortcuts - atalhos rápidos no ícone do app (Android)
      shortcuts: [
        {
          name: 'Abrir Página',
          short_name: 'Abrir',
          description: `Acessar ${page.title}`,
          url: `/${slug}`,
          icons: [
            {
              src: iconUrl || generateSvgIcon('96x96'),
              sizes: '96x96',
              type: iconUrl ? 'image/png' : 'image/svg+xml'
            }
          ]
        }
      ],
      categories: ['productivity', 'utilities', 'lifestyle'],
      lang: 'pt-BR',
      dir: 'ltr',
      // Proteção contra screenshots da app store
      prefer_related_applications: false,
      // Display override para suporte a novos modos
      display_override: ['window-controls-overlay', 'standalone', 'minimal-ui']
    };

    // Cachear manifest por 1 hora (3600 segundos)
    await cacheService.set(cacheKey, manifest, 3600);
    console.log(`💾 PWA: Manifest '${slug}' armazenado no cache`);

    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('X-Cache', 'MISS');
    res.json(manifest);

  } catch (error) {
    console.error("Error generating PWA manifest:", error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET - Service Worker dinâmico
router.get('/:slug/sw.js', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const customDomain = (req as any).customDomain;
    
    // Determinar cache key baseado no tipo de acesso
    const cacheKey = customDomain 
      ? `pwa:sw:custom:${customDomain.domain}:${slug}`
      : `pwa:sw:${slug}`;

    // Tentar buscar do cache primeiro
    const cachedSW = await cacheService.get<string>(cacheKey);
    if (cachedSW) {
      console.log(`💾 PWA: Service Worker servido do cache`);
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('X-Cache', 'HIT');
      return res.send(cachedSW);
    }

    console.log(`🔍 PWA: Gerando Service Worker...`);

    // Buscar página para obter configurações baseado no tipo de acesso
    let page;
    if (customDomain) {
      // Para domínios personalizados, buscar por pageId
      if (customDomain.isRootDomain && slug === 'root') {
        page = await prisma.aiPage.findUnique({
          where: { id: customDomain.pageId },
          select: {
            pwaEnabled: true,
            title: true,
            slug: true
          }
        });
      } else if (!customDomain.isRootDomain && slug === customDomain.slug) {
        page = await prisma.aiPage.findUnique({
          where: { id: customDomain.pageId },
          select: {
            pwaEnabled: true,
            title: true,
            slug: true
          }
        });
      }
    } else {
      // Acesso normal por slug
      page = await prisma.aiPage.findUnique({
        where: { slug },
        select: {
          pwaEnabled: true,
          title: true,
          slug: true
        }
      });
    }

    if (!page || !page.pwaEnabled) {
      return res.status(404).send('// PWA não habilitado');
    }

    // Gerar Service Worker dinâmico
    const swCode = `
const CACHE_VERSION = 'v2';
const CACHE_NAME = 'pwa-${slug}-' + CACHE_VERSION;
const STATIC_CACHE = 'pwa-static-${slug}-' + CACHE_VERSION;
const DYNAMIC_CACHE = 'pwa-dynamic-${slug}-' + CACHE_VERSION;
const IMAGE_CACHE = 'pwa-images-${slug}-' + CACHE_VERSION;

// URLs para cache estático
const staticAssets = [
  '/${slug}',
  '/${slug}/manifest.json',
  'https://cdn.tailwindcss.com'
];

// Configurações de cache por tipo
const CACHE_CONFIG = {
  images: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    maxItems: 50
  },
  dynamic: {
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    maxItems: 100
  }
};

// Instalar Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker v2 para ${slug}');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Cache estático aberto');
        return cache.addAll(staticAssets).catch(err => {
          console.error('[SW] Erro ao cachear assets estáticos:', err);
          // Não falhar se algum asset não carregar
          return Promise.resolve();
        });
      })
      .then(() => {
        console.log('[SW] Cache preenchido, pulando espera');
        return self.skipWaiting();
      })
  );
});

// Ativar Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando Service Worker v2 para ${slug}');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Remover caches antigos de versões diferentes
          if (cacheName.includes('${slug}') && 
              cacheName !== CACHE_NAME && 
              cacheName !== STATIC_CACHE && 
              cacheName !== DYNAMIC_CACHE && 
              cacheName !== IMAGE_CACHE) {
            console.log('[SW] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service Worker v2 ativado e assumindo controle');
      return self.clients.claim();
    })
  );
});

// Limpar cache antigo por idade
async function cleanOldCache(cacheName, maxAge, maxItems) {
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();
  
  // Remover itens antigos
  const now = Date.now();
  for (const request of requests) {
    const response = await cache.match(request);
    if (response) {
      const dateHeader = response.headers.get('date');
      if (dateHeader) {
        const age = now - new Date(dateHeader).getTime();
        if (age > maxAge) {
          console.log('[SW] Removendo item antigo do cache:', request.url);
          await cache.delete(request);
        }
      }
    }
  }
  
  // Limitar número de itens
  const remainingRequests = await cache.keys();
  if (remainingRequests.length > maxItems) {
    const toRemove = remainingRequests.slice(0, remainingRequests.length - maxItems);
    for (const request of toRemove) {
      console.log('[SW] Removendo item excedente:', request.url);
      await cache.delete(request);
    }
  }
}

// Estratégia de cache por tipo de recurso
function getCacheStrategy(request) {
  const url = new URL(request.url);
  const extension = url.pathname.split('.').pop();
  
  // Imagens: Cache-first com limpeza
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico'].includes(extension)) {
    return 'cache-first-images';
  }
  
  // HTML: Network-first para sempre ter conteúdo fresco
  if (request.destination === 'document' || extension === 'html') {
    return 'network-first';
  }
  
  // CSS/JS: Cache-first
  if (['css', 'js'].includes(extension)) {
    return 'cache-first';
  }
  
  // API calls: Network-first
  if (url.pathname.includes('/api/')) {
    return 'network-only';
  }
  
  // Padrão: Network-first
  return 'network-first';
}

// Cache-first para imagens
async function cacheFirstImages(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    console.log('[SW] Imagem do cache:', request.url);
    // Limpar cache antigo periodicamente
    cleanOldCache(IMAGE_CACHE, CACHE_CONFIG.images.maxAge, CACHE_CONFIG.images.maxItems);
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Falha ao buscar imagem:', request.url);
    return new Response('Imagem não disponível', { status: 503 });
  }
}

// Network-first para HTML e conteúdo dinâmico
async function networkFirst(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  
  try {
    const networkResponse = await fetch(request, { 
      cache: 'no-cache' // Sempre buscar versão fresca
    });
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network falhou, tentando cache:', request.url);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Se é documento e não tem cache, mostrar página offline
    if (request.destination === 'document') {
      const offlinePage = await cache.match('/${slug}/offline.html');
      if (offlinePage) return offlinePage;
    }
    
    return new Response('Offline', { status: 503 });
  }
}

// Cache-first para assets estáticos
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Recurso não disponível', { status: 503 });
  }
}

// Interceptar requisições
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Ignorar requisições que não são GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignorar chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  const strategy = getCacheStrategy(request);
  
  if (strategy === 'cache-first-images') {
    event.respondWith(cacheFirstImages(request));
  } else if (strategy === 'network-first') {
    event.respondWith(networkFirst(request));
  } else if (strategy === 'cache-first') {
    event.respondWith(cacheFirst(request));
  } else if (strategy === 'network-only') {
    event.respondWith(fetch(request));
  }
});

// Mensagem para o cliente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Recebido SKIP_WAITING, ativando nova versão');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAN_CACHE') {
    console.log('[SW] Limpando caches');
    event.waitUntil(
      Promise.all([
        cleanOldCache(IMAGE_CACHE, CACHE_CONFIG.images.maxAge, CACHE_CONFIG.images.maxItems),
        cleanOldCache(DYNAMIC_CACHE, CACHE_CONFIG.dynamic.maxAge, CACHE_CONFIG.dynamic.maxItems)
      ])
    );
  }
});

// Background Sync (quando voltar online, sincronizar)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync disparado');
    event.waitUntil(
      // Aqui você pode adicionar lógica para sincronizar dados quando voltar online
      Promise.resolve()
    );
  }
});

console.log('[SW] Service Worker v2 carregado para ${slug}');
    `.trim();

    // Cachear Service Worker por 1 hora
    await cacheService.set(cacheKey, swCode, 3600);
    console.log(`💾 PWA: Service Worker '${slug}' armazenado no cache`);

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('X-Cache', 'MISS');
    res.send(swCode);

  } catch (error) {
    console.error("Error generating Service Worker:", error);
    res.status(500).send('// Erro ao gerar Service Worker');
  }
});

// GET - Página offline
router.get('/:slug/offline.html', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const customDomain = (req as any).customDomain;
    
    // Determinar cache key baseado no tipo de acesso
    const cacheKey = customDomain 
      ? `pwa:offline:custom:${customDomain.domain}:${slug}`
      : `pwa:offline:${slug}`;

    // Tentar buscar do cache primeiro
    const cachedOffline = await cacheService.get<string>(cacheKey);
    if (cachedOffline) {
      console.log(`💾 PWA: Página offline servida do cache`);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('X-Cache', 'HIT');
      return res.send(cachedOffline);
    }

    console.log(`🔍 PWA: Gerando página offline...`);

    // Buscar página para obter configurações baseado no tipo de acesso
    let page;
    if (customDomain) {
      // Para domínios personalizados, buscar por pageId
      if (customDomain.isRootDomain && slug === 'root') {
        page = await prisma.aiPage.findUnique({
          where: { id: customDomain.pageId },
          select: {
            pwaEnabled: true,
            pwaName: true,
            pwaThemeColor: true,
            pwaBackgroundColor: true,
            title: true
          }
        });
      } else if (!customDomain.isRootDomain && slug === customDomain.slug) {
        page = await prisma.aiPage.findUnique({
          where: { id: customDomain.pageId },
          select: {
            pwaEnabled: true,
            pwaName: true,
            pwaThemeColor: true,
            pwaBackgroundColor: true,
            title: true
          }
        });
      }
    } else {
      // Acesso normal por slug
      page = await prisma.aiPage.findUnique({
        where: { slug },
        select: {
          pwaEnabled: true,
          pwaName: true,
          pwaThemeColor: true,
          pwaBackgroundColor: true,
          title: true
        }
      });
    }

    if (!page || !page.pwaEnabled) {
      return res.status(404).send('PWA não habilitado');
    }

    const appName = page.pwaName || page.title;
    const themeColor = page.pwaThemeColor || '#000000';
    const backgroundColor = page.pwaBackgroundColor || '#ffffff';

    // Gerar página offline personalizada
    const offlinePage = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline - ${appName}</title>
  <meta name="theme-color" content="${themeColor}">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      background-color: ${backgroundColor};
    }
    .theme-color {
      color: ${themeColor};
    }
    .theme-bg {
      background-color: ${themeColor};
    }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
  <div class="text-center max-w-md mx-auto">
    <!-- Ícone offline -->
    <div class="mb-8">
      <div class="w-24 h-24 mx-auto theme-bg rounded-full flex items-center justify-center">
        <svg class="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M12 2.25a9.75 9.75 0 100 19.5 9.75 9.75 0 000-19.5z"></path>
        </svg>
      </div>
    </div>
    
    <!-- Título -->
    <h1 class="text-3xl font-bold theme-color mb-4">Você está offline</h1>
    
    <!-- Descrição -->
    <p class="text-gray-600 mb-8 leading-relaxed">
      O ${appName} não está disponível offline no momento. 
      Verifique sua conexão com a internet e tente novamente.
    </p>
    
    <!-- Botões de ação -->
    <div class="space-y-4">
      <button 
        onclick="window.location.reload()" 
        class="w-full theme-bg text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
      >
        🔄 Tentar Novamente
      </button>
      
      <button 
        onclick="window.history.back()" 
        class="w-full border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
      >
        ← Voltar
      </button>
    </div>
    
    <!-- Informações adicionais -->
    <div class="mt-8 text-sm text-gray-500">
      <p>Esta página foi gerada automaticamente pelo sistema PWA.</p>
      <p class="mt-2">App: <span class="font-medium theme-color">${appName}</span></p>
    </div>
  </div>
  
  <script>
    // Detectar quando voltar online
    window.addEventListener('online', function() {
      console.log('Conexão restaurada, recarregando página...');
      window.location.reload();
    });
    
    // Mostrar notificação quando voltar online
    window.addEventListener('online', function() {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Conexão Restaurada', {
          body: 'Você está online novamente! Recarregando a página...',
          icon: '/favicon.png'
        });
      }
    });
  </script>
</body>
</html>
    `.trim();

    // Cachear página offline por 1 hora
    await cacheService.set(cacheKey, offlinePage, 3600);
    console.log(`💾 PWA: Página offline '${slug}' armazenada no cache`);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Cache', 'MISS');
    res.send(offlinePage);

  } catch (error) {
    console.error("Error generating offline page:", error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Erro Offline</title></head>
      <body>
        <h1>Erro ao carregar página offline</h1>
        <p>Tente novamente mais tarde.</p>
      </body>
      </html>
    `);
  }
});

export default router;
