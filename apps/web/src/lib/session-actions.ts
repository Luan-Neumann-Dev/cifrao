'use server';

import { cookies, headers } from 'next/headers';
import { API_JWT_COOKIE } from './api-jwt';
import { auth } from './auth';

/**
 * Sincroniza um JWT (emitido pelo Better Auth) num cookie httpOnly. O cookie é
 * encaminhado ao Nest pelo proxy /api/*, onde é validado via JWKS. Chamado após
 * login/2FA e no carregamento da área autenticada para manter o token fresco.
 */
export async function syncApiToken(): Promise<{ ok: boolean }> {
  const h = await headers();
  const store = await cookies();

  const session = await auth.api.getSession({ headers: h });
  if (!session) {
    store.delete(API_JWT_COOKIE);
    return { ok: false };
  }

  const result = await auth.api.getToken({ headers: h });
  const token = result?.token;
  if (!token) return { ok: false };

  store.set(API_JWT_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return { ok: true };
}

/** Remove o cookie do JWT (usado no logout). */
export async function clearApiToken(): Promise<void> {
  const store = await cookies();
  store.delete(API_JWT_COOKIE);
}
