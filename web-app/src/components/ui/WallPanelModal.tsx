import { useState } from 'react';
import { DraggableDialog } from './DraggableDialog';

interface Props {
  edgeId: string;
  /**
   * Довжина ребра, на якому створюється деталь. Стає шириною за
   * замовчуванням: доповнення майже завжди роблять на всю сторону, а
   * жорсткий дефолт 1100 змушував щоразу перебивати число вручну.
   */
  sideLength?: number;
  initialData?: any;
  onSave: (data: any) => void;
  onClose: () => void;
}

export function WallPanelModal({ edgeId, sideLength, initialData, onSave, onClose }: Props) {
  const [material] = useState(initialData?.material || 'Керамограніт Inalco Silk Negro Natural 12 mm 3200x1600');
  const [width, setWidth] = useState(initialData?.width || (sideLength ? Math.round(sideLength) : 1100));
  const [height, setHeight] = useState(initialData?.height || 600);
  const [offset, setOffset] = useState(initialData?.offset || 0);
  const [thickness, setThickness] = useState(initialData?.thickness || 12);

  return (
    <DraggableDialog
      title="Стінова панель"
      onClose={onClose}
      width={360}
      headerClassName="bg-[#3b82f6] text-white"
      className="bg-[#eaf4fc] border border-[#b8d4ee] overflow-hidden"
    >
        
        <div className="p-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
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
          </div>

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
              <label className="text-sm font-medium text-slate-700">Товщина виробу</label>
              <select
                value={thickness}
                onChange={(e) => setThickness(Number(e.target.value))}
                className="px-2 py-1.5 border border-slate-300 rounded-sm text-sm"
              >
                <option value={12}>12</option>
                <option value={20}>20</option>
              </select>
            </div>
          </div>

          <div className="flex justify-between gap-4 mt-2">
            <button
              onClick={onClose}
              className="w-full py-1.5 bg-[#eaf4fc] text-[#3b82f6] border border-[#3b82f6] rounded-sm font-medium hover:bg-blue-50 transition-colors"
            >
              Скасувати
            </button>
            <button
              onClick={() => onSave({ edgeId, material, width, height, offset, thickness })}
              className="w-full py-1.5 bg-[#eaf4fc] text-[#3b82f6] border border-[#3b82f6] rounded-sm font-medium hover:bg-blue-50 transition-colors"
            >
              Застосувати
            </button>
          </div>
        </div>
    </DraggableDialog>
  );
}
