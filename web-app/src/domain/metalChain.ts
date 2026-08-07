import * as THREE from 'three';
import type { ElementDefinition, ProductElement } from './types';
import { buildElementPath } from './ids';
import { DEFAULT_METAL_PROFILE_ID, metalProfileById, pieceWeightKg } from './metalProfiles';

/**
 * Ланцюг профілів — проєктування каркаса «від торця» (MVP Viyar Metal).
 *
 * Той самий принцип, що мийки в стільниці: джерело істини ОДНЕ —
 * `metalSegments` на базовому профілі. Все інше похідне:
 *   · 3D малює ланцюг «черепашкою»: кожен сегмент стартує з кінця
 *     попереднього і повертає на заданий кут;
 *   · розкрій отримує кожен сегмент окремою деталлю (елементи mseg_*
 *     створюються при збереженні виробу і в сесію НЕ тягнуться —
 *     інакше дублювались би, як колись мийки).
 *
 * Так менеджер «веде» раму: прямо 2000 → вгору 90° 1000 → вбік 45° 500…
 * — і отримує каркас, відомість відрізків і вагу без конструктора.
 */

export const METAL_SEGMENT_SLOT_PREFIX = 'mseg_';

export interface MetalSegmentDef {
  id: string;
  /** Довжина відрізка, мм */
  length: number;
  /** Куди повертає ВІДНОСНО попереднього напрямку */
  turn: 'straight' | 'up' | 'down' | 'left' | 'right';
  /** Кут повороту, ° (для straight ігнорується) */
  angle: number;
  /** Типорозмір; порожньо — успадковує базовий профіль */
  profileId?: string;
  /**
   * Переміщення «пером угору»: поворот+хід без матеріалу. Не дає деталі
   * розкрою, маси і меша в 3D — лише пересуває черепашку. Використовують
   * шаблони виробів для розірваних конструкцій (ноги рами, поперечки,
   * розкоси ферми). Довжина може бути 0 (чистий поворот).
   */
  gap?: boolean;
}

export interface MetalChainPiece {
  /** Початок сегмента, мм (СК базового профілю: X уздовж, Y вгору) */
  start: [number, number, number];
  /** Одиничний напрямок сегмента */
  dir: [number, number, number];
  lengthMm: number;
  profileId: string;
}

/**
 * Розкладка ланцюга: базовий відрізок (довжина = def.width) + сегменти.
 * «Черепашка» несе локальний трійник (dir, up): up/down обертають навколо
 * бічної осі, left/right — навколо up. Тому після підйому вгору «вліво»
 * далі працює правильно, а не крутиться намарно навколо світової осі.
 */
export function metalChainPieces(def: Pick<ElementDefinition, 'width' | 'metalProfileId' | 'metalSegments'>): MetalChainPiece[] {
  const baseProfileId = def.metalProfileId ?? DEFAULT_METAL_PROFILE_ID;
  const pieces: MetalChainPiece[] = [];

  const pos = new THREE.Vector3(0, 0, 0);
  const dir = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);

  const pushPiece = (lengthMm: number, profileId: string) => {
    pieces.push({
      start: [pos.x, pos.y, pos.z],
      dir: [dir.x, dir.y, dir.z],
      lengthMm,
      profileId,
    });
    pos.addScaledVector(dir, lengthMm);
  };

  pushPiece(Math.max(1, def.width || 1000), baseProfileId);

  (def.metalSegments ?? []).forEach((segment) => {
    const angleRad = ((segment.angle || 90) * Math.PI) / 180;
    if (segment.turn !== 'straight') {
      const quat = new THREE.Quaternion();
      if (segment.turn === 'up' || segment.turn === 'down') {
        // бічна вісь = dir × up; вгору — додатний кут, вниз — від'ємний
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();
        quat.setFromAxisAngle(side, segment.turn === 'up' ? angleRad : -angleRad);
      } else {
        quat.setFromAxisAngle(up.clone().normalize(), segment.turn === 'left' ? angleRad : -angleRad);
      }
      dir.applyQuaternion(quat).normalize();
      up.applyQuaternion(quat).normalize();
    }
    if (segment.gap) {
      // Переміщення без матеріалу: тільки зсув черепашки (довжина може бути 0).
      pos.addScaledVector(dir, Math.max(0, segment.length || 0));
    } else {
      pushPiece(Math.max(1, segment.length || 500), segment.profileId || baseProfileId);
    }
  });

  return pieces;
}

/** Сумарна маса ланцюга, кг (на один виріб) */
export function metalChainWeightKg(def: Pick<ElementDefinition, 'width' | 'metalProfileId' | 'metalSegments'>): number {
  return metalChainPieces(def).reduce((sum, piece) => {
    const profile = metalProfileById(piece.profileId);
    return sum + (profile ? pieceWeightKg(profile, piece.lengthMm) : 0);
  }, 0);
}

/**
 * Похідні елементи-відрізки для розкрою: кожен сегмент ланцюга — своя
 * деталь (слот mseg_<id>). Базовий відрізок НЕ дублюється — він і є
 * головним елементом.
 */
export function metalSegmentElements(
  productId: string,
  mainDef: ElementDefinition,
): ProductElement[] {
  const baseProfileId = mainDef.metalProfileId ?? DEFAULT_METAL_PROFILE_ID;
  // Gap-сегменти (переміщення без матеріалу) деталей розкрою не дають.
  return (mainDef.metalSegments ?? []).filter((segment) => !segment.gap).map((segment, index) => ({
    id: buildElementPath(productId, `${METAL_SEGMENT_SLOT_PREFIX}${segment.id}`),
    type: 'Металопрокат',
    baseDefinition: {
      type: 'Металопрокат',
      kind: 'metal_profile',
      quantity: mainDef.quantity || 1,
      thickness: mainDef.thickness,
      width: segment.length,
      height: metalProfileById(segment.profileId || baseProfileId)?.h ?? mainDef.height,
      metalProfileId: segment.profileId || baseProfileId,
      label: `Сегмент ${index + 2}`,
    } as unknown as ElementDefinition,
    additions: [],
    joints: [],
  }));
}

/** Наступний вільний id сегмента (короткий, стабільний у межах драфта) */
export function nextSegmentId(def: Pick<ElementDefinition, 'metalSegments'>): string {
  const used = new Set((def.metalSegments ?? []).map((segment) => segment.id));
  let index = 1;
  while (used.has(String(index))) index += 1;
  return String(index);
}
