import type { NextConfig } from 'next';

// Em dev e em produção (mesmo host, atrás do proxy), o front fala com a API
// por /api/*. Nada de CORS permissivo (armadilha #7). O destino vem do env.
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
