/**
 * СТАН КОНСТРУКТОРА (пасхалка Студії) — 04.09.2026.
 *
 * Окремий zustand-стор: усе, що знає лише конструктор і що не має
 * потрапляти в проєкт менеджера (інваріант «VS3D нічого не прибираємо»).
 * Замір, зсув виробу відносно заміру, шари зведення, параметри фанери,
 * журнал рішень.
 *
 * Що НЕ живе тут: геометрія деталей і продукти — вони в `useProjectStore`,
 * і конструктор править їх тими самими діями, що й менеджер
 * (`updateDetailRecord`, `updateProject({room})`, `addProduct`).
 *
 * §10 «Першої версії конструктора»: кожне рішення конструктора з причиною
 * — новий кейс для обучалочки. Тому `decisions` — не лог, а сировина для
 * Колумба; експортується у вкладці «Документи».
 */
import { create } from 'zustand';
import type { MeasureModel } from './measure/leicaDxf';

export interface Placement {
  /** Зсув виробу відносно заміру, мм (система координат заміру). */
  dx: number;
  dy: number;
  /** Поворот навколо початку виробу, градуси. */
  rotDeg: number;
}

export type MergeLayer = 'measure' | 'product' | 'plywood' | 'metal' | 'room';

export interface Decision {
  id: string;
  at: string; // ISO
  tab: 'measure' | 'merge' | 'plywood' | 'metal' | 'docs';
  /** Що зробили — коротко, людською мовою. */
  what: string;
  /** Чому — обов'язкове поле, порожнє рішення не приймаємо. */
  why: string;
  /** Правило обучалочки, на яке спирались (КП-3, ЗМ-Т9…), якщо є. */
  rule?: string;
  detailId?: string;
}

export interface PlywoodParams {
  /** КП-2: смуга по периметру, мм. */
  stripWidth: number;
  /** КП-3: відступ підкладу від краю плити, мм (1 приклад — редагується). */
  edgeOffset: number;
  /** КП-5: крок ребер — ГІПОТЕЗА, тому руками. */
  ribStep: number;
  /** КП-5: крок ребер біля вирізів, мм. */
  ribStepNearCutout: number;
  /** ПВ-1: висота підвороту, мм. */
  turnHeight: number;
}

export const PLYWOOD_DEFAULTS: PlywoodParams = {
  stripWidth: 80,
  edgeOffset: 15,
  ribStep: 450,
  ribStepNearCutout: 250,
  turnHeight: 18,
};

interface ConstructorState {
  measure: MeasureModel | null;
  setMeasure: (m: MeasureModel | null) => void;

  /** Зсув кожного виробу відносно заміру. Ключ — id виробу. */
  placements: Record<string, Placement>;
  setPlacement: (productId: string, p: Partial<Placement>) => void;

  layers: Record<MergeLayer, boolean>;
  toggleLayer: (layer: MergeLayer) => void;

  plywood: PlywoodParams;
  setPlywood: (p: Partial<PlywoodParams>) => void;

  decisions: Decision[];
  addDecision: (d: Omit<Decision, 'id' | 'at'>) => void;
  removeDecision: (id: string) => void;

  /** Допуск розбіжності, за яким сторону вважаємо «не по стіні», мм. */
  toleranceMm: number;
  setTolerance: (mm: number) => void;
}

let decisionSeq = 0;

export const useConstructorStore = create<ConstructorState>((set) => ({
  measure: null,
  setMeasure: (measure) => set({ measure }),

  placements: {},
  setPlacement: (productId, p) => set((s) => ({
    placements: { ...s.placements, [productId]: { ...placementOf(s.placements, productId), ...p } },
  })),

  layers: { measure: true, product: true, plywood: false, metal: false, room: false },
  toggleLayer: (layer) => set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),

  plywood: PLYWOOD_DEFAULTS,
  setPlywood: (p) => set((s) => ({ plywood: { ...s.plywood, ...p } })),

  decisions: [],
  addDecision: (d) => set((s) => {
    decisionSeq += 1;
    return { decisions: [...s.decisions, { ...d, id: `d${Date.now()}-${decisionSeq}`, at: new Date().toISOString() }] };
  }),
  removeDecision: (id) => set((s) => ({ decisions: s.decisions.filter((d) => d.id !== id) })),

  /** РМ-3 / КС-14: ±2 мм по стіні — типовий поріг, далі кути 89–91° уже видно. */
  toleranceMm: 2,
  setTolerance: (toleranceMm) => set({ toleranceMm }),
}));

export function placementOf(placements: Record<string, Placement>, productId: string): Placement {
  return placements[productId] ?? { dx: 0, dy: 0, rotDeg: 0 };
}
