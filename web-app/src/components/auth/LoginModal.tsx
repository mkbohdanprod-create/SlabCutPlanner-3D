import { X, KeyRound } from 'lucide-react';
import { api } from '../../lib/api';
import { useProjectStore } from '../../store/useProjectStore';

type LoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const uiLanguage = useProjectStore((s) => s.project.uiLanguage);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-2 text-2xl font-bold text-zinc-800 dark:text-white">
          {uiLanguage === 'uk' ? 'Необхідна авторизація' : 'Authorization required'}
        </h2>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          {uiLanguage === 'uk'
            ? 'Будь ласка, увійдіть через Keycloak для доступу до збережених проектів.'
            : 'Please sign in via Keycloak to access your saved projects.'}
        </p>

        <a
          href={api.loginUrl}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0084ff] px-4 py-3 font-medium !text-white transition-colors hover:bg-[#006bce]"
        >
          <KeyRound className="h-5 w-5" />
          {uiLanguage === 'uk' ? 'Увійти через Keycloak' : 'Sign in with Keycloak'}
        </a>
      </div>
    </div>
  );
}
