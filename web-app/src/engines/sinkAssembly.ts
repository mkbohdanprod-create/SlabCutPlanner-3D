import * as THREE from 'three';
import type { Detail, DetailPart } from '../domain/types';

/**
 * Збірка мийки з її РЕАЛЬНИХ деталей.
 *
 * Мийка — не суцільна чаша, а комплект: стінки, трикутники дна,
 * підклейки, злив. Рушій розкрою розкладає її саме так, а тут кожна
 * деталь отримує своє місце й поворот у просторі. Одна логіка на
 * два місця — 3D Підбір і прев'ю в редакторі виробу; інакше редактор
 * малював би «щось схоже», а цех різав інше.
 *
 * Початок координат — площина стільниці (верхній зріз чаші), вісь Y
 * вниз у чашу. Деталі впізнаються за іменами, які їм дає рушій
 * (`pushRectSinkParts` / `pushSlotSinkParts`).
 */

export interface SinkPartTransform {
  pos?: [number, number, number];
  quat?: THREE.Quaternion;
  /** Службова деталь (підклейки) — у збірці не показується */
  hidden?: boolean;
}

export function getSinkPartTransform(
  part: DetailPart,
  detail: Detail | undefined,
  thickness: number,
): SinkPartTransform | null {
  if (!detail) return null;
  const s = 0.001;
  const g = detail.geometry || {};
  const isSlot = g.sinkKind === 'slot';

  const L = (g.width ?? (isSlot ? 550 : 500)) * s;
  const W = (g.height ?? 400) * s;
  const D = (g.innerVertical ?? (isSlot ? 100 : 200)) * s;
  const T = thickness;

  const name = part.name.toLowerCase();

  if (part.textureIrrelevant) return { hidden: true };

  let pos: [number, number, number] | undefined;
  let quat: THREE.Quaternion | undefined;
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');

  if (isSlot) {
    const slope = 0.006; // 6mm slope

    if (name.includes('нахилене дно')) {
      const angle = Math.atan2(slope, W - 0.072);
      euler.set(-angle, 0, 0);
      pos = [0, -D + T / 2 - slope / 2, 0.036];
    } else if (name.includes('трап')) {
      pos = [0, -D + T / 2 - slope, -W / 2 + 0.039];
    } else if (name.includes('стінка біля трапа')) {
      euler.set(-Math.PI / 2, 0, 0);
      pos = [0, -D + T / 2 - slope / 2, -W / 2 + 0.072];
    } else if (name.includes('ліва боковина')) {
      euler.set(0, 0, Math.PI / 2);
      pos = [-L / 2 - T / 2, -D / 2, 0];
    } else if (name.includes('права боковина')) {
      euler.set(0, 0, -Math.PI / 2);
      pos = [L / 2 + T / 2, -D / 2, 0];
    } else if (name.includes(' 3. боковина') || (name.includes('боковина') && !name.includes(' 7.') && !name.includes('ліва') && !name.includes('права'))) {
      // задня стінка
      euler.set(-Math.PI / 2, 0, 0);
      pos = [0, -D / 2, -W / 2 - T / 2];
    } else if (name.includes(' 7. боковина') || name.includes('передня')) {
      // передня стінка
      euler.set(Math.PI / 2, 0, 0);
      pos = [0, -D / 2, W / 2 + T / 2];
    }
  } else {
    if (name.includes('задня стінка')) {
      euler.set(-Math.PI / 2, 0, 0);
      pos = [0, -D / 2, -W / 2 - T / 2];
    } else if (name.includes('передня стінка')) {
      euler.set(Math.PI / 2, 0, 0);
      pos = [0, -D / 2, W / 2 + T / 2];
    } else if (name.includes('ліва бокова')) {
      euler.set(0, 0, Math.PI / 2);
      pos = [-L / 2 - T / 2, -D / 2, 0];
    } else if (name.includes('права бокова')) {
      euler.set(0, 0, -Math.PI / 2);
      pos = [L / 2 + T / 2, -D / 2, 0];
    } else if (name.includes('трикутник')) {
      if (name.includes('задній')) { euler.set(0, Math.PI, 0); pos = [0, -D + T / 2, -W / 4]; }
      else if (name.includes('передній')) { euler.set(0, Math.PI, 0); pos = [0, -D + T / 2, W / 4]; }
      else if (name.includes('лівий')) { euler.set(0, 0, 0); pos = [-L / 4, -D + T / 2, 0]; }
      else if (name.includes('правий')) { euler.set(0, 0, 0); pos = [L / 4, -D + T / 2, 0]; }
    } else if (name.includes('кругла')) {
      pos = [0, -D + T / 2 + 0.001, 0];
    }
  }

  if (pos) {
    quat = new THREE.Quaternion().setFromEuler(euler);
    return { pos, quat };
  }

  return null;
}

/** Чи це деталь мийки — за типом мийки в геометрії деталі */
export function isSinkDetail(detail: Detail | undefined): boolean {
  return detail?.geometry?.sinkKind === 'rect' || detail?.geometry?.sinkKind === 'slot';
}
