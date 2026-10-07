import { Injectable } from '@nestjs/common';
import { monthKeyInSaoPaulo, nowUtc, recentMonthKeys, saoPauloDateParts } from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Até que dia do mês o aviso da retrospectiva aparece. Depois disso o mês novo
 * já andou o bastante para o mês passado não ser mais notícia.
 */
export const REVIEW_NUDGE_UNTIL_DAY = 7;

export interface OnboardingStatus {
  /** Nulo enquanto os primeiros passos não foram concluídos nem pulados. */
  onboardingDoneAt: Date | null;
  /** O painel desvia para as boas-vindas enquanto isto for verdadeiro. */
  needsOnboarding: boolean;
  counts: { accounts: number; cards: number; transactions: number };
  /** Mês da retrospectiva a oferecer agora ("yyyy-MM"), ou nulo. */
  reviewMonth: string | null;
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string, now = nowUtc()): Promise<OnboardingStatus> {
    const [user, accounts, cards, transactions] = await Promise.all([
      this.prisma.client.user.findUnique({
        where: { id: userId },
        select: { onboardingDoneAt: true, lastReviewSeenMonth: true },
      }),
      this.prisma.client.account.count({ where: { userId } }),
      this.prisma.client.creditCard.count({ where: { userId } }),
      this.prisma.client.transaction.count({ where: { userId } }),
    ]);

    const onboardingDoneAt = user?.onboardingDoneAt ?? null;
    return {
      onboardingDoneAt,
      // Quem já tem conta cadastrada não precisa ver os primeiros passos, mesmo
      // que nunca os tenha concluído — é o caso de quem restaurou um backup.
      needsOnboarding: onboardingDoneAt === null && accounts === 0,
      counts: { accounts, cards, transactions },
      reviewMonth: pendingReviewMonth(user?.lastReviewSeenMonth ?? null, now),
    };
  }

  /** Marca os primeiros passos como vistos — concluídos ou pulados, tanto faz. */
  async finishOnboarding(userId: string) {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { onboardingDoneAt: new Date() },
    });
    return { ok: true };
  }

  /** Guarda que a retrospectiva daquele mês já foi vista, para o aviso sumir. */
  async markReviewSeen(userId: string, month: string) {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { lastReviewSeenMonth: month },
    });
    return { ok: true };
  }
}

/**
 * Qual retrospectiva oferecer: a do mês passado, e só nos primeiros dias do mês
 * corrente. Se o usuário já viu esse mês (ou um mais recente), não oferece nada.
 */
export function pendingReviewMonth(
  lastSeenMonth: string | null,
  now: Date,
): string | null {
  const { day } = saoPauloDateParts(now);
  if (day > REVIEW_NUDGE_UNTIL_DAY) return null;

  const current = monthKeyInSaoPaulo(now);
  // `recentMonthKeys` devolve do mais antigo para o mais recente.
  const previous = recentMonthKeys(2, current)[0];
  if (lastSeenMonth && lastSeenMonth >= previous) return null;
  return previous;
}
