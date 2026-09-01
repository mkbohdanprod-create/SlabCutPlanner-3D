import { useUIStore } from '../store/useStore';

/**
 * Виконує кроки завантаження, показуючи людині кожен із них.
 *
 * ЧОМУ НЕ ПРОСТО «ПОКАЗАВ І СХОВАВ». Два протилежні випадки:
 *
 *  · Маленький проєкт відкривається за 40 мс. Вікно, яке блимне на цей
 *    час, гірше за його відсутність: людина встигає помітити спалах, але
 *    не встигає прочитати. Тому вікно з'являється лише тоді, коли процес
 *    затягнувся довше за `SHOW_AFTER_MS`.
 *  · Проєкт із фото слебів на кілька мегабайтів читається і розбирається
 *    секунди. Тут вікно потрібне, і воно мусить протриматись достатньо,
 *    щоб напис устигли прочитати, — звідси `MIN_VISIBLE_MS`.
 *
 * `yieldToBrowser` між кроками теж не декоративний: розбір JSON і
 * розгортання деталей блокують потік, і без паузи браузер не встигає
 * перемалювати вікно — людина знову бачить застиглий екран.
 */

/**
 * Вікно показуємо ОДРАЗУ, а не «якщо затягнеться».
 *
 * Спершу тут стояла затримка 180 мс, щоб не блимати на дрібних файлах.
 * Заміри це спростували: навіть проєкт на 13 МБ із шістьма фото слебів
 * читається і розбирається швидше — вікно не з'являлось узагалі, і
 * лишалась рівно та сама скарга «натиснув, нічого не відбувається».
 *
 * Річ була не в довгому очікуванні, а у ВІДСУТНОСТІ ВІДПОВІДІ на клік:
 * після вибору файлу екран не змінювався ніяк, і людина не знала, чи
 * взагалі спрацювало. Тому показуємо завжди і тримаємо `MIN_VISIBLE_MS` —
 * рівно стільки, щоб устигнути прочитати, що саме відкрилось.
 */
const MIN_VISIBLE_MS = 700;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const yieldToBrowser = () => wait(16);

export interface LoadStep<T> {
  label: string;
  run: (previous: T) => T | Promise<T>;
}

export async function runWithProgress<T>(title: string, initial: T, steps: LoadStep<T>[]): Promise<T> {
  const { setProjectLoading } = useUIStore.getState();

  const shownAt = Date.now();
  let value = initial;
  try {
    for (let i = 0; i < steps.length; i += 1) {
      setProjectLoading({ title, step: steps[i].label, index: i + 1, total: steps.length });
      await yieldToBrowser();
      value = await steps[i].run(value);
    }
    // Останній кадр — підтвердження результату, а не порожнеча
    setProjectLoading({ title, step: 'Готово', index: steps.length, total: steps.length });
    return value;
  } finally {
    const left = MIN_VISIBLE_MS - (Date.now() - shownAt);
    if (left > 0) await wait(left);
    setProjectLoading(null);
  }
}
