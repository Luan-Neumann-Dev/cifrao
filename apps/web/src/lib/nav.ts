/**
 * Qual item do menu fica marcado (Fase 9 — sidebar).
 *
 * `/painel` só acende no exato, senão ficaria aceso em todas as telas, já que
 * toda rota começa com ele. As outras acendem também nas telas filhas: no
 * detalhe do cartão (`/painel/cartoes/[id]`) o menu continua mostrando onde
 * você está.
 */
export function isActiveNavLink(pathname: string, href: string): boolean {
  if (href === '/painel') return pathname === '/painel';
  return pathname === href || pathname.startsWith(`${href}/`);
}
