'use client';

import { useEffect } from 'react';
import { type Profile, api } from '@/lib/api';
import { type ThemePreference, applyAndStoreAppearance, isThemePreference } from '@/lib/theme';

/**
 * O servidor é a fonte da verdade da aparência (Fase 9): o tema escolhido no
 * celular vale no computador também. O `localStorage` é só a cópia que o script
 * de boot lê para não piscar branco — e é essa cópia que sincronizamos aqui.
 */
export function ThemeSync() {
  useEffect(() => {
    void api<Profile>('/settings')
      .then((profile) => {
        const theme: ThemePreference = isThemePreference(profile.theme) ? profile.theme : 'system';
        applyAndStoreAppearance({ theme, accentColor: profile.accentColor });
      })
      .catch(() => {
        // Sem rede (ou offline no PWA), a cópia local já pintou a tela.
      });
  }, []);
  return null;
}
