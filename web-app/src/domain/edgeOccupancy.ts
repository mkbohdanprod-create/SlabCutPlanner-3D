import { parseAdditionSlot, EDGE_KIND_LABEL, type AdditionKind } from './ids';

/**
 * ЗАЙНЯТІ ТОРЦІ (01.09, власник: «ми створили потовщення … і не врахували
 * це в кромках — можемо обрати доп. обробку, що неправильно»).
 *
 * Доповнення, що ЗВИСАЄ з ребра — нога, потовщення (`fold`, 45°), підворот
 * (`thickening`, підклейка) — закриває торець плити: фрезерувати там нема
 * чого, а в 3D профіль на плиті плюс смуга під нею дали б нісенітницю.
 * Бортик і стінова панель ростуть угору й торця не чіпають.
 *
 * Тимчасове рішення власника: такі сторони в панелі кромок блокуються.
 * Далі він вирішує, чи профіль на них переходить на нижнє ребро
 * доповнення (борт 40 у каталозі — саме «лише з потовщенням»).
 */
export const EDGE_OCCUPYING_KINDS: readonly AdditionKind[] = ['leg', 'fold', 'thickening'];

/** Підпис виду доповнення так, як його називає цех (domain/ids). */
export function additionKindLabel(kind: AdditionKind | undefined): string {
  switch (kind) {
    case 'fold': return EDGE_KIND_LABEL.fold;
    case 'thickening': return EDGE_KIND_LABEL.thickening;
    case 'leg': return 'Нога';
    case 'skirting': return 'Бортик';
    case 'wall_panel': return 'Стінова панель';
    default: return 'Доповнення';
  }
}

export interface LegacyEdgeFeature { enabled?: boolean; sides?: string[] }

/**
 * Сторона → підпис доповнення, що її закриває («Потовщення (A)», «Нога (B #2)»).
 *
 * `ownerSlot` — чиї сторони перевіряємо: головна деталь — без нього,
 * доповнення — його слот (нога під панеллю живе як `wall_panel_B_leg_C`).
 * Легасі-галочки `detail.fold/thickening.sides` — теж зайнятість (3D
 * малює їх блоком LOCAL ATTACHMENTS). Сторона-дуга (`B_radius`) — не
 * прямий торець панелі кромок, її не чіпаємо. Ребра Г-зарізу
 * (`BC_lcut1`) з 07.09 (Б-002) — повноцінні сторони панелі кромок,
 * тому нога на такому ребрі закриває його так само, як на звичайному.
 * `sideLabels` — показувані імена таких ребер (`CD_lcut1` → «D1»,
 * `domain/sideNaming.lcutEdgeLabels`), лише для підпису.
 */
export function occupiedEdgeSides(args: {
  subDetails?: Record<string, unknown> | null;
  ownerSlot?: string;
  legacy?: { fold?: LegacyEdgeFeature | null; thickening?: LegacyEdgeFeature | null } | null;
  sideLabels?: Record<string, string>;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const plain = (sideId: string) => !/_radius$/.test(sideId);
  const shown = (sideId: string) => args.sideLabels?.[sideId] ?? sideId;
  for (const slot of Object.keys(args.subDetails ?? {})) {
    const parsed = parseAdditionSlot(slot);
    if (!parsed.kind || !EDGE_OCCUPYING_KINDS.includes(parsed.kind)) continue;
    if ((parsed.ownerSlot ?? undefined) !== (args.ownerSlot ?? undefined)) continue;
    if (!plain(parsed.sideId)) continue;
    // Слоти власника мають префікс `${kind}_` тільки на верхньому рівні; для
    // вкладених ownerSlot уже відсіяв чужі.
    if (!out[parsed.sideId]) {
      out[parsed.sideId] = `${additionKindLabel(parsed.kind)} (${shown(parsed.sideId)}${parsed.index > 1 ? ` #${parsed.index}` : ''})`;
    }
  }
  if (!args.ownerSlot && args.legacy) {
    for (const kind of ['fold', 'thickening'] as const) {
      const feature = args.legacy[kind];
      if (!feature?.enabled) continue;
      for (const side of feature.sides ?? []) {
        if (!out[side] && plain(side)) out[side] = `${additionKindLabel(kind)} (${shown(side)})`;
      }
    }
  }
  return out;
}
