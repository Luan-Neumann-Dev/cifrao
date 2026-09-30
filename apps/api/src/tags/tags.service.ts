import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTagInput } from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.client.tag.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  }

  create(userId: string, input: CreateTagInput) {
    return this.prisma.client.tag.create({ data: { ...input, userId } });
  }

  async remove(userId: string, id: string) {
    const found = await this.prisma.client.tag.findFirst({ where: { id, userId } });
    if (!found) throw new NotFoundException('Tag não encontrada');
    await this.prisma.client.tag.delete({ where: { id } });
    return { ok: true };
  }
}
