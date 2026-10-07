import meta from './fixtures/meta.json';

/**
 * Relógio da demonstração: "agora" começa no instante da gravação e anda
 * normalmente a partir dali.
 *
 * Os dados são uma foto. Sem isto, quem abrisse a demo meses depois cairia num
 * "mês atual" sem lançamento nenhum, e avisos como "vence em 3 dias" ficariam
 * mentindo. Congelando, toda tela continua coerente com a foto para sempre.
 * Só `new Date()` sem argumento e `Date.now()` mudam — datas explícitas, timers
 * e animações seguem iguais.
 */
export const FROZEN_AT = new Date(meta.frozenAt);

let installed = false;

export function installDemoClock(): void {
  if (installed) return;
  installed = true;

  const RealDate = Date;
  const offset = FROZEN_AT.getTime() - RealDate.now();

  class DemoDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...(args as [string | number | Date]));
    }

    static override now(): number {
      return RealDate.now() + offset;
    }
  }

  globalThis.Date = DemoDate as DateConstructor;
}
