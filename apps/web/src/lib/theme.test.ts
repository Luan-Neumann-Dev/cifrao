import { describe, expect, it } from 'vitest';
import {
  ACCENT_STORAGE_KEY,
  type Appearance,
  DEFAULT_ACCENT,
  THEME_BOOTSTRAP_SCRIPT,
  THEME_STORAGE_KEY,
  type ThemeTarget,
  applyAppearance,
  isHexColor,
  normalizeAccent,
  resolveTheme,
} from './theme';

/** `<html>` de mentira: o Vitest do web roda em `node`, sem DOM. */
function fakeHtml() {
  const attrs = new Map<string, string>();
  const props = new Map<string, string>();
  const target: ThemeTarget = {
    setAttribute: (name, value) => void attrs.set(name, value),
    removeAttribute: (name) => void attrs.delete(name),
    style: {
      setProperty: (property, value) => void props.set(property, value),
      removeProperty: (property) => void props.delete(property),
    },
  };
  return { target, attrs, props };
}

const appearance = (over: Partial<Appearance> = {}): Appearance => ({
  theme: 'system',
  accentColor: null,
  ...over,
});

describe('tema (Fase 9)', () => {
  it('system segue o sistema operacional', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('escolha explícita ignora o sistema operacional', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('escreve data-theme no alvo', () => {
    const { target, attrs } = fakeHtml();
    applyAppearance(target, appearance({ theme: 'dark' }), false);
    expect(attrs.get('data-theme')).toBe('dark');
  });
});

describe('cor de acento (Fase 9)', () => {
  it('aceita só hexadecimal de 6 dígitos', () => {
    expect(isHexColor('#820AD1')).toBe(true);
    expect(isHexColor('#820ad1')).toBe(true);
    expect(isHexColor('820AD1')).toBe(false);
    expect(isHexColor('#82D1')).toBe(false);
    expect(isHexColor('roxo')).toBe(false);
  });

  it('a cor padrão não vira override — os tokens do design system continuam valendo', () => {
    expect(normalizeAccent(DEFAULT_ACCENT)).toBeNull();
    expect(normalizeAccent('#820ad1')).toBeNull();
  });

  it('cor inválida é descartada em vez de virar variável quebrada', () => {
    expect(normalizeAccent('rgb(1,2,3)')).toBeNull();
    expect(normalizeAccent('')).toBeNull();
    expect(normalizeAccent(null)).toBeNull();
  });

  it('cor personalizada vira data-accent + --accent', () => {
    const { target, attrs, props } = fakeHtml();
    applyAppearance(target, appearance({ accentColor: '#0f62fe' }), false);
    expect(attrs.get('data-accent')).toBe('#0F62FE');
    expect(props.get('--accent')).toBe('#0F62FE');
  });

  it('voltar para o padrão limpa o override', () => {
    const { target, attrs, props } = fakeHtml();
    applyAppearance(target, appearance({ accentColor: '#0f62fe' }), false);
    applyAppearance(target, appearance({ accentColor: DEFAULT_ACCENT }), false);
    expect(attrs.has('data-accent')).toBe(false);
    expect(props.has('--accent')).toBe(false);
  });

  it('o script de boot usa as mesmas chaves e atributos do aplicador', () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(ACCENT_STORAGE_KEY);
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('data-theme');
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('data-accent');
    // Precisa caber numa tag inline sem fechar o script por acidente.
    expect(THEME_BOOTSTRAP_SCRIPT).not.toContain('</script');
  });
});
