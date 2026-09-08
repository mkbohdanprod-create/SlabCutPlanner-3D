/**
 * №151 — ПАНЕЛЬ І БОРТИК СТОЯТЬ ТИЛЬНОЮ ГРАННЮ НА РЕБРІ.
 *
 * Було: тіло доповнення, що росте вгору, виносилось НАЗОВНІ від ребра — у 3D
 * стінова панель висіла в повітрі за краєм стільниці (скрін власника 08.09).
 * Стало: панель прилягає до ребра тильною гранню, а тілом іде ВГЛИБ деталі
 * рівно на свою товщину.
 *
 * Тест не перевіряє формулу на віру: він проганяє точки через ту саму
 * three.js-ієрархію, що й рендер, і дивиться, по який бік ребра лягло тіло.
 * Ребро A стільниці 2000×600 лежить на y = 0 (мм від центру: z = −300).
 * «Вглиб» для нього — у бік +z.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { attachmentUpZ, getEdgeTransform } from '../transform3d';

const SCALE = 0.001;
const PARENT = { bounds: { minX: 0, minY: 0, maxX: 2000, maxY: 600 }, thickness: 20 };
const EDGE_A = { v1: { x: 0, y: 0 }, v2: { x: 1, y: 0 } };

/** Світова точка контуру дитини, мм. Ієрархія — як у рендері. */
function worldPoint(childThickness: number, contourX: number, contourY: number) {
  const transform = getEdgeTransform(
    EDGE_A.v1, EDGE_A.v2, PARENT.bounds, PARENT.thickness,
    2000, 600, 0, 'up', 0, 0, childThickness,
  );

  const edgeGroup = new THREE.Object3D();
  edgeGroup.position.fromArray(transform.groupPosition);
  edgeGroup.rotation.fromArray(transform.groupRotation);

  const childGroup = new THREE.Object3D();
  childGroup.position.fromArray(transform.childPosition);
  childGroup.rotation.fromArray(transform.childRotation);
  edgeGroup.add(childGroup);

  const mesh = new THREE.Object3D();
  mesh.rotation.set(Math.PI / 2, 0, 0);
  childGroup.add(mesh);

  edgeGroup.updateMatrixWorld(true);
  const p = mesh.localToWorld(new THREE.Vector3(contourX * SCALE, contourY * SCALE, 0));
  return { x: p.x / SCALE, y: p.y / SCALE, z: p.z / SCALE };
}

describe('№151 · доповнення вгору стоїть усередині деталі', () => {
  it('тильна грань панелі лежить рівно на ребрі A', () => {
    // Обидві грані по товщині: центр панелі зсунутий на пів товщини вглиб,
    // тому одна грань падає точно на ребро (z = −300), друга — на 20 мм углиб.
    const edgeZ = -PARENT.bounds.maxY / 2; // ребро A у світі, мм
    // Серединна площина панелі стоїть на пів товщини вглиб від ребра,
    // отже тильна грань (−t/2 від середини) падає точно на ребро.
    const mid = worldPoint(20, 1000, 300).z;
    expect(mid).toBeCloseTo(edgeZ + 10, 6);
    expect(mid - 10).toBeCloseTo(edgeZ, 6);
  });

  it('панель 12 мм заходить углиб рівно на 12 мм, а не на товщину плити', () => {
    expect(attachmentUpZ(1, 12, 0) / SCALE).toBeCloseTo(6, 6);
    expect(attachmentUpZ(1, 40, 0) / SCALE).toBeCloseTo(20, 6);
  });

  it('на увігнутому ребрі знак «вглиб» перевертається разом з inward', () => {
    expect(attachmentUpZ(-1, 20, 0) / SCALE).toBeCloseTo(-10, 6);
  });

  it('тіло панелі лежить у межах деталі, а не за її краєм', () => {
    const edgeZ = -PARENT.bounds.maxY / 2;
    const p = worldPoint(20, 1000, 300); // середина контуру панелі
    expect(p.z).toBeGreaterThan(edgeZ);
    expect(p.z).toBeLessThanOrEqual(edgeZ + 20 + 1e-6);
  });
});
