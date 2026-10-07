/*
 * Service worker do Cifrão (Fase 9). Escrito à mão de propósito: `next-pwa`
 * seria dependência nova para gerar exatamente estas 60 linhas.
 *
 * A regra que manda aqui é uma só: **nada de /api/* entra no cache**. Saldo,
 * fatura e orçamento vindos de resposta velha seriam pior que tela offline —
 * o app mentiria com números que parecem certos. Só o casco (JS, CSS, ícone) e
 * a página de offline são guardados.
 *
 * Ao mudar a estratégia, suba a versão: o cache antigo é apagado no activate.
 */

const VERSION = 'cifrao-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = '/offline';

const SHELL = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Casco estático: imutável por causa do hash no nome, então cache-first. */
function isAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Dados e sessão nunca passam pelo cache.
  if (url.pathname.startsWith('/api/')) return;

  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navegação: sempre rede. Sem rede, o casco de offline explica o que houve —
  // em vez de servir uma tela autenticada velha depois de um logout.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(OFFLINE_URL)
          .then(
            (hit) =>
              hit ?? new Response('Você está offline.', { headers: { 'content-type': 'text/plain' } }),
          ),
      ),
    );
  }
});
