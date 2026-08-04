import { AUTH_SESSION_COOKIE } from './auth.constants';

/**
 * Lê um cookie do header `Cookie` sem depender de cookie-parser (mantém o Nest
 * leve). Retorna null se ausente.
 */
export function getCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

/** Extrai o token da sessão do cookie assinado (`<token>.<assinatura>`). */
export function sessionTokenFromCookie(cookieHeader: string | undefined): string | null {
  const raw = getCookie(cookieHeader, AUTH_SESSION_COOKIE);
  if (!raw) return null;
  const dot = raw.indexOf('.');
  return dot === -1 ? raw : raw.slice(0, dot);
}
