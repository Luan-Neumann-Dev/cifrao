import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Alias para consumir o código-fonte de @cifrao/shared nos testes sem
// depender do build (dist). Em runtime/build normal resolve para dist.
const sharedSrc = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@cifrao/shared': sharedSrc,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
