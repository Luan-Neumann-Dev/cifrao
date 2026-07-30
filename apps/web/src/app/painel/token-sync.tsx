'use client';

import { useEffect } from 'react';
import { syncApiToken } from '@/lib/session-actions';

/**
 * Garante que o cookie httpOnly com o JWT esteja presente/atualizado ao entrar
 * na área autenticada. É esse cookie que o Nest lê (via proxy) para validar.
 */
export function TokenSync() {
  useEffect(() => {
    void syncApiToken();
  }, []);
  return null;
}
