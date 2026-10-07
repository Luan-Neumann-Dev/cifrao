import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/lib/require-session';
import { PrivacyProvider } from '@/lib/privacy';
import { OnboardingGate } from './onboarding-gate';
import { ThemeSync } from './theme-sync';
import { TokenSync } from './token-sync';

// Área autenticada: sem sessão, volta para o login (checagem no servidor).
export default async function PainelLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <PrivacyProvider>
      <AppShell>
        <TokenSync />
        <ThemeSync />
        <OnboardingGate />
        {children}
      </AppShell>
    </PrivacyProvider>
  );
}
