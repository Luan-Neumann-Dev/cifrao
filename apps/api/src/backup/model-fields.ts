import { Prisma } from '@cifrao/db';

/**
 * Tipos das colunas lidos do próprio schema, via DMMF do Prisma.
 *
 * Por que não uma lista escrita à mão: o JSON não carrega BigInt nem Date, então
 * a restauração precisa saber quais colunas converter de volta. Uma lista fixa
 * ficaria desatualizada no dia em que alguém somasse um campo ao schema — e o
 * sintoma seria um backup que restaura com valor errado, não um erro de compilar.
 * Lendo do DMMF, campo novo já entra certo.
 */
export interface ModelFields {
  bigint: ReadonlySet<string>;
  date: ReadonlySet<string>;
  /** Colunas graváveis (escalares e enums). Relação não entra. */
  columns: readonly string[];
}

const cache = new Map<string, ModelFields>();

/** `model` é o nome do delegate do client (camelCase), ex.: 'creditCard'. */
export function modelFields(model: string): ModelFields {
  const cached = cache.get(model);
  if (cached) return cached;

  const dmmfName = model.charAt(0).toUpperCase() + model.slice(1);
  const meta = Prisma.dmmf.datamodel.models.find((m) => m.name === dmmfName);
  if (!meta) throw new Error(`Model desconhecido no schema: ${dmmfName}`);

  const bigint = new Set<string>();
  const date = new Set<string>();
  const columns: string[] = [];
  for (const field of meta.fields) {
    if (field.kind !== 'scalar' && field.kind !== 'enum') continue;
    columns.push(field.name);
    if (field.type === 'BigInt') bigint.add(field.name);
    if (field.type === 'DateTime') date.add(field.name);
  }

  const fields: ModelFields = { bigint, date, columns };
  cache.set(model, fields);
  return fields;
}

/**
 * Devolve a linha pronta para gravar: só colunas conhecidas, BigInt de volta a
 * BigInt e data de volta a Date. Coluna que o backup não tem fica de fora, para
 * o default do banco valer.
 */
export function reviveRow(model: string, row: Record<string, unknown>): Record<string, unknown> {
  const fields = modelFields(model);
  const out: Record<string, unknown> = {};

  for (const column of fields.columns) {
    if (!(column in row)) continue;
    const value = row[column];
    if (value === null || value === undefined) {
      out[column] = null;
      continue;
    }
    if (fields.bigint.has(column)) {
      out[column] = toBigInt(value, model, column);
      continue;
    }
    if (fields.date.has(column)) {
      out[column] = toDate(value, model, column);
      continue;
    }
    out[column] = value;
  }

  return out;
}

function toBigInt(value: unknown, model: string, column: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error(`${model}.${column}: "${String(value)}" não é um inteiro em centavos.`);
}

function toDate(value: unknown, model: string, column: string): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  throw new Error(`${model}.${column}: "${String(value)}" não é uma data válida.`);
}
