import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type CreateCategoryInput,
  type MergeCategoriesInput,
  type UpdateCategoryInput,
  createCategorySchema,
  mergeCategoriesSchema,
  updateCategorySchema,
} from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CategoriesService } from './categories.service';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  /** Lista com contagem de uso, para a tela de gestão da Fase 9. */
  @Get('uso')
  usage() {
    return this.service.usage();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryInput) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryInput,
  ) {
    return this.service.update(id, dto);
  }

  /** Mescla esta categoria na de destino: tudo migra e os limites somam. */
  @Post(':id/mesclar')
  merge(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(mergeCategoriesSchema)) dto: MergeCategoriesInput,
  ) {
    return this.service.merge(id, dto.targetId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
