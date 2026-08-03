import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReceivablesService } from './receivables.service';

@Controller('receivables')
@UseGuards(JwtAuthGuard)
export class ReceivablesController {
  constructor(private readonly service: ReceivablesService) {}

  @Get()
  list() {
    return this.service.list();
  }
}
