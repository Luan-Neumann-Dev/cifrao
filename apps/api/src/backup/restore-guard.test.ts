import { BACKUP_APP, BACKUP_VERSION, type BackupFile } from '@cifrao/shared';
import { describe, expect, it } from 'vitest';
import { type GuardDb, assertRestoreOwnership, foreignKeys } from './restore-guard';

/**
 * Banco falso que sabe de quem é cada id. `null` = categoria universal.
 * O `where` que a trava monta é `{ AND: [{ id: { in } }, recorte] }`, com o
 * recorte vindo do `ownerWhere` (direto, via OR com universal ou via relação).
 */
function fakeDb(owners: Record<string, string | null>): GuardDb {
  const matches = (owner: string | null | undefined, where: Record<string, unknown>): boolean => {
    if ('NOT' in where) return !matches(owner, where.NOT as Record<string, unknown>);
    if ('OR' in where) {
      return (where.OR as Record<string, unknown>[]).some((w) => matches(owner, w));
    }
    if ('userId' in where) return owner === where.userId;
    // Relação (transaction/investment): o dono do filho é o do pai.
    const nested = Object.values(where)[0] as Record<string, unknown>;
    return matches(owner, nested);
  };
  const delegate = {
    findMany: async ({ where }: { where: { AND: [{ id: { in: string[] } }, Record<string, unknown>] } }) => {
      const [ids, cut] = where.AND;
      return ids.id.in
        .filter((id) => id in owners && matches(owners[id], cut))
        .map((id) => ({ id }));
    },
  };
  return new Proxy({}, { get: () => delegate }) as GuardDb;
}

function backup(data: BackupFile['data']): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: '2026-10-07', data };
}

const EU = 'u-eu';
const OUTRO = 'u-outro';

describe('trava de dono da restauração', () => {
  it('lê as relações do schema: meta → conta, divisão → lançamento, lançamento → conta', () => {
    expect(foreignKeys('goal')).toContainEqual({ column: 'linkedAccountId', target: 'account' });
    expect(foreignKeys('transactionSplit')).toContainEqual({
      column: 'transactionId',
      target: 'transaction',
    });
    expect(foreignKeys('transaction')).toContainEqual({ column: 'accountId', target: 'account' });
    // O dono é reescrito na restauração; não é referência a conferir.
    expect(foreignKeys('goal').some((k) => k.column === 'userId')).toBe(false);
  });

  it('meta apontando para a conta de outro usuário é recusada', async () => {
    const db = fakeDb({ 'conta-dele': OUTRO });
    const file = backup({
      goal: [{ id: 'meta-1', name: 'x', targetCents: '1', linkedAccountId: 'conta-dele' }],
    });
    await expect(assertRestoreOwnership(db, file, EU)).rejects.toThrow(/não são seus/);
  });

  it('divisão pendurada no lançamento de outro usuário é recusada', async () => {
    const db = fakeDb({ 'lanc-dele': OUTRO, universal: null });
    const file = backup({
      transactionSplit: [
        { id: 'div-1', transactionId: 'lanc-dele', categoryId: 'universal', amountCents: '1' },
      ],
    });
    await expect(assertRestoreOwnership(db, file, EU)).rejects.toThrow(/Lançamentos/);
  });

  it('linha com o id de um registro de outro usuário é recusada', async () => {
    const db = fakeDb({ 'conta-dele': OUTRO });
    const file = backup({ account: [{ id: 'conta-dele', name: 'minha?' }] });
    await expect(assertRestoreOwnership(db, file, EU)).rejects.toThrow(/pertencem a outro usuário/);
  });

  it('aceita referência ao próprio arquivo, ao próprio dado e à categoria universal', async () => {
    const db = fakeDb({ 'minha-conta': EU, universal: null, 'meu-id-antigo': EU });
    const file = backup({
      account: [{ id: 'conta-nova', name: 'nova' }, { id: 'meu-id-antigo', name: 'antiga' }],
      transaction: [
        { id: 't1', accountId: 'conta-nova', categoryId: 'universal' },
        { id: 't2', accountId: 'minha-conta', categoryId: null },
      ],
      goal: [{ id: 'g1', linkedAccountId: 'minha-conta' }],
    });
    await expect(assertRestoreOwnership(db, file, EU)).resolves.toBeUndefined();
  });

  it('categoria universal no próprio arquivo não é tratada como alheia', async () => {
    // O export leva as universais para as referências resolverem.
    const db = fakeDb({ universal: null });
    const file = backup({ category: [{ id: 'universal', name: 'Mercado' }] });
    await expect(assertRestoreOwnership(db, file, EU)).resolves.toBeUndefined();
  });
});
