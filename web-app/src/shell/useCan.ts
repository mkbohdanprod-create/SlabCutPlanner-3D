import { useUIStore } from '../store/useStore';
import { can, currentWorkspace, type Capability } from './capabilities';

/**
 * Хук для екранів: «чи можна це в цій дочці цьому користувачу».
 * Єдине місце, де права зустрічаються зі стором (ПІН супер-адміна).
 */
export function useCan(capability: Capability): boolean {
  const adminUnlocked = useUIStore((s) => s.isAdminUnlocked);
  return can(capability, adminUnlocked, currentWorkspace());
}

/** Те саме поза React (обробники, утиліти). */
export function canNow(capability: Capability): boolean {
  return can(capability, useUIStore.getState().isAdminUnlocked, currentWorkspace());
}
