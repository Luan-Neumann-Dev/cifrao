import { monthKeyInSaoPaulo } from '@cifrao/shared';

/** Helpers de mês de referência ("yyyy-MM") usados nas telas com navegação mensal. */

const MONTHS_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function thisMonthKey(): string {
  return monthKeyInSaoPaulo(new Date());
}

export function monthLong(ref: string): string {
  const [y, m] = ref.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} de ${y}`;
}

export function monthShort(ref: string): string {
  const [y, m] = ref.split('-').map(Number);
  return `${MONTHS_LONG[m - 1].slice(0, 3)}/${String(y).slice(2)}`;
}

/** Soma meses a uma chave "yyyy-MM" (aritmética inteira, sem armadilha de fuso). */
export function addMonthKey(ref: string, n: number): string {
  const [y, m] = ref.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Primeiro e último dia do mês em "yyyy-MM-dd" (para filtros de período). */
export function monthRange(ref: string): { from: string; to: string } {
  const [y, m] = ref.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ref}-01`, to: `${ref}-${String(last).padStart(2, '0')}` };
}

/** Formata "yyyy-MM-dd" como "dd/MM" (a chave já vem no fuso de São Paulo). */
export function dayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
}
