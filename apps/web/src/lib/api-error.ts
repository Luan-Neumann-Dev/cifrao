/**
 * Mensagem de erro legível a partir da resposta da API.
 *
 * O `ZodValidationPipe` do Nest devolve 400 com `{ message: 'Dados inválidos',
 * issues: [...] }`. Mostrar só o `message` esconde o que realmente falhou: uma
 * conta de destino em branco e uma data fora de formato viravam exatamente o
 * mesmo texto na tela. Aqui as issues viram "Conta de destino: obrigatório".
 */

interface ZodIssueLike {
  path?: (string | number)[];
  message?: string;
  code?: string;
}

export interface ApiErrorBody {
  message?: string | string[];
  issues?: ZodIssueLike[];
}

/** Nome de campo em português. Sem entrada aqui, cai no próprio caminho. */
const FIELD_LABELS: Record<string, string> = {
  accountId: 'Conta',
  fromAccountId: 'Conta de origem',
  toAccountId: 'Conta de destino',
  categoryId: 'Categoria',
  creditCardId: 'Cartão',
  linkedAccountId: 'Conta vinculada',
  amountCents: 'Valor',
  limitCents: 'Limite',
  targetCents: 'Valor alvo',
  totalCents: 'Total',
  priceCents: 'Preço',
  quantity: 'Quantidade',
  date: 'Data',
  deadline: 'Prazo',
  startDate: 'Data de início',
  endDate: 'Data final',
  description: 'Descrição',
  name: 'Nome',
  nickname: 'Apelido',
  ticker: 'Ativo',
  month: 'Mês',
  dayOfMonth: 'Dia do mês',
  closingDay: 'Dia de fechamento',
  dueDay: 'Dia de vencimento',
  installments: 'Parcelas',
  frequency: 'Frequência',
  pattern: 'Padrão',
  confirm: 'Confirmação',
  accentColor: 'Cor de acento',
  theme: 'Tema',
  notifyDaysBefore: 'Antecedência',
  email: 'E-mail',
  password: 'Senha',
};

/** Traduz a issue do Zod para algo que se lê sem saber o que é um schema. */
function describeIssue(issue: ZodIssueLike): string {
  const key = issue.path?.filter((p) => typeof p === 'string').at(-1);
  const label = key ? (FIELD_LABELS[key] ?? String(key)) : null;

  // "String must contain at least 1 character(s)" só diz "está vazio".
  const vazio =
    issue.code === 'too_small' && /at least 1 character|min.*1/i.test(issue.message ?? '');
  const detalhe = vazio ? 'obrigatório' : (issue.message ?? 'valor inválido');

  return label ? `${label}: ${detalhe}` : detalhe;
}

export function messageFromApiError(status: number, body: ApiErrorBody | null): string {
  if (body?.issues?.length) {
    const partes = body.issues.map(describeIssue);
    // Mais de três viram parede de texto no toast; o resto fica implícito.
    const mostrados = partes.slice(0, 3).join(' · ');
    return partes.length > 3 ? `${mostrados} · e mais ${partes.length - 3}` : mostrados;
  }

  if (Array.isArray(body?.message)) return body.message.join(' · ');
  if (typeof body?.message === 'string' && body.message) return body.message;
  return `Erro ${status}`;
}
