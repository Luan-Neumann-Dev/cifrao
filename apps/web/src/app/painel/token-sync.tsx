'use client';

import { useEffect } from 'react';
import { IS_DEMO } from '@/demo/is-demo';
import { syncApiToken } from '@/lib/session-actions';

/**
 * Garante que o cookie httpOnly com o JWT esteja presente/atualizado ao entrar
 * na área autenticada. É esse cookie que o Nest lê (via proxy) para validar.
 */
export function TokenSync() {
  useEffect(() => {
    if (IS_DEMO) return; // sem conta na demonstração
    void syncApiToken();
  }, []);
  return null;
}
