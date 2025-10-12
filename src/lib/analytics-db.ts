import { PrismaClient } from '@prisma/client';

// Cliente Prisma específico para analytics
const analyticsPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://postgres:12345678@localhost:5432/link_ai?schema=public"
    }
  }
});

// Tipos para analytics
export interface AnalyticsData {
  pageId: string;
  pageType: 'AI_PAGE' | 'BIOLINK' | 'SHORTLINK';
  userId?: string;
  sessionId?: string;
  visitorId?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  device?: string;
  deviceType?: string;
  os?: string;
  osVersion?: string;
  browser?: string;
  browserVersion?: string;
  language?: string;
  referrer?: string;
  referrerDomain?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  screenWidth?: number;
  screenHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  colorDepth?: number;
  pixelRatio?: number;
  isNewSession?: boolean;
  isNewVisitor?: boolean;
  sessionDuration?: number;
  pageLoadTime?: number;
  previousPage?: string;
  nextPage?: string;
  exitPage?: boolean;
  bounce?: boolean;
  userAgent?: string;
  ipAddress?: string;
  isBot?: boolean;
  isMobile?: boolean;
  isTablet?: boolean;
  isDesktop?: boolean;
}

// Função para processar e salvar dados de analytics
export async function saveAnalyticsData(data: AnalyticsData): Promise<void> {
  try {
    // Usar SQL direto para evitar problemas de schema
    await analyticsPrisma.$executeRaw`
      INSERT INTO page_views (
        id, "pageId", "pageType", "userId", "sessionId", "visitorId",
        country, "countryCode", region, city, timezone, latitude, longitude,
        device, "deviceType", os, "osVersion", browser, "browserVersion", language,
        referrer, "referrerDomain", "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent",
        "screenWidth", "screenHeight", "viewportWidth", "viewportHeight", "colorDepth", "pixelRatio",
        "isNewSession", "isNewVisitor", "sessionDuration", "pageLoadTime", "previousPage", "nextPage",
        "exitPage", bounce, "userAgent", "ipAddress", "isBot", "isMobile", "isTablet", "isDesktop",
        "createdAt"
      ) VALUES (
        gen_random_uuid(), ${data.pageId}, ${data.pageType}::"PageType", ${data.userId || null}, ${data.sessionId || null}, ${data.visitorId || null},
        ${data.country || null}, ${data.countryCode || null}, ${data.region || null}, ${data.city || null}, ${data.timezone || null}, ${data.latitude || null}, ${data.longitude || null},
        ${data.device || null}, ${data.deviceType || null}, ${data.os || null}, ${data.osVersion || null}, ${data.browser || null}, ${data.browserVersion || null}, ${data.language || null},
        ${data.referrer || null}, ${data.referrerDomain || null}, ${data.utmSource || null}, ${data.utmMedium || null}, ${data.utmCampaign || null}, ${data.utmTerm || null}, ${data.utmContent || null},
        ${data.screenWidth || null}, ${data.screenHeight || null}, ${data.viewportWidth || null}, ${data.viewportHeight || null}, ${data.colorDepth || null}, ${data.pixelRatio || null},
        ${data.isNewSession ?? true}, ${data.isNewVisitor ?? true}, ${data.sessionDuration || null}, ${data.pageLoadTime || null}, ${data.previousPage || null}, ${data.nextPage || null},
        ${data.exitPage ?? false}, ${data.bounce ?? false}, ${data.userAgent || null}, ${data.ipAddress || null}, ${data.isBot ?? false}, ${data.isMobile ?? false}, ${data.isTablet ?? false}, ${data.isDesktop ?? false},
        NOW()
      )
    `;
  } catch (error) {
    console.error('[Analytics] Erro ao salvar dados:', error);
    // Não falhar a requisição se analytics falhar
  }
}

// Função para obter estatísticas de uma página
export async function getPageStats(
  pageId: string,
  pageType: 'AI_PAGE' | 'BIOLINK' | 'SHORTLINK',
  dateFrom?: Date,
  dateTo?: Date
) {
  try {
    // Construir filtro de data
    const dateFilter = dateFrom && dateTo 
      ? `AND "createdAt" BETWEEN '${dateFrom.toISOString()}' AND '${dateTo.toISOString()}'`
      : '';

    // Obter overview
    const overview: any = await analyticsPrisma.$queryRaw`
      SELECT 
        COUNT(*)::int as "totalViews",
        COUNT(DISTINCT "visitorId")::int as "uniqueVisitors",
        COUNT(DISTINCT "sessionId")::int as "uniqueSessions",
        COALESCE(AVG(CASE WHEN "sessionDuration" > 0 THEN "sessionDuration" END)::int, 0) as "avgSessionDuration",
        COALESCE((COUNT(CASE WHEN "bounce" = true THEN 1 END)::float / NULLIF(COUNT(*)::float, 0) * 100)::int, 0) as "bounceRate"
      FROM page_views
      WHERE "pageId" = ${pageId} AND "pageType" = ${pageType}::"PageType"
    `;

    // Top países
    const topCountries: any = await analyticsPrisma.$queryRaw`
      SELECT country, COUNT(*)::int as count
      FROM page_views
      WHERE "pageId" = ${pageId} AND "pageType" = ${pageType}::"PageType" AND country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `;

    // Top cidades
    const topCities: any = await analyticsPrisma.$queryRaw`
      SELECT city, country, COUNT(*)::int as count
      FROM page_views
      WHERE "pageId" = ${pageId} AND "pageType" = ${pageType}::"PageType" AND city IS NOT NULL
      GROUP BY city, country
      ORDER BY count DESC
      LIMIT 10
    `;

    // Top dispositivos
    const topDevices: any = await analyticsPrisma.$queryRaw`
      SELECT device, COUNT(*)::int as count
      FROM page_views
      WHERE "pageId" = ${pageId} AND "pageType" = ${pageType}::"PageType" AND device IS NOT NULL
      GROUP BY device
      ORDER BY count DESC
      LIMIT 10
    `;

    // Top sistemas operacionais
    const topOS: any = await analyticsPrisma.$queryRaw`
      SELECT os, COUNT(*)::int as count
      FROM page_views
      WHERE "pageId" = ${pageId} AND "pageType" = ${pageType}::"PageType" AND os IS NOT NULL
      GROUP BY os
      ORDER BY count DESC
      LIMIT 10
    `;

    // Top navegadores
    const topBrowsers: any = await analyticsPrisma.$queryRaw`
      SELECT browser, COUNT(*)::int as count
      FROM page_views
      WHERE "pageId" = ${pageId} AND "pageType" = ${pageType}::"PageType" AND browser IS NOT NULL
      GROUP BY browser
      ORDER BY count DESC
      LIMIT 10
    `;

    // Top referrers
    const topReferrers: any = await analyticsPrisma.$queryRaw`
      SELECT "referrerDomain", COUNT(*)::int as count
      FROM page_views
      WHERE "pageId" = ${pageId} AND "pageType" = ${pageType}::"PageType" AND "referrerDomain" IS NOT NULL
      GROUP BY "referrerDomain"
      ORDER BY count DESC
      LIMIT 10
    `;

    // Top idiomas
    const topLanguages: any = await analyticsPrisma.$queryRaw`
      SELECT language, COUNT(*)::int as count
      FROM page_views
      WHERE "pageId" = ${pageId} AND "pageType" = ${pageType}::"PageType" AND language IS NOT NULL
      GROUP BY language
      ORDER BY count DESC
      LIMIT 10
    `;

    // Top UTM sources
    const topUTMSources: any = await analyticsPrisma.$queryRaw`
      SELECT "utmSource", COUNT(*)::int as count
      FROM page_views
      WHERE "pageId" = ${pageId} AND "pageType" = ${pageType}::"PageType" AND "utmSource" IS NOT NULL
      GROUP BY "utmSource"
      ORDER BY count DESC
      LIMIT 10
    `;

    // Visualizações diárias (últimos 30 dias)
    const dailyViews: any = await analyticsPrisma.$queryRaw`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*)::int as count
      FROM page_views
      WHERE "pageId" = ${pageId} AND "pageType" = ${pageType}::"PageType"
        AND "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;

    // Visualizações recentes
    const recentViews: any = await analyticsPrisma.$queryRaw`
      SELECT 
        id,
        country,
        city,
        device,
        os,
        browser,
        "referrerDomain",
        "createdAt"
      FROM page_views
      WHERE "pageId" = ${pageId} AND "pageType" = ${pageType}::"PageType"
      ORDER BY "createdAt" DESC
      LIMIT 100
    `;

    return {
      overview: overview[0] || {
        totalViews: 0,
        uniqueVisitors: 0,
        uniqueSessions: 0,
        bounceRate: 0,
        avgSessionDuration: 0
      },
      topCountries: topCountries || [],
      topCities: topCities || [],
      topDevices: topDevices || [],
      topOS: topOS || [],
      topBrowsers: topBrowsers || [],
      topReferrers: topReferrers || [],
      topLanguages: topLanguages || [],
      topUTMSources: topUTMSources || [],
      dailyViews: dailyViews || [],
      recentViews: recentViews || []
    };
  } catch (error) {
    console.error('[Analytics] Erro ao buscar estatísticas:', error);
    // Retornar dados vazios em caso de erro
    return {
      overview: {
        totalViews: 0,
        uniqueVisitors: 0,
        uniqueSessions: 0,
        bounceRate: 0,
        avgSessionDuration: 0
      },
      topCountries: [],
      topCities: [],
      topDevices: [],
      topOS: [],
      topBrowsers: [],
      topReferrers: [],
      topLanguages: [],
      topUTMSources: [],
      dailyViews: [],
      recentViews: []
    };
  }
}
