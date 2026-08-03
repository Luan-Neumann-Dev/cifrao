import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  type CreateGoalInput,
  type UpdateGoalInput,
  createGoalSchema,
  updateGoalSchema,
} from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GoalsService } from './goals.service';

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string) {
    return this.service.list(includeArchived === 'true');
  }

  @Post()
  create(@Body(new ZodValidationPipe(createGoalSchema)) dto: CreateGoalInput) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateGoalSchema)) dto: UpdateGoalInput,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
