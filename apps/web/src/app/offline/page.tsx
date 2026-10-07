import type { Metadata } from 'next';
import { LogoMark } from '@/components/logo';

export const metadata: Metadata = { title: 'Sem conexão · Cifrão' };

/**
 * Casco offline do PWA: é esta página que o service worker serve quando a
 * navegação falha. Estática de propósito — precisa abrir sem servidor, sem
 * sessão e sem chamada de API.
 */
export default function OfflinePage() {
  return (
    <div className="center-screen">
      <div className="card text-center">
        <LogoMark className="mx-auto mb-4 h-14 w-14" />
        <p className="title">
          <span className="title-brand">Cifrão</span> sem conexão
        </p>
        <p className="subtitle">
          Você está offline. Seus dados estão no servidor, intactos — assim que a internet voltar, a
          tela carrega normalmente.
        </p>
        <a className="btn btn-primary btn-block" href="/painel">
          Tentar de novo
        </a>
      </div>
    </div>
  );
}
