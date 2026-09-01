import type { MaterialType } from './types';
import type { Slab1c } from '../lib/api';

/**
 * Довідник номенклатур → картки каталогу слябів.
 *
 * Довідник плоский: один запис = один АРТИКУЛ, тобто конкретне виконання
 * (габарит + товщина). «Керамограніт Laminam Rare Marfil DNA 12,5 мм
 * 3240х1620» і той самий декор на 20 мм — два різні записи з різними
 * кодами 1С.
 *
 * Вікно «Додати слеб» показує інше: спершу ДЕКОР (картка з фото), а вже
 * потім його виконання. Тому записи треба згрупувати назад — за назвою
 * без товщини й габариту. Це робиться тут, а не в компоненті: правило
 * «однаковий декор» визначає, які артикули менеджер побачить під однією
 * карткою, і помилка в ньому означає ціну не того товару.
 *
 * ЧОМУ ЗА НАЗВОЮ. Іншого зв'язку між виконаннями в довіднику немає:
 * `product_variants` у слябів порожній, `vendor` і `MaterialID` — теж.
 * Назва — єдине, що їх тримає разом, і саме так їх бачить менеджер.
 */

/**
 * Виробники, яких видно в назвах довідника (перевірено на живих даних
 * 27.08.2026: керамограніт майже весь Inalco й Ascale, решта — Laminam,
 * Marazzi, Ariostea).
 *
 * У кварциту й натурального каменю виробника в назві НЕМАЄ — там одразу
 * порода чи декор («Кварцит BLACK ASH…», «Мармур Crystal White»). Поля
 * `vendor` довідник для слябів не заповнює, тому вигадувати виробника з
 * першого слова не можна: «BLACK» — це колір, а не завод. Таким карткам
 * виробник лишається порожнім, і фільтр за виробником їх не ховає.
 */
export const SLAB_BRANDS = [
  'Laminam', 'Inalco', 'Ascale', 'Ariostea', 'Marazzi', 'Neolith',
  'Antolini', 'Caesarstone', 'Supernova',
];

/**
 * Перше слово назви, за яким довідник відрізняє матеріал.
 *
 * Близнюк SLAB_TITLE_WORDS із server/src/products.js: там воно будує
 * фільтр запиту, тут — зрізає префікс із назви для картки. Дві копії
 * навмисно (сервер на JS, домен на TS), але правити треба обидві —
 * тому таблиці однакові рядок у рядок.
 */
export const SLAB_MATERIAL_WORDS: Record<string, string[]> = {
  'Керамограніт': ['Керамограніт'],
  'Кварцит': ['Кварцит'],
  'Натуральний камінь': ['Мармур', 'Граніт', 'Онікс', 'Травертин'],
  'Акрил': ['Акрил'],
};

/** Слова матеріалу для назв, із запасом на невідомий тип */
export function materialWords(material: string): string[] {
  return SLAB_MATERIAL_WORDS[material] ?? [material];
}

/** Габарит виконання. Довідник тримає ширину й висоту окремими полями */
export interface SlabSize {
  width: number;
  height: number;
}

/** Одне виконання декору — рівно один артикул 1С */
export interface SlabExecution extends SlabSize {
  oid: string;
  article: string;
  thick: number;
  photo: string;
  photos: string[];
  /** Повна назва з довідника — те, що поїде в замовлення */
  title: string;
}

/** Картка каталогу: декор і всі його виконання */
export interface SlabDecor {
  /** Ключ групування — нормалізована назва без товщини й габариту */
  key: string;
  /** Назва декору для картки («Laminam Rare Marfil DNA») */
  name: string;
  material: MaterialType;
  /** Порожньо, якщо в назві немає впізнаваного виробника */
  manufacturer: string;
  /** Фото першого виконання, у якого воно є */
  photo: string;
  executions: SlabExecution[];
  /** Унікальні габарити й товщини — для екрана виконання */
  sizes: SlabSize[];
  thicknesses: number[];
}

/** Габарит у назві: «3240х1620», «1900x2950», з «мм» і без */
const SIZE_TAIL = /\s*\d{3,4}\s*[хx×]\s*\d{3,4}(\s*мм)?\.?\s*$/i;
/** Товщина в назві: «12,5 мм», «20 мм», «6 mm» */
const THICKNESS_TAIL = /\s*\d{1,2}([.,]\d)?\s*(мм|mm)\.?\s*$/i;

/**
 * Назва запису → назва декору без матеріалу, товщини й габариту.
 *
 * Хвости зрізаються по колу: у довіднику трапляється «Граніт Titanium
 * polich 20 мм 20 мм 3300х1890» — товщина двічі поспіль.
 */
export function slabDecorName(title: string, materialWords: string[]): string {
  let name = String(title ?? '').trim().replace(/\s+/g, ' ');
  const material = materialWords.find((word) => name.toLowerCase().startsWith(`${word.toLowerCase()} `));
  if (material) name = name.slice(material.length).trim();
  for (let guard = 0; guard < 4; guard += 1) {
    const shorter = name.replace(SIZE_TAIL, '').replace(THICKNESS_TAIL, '').trim();
    if (shorter === name) break;
    name = shorter;
  }
  return name;
}

/** Виробник, якщо назва починається з відомого бренду */
export function slabManufacturer(decorName: string): string {
  const first = decorName.split(' ')[0]?.toLowerCase() ?? '';
  return SLAB_BRANDS.find((brand) => brand.toLowerCase() === first) ?? '';
}

const sameSize = (a: SlabSize, b: SlabSize) => a.width === b.width && a.height === b.height;

/**
 * Плоскі виконання з довідника → картки декорів.
 *
 * Порядок карток зберігається за першою появою: довідник уже віддає
 * список відсортованим за назвою, і пересортовувати його тут означало б
 * показати менеджеру інший порядок, ніж той, у якому прийшла сторінка.
 */
export function groupSlabDecors(
  items: Slab1c[],
  material: MaterialType,
  materialWords: string[],
): SlabDecor[] {
  const byKey = new Map<string, SlabDecor>();
  items.forEach((item) => {
    const name = slabDecorName(item.title, materialWords);
    const key = name.toLowerCase();
    const execution: SlabExecution = {
      oid: item.oid,
      article: item.article,
      title: item.title,
      width: item.width,
      height: item.height,
      thick: item.thick,
      photo: item.photo,
      photos: item.photos ?? [],
    };
    const decor = byKey.get(key);
    if (!decor) {
      byKey.set(key, {
        key,
        name: name || item.title,
        material,
        manufacturer: slabManufacturer(name),
        photo: item.photo,
        executions: [execution],
        sizes: [{ width: item.width, height: item.height }],
        thicknesses: [item.thick],
      });
      return;
    }
    decor.executions.push(execution);
    // Картку показує перше фото, яке взагалі знайшлося: у довіднику знімок
    // часто прив'язаний лише до однієї товщини, а декор той самий.
    if (!decor.photo && item.photo) decor.photo = item.photo;
    if (!decor.sizes.some((size) => sameSize(size, item))) {
      decor.sizes.push({ width: item.width, height: item.height });
    }
    if (!decor.thicknesses.includes(item.thick)) decor.thicknesses.push(item.thick);
  });
  return [...byKey.values()].map((decor) => ({
    ...decor,
    thicknesses: [...decor.thicknesses].sort((a, b) => a - b),
  }));
}

/**
 * Артикул конкретного виконання.
 *
 * Правило власника 25.08.2026: змінили товщину — беремо ВІДПОВІДНИЙ
 * артикул. Не знайшли — порожньо, а не «майже той самий»: ціна питається
 * за артикулом, і сусідній покаже ціну іншого товару.
 */
export function executionFor(
  decor: SlabDecor,
  size: SlabSize,
  thickness: number,
): SlabExecution | undefined {
  return decor.executions.find((item) => item.thick === thickness && sameSize(item, size));
}
