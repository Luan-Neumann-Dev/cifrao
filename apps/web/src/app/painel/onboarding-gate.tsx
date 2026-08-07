'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { type OnboardingStatus, api } from '@/lib/api';

/**
 * Conta recém-criada, sem nenhuma conta bancária cadastrada, cai nos primeiros
 * passos. A checagem é no cliente porque é aqui que o cookie do JWT já existe —
 * e falhar silenciosamente é o certo: sem rede, o painel abre normalmente em vez
 * de prender o usuário numa tela em branco.
 */
export function OnboardingGate() {
  const router = useRouter();

  // Uma vez por entrada na área autenticada; navegar entre telas não reconsulta.
  useEffect(() => {
    let alive = true;
    api<OnboardingStatus>('/settings/onboarding')
      .then((status) => {
        if (alive && status.needsOnboarding) router.replace('/bem-vindo');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [router]);

  return null;
}
