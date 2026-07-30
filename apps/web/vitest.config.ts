import { defineConfig } from 'vitest/config';

// Testes de lógica pura do web (ex.: gate de registro). Sem DOM por enquanto.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
