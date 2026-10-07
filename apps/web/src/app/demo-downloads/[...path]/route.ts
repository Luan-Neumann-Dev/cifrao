/**
 * Downloads da demonstração (CSV dos relatórios, backup). Eles não passam pela
 * `api()` — o navegador vai direto em `/api/...` —, então no build da demo o
 * `next.config.ts` aponta esses caminhos para cá. Fora da demo, 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  // Condição escrita aqui (não via IS_DEMO) para o build normal descartar o
  // import dos downloads gravados — ver is-demo.ts.
  if (process.env.NEXT_PUBLIC_DEMO !== 'true') return new Response('Not Found', { status: 404 });

  const { path } = await params;
  const { search } = new URL(request.url);
  const key = `/${path.join('/')}${search}`;
  const downloads = (await import('@/demo/fixtures/downloads.json')).default as Record<
    string,
    { type: string; disposition: string | null; body: string }
  >;
  const file = downloads[key];
  if (!file) {
    return new Response(
      'Este arquivo não existe na demonstração: escolha um dos períodos prontos.',
      {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      },
    );
  }
  // Mesmo nome de arquivo que a API de verdade mandou na gravação.
  return new Response(file.body, {
    headers: {
      'content-type': file.type,
      'content-disposition': file.disposition ?? 'attachment',
    },
  });
}
