import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SP_TIMEZONE } from '@cifrao/shared';
import { RecurringRulesService } from './recurring-rules.service';

/**
 * Cron diário da regra 5.11: às 03:00 de São Paulo, empurra o horizonte rolante
 * de previstos para frente. A geração é idempotente — reescreve só os previstos
 * de hoje em diante e nunca toca no que já foi confirmado.
 */
@Injectable()
export class RecurringCron {
  private readonly logger = new Logger(RecurringCron.name);

  constructor(private readonly rules: RecurringRulesService) {}

  @Cron('0 3 * * *', { name: 'gerar-previstos', timeZone: SP_TIMEZONE })
  async handleDaily(): Promise<void> {
    try {
      const result = await this.rules.generateAll();
      this.logger.log(`Cron de previstos: ${result.created} lançamentos em ${result.rules} regras`);
    } catch (err) {
      this.logger.error('Falha ao gerar previstos', err as Error);
    }
  }
}
