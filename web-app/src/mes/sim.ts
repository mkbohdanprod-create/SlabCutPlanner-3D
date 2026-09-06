/**
 * СИМУЛЯТОР ЦЕХУ v0 — статика (06.09.2026). План MES §5.
 *
 * Що рахує: завантаження ділянки за добу (наладка + штучний × к-сть,
 * ТЗ §4.3), фонд ділянки (ТЗ §4.4), утилізацію, вузьке місце, чистий
 * час замовлення по шляху ВЦ-1 (без черг) і пропускну для заданого
 * міксу. Черги, буфери, пріоритети — v1 (DES), не тут.
 *
 * Чистий TypeScript без React — щоб переїхав у будь-який застосунок Hub.
 * Правила: МЕС-1 (згортання за кодом), МЕС-4 (матеріал ≠ операція),
 * МЕС-11 (рядок без ділянки — помилка, не пропуск; тут — окремий список).
 */
import type { MesOrder, OrderLine } from './data/orders';
import { SIM_AREAS, PATH, type SimArea, type Norms, type Fund, type NormUnit } from './data/norms';

export interface MixItem { on: boolean; n: number }
export type Mix = Record<string, MixItem>;
export type AreaLoad = Partial<Record<SimArea, number>>;

export interface SimResult {
  fund: Fund;
  /** Хв на кожній ділянці для одного замовлення (одна одиниця обладнання). */
  perOrder: Record<string, AreaLoad>;
  /** Хв за добу по ділянці з урахуванням ×N. */
  daily: Record<SimArea, number>;
  /** Фонд ділянки за добу, хв. */
  fundMin: Record<SimArea, number>;
  util: Record<SimArea, number>;
  bottleneck: SimArea;
  /** Замовлень такого міксу на добу, що цех пропускає (min по ділянках). */
  throughput: number;
  nOrders: number;
  /** Чистий час замовлення в роботі, змін (без черг). */
  leadShifts: Record<string, number>;
}

const isSimArea = (a: string | null): a is SimArea => !!a && (SIM_AREAS as readonly string[]).includes(a);
const isUnit = (u: string): u is NormUnit => u === 'м.п.' || u === 'м²' || u === 'шт' || u === 'лист';

/** Хв по ділянках для ОДНОГО замовлення: Σ(штучний × к-сть) + наладка на кожній задіяній ділянці. */
export function orderLoad(order: MesOrder, norms: Norms): AreaLoad {
  const L: AreaLoad = {};
  const used = new Set<SimArea>();
  for (const l of order.lines) {
    if (!isSimArea(l.area) || l.qty == null) continue;
    const n = norms[l.area];
    const per = isUnit(l.unit) ? n[l.unit] : 0;
    L[l.area] = (L[l.area] ?? 0) + per * l.qty;
    used.add(l.area);
  }
  for (const a of used) L[a] = (L[a] ?? 0) + norms[a].setup;
  return L;
}

/** Критичний шлях ВЦ-1: групи послідовно, у групі — максимум (паралельно). */
export function leadMinutes(L: AreaLoad): number {
  let t = 0;
  for (const g of PATH) t += Math.max(0, ...g.map((a) => L[a] ?? 0));
  return t;
}

/** Рядки заявки без ділянки — мають бути лише матеріали (МЕС-4). */
export function unmappedLines(order: MesOrder): OrderLine[] {
  return order.lines.filter((l) => !isSimArea(l.area));
}

export function simulate(orders: MesOrder[], mix: Mix, norms: Norms, fund: Fund): SimResult {
  const perOrder: Record<string, AreaLoad> = {};
  const daily = Object.fromEntries(SIM_AREAS.map((a) => [a, 0])) as Record<SimArea, number>;
  let nOrders = 0;
  for (const o of orders) {
    perOrder[o.id] = orderLoad(o, norms);
    const m = mix[o.id];
    if (!m || !m.on || m.n <= 0) continue;
    nOrders += m.n;
    for (const a of SIM_AREAS) daily[a] += (perOrder[o.id][a] ?? 0) * m.n;
  }
  const fundMin = Object.fromEntries(SIM_AREAS.map((a) => [a, fund.hours * 60 * fund.shifts * norms[a].units * fund.avail])) as Record<SimArea, number>;
  const util = Object.fromEntries(SIM_AREAS.map((a) => [a, fundMin[a] > 0 ? daily[a] / fundMin[a] : (daily[a] > 0 ? Infinity : 0)])) as Record<SimArea, number>;
  const bottleneck = SIM_AREAS.reduce<SimArea>((b, a) => (util[a] > util[b] ? a : b), SIM_AREAS[0]);
  const ks = SIM_AREAS.filter((a) => daily[a] > 0).map((a) => fundMin[a] / daily[a]);
  const k = ks.length ? Math.min(...ks) : 0;
  const throughput = Number.isFinite(k) ? k * nOrders : 0;
  const leadShifts = Object.fromEntries(orders.map((o) => [o.id, leadMinutes(perOrder[o.id]) / (fund.hours * 60)]));
  return { fund, perOrder, daily, fundMin, util, bottleneck, throughput, nOrders, leadShifts };
}
