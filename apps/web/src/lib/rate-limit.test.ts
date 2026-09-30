import { describe, expect, it } from 'vitest';
import {
  AUTH_RATE_DEFAULT,
  AUTH_RATE_RULES,
  parseTrustedProxies,
  rateLimitEnabled,
} from './rate-limit';

/**
 * O que precisa estar provado aqui não é "existe um limite", e sim que ele é
 * mais apertado que o padrão do Better Auth (100 req/10s, que dá 600 tentativas
 * de senha por minuto) nas rotas onde a tentativa repetida é sinal de ataque.
 */
describe('limites das rotas de autenticação', () => {
  /** Tentativas por minuto que a regra permite — a medida que interessa. */
  const porMinuto = (rota: string) => {
    const rule = AUTH_RATE_RULES[rota];
    return (rule.max / rule.window) * 60;
  };

  it('cobre cadastro e login, que foi o pedido', () => {
    expect(AUTH_RATE_RULES['/sign-in/email']).toBeDefined();
    expect(AUTH_RATE_RULES['/sign-up/email']).toBeDefined();
  });

  it('cobre a verificação de 2FA — de nada serve travar a porta e deixar a janela', () => {
    expect(AUTH_RATE_RULES['/two-factor/verify-totp']).toBeDefined();
    expect(AUTH_RATE_RULES['/two-factor/verify-otp']).toBeDefined();
    expect(AUTH_RATE_RULES['/two-factor/verify-backup-code']).toBeDefined();
  });

  it('é drasticamente mais apertado que o padrão do Better Auth', () => {
    const padraoPorMinuto = (AUTH_RATE_DEFAULT.max / AUTH_RATE_DEFAULT.window) * 60; // 600
    for (const rota of Object.keys(AUTH_RATE_RULES)) {
      expect(porMinuto(rota)).toBeLessThan(padraoPorMinuto / 100);
    }
  });

  it('TOTP tolera no máximo 1 tentativa por minuto — 6 dígitos não podem ser varridos', () => {
    expect(porMinuto('/two-factor/verify-totp')).toBeLessThanOrEqual(1);
  });

  it('cadastro é mais restrito que login: volume legítimo é muito menor', () => {
    expect(porMinuto('/sign-up/email')).toBeLessThan(porMinuto('/sign-in/email'));
  });

  it('o padrão global segue folgado — é onde mora o get-session de cada navegação', () => {
    expect(AUTH_RATE_DEFAULT.max).toBeGreaterThanOrEqual(100);
  });

  it('login ainda deixa errar a senha algumas vezes antes de travar', () => {
    expect(AUTH_RATE_RULES['/sign-in/email'].max).toBeGreaterThanOrEqual(5);
  });
});

describe('TRUSTED_PROXIES', () => {
  it('sem a variável, lista vazia — o caso seguro', () => {
    expect(parseTrustedProxies(undefined)).toEqual([]);
    expect(parseTrustedProxies('')).toEqual([]);
  });

  it('separa por vírgula e tira espaço em volta', () => {
    expect(parseTrustedProxies('172.16.0.0/12, 10.0.0.0/8')).toEqual([
      '172.16.0.0/12',
      '10.0.0.0/8',
    ]);
  });

  it('descarta entrada vazia em vez de passar string em branco adiante', () => {
    expect(parseTrustedProxies('172.16.0.0/12, ,')).toEqual(['172.16.0.0/12']);
  });
});

describe('AUTH_RATE_LIMIT', () => {
  it('ligado por padrão, inclusive em dev — limite que não roda em dev ninguém testa', () => {
    expect(rateLimitEnabled(undefined)).toBe(true);
    expect(rateLimitEnabled('true')).toBe(true);
  });

  it('só a string "false" desliga', () => {
    expect(rateLimitEnabled('false')).toBe(false);
    expect(rateLimitEnabled('0')).toBe(true);
  });
});
