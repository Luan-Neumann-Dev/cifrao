import { importEsm } from '../../common/esm';

export interface OfxParsed {
  header: Record<string, string>;
  OFX: Record<string, unknown>;
}

export interface OfxModule {
  parseSync(data: string): OfxParsed;
}

/** Carrega o `ofx-js` (ESM puro) — ver `common/esm.ts` para o porquê. */
export function loadOfx(): Promise<OfxModule> {
  return importEsm<OfxModule>('ofx-js');
}
