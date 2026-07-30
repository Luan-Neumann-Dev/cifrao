import { describe, expect, it } from 'vitest';
import {
  RegistrationClosedError,
  assertRegistrationAllowed,
  isRegistrationAllowed,
} from './registration';

describe('gate de registro (Fase 1)', () => {
  it('permite o primeiro usuário mesmo com registro fechado', () => {
    expect(isRegistrationAllowed(0, false)).toBe(true);
  });

  it('bloqueia o segundo usuário quando o registro está fechado', () => {
    expect(isRegistrationAllowed(1, false)).toBe(false);
  });

  it('permite novos usuários quando REGISTRATION_OPEN está ligado', () => {
    expect(isRegistrationAllowed(1, true)).toBe(true);
    expect(isRegistrationAllowed(5, true)).toBe(true);
  });

  it('assert lança RegistrationClosedError no cadastro bloqueado', () => {
    expect(() => assertRegistrationAllowed(1, false)).toThrow(RegistrationClosedError);
  });

  it('assert não lança para o primeiro usuário', () => {
    expect(() => assertRegistrationAllowed(0, false)).not.toThrow();
  });
});
