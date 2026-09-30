import { describe, expect, it } from 'vitest';
import { authErrorMessage, formatRetryAfter } from './auth-error';

describe('mensagem de erro de autenticação', () => {
  it('traduz o 429 — a resposta do limitador vem em inglês', () => {
    const msg = authErrorMessage(
      { status: 429, message: 'Too many requests. Please try again later.' },
      'Não foi possível entrar.',
    );
    expect(msg).not.toMatch(/too many|try again later/i);
    expect(msg).toMatch(/muitas tentativas/i);
  });

  it('diz quanto esperar quando o X-Retry-After veio junto', () => {
    expect(authErrorMessage({ status: 429 }, 'x', 274)).toBe(
      'Muitas tentativas. Tente de novo em 5 minutos.',
    );
  });

  it('sem o X-Retry-After, orienta sem inventar prazo', () => {
    expect(authErrorMessage({ status: 429 }, 'x')).toMatch(/aguarde alguns minutos/i);
  });

  it('erro comum continua mostrando a mensagem do servidor', () => {
    expect(authErrorMessage({ status: 401, message: 'Credenciais inválidas' }, 'padrão')).toBe(
      'Credenciais inválidas',
    );
  });

  it('sem mensagem e sem erro, cai no texto padrão da tela', () => {
    expect(authErrorMessage({ status: 500 }, 'padrão')).toBe('padrão');
    expect(authErrorMessage(null, 'padrão')).toBe('padrão');
  });
});

describe('formatRetryAfter', () => {
  it('abaixo de um minuto, fala em segundos', () => {
    expect(formatRetryAfter(40)).toBe('em 40 segundos');
  });

  it('arredonda para cima — dizer menos do que falta frustra de novo', () => {
    expect(formatRetryAfter(61)).toBe('em 2 minutos');
    expect(formatRetryAfter(60)).toBe('em 1 minuto');
  });

  it('valor ausente ou inválido não vira texto', () => {
    expect(formatRetryAfter(null)).toBeNull();
    expect(formatRetryAfter(0)).toBeNull();
    expect(formatRetryAfter(Number.NaN)).toBeNull();
  });
});
