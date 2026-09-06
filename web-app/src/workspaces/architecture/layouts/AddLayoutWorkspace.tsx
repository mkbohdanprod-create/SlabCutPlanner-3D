/**
 * МЕНЮ «СТВОРИТИ РОЗКЛАДКУ» — окреме, на основі меню створення виробу
 * (рішення власника 06.09: «на основі меню створення виробів зробити
 * меню створення розкладок, плюс-мінус все те саме»).
 *
 * Той самий повноекранний каркас, що в `AddProductWorkspace`: зліва кроки,
 * справа зміст, унизу «Створити». Кроки: 1. Поверхня → 2. Патерн і формат
 * → 3. Матеріал → 4. Підсумок. На кожному кроці праворуч жива картинка й
 * числа — людина бачить, що вибирає.
 */
import { useMemo, useState } from 'react';
import { X, Grid3x3, Check, Map } from 'lucide-react';
import { useArchitecture } from '../useArchitecture';
import { useArchUIStore } from '../store';
import { useUIStore } from '../../../store/useStore';
import { defaultLayoutFor, surfaceAreaM2, LAYOUT_PATTERN_LABELS, type TileLayout } from '../../../domain/architecture';
import { generateLayout } from '../../../engines/tileLayout';
import { LayoutControls } from './LayoutControls';
import { LayoutPreview, StatCell } from './LayoutPreview';
import { fmt } from '../../../constructor/ui';

type Step = 'surface' | 'pattern' | 'material' | 'summary';
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'surface', label: '1. Поверхня' },
  { id: 'pattern', label: '2. Патерн і формат' },
  { id: 'material', label: '3. Матеріал і запас' },
  { id: 'summary', label: '4. Підсумок' },
];

export function AddLayoutWorkspace({ onClose }: { onClose: () => void }) {
  const { model, upsertLayout } = useArchitecture();
  const presetSurfaceId = useArchUIStore((s) => s.addLayoutSurfaceId);
  const selectLayout = useArchUIStore((s) => s.selectLayout);
  const setMainView = useUIStore((s) => s.setMainView);

  const [step, setStep] = useState<Step>(presetSurfaceId ? 'pattern' : 'surface');
  const initialSurface = model.surfaces.find((s) => s.id === presetSurfaceId) ?? model.surfaces[0] ?? null;
  const [layout, setLayout] = useState<TileLayout | null>(() => (initialSurface ? defaultLayoutFor(initialSurface, model.layouts.filter((l) => l.surfaceId === initialSurface.id).length + 1) : null));

  const surface = layout ? model.surfaces.find((s) => s.id === layout.surfaceId) ?? null : null;
  const result = useMemo(() => (layout && surface ? generateLayout(surface, layout, model.norms) : null), [layout, surface, model.norms]);

  const pickSurface = (id: string) => {
    const s = model.surfaces.find((x) => x.id === id); if (!s) return;
    const n = model.layouts.filter((l) => l.surfaceId === s.id).length + 1;
    setLayout((cur) => {
      const base = defaultLayoutFor(s, n);
      if (!cur) return base;
      const prev = model.surfaces.find((x) => x.id === cur.surfaceId);
      // інша природа поверхні (підлога ↔ стіна) — формат, шов (РЗ-3) і
      // розбіжка (РЗ-2) за замовчуванням для неї; патерн і матеріал
      // людина вже обрала — лишаємо
      const sameKind = prev?.kind === s.kind;
      return { ...cur, id: base.id, surfaceId: s.id, name: base.name, tileW: sameKind ? cur.tileW : base.tileW, tileH: sameKind ? cur.tileH : base.tileH, jointMm: sameKind ? cur.jointMm : base.jointMm, offsetFraction: sameKind ? cur.offsetFraction : base.offsetFraction };
    });
  };

  const create = () => {
    if (!layout) return;
    upsertLayout(layout);
    selectLayout(layout.id);
    setMainView('layout');
    onClose();
  };

  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const canNext = step !== 'surface' || Boolean(layout);

  return (
    <div className="absolute inset-0 bg-[#eaf0f4] z-50 flex flex-col shadow-lg overflow-hidden animate-in fade-in zoom-in duration-200">
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-white border-b border-[#c6d3dd]">
        <div className="min-w-0">
          <h1 className="text-lg md:text-2xl font-bold text-[#1f2d3a] flex items-center gap-2 md:gap-3 m-0">
            <Grid3x3 className="w-5 h-5 md:w-6 md:h-6 text-[#0084ff] shrink-0" />
            Створити розкладку
          </h1>
          <p className="text-[12px] md:text-sm text-slate-500 mt-1 hidden sm:block">Поверхня з плану → патерн і формат → матеріал → числа. Усе крутиться й після створення.</p>
        </div>
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors" title="Закрити">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row max-w-[1500px] mx-auto w-full">
        {/* Кроки: на десктопі колонка зліва (як у меню виробу), на телефоні — рядок зверху */}
        <div className="md:w-[240px] shrink-0 bg-white border-b md:border-b-0 md:border-r border-[#c6d3dd] flex flex-wrap md:flex-nowrap md:flex-col p-2 md:p-4 gap-1.5 md:gap-2 z-10 shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
          {STEPS.map((s) => (
            <button key={s.id} className={`text-left !px-3 md:!px-4 !py-2 md:!py-3 rounded-md font-bold text-[12.5px] md:text-sm transition-colors whitespace-nowrap ${step === s.id ? '!bg-[#0084ff] !text-white shadow-sm' : '!text-slate-600 hover:!bg-slate-100'}`} onClick={() => setStep(s.id)}>
              {s.label}
            </button>
          ))}
          <div className="mt-auto text-[11.5px] text-slate-500 leading-snug hidden md:block">
            Патерни першої версії: пряма, розбіжка, діагональ, ялинка, периметр + центр. Правила старту й підрізів — від власника; норми запасу — УМОВНО.
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 md:p-6 flex flex-col lg:flex-row gap-4 md:gap-5 pb-24 md:pb-6">
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {step === 'surface' && (
              <div className="bg-white border border-[#c6d3dd] rounded-md p-5 shadow-sm">
                <div className="text-sm font-bold text-slate-700 mb-3">На яку поверхню лягає розкладка</div>
                {model.surfaces.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">
                    <p>Поверхонь ще немає. Спершу обведи підлогу або стіну на плані.</p>
                    <button type="button" className="mt-3 inline-flex items-center gap-1.5 !px-3 !py-1.5 rounded-md border !border-slate-300 !bg-white text-[13px]" onClick={() => { onClose(); setMainView('plan'); }}><Map className="w-4 h-4" /> До плану</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {model.surfaces.map((s) => {
                      const active = layout?.surfaceId === s.id;
                      const n = model.layouts.filter((l) => l.surfaceId === s.id).length;
                      return (
                        <button key={s.id} type="button" onClick={() => pickSurface(s.id)}
                          className={`text-left !p-3 rounded-md border-2 transition-all ${active ? '!border-[#0084ff] !bg-[#f0f7ff]' : '!border-slate-200 !bg-white hover:!border-slate-300'}`}>
                          <div className={`text-[13px] font-bold ${active ? 'text-[#0084ff]' : 'text-slate-700'}`}>{s.name}</div>
                          <div className="text-[11.5px] text-slate-500">{s.kind === 'floor' ? 'підлога' : `стіна · h ${s.heightMm} мм`} · {fmt(surfaceAreaM2(s), 2)} м²{n ? ` · розкладок: ${n}` : ''}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {(step === 'pattern' || step === 'material') && layout && (
              <div className="bg-white border border-[#c6d3dd] rounded-md p-5 shadow-sm">
                <div className="text-sm font-bold text-slate-700 mb-3">{step === 'pattern' ? 'Патерн, формат, шов, старт' : 'Матеріал, лист постачальника, запас'}</div>
                <LayoutControls layout={layout} onChange={setLayout} />
              </div>
            )}
            {step === 'summary' && layout && surface && result && (
              <div className="bg-white border border-[#c6d3dd] rounded-md p-5 shadow-sm">
                <div className="text-sm font-bold text-slate-700 mb-3">Що створюємо</div>
                <label className="block text-[12.5px] text-slate-600 mb-1">Назва розкладки</label>
                <input value={layout.name} onChange={(e) => setLayout({ ...layout, name: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-md text-[14px] mb-3" />
                <ul className="text-[13px] text-slate-700 grid grid-cols-2 gap-x-6 gap-y-1 list-none p-0 m-0">
                  <li>Поверхня: <b>{surface.name}</b> ({surface.kind === 'floor' ? 'підлога' : 'стіна'})</li>
                  <li>Патерн: <b>{LAYOUT_PATTERN_LABELS[layout.pattern]}</b>{layout.pattern === 'perimeter_center' ? ` (бордюр ${layout.borderMm}, центр — ${LAYOUT_PATTERN_LABELS[layout.innerPattern]})` : ''}</li>
                  <li>Плитка: <b>{layout.tileW} × {layout.tileH}</b> мм, шов {layout.jointMm} мм</li>
                  <li>Старт: <b>{layout.origin === 'auto' ? 'авто (симетричні підрізи)' : layout.origin === 'corner' ? 'з кута' : 'з центру'}</b>, кут {layout.angleDeg}°</li>
                  <li>Матеріал: <b>{layout.material.name}</b>, {layout.material.thicknessMm} мм</li>
                  <li>Запас: <b>{result.stats.wastePct} %</b>{layout.wastePctOverride === undefined ? ' (норма, УМОВНО)' : ' (вручну)'}</li>
                </ul>
              </div>
            )}
            <div className="flex items-center justify-between">
              <button type="button" className="!px-4 !py-2 rounded-md border !border-slate-300 !bg-white text-[13px] font-semibold text-slate-700 disabled:opacity-40" disabled={stepIdx === 0} onClick={() => setStep(STEPS[Math.max(0, stepIdx - 1)].id)}>← Назад</button>
              {step !== 'summary' ? (
                <button type="button" className="!px-4 !py-2 rounded-md !bg-[#0084ff] !text-white text-[13px] font-semibold disabled:opacity-40" disabled={!canNext} onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIdx + 1)].id)}>Далі →</button>
              ) : (
                <button type="button" className="inline-flex items-center gap-2 !px-5 !py-2 rounded-md !bg-[#22a06b] !text-white text-[14px] font-bold disabled:opacity-40" disabled={!layout} onClick={create}><Check className="w-4 h-4" /> Створити розкладку</button>
              )}
            </div>
          </div>

          <div className="lg:w-[440px] shrink-0 flex flex-col gap-3">
            <div className="bg-white border border-[#c6d3dd] rounded-md shadow-sm overflow-hidden h-[220px] md:h-[320px] flex items-center justify-center">
              {surface && result ? <LayoutPreview surface={surface} result={result} className="w-full h-full" /> : <span className="text-slate-400 text-[13px]">Оберіть поверхню</span>}
            </div>
            {result && (
              <div className="grid grid-cols-3 gap-1.5">
                <StatCell label="Площа" value={fmt(result.stats.areaM2, 2)} unit="м²" />
                <StatCell label="Цілих" value={result.stats.fullCount} unit="шт" tone="green" />
                <StatCell label="Підрізів" value={result.stats.cutCount} unit="шт" tone="amber" />
                <StatCell label="Плиток +запас" value={result.stats.tilesNeeded} unit="шт" />
                <StatCell label={result.stats.tilesPerSheet > 0 ? `Листів (по ${result.stats.tilesPerSheet})` : 'Панелей'} value={result.stats.sheetsNeeded} unit="шт" />
                <StatCell label="Шви" value={fmt(result.stats.seamLengthM, 1)} unit="м" />
                <StatCell label="Різ по краю" value={fmt(result.stats.cutLengthM, 1)} unit="м" />
                <StatCell label="Вага" value={fmt(result.stats.weightKg / 1000, 2)} unit="т" />
                <StatCell label="Монтаж" value={fmt(result.stats.installHours, 1)} unit="год" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AddLayoutWorkspace;
