'use client';

import { formatInSaoPaulo } from '@cifrao/shared';
import { KeyRound, Lock, ShieldCheck, ShieldOff } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { type Profile, api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

/** Perfil: nome, e-mail e o estado do 2FA. Senha e 2FA vivem no Better Auth. */
export function PerfilSection({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
}) {
  const [name, setName] = useState(profile.name ?? '');
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== (profile.name ?? '').trim();

  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const updated = await api<Profile>('/settings/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      onSaved(updated);
      toast.success('Perfil atualizado.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const twoFactor = profile.twoFactorEnabled === true;

  return (
    <Card id="perfil" className="scroll-mt-20 space-y-4">
      <SectionTitle title="Perfil" hint="Quem usa o app. É um usuário só, por decisão de projeto." />

      <form className="grid gap-3 sm:grid-cols-2" onSubmit={salvar}>
        <div className="space-y-1">
          <Label htmlFor="perfil-nome">Nome</Label>
          <Input
            id="perfil-nome"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="perfil-email">E-mail</Label>
          <Input id="perfil-email" value={profile.email} readOnly className="opacity-70" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={!dirty || saving}>
            {saving ? 'Salvando…' : 'Salvar nome'}
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-surface-2 px-3 py-3">
        <div className="flex items-center gap-2">
          <span
            className={
              twoFactor
                ? 'grid h-8 w-8 place-items-center rounded-full bg-[color-mix(in_srgb,var(--positive)_16%,transparent)] text-positive'
                : 'grid h-8 w-8 place-items-center rounded-full bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] text-warn'
            }
          >
            {twoFactor ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-sm font-medium text-ink">
              {twoFactor ? 'Verificação em duas etapas ativa' : 'Verificação em duas etapas desligada'}
            </p>
            <p className="text-xs text-ink-2">
              {twoFactor
                ? 'O login pede o código do autenticador.'
                : 'Sem 2FA, só a senha protege o histórico inteiro.'}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/configurar-2fa">
            <KeyRound className="h-4 w-4" />
            {twoFactor ? 'Gerenciar' : 'Ativar agora'}
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-surface-2 px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-primary">
            <Lock className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">Senha</p>
            <p className="text-xs text-ink-2">
              Trocar aqui exige a senha atual — não depende de e-mail.
            </p>
          </div>
        </div>
        <ChangePasswordDialog>
          <Button variant="ghost" size="sm">
            Alterar
          </Button>
        </ChangePasswordDialog>
      </div>

      <p className="text-xs text-ink-2">
        Conta criada em {formatInSaoPaulo(new Date(profile.createdAt))}.
      </p>
    </Card>
  );
}

/**
 * Troca de senha pelo Better Auth. Existe porque a recuperação por e-mail
 * depende de um provedor de envio que o projeto não tem (pendência da Fase 1):
 * sem esta tela, a única saída seria mexer no banco à mão.
 */
function ChangePasswordDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (nova !== repetida) {
      toast.error('As duas senhas novas não são iguais.');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: atual,
        newPassword: nova,
        // Trocar a senha derruba os outros aparelhos: é o motivo de trocar.
        revokeOtherSessions: true,
      });
      if (error) throw new Error(error.message ?? 'Não consegui trocar a senha.');
      toast.success('Senha alterada. As outras sessões foram encerradas.');
      setOpen(false);
      setAtual('');
      setNova('');
      setRepetida('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Alterar senha">
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="senha-atual">Senha atual</Label>
            <Input
              id="senha-atual"
              type="password"
              required
              autoComplete="current-password"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="senha-nova">Nova senha</Label>
            <Input
              id="senha-nova"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="senha-repetida">Repita a nova senha</Label>
            <Input
              id="senha-repetida"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Alterar senha'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
      <p className="text-sm text-ink-2">{hint}</p>
    </div>
  );
}
