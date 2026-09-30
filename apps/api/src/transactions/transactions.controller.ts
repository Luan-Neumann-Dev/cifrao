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
  type BulkActionInput,
  type CreateTransactionInput,
  type ReimburseInput,
  type TransactionFilter,
  type UpdateTransactionInput,
  bulkActionSchema,
  createTransactionSchema,
  reimburseSchema,
  transactionFilterSchema,
  updateTransactionSchema,
} from '@cifrao/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-verifier';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(transactionFilterSchema)) filter: TransactionFilter,
  ) {
    return this.service.list(user.id, filter);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTransactionSchema)) dto: CreateTransactionInput,
  ) {
    return this.service.create(user.id, dto);
  }

  @Post('bulk')
  bulk(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(bulkActionSchema)) dto: BulkActionInput,
  ) {
    return this.service.bulk(user.id, dto);
  }

  /** Regra 5.13: registra o recebimento (estorno vinculado, total ou parcial). */
  @Post(':id/reimburse')
  reimburse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reimburseSchema)) dto: ReimburseInput,
  ) {
    return this.service.reimburse(user.id, id, dto);
  }

  @Delete(':id/reimburse')
  undoReimburse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.undoReimburse(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTransactionSchema)) dto: UpdateTransactionInput,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
