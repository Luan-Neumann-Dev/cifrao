import { ExternalLink } from 'lucide-react';
import { FROZEN_AT } from './clock';
import { REPO_URL } from './is-demo';

const quando = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
}).format(FROZEN_AT);

/** Faixa no topo do app, só na demo: o que é isto e onde está o de verdade. */
export function DemoBanner() {
  return (
    <div className="border-b border-line bg-primary-soft px-4 py-2 text-xs text-ink print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          <strong className="font-semibold">Demonstração</strong> com dados de exemplo de {quando}.
          Navegue à vontade — nada do que você fizer é salvo.
        </span>
        <a
          href={`${REPO_URL}#rodando-a-versão-completa`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
        >
          Código e versão completa <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
