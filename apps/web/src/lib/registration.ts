/**
 * Regra da Fase 1: o registro é liberado apenas para o PRIMEIRO usuário.
 * Depois disso fica fechado, só reabrindo via variável de ambiente
 * (REGISTRATION_OPEN=true). Função pura para ser coberta por teste.
 */
export class RegistrationClosedError extends Error {
  constructor(message = 'Registro fechado: já existe um usuário cadastrado.') {
    super(message);
    this.name = 'RegistrationClosedError';
  }
}

/** Retorna true se um novo cadastro é permitido dado o estado atual. */
export function isRegistrationAllowed(userCount: number, registrationOpen: boolean): boolean {
  if (userCount <= 0) return true; // primeiro usuário sempre pode
  return registrationOpen; // demais só com a env aberta
}

/** Lança RegistrationClosedError quando o cadastro não é permitido. */
export function assertRegistrationAllowed(userCount: number, registrationOpen: boolean): void {
  if (!isRegistrationAllowed(userCount, registrationOpen)) {
    throw new RegistrationClosedError();
  }
}
