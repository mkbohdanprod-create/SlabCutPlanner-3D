import type { ElementDefinition, ProductElement, ProductSinkDef, SurfaceCutout } from './types';
import { buildElementPath } from './ids';
import { cutoutCenter } from './cutoutAnchor';
import { anchorContextFor } from './elementToDetail';

/**
 * Мийка, ВСТАНОВЛЕНА в стільницю (нижній монтаж).
 *
 * Джерело істини одне — `sinks` на драфті стільниці. Все інше похідне:
 *   · виріз у стільниці (отвір = внутрішній контур чаші) — додається до
 *     cutouts на льоту, а не зберігається, щоб не дублювався;
 *   · елемент-мийка у виробі — з нього рушій розкрою робить комплект
 *     деталей (стінки, трикутники дна, підклейки), як для окремої мийки.
 *
 * Так менеджер позиціонує мийку «як виріз» (координати центру чаші),
 * а цех отримує і отвір у стільниці, і деталі чаші — без ручної синхронізації.
 */

export const SINK_SLOT_PREFIX = 'sink_';

/** Радіус кутів отвору під прямокутну чашу, мм */
const SINK_CUTOUT_CORNER_RADIUS = 10;

export function sinkCutout(sink: ProductSinkDef): SurfaceCutout {
  return {
    id: `sink_cut_${sink.id}`,
    shape: 'rect',
    type: 'custom',
    // Прив'язка і координати чаші успадковуються вирізом один-в-один: мийка і
    // отвір під неї не мають права міряти по-різному. Порожній bindCorner —
    // «від лівого верхнього кута деталі». Див. domain/cutoutAnchor.ts.
    bindCorner: sink.bindCorner ?? '',
    x: sink.x,
    y: sink.y,
    width: sink.width,
    height: sink.height,
    cornerRadius: SINK_CUTOUT_CORNER_RADIUS,
    // №156: поворот чаші успадковується отвором — інакше чаша стояла б під
    // кутом у прямому отворі.
    rotation: sink.rotation,
  };
}

/**
 * ЦЕНТР чаші в координатах деталі — єдине джерело для всіх, хто малює чашу.
 *
 * Рахується буквально через той самий `cutoutCenter`, що й отвір у стільниці
 * (мийка представляється своїм же похідним вирізом). Тому чаша і отвір
 * фізично не можуть розійтись: обоє читають одну формулу.
 *
 * Баг, від якого цей хелпер: коли координати мийки перевели на «від кута до
 * кута чаші», отвір поїхав за новою формулою, а обидва 3D-рендери чаші далі
 * трактували sink.x/y як центр — чаша висіла зі зсувом у пів габариту від
 * свого ж вирізу.
 */
export function sinkCenter(def: ElementDefinition, sink: ProductSinkDef): { cx: number; cy: number } {
  return cutoutCenter(sinkCutout(sink), anchorContextFor(def));
}

/** Похідні вирізи для всіх мийок деталі (порожньо, якщо мийок немає) */
export function sinkCutoutRecord(
  def: Pick<ElementDefinition, 'sinks'> | undefined,
): Record<string, SurfaceCutout> {
  const out: Record<string, SurfaceCutout> = {};
  Object.values(def?.sinks ?? {}).forEach((sink) => {
    const cut = sinkCutout(sink);
    out[cut.id] = cut;
  });
  return out;
}

/**
 * Деталь із домішаними вирізами під мийки. Повертає ТУ САМУ довідку,
 * якщо мийок немає — щоб не ламати мемоізацію React.
 */
export function withSinkCutouts<T extends { cutouts?: Record<string, SurfaceCutout>; sinks?: Record<string, ProductSinkDef> }>(
  def: T,
): T {
  if (!def?.sinks || Object.keys(def.sinks).length === 0) return def;
  return { ...def, cutouts: { ...(def.cutouts ?? {}), ...sinkCutoutRecord(def) } };
}

/**
 * Елементи-мийки для виробу. Кожна мийка стільниці стає доповненням
 * (additions) зі слотом `sink_<id>` — далі flattenProductToDetails робить
 * із неї деталь із geometry.sinkKind, і розкрій розкладає її на комплект.
 */
export function sinkAdditionElements(
  productId: string,
  mainDef: ElementDefinition,
): ProductElement[] {
  return Object.values(mainDef?.sinks ?? {}).map((sink) => ({
    id: buildElementPath(productId, `${SINK_SLOT_PREFIX}${sink.id}`),
    type: 'Мийка',
    baseDefinition: {
      type: 'Мийка',
      kind: sink.kind === 'slot' ? 'sink_slot' : 'sink_rect',
      quantity: mainDef.quantity || 1,
      thickness: mainDef.thickness,
      width: sink.width,
      height: sink.height,
      innerVertical: sink.depth,
      /* Решітка зливу (28.08) їде з запису мийки в елемент — інакше різ
         водою лишився б лише в полях стільниці і не дійшов би ні до 3D,
         ні до деталей розкрою. */
      drainGrate: sink.drainGrate,
      label: `Мийка (${sink.id})`,
    } as unknown as ElementDefinition,
    additions: [],
    joints: [],
  }));
}

/** Дефолтна мийка: по центру деталі, чаша 500×400×200 */
export function createProductSink(id: string, def: ElementDefinition): ProductSinkDef {
  return {
    id,
    kind: 'rect',
    /* №156 (власник: «тут по дефолту 100»): нова мийка стає з відступом
       100 мм від сторін — так само, як новий виріз. Раніше вона падала в
       середину деталі, і перше, що робив менеджер, — переміряв обидва поля. */
    x: 100,
    y: 100,
    width: 500,
    height: 400,
    depth: 200,
  };
}
