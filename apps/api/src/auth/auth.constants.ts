/** Cookie httpOnly com o JWT emitido pelo Better Auth (espelha o valor do web). */
export const API_JWT_COOKIE = 'cifrao_api_jwt';

/** Caminho do JWKS servido pelo Better Auth no Next. */
export const JWKS_PATH = '/api/auth/jwks';

/**
 * Cookie de sessão do Better Auth (prefixo `cifrao`, ver apps/web/src/lib/auth.ts).
 * O valor é assinado — o token que está na tabela `Session` é a parte antes do
 * ponto. Serve só para marcar "este é o dispositivo atual" na lista de sessões.
 */
export const AUTH_SESSION_COOKIE = 'cifrao.session_token';
