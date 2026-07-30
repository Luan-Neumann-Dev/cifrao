import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type AdjustBalanceInput,
  type CreateAccountInput,
  type UpdateAccountInput,
  adjustBalanceSchema,
  createAccountSchema,
  updateAccountSchema,
} from '@cifrao/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AccountsService } from './accounts.service';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Get(':id/balance-evolution')
  balanceEvolution(@Param('id') id: string) {
    return this.service.balanceEvolution(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createAccountSchema)) dto: CreateAccountInput) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAccountSchema)) dto: UpdateAccountInput,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/adjust')
  adjust(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adjustBalanceSchema)) dto: AdjustBalanceInput,
  ) {
    return this.service.adjustBalance(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
