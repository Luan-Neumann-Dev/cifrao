import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  type CreateCategoryRuleInput,
  type UpdateCategoryRuleInput,
  createCategoryRuleSchema,
  updateCategoryRuleSchema,
} from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CategoryRulesService } from './category-rules.service';

@Controller('category-rules')
@UseGuards(JwtAuthGuard)
export class CategoryRulesController {
  constructor(private readonly service: CategoryRulesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('test')
  test(@Query('description') description = '', @Query('amountCents') amountCents = '0') {
    return this.service.test(description, Number(amountCents));
  }

  @Post()
  create(@Body(new ZodValidationPipe(createCategoryRuleSchema)) dto: CreateCategoryRuleInput) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategoryRuleSchema)) dto: UpdateCategoryRuleInput,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
