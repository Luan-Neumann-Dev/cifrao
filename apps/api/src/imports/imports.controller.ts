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
  type ApplyPatternInput,
  type CreateImportInput,
  type CsvMapping,
  type SetImportAccountInput,
  type UpdateImportRowInput,
  applyPatternSchema,
  createImportSchema,
  csvMappingSchema,
  setImportAccountSchema,
  updateImportRowSchema,
} from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ImportsService } from './imports.service';

@Controller('imports')
@UseGuards(JwtAuthGuard)
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.service.get(id, Number(page) || 1, Math.min(Number(pageSize) || 100, 500));
  }

  /** Quantas linhas casam com um padrão (o "N" do botão de aplicar a todos). */
  @Get(':id/pattern')
  previewPattern(@Param('id') id: string, @Query('pattern') pattern = '') {
    return this.service.previewPattern(id, pattern);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createImportSchema)) dto: CreateImportInput) {
    return this.service.create(dto);
  }

  @Patch(':id/account')
  setAccount(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setImportAccountSchema)) dto: SetImportAccountInput,
  ) {
    return this.service.setAccount(id, dto);
  }

  @Patch(':id/mapping')
  setMapping(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(csvMappingSchema)) dto: CsvMapping,
  ) {
    return this.service.setMapping(id, dto);
  }

  @Patch(':id/rows/:rowId')
  updateRow(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @Body(new ZodValidationPipe(updateImportRowSchema)) dto: UpdateImportRowInput,
  ) {
    return this.service.updateRow(id, rowId, dto);
  }

  @Post(':id/apply-pattern')
  applyPattern(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(applyPatternSchema)) dto: ApplyPatternInput,
  ) {
    return this.service.applyPattern(id, dto);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.service.confirm(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
