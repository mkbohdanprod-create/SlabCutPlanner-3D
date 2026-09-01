import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import type { DetailPart } from '../../domain/types';
import { buildEdgeCutters, __edgeCutterInternals as internals } from '../edgeCutters';

/**
 * ТОРЦІ НА РАДІУСАХ (01.09.2026). Перевіряємо не картинку, а фізику
 * різака: тіло замкнене (кожне ребро рівно у двох трикутниках), об'єм
 * додатний, перетин на дузі стоїть радіально, увігнутий радіус менший за
 * фрезу не ріжеться, гострий внутрішній кут рве шлях.
 */

type P = { x: number; y: number };

const ARC_STEPS = 12; // як у engines/geometry.ts addArc — 12 на 90°

function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps = ARC_STEPS): P[] {
  const out: P[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

function dedupe(points: P[]): P[] {
  const out: P[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.05) continue;
    out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 0.05) out.pop();
  return out;
}

/** Прямокутник 600×400 з радіусом 100 на куті AB (обхід за годинниковою, y вниз). */
function rectWithRadius(r = 100): DetailPart {
  const w = 600; const h = 400;
  const points = dedupe([
    { x: 0, y: 0 },
    { x: w - r, y: 0 },
    ...arc(w - r, r, r, -Math.PI / 2, 0),
    { x: w, y: r },
    { x: w, y: h },
    { x: 0, y: h },
  ]);
  return {
    id: 'p', detailId: 'd', name: 'R', isMain: true, width: w, height: h, points,
    sideSegments: {
      A: { start: { x: 0, y: 0 }, end: { x: w - r, y: 0 } },
      B: { start: { x: w, y: r }, end: { x: w, y: h } },
      C: { start: { x: w, y: h }, end: { x: 0, y: h } },
      D: { start: { x: 0, y: h }, end: { x: 0, y: 0 } },
    },
  } as unknown as DetailPart;
}

/**
 * Г-подібна 1000×600 з полицею 300 і ВНУТРІШНІМ радіусом r у куті
 * (600,300). Скруглення внутрішнього кута додає матеріал: центр дуги
 * (600+r, 300+r) лежить у виїмці.
 */
function lWithInnerRadius(r: number): DetailPart {
  const cx = 600 + r; const cy = 300 + r;
  const points = dedupe([
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 300 },
    { x: cx, y: 300 },
    ...arc(cx, cy, r, -Math.PI / 2, -Math.PI), // від (cx,300) до (600,cy)
    { x: 600, y: cy },
    { x: 600, y: 600 },
    { x: 0, y: 600 },
  ]);
  return {
    id: 'p', detailId: 'd', name: 'L', isMain: true, width: 1000, height: 600, points,
    sideSegments: {
      A: { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } },
      B: { start: { x: 1000, y: 0 }, end: { x: 1000, y: 300 } },
      C: { start: { x: 1000, y: 300 }, end: { x: cx, y: 300 } },
      D: { start: { x: 600, y: cy }, end: { x: 600, y: 600 } },
      E: { start: { x: 600, y: 600 }, end: { x: 0, y: 600 } },
      F: { start: { x: 0, y: 600 }, end: { x: 0, y: 0 } },
    },
  } as unknown as DetailPart;
}

/** Замкненість: кожне ребро рівно у двох трикутниках. І знак об'єму. */
function manifoldStats(geometry: BufferGeometry) {
  const pos = geometry.attributes.position;
  const key = (i: number) => `${pos.getX(i).toFixed(7)}|${pos.getY(i).toFixed(7)}|${pos.getZ(i).toFixed(7)}`;
  const edges = new Map<string, number>();
  let volume = 0;
  for (let t = 0; t < pos.count; t += 3) {
    const ids = [key(t), key(t + 1), key(t + 2)];
    for (let e = 0; e < 3; e += 1) {
      const a = ids[e]; const b = ids[(e + 1) % 3];
      const k = a < b ? `${a}#${b}` : `${b}#${a}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
    const A = [pos.getX(t), pos.getY(t), pos.getZ(t)];
    const B = [pos.getX(t + 1), pos.getY(t + 1), pos.getZ(t + 1)];
    const C = [pos.getX(t + 2), pos.getY(t + 2), pos.getZ(t + 2)];
    volume += A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
  }
  const bad = [...edges.values()].filter((c) => c !== 2).length;
  return { badEdges: bad, volume: volume / 6, triangles: pos.count / 3 };
}

function boundsMm(geometry: BufferGeometry) {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  return { minX: b.min.x * 1000, maxX: b.max.x * 1000, minZ: b.min.z * 1000, maxZ: b.max.z * 1000, minY: b.min.y * 1000, maxY: b.max.y * 1000 };
}

describe('шлях фрези: станції', () => {
  it('на дузі перетин стоїть радіально — назовні від центра', () => {
    const r = 100;
    const chain = arc(0, 0, r, 0, Math.PI / 2, 12);
    // Контур за годинниковою у системі y-вниз, матеріал усередині кола.
    const stations = internals.stationsFor(chain, 1, false);
    // Внутрішні станції: бісектриса ≈ радіус-вектор (з точністю до знака —
    // знак задає outwardSign; перевіряємо колінеарність).
    for (let i = 1; i < stations.length - 1; i += 1) {
      const st = stations[i];
      const rx = st.p.x / r; const ry = st.p.y / r;
      expect(Math.abs(st.ox * rx + st.oy * ry)).toBeCloseTo(1, 3);
      // Мітра на 7.5° — 1/cos(3.75°) ≈ 1.0021
      expect(st.scale).toBeCloseTo(1 / Math.cos((7.5 / 2) * (Math.PI / 180)), 4);
    }
  });

  it('прямий кут: мітра 1/cos45°, на кінцях відкритого шляху — 1', () => {
    const stations = internals.stationsFor([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], -1, false);
    expect(stations[0].scale).toBe(1);
    expect(stations[1].scale).toBeCloseTo(Math.SQRT2, 5);
    expect(stations[2].scale).toBe(1);
  });
});

describe('шлях фрези: де рветься', () => {
  it('гострий внутрішній кут — break; опуклий — ok', () => {
    // Г-контур за годинниковою; (600,300) — внутрішній кут
    const chain = [{ x: 1000, y: 0 }, { x: 1000, y: 300 }, { x: 600, y: 300 }, { x: 600, y: 600 }];
    const flags = internals.flagVertices(chain, false, true, false, 2);
    expect(flags).toEqual(['ok', 'ok', 'break', 'ok']);
  });

  it('полога увігнута дуга R50 з фрезою 10 — суцільна; R8 — не ріжеться (drop)', () => {
    const big = lWithInnerRadius(50);
    const small = lWithInnerRadius(8);
    const flagsBig = internals.flagVertices(big.points, true, true, false, 10);
    const flagsSmall = internals.flagVertices(small.points, true, true, false, 10);
    expect(flagsBig.filter((f) => f === 'drop').length).toBe(0);
    expect(flagsBig.filter((f) => f === 'break').length).toBe(0);
    expect(flagsSmall.filter((f) => f === 'drop').length).toBeGreaterThan(5);
  });

  it('splitChain: розрив ділить шлях, спільна вершина в обох ділянках', () => {
    const chain = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    const runs = internals.splitChain(chain, ['ok', 'ok', 'break', 'ok']);
    expect(runs.map((r) => r.length)).toEqual([3, 2]);
    expect(runs[0][2]).toBe(chain[2]);
    expect(runs[1][0]).toBe(chain[2]);
  });
});

describe('різаки на радіусах', () => {
  it('зовнішній радіус R100, R10 на A і B: ОДНЕ замкнене тіло через дугу', () => {
    const cutters = buildEdgeCutters(rectWithRadius(100), { A: 'r_10', B: 'r_10' }, 20);
    // Однаковий профіль на сусідніх сторонах — один шлях фрези, не два
    // різаки з кришками в одній площині на середині дуги.
    expect(cutters.length).toBe(1);
    const s = manifoldStats(cutters[0]);
    expect(s.badEdges).toBe(0);
    expect(s.volume).toBeGreaterThan(0);
    const b = boundsMm(cutters[0]);
    // Від початку A (x=0 → X=−300, за плиту) до кінця B (y=400 → Z=+200, за плиту)
    expect(b.minX).toBeLessThan(-300);
    expect(b.maxZ).toBeGreaterThan(200);
  });

  it('один профіль на ВСІХ сторонах — замкнене кільце без кришок', () => {
    const cutters = buildEdgeCutters(rectWithRadius(100), { A: 'r_10', B: 'r_10', C: 'r_10', D: 'r_10' }, 20);
    expect(cutters.length).toBe(1);
    const s = manifoldStats(cutters[0]);
    expect(s.badEdges).toBe(0);
    expect(s.volume).toBeGreaterThan(0);
    const b = boundsMm(cutters[0]);
    // Кільце не виходить за плиту далі за виліт різака (OUT 4 мм + закус)
    expect(b.minX).toBeGreaterThan(-300 - 5);
    expect(b.maxX).toBeLessThan(300 + 5);
  });

  it('різні профілі на сусідніх сторонах, кут без галочки: кожен різак до початку дуги і наскрізь по дотичній', () => {
    // 01.09, власник: «хай наскрізь проходить фреза». Раніше різак A ішов до
    // середини дуги і зупинявся кришкою — посеред радіуса лишалась сходинка.
    const cutters = buildEdgeCutters(rectWithRadius(100), { A: 'r_10', B: 'chamfer_2x2' }, 20);
    expect(cutters.length).toBe(2);
    for (const c of cutters) expect(manifoldStats(c).badEdges).toBe(0);
    // Пряма A закінчується на x=500 (X=200); вибіг за плиту — на товщину (20)
    const a = boundsMm(cutters[0]);
    expect(a.maxX).toBeGreaterThan(200 + 20 - 0.5);
    expect(a.maxX).toBeLessThan(200 + 20 + 0.5);
    // Різак B так само: починається на y=100 (Z=−100) і вибігає вгору на 20
    const b = boundsMm(cutters[1]);
    expect(b.minZ).toBeLessThan(-100 - 20 + 0.5);
    expect(b.minZ).toBeGreaterThan(-100 - 20 - 0.5);
  });

  it('один профіль на стороні, кут без галочки: різак не зупиняється посеред дуги', () => {
    const cutters = buildEdgeCutters(rectWithRadius(100), { A: 'chamfer_2x2' }, 20);
    expect(cutters.length).toBe(1);
    const a = boundsMm(cutters[0]);
    // до початку дуги (X=200) плюс наскрізний вибіг на товщину, а не 270.7+2
    expect(a.maxX).toBeGreaterThan(219);
    expect(a.maxX).toBeLessThan(221);
    expect(manifoldStats(cutters[0]).badEdges).toBe(0);
  });

  it('увігнутий радіус R50 з R10: суцільне тіло без розривів', () => {
    const cutters = buildEdgeCutters(lWithInnerRadius(50), { C: 'r_10' }, 20);
    expect(cutters.length).toBe(1);
    const s = manifoldStats(cutters[0]);
    expect(s.badEdges).toBe(0);
    expect(s.volume).toBeGreaterThan(0);
    // Сторона C з половиною дуги: доходить до середини дуги (кут −135°)
    const b = boundsMm(cutters[0]);
    const midX = 650 + 50 * Math.cos(-Math.PI * 0.75);
    expect(b.minX).toBeLessThan(midX - 500 + 1);
  });

  it('увігнутий радіус R8 з фрезою R10: дуга НЕ ріжеться, пряма — до її початку', () => {
    const cutters = buildEdgeCutters(lWithInnerRadius(8), { C: 'r_10' }, 20);
    expect(cutters.length).toBe(1);
    const b = boundsMm(cutters[0]);
    // Пряма C закінчується на x=608 (початок дуги); різак не заходить далі
    // за нього більше ніж на глибину перетину.
    expect(b.minX).toBeGreaterThan(608 - 500 - 0.5);
    expect(manifoldStats(cutters[0]).badEdges).toBe(0);
  });

  it('галочка «Обробка торців» на куті: профіль сусідньої сторони йде через ВСЮ дугу', () => {
    const part = rectWithRadius(100);
    const half = buildEdgeCutters(part, { A: 'r_10' }, 20);
    const full = buildEdgeCutters(part, { A: 'r_10' }, 20, {
      corners: { AB: { type: 'radius', radius: 100, edgeProcessing: 'Стандарт' } },
    });
    expect(half.length).toBe(1);
    expect(full.length).toBe(1);
    const hb = boundsMm(half[0]);
    const fb = boundsMm(full[0]);
    // Повна дуга закінчується на (600,100) → Z = 100−200 = −100 (+подовження вниз по B)
    expect(fb.maxZ).toBeGreaterThan(hb.maxZ + 30);
    expect(manifoldStats(full[0]).badEdges).toBe(0);
  });

  it('галочка на куті без профілів на сторонах: ріжеться лише дуга технічною фаскою', () => {
    const cutters = buildEdgeCutters(rectWithRadius(100), {}, 20, {
      corners: { AB: { type: 'radius', radius: 100, edgeProcessing: 'Стандарт' } },
    });
    expect(cutters.length).toBe(1);
    const b = boundsMm(cutters[0]);
    // Лише в квадранті дуги: x ∈ [500,600] → X ∈ [200,300], y ∈ [0,100] → Z ∈ [−200,−100]
    expect(b.minX).toBeGreaterThan(200 - 5);
    expect(b.maxZ).toBeLessThan(-100 + 5);
    expect(manifoldStats(cutters[0]).badEdges).toBe(0);
  });

  it('круглий виріз з галочкою: кільце-різак без кришок, замкнене', () => {
    const part = rectWithRadius(0);
    const hole = arc(300, 200, 60, 0, Math.PI * 2, 28).slice(0, 28);
    const cutters = buildEdgeCutters(part, {}, 20, {
      holes: [hole],
      cutouts: { c1: { id: 'c1', shape: 'circle', type: 'custom', bindCorner: 'DA', x: 300, y: 200, radius: 60, edgeProcessing: 'Стандарт' } },
    });
    expect(cutters.length).toBe(1);
    const s = manifoldStats(cutters[0]);
    expect(s.badEdges).toBe(0);
    expect(s.volume).toBeGreaterThan(0);
    const b = boundsMm(cutters[0]);
    // Різак сидить на кільці отвору (центр X=0, Z=0, r=60)
    expect(b.maxX).toBeLessThan(60 + 1);
    expect(b.minX).toBeGreaterThan(-60 - 1);
  });

  it('прямокутний виріз без радіуса: чотири ділянки, фреза стає в кутах', () => {
    const part = rectWithRadius(0);
    const hole = [{ x: 200, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 300 }, { x: 200, y: 300 }];
    const cutters = buildEdgeCutters(part, {}, 20, {
      holes: [hole],
      cutouts: { c1: { id: 'c1', shape: 'rect', type: 'custom', bindCorner: 'DA', x: 300, y: 200, width: 200, height: 200, edgeProcessing: 'Стандарт' } },
    });
    expect(cutters.length).toBe(4);
    for (const c of cutters) expect(manifoldStats(c).badEdges).toBe(0);
  });
});
