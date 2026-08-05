'use client';

import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { type Profile, api } from '@/lib/api';
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  type ThemePreference,
  applyAndStoreAppearance,
  isHexColor,
  isThemePreference,
} from '@/lib/theme';
import { cn } from '@/lib/utils';
import { SectionTitle } from './perfil-section';

const TEMAS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
];

/**
 * Aparência (Fase 9): tema e cor de acento. A mudança é aplicada na hora, antes
 * de o servidor responder — trocar tema com um "salvando…" no meio é ruim de
 * usar, e se o PATCH falhar o `onSaved` nunca vem e o toast conta o problema.
 */
export function AparenciaSection({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
}) {
  const temaAtual: ThemePreference = isThemePreference(profile.theme) ? profile.theme : 'system';
  const acentoAtual = profile.accentColor ?? DEFAULT_ACCENT;
  const [customHex, setCustomHex] = useState(acentoAtual);
  const [salvando, setSalvando] = useState(false);

  async function aplicar(theme: ThemePreference, accentColor: string) {
    applyAndStoreAppearance({ theme, accentColor });
    setSalvando(true);
    try {
      const updated = await api<Profile>('/settings/profile', {
        method: 'PATCH',
        body: JSON.stringify({ theme, accentColor }),
      });
      onSaved(updated);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function aplicarHex(hex: string) {
    if (!isHexColor(hex)) {
      toast.error('Use uma cor hexadecimal, como #820AD1.');
      return;
    }
    void aplicar(temaAtual, hex.toUpperCase());
  }

  return (
    <Card id="aparencia" className="scroll-mt-20 space-y-4">
      <SectionTitle
        title="Aparência"
        hint="Vale em todos os aparelhos: fica guardado no perfil, não só neste navegador."
      />

      <div className="space-y-2">
        <Label>Tema</Label>
        <div className="flex gap-2">
          {TEMAS.map(({ value, label, icon: Icon }) => {
            const ativo = temaAtual === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => void aplicar(value, acentoAtual)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-[12px] border px-3 py-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--ring)]',
                  ativo
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-line text-ink-2 hover:bg-surface-2',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-ink-2">
          &quot;Sistema&quot; segue o modo escuro do aparelho automaticamente.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Cor de acento</Label>
        <div className="flex flex-wrap gap-2">
          {ACCENT_PRESETS.map((preset) => {
            const ativo = acentoAtual.toUpperCase() === preset.value.toUpperCase();
            return (
              <button
                key={preset.value}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                onClick={() => {
                  setCustomHex(preset.value);
                  void aplicar(temaAtual, preset.value);
                }}
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-full text-white transition-transform hover:scale-105 focus-visible:outline-none focus-visible:shadow-[var(--ring)]',
                  ativo && 'ring-2 ring-ink ring-offset-2 ring-offset-[var(--surface)]',
                )}
                style={{ background: preset.value }}
              >
                {ativo && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="space-y-1">
            <Label htmlFor="acento-hex">Outra cor</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Escolher cor"
                value={isHexColor(customHex) ? customHex : DEFAULT_ACCENT}
                onChange={(e) => setCustomHex(e.target.value.toUpperCase())}
                className="h-10 w-12 cursor-pointer rounded-[12px] border border-line bg-surface p-1"
              />
              <Input
                id="acento-hex"
                value={customHex}
                maxLength={7}
                onChange={(e) => setCustomHex(e.target.value)}
                className="w-32 font-manrope tabular-nums"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={salvando}
                onClick={() => aplicarHex(customHex)}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-ink-2">
          Só o roxo principal muda; hover, realce e foco são derivados dele. A cor vale nos dois
          temas.
        </p>
      </div>
    </Card>
  );
}
