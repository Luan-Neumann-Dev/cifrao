import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Testes de lógica pura do web (agrupamento, formatação, tema). Sem DOM.
export default defineConfig({
  resolve: {
    // Mesmo alias do tsconfig: sem isso, um helper que importa outro por "@/"
    // quebra só no teste.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
