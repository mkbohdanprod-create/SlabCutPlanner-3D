import { useState } from 'react';
import { DraggableDialog } from './DraggableDialog';
import { EDGE_KIND_LABEL } from '../../domain/ids';

/**
 * ПОТОВЩЕННЯ І ПІДВОРОТ — ТИМ САМИМ ПРИНЦИПОМ, ЩО Й БОРТИК.
 *
 * Раніше ці два створювались галочкою «на всю сторону»: без ширини, без
 * відступу, одне на сторону. Цех же клеїть потовщення шматками (наприклад,
 * тільки під нависанням) і по кілька на одній стороні. Тому тепер — та сама
 * модалка, що в бортика: Висота (виліт), Ширина (вздовж сторони, за
 * замовчуванням — уся сторона) і Відступ від початку сторони.
 *
 * Одна модалка на обидва типи, бо поля ідентичні — різняться лише назва
 * і типовий розмір (потовщення 40 мм, підворот 100 мм).
 */

export type EdgeAdditionKind = 'thickening' | 'fold';

export interface EdgeAdditionData {
  edgeId: string;
  height: number;
  width: number;
  offset: number;
  /**
   * №172: «в глиб стільниці» — нарівні з ногою. Втоплена смуга не робить вус
   * 45°, а йде під плиту й примикає торцем; розміри система рахує сама
   * (engines/attachmentShrink). 0 — смуга стоїть на кромці, як було завжди.
   */
  inset: number;
}

const KIND_LABEL: Record<EdgeAdditionKind, string> = EDGE_KIND_LABEL;

const KIND_DEFAULT_HEIGHT: Record<EdgeAdditionKind, number> = {
  thickening: 40,
  fold: 100,
};

interface Props {
  kind: EdgeAdditionKind;
  edgeId: string;
  /** Довжина ребра — ширина за замовчуванням: доповнення найчастіше на всю сторону. */
  sideLength?: number;
  /**
   * Доповнення на доповненні (підворот ноги): двигун генерує його з дерева на
   * всю сторону, тож ширину й відступ показувати нема сенсу — вони б збрехали.
   */
  fullSideOnly?: boolean;
  initialData?: Partial<EdgeAdditionData>;
  onSave: (data: EdgeAdditionData) => void;
  onClose: () => void;
}

export function EdgeAdditionModal({ kind, edgeId, sideLength, fullSideOnly, initialData, onSave, onClose }: Props) {
  const [height, setHeight] = useState(initialData?.height || KIND_DEFAULT_HEIGHT[kind]);
  const [width, setWidth] = useState(initialData?.width || (sideLength ? Math.round(sideLength) : 1100));
  const [offset, setOffset] = useState(initialData?.offset ?? 0);
  const [inset, setInset] = useState(initialData?.inset ?? 0);

  return (
    <DraggableDialog
      title={`${KIND_LABEL[kind]} — сторона ${edgeId}`}
      onClose={onClose}
      width={360}
      headerClassName="bg-[#3b82f6] text-white"
      className="bg-[#eaf4fc] border border-[#b8d4ee] overflow-hidden"
    >
      <div className="p-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Висота</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-sm text-sm"
              />
              <span className="text-xs text-slate-500">мм.</span>
            </div>
          </div>
          {!fullSideOnly && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Ширина</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-sm text-sm"
                />
                <span className="text-xs text-slate-500">мм.</span>
              </div>
            </div>
          )}
        </div>

        {fullSideOnly ? (
          <p className="text-xs text-slate-500 leading-snug">
            На доповненні воно робиться на всю сторону.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Відступ</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={offset}
                  onChange={(e) => setOffset(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-sm text-sm"
                />
                <span className="text-xs text-slate-500">мм.</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">В глиб стільниці</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={inset}
                  onChange={(e) => setInset(Math.max(0, Number(e.target.value)))}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-sm text-sm"
                />
                <span className="text-xs text-slate-500">мм.</span>
              </div>
            </div>
          </div>
        )}
        {!fullSideOnly && (
          <p className="text-xs text-slate-500 leading-snug -mt-2">
            0 — смуга стоїть на кромці й клеїться під 45°. Більше — йде під
            стільницю і примикає торцем; розмір деталі система перерахує сама.
          </p>
        )}

        <div className="flex justify-between gap-4 mt-2">
          <button
            onClick={onClose}
            className="w-full py-1.5 bg-[#eaf4fc] text-[#3b82f6] border border-[#3b82f6] rounded-sm font-medium hover:bg-blue-50 transition-colors"
          >
            Скасувати
          </button>
          <button
            onClick={() => onSave({ edgeId, height, width, offset, inset })}
            className="w-full py-1.5 bg-[#eaf4fc] text-[#3b82f6] border border-[#3b82f6] rounded-sm font-medium hover:bg-blue-50 transition-colors"
          >
            Застосувати
          </button>
        </div>
      </div>
    </DraggableDialog>
  );
}
