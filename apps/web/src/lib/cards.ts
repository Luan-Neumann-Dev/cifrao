import type { InvoiceStatus } from '@cifrao/shared';

export const DEFAULT_CARD_COLOR = '#820AD1';

/** Paleta do design para o cartão: roxo, verde-água, azul, rosa, âmbar, grafite. */
export const CARD_COLORS = ['#820AD1', '#0F9B8E', '#0EA5E9', '#EC4899', '#F5A524', '#242424'];

/** Degradê do plástico: a própria cor escurecida em 26%, como no protótipo. */
export function cardGradient(color: string | null | undefined): string {
  const base = color || DEFAULT_CARD_COLOR;
  return `linear-gradient(135deg, ${base}, color-mix(in oklab, ${base}, #000 26%))`;
}

/** Sombra colorida sob o cartão — a cor dá o tom, não um cinza genérico. */
export function cardShadow(color: string | null | undefined): string {
  const base = color || DEFAULT_CARD_COLOR;
  return `0 10px 26px color-mix(in srgb, ${base} 30%, transparent)`;
}

export interface LimitSegment {
  key: 'open' | 'closed' | 'future';
  label: string;
  cents: number;
  /** Largura em % do limite. */
  percent: number;
  color: string;
  /** Fundo da barra: parcela futura é hachurada, para não parecer gasto feito. */
  fill: string;
}

export interface LimitBreakdown {
  limitCents: number;
  availableCents: number;
  segments: LimitSegment[];
  /** Quanto do limite sobrou, em % — o que a barra deixa vazio. */
  availablePercent: number;
}

const HATCH =
  'repeating-linear-gradient(135deg, var(--warn), var(--warn) 5px, color-mix(in oklab, var(--warn), #fff 26%) 5px, color-mix(in oklab, var(--warn), #fff 26%) 10px)';

/**
 * Regra 5.5 — a barra do limite mostra os pedaços separados: fatura aberta,
 * faturas fechadas ainda não quitadas e parcelas futuras já comprometidas. O que
 * sobra é o "disponível de verdade". Segmento zerado não entra: barra com fatia
 * invisível confunde mais do que informa.
 */
export function limitBreakdown(availability: {
  limitCents: string | number;
  openInvoiceCents: string | number;
  closedUnpaidCents: string | number;
  futureCommittedCents: string | number;
  availableCents: string | number;
}): LimitBreakdown {
  const limitCents = Number(availability.limitCents);
  const raw: Omit<LimitSegment, 'percent'>[] = [
    {
      key: 'open',
      label: 'Fatura atual (usado)',
      cents: Number(availability.openInvoiceCents),
      color: 'var(--primary)',
      fill: 'var(--primary)',
    },
    {
      key: 'closed',
      label: 'Fechada, não quitada',
      cents: Number(availability.closedUnpaidCents),
      color: 'var(--negative)',
      fill: 'var(--negative)',
    },
    {
      key: 'future',
      label: 'Comprometido em parcelas',
      cents: Number(availability.futureCommittedCents),
      color: 'var(--warn)',
      fill: HATCH,
    },
  ];

  const segments = raw
    .filter((s) => s.cents > 0)
    .map((s) => ({
      ...s,
      // Sem limite cadastrado não há proporção a mostrar.
      percent: limitCents > 0 ? Math.min(100, (s.cents / limitCents) * 100) : 0,
    }));

  const used = segments.reduce((sum, s) => sum + s.percent, 0);
  return {
    limitCents,
    availableCents: Number(availability.availableCents),
    segments,
    availablePercent: Math.max(0, 100 - used),
  };
}

export interface InvoiceStateStyle {
  label: string;
  /** Rótulo curto para o seletor de faturas. */
  shortLabel: string;
  color: string;
  soft: string;
}

/** Cor e texto do estado da fatura, iguais no seletor e no cabeçalho. */
export function invoiceStateStyle(status: InvoiceStatus): InvoiceStateStyle {
  switch (status) {
    case 'PAID':
      return {
        label: 'Paga',
        shortLabel: 'Paga',
        color: 'var(--positive)',
        soft: 'color-mix(in srgb, var(--positive) 12%, transparent)',
      };
    case 'PARTIAL':
      return {
        label: 'Paga em parte · resta pagar',
        shortLabel: 'Parcial',
        color: 'var(--warn)',
        soft: 'color-mix(in srgb, var(--warn) 14%, transparent)',
      };
    case 'CLOSED':
      return {
        label: 'Fechada · aguardando pagamento',
        shortLabel: 'Fechada',
        color: 'var(--warn)',
        soft: 'color-mix(in srgb, var(--warn) 14%, transparent)',
      };
    case 'OPEN':
      return {
        label: 'Aberta · ainda recebe lançamentos',
        shortLabel: 'Aberta',
        color: 'var(--primary)',
        soft: 'var(--primary-soft)',
      };
  }
}

/** Acima disso o mês entra em destaque no gráfico de parcelas. */
export const HEAVY_MONTH_CENTS = 100_000;

export function isHeavyMonth(cents: string | number): boolean {
  return Number(cents) > HEAVY_MONTH_CENTS;
}
