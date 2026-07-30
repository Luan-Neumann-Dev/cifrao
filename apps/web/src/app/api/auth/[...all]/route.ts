import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

// Monta todos os endpoints do Better Auth em /api/auth/*.
export const { GET, POST } = toNextJsHandler(auth);
