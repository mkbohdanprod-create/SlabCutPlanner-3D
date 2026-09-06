/**
 * РОЗКЛАДКА — головне вікно архітектора (06.09.2026).
 *
 * Зліва картинка: поверхня з плану, на ній плитки — цілі світлі, підрізані
 * штрихом. Справа ручки (патерн, формат, шов, старт, кут, матеріал) і живі
 * числа: квадратура, цілі/підрізи, листи, шви, різ, вага, монтаж. Кожна
 * ручка перераховує все одразу — рушій `engines/tileLayout.ts` чистий і
 * швидкий.
 *
 * «У розкрій»: плитки розкладки стають виробом у проєкті (деталь
 * tileW × tileH × кількість), і 2D Розкрій розкладає їх по листах як
 * будь-які деталі — одна пачка з виробами, як хотів власник.
 */
import { useMemo } from 'react';
import { Plus, Trash2, Scissors, Map, Table2 } from 'lucide-react';
import { useArchitecture } from '../useArchitecture';
import { useArchUIStore } from '../store';
import { generateLayout } from '../../../engines/tileLayout';
import { LAYOUT_PATTERN_LABELS, type TileLayout } from '../../../domain/architecture';
import { useProjectStore } from '../../../store/useProjectStore';
import { useUIStore } from '../../../store/useStore';
import { buildProductFromSession } from '../../../components/ui/ProductEditorWorkspace';
import { createDraft } from '../../../components/forms/utils/draftHelpers';
import { BTN_IDLE, BTN_GREEN, Empty, Tag, fmt } from '../../../constructor/ui';
import { LayoutPreview, StatCell } from './LayoutPreview';
import { LayoutControls } from './LayoutControls';

/** Плитки розкладки → виріб у проєкті (у розкрій). Повертає id виробу. */
export function sendLayoutToCutting(layout: TileLayout, tilesNeeded: number): string {
  const store = useProjectStore.getState();
  const productId = layout.productId ?? `arch_${layout.id}`;
  const mainDetail = {
    ...createDraft(),
    type: 'Довільний елемент' as const,
    kind: 'rect' as const,
    width: layout.tileW,
    height: layout.tileH,
    thickness: layout.material.thicknessMm,
    quantity: Math.max(1, Math.round(tilesNeeded)),
    elevation: 0,
  };
  const product = buildProductFromSession({ mainDetail: mainDetail as never, subDetails: {}, activeDetailId: 'main' }, productId, store.project.projectMaterial);
  const named = { ...product, name: `Розкладка: ${layout.name} — ${layout.tileW}×${layout.tileH} × ${mainDetail.quantity}` };
  if ((store.project.products ?? []).some((p) => p.id === productId)) store.updateProduct(productId, named);
  else store.addProduct(named);
  return productId;
}

export default function LayoutEditor() {
  const { model, upsertLayout, removeLayout } = useArchitecture();
  const selectedLayoutId = useArchUIStore((s) => s.selectedLayoutId);
  const selectLayout = useArchUIStore((s) => s.selectLayout);
  const openAddLayout = useArchUIStore((s) => s.openAddLayout);
  const setMainView = useUIStore((s) => s.setMainView);
  const products = useProjectStore((s) => s.project.products);

  const layout = model.layouts.find((l) => l.id === selectedLayoutId) ?? model.layouts[0] ?? null;
  const surface = layout ? model.surfaces.find((s) => s.id === layout.surfaceId) ?? null : null;
  const result = useMemo(() => (layout && surface ? generateLayout(surface, layout, model.norms) : null), [layout, surface, model.norms]);

  if (!layout || !surface || !result) {
    return (
      <div className="flex flex-col h-full bg-[#eaf0f4]">
        <Empty>
          <div className="text-[16px] font-bold text-slate-800 mb-2">Розкладок ще немає</div>
          {model.surfaces.length === 0 ? (
            <p>Спершу обведи підлогу або стіну на вкладці «План», тоді створи розкладку.</p>
          ) : (
            <p>Є {model.surfaces.length} поверхонь. Створи першу розкладку — патерн, формат, шов — і одразу побачиш числа.</p>
          )}
          <div className="flex gap-2 justify-center mt-4">
            {model.surfaces.length === 0 && <button type="button" className={BTN_IDLE} onClick={() => setMainView('plan')}><Map className="w-4 h-4" /> До плану</button>}
            <button type="button" className={BTN_GREEN} onClick={() => openAddLayout(model.surfaces[0]?.id ?? null)} disabled={model.surfaces.length === 0}><Plus className="w-4 h-4" /> Створити розкладку</button>
          </div>
        </Empty>
      </div>
    );
  }

  const st = result.stats;
  const inCutting = Boolean(layout.productId && (products ?? []).some((p) => p.id === layout.productId));

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#eaf0f4]">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-white border-b border-slate-200">
        <select value={layout.id} onChange={(e) => selectLayout(e.target.value)} className="h-8 border border-slate-300 rounded px-2 text-[13px] bg-white max-w-[260px]">
          {model.layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <input value={layout.name} onChange={(e) => upsertLayout({ ...layout, name: e.target.value })} className="h-8 border border-slate-300 rounded px-2 text-[13px] bg-white w-56" title="Назва розкладки" />
        <Tag tone="blue">{surface.kind === 'floor' ? 'підлога' : 'стіна'} · {surface.name}</Tag>
        <Tag>{LAYOUT_PATTERN_LABELS[layout.pattern]}</Tag>
        <span className="ml-auto flex items-center gap-1.5">
          <button type="button" className={BTN_GREEN} onClick={() => openAddLayout(surface.id)} title="Ще одна розкладка"><Plus className="w-4 h-4" /> <span className="hidden md:inline">Створити розкладку</span></button>
          <button type="button" className={inCutting ? `${BTN_IDLE} !text-emerald-700` : BTN_IDLE} title={inCutting ? 'Плитки вже в розкрої — оновити кількість' : 'Передати плитки розкладки у 2D Розкрій як виріб'}
            onClick={() => { const id = sendLayoutToCutting(layout, st.tilesNeeded); upsertLayout({ ...layout, productId: id }); }}>
            <Scissors className="w-4 h-4" /> <span className="hidden md:inline">{inCutting ? 'У розкрої ✓' : 'У розкрій'}</span>
          </button>
          <button type="button" className={BTN_IDLE} title="Відомість обсягів" onClick={() => setMainView('boq')}><Table2 className="w-4 h-4" /></button>
          <button type="button" className={`${BTN_IDLE} !text-rose-600`} title="Прибрати розкладку" onClick={() => { removeLayout(layout.id); selectLayout(null); }}><Trash2 className="w-4 h-4" /></button>
        </span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden custom-scrollbar pb-20 lg:pb-0">
        <div className="flex-1 lg:min-h-[280px] p-3 flex flex-col gap-2">
          <div className="h-[260px] lg:h-auto lg:flex-1 lg:min-h-0 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <LayoutPreview surface={surface} result={result} className="w-full h-full" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatCell label="Площа" value={fmt(st.areaM2, 2)} unit="м²" />
            <StatCell label="Цілих" value={st.fullCount} unit="шт" tone="green" />
            <StatCell label="Підрізів" value={st.cutCount} unit="шт" tone="amber" />
            <StatCell label="Плиток із запасом" value={st.tilesNeeded} unit={`шт · +${st.wastePct}%`} />
            <StatCell label={st.tilesPerSheet > 0 ? `Листів (по ${st.tilesPerSheet})` : 'Панелей'} value={st.sheetsNeeded} unit="шт" />
            <StatCell label="Шви" value={fmt(st.seamLengthM, 1)} unit="м" />
            <StatCell label="Різ по краю" value={fmt(st.cutLengthM, 1)} unit="м" />
            <StatCell label="Вага" value={fmt(st.weightKg / 1000, 2)} unit="т" />
            <StatCell label="Монтаж" value={fmt(st.installHours, 1)} unit="год" />
          </div>
        </div>
        <aside className="lg:w-[420px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white p-3 lg:overflow-y-auto custom-scrollbar">
          <LayoutControls layout={layout} onChange={upsertLayout} />
          <p className="text-[11px] text-slate-500 mt-3 leading-snug">
            Запас, клей, темп монтажу — норми першої версії, позначені <Tag tone="amber">УМОВНО</Tag>; уточнюються кейсами в Обучалочці.
          </p>
        </aside>
      </div>
    </div>
  );
}
