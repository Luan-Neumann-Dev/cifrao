import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCategoryInput, UpdateCategoryInput } from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.category.findMany({ orderBy: [{ name: 'asc' }] });
  }

  create(input: CreateCategoryInput) {
    return this.prisma.client.category.create({ data: input });
  }

  async update(id: string, input: UpdateCategoryInput) {
    await this.ensureExists(id);
    return this.prisma.client.category.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    const [txCount, childCount] = await Promise.all([
      this.prisma.client.transaction.count({ where: { categoryId: id } }),
      this.prisma.client.category.count({ where: { parentId: id } }),
    ]);
    if (txCount > 0 || childCount > 0) {
      throw new BadRequestException('Categoria em uso (lançamentos ou subcategorias).');
    }
    await this.prisma.client.category.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.client.category.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Categoria não encontrada');
  }
}
