import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { SetSplitsInput } from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SplitsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(transactionId: string) {
    const transaction = await this.prisma.client.transaction.findUnique({
      where: { id: transactionId },
      select: { id: true, amountCents: true },
    });
    if (!transaction) throw new NotFoundException('Lançamento não encontrado');

    const splits = await this.prisma.client.transactionSplit.findMany({
      where: { transactionId },
      include: { category: { select: { id: true, name: true, color: true, icon: true } } },
    });
    return { transactionId, amountCents: transaction.amountCents, splits };
  }

  /**
   * Substitui a divisão de um lançamento entre categorias. Lista vazia desfaz a
   * divisão e o lançamento volta a valer inteiro na categoria única.
   *
   * A soma das partes tem que bater exatamente com o valor: sobrar um centavo
   * aqui é um centavo que some do relatório por categoria sem ninguém perceber.
   */
  async set(transactionId: string, input: SetSplitsInput) {
    return this.prisma.client.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        select: { id: true, type: true, amountCents: true },
      });
      if (!transaction) throw new NotFoundException('Lançamento não encontrado');
      if (transaction.type === 'TRANSFER') {
        // Regra 5.7: transferência não entra em categoria nenhuma.
        throw new BadRequestException('Transferência não se divide entre categorias.');
      }

      if (input.splits.length > 0) {
        if (input.splits.length < 2) {
          throw new BadRequestException('Uma divisão precisa de pelo menos duas categorias.');
        }
        const total = input.splits.reduce((sum, s) => sum + BigInt(s.amountCents), 0n);
        if (total !== transaction.amountCents) {
          throw new BadRequestException(
            `A soma das partes (${total}) precisa fechar com o valor do lançamento (${transaction.amountCents}).`,
          );
        }
        const categorias = new Set(input.splits.map((s) => s.categoryId));
        if (categorias.size !== input.splits.length) {
          throw new BadRequestException('Categoria repetida na divisão — some as duas partes.');
        }
        const existentes = await tx.category.count({ where: { id: { in: [...categorias] } } });
        if (existentes !== categorias.size) {
          throw new BadRequestException('Categoria não encontrada.');
        }
      }

      await tx.transactionSplit.deleteMany({ where: { transactionId } });
      if (input.splits.length > 0) {
        await tx.transactionSplit.createMany({
          data: input.splits.map((s) => ({
            transactionId,
            categoryId: s.categoryId,
            amountCents: BigInt(s.amountCents),
          })),
        });
        // A categoria única passa a ser a da maior parte: é a que representa o
        // lançamento nas telas que ainda não sabem ler divisão.
        const maior = [...input.splits].sort((a, b) => b.amountCents - a.amountCents)[0];
        await tx.transaction.update({
          where: { id: transactionId },
          data: { categoryId: maior.categoryId },
        });
      }

      return this.getWithin(tx, transactionId);
    });
  }

  private async getWithin(
    tx: Parameters<Parameters<PrismaService['client']['$transaction']>[0]>[0],
    transactionId: string,
  ) {
    const splits = await tx.transactionSplit.findMany({
      where: { transactionId },
      include: { category: { select: { id: true, name: true, color: true, icon: true } } },
    });
    return { transactionId, splits };
  }
}
