/**
 * МОДЕЛЬ КРЕСЛЕННЯ — сутності аркуша — 04.09.2026.
 *
 * Компонувальник (`compose.ts`) перетворює проєкт на список сутностей у
 * міліметрах аркуша; рендер (`render.tsx`) лише малює їх за стилем
 * (`style.ts`). Кожна сутність несе `rule` — код правила обучалочки, за
 * яким вона з'явилась. Так креслення можна пояснити: «чому тут зигзаг» —
 * КР-1; «чому цей розмір сірий» — ОФ-ДР.
 */
import type { LayerName, TextStyleName } from './style';

export interface Pt { x: number; y: number }

interface Base { layer: LayerName; rule: string }

export interface PolylineEntity extends Base { kind: 'polyline'; points: Pt[]; closed: boolean; fill?: 'none' | 'white' | 'hatch-stone' | 'hatch-plywood' | 'hatch-red' | 'hatch-grey' | 'glue'; color?: string; rx?: number; dashed?: boolean; weight?: number }
export interface CircleEntity extends Base { kind: 'circle'; c: Pt; r: number; fill?: 'none' | 'white' }
export interface ZigzagEntity extends Base { kind: 'zigzag'; a: Pt; b: Pt; color?: string }
export interface TextEntity extends Base { kind: 'text'; at: Pt; text: string; style: TextStyleName; anchor?: 'start' | 'middle' | 'end'; rotate?: number; underline?: boolean; color?: string; bold?: boolean }
/** Векторне креслення з каталогу цеху (розріз профілю кромки) — вкладений <svg> у мм аркуша. */
export interface SvgEntity extends Base { kind: 'svg'; at: Pt; w: number; h: number; svg: string }
/** Кружок-балон із номером (позиція, вузол). */
export interface BalloonEntity extends Base { kind: 'balloon'; c: Pt; r: number; text: string; color?: string; target?: Pt }
/** Розмір між двома точками з виносними лініями (ШР-3). */
export interface DimEntity extends Base { kind: 'dim'; a: Pt; b: Pt; offset: number; text: string; grey?: boolean }
/** ВН-1: текст + тонкі лінії до однієї або кількох точок (ВН-3), без полиці й стрілки. */
export interface LeaderEntity extends Base { kind: 'leader'; at: Pt; text: string; targets: Pt[]; underline?: boolean; rotate?: number; color?: string }
/** ВН-5: штрихова рамка групи. */
export interface RectEntity extends Base { kind: 'rect'; a: Pt; b: Pt }
export interface AxisEntity extends Base { kind: 'axis'; a: Pt; b: Pt }

export type Entity = PolylineEntity | CircleEntity | ZigzagEntity | TextEntity | DimEntity | LeaderEntity | RectEntity | AxisEntity | SvgEntity | BalloonEntity;

export interface StampField { key: string; value: string; color?: string }

export interface SectionView {
  /** Заголовок розрізу: «Кромка 1», «1-1», «Виріз під мийку». */
  title: string;
  /** Той самий колір, що на плані (КЛ-1). */
  color?: string;
  /** КР-3: над заголовком розрізу кромки — значок-зигзаг. */
  zigzagIcon?: boolean;
  entities: Entity[];
  w: number; h: number;
  /** Явне місце на аркуші (мм); без нього — у ряд біля штампа (РЗ-2). */
  at?: Pt;
}

export interface DrawingSheet {
  size: { w: number; h: number };
  frame: { x: number; y: number; w: number; h: number };
  header?: string;
  /** Підзаголовок усередині рамки зверху: «Деталь 2 · Опора (E) · 600×880×20». */
  title?: string;
  /** Штамп ховається (аркуш специфікації має свій шаблон). */
  noStamp?: boolean;
  entities: Entity[];
  sections: SectionView[];
  stamp: { fields: StampField[]; title?: string };
  sheetNo: number;
  sheetCount: number;
  /** Масштаб плану 1:N — у штамп. */
  scaleDen: number;
  /** Що не намальовано через брак даних — не вигадуємо, а кажемо. */
  gaps: string[];
}
