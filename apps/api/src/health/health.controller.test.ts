import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  const controller = new HealthController(new HealthService());

  it('retorna status ok do serviço', () => {
    const res = controller.check();
    expect(res.status).toBe('ok');
    expect(res.service).toBe('cifrao-api');
  });

  it('inclui timestamp ISO e horário local de São Paulo', () => {
    const res = controller.check();
    expect(() => new Date(res.timestamp).toISOString()).not.toThrow();
    expect(res.timezone).toBe('America/Sao_Paulo');
    expect(res.localTime).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
  });

  it('reporta uptime não-negativo', () => {
    expect(controller.check().uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
