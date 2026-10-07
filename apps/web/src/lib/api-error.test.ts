import { describe, expect, it } from 'vitest';
import { messageFromApiError } from './api-error';

describe('mensagem de erro da API', () => {
  it('diz qual campo faltou, em vez de "Dados inválidos"', () => {
    // Payload real que reprovou: transferência com destino em branco.
    const message = messageFromApiError(400, {
      message: 'Dados inválidos',
      issues: [
        {
          code: 'too_small',
          path: ['toAccountId'],
          message: 'String must contain at least 1 character(s)',
        },
      ],
    });
    expect(message).toBe('Conta de destino: obrigatório');
  });

  it('preserva a mensagem quando o Zod já explica a regra', () => {
    const message = messageFromApiError(400, {
      message: 'Dados inválidos',
      issues: [
        {
          code: 'custom',
          path: ['toAccountId'],
          message: 'A conta de origem e destino devem ser diferentes.',
        },
      ],
    });
    expect(message).toBe('Conta de destino: A conta de origem e destino devem ser diferentes.');
  });

  it('junta várias issues e corta a partir da quarta', () => {
    const issues = ['amountCents', 'date', 'description', 'accountId'].map((path) => ({
      code: 'invalid_type',
      path: [path],
      message: 'Required',
    }));
    const message = messageFromApiError(400, { message: 'Dados inválidos', issues });
    expect(message).toBe('Valor: Required · Data: Required · Descrição: Required · e mais 1');
  });

  it('campo sem tradução usa o próprio nome', () => {
    const message = messageFromApiError(400, {
      issues: [{ code: 'invalid_type', path: ['campoNovo'], message: 'Required' }],
    });
    expect(message).toBe('campoNovo: Required');
  });

  it('usa a mensagem simples quando não há issues', () => {
    expect(messageFromApiError(404, { message: 'Conta não encontrada' })).toBe(
      'Conta não encontrada',
    );
  });

  it('sem corpo legível, sobra o status', () => {
    expect(messageFromApiError(500, null)).toBe('Erro 500');
  });
});
