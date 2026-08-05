import { describe, it, expect, afterEach } from 'vitest';
import { useSettingsStore, DEFAULT_ADMIN_PIN } from '../useSettingsStore';
import { useUIStore } from '../useStore';

// Супер-адмін: PIN у налаштуваннях (переживає перезавантаження),
// розблокування — в UI-сторі (свідомо НЕ переживає перезавантаження).

afterEach(() => {
  useSettingsStore.getState().setAdminPin(DEFAULT_ADMIN_PIN);
  useUIStore.setState({ isAdminUnlocked: false });
});

describe('PIN супер-адміна', () => {
  it('за замовчуванням — 1111', () => {
    expect(useSettingsStore.getState().adminPin).toBe('1111');
  });

  it('змінюється і зберігається в сторі налаштувань', () => {
    useSettingsStore.getState().setAdminPin('7402');
    expect(useSettingsStore.getState().adminPin).toBe('7402');
  });

  it('порожній PIN відкидається — вертається типовий, а не «без PIN»', () => {
    useSettingsStore.getState().setAdminPin('   ');
    expect(useSettingsStore.getState().adminPin).toBe(DEFAULT_ADMIN_PIN);
  });

  it('розблокування живе в UI-сторі й починається із замкненого', () => {
    expect(useUIStore.getState().isAdminUnlocked).toBe(false);
    useUIStore.getState().setAdminUnlocked(true);
    expect(useUIStore.getState().isAdminUnlocked).toBe(true);
  });
});
