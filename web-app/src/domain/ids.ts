export function buildElementPath(productId: string, elementSlot: string): string {
  return `prod_${productId}/element:${elementSlot}`;
}

export function buildDetailPath(productId: string, elementSlot: string, detailSlot: string): string {
  return `${buildElementPath(productId, elementSlot)}/detail:${detailSlot}`;
}
export function toSlot(id: string | null | undefined): string {
  if (!id) return 'main';
  const m = id.match(/\/element:([^/]+)/);
  const slot = m ? m[1] : id;
  return slot.includes('element:main') || slot === 'main' ? 'main' : slot;
}

/**
 * Знайти деталь за ідентифікатором у будь-якій із двох форм.
 *
 * Контекстне меню в 3D-редакторі віддає короткий слот (`main`,
 * `skirting_A`), а `flattenProductToDetails` будує повні шляхи
 * `prod_1/element:skirting_A/detail:main`. Пряме порівняння не збігалося
 * ніколи — і вікно «Параметри та список обробок» мовчки не відкривалось:
 * компонент не знаходив деталь і повертав null.
 */
export function findDetailByPathOrSlot<T extends { id: string }>(
  details: T[] | undefined,
  detailId: string | null | undefined,
): T | undefined {
  if (!details?.length || !detailId) return undefined;
  const exact = details.find((detail) => detail.id === detailId);
  if (exact) return exact;
  const target = toSlot(detailId);
  return details.find((detail) => toSlot(detail.id) === target);
}

/**
 * НАЗВИ ДВОХ КРАЙОВИХ ДОПОВНЕНЬ — ОДНЕ ДЖЕРЕЛО НА ВЕСЬ ЗАСТОСУНОК.
 *
 * 10.08 власник виправив термінологію: назви були переплутані з самого
 * початку. Фізика і вся логіка лишились як були, помінялись лише слова:
 *
 *   код `fold`       — заусовка 45°, текстура продовжується через ребро,
 *                      типово 100 мм, у розкрої лягає ЗЗОВНІ підклейки
 *                      → цех називає це **Потовщення**;
 *   код `thickening` — пряма підклейка знизу, текстура не продовжується,
 *                      типово 40 мм → цех називає це **Підворот**.
 *
 * Внутрішні ключі (`fold_A`, `def.fold`, `edgeKind`) НЕ перейменовані
 * свідомо: вони в збережених проєктах, у слотах елементів і в геометрії
 * розкрою, і масове перейменування даних коштувало б міграції там, де
 * помилки найдорожчі. Ціна рішення — код і цех говорять різними словами,
 * тому будь-який підпис бери ЗВІДСИ, а не пиши літерал на місці.
 */
export const EDGE_KIND_LABEL = {
  fold: 'Потовщення',
  thickening: 'Підворот',
} as const;

export type EdgeAdditionCode = keyof typeof EDGE_KIND_LABEL;

/** Зворотне читання: підпис із збереженого проєкту → код доповнення. */
export function edgeKindByLabel(label: string | undefined): EdgeAdditionCode | undefined {
  if (label === EDGE_KIND_LABEL.fold) return 'fold';
  if (label === EDGE_KIND_LABEL.thickening) return 'thickening';
  return undefined;
}

/** Префікси доповнень у слотах. Порядок неважливий — шукаємо ОСТАННІЙ збіг. */
export const ADDITION_PREFIXES = ['wall_panel', 'skirting', 'fold', 'thickening', 'leg'] as const;
export type AdditionKind = (typeof ADDITION_PREFIXES)[number];

/**
 * Розбір слота доповнення — ЄДИНЕ місце, де це робиться.
 *
 * Слот виглядає як `leg_B`, `wall_panel_BC_lcut1`, `leg_C_fold_B` або
 * `leg_B#2`. Три речі, які легко зіпсувати поодинці:
 *   · тип беремо за ОСТАННІМ префіксом (`leg_C_fold_B` — це підворот, не нога);
 *   · ребро — усе, що після нього (Г-заріз дає `BC_lcut1`, і обрізати до
 *     однієї літери не можна);
 *   · суфікс `#n` дозволяє КІЛЬКА доповнень на одному ребрі — інакше в подіум
 *     не поставити нішу, бо її стінки живуть на тих самих ребрах, що й обшивка.
 *
 * Раніше ця логіка існувала трьома копіями (розкрій, 3D Підбір, 3D Редактор),
 * і кожна знала про ребро трохи своє.
 *
 * ХВИЛЯ 4, крок 4.2 (FG-14). Четверте поле — `ownerSlot`: усе, що СТОЇТЬ
 * ПЕРЕД останнім префіксом. Раніше воно просто відкидалось, і слот
 * `leg_B_wall_panel_C` читався як «панель на стороні C» без відповіді на
 * питання «C якої деталі». Через це панель, поставлену на торець іншої
 * панелі, вішали на стільницю — власне FG-14.
 */
export function parseAdditionSlot(slot: string): {
  kind?: AdditionKind;
  sideId: string;
  index: number;
  /** Слот власника ребра; порожньо — доповнення головної деталі. */
  ownerSlot?: string;
} {
  const hashAt = slot.indexOf('#');
  const base = hashAt >= 0 ? slot.slice(0, hashAt) : slot;
  const index = hashAt >= 0 ? Number(slot.slice(hashAt + 1)) || 1 : 1;

  let best = -1;
  let kind: AdditionKind | undefined;
  let sideId = base;
  for (const prefix of ADDITION_PREFIXES) {
    const at = base.lastIndexOf(prefix + '_');
    if (at > best) {
      best = at;
      kind = prefix;
      sideId = base.slice(at + prefix.length + 1);
    }
  }
  // Власник — усе до останнього префікса, без хвостового підкреслення.
  // `leg_B_wall_panel_C` → `leg_B`; `wall_panel_C` → нічого.
  const ownerSlot = best > 0 ? base.slice(0, best - 1) : undefined;
  return { kind: best >= 0 ? kind : undefined, sideId: sideId || base, index, ownerSlot };
}
