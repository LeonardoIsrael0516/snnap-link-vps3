// Script de analytics para o frontend
// Este arquivo será injetado nas páginas para coletar dados do cliente

export const analyticsScript = `
<script>
(function() {
  'use strict';
  
  // Configuração
  const ANALYTICS_ENDPOINT = '/api/analytics/track';
  const PAGE_ID = '{{PAGE_ID}}';
  const PAGE_TYPE = '{{PAGE_TYPE}}';
  const USER_ID = '{{USER_ID}}';
  
  // Detectar informações do dispositivo e navegador
  function detectDevice() {
    const ua = navigator.userAgent;
    const isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isTablet = /iPad|Android(?!.*Mobile)|Tablet/i.test(ua);
    const isDesktop = !isMobile && !isTablet;
    
    return {
      device: isMobile ? 'mobile' : (isTablet ? 'tablet' : 'desktop'),
      isMobile,
      isTablet,
      isDesktop
    };
  }
  
  function detectOS() {
    const ua = navigator.userAgent;
    let os = 'Unknown';
    let osVersion = '';
    
    if (/Windows NT 10/i.test(ua)) { os = 'Windows'; osVersion = '10'; }
    else if (/Windows NT 11/i.test(ua)) { os = 'Windows'; osVersion = '11'; }
    else if (/Windows/i.test(ua)) { os = 'Windows'; }
    else if (/Mac OS X ([\\d._]+)/i.test(ua)) { 
      os = 'macOS'; 
      osVersion = RegExp.$1.replace(/_/g, '.');
    }
    else if (/iPhone OS ([\\d_]+)/i.test(ua)) { 
      os = 'iOS'; 
      osVersion = RegExp.$1.replace(/_/g, '.');
    }
    else if (/Android ([\\d.]+)/i.test(ua)) { 
      os = 'Android'; 
      osVersion = RegExp.$1;
    }
    else if (/Linux/i.test(ua)) { os = 'Linux'; }
    
    return { os, osVersion };
  }
  
  function detectBrowser() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let browserVersion = '';
    
    if (/Edg\\/([\\d.]+)/i.test(ua)) { 
      browser = 'Edge'; 
      browserVersion = RegExp.$1;
    }
    else if (/Chrome\\/([\\d.]+)/i.test(ua) && !/Edg/i.test(ua)) { 
      browser = 'Chrome'; 
      browserVersion = RegExp.$1;
    }
    else if (/Safari\\/([\\d.]+)/i.test(ua) && !/Chrome/i.test(ua)) { 
      browser = 'Safari'; 
      browserVersion = RegExp.$1;
    }
    else if (/Firefox\\/([\\d.]+)/i.test(ua)) { 
      browser = 'Firefox'; 
      browserVersion = RegExp.$1;
    }
    
    return { browser, browserVersion };
  }
  
  function getReferrerDomain() {
    if (!document.referrer) return null;
    try {
      const url = new URL(document.referrer);
      return url.hostname;
    } catch {
      return null;
    }
  }
  
  function getUTMParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get('utm_source'),
      utmMedium: params.get('utm_medium'),
      utmCampaign: params.get('utm_campaign'),
      utmTerm: params.get('utm_term'),
      utmContent: params.get('utm_content')
    };
  }
  
  // Gerar IDs únicos
  function generateVisitorId() {
    const ua = navigator.userAgent;
    const screen = window.screen.width + 'x' + window.screen.height;
    const str = ua + screen;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'v_' + Math.abs(hash).toString(36);
  }
  
  function generateSessionId() {
    return 's_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  const deviceInfo = detectDevice();
  const osInfo = detectOS();
  const browserInfo = detectBrowser();
  const utmParams = getUTMParams();
  
  // Dados coletados
  let analyticsData = {
    pageId: PAGE_ID,
    pageType: PAGE_TYPE,
    userId: USER_ID,
    
    // IDs
    sessionId: generateSessionId(),
    visitorId: generateVisitorId(),
    
    // Tela e viewport
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio || 1,
    
    // Dispositivo
    device: deviceInfo.device,
    isMobile: deviceInfo.isMobile,
    isTablet: deviceInfo.isTablet,
    isDesktop: deviceInfo.isDesktop,
    
    // Sistema operacional
    os: osInfo.os,
    osVersion: osInfo.osVersion,
    
    // Navegador
    browser: browserInfo.browser,
    browserVersion: browserInfo.browserVersion,
    
    // Idioma
    language: navigator.language || navigator.userLanguage,
    
    // Referrer
    referrer: document.referrer || null,
    referrerDomain: getReferrerDomain(),
    
    // UTM params
    utmSource: utmParams.utmSource,
    utmMedium: utmParams.utmMedium,
    utmCampaign: utmParams.utmCampaign,
    utmTerm: utmParams.utmTerm,
    utmContent: utmParams.utmContent,
    
    // Tempo
    pageLoadTime: 0,
    
    // User Agent
    userAgent: navigator.userAgent,
    
    // Navegação
    previousPage: document.referrer || null
  };
  
  // Função para enviar analytics
  function sendAnalytics(data) {
    try {
      fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      }).catch(error => {
        console.warn('Erro ao enviar analytics:', error);
      });
    } catch (error) {
      console.warn('Erro ao enviar analytics:', error);
    }
  }
  
  // Flag para garantir que enviamos apenas uma vez
  let analyticsSent = false;
  const pageStartTime = Date.now();
  
  // Coletar dados quando a página carregar
  window.addEventListener('load', function() {
    if (analyticsSent) return;
    
    // Calcular tempo de carregamento (em milissegundos desde o início da página)
    analyticsData.pageLoadTime = Date.now() - pageStartTime;
    
    // Garantir que o valor não seja negativo ou muito grande
    if (analyticsData.pageLoadTime < 0 || analyticsData.pageLoadTime > 60000) {
      analyticsData.pageLoadTime = 0;
    }
    
    // Enviar dados apenas uma vez
    sendAnalytics(analyticsData);
    analyticsSent = true;
  });
  
  console.log('📊 Analytics inicializado para', PAGE_TYPE, PAGE_ID);
})();
</script>
`;

// Função para injetar o script nas páginas
export function injectAnalyticsScript(
  pageId: string,
  pageType: 'AI_PAGE' | 'BIOLINK' | 'SHORTLINK',
  userId?: string
): string {
  return analyticsScript
    .replace('{{PAGE_ID}}', pageId)
    .replace('{{PAGE_TYPE}}', pageType)
    .replace('{{USER_ID}}', userId || '');
}
