import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { OnboardingService, pendingReviewMonth } from './onboarding.service';

function fakePrisma(
  user: { onboardingDoneAt: Date | null; lastReviewSeenMonth: string | null } | null,
  counts: { accounts: number; cards: number; transactions: number },
) {
  return {
    client: {
      user: { findUnique: async () => user, update: async () => ({}) },
      account: { count: async () => counts.accounts },
      creditCard: { count: async () => counts.cards },
      transaction: { count: async () => counts.transactions },
    },
  } as unknown as PrismaService;
}

const SEM_NADA = { accounts: 0, cards: 0, transactions: 0 };

describe('primeiros passos', () => {
  it('conta nova e sem nenhuma conta bancária: desvia para as boas-vindas', async () => {
    const service = new OnboardingService(
      fakePrisma({ onboardingDoneAt: null, lastReviewSeenMonth: null }, SEM_NADA),
    );
    const status = await service.status('u1', new Date('2026-08-15T12:00:00Z'));
    expect(status.needsOnboarding).toBe(true);
  });

  it('quem já pulou não vê de novo', async () => {
    const service = new OnboardingService(
      fakePrisma({ onboardingDoneAt: new Date('2026-08-01'), lastReviewSeenMonth: null }, SEM_NADA),
    );
    const status = await service.status('u1', new Date('2026-08-15T12:00:00Z'));
    expect(status.needsOnboarding).toBe(false);
  });

  it('quem restaurou backup não é jogado nas boas-vindas', async () => {
    // Sem `onboardingDoneAt`, mas com contas: o app já tem dados.
    const service = new OnboardingService(
      fakePrisma({ onboardingDoneAt: null, lastReviewSeenMonth: null }, { accounts: 4, cards: 3, transactions: 5000 }),
    );
    const status = await service.status('u1', new Date('2026-08-15T12:00:00Z'));
    expect(status.needsOnboarding).toBe(false);
  });
});

describe('quando oferecer a retrospectiva', () => {
  it('nos primeiros dias do mês, oferece o mês passado', () => {
    expect(pendingReviewMonth(null, new Date('2026-08-03T12:00:00Z'))).toBe('2026-07');
  });

  it('passado o dia 7, o mês passado não é mais notícia', () => {
    expect(pendingReviewMonth(null, new Date('2026-08-15T12:00:00Z'))).toBeNull();
  });

  it('não repete o que já foi visto', () => {
    expect(pendingReviewMonth('2026-07', new Date('2026-08-03T12:00:00Z'))).toBeNull();
  });

  it('mês visto antigo não impede o novo', () => {
    expect(pendingReviewMonth('2026-06', new Date('2026-08-03T12:00:00Z'))).toBe('2026-07');
  });

  it('em janeiro, a retrospectiva é de dezembro do ano anterior', () => {
    expect(pendingReviewMonth(null, new Date('2026-01-02T12:00:00Z'))).toBe('2025-12');
  });

  it('virada de dia respeita São Paulo, não UTC', () => {
    // 2026-08-08T02:00Z ainda é dia 7 em São Paulo — último dia do aviso.
    expect(pendingReviewMonth(null, new Date('2026-08-08T02:00:00Z'))).toBe('2026-07');
  });
});
