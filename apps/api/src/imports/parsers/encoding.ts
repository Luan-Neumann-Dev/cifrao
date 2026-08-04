/**
 * Extratos de banco brasileiro costumam vir em windows-1252 (o header do OFX
 * declara `CHARSET:1252`). Ler como UTF-8 transforma "SÃO JOÃO" em lixo, o que
 * estraga descrição, similaridade e regra de categoria. Por isso o upload
 * trafega em base64 e a decodificação acontece aqui, no servidor.
 */

const LATIN1 = 'windows-1252';

/** Byte de substituição (U+FFFD): sinal de que a leitura como UTF-8 falhou. */
const REPLACEMENT = '�';

export function decodeUpload(base64: string): string {
  const buffer = Buffer.from(base64, 'base64');

  // O header do OFX é ASCII: dá para inspecioná-lo antes de decidir o charset.
  const head = buffer.subarray(0, 512).toString('latin1').toUpperCase();
  if (head.includes('CHARSET:1252') || head.includes('ENCODING:USASCII')) {
    return new TextDecoder(LATIN1).decode(buffer);
  }

  const utf8 = new TextDecoder('utf-8').decode(buffer);
  // Sem declaração de charset (CSV/QIF): se apareceu caractere inválido, o
  // arquivo não era UTF-8 — tenta latin1, que nunca falha.
  if (utf8.includes(REPLACEMENT)) {
    return new TextDecoder(LATIN1).decode(buffer);
  }
  return utf8;
}
