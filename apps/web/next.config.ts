import path from 'node:path';
import type { NextConfig } from 'next';

// Em dev e em produção (mesmo host, atrás do proxy), o front fala com a API
// por /api/*. Nada de CORS permissivo (armadilha #7). O destino vem do env.
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  /**
   * O Better Auth fala com o banco pelo Prisma dentro do Next. Sem marcar o
   * client como externo, o bundler o empacota e o **query engine** (o binário
   * nativo) fica para trás — a imagem de produção sobe e quebra no primeiro
   * acesso ao banco com "Prisma Client could not locate the Query Engine".
   * Externo, o tracing copia o pacote de verdade, engine incluído.
   */
  serverExternalPackages: ['@prisma/client', '@cifrao/db'],

  // Imagem de produção enxuta (Fase 9): o `standalone` empacota só o que o
  // servidor precisa. Ligado por env, e não sempre, porque ele monta a árvore
  // com symlink — o que o Windows recusa sem modo desenvolvedor e derrubaria o
  // `pnpm build` na máquina de dev. O Dockerfile do web liga a variável.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? {
        output: 'standalone' as const,
        // Em monorepo pnpm o tracing tem que enxergar a raiz, senão os pacotes
        // internos (@cifrao/shared, @cifrao/db) ficam de fora do pacote.
        outputFileTracingRoot: path.join(__dirname, '../../'),
      }
    : {}),

  async rewrites() {
    return {
      // afterFiles roda antes de rotas dinâmicas; por isso EXCLUÍMOS /api/auth/*
      // do proxy — esse prefixo é servido pelo handler do Better Auth no Next.
      // Todo o resto de /api/* vai para o Nest.
      afterFiles: [
        {
          source: '/api/:path((?!auth/).*)',
          destination: `${apiUrl}/:path`,
        },
      ],
    };
  },

  async headers() {
    return [
      {
        // O service worker não pode ficar em cache: uma versão antiga
        // continuaria mandando no app mesmo depois do deploy.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
