import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ServiceWorker } from '@/components/service-worker';
import { DemoBoot } from '@/demo/demo-boot';
import { IS_DEMO } from '@/demo/is-demo';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme';
import './globals.css';

// Seção 4: Inter no texto, Manrope em número e título. `next/font` já vem no
// Next — baixa no build, serve do próprio domínio e não vaza request p/ o Google.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--ff-inter',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--ff-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Cifrão',
  description: 'Finanças pessoais',
  applicationName: 'Cifrão',
  manifest: '/manifest.webmanifest',
  // Instalado na tela de início, o app abre em tela cheia como um nativo.
  appleWebApp: { capable: true, title: 'Cifrão', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#0E0B12' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `suppressHydrationWarning`: o script abaixo escreve data-theme antes do
    // React montar, então o HTML do servidor e o do cliente diferem de propósito.
    <html lang="pt-BR" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        {IS_DEMO && <DemoBoot />}
        {children}
        <Toaster position="top-center" richColors closeButton />
        <ServiceWorker />
      </body>
    </html>
  );
}
