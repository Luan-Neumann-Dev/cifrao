/**
 * Serialização de BigInt (armadilha #2 do CLAUDE.md).
 * JSON.stringify quebra com BigInt por padrão. Aqui centralizamos:
 * - no backend (Nest), um serializer global converte BigInt em string;
 * - no cliente, os schemas Zod fazem coerce de string -> bigint na resposta.
 */

/** Replacer para JSON.stringify que converte BigInt em string. */
export function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/** JSON.stringify que aceita BigInt (serializado como string). */
export function stringifyWithBigInt(value: unknown, space?: number): string {
  return JSON.stringify(value, bigIntReplacer, space);
}

/**
 * Instala o serializer global de BigInt no runtime atual.
 * Chamado no bootstrap do Nest para que qualquer resposta com BigInt
 * (ex.: amountCents) seja serializada como string automaticamente.
 */
export function installBigIntJsonSerializer(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function toJSON(this: bigint): string {
    return this.toString();
  };
}
