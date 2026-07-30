import type { NextConfig } from 'next';

// Em dev e em produção (mesmo host, atrás do proxy), o front fala com a API
// por /api/*. Nada de CORS permissivo (armadilha #7). O destino vem do env.
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
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
};

export default nextConfig;
