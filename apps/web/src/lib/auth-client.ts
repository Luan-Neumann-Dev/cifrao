'use client';

import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Client do Better Auth (browser). baseURL default = mesma origem.
 * Ao cair num login que exige 2FA, redirecionamos para /2fa.
 */
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = '/2fa';
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
