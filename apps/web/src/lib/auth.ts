import { prisma } from '@cifrao/db';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { jwt, twoFactor } from 'better-auth/plugins';
import {
  AUTH_RATE_DEFAULT,
  AUTH_RATE_RULES,
  parseTrustedProxies,
  rateLimitEnabled,
} from './rate-limit';
import { isRegistrationAllowed } from './registration';

/**
 * Instância do Better Auth (roda no Next). Fonte de verdade da autenticação:
 * email/senha + TOTP 2FA + códigos de recuperação. O Nest apenas valida o JWT
 * emitido aqui (via JWKS), conforme decidido para a Fase 1.
 *
 * Colisão de nomes resolvida: o model de credenciais do Better Auth é mapeado
 * para `AuthAccount`, deixando `Account` livre para a conta bancária da Seção 6
 * (Fase 2). O `Session` do Better Auth cobre o "Session" da Seção 6.
 */
const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

// Regra da Fase 1: registro liberado só para o primeiro usuário; depois disso,
// fechado — reabrível apenas via variável de ambiente.
const registrationOpen = process.env.REGISTRATION_OPEN === 'true';

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: [baseURL],
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Sem provedor de e-mail definido no stack ainda: em dev, logamos o link.
    // A entrega real de e-mail fica pendente de decisão (ver PROGRESS.md).
    sendResetPassword: async ({ user, url }) => {
      console.log(`[cifrao-auth] reset de senha para ${user.email}: ${url}`);
    },
  },
  user: {
    // Campos de domínio do User (Seção 6) que sobrevivem ao schema do Better Auth.
    additionalFields: {
      theme: { type: 'string', required: false, defaultValue: 'system', input: true },
      accentColor: { type: 'string', required: false, defaultValue: '#820AD1', input: true },
    },
  },
  account: {
    // Evita colidir com o model `Account` (conta bancária) da Seção 6.
    // Nome em camelCase para casar com o delegate do Prisma (`prisma.authAccount`).
    modelName: 'authAccount',
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 dias
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Limite de tentativa nas rotas de autenticação (ver ./rate-limit.ts para o
  // porquê dos números e para a armadilha do IP atrás de proxy).
  rateLimit: {
    enabled: rateLimitEnabled(process.env.AUTH_RATE_LIMIT),
    ...AUTH_RATE_DEFAULT,
    customRules: AUTH_RATE_RULES,
    // Memória: basta para a instância única do alvo de deploy. Se um dia houver
    // réplica, cada uma teria seu próprio balde — aí vale `storage: 'database'`
    // (que exige um model `rateLimit` no schema).
    storage: 'memory',
  },
  advanced: {
    cookiePrefix: 'cifrao',
    defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
    ipAddress: {
      // Sem isto, atrás de proxy, um `X-Forwarded-For` falsificado derruba a
      // resolução do IP e o limite passa a valer para todos juntos.
      trustedProxies: parseTrustedProxies(process.env.TRUSTED_PROXIES),
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const count = await prisma.user.count();
          if (!isRegistrationAllowed(count, registrationOpen)) {
            throw new APIError('FORBIDDEN', {
              message: 'Registro fechado: já existe um usuário cadastrado.',
            });
          }
          return { data: user };
        },
      },
    },
  },
  plugins: [
    twoFactor({ issuer: 'Cifrão' }),
    jwt({
      jwt: {
        expirationTime: '7d',
        definePayload: ({ user }) => ({ email: user.email }),
      },
    }),
  ],
});
