import  { useState } from 'react';
import { X } from 'lucide-react';
import type { Skirting } from '../../../domain/types';

interface Props {
  edgeId: string;
  initialData?: Skirting;
  onSave: (data: Skirting) => void;
  onClose: () => void;
}

export function SkirtingModal({ edgeId, initialData, onSave, onClose }: Props) {
  const [form, setForm] = useState(initialData?.form || 'Під прямим кутом');
  const [height, setHeight] = useState(initialData?.height || 50);
  const [width, setWidth] = useState(initialData?.width || 1100);
  const [offset, setOffset] = useState(initialData?.offset || 0);
  const [type, setType] = useState(initialData?.type || 'Плінтус R3');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-[#eaf4fc] rounded-md shadow-lg w-[360px] overflow-hidden border border-[#b8d4ee]">
        <div className="bg-[#3b82f6] px-4 py-3 flex justify-between items-center text-white">
          <h3 className="font-bold">Бортик</h3>
          <button onClick={onClose} className="hover:text-white/80 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Форма</label>
            <select
              value={form}
              onChange={(e) => setForm(e.target.value)}
              className="px-2 py-1.5 border border-slate-300 rounded-sm text-sm"
            >
              <option value="Під прямим кутом">Під прямим кутом</option>
              <option value="Косий">Косий</option>
            </select>
          </div>

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
              <label className="text-sm font-medium text-slate-700">Тип бортика</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="px-2 py-1.5 border border-slate-300 rounded-sm text-sm"
              >
                <option value="Не вибрано">Не вибрано</option>
                <option value="Плінтус R3">Плінтус R3</option>
                <option value="Плінтус 2x2">Плінтус 2x2</option>
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
              onClick={() => onSave({ edgeId, form, height, width, offset, type })}
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