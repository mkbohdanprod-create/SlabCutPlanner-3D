import type { RoomModel, RoomSolid, RoomWorld } from './room';
import { solidAabb, solidAxis } from './room';

/**
 * «ПОСТАВИТИ НА ПЛОЩИНУ» — прив'язка виробу до бази (01.09.2026, пункт 7).
 *
 * Сценарій власника: «вибрав виріб, вибрав площину і нажав кнопку чи
 * клавішу — і деталь спозиціонувалась до цієї площини, і далі пляшим».
 * Клік по грані тіла приміщення дає нормаль і точку; звідси — де стати:
 *
 *   · грань дивиться ВГОРУ (верх блока, підвіконня, підлога): виріб лягає
 *     на неї — низ плити на висоті грані, центр — центр цієї грані по плану,
 *     довга сторона виробу вздовж довгої сторони грані;
 *   · грань дивиться ВНИЗ (низ навісного блока): виріб підвішується під
 *     неї — верх плити на висоті грані;
 *   · грань ВЕРТИКАЛЬНА (стіна, бік блока): виріб притуляється до неї
 *     задньою стороною з зазором WALL_GAP_MM (ТУ цеху: 2 мм до стіни),
 *     повертається паралельно стіні, зсувається вздовж стіни на попереднє
 *     місце (або в її середину), висота не змінюється.
 *
 * Координати — мм у світі приміщення (X вправо, Y вгору, Z вглиб), ті самі,
 * що в `Product.scenePlacement`. Локальна вісь виробу: ширина — X, глибина
 * — Z; «задня» сторона — −Z при повороті 0°.
 *
 * Висота (`elevation`) тут — центр плити по товщині, як її трактує
 * DetailAssemblyGroup (група стоїть на elevation, меш центрований).
 * [ГІПОТЕЗА] що це і є угода elevation у решті програми — див. журнал №65.
 */

/** Зазор між виробом і стіною/пеналом, мм (ТУ цеху 26.03.2025). */
export const WALL_GAP_MM = 2;

export interface RoomFaceHit {
  solidId: string;
  /** Нормаль грані у світі, округлена до осі: (0,1,0), (0,0,-1)… */
  normal: RoomWorld;
  /** Точка кліку, мм. */
  pointMm: RoomWorld;
}

export interface ProductFootprintMm {
  widthMm: number;
  depthMm: number;
  thicknessMm: number;
}

export interface ScenePlacementMm {
  x: number;
  z: number;
  rotationYDeg: number;
}

export interface RoomPlacementResult {
  placement: ScenePlacementMm;
  elevationMm: number;
  /** Людський підпис: «верх «Блок» на 880 мм», «стіна Z = 0». */
  label: string;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Підпис грані для статусу в тулбарі (до натискання кнопки). */
export function roomFaceLabel(room: RoomModel, hit: RoomFaceHit): string {
  const solid = room.solids.find((s) => s.id === hit.solidId);
  const name = solid?.label ?? (solid?.role === 'wall' ? 'стіна' : solid?.role === 'floor' ? 'підлога' : 'тіло');
  const n = hit.normal;
  if (n.y > 0.5) return `верх «${name}» на ${Math.round(faceHeight(solid, hit))} мм`;
  if (n.y < -0.5) return `низ «${name}» на ${Math.round(faceHeight(solid, hit))} мм`;
  const axis = Math.abs(n.z) > 0.5 ? 'Z' : 'X';
  const along = Math.abs(n.z) > 0.5 ? hit.pointMm.z : hit.pointMm.x;
  return `бік «${name}», площина ${axis} = ${Math.round(along)} мм`;
}

/** Висота горизонтальної грані: рівно верх/низ призми, а не точка кліку з похибкою рейкасту. */
function faceHeight(solid: RoomSolid | undefined, hit: RoomFaceHit): number {
  if (solid && solidAxis(solid) === 'up') {
    const top = solid.baseMm + solid.heightMm;
    const bottom = solid.baseMm;
    if (hit.normal.y > 0 && Math.abs(top - hit.pointMm.y) < 5) return top;
    if (hit.normal.y < 0 && Math.abs(bottom - hit.pointMm.y) < 5) return bottom;
  }
  return hit.pointMm.y;
}

export function placeOnRoomFace(
  room: RoomModel,
  hit: RoomFaceHit,
  footprint: ProductFootprintMm,
  current?: { placement?: ScenePlacementMm | null; elevationMm?: number },
): RoomPlacementResult | undefined {
  const solid = room.solids.find((s) => s.id === hit.solidId);
  if (!solid) return undefined;
  const { min, max } = solidAabb(solid);
  const n = hit.normal;
  const half = footprint.thicknessMm / 2;
  const label = roomFaceLabel(room, hit);

  // ── горизонтальна грань: лягти на неї / підвіситись під неї ──
  if (Math.abs(n.y) > 0.5) {
    const h = faceHeight(solid, hit);
    const dx = max.x - min.x;
    const dz = max.z - min.z;
    const faceLong = dx >= dz;
    const productLong = footprint.widthMm >= footprint.depthMm;
    const rotationYDeg = faceLong === productLong ? 0 : 90;
    return {
      placement: { x: round1((min.x + max.x) / 2), z: round1((min.z + max.z) / 2), rotationYDeg },
      elevationMm: round1(n.y > 0 ? h + half : h - half),
      label,
    };
  }

  // ── вертикальна грань: притулитись задньою стороною із зазором ──
  const alongZ = Math.abs(n.z) > 0.5; // площина Z = const, нормаль по Z
  const sign = alongZ ? Math.sign(n.z) : Math.sign(n.x);
  // задня сторона (−Z локально) має дивитись у стіну: нормаль стіни = напрям «уперед» виробу
  const rotationYDeg = alongZ ? (sign > 0 ? 0 : 180) : (sign > 0 ? 90 : -90);
  const offset = WALL_GAP_MM + footprint.depthMm / 2;
  const planeAt = alongZ ? (sign > 0 ? max.z : min.z) : (sign > 0 ? max.x : min.x);
  const prev = current?.placement;
  let x: number; let z: number;
  if (alongZ) {
    z = planeAt + sign * offset;
    const lo = min.x + footprint.widthMm / 2; const hi = max.x - footprint.widthMm / 2;
    const want = prev ? prev.x : (min.x + max.x) / 2;
    x = lo <= hi ? Math.min(hi, Math.max(lo, want)) : (min.x + max.x) / 2;
  } else {
    x = planeAt + sign * offset;
    const lo = min.z + footprint.widthMm / 2; const hi = max.z - footprint.widthMm / 2;
    const want = prev ? prev.z : (min.z + max.z) / 2;
    z = lo <= hi ? Math.min(hi, Math.max(lo, want)) : (min.z + max.z) / 2;
  }
  return {
    placement: { x: round1(x), z: round1(z), rotationYDeg },
    elevationMm: round1(current?.elevationMm ?? 900),
    label,
  };
}
