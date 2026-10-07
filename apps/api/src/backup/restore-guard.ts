import { Prisma } from '@cifrao/db';
import { BACKUP_MODELS, type BackupFile } from '@cifrao/shared';
import { ownerWhere } from './backup.service';

/**
 * Trava de dono da restauração.
 *
 * Reescrever o `userId` de cada linha não basta. O arquivo é escrito por quem
 * restaura, e dois caminhos deixariam esse arquivo alcançar o dado de outro:
 *
 *  1. **Referência alheia** — uma meta com `linkedAccountId` da conta de outra
 *     pessoa passa a ler o saldo dela; uma divisão com `transactionId` alheio
 *     se pendura no lançamento dela (divisão não tem `userId` próprio).
 *  2. **Id alheio** — o `createMany` usa `skipDuplicates`, então uma linha com
 *     o id de um registro de outro dono é pulada em silêncio, e as referências
 *     do arquivo para aquele id passam a apontar para o registro de verdade.
 *
 * Regra: todo id do arquivo é novo ou já é de quem restaura; toda referência
 * aponta para uma linha do próprio arquivo ou para algo de quem restaura (as
 * categorias universais contam como de todos). Qualquer exceção recusa o
 * arquivo inteiro — restaurar pela metade seria pior.
 *
 * As relações vêm do DMMF, como os tipos em `model-fields.ts`: campo novo no
 * schema já entra na conferência sem ninguém lembrar de listá-lo.
 */

/** Teto de parâmetros por consulta, folgado sob o limite do Postgres. */
const IN_CHUNK = 5000;

type Finder = {
  findMany: (args: { where: unknown; select: { id: true } }) => Promise<{ id: string }[]>;
};
export type GuardDb = Record<string, Finder | unknown>;

export class RestoreOwnershipError extends Error {}

interface ForeignKey {
  column: string;
  /** Delegate do model apontado, ex.: 'account'. */
  target: string;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function meta(model: string) {
  const name = model.charAt(0).toUpperCase() + model.slice(1);
  const found = Prisma.dmmf.datamodel.models.find((m) => m.name === name);
  if (!found) throw new Error(`Model desconhecido no schema: ${name}`);
  return found;
}

/** Colunas que apontam para outro registro do domínio (o `userId` é reescrito). */
export function foreignKeys(model: string): ForeignKey[] {
  const keys: ForeignKey[] = [];
  for (const field of meta(model).fields) {
    if (field.kind !== 'object' || field.type === 'User') continue;
    const from = field.relationFromFields ?? [];
    if (from.length !== 1) continue;
    keys.push({ column: from[0], target: lowerFirst(field.type) });
  }
  return keys;
}

function hasId(model: string): boolean {
  return meta(model).fields.some((f) => f.name === 'id');
}

function finder(db: GuardDb, model: string): Finder {
  const found = db[model] as Finder | undefined;
  if (!found?.findMany) throw new Error(`Delegate não encontrado: ${model}`);
  return found;
}

async function findIds(db: GuardDb, model: string, ids: string[], where: unknown) {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const slice = ids.slice(i, i + IN_CHUNK);
    const rows = await finder(db, model).findMany({
      where: { AND: [{ id: { in: slice } }, where] },
      select: { id: true },
    });
    for (const row of rows) found.add(row.id);
  }
  return found;
}

const labelOf = (model: string) => BACKUP_MODELS.find((m) => m.model === model)?.label ?? model;

export async function assertRestoreOwnership(
  db: GuardDb,
  file: BackupFile,
  userId: string,
): Promise<void> {
  // Ids que o próprio arquivo cria, por model.
  const fileIds = new Map<string, Set<string>>();
  for (const { model } of BACKUP_MODELS) {
    const rows = file.data[model];
    if (!Array.isArray(rows) || !hasId(model)) continue;
    const ids = new Set<string>();
    for (const row of rows) if (typeof row.id === 'string') ids.add(row.id);
    fileIds.set(model, ids);
  }

  // 1. Nenhum id do arquivo pode ser de um registro de outro dono.
  for (const [model, ids] of fileIds) {
    if (ids.size === 0) continue;
    const foreign = await findIds(db, model, [...ids], {
      NOT: ownerWhere(model, userId, 'export'),
    });
    if (foreign.size > 0) {
      throw new RestoreOwnershipError(
        `O arquivo traz ${foreign.size} registro(s) de "${labelOf(model)}" que pertencem a outro usuário.`,
      );
    }
  }

  // 2. Toda referência fica dentro do arquivo ou no dado de quem restaura.
  const outside = new Map<string, Set<string>>();
  for (const { model } of BACKUP_MODELS) {
    const rows = file.data[model];
    if (!Array.isArray(rows)) continue;
    for (const { column, target } of foreignKeys(model)) {
      for (const row of rows) {
        const value = row[column];
        if (typeof value !== 'string' || fileIds.get(target)?.has(value)) continue;
        if (!outside.has(target)) outside.set(target, new Set());
        outside.get(target)!.add(value);
      }
    }
  }
  for (const [target, ids] of outside) {
    const owned = await findIds(db, target, [...ids], ownerWhere(target, userId, 'export'));
    const missing = [...ids].filter((id) => !owned.has(id));
    if (missing.length > 0) {
      throw new RestoreOwnershipError(
        `O arquivo aponta para ${missing.length} registro(s) de "${labelOf(target)}" que não são seus nem estão no arquivo.`,
      );
    }
  }
}
