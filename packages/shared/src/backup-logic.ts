/**
 * Lógica pura de backup (Fase 9). Aqui fica só o que dá para provar sem banco:
 * o formato do arquivo, a ordem em que as tabelas podem ser gravadas sem violar
 * chave estrangeira, e o que cada nível da zona de risco apaga.
 *
 * Decisão do dono: **nenhum arquivo vai para storage nesta fase**. O export baixa
 * no navegador e a restauração sobe por upload — não há driver de disco nem R2.
 *
 * O que o arquivo NÃO leva, de propósito:
 * - senha, sessão e segredo de 2FA (restaurar identidade é buraco de segurança);
 * - `ImportBatch`/`ImportRow`, que são staging descartável e carregam o arquivo
 *   original em base64 — os lançamentos que saíram deles estão em `transaction`.
 */

import { z } from 'zod';

/** Sobe quando o formato mudar de um jeito que a versão anterior não entende. */
export const BACKUP_VERSION = 1;
export const BACKUP_APP = 'cifrao';

export interface BackupModel {
  /** Nome do model no Prisma Client (camelCase) — é a chave da seção no JSON. */
  model: string;
  label: string;
  /**
   * Campo que aponta para a própria tabela. Grava-se em dois passes: primeiro a
   * linha sem ele, depois o vínculo — senão a ordem entre irmãos importaria.
   */
  selfReference?: string;
}

/**
 * Ordem de restauração: pai antes de filho. `wipeOrder()` é o inverso disso, que
 * é a ordem em que dá para apagar sem esbarrar em FK.
 */
export const BACKUP_MODELS: readonly BackupModel[] = [
  { model: 'category', label: 'Categorias', selfReference: 'parentId' },
  { model: 'account', label: 'Contas' },
  { model: 'tag', label: 'Tags' },
  { model: 'creditCard', label: 'Cartões' },
  { model: 'invoice', label: 'Faturas' },
  { model: 'purchase', label: 'Compras parceladas' },
  { model: 'recurringRule', label: 'Recorrências' },
  { model: 'investment', label: 'Posições' },
  { model: 'transaction', label: 'Lançamentos', selfReference: 'reimbursesTransactionId' },
  { model: 'transactionSplit', label: 'Divisões' },
  { model: 'transactionTag', label: 'Tags dos lançamentos' },
  { model: 'budget', label: 'Orçamentos' },
  { model: 'goal', label: 'Metas' },
  { model: 'categoryRule', label: 'Regras de categoria' },
  { model: 'investmentTransaction', label: 'Aportes e resgates' },
  { model: 'priceHistory', label: 'Cotações' },
  { model: 'allocationTarget', label: 'Alvos de alocação' },
] as const;

export const BACKUP_MODEL_NAMES: readonly string[] = BACKUP_MODELS.map((m) => m.model);

/** Ordem segura para apagar: filho antes de pai. */
export function wipeOrder(): readonly string[] {
  return [...BACKUP_MODEL_NAMES].reverse();
}

/**
 * Nível 1 da zona de risco — "apagar lançamentos". Zera movimentação, fatura,
 * importação e carteira, mas mantém conta, cartão, categoria e tag, para dar
 * para recomeçar sem reconfigurar tudo.
 *
 * Orçamento, meta, recorrência, regra de categoria e alvo de alocação são
 * configuração, não movimento: continuam de pé. Já está em ordem de exclusão.
 */
export const MOVEMENT_MODELS: readonly string[] = [
  'importRow',
  'importBatch',
  'transactionTag',
  'transactionSplit',
  'transaction',
  'purchase',
  'invoice',
  'priceHistory',
  'investmentTransaction',
  'investment',
] as const;

/** Nível 2 — "excluir conta": tudo do domínio, staging inclusive. */
export function fullWipeOrder(): readonly string[] {
  const staging = ['importRow', 'importBatch'];
  return [...staging, ...wipeOrder()];
}

// ─── Formato do arquivo ───────────────────────────────────────────────────────

/** Perfil e preferências viajam junto, mas nunca credencial. */
export const backupProfileSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  theme: z.string().nullable().optional(),
  accentColor: z.string().nullable().optional(),
  notifyInvoiceDue: z.boolean().optional(),
  notifyBudgetExceeded: z.boolean().optional(),
  notifyGoalReached: z.boolean().optional(),
  notifyForecastDue: z.boolean().optional(),
  notifyDaysBefore: z.number().int().optional(),
});
export type BackupProfile = z.infer<typeof backupProfileSchema>;

export const backupFileSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number().int().positive(),
  exportedAt: z.string(),
  profile: backupProfileSchema.optional(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type BackupFile = z.infer<typeof backupFileSchema>;

export interface BackupCheck {
  ok: boolean;
  problems: string[];
  /** Seções que este build não conhece — ignoradas na restauração, não erro. */
  unknownModels: string[];
  counts: { model: string; label: string; count: number }[];
  totalRecords: number;
}

/**
 * Valida um arquivo enviado antes de encostar no banco. Seção desconhecida é
 * aviso, não erro: um backup mais novo ainda restaura o que este build entende.
 */
export function checkBackupFile(value: unknown): BackupCheck {
  const parsed = backupFileSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      problems: ['Arquivo não é um backup do Cifrão.'],
      unknownModels: [],
      counts: [],
      totalRecords: 0,
    };
  }

  const file = parsed.data;
  const problems: string[] = [];
  if (file.version > BACKUP_VERSION) {
    problems.push(
      `Backup na versão ${file.version}, e este Cifrão lê até a ${BACKUP_VERSION}. Atualize o app antes de restaurar.`,
    );
  }

  const known = new Set<string>(BACKUP_MODEL_NAMES);
  const unknownModels = Object.keys(file.data).filter((k) => !known.has(k));
  const counts = summarizeBackup(file.data);
  const totalRecords = counts.reduce((acc, c) => acc + c.count, 0);
  if (totalRecords === 0) problems.push('O backup não tem nenhum registro.');

  return { ok: problems.length === 0, problems, unknownModels, counts, totalRecords };
}

/** Contagem por seção, na ordem da restauração, só do que tem linha. */
export function summarizeBackup(
  data: Record<string, unknown[]>,
): { model: string; label: string; count: number }[] {
  return BACKUP_MODELS.map((m) => ({
    model: m.model,
    label: m.label,
    count: Array.isArray(data[m.model]) ? data[m.model].length : 0,
  })).filter((c) => c.count > 0);
}

// ─── Auto-referência ──────────────────────────────────────────────────────────

/**
 * Ordena linhas de uma tabela que aponta para ela mesma (categoria com
 * subcategoria) de modo que o pai sempre venha antes do filho.
 *
 * Tolerante de propósito: pai fora do lote sai como raiz, e ciclo não trava — as
 * linhas restantes saem na ordem original em vez de a restauração pendurar.
 */
export function sortByParent<T extends Record<string, unknown>>(
  rows: readonly T[],
  idKey = 'id',
  parentKey = 'parentId',
): T[] {
  const present = new Set(rows.map((r) => String(r[idKey])));
  const emitted = new Set<string>();
  const out: T[] = [];
  let pending = [...rows];

  while (pending.length > 0) {
    const ready = pending.filter((r) => {
      const parent = r[parentKey];
      if (parent === null || parent === undefined) return true;
      const parentId = String(parent);
      return !present.has(parentId) || emitted.has(parentId);
    });

    // Nada ficou pronto: só sobra ciclo. Solta o resto como está.
    if (ready.length === 0) {
      out.push(...pending);
      break;
    }

    for (const row of ready) {
      out.push(row);
      emitted.add(String(row[idKey]));
    }
    const readySet = new Set(ready);
    pending = pending.filter((r) => !readySet.has(r));
  }

  return out;
}

/** Separa o vínculo de auto-referência para gravá-lo num segundo passe. */
export function splitSelfReference<T extends Record<string, unknown>>(
  rows: readonly T[],
  field: string,
  idKey = 'id',
): { rows: Record<string, unknown>[]; links: { id: string; value: string }[] } {
  const links: { id: string; value: string }[] = [];
  const stripped = rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    const value = copy[field];
    if (typeof value === 'string' && value.length > 0) {
      links.push({ id: String(copy[idKey]), value });
      copy[field] = null;
    }
    return copy;
  });
  return { rows: stripped, links };
}
