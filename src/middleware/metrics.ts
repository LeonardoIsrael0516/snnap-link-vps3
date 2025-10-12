import { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDuration } from '../services/metricsService';

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Capturar quando a resposta for enviada
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Converter para segundos
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const status = res.statusCode.toString();

    // Incrementar contador de requisições
    httpRequestsTotal.inc({
      method,
      route,
      status,
    });

    // Registrar duração da requisição
    httpRequestDuration.observe(
      {
        method,
        route,
        status,
      },
      duration
    );
  });

  next();
};







