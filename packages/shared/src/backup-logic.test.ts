import { describe, expect, it } from 'vitest';
import {
  BACKUP_APP,
  BACKUP_MODELS,
  BACKUP_MODEL_NAMES,
  BACKUP_VERSION,
  checkBackupFile,
  fullWipeOrder,
  MOVEMENT_MODELS,
  sortByParent,
  splitSelfReference,
  summarizeBackup,
  wipeOrder,
} from './backup-logic';

function fileWith(data: Record<string, Record<string, unknown>[]>, version = BACKUP_VERSION) {
  return { app: BACKUP_APP, version, exportedAt: '2026-08-04T12:00:00.000Z', data };
}

describe('ordem das tabelas', () => {
  it('coloca todo pai antes do filho que aponta para ele', () => {
    const pos = (model: string) => BACKUP_MODEL_NAMES.indexOf(model);
    // Cada par é uma FK real do schema: [filho, pai].
    const dependencias: [string, string][] = [
      ['creditCard', 'account'],
      ['invoice', 'creditCard'],
      ['purchase', 'category'],
      ['recurringRule', 'category'],
      ['transaction', 'account'],
      ['transaction', 'category'],
      ['transaction', 'invoice'],
      ['transaction', 'purchase'],
      ['transaction', 'recurringRule'],
      ['transactionSplit', 'transaction'],
      ['transactionTag', 'transaction'],
      ['transactionTag', 'tag'],
      ['budget', 'category'],
      ['goal', 'account'],
      ['categoryRule', 'category'],
      ['investmentTransaction', 'investment'],
      ['investmentTransaction', 'account'],
      ['priceHistory', 'investment'],
    ];
    for (const [filho, pai] of dependencias) {
      expect(pos(pai), `${pai} precisa vir antes de ${filho}`).toBeLessThan(pos(filho));
    }
  });

  it('apaga na ordem inversa da restauração', () => {
    expect(wipeOrder()).toEqual([...BACKUP_MODEL_NAMES].reverse());
    expect(wipeOrder()[0]).toBe('allocationTarget');
    expect(wipeOrder().at(-1)).toBe('category');
  });

  it('a exclusão total apaga o staging da importação antes do resto', () => {
    const ordem = fullWipeOrder();
    expect(ordem.indexOf('importRow')).toBeLessThan(ordem.indexOf('importBatch'));
    expect(ordem.indexOf('importBatch')).toBeLessThan(ordem.indexOf('transaction'));
    expect(new Set(ordem).size).toBe(ordem.length);
  });

  it('apagar lançamentos preserva conta, cartão, categoria e configuração', () => {
    for (const preservado of [
      'account',
      'creditCard',
      'category',
      'tag',
      'budget',
      'goal',
      'recurringRule',
      'categoryRule',
    ]) {
      expect(MOVEMENT_MODELS).not.toContain(preservado);
    }
    for (const apagado of ['transaction', 'invoice', 'purchase', 'investment', 'importBatch']) {
      expect(MOVEMENT_MODELS).toContain(apagado);
    }
  });

  it('apaga o filho antes do pai também no nível 1', () => {
    const pos = (model: string) => MOVEMENT_MODELS.indexOf(model);
    expect(pos('transactionSplit')).toBeLessThan(pos('transaction'));
    expect(pos('transactionTag')).toBeLessThan(pos('transaction'));
    expect(pos('transaction')).toBeLessThan(pos('invoice'));
    expect(pos('transaction')).toBeLessThan(pos('purchase'));
    expect(pos('importRow')).toBeLessThan(pos('importBatch'));
    expect(pos('investmentTransaction')).toBeLessThan(pos('investment'));
    expect(pos('priceHistory')).toBeLessThan(pos('investment'));
  });

  it('declara auto-referência só onde a tabela aponta para si mesma', () => {
    const comSelf = BACKUP_MODELS.filter((m) => m.selfReference).map((m) => m.model);
    expect(comSelf).toEqual(['category', 'transaction']);
  });
});

describe('checkBackupFile', () => {
  it('aceita um backup da versão atual', () => {
    const check = checkBackupFile(fileWith({ account: [{ id: 'a1' }], transaction: [{ id: 't1' }] }));
    expect(check.ok).toBe(true);
    expect(check.problems).toEqual([]);
    expect(check.totalRecords).toBe(2);
  });

  it('recusa arquivo que não é backup do Cifrão', () => {
    expect(checkBackupFile({ foo: 'bar' }).ok).toBe(false);
    expect(checkBackupFile(fileWith({}).data).ok).toBe(false);
    expect(checkBackupFile(null).ok).toBe(false);
  });

  it('recusa backup de uma versão futura em vez de gravar errado', () => {
    const check = checkBackupFile(fileWith({ account: [{ id: 'a1' }] }, BACKUP_VERSION + 1));
    expect(check.ok).toBe(false);
    expect(check.problems.join(' ')).toContain('Atualize o app');
  });

  it('recusa backup vazio', () => {
    const check = checkBackupFile(fileWith({}));
    expect(check.ok).toBe(false);
    expect(check.problems.join(' ')).toContain('nenhum registro');
  });

  it('ignora seção desconhecida sem reprovar o arquivo', () => {
    const check = checkBackupFile(
      fileWith({ account: [{ id: 'a1' }], tabelaDoFuturo: [{ id: 'x' }] }),
    );
    expect(check.ok).toBe(true);
    expect(check.unknownModels).toEqual(['tabelaDoFuturo']);
    expect(check.totalRecords).toBe(1);
  });

  it('não conta credencial: o arquivo não tem seção de sessão nem de senha', () => {
    for (const proibido of ['user', 'session', 'authAccount', 'twoFactor', 'jwks']) {
      expect(BACKUP_MODEL_NAMES).not.toContain(proibido);
    }
  });
});

describe('summarizeBackup', () => {
  it('conta por seção na ordem da restauração e omite as vazias', () => {
    const counts = summarizeBackup({
      transaction: [{ id: 't1' }, { id: 't2' }],
      account: [{ id: 'a1' }],
      tag: [],
    });
    expect(counts.map((c) => c.model)).toEqual(['account', 'transaction']);
    expect(counts.map((c) => c.count)).toEqual([1, 2]);
    expect(counts[0].label).toBe('Contas');
  });
});

describe('sortByParent', () => {
  it('emite o pai antes do filho mesmo com a entrada invertida', () => {
    const rows = [
      { id: 'neto', parentId: 'filho' },
      { id: 'filho', parentId: 'raiz' },
      { id: 'raiz', parentId: null },
    ];
    expect(sortByParent(rows).map((r) => r.id)).toEqual(['raiz', 'filho', 'neto']);
  });

  it('trata pai fora do lote como raiz', () => {
    const rows = [{ id: 'a', parentId: 'quem-sumiu' }];
    expect(sortByParent(rows).map((r) => r.id)).toEqual(['a']);
  });

  it('não trava em ciclo e devolve todas as linhas', () => {
    const rows = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    const out = sortByParent(rows);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('preserva todas as linhas em qualquer caso', () => {
    const rows = [
      { id: '1', parentId: null },
      { id: '2', parentId: '1' },
      { id: '3', parentId: '9' },
      { id: '4', parentId: '2' },
    ];
    expect(sortByParent(rows)).toHaveLength(4);
  });
});

describe('splitSelfReference', () => {
  it('zera o vínculo e guarda para o segundo passe', () => {
    const rows = [
      { id: 'gasto', reimbursesTransactionId: null },
      { id: 'estorno', reimbursesTransactionId: 'gasto' },
    ];
    const { rows: stripped, links } = splitSelfReference(rows, 'reimbursesTransactionId');
    expect(stripped.every((r) => r.reimbursesTransactionId === null)).toBe(true);
    expect(links).toEqual([{ id: 'estorno', value: 'gasto' }]);
  });

  it('não altera as linhas originais', () => {
    const rows = [{ id: 'estorno', reimbursesTransactionId: 'gasto' }];
    splitSelfReference(rows, 'reimbursesTransactionId');
    expect(rows[0].reimbursesTransactionId).toBe('gasto');
  });
});
