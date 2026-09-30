import { Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import {
  type BackupCsvQuery,
  type DangerZoneInput,
  type RestoreBackupInput,
  backupCsvSchema,
  dangerZoneSchema,
  restoreBackupSchema,
  stringifyWithBigInt,
} from '@cifrao/shared';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt-verifier';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BackupService } from './backup.service';

@Controller('backup')
@UseGuards(JwtAuthGuard)
export class BackupController {
  constructor(private readonly service: BackupService) {}

  /** O que vai no arquivo, para a tela mostrar antes de baixar. */
  @Get('resumo')
  summary(@CurrentUser() user: AuthUser) {
    return this.service.exportSummary(user.id);
  }

  /**
   * Download do backup completo. Escreve direto na resposta porque o JSON leva
   * BigInt: `stringifyWithBigInt` garante centavo como string (armadilha #2).
   */
  @Get('exportar.json')
  async exportJson(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const backup = await this.service.exportAll(user.id);
    const data = stringifyWithBigInt(backup, 2);
    const dia = backup.exportedAt.slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cifrao-backup-${dia}.json"`);
    res.send(data);
  }

  @Get('exportar.csv')
  async exportCsv(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(backupCsvSchema)) query: BackupCsvQuery,
    @Res() res: Response,
  ) {
    const { filename, content } = await this.service.exportCsv(user.id, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }

  /** Enfileira a restauração (armadilha #3: não roda no request). */
  @Post('restaurar')
  restore(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(restoreBackupSchema)) dto: RestoreBackupInput,
  ) {
    return this.service.enqueueRestore(user.id, dto);
  }

  @Get('restaurar/:id')
  restoreStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.restoreStatus(user.id, id);
  }

  // ─── Zona de risco ──────────────────────────────────────────────────────────

  @Post('apagar-lancamentos')
  wipe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(dangerZoneSchema)) dto: DangerZoneInput,
  ) {
    return this.service.wipeMovements(user.id, dto.confirm);
  }

  @Delete('conta')
  deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(dangerZoneSchema)) dto: DangerZoneInput,
  ) {
    return this.service.deleteAccount(user.id, dto.confirm);
  }
}
