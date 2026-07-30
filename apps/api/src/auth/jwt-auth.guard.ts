import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { API_JWT_COOKIE } from './auth.constants';
import { getCookie } from './cookie';
import type { AuthUser } from './jwt-verifier';
import { JwtVerifier } from './jwt-verifier';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/** Extrai o token do header Authorization (Bearer) ou do cookie httpOnly. */
export function extractToken(req: {
  headers: { authorization?: string; cookie?: string };
}): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim() || null;
  }
  return getCookie(req.headers.cookie, API_JWT_COOKIE);
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly verifier: JwtVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractToken(req);
    if (!token) {
      throw new UnauthorizedException('Autenticação ausente');
    }
    try {
      req.user = await this.verifier.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}
