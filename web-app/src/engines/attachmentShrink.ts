import { getDetailPointsAndBounds, buildDetailShape } from './shapeBuilder';

/**
 * УСАДКА ВТОПЛЕНОГО ДОПОВНЕННЯ (Б-170, правило власника 09.09).
 *
 * Правило цеху, слово в слово: «якщо деталь-нога на краю, то вона примикає
 * під 45°; а якщо втоплена — зменшується в розмірі на товщину стільниці і
 * ноги справа і примикає перпендикулярно торцем до них».
 *
 * Тобто:
 *
 *   · НА КРОМЦІ (в глиб = 0) — вус 45° зі стільницею і вус 45° із сусідньою
 *     ногою на куті. Довжина на всю сторону, верх ноги виходить на ВЕРХНЮ
 *     площину плити. Це давня поведінка, її не чіпаємо.
 *
 *   · ВТОПЛЕНА (в глиб > 0) — вусів немає взагалі, всі стики прямі, торцем:
 *       – по висоті нога впирається в НИЗ стільниці → мінус її товщина;
 *       – по довжині впирається в торці сусідніх ніг → мінус їхня товщина
 *         з того боку, де сусід реально є;
 *       – і зсувається вздовж ребра на товщину сусіда з боку початку —
 *         інакше після вкорочення висіла б у повітрі.
 *
 * Числа рахує САМЕ ЦЯ функція, а не користувач (рішення власника 09.09:
 * «система сама»). У полях модалки лишаються круглі числа технолога — 900 і
 * 2000, бо він мислить «від стільниці до підлоги» і «на всю сторону».
 * Застосовується там, де драфт сесії стає деталлю виробу, тому однакові
 * розміри бачать і 3D, і РОЗКРІЙ, і кошторис — а не три різні.
 */

export interface InsetShrinkInput {
  /** «В глиб стільниці», мм. ≤ 0 — доповнення на кромці, усадки немає. */
  inset: number;
  /** Задана користувачем довжина доповнення, мм. */
  width: number;
  /** Задана користувачем висота доповнення, мм. */
  height: number;
  /** Зсув уздовж ребра від початку сторони, мм. */
  attachOffset: number;
  /** Наявний відступ у напрямку росту, мм. */
  attachGap?: number;
  /** Фактична довжина ребра, до якого кріпимось, мм. */
  sideLength: number;
  /** Товщина батьківської деталі (стільниці), мм. */
  parentThickness: number;
  /** Товщина сусіда з боку ПОЧАТКУ сторони, мм. 0 — сусіда немає. */
  neighbourAtStart: number;
  /** Товщина сусіда з боку КІНЦЯ сторони, мм. 0 — сусіда немає. */
  neighbourAtEnd: number;
  /**
   * Куди росте доповнення: `true` — звисає ВНИЗ (нога, підворот, потовщення),
   * `false` — стоїть УГОРУ (стінова панель, бортик).
   *
   * Різниця не косметична. Нога, яку втопили, стає під плиту: вона коротшає
   * на її товщину і на ту саму товщину ОПУСКАЄТЬСЯ, інакше висить над
   * підлогою — власник 09.09: «підняло ногу на ті 20 мм від підлоги».
   * Панель, що стоїть угору, при втопленні по висоті не міняється взагалі:
   * вона як стояла на верхній площині, так і стоїть.
   */
  growsDown: boolean;
  /**
   * Чи різати по ДОВЖИНІ (мінус сусіди). Правило власника стосувалось саме
   * втопленої деталі: вона заходить під плиту і впирається в торці сусідів.
   * Якщо ж стик став прямим лише через КРОМКУ, а сама деталь лишилась на
   * своєму ребрі, вона нікуди не зсунулась — сусіди їй не заважають, і
   * коротшати по довжині нема причини (власник 09.09: «поставив кромку, а
   * деталь зменшилась не лише по висоті, а й по ширині»).
   */
  trimSides: boolean;
}

export interface InsetShrinkResult {
  width: number;
  height: number;
  attachOffset: number;
  /** Відступ від ребра в напрямку росту: для втопленої ноги — товщина плити. */
  attachGap: number;
  /** Чи взагалі щось змінилось — зручно для тестів і для підпису в UI. */
  shrunk: boolean;
}

/** Допуск, у межах якого вважаємо, що доповнення дістає до краю сторони. */
const TOUCH_EPS = 0.5;

export function shrinkInsetAttachment(input: InsetShrinkInput): InsetShrinkResult {
  const { inset, width, height, attachOffset, sideLength, parentThickness, growsDown } = input;
  const gap = input.attachGap ?? 0;
  const base = { width, height, attachOffset, attachGap: gap, shrunk: false };
  if (!(inset > 0)) return base;
  if (!(width > 0) || !(height > 0)) return base;

  /*
   * По висоті — тільки те, що звисає вниз: воно стає ПІД плиту. Коротшає на
   * її товщину і на ту саму товщину опускається, щоб низ лишився на підлозі.
   * Те, що росте вгору, при втопленні по висоті не міняється.
   */
  const plate = growsDown ? Math.max(0, parentThickness) : 0;
  const nextHeight = Math.max(1, height - plate);
  const nextGap = gap + plate;

  // По довжині — тільки з того боку, яким деталь реально впирається в сусіда.
  const touchesStart = input.trimSides && attachOffset <= TOUCH_EPS;
  const touchesEnd = input.trimSides && attachOffset + width >= sideLength - TOUCH_EPS;
  const cutStart = touchesStart ? Math.max(0, input.neighbourAtStart) : 0;
  const cutEnd = touchesEnd ? Math.max(0, input.neighbourAtEnd) : 0;

  const nextWidth = Math.max(1, width - cutStart - cutEnd);
  const nextOffset = Math.max(0, attachOffset + cutStart);

  return {
    width: nextWidth,
    height: nextHeight,
    attachOffset: nextOffset,
    attachGap: nextGap,
    shrunk: nextWidth !== width || nextHeight !== height
      || nextOffset !== attachOffset || nextGap !== gap,
  };
}

/**
 * Сусіди кожної сторони по контуру: яка сторона йде перед нею і яка після.
 *
 * Береться з тієї самої побудови форми, що й 3D (`buildDetailShape`), тому
 * працює на прямокутнику, на Г- і П-подібній деталі однаково. Дуги
 * скруглень пропускаються: сусідом ноги є сусідня НОГА, а не дуга між ними.
 */
export function edgeNeighbours(def: unknown): Record<string, { prev?: string; next?: string }> {
  const out: Record<string, { prev?: string; next?: string }> = {};
  try {
    const { points, bounds } = getDetailPointsAndBounds(def as never);
    const { curves, edgeMap } = buildDetailShape(def as never, points, bounds);
    const order: string[] = [];
    (curves ?? []).forEach((curve: { type?: string }, i: number) => {
      const id = (edgeMap as Record<number, string> | undefined)?.[i];
      if (!id || curve?.type !== 'LineCurve') return;
      if (order[order.length - 1] === id) return; // сторона з кількох відрізків
      order.push(id);
    });
    // Замикання: якщо контур почався і закінчився тією самою стороною.
    if (order.length > 1 && order[0] === order[order.length - 1]) order.pop();
    order.forEach((id, i) => {
      out[id] = {
        prev: order[(i - 1 + order.length) % order.length],
        next: order[(i + 1) % order.length],
      };
    });
  } catch {
    // Контур не побудувався — лишаємо порожньо, усадки по довжині не буде.
  }
  return out;
}

/** Фактична довжина кожного ребра контуру (мм) — та сама, що бачить 3D. */
export function realEdgeLengthsOf(def: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    const { points, bounds } = getDetailPointsAndBounds(def as never);
    const { curves, edgeMap } = buildDetailShape(def as never, points, bounds);
    const w = (bounds.maxX - bounds.minX) || 1;
    const h = (bounds.maxY - bounds.minY) || 1;
    (curves ?? []).forEach((curve: { type?: string; v1?: { x: number; y: number }; v2?: { x: number; y: number } }, i: number) => {
      const id = (edgeMap as Record<number, string> | undefined)?.[i];
      if (!id || curve?.type !== 'LineCurve' || !curve.v1 || !curve.v2) return;
      const dx = (curve.v2.x - curve.v1.x) * w;
      const dy = (curve.v2.y - curve.v1.y) * h;
      const len = Math.hypot(dx, dy);
      if (!out[id] || len > out[id]) out[id] = len;
    });
  } catch {
    // Контур не побудувався — усадки по довжині не буде.
  }
  return out;
}

/** Мінімум полів драфта, потрібних для усадки. */
export interface ShrinkableDraft {
  width?: number;
  height?: number;
  thickness?: number;
  attachOffset?: number;
  attachInset?: number;
  attachGap?: number;
  /**
   * №172: стик із батьком ПРЯМИЙ, а не вус 45°. Виставляється розрахунком —
   * коли доповнення втоплене або коли на цій стороні стоїть кромка.
   */
  attachStraight?: boolean;
}

/**
 * Чи є на цій стороні обробка торця (кромка). Формат `edgeProfiles` історично
 * подвійний: або сам код профілю рядком, або об'єкт із `top`/`bottom`.
 */
export function sideHasEdgeProfile(ownerDetail: unknown, sideId: string): boolean {
  const map = (ownerDetail as { edgeProfiles?: Record<string, unknown> } | undefined)?.edgeProfiles;
  const value = map?.[sideId];
  if (!value) return false;
  if (typeof value === 'string') return value.length > 0;
  const t = value as { top?: { profileId?: string }; bottom?: { profileId?: string } };
  return Boolean(t.top?.profileId || t.bottom?.profileId);
}

/**
 * ОДНА ТОЧКА ПРАВДИ ПРО РОЗМІР ВТОПЛЕНОГО ДОПОВНЕННЯ.
 *
 * Б-170, друга серія (власник 09.09: «в 3D показує, що деталь не зменшилась,
 * а ти мені кажеш, що так»). Перша версія рахувала усадку ЛИШЕ там, де драфт
 * стає деталлю виробу — тобто для розкрою і кошторису. А 3D редактора малює
 * прямо з драфта сесії, окремим шляхом: у цеху виходило 1160×880, на екрані
 * 1200×900. Два числа в одній програмі — рівно та хвороба, з якої почався
 * увесь цей баг.
 *
 * Тому усадка живе тут, і обидва шляхи звертаються сюди. `parse` приходить
 * ззовні (domain/ids), щоб рушій не тягнув за собою розбір слотів.
 */
export function shrunkAttachmentDraft<T extends ShrinkableDraft>(args: {
  slot: string;
  draft: T;
  /** Деталь, до ребра якої кріпимось (стільниця або власник вкладеного слота). */
  ownerDetail: unknown;
  /** Усі доповнення сесії — щоб знайти сусідів на суміжних сторонах. */
  subDetails: Record<string, T>;
  parse: (slot: string) => { kind?: string; sideId?: string; ownerSlot?: string };
  /** Довжина ребра, якщо викликач її вже порахував. */
  sideLength?: number;
}): T {
  const { slot, draft, ownerDetail, subDetails, parse } = args;
  if (!draft) return draft;

  const parsed = parse(slot);
  const sideId = parsed.sideId;
  if (!sideId) return draft;

  /*
   * №172 — КРОМКА ДИКТУЄ ПРИМИКАННЯ (власник 09.09, погоджено варіант «а»).
   *
   * Стик стає прямим у двох випадках: доповнення втоплене АБО на цій стороні
   * стоїть кромка. Кромка — річ видима, і закривати її вусом 45° не можна:
   * доповнення відходить під плиту, торець лишається відкритим і обробленим.
   *
   * Різниця між випадками одна: втоплення ще й відсуває деталь углиб, а сама
   * кромка — ні. Тому «в глиб» лишається окремим рішенням технолога.
   */
  const inset = draft.attachInset ?? 0;
  const straight = inset > 0 || sideHasEdgeProfile(ownerDetail, sideId);
  if (!straight) return draft;

  const sideLength = args.sideLength ?? realEdgeLengthsOf(ownerDetail)[sideId] ?? 0;
  if (!(sideLength > 0)) return { ...draft, attachStraight: true };

  const growsDown = (kind?: string) => kind === 'leg' || kind === 'thickening' || kind === 'fold';
  const ourDown = growsDown(parsed.kind);
  const parentThickness = (ownerDetail as { thickness?: number } | undefined)?.thickness ?? 0;

  const neighbourThickness = (neighbourSide?: string) => {
    if (!neighbourSide) return 0;
    let best = 0;
    Object.entries(subDetails ?? {}).forEach(([otherSlot, other]) => {
      if (otherSlot === slot || !other) return;
      const p = parse(otherSlot);
      if (p.sideId !== neighbourSide) return;
      if ((p.ownerSlot ?? '') !== (parsed.ownerSlot ?? '')) return;
      if (growsDown(p.kind) !== ourDown) return;
      /*
       * ВТОПЛЕНИЙ СУСІД У КУТІ НЕ СТОЇТЬ. Він сам відійшов углиб, тому нашу
       * деталь ні в що не впирає — Т-подібний перетин, а не кут. Саме через
       * це нога з кромкою вкоротилась удвічі: їй зарахували сусідню втоплену.
       */
      if ((other.attachInset ?? 0) > 0.5) return;
      const t = other.thickness || parentThickness || 0;
      if (t > best) best = t;
    });
    return best;
  };

  const around = edgeNeighbours(ownerDetail)[sideId] ?? {};
  const result = shrinkInsetAttachment({
    /* Кромка без втоплення теж дає прямий стик — рахуємо як «втоплення 0+». */
    inset: inset > 0 ? inset : 1,
    /* По довжині ріже лише справжнє втоплення, не сама кромка. */
    trimSides: inset > 0,
    width: draft.width || sideLength,
    height: draft.height || (parsed.kind === 'leg' ? 900 : 0),
    attachOffset: draft.attachOffset ?? 0,
    attachGap: (draft as { attachGap?: number }).attachGap ?? 0,
    sideLength,
    parentThickness,
    neighbourAtStart: neighbourThickness(around.prev),
    neighbourAtEnd: neighbourThickness(around.next),
    growsDown: ourDown,
  });
  return {
    ...draft,
    attachStraight: true,
    width: result.width,
    height: result.height,
    attachOffset: result.attachOffset,
    attachGap: result.attachGap,
  };
}
