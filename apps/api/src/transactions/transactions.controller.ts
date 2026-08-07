import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type BulkActionInput,
  type CreateTransactionInput,
  type ReimburseInput,
  type SetSplitsInput,
  type TransactionFilter,
  type UpdateTransactionInput,
  bulkActionSchema,
  createTransactionSchema,
  reimburseSchema,
  setSplitsSchema,
  transactionFilterSchema,
  updateTransactionSchema,
} from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SplitsService } from './splits.service';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly service: TransactionsService,
    private readonly splits: SplitsService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(transactionFilterSchema)) filter: TransactionFilter) {
    return this.service.list(filter);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createTransactionSchema)) dto: CreateTransactionInput) {
    return this.service.create(dto);
  }

  @Post('bulk')
  bulk(@Body(new ZodValidationPipe(bulkActionSchema)) dto: BulkActionInput) {
    return this.service.bulk(dto);
  }

  /** Regra 5.13: registra o recebimento (estorno vinculado, total ou parcial). */
  @Post(':id/reimburse')
  reimburse(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reimburseSchema)) dto: ReimburseInput,
  ) {
    return this.service.reimburse(id, dto);
  }

  @Delete(':id/reimburse')
  undoReimburse(@Param('id') id: string) {
    return this.service.undoReimburse(id);
  }

  @Get(':id/splits')
  getSplits(@Param('id') id: string) {
    return this.splits.get(id);
  }

  /** Divide o lançamento entre categorias; lista vazia desfaz a divisão. */
  @Put(':id/splits')
  setSplits(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setSplitsSchema)) dto: SetSplitsInput,
  ) {
    return this.splits.set(id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTransactionSchema)) dto: UpdateTransactionInput,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
