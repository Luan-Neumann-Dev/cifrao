import { describe, expect, it } from 'vitest';
import { isActiveNavLink } from './nav';

describe('item ativo do menu (Fase 9)', () => {
  it('Visão geral só acende na própria tela', () => {
    expect(isActiveNavLink('/painel', '/painel')).toBe(true);
    expect(isActiveNavLink('/painel/contas', '/painel')).toBe(false);
  });

  it('tela filha mantém a seção marcada', () => {
    expect(isActiveNavLink('/painel/cartoes/abc123', '/painel/cartoes')).toBe(true);
    expect(isActiveNavLink('/painel/importar/lote-1', '/painel/importar')).toBe(true);
  });

  it('prefixo parecido não acende a seção errada', () => {
    expect(isActiveNavLink('/painel/cartoes-antigos', '/painel/cartoes')).toBe(false);
    expect(isActiveNavLink('/painel/relatorios', '/painel/regras')).toBe(false);
  });
});
