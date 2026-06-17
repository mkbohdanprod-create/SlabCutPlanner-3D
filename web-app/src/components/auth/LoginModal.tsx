import { useState } from 'react';
import { X, Mail, Lock, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';

type LoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const uiLanguage = useProjectStore((s) => s.project.uiLanguage);
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
      } else {
        const { error, data } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        
        // Supabase might require email confirmation depending on settings
        if (data.user && data.session === null) {
          setMessage(uiLanguage === 'uk' ? 'Перевірте пошту для підтвердження реєстрації.' : 'Please check your email to confirm registration.');
        } else {
          onClose();
        }
      }
    } catch (err: any) {
      setError(err.message || 'Сталася помилка');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-6 text-2xl font-bold text-zinc-800 dark:text-white">
          {isLogin 
            ? (uiLanguage === 'uk' ? 'Вхід в систему' : 'Sign In')
            : (uiLanguage === 'uk' ? 'Реєстрація' : 'Sign Up')
          }
        </h2>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 py-2.5 pl-10 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-blue-500"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {uiLanguage === 'uk' ? 'Пароль' : 'Password'}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 py-2.5 pl-10 pr-4 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-70"
          >
            {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
            {isLogin 
              ? (uiLanguage === 'uk' ? 'Увійти' : 'Sign In')
              : (uiLanguage === 'uk' ? 'Зареєструватися' : 'Sign Up')
            }
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {isLogin 
            ? (uiLanguage === 'uk' ? 'Немає акаунта? ' : 'Don\'t have an account? ')
            : (uiLanguage === 'uk' ? 'Вже є акаунт? ' : 'Already have an account? ')
          }
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
              setMessage(null);
            }}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {isLogin 
              ? (uiLanguage === 'uk' ? 'Зареєструватися' : 'Sign Up')
              : (uiLanguage === 'uk' ? 'Увійти' : 'Sign In')
            }
          </button>
        </div>
      </div>
    </div>
  );
}
