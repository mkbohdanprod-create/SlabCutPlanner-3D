import { useEffect, useState } from 'react';

/**
 * Мобільний режим — коли вмикається.
 *
 * Однієї ширини мало. Телефон, покладений набік, дає 844×390: ширина вже
 * «десктопна», а екран той самий, і пальцем на ньому працювати не легше.
 * Тому дивимось на два боки одразу:
 *
 *   · вузьке вікно (≤ 1024) — телефон, планшет у портреті й будь-яке
 *     вікно, де бокова панель на 340 px забирає третину екрана. Межу
 *     піднято з 820 до 1024 на прохання власника 31.08: нижнє меню має
 *     лишатись і тоді, коли вікно розтягують;
 *   · пристрій із пальцем, у якого КОРОТША сторона ≤ 520 — це телефон у
 *     будь-якій орієнтації, включно з ландшафтом.
 *
 * Планшет у ландшафті (коротша сторона 768+) лишається десктопним: там
 * панель поруч із кресленням доречна, і миша часто теж є.
 */

export const MOBILE_MAX_WIDTH = 1024;
export const PHONE_MAX_SHORT_SIDE = 520;

/** Ручне перемикання: ?mobile=1 вмикає, ?desktop=1 вимикає. */
function forcedMode(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('mobile') === '1') return true;
    if (q.get('desktop') === '1') return false;
  } catch { /* адресний рядок буває недоступний */ }
  return null;
}

function detect(): boolean {
  const forced = forcedMode();
  if (forced !== null) return forced;
  if (typeof window === 'undefined') return false;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const isTouch = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;

  if (w <= MOBILE_MAX_WIDTH) return true;
  if (isTouch && Math.min(w, h) <= PHONE_MAX_SHORT_SIDE) return true;
  return false;
}

/**
 * true — показуємо мобільний інтерфейс. Ставить клас `is-mobile` на <html>,
 * щоб CSS не дублював цю ж логіку медіа-запитом і не розходився з нею:
 * джерело правди одне, тут.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(detect);

  useEffect(() => {
    const apply = () => setIsMobile(detect());
    apply();
    window.addEventListener('resize', apply);
    // Поворот телефона змінює розміри не миттєво — на iOS значення
    // оновлюються вже після події, тому перечитуємо ще й з затримкою.
    const onOrient = () => { apply(); setTimeout(apply, 250); };
    window.addEventListener('orientationchange', onOrient);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', onOrient);
    };
  }, []);

  useEffect(() => {
    // Клас ставиться БЕЗ прибирання в cleanup — і це не недбалість.
    // Хук живе в кількох компонентах одночасно (App, Sidebar3D…), і
    // cleanup одного з них — наприклад, при виході з 3D, коли Sidebar3D
    // розмонтовується — зносив клас з усієї сторінки, вимикаючи всю
    // мобільну верстку. Симптом був підступний: усе працює, поки не
    // зайдеш у 3D, а після — розсипається. Кожен живий хук тримає клас
    // актуальним через toggle; прибирати його при смерті одного
    // підписника не можна, а при смерті сторінки — нема потреби.
    document.documentElement.classList.toggle('is-mobile', isMobile);
  }, [isMobile]);

  return isMobile;
}

/** Пристрій із пальцем замість миші — окремо від ширини вікна. */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  return isTouch;
}
