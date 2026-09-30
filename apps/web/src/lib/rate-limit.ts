/**
 * Limites de tentativa nas rotas de autenticação.
 *
 * O Better Auth já tem um limitador embutido, mas o padrão dele não serve aqui:
 * **100 requisições por 10 segundos**, o que dá 600 tentativas de senha por
 * minuto — folgado para um ataque de dicionário. E ele vem **desligado em
 * desenvolvimento**, então o comportamento que você testa localmente não é o que
 * roda em produção. As duas coisas são resolvidas explicitamente aqui.
 *
 * A chave do limite é `ip|caminho`, então cada rota tem seu próprio balde e um
 * IP no limite do login não fica impedido de, por exemplo, pedir a sessão.
 *
 * ## O detalhe que decide se isso protege ou atrapalha
 *
 * O Better Auth resolve o IP do cliente pelo `X-Forwarded-For`, e sem
 * `trustedProxies` configurado ele só aceita o cabeçalho quando há **uma única
 * entrada** — ele se recusa a chutar qual salto é o cliente numa cadeia. Quando
 * não consegue resolver, **todos os clientes caem num balde compartilhado**.
 *
 * Consequência prática, e é séria: atrás de um proxy (o alvo é uma VPS com
 * Coolify), um atacante que mande um `X-Forwarded-For` falso faz o proxy
 * repassar dois saltos, o IP deixa de ser resolvível e o limite passa a valer
 * para o conjunto de usuários. Aí um limite apertado no login vira negação de
 * serviço contra todo mundo — o contrário do que se queria.
 *
 * Por isso `TRUSTED_PROXIES` existe: com a faixa do proxy declarada, o Better
 * Auth caminha o `X-Forwarded-For` da direita para a esquerda, descarta os
 * saltos confiáveis e fica com o primeiro IP que não é de proxy — que é o
 * cliente de verdade, e não dá para falsificar. **Em produção atrás de proxy,
 * preencha essa variável**; sem ela o limite continua funcionando, mas um
 * atacante consegue empurrá-lo para o modo balde único.
 */

/** Janela e teto de uma regra. `window` em segundos. */
export interface RateRule {
  window: number;
  max: number;
}

/**
 * Padrão global das rotas `/api/auth/*` não listadas abaixo. Mantido folgado de
 * propósito: aqui mora o `get-session`, que a aplicação chama a cada navegação.
 */
export const AUTH_RATE_DEFAULT: RateRule = { window: 10, max: 100 };

/**
 * Regras por rota. Números pensados para um app de finanças pessoais, onde o
 * volume legítimo é baixo e a tentativa repetida é sinal de ataque.
 */
export const AUTH_RATE_RULES: Record<string, RateRule> = {
  /** Senha errada acontece; 10 em 5 min cobre o dedo errado e mata o dicionário. */
  '/sign-in/email': { window: 300, max: 10 },

  /** Cadastro legítimo é raro: 5 por hora por IP trava criação em massa. */
  '/sign-up/email': { window: 3600, max: 5 },

  /**
   * TOTP é o ÚLTIMO obstáculo: quem chega aqui já acertou a senha. São 6
   * dígitos, um milhão de combinações — sem limite, dá para varrer. Limitar o
   * login e deixar esta rota aberta protegeria a porta e esqueceria a janela.
   */
  '/two-factor/verify-totp': { window: 300, max: 5 },
  '/two-factor/verify-otp': { window: 300, max: 5 },
  /** Código de recuperação é longo, mas é de uso único e vale o mesmo cuidado. */
  '/two-factor/verify-backup-code': { window: 300, max: 5 },
};

/**
 * Lê `TRUSTED_PROXIES` (CIDRs separados por vírgula) numa lista limpa. Devolver
 * lista vazia é o caso seguro: o Better Auth então só confia num
 * `X-Forwarded-For` de uma entrada só.
 */
export function parseTrustedProxies(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * O limitador fica ligado, inclusive em desenvolvimento — o padrão do Better
 * Auth é só produção, e um limite que não roda em dev é um limite que ninguém
 * testa. Para desligar durante um trabalho local, `AUTH_RATE_LIMIT=false`.
 */
export function rateLimitEnabled(raw: string | undefined): boolean {
  return raw !== 'false';
}
