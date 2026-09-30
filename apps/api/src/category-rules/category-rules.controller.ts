import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  type CreateCategoryRuleInput,
  type UpdateCategoryRuleInput,
  createCategoryRuleSchema,
  updateCategoryRuleSchema,
} from '@cifrao/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-verifier';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CategoryRulesService } from './category-rules.service';

@Controller('category-rules')
@UseGuards(JwtAuthGuard)
export class CategoryRulesController {
  constructor(private readonly service: CategoryRulesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  @Get('test')
  test(
    @CurrentUser() user: AuthUser,
    @Query('description') description = '',
    @Query('amountCents') amountCents = '0',
  ) {
    return this.service.test(user.id, description, Number(amountCents));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCategoryRuleSchema)) dto: CreateCategoryRuleInput,
  ) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategoryRuleSchema)) dto: UpdateCategoryRuleInput,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
