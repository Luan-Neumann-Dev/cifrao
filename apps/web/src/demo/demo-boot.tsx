'use client';

import { installDemoClock } from './clock';
import { IS_DEMO } from './is-demo';

// No carregamento do módulo, antes de qualquer tela calcular "o mês atual" —
// no servidor (SSR) e no navegador.
if (IS_DEMO) installDemoClock();

/** Montado no layout raiz só no build da demo. Não desenha nada. */
export function DemoBoot() {
  return null;
}
