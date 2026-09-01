import  { useState } from 'react';
import { DraggableDialog } from './DraggableDialog';
import type { Leg } from '../../../domain/types';

interface Props {
  edgeId: string;
  /**
   * Довжина ребра, на якому створюється деталь. Стає шириною за
   * замовчуванням: доповнення майже завжди роблять на всю сторону, а
   * жорсткий дефолт 1100 змушував щоразу перебивати число вручну.
   */
  sideLength?: number;
  initialData?: Leg;
  onSave: (data: Leg) => void;
  onClose: () => void;
}

export function LegModal({ edgeId, sideLength, initialData, onSave, onClose }: Props) {
  const [width, setWidth] = useState(initialData?.width || (sideLength ? Math.round(sideLength) : 1100));
  const [offset, setOffset] = useState(initialData?.offset || 0);
  const [inset, setInset] = useState(initialData?.inset || 0);
  const [size, setSize] = useState(initialData?.size || 'Довільний (від стільниці до підлоги)');
  const [height, setHeight] = useState(initialData?.height || 900);
  const [jointType, setJointType] = useState(initialData?.jointType || 'Без фрезерування');

  return (
    <DraggableDialog
      title="Нога"
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
              <label className="text-sm font-medium text-slate-700">Відступ</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={offset}
                  onChange={(e) => setOffset(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-sm text-sm"
                />
              </div>
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
            <span className="text-[11px] text-slate-500">0 — нога стоїть на кромці. Більше — зсувається під стільницю.</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Розмір ноги</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="px-2 py-1.5 border border-slate-300 rounded-sm text-sm"
              >
                <option value="Довільний (від стільниці до підлоги)">Довільний (від стільниці до підлоги)</option>
                <option value="Заданий">Заданий</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Висота</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  disabled={size.includes('підлоги')}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-sm text-sm disabled:opacity-50"
                />
                <span className="text-xs text-slate-500">мм.</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Тип обробки стику</label>
            <select
              value={jointType}
              onChange={(e) => setJointType(e.target.value)}
              className="px-2 py-1.5 border border-slate-300 rounded-sm text-sm"
            >
              <option value="Без фрезерування">Без фрезерування</option>
              <option value="Заусовка 45">Заусовка 45°</option>
            </select>
          </div>

          <div className="flex justify-between gap-4 mt-2">
            <button
              onClick={onClose}
              className="w-full py-1.5 bg-[#eaf4fc] text-[#3b82f6] border border-[#3b82f6] rounded-sm font-medium hover:bg-blue-50 transition-colors"
            >
              Скасувати
            </button>
            <button
              onClick={() => onSave({ edgeId, width, offset, inset, size, height, jointType })}
              className="w-full py-1.5 bg-[#eaf4fc] text-[#3b82f6] border border-[#3b82f6] rounded-sm font-medium hover:bg-blue-50 transition-colors"
            >
              Застосувати
            </button>
          </div>
        </div>
    </DraggableDialog>
  );
}
