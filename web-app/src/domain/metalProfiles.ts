/**
 * Сортамент металопрокату — MVP Viyar Metal.
 *
 * Той самий принцип, що з каменем: менеджер обирає профіль і довжину,
 * а все похідне (маса, площа фарбування, смужка в розкрої, 3D) рахується
 * саме звідси. Маса не зашита в довідник, а обчислюється з перерізу —
 * густина сталі 7850 кг/м³ — щоб додавання нового типорозміру було
 * одним рядком даних, без ручних таблиць.
 */

export type MetalSection = 'tube_rect' | 'tube_round' | 'angle' | 'flat' | 'bar';

export interface MetalProfile {
  id: string;
  label: string;
  section: MetalSection;
  /** Ширина перерізу (для круглих — діаметр), мм */
  w: number;
  /** Висота перерізу (для круглих — діаметр), мм */
  h: number;
  /** Товщина стінки/полиці, мм (для суцільних — 0) */
  t: number;
}

const p = (id: string, label: string, section: MetalSection, w: number, h: number, t: number): MetalProfile =>
  ({ id, label, section, w, h, t });

export const METAL_PROFILES: MetalProfile[] = [
  p('kv20', 'Труба кв. 20×20×2', 'tube_rect', 20, 20, 2),
  p('kv25', 'Труба кв. 25×25×2', 'tube_rect', 25, 25, 2),
  p('kv30', 'Труба кв. 30×30×2', 'tube_rect', 30, 30, 2),
  p('kv40', 'Труба кв. 40×40×2', 'tube_rect', 40, 40, 2),
  p('kv60', 'Труба кв. 60×60×3', 'tube_rect', 60, 60, 3),
  p('kv80', 'Труба кв. 80×80×3', 'tube_rect', 80, 80, 3),
  p('kv100', 'Труба кв. 100×100×4', 'tube_rect', 100, 100, 4),
  p('pr40x20', 'Труба пр. 40×20×2', 'tube_rect', 40, 20, 2),
  p('pr60x40', 'Труба пр. 60×40×2', 'tube_rect', 60, 40, 2),
  p('kr20', 'Труба кругла Ø20×2', 'tube_round', 20, 20, 2),
  p('kr32', 'Труба кругла Ø32×2', 'tube_round', 32, 32, 2),
  p('kr51', 'Труба кругла Ø51×3', 'tube_round', 51, 51, 3),
  p('kut40', 'Кутник 40×40×4', 'angle', 40, 40, 4),
  p('kut50', 'Кутник 50×50×5', 'angle', 50, 50, 5),
  p('sht40', 'Штаба 40×4', 'flat', 40, 4, 4),
  p('sht50', 'Штаба 50×5', 'flat', 50, 5, 5),
  p('arm12', 'Арматура Ø12', 'bar', 12, 12, 0),
  p('krug16', 'Круг Ø16', 'bar', 16, 16, 0),
];

export const DEFAULT_METAL_PROFILE_ID = 'kv40';

export function metalProfileById(id: string | undefined): MetalProfile | undefined {
  return METAL_PROFILES.find((profile) => profile.id === id);
}

/** Площа перерізу, мм² */
export function sectionAreaMm2(profile: MetalProfile): number {
  const { section, w, h, t } = profile;
  if (section === 'tube_rect') return w * h - Math.max(0, w - 2 * t) * Math.max(0, h - 2 * t);
  if (section === 'tube_round') {
    const inner = Math.max(0, w - 2 * t);
    return (Math.PI / 4) * (w * w - inner * inner);
  }
  if (section === 'angle') return t * (w + h - t);
  if (section === 'flat') return w * h;
  return (Math.PI / 4) * w * w; // bar
}

/** Погонна маса, кг/м (сталь 7850 кг/м³) */
export function kgPerMeter(profile: MetalProfile): number {
  return sectionAreaMm2(profile) * 0.00785;
}

/** Периметр перерізу, мм — для площі фарбування/поліровки (периметр × довжина) */
export function sectionPerimeterMm(profile: MetalProfile): number {
  const { section, w, h } = profile;
  if (section === 'tube_round' || section === 'bar') return Math.PI * w;
  if (section === 'angle') return 2 * (w + h);
  return 2 * (w + h);
}

/** Маса відрізка профілю, кг */
export function pieceWeightKg(profile: MetalProfile, lengthMm: number): number {
  return kgPerMeter(profile) * (lengthMm / 1000);
}

/** Площа поверхні відрізка (фарбування), м² */
export function pieceSurfaceM2(profile: MetalProfile, lengthMm: number): number {
  return (sectionPerimeterMm(profile) / 1000) * (lengthMm / 1000);
}
