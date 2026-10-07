'use client';

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'cifrao:privacidade';
/** O que substitui o número quando os valores estão escondidos. */
export const MASK = '••••';

interface PrivacyValue {
  hidden: boolean;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyValue>({ hidden: false, toggle: () => undefined });

/**
 * Modo privacidade: esconde os valores da tela para olhar o app em público.
 * Fica no `localStorage` (e não no servidor) de propósito — é uma decisão do
 * momento e do aparelho, não uma preferência de conta.
 */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  // Lê depois de montar: no servidor não existe localStorage, e ler durante a
  // renderização causaria divergência de hidratação.
  useEffect(() => {
    setHidden(window.localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  const toggle = useCallback(() => {
    setHidden((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  return <PrivacyContext.Provider value={{ hidden, toggle }}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyValue {
  return useContext(PrivacyContext);
}

/**
 * Formata dinheiro respeitando o modo privacidade. Recebe o formatador para não
 * amarrar este módulo ao `brl` — e para dar o mesmo tratamento a `brlShort`.
 */
export function maskMoney(hidden: boolean, formatted: string): string {
  if (!hidden) return formatted;
  // Preserva o "R$ " para a linha não perder a forma ao esconder.
  return formatted.replace(/[\d.,]+/, MASK);
}
