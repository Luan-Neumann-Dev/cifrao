/**
 * Aparência (Fase 9): tema e cor de acento.
 *
 * Os campos `theme` e `accentColor` moram no `User` desde a Fase 1 e só agora
 * ganharam UI. O servidor é a fonte da verdade, mas o `localStorage` guarda uma
 * cópia para o boot: sem ela, a primeira pintura sairia no tema claro e o app
 * piscaria branco antes de a API responder.
 *
 * Nada aqui deriva cor em JavaScript. Só `--primary` é escrito; hover, soft,
 * ring e sombra saem por `color-mix` no `globals.css`, o que mantém os tokens
 * exatos do CLAUDE.md como padrão e evita duas fontes de verdade para a paleta.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Roxo do design system (Seção 4). Acento igual a ele = "sem personalização". */
export const DEFAULT_ACCENT = '#820AD1';

export const THEME_STORAGE_KEY = 'cifrao:theme';
export const ACCENT_STORAGE_KEY = 'cifrao:accent';

/** Sugestões da tela de aparência. Livre para digitar qualquer hexadecimal. */
export const ACCENT_PRESETS: readonly { value: string; label: string }[] = [
  { value: DEFAULT_ACCENT, label: 'Roxo Cifrão' },
  { value: '#0F62FE', label: 'Azul' },
  { value: '#0F9B8E', label: 'Verde-água' },
  { value: '#00A868', label: 'Verde' },
  { value: '#E5484D', label: 'Vermelho' },
  { value: '#F5A524', label: 'Âmbar' },
  { value: '#111827', label: 'Grafite' },
];

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** `system` segue o sistema operacional; os outros mandam. */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/** Acento igual ao padrão não vira override — os tokens originais ficam valendo. */
export function normalizeAccent(value: string | null | undefined): string | null {
  if (!value || !isHexColor(value)) return null;
  const upper = value.toUpperCase();
  return upper === DEFAULT_ACCENT ? null : upper;
}

/** Alvo mínimo do aplicador, para dar para testar sem DOM. */
export interface ThemeTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  style: {
    setProperty(property: string, value: string): void;
    removeProperty(property: string): void;
  };
}

export interface Appearance {
  theme: ThemePreference;
  accentColor: string | null;
}

/**
 * Escreve a aparência no `<html>`: `data-theme` para o tema resolvido e
 * `data-accent` + `--accent` para a cor personalizada.
 */
export function applyAppearance(
  target: ThemeTarget,
  appearance: Appearance,
  prefersDark: boolean,
): ResolvedTheme {
  const resolved = resolveTheme(appearance.theme, prefersDark);
  target.setAttribute('data-theme', resolved);

  const accent = normalizeAccent(appearance.accentColor);
  if (accent) {
    target.setAttribute('data-accent', accent);
    target.style.setProperty('--accent', accent);
  } else {
    target.removeAttribute('data-accent');
    target.style.removeProperty('--accent');
  }
  return resolved;
}

/**
 * Script que roda antes da primeira pintura (inline no `<head>`), para o app não
 * piscar claro antes de o React montar. É curto de propósito: lê o que ficou
 * guardado e escreve os mesmos atributos que `applyAppearance` escreve — a
 * derivação de cor continua sendo só CSS.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{
var e=document.documentElement;
var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';
var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
e.setAttribute('data-theme',d?'dark':'light');
var a=localStorage.getItem('${ACCENT_STORAGE_KEY}');
if(a&&/^#[0-9a-fA-F]{6}$/.test(a)&&a.toUpperCase()!=='${DEFAULT_ACCENT}'){
e.setAttribute('data-accent',a);e.style.setProperty('--accent',a);}
}catch(_){}})();`;

/** Lê o que o boot guardou. Fora do navegador, devolve o padrão. */
export function readStoredAppearance(): Appearance {
  if (typeof window === 'undefined') return { theme: 'system', accentColor: null };
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return {
    theme: isThemePreference(stored) ? stored : 'system',
    accentColor: normalizeAccent(window.localStorage.getItem(ACCENT_STORAGE_KEY)),
  };
}

export function storeAppearance(appearance: Appearance): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, appearance.theme);
  const accent = normalizeAccent(appearance.accentColor);
  if (accent) window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  else window.localStorage.removeItem(ACCENT_STORAGE_KEY);
}

/** Aplica no documento e guarda a cópia local. Usado pela tela de aparência. */
export function applyAndStoreAppearance(appearance: Appearance): void {
  if (typeof document === 'undefined') return;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyAppearance(document.documentElement, appearance, prefersDark);
  storeAppearance(appearance);
}
