import { KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext';
import { api } from '../../lib/api';

/**
 * Пропускає до застосунку лише авторизованих користувачів (як в ai-agents-ws:
 * без сесії Keycloak показується екран входу, сам застосунок не рендериться).
 *
 * У DEV-режимі (npm run dev) пропускає без авторизації для локальної розробки.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  // DEV mode — bypass Keycloak
  if (import.meta.env.DEV) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#f5f8fb]">
        <Loader2 className="h-10 w-10 animate-spin text-[#0084ff]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-[#f5f8fb] p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <KeyRound className="h-7 w-7 text-[#0084ff]" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-zinc-800">
            Необхідна авторизація
          </h1>
          <p className="mb-6 text-sm text-zinc-500">
            Будь ласка, увійдіть через Keycloak для доступу до SlabCutPlanner.
          </p>
          <a
            href={api.loginUrl}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0084ff] px-4 py-3 font-medium !text-white transition-colors hover:bg-[#006bce]"
          >
            <KeyRound className="h-5 w-5" />
            Увійти через Keycloak
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
