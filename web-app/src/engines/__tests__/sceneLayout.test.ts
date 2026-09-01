/**
 * ХВИЛЯ 5 · крок 5.1 — розстановка виробів на сцені.
 *
 * Гейт кроку з плану: дефолтна розстановка детермінована (той самий проєкт —
 * та сама картинка), вироби в ряду не перетинаються, а перевірка колізій
 * чесно бачить перетин і чесно мовчить, коли його немає.
 */
import { describe, expect, it } from 'vitest';
import {
  SCENE_GAP_MM,
  collidingSceneProducts,
  defaultSceneLayout,
  rotatedFootprintMm,
} from '../sceneLayout';

const kitchen = { productId: 'kitchen', widthMm: 2400, depthMm: 600 };
const island = { productId: 'island', widthMm: 1600, depthMm: 900 };
const bar = { productId: 'bar', widthMm: 900, depthMm: 400 };

describe('дефолтний ряд', () => {
  it('детермінований: два виклики — байт у байт той самий результат', () => {
    const first = defaultSceneLayout([kitchen, island, bar]);
    const second = defaultSceneLayout([kitchen, island, bar]);
    expect(first).toEqual(second);
  });

  it('вироби в ряду НЕ перетинаються — зазор рівно SCENE_GAP_MM', () => {
    const slots = defaultSceneLayout([kitchen, island]);
    const kitchenRight = slots.kitchen.x + kitchen.widthMm / 2;
    const islandLeft = slots.island.x - island.widthMm / 2;
    expect(islandLeft - kitchenRight).toBeCloseTo(SCENE_GAP_MM, 6);
    expect(collidingSceneProducts([
      { ...kitchen, placement: slots.kitchen },
      { ...island, placement: slots.island },
    ]).size).toBe(0);
  });

  it('ряд відцентровано: один виріб стоїть у нулі', () => {
    const slots = defaultSceneLayout([kitchen]);
    expect(slots.kitchen.x).toBeCloseTo(0, 6);
    expect(slots.kitchen.z).toBe(0);
  });

  it('порядок виробів у проєкті — порядок у ряду', () => {
    const slots = defaultSceneLayout([kitchen, island, bar]);
    expect(slots.kitchen.x).toBeLessThan(slots.island.x);
    expect(slots.island.x).toBeLessThan(slots.bar.x);
  });
});

describe('перетини габаритів', () => {
  it('насунули острів на кухню — обидва підсвічуються', () => {
    const colliding = collidingSceneProducts([
      { ...kitchen, placement: { x: 0, z: 0, rotationYDeg: 0 } },
      { ...island, placement: { x: 500, z: 0, rotationYDeg: 0 } },
    ]);
    expect(colliding).toEqual(new Set(['kitchen', 'island']));
  });

  it('впритул, але без перетину — тиша (ставити впритул можна)', () => {
    const colliding = collidingSceneProducts([
      { ...kitchen, placement: { x: 0, z: 0, rotationYDeg: 0 } },
      { ...island, placement: { x: kitchen.widthMm / 2 + island.widthMm / 2 + 1, z: 0, rotationYDeg: 0 } },
    ]);
    expect(colliding.size).toBe(0);
  });

  it('поворот на 90° міняє габарит: те, що влазило, тепер перетинається', () => {
    // Острів 1600×900 за 500 мм по Z від кухні: прямо — не дістає,
    // повернутий на 90° (габарит 900×1600) — залазить.
    const zGap = kitchen.depthMm / 2 + 500;
    const straight = collidingSceneProducts([
      { ...kitchen, placement: { x: 0, z: 0, rotationYDeg: 0 } },
      { ...island, placement: { x: 0, z: zGap, rotationYDeg: 0 } },
    ]);
    expect(straight.size).toBe(0);
    const rotated = collidingSceneProducts([
      { ...kitchen, placement: { x: 0, z: 0, rotationYDeg: 0 } },
      { ...island, placement: { x: 0, z: zGap, rotationYDeg: 90 } },
    ]);
    expect(rotated).toEqual(new Set(['kitchen', 'island']));
  });

  it('rotatedFootprint: 90° міняє сторони місцями, 45° дає описаний бокс', () => {
    expect(rotatedFootprintMm(1600, 900, 90).widthMm).toBeCloseTo(900, 6);
    expect(rotatedFootprintMm(1600, 900, 90).depthMm).toBeCloseTo(1600, 6);
    const diag = rotatedFootprintMm(1000, 1000, 45);
    expect(diag.widthMm).toBeCloseTo(1000 * Math.SQRT2, 3);
  });
});
