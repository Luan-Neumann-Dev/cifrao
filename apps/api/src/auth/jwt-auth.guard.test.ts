import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { type JWTVerifyGetKey, SignJWT, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { API_JWT_COOKIE } from './auth.constants';
import { getCookie } from './cookie';
import { JwtAuthGuard, extractToken } from './jwt-auth.guard';
import { JwtVerifier } from './jwt-verifier';

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

let pair: KeyPair;
let otherPair: KeyPair;
let getKey: JWTVerifyGetKey;

beforeAll(async () => {
  pair = await generateKeyPair('ES256');
  otherPair = await generateKeyPair('ES256');
  getKey = () => Promise.resolve(pair.publicKey);
});

async function sign(
  privateKey: KeyPair['privateKey'],
  claims: { sub?: string; email?: string; expSecondsFromNow?: number } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt(now)
    .setSubject(claims.sub ?? 'user_1')
    .setExpirationTime(now + (claims.expSecondsFromNow ?? 3600));
  return jwt.sign(privateKey);
}

function contextWith(headers: Record<string, string>): ExecutionContext {
  const req = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('getCookie', () => {
  it('lê o cookie certo entre vários', () => {
    const header = `foo=1; ${API_JWT_COOKIE}=abc.def.ghi; bar=2`;
    expect(getCookie(header, API_JWT_COOKIE)).toBe('abc.def.ghi');
  });

  it('retorna null quando ausente ou header vazio', () => {
    expect(getCookie('foo=1', API_JWT_COOKIE)).toBeNull();
    expect(getCookie(undefined, API_JWT_COOKIE)).toBeNull();
  });
});

describe('extractToken', () => {
  it('prioriza o header Authorization Bearer', () => {
    const token = extractToken({ headers: { authorization: 'Bearer xyz', cookie: 'a=b' } });
    expect(token).toBe('xyz');
  });

  it('cai para o cookie httpOnly', () => {
    const token = extractToken({ headers: { cookie: `${API_JWT_COOKIE}=cook.ie` } });
    expect(token).toBe('cook.ie');
  });

  it('retorna null sem credencial', () => {
    expect(extractToken({ headers: {} })).toBeNull();
  });
});

describe('JwtVerifier', () => {
  it('extrai id (sub) e email de um token válido', async () => {
    const verifier = new JwtVerifier(getKey);
    const token = await sign(pair.privateKey, { sub: 'user_42', email: 'eu@cifrao.app' });
    const user = await verifier.verify(token);
    expect(user).toEqual({ id: 'user_42', email: 'eu@cifrao.app' });
  });

  it('rejeita token sem sub', async () => {
    const verifier = new JwtVerifier(getKey);
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(pair.privateKey);
    await expect(verifier.verify(token)).rejects.toThrow();
  });
});

describe('JwtAuthGuard', () => {
  it('aceita JWT válido no cookie e preenche req.user', async () => {
    const guard = new JwtAuthGuard(new JwtVerifier(getKey));
    const token = await sign(pair.privateKey, { sub: 'user_1', email: 'eu@cifrao.app' });
    const ctx = contextWith({ cookie: `${API_JWT_COOKIE}=${token}` });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest<{ user?: { id: string; email?: string } }>();
    expect(req.user).toEqual({ id: 'user_1', email: 'eu@cifrao.app' });
  });

  it('aceita JWT válido como Bearer', async () => {
    const guard = new JwtAuthGuard(new JwtVerifier(getKey));
    const token = await sign(pair.privateKey, { sub: 'user_1' });
    const ctx = contextWith({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('bloqueia quando não há token', async () => {
    const guard = new JwtAuthGuard(new JwtVerifier(getKey));
    await expect(guard.canActivate(contextWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bloqueia assinatura inválida (chave diferente)', async () => {
    const guard = new JwtAuthGuard(new JwtVerifier(getKey));
    const token = await sign(otherPair.privateKey, { sub: 'user_1' });
    const ctx = contextWith({ cookie: `${API_JWT_COOKIE}=${token}` });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bloqueia token expirado', async () => {
    const guard = new JwtAuthGuard(new JwtVerifier(getKey));
    const token = await sign(pair.privateKey, { sub: 'user_1', expSecondsFromNow: -60 });
    const ctx = contextWith({ cookie: `${API_JWT_COOKIE}=${token}` });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
