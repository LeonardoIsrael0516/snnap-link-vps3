import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export const verifyJWT = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  console.log('🔑 Auth header:', authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ Token de autorização não fornecido');
    return res.status(401).json({ error: 'Token de autorização não fornecido' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  console.log('🔑 Token:', token.substring(0, 20) + '...');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
    console.log('🔑 Token decodificado:', decoded);
    req.user = {
      userId: decoded.sub || decoded.userId,
      email: decoded.email,
      role: decoded.role || 'USER'
    };
    console.log('🔑 User:', req.user);
    next();
  } catch (error) {
    console.log('❌ Erro na verificação do token:', error);
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  next();
};

