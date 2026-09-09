import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { buildAssemblyMiterPlan } from '../miterAssembly';

/**
 * Б-168 — УТОПЛЕНА ОПОРА НЕ МАЄ ВКОРОЧУВАТИСЬ.
 *
 * Власник 09.09: «коли створюємо ногу і втоплюємо її вглиб стільниці, то вона
 * не лише зміщається вглиб, а й зменшується з боків на цю ж величину. У
 * розкрій падає правильного розміру, в 3D також зменшена».
 *
 * Причина була в двох різаках плану мітр, і обидва будувались від КРОМКИ
 * плити, не знаючи про утоплення:
 *   · кутовий зріз між сусідніми смугами — по бісектрисі кута плити;
 *   · вус 45° зі стільницею — від верхньої кромки.
 * Для смуги, зсунутої вглиб на X, перший відкушував трикутник глибиною X з
 * кожного кінця, другий — смугу заввишки X по всій довжині.
 *
 * Тест міряє не картинку, а ОБʼЄМ тіла опори після всіх різаків.
 */

const W = 2000, H = 600, T = 20, LEG_H = 900;
const bounds = { minX: 0, minY: 0, maxX: W, maxY: H };

const P = { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, c: { x: 1, y: 1 }, d: { x: 0, y: 1 } };
const segments = [
  { id: 'A', v1: P.a, v2: P.b },
  { id: 'B', v1: P.b, v2: P.c },
  { id: 'C', v1: P.c, v2: P.d },
  { id: 'D', v1: P.d, v2: P.a },
];
const curves = segments.map((s) => ({
  type: 'LineCurve',
  v1: s.v1,
  v2: s.v2,
  getPoint: (t: number) => ({ x: s.v1.x + (s.v2.x - s.v1.x) * t, y: s.v1.y + (s.v2.y - s.v1.y) * t }),
}));
const edgeMap = { 0: 'A', 1: 'B', 2: 'C', 3: 'D' } as Record<number, string>;

/** Стільниця 2000×600 з опорами на трьох сторонах; у C задаємо утоплення. */
function planFor(insetC: number) {
  const legs: Record<string, { width: number; inset: number }> = {
    B: { width: H, inset: 0 },
    C: { width: W, inset: insetC },
    D: { width: H, inset: 0 },
  };
  return buildAssemblyMiterPlan({
    segments,
    curves: curves as never,
    edgeMap,
    bounds,
    thicknessMm: T,
    material: null,
    attachmentsOn: (side) => {
      const leg = legs[side];
      if (!leg) return [];
      return [{
        slot: `leg_${side}`,
        kind: 'leg',
        draft: { width: leg.width, height: LEG_H, thickness: T, attachOffset: 0, attachInset: leg.inset },
      }] as never;
    },
  });
}

/** Обʼєм опори C у літрах після застосування її різаків. */
function volumeOfC(insetC: number) {
  const placed = planFor(insetC).bySlot.get('leg_C');
  expect(placed).toBeTruthy();
  let brush = new Brush(new THREE.BoxGeometry(W * 0.001, LEG_H * 0.001, T * 0.001).toNonIndexed());
  brush.updateMatrixWorld();
  const evaluator = new Evaluator();
  for (const geo of placed!.cutters) {
    const cut = new Brush(geo.index ? geo.toNonIndexed() : geo);
    cut.updateMatrixWorld();
    brush = evaluator.evaluate(brush, cut, SUBTRACTION);
    brush.updateMatrixWorld();
  }
  const pos = brush.geometry.getAttribute('position');
  let vol = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
    const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
    const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(vol) * 1000; // літри
}

const FULL = (W * LEG_H * T) / 1e6; // 36 л

describe('Б-168 · утоплена опора', () => {
  it('без утоплення кутовий вус працює як працював', () => {
    const v = volumeOfC(0);
    expect(v).toBeLessThan(FULL);        // щось зрізано — вус на місці
    expect(v).toBeGreaterThan(FULL * 0.8);
    expect(planFor(0).bySlot.get('leg_C')!.cutters.length).toBe(3);
  });

  it('з утопленням опора лишається цілою — стільки ж, скільки в розкрої', () => {
    expect(volumeOfC(200)).toBeCloseTo(FULL, 3);
    expect(planFor(200).bySlot.get('leg_C')!.cutters.length).toBe(0);
  });

  it('сусідні опори без утоплення від цього не постраждали', () => {
    const plan = planFor(200);
    expect(plan.bySlot.get('leg_B')!.insetMm).toBe(0);
    expect(plan.bySlot.get('leg_D')!.insetMm).toBe(0);
  });
});
