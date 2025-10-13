import { Router, Request, Response } from 'express';
import { prisma, reconnectPrisma } from '../config/database';
import { cacheService } from '../services/cacheService';
import { injectAnalyticsScript } from '../lib/analytics-client';

// Função para executar queries Prisma com retry
async function executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      if (error.message?.includes('prepared statement') && attempt < maxRetries) {
        console.log(`🔄 Tentativa ${attempt} falhou, reconectando...`);
        await reconnectPrisma();
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Wait before retry
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

const router = Router();

// GET - Render page by slug (SSR) com cache
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    
    // Check if this is a custom domain request
    const customDomain = (req as any).customDomain;
    let aiPage;
    let cacheKey;

    if (customDomain) {
      // For custom domains, find page by pageId and check if slug matches or is root domain
      cacheKey = `ssr:custom:${customDomain.domain}:${slug}`;
      
      console.log(`🔍 SSR: Buscando página para domínio personalizado '${customDomain.domain}' com slug '${slug}'...`);
      
      if (customDomain.isRootDomain && slug === 'root') {
        // Root domain access (e.g., meudominio.com)
        aiPage = await executeWithRetry(() => prisma.aiPage.findUnique({
          where: { id: customDomain.pageId },
          select: {
            id: true,
            userId: true,
            title: true,
            slug: true,
            htmlContent: true,
            faviconUrl: true,
            metaTitle: true,
            metaDescription: true,
            ogTitle: true,
            ogDescription: true,
            ogImage: true,
            customCss: true,
            pageTitle: true,
            pageDescription: true,
            keywords: true,
            canonicalUrl: true,
            robots: true,
            facebookPixel: true,
            googleAnalytics: true,
            googleTagManager: true,
            tiktokPixel: true,
            linkedinPixel: true,
            twitterPixel: true,
            customHead: true,
            customBody: true,
            customFooter: true,
            views: true,
            createdAt: true,
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
            pwaShowInstallPrompt: true,
          }
        });
      } else if (!customDomain.isRootDomain && slug === customDomain.slug) {
        // Subdomain with specific slug (e.g., minhapage.meudominio.com)
        aiPage = await executeWithRetry(() => prisma.aiPage.findUnique({
          where: { id: customDomain.pageId },
          select: {
            id: true,
            userId: true,
            title: true,
            slug: true,
            htmlContent: true,
            faviconUrl: true,
            metaTitle: true,
            metaDescription: true,
            ogTitle: true,
            ogDescription: true,
            ogImage: true,
            customCss: true,
            pageTitle: true,
            pageDescription: true,
            keywords: true,
            canonicalUrl: true,
            robots: true,
            facebookPixel: true,
            googleAnalytics: true,
            googleTagManager: true,
            tiktokPixel: true,
            linkedinPixel: true,
            twitterPixel: true,
            customHead: true,
            customBody: true,
            customFooter: true,
            views: true,
            createdAt: true,
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
            pwaShowInstallPrompt: true,
          }
        });
      }
    } else {
      // Regular slug-based access
      cacheKey = `ssr:page:${slug}`;
      
      console.log(`🔍 SSR: Buscando página '${slug}' no banco...`);
      
      aiPage = await executeWithRetry(() => prisma.aiPage.findUnique({
        where: { slug },
        select: {
          id: true,
          userId: true,
          title: true,
          slug: true,
          htmlContent: true,
          faviconUrl: true,
          metaTitle: true,
          metaDescription: true,
          ogTitle: true,
          ogDescription: true,
          ogImage: true,
          customCss: true,
          pageTitle: true,
          pageDescription: true,
          keywords: true,
          canonicalUrl: true,
          robots: true,
          facebookPixel: true,
          googleAnalytics: true,
          googleTagManager: true,
          tiktokPixel: true,
          linkedinPixel: true,
          twitterPixel: true,
          customHead: true,
          customBody: true,
          customFooter: true,
          views: true,
          createdAt: true,
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
          pwaShowInstallPrompt: true,
        }
      }));
    }

    // Tentar buscar HTML renderizado do cache
    const cachedHtml = await cacheService.get<string>(cacheKey);
    if (cachedHtml) {
      console.log(`💾 SSR: Página servida do cache`);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('X-Cache', 'HIT');
      return res.send(cachedHtml);
    }

    if (!aiPage) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Página não encontrada</title>
        </head>
        <body>
          <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui;">
            <div style="text-align: center;">
              <h1 style="font-size: 2rem; margin-bottom: 1rem;">404 - Página não encontrada</h1>
              <p style="color: #666;">A página que você está procurando não existe.</p>
            </div>
          </div>
        </body>
        </html>
      `);
    }

    // Increment views
    await executeWithRetry(() => prisma.aiPage.update({
      where: { id: aiPage.id },
      data: { views: { increment: 1 } }
    });

    // Generate meta tags
    const generateMetaTags = () => {
      const metaTags = [];
      
      // Title - prioridade: pageTitle > metaTitle > title
      const pageTitle = aiPage.pageTitle || aiPage.metaTitle || aiPage.title;
      if (pageTitle) {
        metaTags.push(`<title>${pageTitle}</title>`);
      }
      
      // Favicon
      if (aiPage.faviconUrl) {
        metaTags.push(`<link rel="icon" type="image/x-icon" href="${aiPage.faviconUrl}">`);
        metaTags.push(`<link rel="shortcut icon" type="image/x-icon" href="${aiPage.faviconUrl}">`);
      }
      
      // Description - prioridade: pageDescription > metaDescription
      const description = aiPage.pageDescription || aiPage.metaDescription;
      if (description) {
        metaTags.push(`<meta name="description" content="${description}">`);
      }
      
      if (aiPage.keywords) {
        metaTags.push(`<meta name="keywords" content="${aiPage.keywords}">`);
      }
      if (aiPage.robots) {
        metaTags.push(`<meta name="robots" content="${aiPage.robots}">`);
      }
      if (aiPage.canonicalUrl) {
        metaTags.push(`<link rel="canonical" href="${aiPage.canonicalUrl}">`);
      }
      
      // Open Graph
      if (aiPage.ogTitle) {
        metaTags.push(`<meta property="og:title" content="${aiPage.ogTitle}">`);
      }
      if (aiPage.ogDescription) {
        metaTags.push(`<meta property="og:description" content="${aiPage.ogDescription}">`);
      }
      if (aiPage.ogImage) {
        metaTags.push(`<meta property="og:image" content="${aiPage.ogImage}">`);
      }
      metaTags.push(`<meta property="og:type" content="website">`);
      
      // Twitter Card
      if (aiPage.ogTitle) {
        metaTags.push(`<meta name="twitter:title" content="${aiPage.ogTitle}">`);
      }
      if (aiPage.ogDescription) {
        metaTags.push(`<meta name="twitter:description" content="${aiPage.ogDescription}">`);
      }
      if (aiPage.ogImage) {
        metaTags.push(`<meta name="twitter:image" content="${aiPage.ogImage}">`);
      }
      metaTags.push(`<meta name="twitter:card" content="summary_large_image">`);
      
      return metaTags.join('\n  ');
    };

    // Generate pixel scripts
    const generatePixelScripts = () => {
      const scripts = [];
      
      if (aiPage.googleAnalytics) {
        scripts.push(`
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${aiPage.googleAnalytics}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${aiPage.googleAnalytics}');
</script>`);
      }
      
      if (aiPage.googleTagManager) {
        scripts.push(`
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${aiPage.googleTagManager}');</script>`);
      }
      
      if (aiPage.facebookPixel) {
        scripts.push(`
<!-- Facebook Pixel -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${aiPage.facebookPixel}');
fbq('track', 'PageView');
</script>`);
      }
      
      return scripts.join('\n');
    };

    // Generate PWA tags
    const generatePWATags = () => {
      if (!aiPage.pwaEnabled) return '';
      
      const pwaName = aiPage.pwaName || aiPage.title;
      const pwaShortName = aiPage.pwaShortName || aiPage.title.slice(0, 12);
      const pwaIconUrl = aiPage.pwaIconUrl || aiPage.faviconUrl || '/default-pwa-icon.png';
      const themeColor = aiPage.pwaThemeColor || '#000000';
      const backgroundColor = aiPage.pwaBackgroundColor || '#ffffff';
      
      // Determinar URLs corretas baseado no tipo de acesso
      const manifestUrl = customDomain 
        ? (customDomain.isRootDomain && slug === 'root' 
            ? '/root/manifest.json' 
            : `/${customDomain.slug}/manifest.json`)
        : `/${slug}/manifest.json`;
      
      const swUrl = customDomain 
        ? (customDomain.isRootDomain && slug === 'root' 
            ? '/root/sw.js' 
            : `/${customDomain.slug}/sw.js`)
        : `/${slug}/sw.js`;

      return `
  <!-- PWA Configuration -->
  <link rel="manifest" href="${manifestUrl}">
  <meta name="theme-color" content="${themeColor}">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="${pwaName}">
  <meta name="msapplication-TileColor" content="${backgroundColor}">
  <meta name="msapplication-tap-highlight" content="no">
  
  <!-- PWA Icons -->
  <link rel="apple-touch-icon" href="${pwaIconUrl}">
  <link rel="icon" type="image/png" sizes="512x512" href="${pwaIconUrl}">
  <link rel="icon" type="image/png" sizes="192x192" href="${pwaIconUrl}">
  
  <!-- PWA Meta -->
  <meta name="application-name" content="${pwaName}">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="format-detection" content="telephone=no">`;
    };

    // Generate PWA script
    const generatePWAScript = (slug: string) => {
      // Determinar URLs corretas baseado no tipo de acesso
      const swUrl = customDomain 
        ? (customDomain.isRootDomain && slug === 'root' 
            ? '/root/sw.js' 
            : `/${customDomain.slug}/sw.js`)
        : `/${slug}/sw.js`;
      
      return `
  <script>
    // ========================================
    // CAPTURAR beforeinstallprompt PRIMEIRO!
    // ========================================
    let deferredPrompt = null;
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    
    // Este listener DEVE ser o primeiro código a executar
    window.addEventListener('beforeinstallprompt', function(e) {
      console.log('🎯 PWA: beforeinstallprompt CAPTURADO!');
      e.preventDefault();
      deferredPrompt = e;
      window.__pwaPromptReady = true;
    });
    
    // AVISO: beforeinstallprompt NÃO dispara em localhost no Android!
    if (isLocalhost) {
      console.warn('⚠️ PWA: Você está em LOCALHOST!');
      console.warn('📱 No Android, beforeinstallprompt NÃO dispara em localhost');
      console.warn('✅ Soluções:');
      console.warn('   1. Use ngrok ou túnel: https://ngrok.com');
      console.warn('   2. Acesse via IP local com HTTPS');
      console.warn('   3. Deploy em produção para testar');
      console.warn('');
      console.warn('🔧 Para testar instalação em localhost:');
      console.warn('   Chrome Menu (⋮) → Instalar app');
    }
    
    // ========================================
    // PWA Service Worker Registration
    // ========================================
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('${swUrl}')
          .then(function(registration) {
            console.log('PWA: Service Worker registrado com sucesso:', registration.scope);
            
            // Verificar se há atualizações
            registration.addEventListener('updatefound', function() {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', function() {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // Nova versão disponível - mostrar notificação elegante
                    showUpdateNotification(newWorker);
                  }
                });
              }
            });
            
            // Verificar atualizações periodicamente (a cada 1 hora)
            setInterval(function() {
              registration.update();
            }, 60 * 60 * 1000);
          })
          .catch(function(error) {
            console.log('PWA: Falha ao registrar Service Worker:', error);
          });
      });
    }
    
    // Notificação elegante de atualização
    function showUpdateNotification(newWorker) {
      // Verificar se já existe notificação
      if (document.getElementById('pwa-update-notification')) return;
      
      const notification = document.createElement('div');
      notification.id = 'pwa-update-notification';
      notification.style.cssText = \`
        position: fixed;
        top: 20px;
        right: 20px;
        left: 20px;
        max-width: 400px;
        margin: 0 auto;
        background: linear-gradient(135deg, ${aiPage.pwaThemeColor || '#000'}, ${aiPage.pwaBackgroundColor || '#fff'});
        color: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        padding: 16px;
        z-index: 1000000;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: slideDown 0.4s ease-out;
      \`;
      
      notification.innerHTML = \`
        <style>
          @keyframes slideDown {
            from { transform: translateY(-100px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes slideOut {
            to { transform: translateY(-100px); opacity: 0; }
          }
        </style>
        <div style="flex-shrink: 0; width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <svg style="width: 24px; height: 24px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </div>
        <div style="flex: 1; min-width: 0;">
          <h4 style="margin: 0 0 4px; font-size: 14px; font-weight: 600;">Nova versão disponível!</h4>
          <p style="margin: 0; font-size: 12px; opacity: 0.9;">Clique para atualizar e obter as últimas melhorias</p>
        </div>
        <button id="pwa-update-btn" style="flex-shrink: 0; background: white; color: ${aiPage.pwaThemeColor || '#000'}; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; transition: transform 0.2s;">
          Atualizar
        </button>
        <button id="pwa-update-dismiss" style="flex-shrink: 0; background: transparent; color: white; border: none; padding: 8px; cursor: pointer; font-size: 18px; opacity: 0.8; line-height: 1;">
          ✕
        </button>
      \`;
      
      document.body.appendChild(notification);
      
      // Hover effect no botão
      const updateBtn = notification.querySelector('#pwa-update-btn');
      updateBtn.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.05)';
      });
      updateBtn.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
      });
      
      // Atualizar ao clicar
      updateBtn.addEventListener('click', function() {
        newWorker.postMessage({ type: 'SKIP_WAITING' });
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(function() {
          window.location.reload();
        }, 300);
      });
      
      // Dispensar notificação
      const dismissBtn = notification.querySelector('#pwa-update-dismiss');
      dismissBtn.addEventListener('click', function() {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(function() {
          notification.remove();
        }, 300);
      });
      
      // Auto-dispensar após 10 segundos
      setTimeout(function() {
        if (document.getElementById('pwa-update-notification')) {
          notification.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(function() {
            notification.remove();
          }, 300);
        }
      }, 10000);
    }
    
    // ========================================
    // PWA Install Banner
    // ========================================
    const showInstallPrompt = ${aiPage.pwaShowInstallPrompt !== false};
    const pwaName = '${(aiPage.pwaName || aiPage.title).replace(/'/g, "\\'")}';
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    
    // Função para criar banner de instalação
    function createInstallBanner() {
      if (isStandalone || localStorage.getItem('pwa-install-dismissed')) return;
      
      const banner = document.createElement('div');
      banner.id = 'pwa-install-banner';
      banner.style.cssText = \`
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        max-width: 420px;
        margin: 0 auto;
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        padding: 20px;
        z-index: 999999;
        display: flex;
        align-items: start;
        gap: 16px;
        animation: slideUp 0.4s ease-out;
      \`;
      
      const pwaIcon = '${aiPage.pwaIconUrl || aiPage.faviconUrl || ''}';
      const iconHtml = pwaIcon 
        ? \`<img src="\${pwaIcon}" style="width: 48px; height: 48px; border-radius: 12px; object-fit: cover;" alt="App Icon" />\`
        : \`<div style="flex-shrink: 0; width: 48px; height: 48px; background: linear-gradient(135deg, ${aiPage.pwaThemeColor || '#000'}, ${aiPage.pwaBackgroundColor || '#fff'}); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
            <svg style="width: 28px; height: 28px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
          </div>\`;
      
      banner.innerHTML = \`
        <style>
          @keyframes slideUp {
            from { transform: translateY(100px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        </style>
        \${iconHtml}
        <div style="flex: 1;">
          <h3 style="margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #1a1a1a;">Instalar \${pwaName}</h3>
          <p style="margin: 0 0 12px; font-size: 14px; color: #666;">
            \${isIOS 
              ? 'Toque em <svg style="display: inline; width: 14px; height: 14px; vertical-align: text-bottom;" fill="currentColor" viewBox="0 0 24 24"><path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z"/></svg> e depois "Adicionar à Tela de Início"'
              : isLocalhost
                ? '⚠️ Localhost: Use o menu do navegador (⋮) → Instalar app'
                : 'Tenha acesso rápido e use offline'}
          </p>
          <div style="display: flex; gap: 8px;">
            \${!isIOS && !isLocalhost ? \`
              <button id="pwa-install-now" style="flex: 1; background: ${aiPage.pwaThemeColor || '#000'}; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 14px;">
                Instalar Agora
              </button>
            \` : ''}
            <button id="pwa-install-dismiss" style="\${!isIOS && !isLocalhost ? 'flex: 0;' : 'flex: 1;'} background: transparent; color: #666; border: 1px solid #ddd; padding: 10px 16px; border-radius: 8px; font-weight: 500; cursor: pointer; font-size: 14px;">
              \${isIOS || isLocalhost ? 'Entendi' : 'Agora não'}
            </button>
          </div>
        </div>
      \`;
      
      document.body.appendChild(banner);
      
      // Event listeners
      const dismissBtn = banner.querySelector('#pwa-install-dismiss');
      dismissBtn.addEventListener('click', function() {
        banner.remove();
        localStorage.setItem('pwa-install-dismissed', 'true');
      });
      
      if (!isIOS) {
        const installBtn = banner.querySelector('#pwa-install-now');
        if (installBtn) {
          installBtn.addEventListener('click', function() {
            console.log('🔘 PWA: Botão clicado');
            console.log('📱 PWA: deferredPrompt existe?', !!deferredPrompt);
            console.log('✅ PWA: __pwaPromptReady?', window.__pwaPromptReady);
            
            if (deferredPrompt) {
              console.log('✨ PWA: Chamando prompt() agora!');
              deferredPrompt.prompt();
              
              deferredPrompt.userChoice.then(function(choiceResult) {
                console.log('👤 PWA: Usuário decidiu:', choiceResult.outcome);
                
                if (choiceResult.outcome === 'accepted') {
                  console.log('✅ PWA: App instalado!');
                  localStorage.setItem('pwa-installed', 'true');
                } else {
                  console.log('❌ PWA: Instalação cancelada');
                  localStorage.setItem('pwa-install-dismissed', 'true');
                }
                
                banner.remove();
                deferredPrompt = null;
              }).catch(function(err) {
                console.error('💥 PWA: Erro no userChoice:', err);
                banner.remove();
              });
            } else {
              console.warn('⚠️ PWA: deferredPrompt é null!');
              console.log('⏳ PWA: Tentando aguardar evento...');
              
              // Mostrar feedback visual
              installBtn.textContent = 'Aguarde...';
              installBtn.disabled = true;
              
              // Aguardar até 3 segundos pelo evento
              let attempts = 0;
              const checkInterval = setInterval(function() {
                attempts++;
                console.log('🔍 PWA: Tentativa ' + attempts + '/15');
                
                if (deferredPrompt) {
                  console.log('✨ PWA: Evento capturado! Instalando...');
                  clearInterval(checkInterval);
                  deferredPrompt.prompt();
                  deferredPrompt.userChoice.then(function(choiceResult) {
                    if (choiceResult.outcome === 'accepted') {
                      localStorage.setItem('pwa-installed', 'true');
                    }
                    banner.remove();
                    deferredPrompt = null;
                  });
                } else if (attempts >= 15) {
                  console.error('❌ PWA: Evento não capturado após 3s');
                  clearInterval(checkInterval);
                  alert('Use o menu do navegador: ⋮ → Instalar app');
                  banner.remove();
                }
              }, 200);
            }
          });
        }
      }
    }
    
    // ========================================
    // Detectar beforeinstallprompt e mostrar banner
    // ========================================
    let hasBeforeInstallPrompt = false;
    let bannerTimeout = null;
    
    // Listener para detectar quando evento dispara
    window.addEventListener('beforeinstallprompt', function(e) {
      hasBeforeInstallPrompt = true;
      console.log('🎯 PWA: Evento detectado (listener secundário)');
      
      // Mostrar banner em 1s se ainda não foi mostrado
      if (showInstallPrompt && !document.getElementById('pwa-install-banner') && !isStandalone) {
        console.log('📱 PWA: Mostrando banner em 1s');
        if (bannerTimeout) clearTimeout(bannerTimeout);
        setTimeout(createInstallBanner, 1000);
      }
    });
    
    // Para iOS/Safari - mostrar banner sempre (iOS não tem beforeinstallprompt)
    if (isIOS && showInstallPrompt && !isStandalone) {
      console.log('PWA: Dispositivo iOS detectado, mostrando banner em 3s');
      setTimeout(createInstallBanner, 3000);
    }
    
    // Para Android/Chrome - mostrar banner SEMPRE se configurado (não depender apenas do beforeinstallprompt)
    // Alguns navegadores/situações não disparam beforeinstallprompt, então garantimos que o banner apareça
    if (!isIOS && showInstallPrompt && !isStandalone) {
      console.log('PWA: Dispositivo Android/Chrome detectado');
      console.log('PWA: Aguardando beforeinstallprompt por até 4s, depois mostra banner de qualquer forma');
      
      bannerTimeout = setTimeout(function() {
        if (!document.getElementById('pwa-install-banner')) {
          console.log('PWA: Mostrando banner (beforeinstallprompt=' + hasBeforeInstallPrompt + ')');
          createInstallBanner();
        }
      }, 4000);
    }
    
    // PWA Installed
    window.addEventListener('appinstalled', function() {
      console.log('PWA: App instalado com sucesso!');
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.remove();
    });
  </script>`;
    };

    // Generate custom CSS
    const generateCustomCSS = () => {
      let css = `
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }`;
      
      if (aiPage.customCss) {
        css += `\n    ${aiPage.customCss}`;
      }
      
      return css;
    };

    const metaTags = generateMetaTags();
    const pixelScripts = generatePixelScripts();
    const customCSS = generateCustomCSS();
    const pwaTags = generatePWATags();
    
    // Check if HTML already has complete structure
    let finalHtml = aiPage.htmlContent;
    
    if (!finalHtml.includes('<!DOCTYPE html>') || !finalHtml.includes('<html')) {
      // Wrap in complete HTML structure
      finalHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <script src="https://cdn.tailwindcss.com"></script>
  ${metaTags}
  ${pwaTags}
  <style>
${customCSS}
  </style>
  ${aiPage.customHead || ''}
</head>
<body>
  ${aiPage.customBody || ''}
  ${finalHtml}
  ${aiPage.customFooter || ''}
  ${pixelScripts}
  ${aiPage.pwaEnabled ? generatePWAScript(slug) : ''}
  ${injectAnalyticsScript(aiPage.id, 'AI_PAGE', aiPage.userId)}
</body>
</html>`;
    } else {
      // Add Tailwind CSS if not present
      if (!finalHtml.includes('tailwindcss.com')) {
        finalHtml = finalHtml.replace(
          '<head>',
          '<head>\n  <script src="https://cdn.tailwindcss.com"></script>'
        );
      }
      
      // Add meta tags if not present
      if (!finalHtml.includes('<meta name="description"')) {
        if (metaTags) {
          finalHtml = finalHtml.replace(
            '<head>',
            `<head>\n  ${metaTags}`
          );
        }
      }
      
      // Add PWA tags if enabled and not present
      if (aiPage.pwaEnabled && !finalHtml.includes('rel="manifest"')) {
        finalHtml = finalHtml.replace(
          '<head>',
          `<head>\n  ${pwaTags}`
        );
      }
      
      // Add pixels before </body>
      if (pixelScripts) {
        finalHtml = finalHtml.replace('</body>', `${pixelScripts}\n</body>`);
      }
      
      // Add PWA script before </body>
      if (aiPage.pwaEnabled) {
        finalHtml = finalHtml.replace('</body>', `${generatePWAScript(slug)}\n</body>`);
      }
      
      // Add Analytics script before </body>
      const analyticsScript = injectAnalyticsScript(aiPage.id, 'AI_PAGE', aiPage.userId);
      finalHtml = finalHtml.replace('</body>', `${analyticsScript}\n</body>`);
      
      // Add custom HTML
      if (aiPage.customHead) {
        finalHtml = finalHtml.replace('</head>', `${aiPage.customHead}\n</head>`);
      }
      if (aiPage.customBody) {
        finalHtml = finalHtml.replace('<body>', `<body>\n${aiPage.customBody}`);
      }
      if (aiPage.customFooter) {
        finalHtml = finalHtml.replace('</body>', `${aiPage.customFooter}\n</body>`);
      }
    }

    // Cachear HTML renderizado por 10 minutos (600 segundos)
    await cacheService.set(cacheKey, finalHtml, 600);
    console.log(`💾 SSR: Página '${slug}' armazenada no cache`);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Cache', 'MISS');
    res.send(finalHtml);

  } catch (error) {
    console.error("Error rendering page:", error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Erro interno</title>
      </head>
      <body>
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui;">
          <div style="text-align: center;">
            <h1 style="font-size: 2rem; margin-bottom: 1rem;">500 - Erro interno</h1>
            <p style="color: #666;">Ocorreu um erro ao carregar a página.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

// GET - Handle root domain access for custom domains
router.get('/', async (req: Request, res: Response) => {
  try {
    // Check if this is a custom domain request
    const customDomain = (req as any).customDomain;
    
    if (customDomain && customDomain.isRootDomain) {
      // Redirect to the "root" slug to handle root domain access
      return res.redirect(`/root`);
    }
    
    // If not a custom domain, return a default response
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Link AI</title>
      </head>
      <body>
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui;">
          <div style="text-align: center;">
            <h1 style="font-size: 2rem; margin-bottom: 1rem;">Link AI Microservice</h1>
            <p style="color: #666;">Acesse uma página específica através de seu slug.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Erro ao processar solicitação root:', error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Erro</title>
      </head>
      <body>
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui;">
          <div style="text-align: center;">
            <h1 style="font-size: 2rem; margin-bottom: 1rem;">500 - Erro interno</h1>
            <p style="color: #666;">Ocorreu um erro ao carregar a página.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

export default router;
