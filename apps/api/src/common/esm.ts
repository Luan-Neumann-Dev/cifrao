/**
 * Carregador de módulos ESM a partir do bundle CommonJS da API.
 *
 * `pg-boss` e `ofx-js` são publicados só como ESM, mas a API compila para
 * CommonJS e roda no Node 20 — onde `require()` de um módulo ESM quebra. Um
 * `import()` normal seria rebaixado para `require` pelo TypeScript; o
 * `new Function` impede essa transformação.
 *
 * Os tipos continuam corretos porque cada chamador usa `import type` (apagado na
 * compilação) para descrever o que espera. Quando a API virar ESM — ou o Node 22
 * for o mínimo — este arquivo some.
 */
const dynamicImport = new Function('specifier', 'return import(specifier)') as <T>(
  specifier: string,
) => Promise<T>;

const cache = new Map<string, unknown>();

/** Importa (uma vez por processo) um módulo ESM. */
export async function importEsm<T>(specifier: string): Promise<T> {
  const cached = cache.get(specifier);
  if (cached) return cached as T;

  let loaded: T;
  try {
    // Sob o Vitest o código roda como ESM e este é um import dinâmico de
    // verdade. Já compilado para CommonJS, o TypeScript rebaixa esta linha para
    // `require`, que falha em módulo ESM — daí o fallback abaixo.
    loaded = (await import(/* @vite-ignore */ specifier)) as T;
  } catch {
    loaded = await dynamicImport<T>(specifier);
  }

  cache.set(specifier, loaded);
  return loaded;
}
