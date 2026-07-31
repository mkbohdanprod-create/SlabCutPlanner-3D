import  { useState } from 'react';
import { X } from 'lucide-react';
import type { Leg } from '../../../domain/types';

interface Props {
  edgeId: string;
  initialData?: Leg;
  onSave: (data: Leg) => void;
  onClose: () => void;
}

export function LegModal({ edgeId, initialData, onSave, onClose }: Props) {
  const [width, setWidth] = useState(initialData?.width || 1100);
  const [offset, setOffset] = useState(initialData?.offset || 0);
  const [size, setSize] = useState(initialData?.size || 'Довільний (від стільниці до підлоги)');
  const [height, setHeight] = useState(initialData?.height || 900);
  const [jointType, setJointType] = useState(initialData?.jointType || 'Без фрезерування');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-[#eaf4fc] rounded-md shadow-lg w-[360px] overflow-hidden border border-[#b8d4ee]">
        <div className="bg-[#3b82f6] px-4 py-3 flex justify-between items-center text-white">
          <h3 className="font-bold">Нога</h3>
          <button onClick={onClose} className="hover:text-white/80 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
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
              onClick={() => onSave({ edgeId, width, offset, size, height, jointType })}
              className="w-full py-1.5 bg-[#eaf4fc] text-[#3b82f6] border border-[#3b82f6] rounded-sm font-medium hover:bg-blue-50 transition-colors"
            >
              Застосувати
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}