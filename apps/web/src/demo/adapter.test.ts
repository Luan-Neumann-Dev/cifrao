import { describe, expect, it } from 'vitest';
import { DEMO_READ_ONLY, demoApi } from './adapter';
import responses from './fixtures/responses.json';
import transactions from './fixtures/transactions.json';

/**
 * Contra a gravação de verdade (`src/demo/fixtures/`): se alguém regravar e
 * uma tela essencial ficar sem resposta, é aqui que aparece.
 */
describe('api() da demonstração', () => {
  it('toda tela principal tem resposta gravada', () => {
    for (const path of [
      '/dashboard',
      '/accounts',
      '/credit-cards',
      '/categories',
      '/goals',
      '/recurring-rules',
      '/receivables',
      '/investments',
      '/notifications',
      '/settings',
      '/settings/onboarding',
      '/imports',
      '/category-rules',
      '/reports/revisao',
    ]) {
      expect(responses, path).toHaveProperty([path]);
    }
  });

  it('nenhuma escrita passa: a tela mostra o aviso no toast de erro dela', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await expect(demoApi('/transactions', { method })).rejects.toThrow(DEMO_READ_ONLY);
    }
  });

  it('a listagem de lançamentos responde a qualquer filtro', async () => {
    const page = await demoApi<{ items: unknown[]; total: number }>(
      '/transactions?type=EXPENSE&pageSize=10&search=ifood',
    );
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThanOrEqual(10);
  });

  it('lançamento sem divisão gravada responde divisão vazia, não erro', async () => {
    const t = (transactions as { id: string }[])[0];
    const res = await demoApi<{ splits: unknown[] }>(`/transactions/${t.id}/splits`);
    expect(Array.isArray(res.splits)).toBe(true);
  });

  it('a resposta é uma cópia: mexer nela não estraga a próxima', async () => {
    const a = await demoApi<{ name: string }[]>('/accounts');
    a[0].name = 'alterado';
    const b = await demoApi<{ name: string }[]>('/accounts');
    expect(b[0].name).not.toBe('alterado');
  });

  it('mês fora da gravação vira erro explicado, não tela quebrada', async () => {
    await expect(demoApi('/dashboard?month=1999-01')).rejects.toThrow(/Fora do período/);
  });

  it('a gravação não leva IP nem navegador de quem gravou', () => {
    const sessions = (responses as Record<string, unknown>)['/settings/sessions'] as {
      ipAddress: string | null;
    }[];
    expect(sessions.every((s) => s.ipAddress === null)).toBe(true);
  });
});
