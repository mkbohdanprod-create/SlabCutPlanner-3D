/**
 * VIYAR STONE АРХІТЕКТОР — МОДЕЛЬ (06.09.2026, перша версія).
 *
 * Третя дочка на тому самому ядрі, що VS3D і Конструктор
 * (`04_ВІЗІЯ_АРХІТЕКТУРИ/ВІЗІЯ_АРХІТЕКТУРА.md`, рішення власника 06.09):
 * не окреме ядро, а відгалуження — та сама програма, лише замість
 * виробів у центрі стоять РОЗКЛАДКИ по поверхнях приміщення. Вироби в
 * проєкті лишаються (рецепції, сходи, портали — з рецептами), до них
 * додаються розкладки; усе падає в одну пачку проєкту і далі
 * розкладається на розкрій, квадратури й комерційну.
 *
 * Звідки приміщення: НЕ редактор стін, а план. Підвантажили PDF
 * архітектурного плану, відкалібрували масштаб по відомому розміру,
 * обвели лініями те, що є на плані, — контури підлог, стіни по ребрах,
 * отвори (колони, шахти). Розміри беруться з масштабу PDF.
 *
 * Математика — у `engines/tileLayout.ts`; тут лише типи, дефолти й
 * дрібна геометрія без React (`__tests__/coreBoundary.test.ts`).
 */
import type { RoomPoint } from './room';

/** Точка плану, мм. X вправо, Y вниз — як на аркуші. */
export type PlanPoint = RoomPoint;

/** Підложка плану: сторінка PDF або картинка, відкалібрована в мм. */
export interface PlanUnderlay {
  /** Ім'я файла — для підпису й журналу. */
  name: string;
  /** Растр сторінки (JPEG data-URL). Лежить у проєкті, тому стискаємо до ~2000 px. */
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  /** Скільки мм в одному пікселі підложки. До калібрування — оцінка. */
  mmPerPx: number;
  /** Чи задано масштаб людиною (два кліки + відомий розмір). */
  calibrated: boolean;
  /** Номер сторінки PDF (з 1). */
  pageIndex: number;
  /** Прозорість підложки в редакторі, 0..1. */
  opacity: number;
}

export type SurfaceKind = 'floor' | 'wall';

/**
 * ПОВЕРХНЯ — те, на що лягає розкладка.
 * Підлога: контур у координатах плану (мм) + отвори (колони, шахти).
 * Стіна: прямокутник у власних координатах (u вздовж стіни, v вгору),
 * народжується з ребра підлоги; отвори — двері й вікна.
 */
export interface Surface {
  id: string;
  name: string;
  kind: SurfaceKind;
  /** Контур: для підлоги — на плані; для стіни — (u,v) із початком у лівому нижньому куті. */
  points: PlanPoint[];
  /** Отвори всередині контуру: у тих самих координатах. */
  openings: PlanPoint[][];
  /** Стіна: висота, мм (довжина береться з ребра). */
  heightMm?: number;
  /** Стіна: з якого ребра якої підлоги виросла — щоб малювати її на плані. */
  planEdge?: { surfaceId: string; edgeIndex: number };
  color?: string;
}

/** Патерни першої версії. Правила побудови — від власника, зафіксовано в engines/tileLayout.ts. */
export type LayoutPattern = 'straight' | 'brick' | 'diagonal' | 'herringbone' | 'perimeter_center';

export const LAYOUT_PATTERN_LABELS: Record<LayoutPattern, string> = {
  straight: 'Пряма сітка',
  brick: 'Розбіжка',
  diagonal: 'Діагональ 45°',
  herringbone: 'Ялинка',
  perimeter_center: 'Периметр + центр',
};

export interface LayoutMaterial {
  /** Назва декору/матеріалу — у відомість. */
  name: string;
  thicknessMm: number;
  /** Вага, кг/м². УМОВНО: керамограніт 12 мм ≈ 30 (Laminam 12+), 6 мм ≈ 15, натуралка 20 мм ≈ 55. */
  kgPerM2: number;
  /** Формат листа постачальника, з якого ріжуться плитки. 0 = плитка і є лист (панель на всю висоту). */
  sheetW: number;
  sheetH: number;
}

/**
 * РОЗКЛАДКА — патерн + формат + параметри на одній поверхні.
 * Усе, що людина крутить руками: точка старту, зміщення, кут, шов.
 */
export interface TileLayout {
  id: string;
  name: string;
  surfaceId: string;
  pattern: LayoutPattern;
  /** Формат плитки/панелі, мм (для ялинки — довга × коротка). */
  tileW: number;
  tileH: number;
  jointMm: number;
  /** Розбіжка: частка довжини, на яку зміщується наступний ряд (0,5 або 0,33). */
  offsetFraction: number;
  /** Поворот патерну відносно осі X плану, градуси. Діагональ = 45. */
  angleDeg: number;
  /**
   * Звідки стартує сітка. `auto` — правило РЗ-1 (ПРАВИЛА_РОЗКЛАДОК.md):
   * сітка центрується так, щоб підрізи по протилежних краях були
   * однакові, а якщо вони виходять вужчі за мінімум (РЗ-4) — сітка
   * зсувається на пів кроку. `corner` — з лівого верхнього кута
   * габариту, `center` — плитка/шов рівно по центру без перевірки.
   */
  origin: 'auto' | 'corner' | 'center';
  /** Зсув старту від обраної точки, мм. */
  originShift: PlanPoint;
  /** «Периметр + центр»: ширина бордюра по периметру, мм. */
  borderMm: number;
  /** «Периметр + центр»: чим заповнюється центр. */
  innerPattern: Exclude<LayoutPattern, 'perimeter_center'>;
  material: LayoutMaterial;
  /** Ручний запас на бій, % — якщо не заданий, береться з норм за патерном. */
  wastePctOverride?: number;
  /** Виріб у проєкті, у який розкладка передана в розкрій (плитки як деталі). */
  productId?: string;
}

/**
 * НОРМИ — усе, з чого рахується відомість. Значення першої версії
 * УМОВНІ (позначено в UI), наповнюються кейсами як кромки; джерела
 * орієнтирів — техгід Laminam (вага, шви, клей C2S1/S2 подвійним
 * нанесенням) і таблиці відходів за патерном (пряма 10 %, розбіжка 12 %,
 * діагональ 15 %, ялинка 18 %, +2 % великий формат).
 */
export interface ArchitectureNorms {
  wastePctByPattern: Record<LayoutPattern, number>;
  /** Додаток до запасу, коли сторона плитки ≥ 600 мм. */
  largeFormatExtraPct: number;
  /** Клей, кг/м² при подвійному нанесенні гребінкою 10 мм. */
  adhesiveKgPerM2: number;
  /** Щільність фуги, кг/л — для розрахунку від довжини швів. */
  groutKgPerL: number;
  /** Темп монтажу, м²/год на бригаду з двох, за патерном. */
  installM2PerHourByPattern: Record<LayoutPattern, number>;
  /** Різ на об'єкті, м/год. */
  cutMPerHour: number;
  /** Вантажопідйомність машини, т. */
  truckTonnage: number;
  /** Ширина різу при розкрої листа на плитки, мм. */
  kerfMm: number;
  /** РЗ-4: мінімальний підріз як частка сторони плитки (⅓) … */
  minCutFraction: number;
  /** … і не вужчий за стільки мм у будь-якому разі. */
  minCutMm: number;
}

export const DEFAULT_ARCH_NORMS: ArchitectureNorms = {
  wastePctByPattern: { straight: 10, brick: 12, diagonal: 15, herringbone: 18, perimeter_center: 14 },
  largeFormatExtraPct: 2,
  adhesiveKgPerM2: 5.5,
  groutKgPerL: 1.6,
  installM2PerHourByPattern: { straight: 2.0, brick: 1.8, diagonal: 1.4, herringbone: 1.0, perimeter_center: 1.3 },
  cutMPerHour: 12,
  truckTonnage: 5,
  kerfMm: 3,
  minCutFraction: 1 / 3,
  minCutMm: 100,
};

/* ── правила розкладок першої версії (ПРАВИЛА_РОЗКЛАДОК.md, ГІПОТЕЗА) ── */

/** РЗ-2: розбіжка ½ для плитки до 900 мм, ⅓ для довшої (великий формат — прогин, сходинки). */
export function recommendedOffsetFraction(tileW: number): number {
  return tileW > 900 ? 1 / 3 : 0.5;
}

/** РЗ-3: шов за замовчуванням — підлога 2 мм, стіна 1,5 мм. */
export function recommendedJointMm(kind: SurfaceKind): number {
  return kind === 'floor' ? 2 : 1.5;
}

/** РЗ-4: найвужчий допустимий підріз для сторони плитки `side`, мм. */
export function minCutMm(side: number, norms: ArchitectureNorms = DEFAULT_ARCH_NORMS): number {
  return Math.max(norms.minCutMm, side * norms.minCutFraction);
}

export interface ArchitectureModel {
  formatVersion: 1;
  underlay?: PlanUnderlay;
  surfaces: Surface[];
  layouts: TileLayout[];
  norms: ArchitectureNorms;
  /** Поверх, на який заносимо (для рядка «підйом» у відомості). */
  floorNo?: number;
  /** Чи є ліфт на об'єкті. */
  hasLift?: boolean;
}

export const DEFAULT_ARCH_MATERIALS: LayoutMaterial[] = [
  { name: 'Керамограніт 12 мм, лист 3200×1600', thicknessMm: 12, kgPerM2: 30, sheetW: 3200, sheetH: 1600 },
  { name: 'Керамограніт 6 мм, лист 3200×1600', thicknessMm: 6, kgPerM2: 15, sheetW: 3200, sheetH: 1600 },
  { name: 'Керамограніт 20 мм, лист 3200×1600', thicknessMm: 20, kgPerM2: 48, sheetW: 3200, sheetH: 1600 },
  { name: 'Натуральний камінь 20 мм, сляб 3000×1800', thicknessMm: 20, kgPerM2: 55, sheetW: 3000, sheetH: 1800 },
  { name: 'Плитка 600×1200 (готовий формат)', thicknessMm: 10, kgPerM2: 24, sheetW: 0, sheetH: 0 },
];

/** Типові формати плиток, мм. */
export const TILE_FORMATS: Array<{ label: string; w: number; h: number }> = [
  { label: '1600 × 800', w: 1600, h: 800 },
  { label: '1200 × 600', w: 1200, h: 600 },
  { label: '800 × 800', w: 800, h: 800 },
  { label: '600 × 600', w: 600, h: 600 },
  { label: '1200 × 300 (ялинка)', w: 1200, h: 300 },
  { label: '800 × 200 (ялинка)', w: 800, h: 200 },
  { label: '3200 × 1600 (панель)', w: 3200, h: 1600 },
  { label: '1600 × 3200 (панель вертикально)', w: 1600, h: 3200 },
];

export function emptyArchitecture(): ArchitectureModel {
  return { formatVersion: 1, surfaces: [], layouts: [], norms: { ...DEFAULT_ARCH_NORMS, wastePctByPattern: { ...DEFAULT_ARCH_NORMS.wastePctByPattern }, installM2PerHourByPattern: { ...DEFAULT_ARCH_NORMS.installM2PerHourByPattern } } };
}

/** Старі проєкти без нових полів норм — доливаємо дефолти (нові правила не ламають збережене). */
export function withNormDefaults(norms: Partial<ArchitectureNorms> | undefined): ArchitectureNorms {
  return { ...DEFAULT_ARCH_NORMS, ...(norms ?? {}), wastePctByPattern: { ...DEFAULT_ARCH_NORMS.wastePctByPattern, ...(norms?.wastePctByPattern ?? {}) }, installM2PerHourByPattern: { ...DEFAULT_ARCH_NORMS.installM2PerHourByPattern, ...(norms?.installM2PerHourByPattern ?? {}) } };
}

let seq = 0;
export function archId(prefix = 'ar'): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

export function defaultLayoutFor(surface: Surface, index: number): TileLayout {
  const wall = surface.kind === 'wall';
  return {
    id: archId('lay'),
    name: `${surface.name} · розкладка ${index}`,
    surfaceId: surface.id,
    pattern: 'straight',
    tileW: wall ? 1600 : 1200,
    tileH: wall ? 3200 : 600,
    jointMm: recommendedJointMm(surface.kind),
    offsetFraction: recommendedOffsetFraction(wall ? 1600 : 1200),
    angleDeg: 0,
    origin: 'auto',
    originShift: { x: 0, y: 0 },
    borderMm: 300,
    innerPattern: 'herringbone',
    material: { ...DEFAULT_ARCH_MATERIALS[0] },
  };
}

/* ── дрібна геометрія плану ─────────────────────────────────────── */

export function polygonArea(points: PlanPoint[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]; const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function polygonPerimeter(points: PlanPoint[]): number {
  let l = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]; const q = points[(i + 1) % points.length];
    l += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return l;
}

export function edgeLength(points: PlanPoint[], edgeIndex: number): number {
  const p = points[edgeIndex]; const q = points[(edgeIndex + 1) % points.length];
  return Math.hypot(q.x - p.x, q.y - p.y);
}

/** Стіна з ребра підлоги: прямокутник довжина × висота у власних (u,v). */
export function wallFromEdge(floor: Surface, edgeIndex: number, heightMm: number, name: string): Surface {
  const len = Math.round(edgeLength(floor.points, edgeIndex));
  return {
    id: archId('srf'),
    name,
    kind: 'wall',
    points: [{ x: 0, y: 0 }, { x: len, y: 0 }, { x: len, y: heightMm }, { x: 0, y: heightMm }],
    openings: [],
    heightMm,
    planEdge: { surfaceId: floor.id, edgeIndex },
  };
}

/** Чиста площа поверхні: контур мінус отвори, м². */
export function surfaceAreaM2(surface: Surface): number {
  const holes = surface.openings.reduce((s, o) => s + polygonArea(o), 0);
  return Math.max(0, polygonArea(surface.points) - holes) / 1e6;
}
