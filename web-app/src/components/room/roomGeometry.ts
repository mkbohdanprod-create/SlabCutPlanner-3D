import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { RoomSolid } from '../../domain/room';
import { solidAxis, solidsOverlap } from '../../domain/room';

/**
 * Геометрія тіл приміщення (без React) — щоб RoomSolids лишався чистим
 * компонентом (fast refresh), а призми можна було тестувати окремо.
 *
 * Осі (domain/room.ts, RoomAxis): контур у локальних (u, v), витягування
 * по осі від baseMm. Мапа у світ (мм → м):
 *   up: (u, v) → (X, Z), вісь Y      z: (u, v) → (X, Y), вісь Z
 *   x:  (u, v) → (Z, Y), вісь X
 */

const S = 0.001;

/** Плоска грань (heightMm 0) малюється тонким листком, зміщеним назовні від господаря. */
export const FLAT_FACE_MM = 0.6;

/** Призма тіла в координатах сцени (абсолютних, без матриць). */
export function solidGeometry(solid: RoomSolid): THREE.BufferGeometry {
  const axis = solidAxis(solid);
  const flat = solid.heightMm <= 0;
  const shape = new THREE.Shape();
  solid.points.forEach((p, i) => {
    // up: план v → −Y форми, щоб після rotateX(−90°) стати +Z сцени;
    // x: u → −X форми, щоб після rotateY(+90°) стати +Z сцени;
    // z: як є.
    const sx = axis === 'x' ? -p.x : p.x;
    const sy = axis === 'up' ? -p.y : p.y;
    if (i === 0) shape.moveTo(sx * S, sy * S);
    else shape.lineTo(sx * S, sy * S);
  });
  shape.closePath();

  const length = flat ? FLAT_FACE_MM : solid.heightMm;
  // Плоска грань: листок кладеться назовні від грані-господаря, щоб не
  // мерехтів із нею (z-fighting).
  const base = flat ? solid.baseMm + ((solid.faceNormal ?? 1) > 0 ? 0 : -FLAT_FACE_MM) : solid.baseMm;

  const geom = new THREE.ExtrudeGeometry(shape, { depth: length * S, bevelEnabled: false });
  if (axis === 'up') {
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, base * S, 0);
  } else if (axis === 'z') {
    geom.translate(0, 0, base * S);
  } else {
    geom.rotateY(Math.PI / 2);
    geom.translate(base * S, 0, 0);
  }
  geom.computeVertexNormals();
  return geom;
}

/** Тіло мінус усі вибірки, що його чіпають. Впав CSG — повертаємо ціле тіло. */
export function carvedGeometry(solid: RoomSolid, cuts: RoomSolid[]): THREE.BufferGeometry {
  const base = solidGeometry(solid);
  const touching = cuts.filter((c) => c.heightMm > 0 && solidsOverlap(solid, c));
  if (!touching.length) return base;
  try {
    let brush = new Brush(base, new THREE.MeshStandardMaterial());
    brush.updateMatrixWorld();
    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    for (const cut of touching) {
      const cutBrush = new Brush(solidGeometry(cut), new THREE.MeshStandardMaterial());
      cutBrush.updateMatrixWorld();
      brush = evaluator.evaluate(brush, cutBrush, SUBTRACTION);
    }
    const out = brush.geometry;
    out.computeVertexNormals();
    return out;
  } catch (e) {
    console.error('room CSG error', e);
    return base;
  }
}

export function solidSignature(solid: RoomSolid): string {
  return `${solid.kind}|${solid.axis ?? 'up'}|${solid.faceNormal ?? ''}|${solid.baseMm}|${solid.heightMm}|${solid.points.map((p) => `${p.x},${p.y}`).join(';')}`;
}
