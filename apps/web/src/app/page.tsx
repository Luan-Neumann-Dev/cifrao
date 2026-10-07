import { redirect } from 'next/navigation';

/**
 * A raiz leva ao painel; sem sessão, o próprio painel manda para o login. (Até
 * aqui ela ainda era a tela de health check da Fase 0.)
 */
export default function Home() {
  redirect('/painel');
}
