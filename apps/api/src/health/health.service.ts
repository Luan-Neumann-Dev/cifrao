import { SP_TIMEZONE, formatInSaoPaulo } from '@cifrao/shared';
import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  service: 'cifrao-api';
  timestamp: string;
  localTime: string;
  timezone: string;
  uptimeSeconds: number;
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  check(): HealthStatus {
    const now = new Date();
    return {
      status: 'ok',
      service: 'cifrao-api',
      timestamp: now.toISOString(),
      localTime: formatInSaoPaulo(now, 'dd/MM/yyyy HH:mm:ss'),
      timezone: SP_TIMEZONE,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}
