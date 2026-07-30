import { Module } from '@nestjs/common';
import { JWKS_PATH } from './auth.constants';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtVerifier } from './jwt-verifier';

/**
 * Provê o verificador de JWT (JWKS do Better Auth) e o guard. O Nest não fala
 * com o banco na Fase 1: a identidade vem do próprio JWT.
 */
@Module({
  providers: [
    {
      provide: JwtVerifier,
      useFactory: (): JwtVerifier => {
        const base = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
        return JwtVerifier.fromJwksUrl(`${base}${JWKS_PATH}`);
      },
    },
    JwtAuthGuard,
  ],
  exports: [JwtVerifier, JwtAuthGuard],
})
export class AuthModule {}
