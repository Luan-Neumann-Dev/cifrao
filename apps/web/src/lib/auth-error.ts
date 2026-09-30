/**
 * Mensagem de erro de autenticação para a tela.
 *
 * Existe por causa do 429: a resposta do limitador do Better Auth vem em inglês
 * ("Too many requests. Please try again later."), e mostrá-la crua deixaria a
 * única frase em inglês de um app todo em português — justo no momento em que a
 * pessoa está travada e precisa entender o que fazer.
 *
 * O `X-Retry-After` vem em segundos; a tela diz em minuto quando passa de um,
 * porque "espere 274 segundos" ninguém converte de cabeça.
 */
export interface AuthErrorLike {
  status?: number;
  message?: string;
}

/** "em 5 minutos" / "em 40 segundos" a partir dos segundos do X-Retry-After. */
export function formatRetryAfter(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `em ${Math.ceil(seconds)} segundos`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'em 1 minuto' : `em ${minutes} minutos`;
}

export function authErrorMessage(
  err: AuthErrorLike | null | undefined,
  fallback: string,
  retryAfterSeconds: number | null = null,
): string {
  if (!err) return fallback;
  if (err.status === 429) {
    const quando = formatRetryAfter(retryAfterSeconds);
    return quando
      ? `Muitas tentativas. Tente de novo ${quando}.`
      : 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  }
  return err.message ?? fallback;
}
