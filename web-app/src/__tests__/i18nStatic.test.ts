import { describe, it, expect } from 'vitest';
import { staticUiText } from '../i18nStatic';
import { translateStaticUiText } from '../i18n';

/**
 * СТОРОЖ СЛОВНИКА ІНТЕРФЕЙСУ.
 *
 * Перекладач ходить по DOM і міняє текст вузла ЦІЛКОМ за збігом із ключем.
 * Через це словник ламається тихо: криво скопійований ключ просто ніколи не
 * спрацює, а два різні українські рядки з однаковим англійським перекладом
 * зіб'ють зворотну мапу і при поверненні на українську підставлять чужий
 * текст. Тести нижче ловлять саме ці два способи зіпсуватися.
 */

const entries = Object.entries(staticUiText);
const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]/;

describe('словник статичного інтерфейсу', () => {
  it('має щільне покриття (словник не всох після рефакторингу)', () => {
    expect(entries.length).toBeGreaterThan(1500);
  });

  it('у кожного ключа є непорожні en і pl', () => {
    const broken = entries.filter(
      ([, v]) => !v || typeof v.en !== 'string' || typeof v.pl !== 'string'
        || v.en.trim() === '' || v.pl.trim() === '',
    );
    expect(broken.map(([k]) => k)).toEqual([]);
  });

  it('ключі не мають зайвих пробілів по краях — інакше збіг із DOM не спрацює', () => {
    const untrimmed = entries.filter(([k]) => k !== k.trim());
    expect(untrimmed.map(([k]) => k)).toEqual([]);
  });

  it('переклад зберігає кінцеву двокрапку — це підпис перед значенням', () => {
    const lost = entries
      .filter(([k]) => k.endsWith(':'))
      .filter(([, v]) => !v.en.endsWith(':') || !v.pl.endsWith(':'));
    expect(lost.map(([k]) => k)).toEqual([]);
  });

  it('переклад не лишається українським (окрім кодів і артикулів)', () => {
    const untranslated = entries
      .filter(([k]) => CYRILLIC.test(k))
      .filter(([, v]) => CYRILLIC.test(v.en) || CYRILLIC.test(v.pl));
    // Кирилиця у перекладі допустима лише в кодах прайсу (2х2, Ф3х3) —
    // там «х» і «Ф» частина артикула, а не слово.
    const suspicious = untranslated.filter(([, v]) =>
      /[А-Яа-яІіЇїЄєҐґ]{2,}/.test(`${v.en} ${v.pl}`));
    expect(suspicious.map(([k]) => k)).toEqual([]);
  });

  it('українською рядок лишається собою', () => {
    // Зворотна мапа знає і оригінал, і обидва переклади. Якщо чийсь переклад
    // випадково збігся з чужим українським ключем, він перезапише тотожність,
    // і на українській мові підпис тихо підміниться іншим українським словом.
    const drifted = entries
      .map(([source]) => [source, translateStaticUiText('uk', source)])
      .filter(([source, back]) => back !== source);
    expect(drifted).toEqual([]);
  });

  it('жоден переклад не збігається з чужим українським ключем', () => {
    const keys = new Set(entries.map(([k]) => k));
    const clashes = entries.flatMap(([source, v]) =>
      (['en', 'pl'] as const)
        .filter((lang) => v[lang] !== source && keys.has(v[lang]))
        .map((lang) => `${source} → ${lang}: ${v[lang]}`));
    expect(clashes).toEqual([]);
  });

  it('переклад повертається в українську, коли він однозначний', () => {
    // Синоніми («Прорахунок» і «Розрахунок» → Calculation) — нормальні, тому
    // звіряємо лише ті рядки, чий переклад унікальний на весь словник.
    const seen = new Map<string, number>();
    entries.forEach(([, v]) => (['en', 'pl'] as const).forEach((lang) => {
      seen.set(v[lang], (seen.get(v[lang]) ?? 0) + 1);
    }));
    const broken: string[] = [];
    entries.forEach(([source, v]) => (['en', 'pl'] as const).forEach((lang) => {
      if (seen.get(v[lang]) !== 1) return;
      const back = translateStaticUiText('uk', v[lang]);
      if (back !== source) broken.push(`${source} → ${v[lang]} → ${back}`);
    }));
    expect(broken).toEqual([]);
  });

  it('переклад не чіпає провідні й кінцеві пробіли тексту вузла', () => {
    // У JSX підпис часто йде як «  Зберегти  » — вузол зберігає відступи,
    // і якщо їх з'їсти, верстка поповзе.
    const sample = Object.keys(staticUiText)[0];
    expect(translateStaticUiText('en', `  ${sample}  `))
      .toBe(`  ${staticUiText[sample].en}  `);
  });
});
