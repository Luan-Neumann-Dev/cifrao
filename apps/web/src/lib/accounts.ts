import type { AccountType } from '@cifrao/shared';

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  WALLET: 'Carteira física',
  INVESTMENT: 'Corretora',
};

/**
 * Cor do quadradinho ao lado do tipo, na lista. Corretora usa o token de
 * investimento e carteira o de positivo — é o que separa "dinheiro parado no
 * banco" de "dinheiro na mão" e de "dinheiro aplicado" batendo o olho.
 */
export function accountTypeColor(type: AccountType): string {
  if (type === 'INVESTMENT') return 'var(--invest)';
  if (type === 'WALLET') return 'var(--positive)';
  return 'var(--primary)';
}

/** Cor do saldo: negativo grita, corretora se distingue, o resto é texto normal. */
export function accountBalanceColor(type: AccountType, cents: string | number): string {
  if (Number(cents) < 0) return 'var(--negative)';
  if (type === 'INVESTMENT') return 'var(--invest)';
  return 'var(--ink)';
}

/**
 * Inicial do quadrado colorido da conta. Carteira vira "$" (não tem banco por
 * trás); o resto usa a primeira letra do nome, ignorando pontuação — "Nubank ·
 * Conta" vira "N".
 */
export function accountMark(name: string, type: AccountType): string {
  if (type === 'WALLET') return '$';
  const letter = name.match(/\p{L}|\p{N}/u)?.[0];
  return letter ? letter.toUpperCase() : '$';
}

export interface AdjustmentPreview {
  /** Diferença em centavos: positivo entra, negativo sai. */
  diffCents: number;
  /** Sem diferença não há o que lançar (regra 5.8). */
  none: boolean;
  color: string;
  soft: string;
  note: string;
  buttonLabel: string;
}

/**
 * Prévia do ajuste de saldo (regra 5.8) mostrada antes de confirmar: o usuário
 * vê o lançamento que vai nascer da diferença, com sinal e cor, em vez de
 * descobrir depois no extrato.
 */
export function adjustmentPreview(
  appBalanceCents: string | number,
  realBalanceCents: number | null,
): AdjustmentPreview {
  const diffCents = realBalanceCents === null ? 0 : realBalanceCents - Number(appBalanceCents);
  const none = realBalanceCents === null || diffCents === 0;
  if (none) {
    return {
      diffCents: 0,
      none: true,
      color: 'var(--ink-2)',
      soft: 'var(--surface-2)',
      note: realBalanceCents === null ? 'informe o saldo' : 'já está batendo',
      buttonLabel: 'Sem ajuste necessário',
    };
  }
  const positive = diffCents > 0;
  return {
    diffCents,
    none: false,
    color: positive ? 'var(--positive)' : 'var(--negative)',
    soft: positive
      ? 'color-mix(in srgb, var(--positive) 12%, transparent)'
      : 'color-mix(in srgb, var(--negative) 10%, transparent)',
    note: positive ? 'entrada de ajuste' : 'saída de ajuste',
    buttonLabel: 'Criar lançamento de ajuste',
  };
}
