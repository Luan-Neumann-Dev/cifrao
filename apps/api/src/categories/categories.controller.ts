import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateCategoryInput,
  type MergeCategoriesInput,
  type SuggestCategoryQuery,
  type UpdateCategoryInput,
  createCategorySchema,
  mergeCategoriesSchema,
  suggestCategoryQuerySchema,
  updateCategorySchema,
} from '@cifrao/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-verifier';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CategoriesService } from './categories.service';
import { CategorySuggestionService } from './category-suggestion.service';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(
    private readonly service: CategoriesService,
    private readonly suggestions: CategorySuggestionService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  /** Lista com contagem de uso, para a tela de gestão da Fase 9. */
  @Get('uso')
  usage(@CurrentUser() user: AuthUser) {
    return this.service.usage(user.id);
  }

  /** Categoria provável para o que está sendo digitado no formulário. */
  @Get('sugestao')
  suggest(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(suggestCategoryQuerySchema)) query: SuggestCategoryQuery,
  ) {
    return this.suggestions.suggest(user.id, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryInput,
  ) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryInput,
  ) {
    return this.service.update(user.id, id, dto);
  }

  /** Mescla esta categoria na de destino: tudo migra e os limites somam. */
  @Post(':id/mesclar')
  merge(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(mergeCategoriesSchema)) dto: MergeCategoriesInput,
  ) {
    return this.service.merge(user.id, id, dto.targetId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
