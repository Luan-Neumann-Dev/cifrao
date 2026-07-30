import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AuthUser {
  id: string;
  email?: string;
}

/**
 * Verifica o JWT emitido pelo Better Auth usando JWKS. O resolvedor de chave é
 * injetável para permitir testes com uma chave local (sem rede).
 */
export class JwtVerifier {
  private readonly getKey: JWTVerifyGetKey;

  constructor(getKey: JWTVerifyGetKey) {
    this.getKey = getKey;
  }

  /** Constrói um verificador que busca as chaves públicas do endpoint JWKS. */
  static fromJwksUrl(jwksUrl: string): JwtVerifier {
    return new JwtVerifier(createRemoteJWKSet(new URL(jwksUrl)));
  }

  async verify(token: string): Promise<AuthUser> {
    const { payload } = await jwtVerify(token, this.getKey);
    if (!payload.sub) {
      throw new Error('JWT sem "sub"');
    }
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    return { id: payload.sub, email };
  }
}
