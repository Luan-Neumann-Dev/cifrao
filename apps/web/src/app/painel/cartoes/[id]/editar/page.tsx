'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type CreditCard, api } from '@/lib/api';
import { CardForm } from '../../card-form';

export default function EditarCartaoPage() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<CreditCard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<CreditCard>(`/credit-cards/${id}`)
      .then(setCard)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-sm text-ink-2">Carregando…</p>;
  if (!card) return <p className="text-sm text-ink-2">Cartão não encontrado.</p>;
  // `key` força o formulário a nascer já com os valores do cartão carregado.
  return <CardForm key={card.id} card={card} />;
}
