import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateTagInput } from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.tag.findMany({ orderBy: { name: 'asc' } });
  }

  create(input: CreateTagInput) {
    return this.prisma.client.tag.create({ data: input });
  }

  async remove(id: string) {
    const found = await this.prisma.client.tag.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Tag não encontrada');
    await this.prisma.client.tag.delete({ where: { id } });
    return { ok: true };
  }
}
