import { createContext, useContext, useEffect, useState } from 'react';
import { api, NoBackendError, type AppUser } from '../../lib/api';

/**
 * `backend`: 'present' — бекенд відповідає (сесія є або 401);
 * 'absent' — бекенда немає взагалі (демо-дзеркало на статичному хостингу:
 * 404 / HTML на /api/auth/me або мережа не дійшла). У такому режимі вхід не
 * пропонується — нема куди (власник 01.09: «давай без входу»).
 */
export type BackendState = 'checking' | 'present' | 'absent';

type AuthContextType = {
  user: AppUser | null;
  isLoading: boolean;
  backend: BackendState;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [backend, setBackend] = useState<BackendState>('checking');

  useEffect(() => {
    // Сесія живе в httpOnly-куці — просто питаємо бекенд, хто ми
    api
      .me()
      .then((me) => { setUser(me); setBackend('present'); })
      .catch((cause: unknown) => {
        setUser(null);
        // NoBackendError — статичний хостинг; TypeError — fetch не дійшов
        // (нема сервера). Обидва — «бекенда немає», а не «не увійшли».
        setBackend(cause instanceof NoBackendError || cause instanceof TypeError ? 'absent' : 'present');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const signOut = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, backend, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
