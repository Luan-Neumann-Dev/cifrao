'use client';

import { ACCOUNT_TYPES } from '@cifrao/shared';
import {
  Check,
  CreditCard as CreditCardIcon,
  FileUp,
  Landmark,
  PenLine,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CreditCardVisual } from '@/components/credit-card-visual';
import { categoryIcon } from '@/components/category-icon';
import { type Account, type Category, type CreditCard, api } from '@/lib/api';
import { ACCOUNT_TYPE_LABEL } from '@/lib/accounts';
import { CARD_COLORS, DEFAULT_CARD_COLOR } from '@/lib/cards';
import { centsFromInput } from '@/lib/format';

interface StepDef {
  icon: LucideIcon;
  color: string;
  title: string;
  desc: string;
}

const STEPS: StepDef[] = [
  {
    icon: Landmark,
    color: 'var(--invest)',
    title: 'Sua primeira conta',
    desc: 'De onde o dinheiro entra e sai. Comece pela conta que você mais usa.',
  },
  {
    icon: CreditCardIcon,
    color: 'var(--primary)',
    title: 'Cadastre um cartão',
    desc: 'Pra acompanhar a fatura e as parcelas sem susto no fim do mês.',
  },
  {
    icon: FileUp,
    color: '#2563EB',
    title: 'Traga seus lançamentos',
    desc: 'Envie um extrato do banco e o Cifrão categoriza pra você — ou comece lançando na mão.',
  },
  {
    icon: Tags,
    color: '#EC4899',
    title: 'Suas categorias principais',
    desc: 'As que você mais usa ficam na frente no formulário. O resto o app aprende sozinho.',
  },
];

/** Bancos comuns por aqui, para não começar de uma tela em branco. */
const BANKS = [
  { name: 'Nubank', color: '#820AD1' },
  { name: 'Inter', color: '#FF7A00' },
  { name: 'Itaú', color: '#EC7000' },
  { name: 'Bradesco', color: '#CC092F' },
  { name: 'Banco do Brasil', color: '#FAE128' },
  { name: 'Caixa', color: '#0070AF' },
  { name: 'Santander', color: '#EC0000' },
  { name: 'C6 Bank', color: '#242424' },
];

export default function BemVindoPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [finishing, setFinishing] = useState(false);

  const reload = () => {
    void Promise.all([
      api<Account[]>('/accounts'),
      api<CreditCard[]>('/credit-cards'),
      api<Category[]>('/categories'),
    ])
      .then(([a, c, cat]) => {
        setAccounts(a);
        setCards(c);
        setCategories(cat);
      })
      .catch(() => undefined);
  };

  useEffect(reload, []);

  async function finish(message?: string) {
    setFinishing(true);
    try {
      await api('/settings/onboarding/concluir', { method: 'POST' });
      if (message) toast.success(message);
      router.push('/painel');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setFinishing(false);
    }
  }

  const def = STEPS[step];
  const Icon = def.icon;
  const last = step === STEPS.length - 1;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[460px] flex-col px-6 py-9">
      <div className="mb-7 flex items-center gap-2">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-primary font-manrope text-base font-extrabold text-white">
          $
        </span>
        <div className="flex flex-1 gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="h-[5px] flex-1 rounded-[3px] transition-colors"
              style={{ background: i <= step ? 'var(--primary)' : 'var(--track)' }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => finish('Você pode configurar depois nas Configurações.')}
          disabled={finishing}
          className="shrink-0 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
        >
          Pular tudo
        </button>
      </div>

      <div className="flex-1">
        <div
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-[18px]"
          style={{
            background: `color-mix(in srgb, ${def.color} 13%, transparent)`,
            color: def.color,
          }}
        >
          <Icon className="h-7 w-7" strokeWidth={1.85} />
        </div>
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-2">
          Passo {step + 1} de {STEPS.length}
        </div>
        <h1 className="mb-2 mt-2 font-manrope text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">
          {def.title}
        </h1>
        <p className="mb-6 text-[15px] leading-relaxed text-ink-2">{def.desc}</p>

        {step === 0 && <AccountStep accounts={accounts} onSaved={reload} />}
        {step === 1 && <CardStep cards={cards} onSaved={reload} />}
        {step === 2 && <ImportStep />}
        {step === 3 && <CategoryStep categories={categories} />}
      </div>

      <div className="mt-8 flex gap-2.5">
        <button
          type="button"
          onClick={() => (last ? finish() : setStep((s) => s + 1))}
          disabled={finishing}
          className="h-[52px] rounded-full border border-line px-[22px] text-[15px] font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          Pular
        </button>
        <button
          type="button"
          onClick={() =>
            last ? finish('Tudo pronto — bem-vindo ao Cifrão.') : setStep((s) => s + 1)
          }
          disabled={finishing}
          className="h-[52px] flex-1 rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {last ? 'Começar a usar' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}

function AccountStep({ accounts, onSaved }: { accounts: Account[]; onSaved: () => void }) {
  const [bank, setBank] = useState<(typeof BANKS)[number] | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof ACCOUNT_TYPES)[number]>('CHECKING');
  const [balance, setBalance] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      await api('/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim() || bank?.name || 'Conta',
          type,
          institution: bank?.name,
          color: bank?.color ?? DEFAULT_CARD_COLOR,
          initialBalanceCents: balance ? centsFromInput(balance) : 0,
        }),
      });
      toast.success('Conta criada.');
      setBank(null);
      setName('');
      setBalance('');
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (bank) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface p-3.5">
          <span
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] font-manrope text-[15px] font-extrabold text-white"
            style={{ background: bank.color }}
          >
            {bank.name[0]}
          </span>
          <span className="flex-1 font-manrope text-[15px] font-semibold text-ink">{bank.name}</span>
          <button
            type="button"
            onClick={() => setBank(null)}
            className="text-[13px] font-semibold text-ink-2 hover:text-ink"
          >
            trocar
          </button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Como chamar? Ex.: ${bank.name} · Conta`}
          className={INPUT}
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as (typeof ACCOUNT_TYPES)[number])}
          className={INPUT}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <input
          inputMode="decimal"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="Saldo de hoje (opcional)"
          className={INPUT}
        />
        <button
          type="button"
          onClick={create}
          disabled={saving}
          className="h-12 rounded-[14px] bg-primary text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? 'Criando…' : 'Criar conta'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {accounts.length > 0 && (
        <Created label={`${accounts.length} conta(s) criada(s)`} names={accounts.map((a) => a.name)} />
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {BANKS.map((b) => (
          <button
            key={b.name}
            type="button"
            onClick={() => setBank(b)}
            className="flex items-center gap-2.5 rounded-[14px] border border-line bg-surface p-3 text-left transition-colors hover:border-primary"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] font-manrope text-[13px] font-extrabold text-white"
              style={{ background: b.color }}
            >
              {b.name[0]}
            </span>
            <span className="min-w-0 flex-1 truncate font-manrope text-[13.5px] font-semibold text-ink">
              {b.name}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setBank({ name: '', color: DEFAULT_CARD_COLOR })}
        className="h-12 rounded-[14px] border border-dashed border-line text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-soft"
      >
        Outro banco ou carteira
      </button>
    </div>
  );
}

function CardStep({ cards, onSaved }: { cards: CreditCard[]; onSaved: () => void }) {
  const [nickname, setNickname] = useState('');
  const [last4, setLast4] = useState('');
  const [limit, setLimit] = useState('');
  const [closingDay, setClosingDay] = useState('28');
  const [dueDay, setDueDay] = useState('5');
  const [color, setColor] = useState(DEFAULT_CARD_COLOR);
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      await api('/credit-cards', {
        method: 'POST',
        body: JSON.stringify({
          nickname: nickname.trim() || 'Meu cartão',
          last4: last4 || undefined,
          limitCents: limit ? centsFromInput(limit) : 0,
          closingDay: Number(closingDay),
          dueDay: Number(dueDay),
          color,
        }),
      });
      toast.success('Cartão criado.');
      setNickname('');
      setLast4('');
      setLimit('');
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {cards.length > 0 && (
        <Created label={`${cards.length} cartão(ões) criado(s)`} names={cards.map((c) => c.nickname)} />
      )}
      <CreditCardVisual
        nickname={nickname || 'Apelido do cartão'}
        last4={last4}
        color={color}
        brand="VISA"
      >
        <div className="mt-4 flex gap-2">
          <span className="rounded-md bg-white/15 px-2.5 py-1 text-[11px]">
            fechamento {closingDay}
          </span>
          <span className="rounded-md bg-white/15 px-2.5 py-1 text-[11px]">
            vencimento {dueDay}
          </span>
        </div>
      </CreditCardVisual>

      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="Apelido — ex.: Nubank Roxinho"
        className={INPUT}
      />
      <div className="flex gap-2.5">
        <input
          inputMode="numeric"
          maxLength={4}
          value={last4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="Final"
          className={`${INPUT} w-24 font-mono`}
        />
        <input
          inputMode="decimal"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="Limite"
          className={INPUT}
        />
      </div>
      <div className="flex gap-2.5">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-ink-2">Fecha dia</span>
          <input
            inputMode="numeric"
            value={closingDay}
            onChange={(e) => setClosingDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
            className={INPUT}
          />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-ink-2">Vence dia</span>
          <input
            inputMode="numeric"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
            className={INPUT}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {CARD_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Cor ${c}`}
            onClick={() => setColor(c)}
            className="h-9 w-9 rounded-[11px] transition-shadow"
            style={{
              background: c,
              boxShadow:
                color === c ? `0 0 0 3px var(--surface), 0 0 0 5px ${c}` : 'inset 0 0 0 1px rgba(0,0,0,.08)',
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={create}
        disabled={saving}
        className="h-12 rounded-[14px] bg-primary text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {saving ? 'Criando…' : 'Criar cartão'}
      </button>
    </div>
  );
}

/**
 * O design oferecia "Conectar Open Finance", que este app não tem — sincronizar
 * banco é integração externa fora do escopo. Ficaram as duas portas que existem
 * de verdade: importar extrato (Fase 6) e lançar na mão.
 */
function ImportStep() {
  return (
    <div className="flex flex-col gap-2.5">
      <StepLink
        href="/painel/importar"
        icon={<FileUp className="h-[21px] w-[21px]" strokeWidth={1.85} />}
        title="Importar extrato"
        subtitle="OFX, CSV ou QIF — o Cifrão detecta duplicata e sugere categoria"
        primary
      />
      <StepLink
        href="/painel/lancamentos"
        icon={<PenLine className="h-[21px] w-[21px]" strokeWidth={1.85} />}
        title="Lançar na mão"
        subtitle="Rápido para começar com os gastos do mês"
      />
    </div>
  );
}

function CategoryStep({ categories }: { categories: Category[] }) {
  const expense = categories.filter((c) => c.kind === 'EXPENSE' || c.kind === 'BOTH').slice(0, 12);
  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {expense.map((c) => {
          const Icon = categoryIcon(c.icon);
          return (
            <span
              key={c.id}
              className="inline-flex h-[46px] items-center gap-2.5 rounded-[14px] border border-line bg-surface px-4"
            >
              <span
                className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px]"
                style={{
                  color: c.color ?? 'var(--ink-2)',
                  background: `color-mix(in srgb, ${c.color ?? 'var(--ink-2)'} 14%, transparent)`,
                }}
              >
                <Icon className="h-4 w-4" strokeWidth={1.85} />
              </span>
              <span className="text-sm font-semibold text-ink">{c.name}</span>
            </span>
          );
        })}
      </div>
      <p className="mt-3.5 text-[12.5px] leading-snug text-ink-2">
        As {categories.length} categorias brasileiras já vêm prontas. Pode criar, renomear e
        mesclar em{' '}
        <Link href="/painel/configuracoes" className="font-semibold text-primary hover:underline">
          Configurações
        </Link>
        .
      </p>
    </div>
  );
}

const INPUT =
  'h-12 w-full rounded-[14px] border border-line bg-surface px-4 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-2/60 focus:border-primary focus:shadow-[var(--ring)]';

function Created({ label, names }: { label: string; names: string[] }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[14px] bg-[color-mix(in_srgb,var(--positive)_12%,transparent)] px-4 py-3">
      <Check className="mt-px h-4 w-4 shrink-0 text-positive" strokeWidth={2.4} />
      <div className="min-w-0 text-[13px]">
        <div className="font-semibold text-ink">{label}</div>
        <div className="truncate text-ink-2">{names.join(' · ')}</div>
      </div>
    </div>
  );
}

function StepLink({
  href,
  icon,
  title,
  subtitle,
  primary,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-[16px] border p-4 transition-colors"
      style={{
        borderColor: primary ? 'var(--primary)' : 'var(--line)',
        borderWidth: primary ? 1.5 : 1,
        background: primary ? 'var(--primary-soft)' : 'var(--surface)',
      }}
    >
      <span
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px]"
        style={{
          background: primary ? 'var(--primary)' : 'var(--surface-2)',
          color: primary ? '#fff' : 'var(--ink-2)',
        }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-manrope text-[15px] font-bold text-ink">{title}</div>
        <div className="text-[13px] leading-snug text-ink-2">{subtitle}</div>
      </div>
    </Link>
  );
}
