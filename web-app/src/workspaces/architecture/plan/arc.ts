import type { PlanPoint } from '../../../domain/architecture';

/**
 * ДУГА ПО ТРЬОХ ТОЧКАХ (07.09.2026, №131, прохання власника: план із
 * аркою — «добав радіус, шоб мож було відмалювати»).
 *
 * Модель плану лишається полігоном (`points`), бо на ній тримається все
 * далі — стіни, розкладка, площа. Тому дуга не нова сутність, а просто
 * ділянка контуру, порізана на хорди: людина клацає точку НА дузі й
 * кінець, а ми вписуємо коло через три точки і сипемо вершини з кроком,
 * при якому стрілка прогину ≤ 3 мм — на плані такої похибки не видно, а
 * площа рахується чесно.
 *
 * Три точки на одній прямій кола не задають — тоді це звичайний відрізок.
 */
export function arcThrough(a: PlanPoint, mid: PlanPoint, b: PlanPoint, sagMm = 3): PlanPoint[] {
  const d = 2 * (a.x * (mid.y - b.y) + mid.x * (b.y - a.y) + b.x * (a.y - mid.y));
  if (Math.abs(d) < 1e-9) return [b];
  const sa = a.x * a.x + a.y * a.y; const sm = mid.x * mid.x + mid.y * mid.y; const sb = b.x * b.x + b.y * b.y;
  const cx = (sa * (mid.y - b.y) + sm * (b.y - a.y) + sb * (a.y - mid.y)) / d;
  const cy = (sa * (b.x - mid.x) + sm * (a.x - b.x) + sb * (mid.x - a.x)) / d;
  const r = Math.hypot(a.x - cx, a.y - cy);
  if (!(r > 0) || !Number.isFinite(r)) return [b];
  const TAU = Math.PI * 2;
  const norm = (x: number) => ((x % TAU) + TAU) % TAU;
  const a0 = Math.atan2(a.y - cy, a.x - cx);
  const relM = norm(Math.atan2(mid.y - cy, mid.x - cx) - a0);
  const relB = norm(Math.atan2(b.y - cy, b.x - cx) - a0);
  // напрям обходу — той, у якому середня точка лежить МІЖ кінцями
  const sweep = relM < relB ? relB : relB - TAU;
  const stepMax = r > sagMm ? 2 * Math.acos(1 - sagMm / r) : Math.PI / 8;
  const steps = Math.min(240, Math.max(3, Math.ceil(Math.abs(sweep) / stepMax)));
  const out: PlanPoint[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const ang = a0 + (sweep * i) / steps;
    out.push({ x: Math.round(cx + r * Math.cos(ang)), y: Math.round(cy + r * Math.sin(ang)) });
  }
  out[out.length - 1] = { x: Math.round(b.x), y: Math.round(b.y) };
  return out;
}
