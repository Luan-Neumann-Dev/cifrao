'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { type Profile, api } from '@/lib/api';
import { SectionTitle } from './perfil-section';

type PrefKey = 'notifyInvoiceDue' | 'notifyBudgetExceeded' | 'notifyGoalReached' | 'notifyForecastDue';

const AVISOS: { key: PrefKey; label: string; hint: string }[] = [
  {
    key: 'notifyInvoiceDue',
    label: 'Fatura vencendo',
    hint: 'Avisa antes do vencimento e enquanto continuar em aberto depois dele.',
  },
  {
    key: 'notifyBudgetExceeded',
    label: 'Orçamento no limite',
    hint: 'Amarelo a partir de 80% do limite do mês, vermelho quando estoura.',
  },
  {
    key: 'notifyGoalReached',
    label: 'Meta alcançada',
    hint: 'Quando o saldo da conta vinculada cobre o alvo.',
  },
  {
    key: 'notifyForecastDue',
    label: 'Previsto a confirmar',
    hint: 'Lançamento de recorrência esperando confirmação.',
  },
];

/**
 * Preferências de aviso (Fase 9). Decisão do dono: não há e-mail nem push — os
 * avisos são derivados sob demanda e aparecem no sino do topo. Salva a cada
 * clique, porque um botão "salvar" para quatro interruptores só atrapalha.
 */
export function AvisosSection({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
}) {
  const [dias, setDias] = useState(String(profile.notifyDaysBefore));
  const [salvando, setSalvando] = useState(false);

  async function salvar(patch: Record<string, boolean | number>) {
    setSalvando(true);
    try {
      onSaved(
        await api<Profile>('/settings/notifications', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        }),
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function salvarDias(valor: string) {
    setDias(valor);
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero < 0 || numero > 30) return;
    void salvar({ notifyDaysBefore: numero });
  }

  return (
    <Card id="avisos" className="scroll-mt-20 space-y-4">
      <SectionTitle
        title="Avisos"
        hint="Aparecem no sino do topo. Nada é enviado por e-mail nem por push."
      />

      <ul className="divide-y divide-line">
        {AVISOS.map((aviso) => (
          <li key={aviso.key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{aviso.label}</p>
              <p className="text-xs text-ink-2">{aviso.hint}</p>
            </div>
            <Switch
              label={aviso.label}
              checked={profile[aviso.key]}
              disabled={salvando}
              onCheckedChange={(checked) => void salvar({ [aviso.key]: checked })}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-surface-2 px-3 py-3">
        <div className="space-y-1">
          <Label htmlFor="avisos-dias">Antecedência</Label>
          <Input
            id="avisos-dias"
            type="number"
            min={0}
            max={30}
            value={dias}
            onChange={(e) => salvarDias(e.target.value)}
            className="w-24 font-manrope tabular-nums"
          />
        </div>
        {/* Em 380px o texto não divide a linha com o campo: quebra embaixo. */}
        <p className="basis-full text-xs text-ink-2 sm:basis-0 sm:flex-1">
          Dias de antecedência para fatura e previsto. Com 0, o aviso só aparece no próprio dia.
        </p>
      </div>
    </Card>
  );
}
