import React from 'react';
import { DraggableDialog } from './DraggableDialog';
import { Check } from 'lucide-react';
import type { CornerProcessing, CornerProcessingType } from '../../domain/types';
import { cornerSides } from '../../domain/sideNaming';
import { translateStaticUiText } from '../../i18n';
import type { UiLanguage } from '../../store/useDictionaryStore';

interface CornerProcessingModalProps {
  cornerId: string;
  initialData?: CornerProcessing;
  onSave: (data: CornerProcessing | undefined) => void;
  onClose: () => void;
  language?: UiLanguage;
}

export function CornerProcessingModal({ cornerId, initialData, onSave, onClose, language = 'uk' }: CornerProcessingModalProps) {
  const ui = (value: string) => translateStaticUiText(language, value);

  const [type, setType] = React.useState<CornerProcessingType>(initialData?.type || 'radius');
  const [radius, setRadius] = React.useState<number>(initialData?.radius || 10);
  const [sizeB, setSizeB] = React.useState<number>(initialData?.sizeB || 10);
  const [sizeC, setSizeC] = React.useState<number>(initialData?.sizeC || 10);
  const [complexRadius, setComplexRadius] = React.useState<boolean>(!!initialData?.complexRadius);
  const [edgeProcessing, setEdgeProcessing] = React.useState<string>(initialData?.edgeProcessing || 'Без фрезерування');
  const [isEdgeProcessingEnabled, setIsEdgeProcessingEnabled] = React.useState<boolean>(!!initialData?.edgeProcessing);

  /*
   * ПІДПИСИ РОЗМІРІВ — ІМЕНАМИ РЕАЛЬНИХ СТОРІН КУТА (Б-002, 07.09.2026).
   * `sizeB` завжди міряється вздовж ПЕРШОЇ сторони кута, `sizeC` — вздовж
   * ДРУГОЇ (так їх читають обидва будівники контуру). Раніше підписи були
   * зашиті літерами B і C — правдою вони були лише для кута BC.
   */
  const sides = cornerSides(cornerId);
  const sizeBLabel = sides ? `Розмір по ${sides[0]}` : 'Розмір по B';
  const sizeCLabel = sides ? `Розмір по ${sides[1]}` : 'Розмір по C';

  const handleSave = () => {
    onSave({
      type,
      radius: type === 'radius' ? radius : undefined,
      sizeB: type !== 'radius' ? sizeB : undefined,
      sizeC: type !== 'radius' ? sizeC : undefined,
      complexRadius: type === 'radius' && complexRadius ? true : undefined,
      edgeProcessing: isEdgeProcessingEnabled ? edgeProcessing : undefined,
    });
  };

  return (
    <DraggableDialog title="Обробка кутів" onClose={onClose} width={320}>
        <div className="p-4 flex flex-col gap-4 text-[13px] text-slate-800">
          <div className="flex flex-col gap-1">
            <label className="text-slate-600 font-medium">Тип обробки</label>
            <select 
              value={type}
              onChange={(e) => setType(e.target.value as CornerProcessingType)}
              className="border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] bg-white font-medium"
            >
              <option value="radius">{ui('Радіус')}</option>
              <option value="chamfer">{ui('Кут')}</option>
              <option value="l-cut">{ui('Г-подібний виріз')}</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-600 font-medium">Кут</label>
            <div className="border border-slate-300 rounded-sm h-8 px-2 bg-white flex items-center font-bold text-slate-700 pointer-events-none opacity-80">
              {cornerId}
            </div>
          </div>

          {type === 'radius' && (
            <div className="flex flex-col gap-1">
              <label className="text-slate-600 font-medium">Радіус</label>
              <div className="relative">
                <input 
                  type="number"
                  value={radius || ''}
                  onChange={e => setRadius(parseInt(e.target.value, 10) || 0)}
                  className="w-[120px] border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] font-bold"
                />
                <span className="absolute left-[125px] top-1/2 -translate-y-1/2 text-slate-500 font-medium">ММ.</span>
              </div>
              {radius > 0 && radius < 100 && (
                <div className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1.5">
                  Радіус менший за 100 мм — узгодьте з технологом можливість обробки.
                  Прорахунок і розкрій це не блокує.
                </div>
              )}
              {/*
                ТЗ 19.08, п. 4.8: нестандартну геометрію людина позначає САМА.
                Автомат класифікує за товщиною і висотою, але «складний» —
                це судження конструктора, і воно сильніше за автомат.
              */}
              <label className="mt-2 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={complexRadius}
                  onChange={(e) => setComplexRadius(e.target.checked)}
                  className="mt-0.5 accent-[#1f93ef]"
                />
                <span className="text-slate-700">
                  {ui('Складний радіус')}
                  <span className="block text-[11px] text-slate-500 leading-snug">
                    Нестандартна геометрія — піде в прорахунок окремою позицією
                  </span>
                </span>
              </label>
            </div>
          )}

          {type !== 'radius' && (
            <div className="flex gap-4">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-slate-600 font-medium">{sizeCLabel}</label>
                <div className="relative">
                  <input 
                    type="number"
                    value={sizeC || ''}
                    onChange={e => setSizeC(parseInt(e.target.value, 10) || 0)}
                    className="w-full border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] font-bold"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-[11px]">ММ.</span>
                </div>
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-slate-600 font-medium">{sizeBLabel}</label>
                <div className="relative">
                  <input 
                    type="number"
                    value={sizeB || ''}
                    onChange={e => setSizeB(parseInt(e.target.value, 10) || 0)}
                    className="w-full border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] font-bold"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-[11px]">ММ.</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={`w-5 h-5 rounded-sm border flex items-center justify-center transition-colors ${isEdgeProcessingEnabled ? 'bg-[#1f93ef] border-[#1f93ef]' : 'bg-white border-slate-300 group-hover:border-[#1f93ef]'}`}>
                {isEdgeProcessingEnabled && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-slate-700 font-medium">Обробка торців</span>
            </label>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-slate-500 text-[11px] font-medium leading-none">Фрезерування</label>
              <select 
                disabled={!isEdgeProcessingEnabled}
                value={edgeProcessing}
                onChange={e => setEdgeProcessing(e.target.value)}
                className="border border-slate-300 rounded-sm h-7 px-2 outline-none focus:border-[#1f93ef] bg-white font-medium disabled:opacity-50 text-slate-700"
              >
                <option value="Без фрезерування">Без фрезерування</option>
                <option value="Стандарт">Стандарт</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button 
              onClick={onClose}
              className="flex-1 h-9 border border-[#1f93ef] text-[#1f93ef] font-bold rounded-sm hover:bg-[#1f93ef]/10 transition-colors"
            >
              Скасувати
            </button>
            <button 
              onClick={handleSave}
              className="flex-1 h-9 bg-transparent border border-[#1f93ef] text-[#1f93ef] font-bold rounded-sm hover:bg-[#1f93ef]/10 transition-colors"
            >
              Застосувати
            </button>
          </div>
        </div>
    </DraggableDialog>
  );
}
