import * as THREE from 'three';
import type { DrainGrate } from '../domain/types';

/**
 * РЕШІТКА ЗЛИВУ — водоструменевий різ у дні мийки (28.08.2026).
 *
 * Заведено з реального виробу власника: концентричні дуги з перемичками,
 * зміщеними по колу від кільця до кільця — від цього малюнок «закручується»
 * і виглядає живим, а не як мішень.
 *
 * Той самий принцип, що всюди: не малюємо декор, а СИМУЛЮЄМО ІНСТРУМЕНТ.
 * Тут інструмент — гідроабразивна струя: тонкий пропил НАСКРІЗЬ (вода
 * мусить проходити), ширина = діаметр струменя.
 *
 * ЧОМУ ПЕРЕМИЧКИ ОБОВ'ЯЗКОВІ: суцільне кільце вирізало б середину
 * начисто — вона просто випала б. Перемички тримають острівці, і саме
 * тому цех їх завжди лишає. Мінімальна ширина перемички — питання
 * міцності каменю, тому вона в межах, а не на око.
 */

const S = 0.001;
/** Точок на дугу — дрібніше око не бачить, крупніше меш важчає. */
const ARC_STEPS = 14;
/** Виліт різака над і під плитою, мм — щоб CSG не лишав плівки. */
const OVERCUT_MM = 3;

export const GRATE_LIMITS = {
  /** Діаметр гідроабразивного струменя, мм — тонше він не ріже */
  minSlotMm: 1,
  /** Ширший проріз — це вже не решітка, а виріз */
  maxSlotMm: 20,
  /** Перемичка, вужча за це, викришиться при різі */
  minBridgeMm: 4,
  /** Стінка каменю між сусідніми кільцями */
  minWallMm: 4,
  /** Менше двох кілець — це просто кільце, не решітка */
  minRings: 1,
} as const;

export type GrateIssue = { level: 'error' | 'warning'; message: string };

/**
 * Діаметр круглої деталі дна мийки, мм (`engines/geometry.ts`, деталь
 * №14 «кругла деталь дна»). Решітка живе САМЕ в ній, тому вона й задає
 * стелю для діаметра.
 */
export const DRAIN_DISC_DIAMETER = 114;

/** Значення за замовчуванням — малюнок, як на виробі власника. */
export function defaultDrainGrate(): DrainGrate {
  return {
    id: `grate_${Math.random().toString(36).slice(2, 8)}`,
    offsetX: 0,
    offsetY: 0,
    // З запасом на край диска: різати впритул до контуру не можна —
    // лишиться вусик каменю, який відламається.
    outerDiameter: 96,
    rings: 4,
    slotWidth: 3,
    ringGap: 9,
    segmentsPerRing: 3,
    bridgeDeg: 26,
    twistDeg: 28,
    label: 'Решітка зливу',
  };
}

/** Радіус середньої лінії кільця n (0 — зовнішнє). */
function ringRadius(grate: DrainGrate, index: number): number {
  return grate.outerDiameter / 2 - index * grate.ringGap;
}

export function validateDrainGrate(
  grate: DrainGrate,
  bottomWidthMm: number,
  bottomHeightMm: number,
): GrateIssue[] {
  const issues: GrateIssue[] = [];
  const add = (level: GrateIssue['level'], message: string) => issues.push({ level, message });

  if (grate.rings < GRATE_LIMITS.minRings) add('error', 'Потрібне хоча б одне кільце.');
  if (grate.segmentsPerRing < 1) add('error', 'Потрібен хоча б один сегмент у кільці.');

  if (grate.slotWidth < GRATE_LIMITS.minSlotMm) {
    add('error', `Проріз ${grate.slotWidth} мм тонший за струмінь води (${GRATE_LIMITS.minSlotMm} мм) — так не ріжеться.`);
  }
  if (grate.slotWidth > GRATE_LIMITS.maxSlotMm) {
    add('warning', `Проріз ${grate.slotWidth} мм — це вже виріз, а не решітка.`);
  }

  const wall = grate.ringGap - grate.slotWidth;
  if (wall < GRATE_LIMITS.minWallMm) {
    add('error', `Між кільцями лишається ${wall.toFixed(1)} мм каменю — викришиться. Потрібно щонайменше ${GRATE_LIMITS.minWallMm} мм.`);
  }

  // Перемичка: довжина дуги, яку займає розрив, на НАЙМЕНШОМУ кільці —
  // саме там вона найкоротша й найслабша.
  const innerR = ringRadius(grate, grate.rings - 1);
  if (innerR <= grate.slotWidth) {
    add('error', 'Кілець більше, ніж вміщується в діаметр решітки — внутрішнє кільце сходиться в точку.');
  } else {
    const bridgeMm = (grate.bridgeDeg * Math.PI / 180) * innerR;
    if (bridgeMm < GRATE_LIMITS.minBridgeMm) {
      add('error', `Перемичка на внутрішньому кільці ${bridgeMm.toFixed(1)} мм — камінь не втримається. Збільште кут перемички або діаметр.`);
    }
  }

  /*
   * Габарит круглої деталі дна. Різати впритул до її контуру не можна:
   * між крайнім кільцем і краєм диска мусить лишитись камінь, інакше
   * відламається вусик. Тому запас — стінка з тих самих меж.
   */
  const discR = Math.min(bottomWidthMm, bottomHeightMm) / 2;
  const reach = Math.hypot(grate.offsetX, grate.offsetY) + grate.outerDiameter / 2 + grate.slotWidth / 2;
  if (reach > discR - GRATE_LIMITS.minWallMm) {
    add('error', `Решітка Ø${grate.outerDiameter} мм не лишає краю на деталі дна Ø${Math.round(discR * 2)} мм — потрібно щонайменше ${GRATE_LIMITS.minWallMm} мм по колу.`);
  }

  return issues;
}

/**
 * Різаки решітки — наскрізні дугові призми В ПРОСТОРІ МИЙКИ.
 *
 * Центр решітки — на площині дна (Y задається викликачем через
 * `bottomY`), різ іде вертикально наскрізь. Кожен парт дна потім
 * переводить ці геометрії у свій локальний простір оберненою матрицею —
 * так само, як Viewer3D робить із різаками загинів.
 */
export function buildGrateCutters(
  grate: DrainGrate | undefined,
  bottomWidthMm: number,
  bottomHeightMm: number,
  thicknessMm: number,
): THREE.BufferGeometry[] {
  if (!grate) return [];
  if (validateDrainGrate(grate, bottomWidthMm, bottomHeightMm).some((i) => i.level === 'error')) return [];

  const out: THREE.BufferGeometry[] = [];
  const halfSlot = grate.slotWidth / 2;
  const depth = (thicknessMm + OVERCUT_MM * 2) * S;

  for (let ring = 0; ring < grate.rings; ring += 1) {
    const r = ringRadius(grate, ring);
    if (r <= halfSlot) continue;

    const step = 360 / grate.segmentsPerRing;
    // Кожне наступне кільце повернуте — розриви розходяться по спіралі,
    // і малюнок «закручується». Саме це видно на виробі.
    const twist = ring * grate.twistDeg;

    for (let seg = 0; seg < grate.segmentsPerRing; seg += 1) {
      const startDeg = twist + seg * step + grate.bridgeDeg / 2;
      const endDeg = twist + (seg + 1) * step - grate.bridgeDeg / 2;
      if (endDeg <= startDeg) continue;

      const a0 = (startDeg * Math.PI) / 180;
      const a1 = (endDeg * Math.PI) / 180;

      // Дуга як замкнена стрічка: зовнішній край туди, внутрішній назад.
      const shape = new THREE.Shape();
      for (let i = 0; i <= ARC_STEPS; i += 1) {
        const a = a0 + ((a1 - a0) * i) / ARC_STEPS;
        const x = (r + halfSlot) * Math.cos(a) * S;
        const y = (r + halfSlot) * Math.sin(a) * S;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      for (let i = ARC_STEPS; i >= 0; i -= 1) {
        const a = a0 + ((a1 - a0) * i) / ARC_STEPS;
        shape.lineTo((r - halfSlot) * Math.cos(a) * S, (r - halfSlot) * Math.sin(a) * S);
      }
      shape.closePath();

      const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 2 });
      // Екструзія йде вздовж +Z shape-простору; кладемо різ вертикально
      // і опускаємо так, щоб він гарантовано пробив плиту наскрізь.
      // rotateX(−90°) переводить вісь екструзії +Z у +Y: різак росте ВГОРУ
      // від своєї основи. Тому основу опускаємо під низ плити — тоді різ
      // проходить наскрізь із запасом з обох боків.
      geom.rotateX(-Math.PI / 2);
      geom.translate(grate.offsetX * S, -(thicknessMm / 2 + OVERCUT_MM) * S, grate.offsetY * S);
      out.push(geom);
    }
  }

  return out;
}

/** Сумарна довжина різу, мм — водоструменева послуга в кошторисі. */
export function grateCutLengthMm(grate: DrainGrate | undefined): number {
  if (!grate) return 0;
  let total = 0;
  for (let ring = 0; ring < grate.rings; ring += 1) {
    const r = ringRadius(grate, ring);
    if (r <= 0) continue;
    const arcDeg = 360 / grate.segmentsPerRing - grate.bridgeDeg;
    if (arcDeg <= 0) continue;
    // Довжина різу = периметр обох країв стрічки
    total += grate.segmentsPerRing * 2 * ((arcDeg * Math.PI) / 180) * r;
  }
  return total;
}
