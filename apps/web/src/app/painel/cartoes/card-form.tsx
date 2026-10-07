'use client';

import { formatInSaoPaulo, invoiceWindowForPurchase } from '@cifrao/shared';
import { Check, ChevronDown, ChevronLeft, Info } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CreditCardVisual } from '@/components/credit-card-visual';
import { type Account, type CreditCard, api } from '@/lib/api';
import { accountMark } from '@/lib/accounts';
import { CARD_COLORS, DEFAULT_CARD_COLOR } from '@/lib/cards';
import { monthLongLabel } from '@/lib/dates';
import { centsFromInput } from '@/lib/format';

const BRANDS = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard', 'Outra'];

function centsToInput(cents: string): string {
  return (Number(cents) / 100).toFixed(2).replace('.', ',');
}

/**
 * Cadastro e edição do cartão em tela cheia, com prévia ao vivo do plástico e o
 * exemplo de fechamento — o detalhe que faz o usuário confiar no dia que digitou.
 */
export function CardForm({ card }: { card?: CreditCard }) {
  const router = useRouter();
  const editing = Boolean(card);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [nickname, setNickname] = useState(card?.nickname ?? '');
  const [brand, setBrand] = useState(card?.brand ?? 'Visa');
  const [last4, setLast4] = useState(card?.last4 ?? '');
  const [limit, setLimit] = useState(card ? centsToInput(card.limitCents) : '');
  const [closingDay, setClosingDay] = useState(card?.closingDay ?? 28);
  const [dueDay, setDueDay] = useState(card?.dueDay ?? 5);
  const [color, setColor] = useState(card?.color ?? DEFAULT_CARD_COLOR);
  const [paymentAccountId, setPaymentAccountId] = useState(card?.defaultPaymentAccountId ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Account[]>('/accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  /**
   * Regra 5.3 na prática: uma compra feita hoje cairia em qual fatura, com os
   * dias que estão nos campos agora. Recalcula a cada toque no − e no +.
   */
  const example = useMemo(() => {
    const [year, month, day] = formatInSaoPaulo(new Date(), 'yyyy-MM-dd').split('-').map(Number);
    const w = invoiceWindowForPurchase({ year, month, day }, closingDay, dueDay);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return {
      purchase: `${p2(day)}/${p2(month)}`,
      invoiceMonth: monthLongLabel(w.referenceMonth, year),
      closing: `${p2(w.closing.day)}/${p2(w.closing.month)}`,
      due: `${p2(w.due.day)}/${p2(w.due.month)}`,
    };
  }, [closingDay, dueDay]);

  const paymentAccount = accounts.find((a) => a.id === paymentAccountId) ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        nickname,
        brand: brand || (editing ? null : undefined),
        last4: last4 || (editing ? null : undefined),
        limitCents: centsFromInput(limit),
        closingDay,
        dueDay,
        color,
        defaultPaymentAccountId: paymentAccountId || (editing ? null : undefined),
      };
      if (editing && card) {
        await api(`/credit-cards/${card.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast.success('Cartão salvo.');
        router.push(`/painel/cartoes/${card.id}`);
      } else {
        const created = await api<CreditCard>('/credit-cards', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Cartão adicionado.');
        router.push(`/painel/cartoes/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const backHref = editing && card ? `/painel/cartoes/${card.id}` : '/painel/cartoes';

  return (
    <div className="mx-auto max-w-[520px]">
      <Link
        href={backHref}
        className="mb-1 inline-flex h-9 items-center gap-[7px] px-1.5 text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-[17px] w-[17px]" />
        Voltar
      </Link>
      <h1 className="mb-1 font-manrope text-2xl font-bold tracking-[-0.015em] text-ink">
        {editing ? 'Editar cartão' : 'Novo cartão'}
      </h1>

      <form onSubmit={submit}>
        {/* Prévia ao vivo: muda enquanto o formulário é preenchido. */}
        <CreditCardVisual
          className="mt-4"
          nickname={nickname || 'Novo cartão'}
          brand={brand}
          last4={last4}
          color={color}
        />

        <div className="mt-4 flex flex-col gap-4 rounded-[20px] border border-[var(--card-border)] bg-surface px-6 py-[22px] shadow-[var(--card-shadow)]">
          <Field label="Apelido" htmlFor="cc-nick">
            <input
              id="cc-nick"
              required
              maxLength={60}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Nubank Roxinho"
              className={INPUT}
            />
          </Field>

          <div className="flex gap-3">
            <div className="flex-[1.4]">
              <Field label="Bandeira" htmlFor="cc-brand">
                <div className="relative">
                  <select
                    id="cc-brand"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className={`${INPUT} cursor-pointer appearance-none pr-10`}
                  >
                    {BRANDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-ink-2" />
                </div>
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Últimos 4" htmlFor="cc-last4">
                <input
                  id="cc-last4"
                  inputMode="numeric"
                  maxLength={4}
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  className={`${INPUT} font-mono`}
                />
              </Field>
            </div>
          </div>

          <Field label="Limite" htmlFor="cc-limit">
            <div className="flex h-12 items-center gap-2 rounded-[14px] border border-line bg-surface px-[15px] transition-colors focus-within:border-primary focus-within:shadow-[var(--ring)]">
              <span className="font-manrope font-semibold text-ink-2">R$</span>
              <input
                id="cc-limit"
                required
                inputMode="decimal"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="0,00"
                className="w-full bg-transparent font-manrope text-[15px] font-bold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-ink-2/50"
              />
            </div>
          </Field>

          <div className="flex gap-3">
            <DayStepper label="Dia de fechamento" value={closingDay} onChange={setClosingDay} />
            <DayStepper label="Dia de vencimento" value={dueDay} onChange={setDueDay} />
          </div>

          {/* O detalhe de confiança: o que os dias acima significam hoje. */}
          <div className="flex items-start gap-2.5 rounded-[14px] bg-primary-soft px-4 py-3.5">
            <Info className="mt-px h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={1.85} />
            <span className="text-[13.5px] leading-snug text-ink">
              Compra em {example.purchase} cai na fatura de{' '}
              <strong className="font-semibold">{example.invoiceMonth}</strong> (fecha{' '}
              {example.closing}), que vence em {example.due}.
            </span>
          </div>

          <Field label="Conta padrão de pagamento" htmlFor="cc-pay">
            <div className="relative flex h-[50px] items-center gap-[11px] rounded-[14px] border border-line px-[15px] focus-within:border-primary">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] font-manrope text-xs font-bold text-white"
                style={{ background: paymentAccount?.color ?? 'var(--surface-2)' }}
              >
                {paymentAccount ? accountMark(paymentAccount.name, paymentAccount.type) : '—'}
              </span>
              <span className="flex-1 truncate text-[15px] text-ink">
                {paymentAccount?.name ?? 'Nenhuma'}
              </span>
              <ChevronDown className="h-[15px] w-[15px] shrink-0 text-ink-2" />
              <select
                id="cc-pay"
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                <option value="">Nenhuma</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <div>
            <span className="mb-2.5 block text-[13px] font-medium text-ink-2">Cor</span>
            <div className="flex flex-wrap gap-2.5">
              {CARD_COLORS.map((c) => {
                const selected = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Cor ${c}`}
                    aria-pressed={selected}
                    onClick={() => setColor(c)}
                    className="flex h-10 w-10 items-center justify-center rounded-[12px] transition-shadow"
                    style={{
                      background: c,
                      boxShadow: selected
                        ? `0 0 0 3px var(--surface), 0 0 0 5px ${c}`
                        : 'inset 0 0 0 1px rgba(0,0,0,.08)',
                    }}
                  >
                    {selected && <Check className="h-[18px] w-[18px] text-white" strokeWidth={3} />}
                  </button>
                );
              })}
              <input
                type="color"
                aria-label="Outra cor"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-[12px] border border-line bg-surface"
              />
            </div>
          </div>
        </div>

        <div className="mt-[18px] flex gap-2.5">
          <Link
            href={backHref}
            className="inline-flex h-[52px] items-center rounded-full border border-line px-[22px] text-[15px] font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="h-[52px] flex-1 rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? 'Salvando…' : editing ? 'Salvar cartão' : 'Adicionar cartão'}
          </button>
        </div>
      </form>
    </div>
  );
}

const INPUT =
  'h-12 w-full rounded-[14px] border border-line bg-surface px-[15px] text-[15px] text-ink outline-none transition-colors placeholder:text-ink-2/50 focus:border-primary focus:shadow-[var(--ring)]';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-[7px] block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Dia do mês em passo de 1, dando a volta em 28 — acima disso o dia não existe
 * em fevereiro e a fatura escorregaria de mês.
 */
function DayStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const step = (delta: number) => onChange(((value - 1 + delta + 28) % 28) + 1);
  return (
    <div className="flex-1">
      <span className="mb-[7px] block text-[13px] font-medium text-ink-2">{label}</span>
      <div className="flex items-center gap-2">
        <StepButton label={`${label}: diminuir`} onClick={() => step(-1)}>
          −
        </StepButton>
        <div className="flex h-12 flex-1 items-center justify-center rounded-[12px] bg-surface-2 font-manrope text-lg font-bold tabular-nums text-ink">
          {value}
        </div>
        <StepButton label={`${label}: aumentar`} onClick={() => step(1)}>
          +
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="h-12 w-11 shrink-0 rounded-[12px] border border-line bg-surface font-manrope text-lg text-ink transition-colors hover:bg-surface-2"
    >
      {children}
    </button>
  );
}
