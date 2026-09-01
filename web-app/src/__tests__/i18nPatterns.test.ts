import { describe, it, expect } from 'vitest';
import { staticUiPatterns } from '../i18nPatterns';
import { translateStaticUiText } from '../i18n';

/**
 * СТОРОЖ ШАБЛОНІВ.
 *
 * Шаблон — це регулярка, яка їсть текст вузла цілком. Помилковий шаблон не
 * «не спрацює», а зіпсує чужий підпис: `{0}ого` перехопив би будь-яке слово,
 * що закінчується на «ого», а `{0} мм` — будь-який рядок із «мм» на кінці.
 * Тому перевіряємо не лише переклад, а й межі жадібності.
 */

const slots = (text: string) =>
  Array.from(text.matchAll(/\{(\d+)\}/g)).map((m) => m[1]).sort();

describe('шаблони інтерфейсу з підстановкою', () => {
  it('переклад зберігає той самий набір місць підстановки', () => {
    const broken = staticUiPatterns.filter(
      (p) => slots(p.en).join() !== slots(p.pattern).join()
        || slots(p.pl).join() !== slots(p.pattern).join(),
    );
    expect(broken.map((p) => p.pattern)).toEqual([]);
  });

  it('місце підстановки не приліплене до українського слова', () => {
    // Інакше шаблон ловив би відмінкові закінчення, а не підпис.
    const glued = staticUiPatterns.filter((p) =>
      /[А-Яа-яІіЇїЄєҐґ]\{\d+\}|\{\d+\}[А-Яа-яІіЇїЄєҐґ]/.test(p.pattern));
    expect(glued.map((p) => p.pattern)).toEqual([]);
  });

  it('шаблон без українського слова мусить бути звужений guard-ом', () => {
    // Сталий текст «{0} мм» чи «{0}={1} мм» сам по собі нічого не розрізняє:
    // без guard-а такий шаблон перехопить будь-який рядок із «мм» на кінці.
    const loose = staticUiPatterns.filter(
      (p) => !/[А-Яа-яІіЇїЄєҐґ]{3,}/.test(p.pattern.replace(/\{\d+\}/g, ' ')) && !p.guard,
    );
    expect(loose.map((p) => p.pattern)).toEqual([]);
  });

  it('guard «code» не пускає в підстановку українське слово', () => {
    // «Кут A» — літера сторони, «Кут нахилу» — звичайний текст, який
    // випадково почався так само; другий чіпати не можна.
    expect(translateStaticUiText('en', 'Кут A')).toBe('Corner A');
    expect(translateStaticUiText('en', 'Кут нахилу')).toBe('Кут нахилу');
    expect(translateStaticUiText('pl', 'Виріз під змішувач Ø35 мм')).toBe('Wycięcie pod baterię Ø35 mm');
  });

  it('підставляє значення у переклад', () => {
    expect(translateStaticUiText('en', 'Сторона A')).toBe('Side A');
    expect(translateStaticUiText('en', '1200 мм')).toBe('1200 mm');
    expect(translateStaticUiText('pl', '3 шт')).toBe('3 szt');
  });

  it('числовий шаблон не чіпає текст замість числа', () => {
    // «Довжина стільниці мм» — не розмір, підставляти нема чого.
    expect(translateStaticUiText('en', 'Довжина стільниці мм')).toBe('Довжина стільниці мм');
  });

  it('українська лишає текст як є', () => {
    expect(translateStaticUiText('uk', 'Сторона A')).toBe('Сторона A');
    expect(translateStaticUiText('uk', '1200 мм')).toBe('1200 мм');
  });

  it('не ламає рядок, який не підпадає під жоден шаблон', () => {
    const text = 'Абсолютно унікальний текст без шаблону 42';
    expect(translateStaticUiText('en', text)).toBe(text);
  });

  it('зберігає провідні й кінцеві пробіли вузла', () => {
    expect(translateStaticUiText('en', '  Сторона A  ')).toBe('  Side A  ');
  });
});
