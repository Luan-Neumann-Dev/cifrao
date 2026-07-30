import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type PrismaClient, prisma } from '@cifrao/db';

/**
 * Expõe o client Prisma singleton (de @cifrao/db) como provider injetável e
 * gerencia connect/disconnect no ciclo de vida do Nest.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient = prisma;

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
