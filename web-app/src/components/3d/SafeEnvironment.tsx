import { Component, Suspense, type ReactNode } from 'react';
import { Environment } from '@react-three/drei';

/**
 * СТУДІЙНЕ СВІТЛО, ЯКЕ НЕ ВАЛИТЬ СЦЕНУ.
 *
 * `<Environment preset="city" />` тягне HDR-карту з зовнішнього CDN
 * (pmndrs). Коли її не віддали — немає інтернету, корпоративна мережа
 * ріже домен, CDN лежить — drei кидає помилку прямо в рендер, і падає
 * НЕ освітлення, а весь `<Canvas>`: користувач бачить «Щось пішло не
 * так» замість виробу. Спіймано 26.08 у контейнері без доступу до CDN;
 * у мережі Viyar Tech цей самий сценарій цілком можливий.
 *
 * Тут звичайний запобіжник: якщо карта не завантажилась — не рендеримо
 * нічого. Сцена лишається зі своїми лампами (ambient + directional),
 * камінь стає трохи пласкішим, але програма працює. Чесна деградація
 * замість білого екрана.
 *
 * Suspense окремо: без нього очікування завантаження підвішує весь
 * Canvas, а не тільки світло.
 */
class EnvironmentGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Не мовчимо: у консолі має лишитись слід, чому світло гірше.
    console.warn('[3D] Студійне світло недоступне, сцена працює на власних лампах:', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function SafeEnvironment({ preset = 'city' }: { preset?: 'city' | 'studio' | 'warehouse' | 'apartment' }) {
  return (
    <EnvironmentGuard>
      <Suspense fallback={null}>
        <Environment preset={preset} />
      </Suspense>
    </EnvironmentGuard>
  );
}
