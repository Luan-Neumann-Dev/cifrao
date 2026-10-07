import { Prisma } from '@cifrao/db';
import { BACKUP_MODEL_NAMES, fullWipeOrder } from '@cifrao/shared';
import { describe, expect, it } from 'vitest';
import { ownerWhere } from './backup.service';

/**
 * O `ownerWhere` é chamado por nome de model, num delegate genérico — o
 * compilador não confere se o campo existe. Foi assim que `importRow` (que não
 * tem `userId`) quebrou o "excluir conta" de todo mundo com um 500. Este teste
 * lê o schema real pelo DMMF e exige que cada recorte use campos que existem e
 * chegue ao `userId` de alguém.
 */
const models = Prisma.dmmf.datamodel.models;

function meta(model: string) {
  const name = model.charAt(0).toUpperCase() + model.slice(1);
  const found = models.find((m) => m.name === name);
  if (!found) throw new Error(`Model desconhecido: ${name}`);
  return found;
}

/** Confere o `where` contra o model e devolve se ele filtra por `userId`. */
function checkWhere(modelName: string, where: Record<string, unknown>): boolean {
  const m = meta(modelName);
  let scoped = false;
  for (const [key, value] of Object.entries(where)) {
    if (key === 'OR' || key === 'AND') {
      const parts = value as Record<string, unknown>[];
      scoped = parts.every((part) => checkWhere(modelName, part)) || scoped;
      continue;
    }
    const field = m.fields.find((f) => f.name === key);
    expect(field, `${m.name}.${key} não existe no schema`).toBeDefined();
    if (field?.kind === 'object') {
      const related = field.type.charAt(0).toLowerCase() + field.type.slice(1);
      scoped = checkWhere(related, value as Record<string, unknown>) || scoped;
    } else if (key === 'userId') {
      scoped = true;
    }
  }
  return scoped;
}

const ALL = [...new Set([...BACKUP_MODEL_NAMES, ...fullWipeOrder()])];

describe('ownerWhere — recorte do dono por model', () => {
  for (const model of ALL) {
    for (const scope of ['export', 'delete'] as const) {
      it(`${model} (${scope}) usa campos que existem e chega ao userId`, () => {
        expect(checkWhere(model, ownerWhere(model, 'u1', scope))).toBe(true);
      });
    }
  }
});
