import { defineConfig } from 'vitest/config';

/**
 * Suíte e2e — roda contra web + API NO AR (não sobe nada sozinha), por isso fica
 * fora do `pnpm test`. Como rodar está no topo de `test/cross-user.e2e.test.ts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.e2e.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Um cenário só, em ordem: os passos dependem do estado dos anteriores.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
