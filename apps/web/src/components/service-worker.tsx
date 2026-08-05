'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker do PWA (Fase 9).
 *
 * Só em produção: em desenvolvimento o SW ficaria servindo bundle velho do cache
 * e transformando "salvei o arquivo e não mudou nada" em caça-fantasma. Se já
 * houver um registrado na máquina de dev (de um `next start` anterior), ele é
 * removido aqui mesmo.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      return;
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
        console.warn('[cifrao] service worker não registrado:', err);
      });
    };

    // Depois do load: registrar durante a montagem disputa banda com o app.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
