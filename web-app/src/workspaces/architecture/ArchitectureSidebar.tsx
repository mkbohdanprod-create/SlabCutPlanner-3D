/**
 * ЛІВА ПАНЕЛЬ АРХІТЕКТОРА (06.09.2026) — та сама колонка 300 px, що у
 * VS3D, з двома головними діями поруч: «Додати виріб» (той самий редактор
 * виробу, що у VS3D — рецепції, сходи, портали лишаються) і «Створити
 * розкладку» (окреме меню). Нижче — списки поверхонь і розкладок проєкту.
 */
import { useMemo, useState } from 'react';
import { Trash2, Map, Grid3x3, Layers, PenLine } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
import { useArchitecture } from './useArchitecture';
import { useArchUIStore } from './store';
import { computeArchitecture } from '../../engines/tileLayout';
import { LAYOUT_PATTERN_LABELS, surfaceAreaM2 } from '../../domain/architecture';
import { fmt } from '../../constructor/ui';

export function ArchitectureSidebar() {
  const [tab, setTab] = useState<'surfaces' | 'layouts' | 'products'>('surfaces');
  const { model, removeSurface, removeLayout } = useArchitecture();
  const products = useProjectStore((s) => s.project.products);
  const mainView = useUIStore((s) => s.mainView);
  const setMainView = useUIStore((s) => s.setMainView);
  const selectedSurfaceId = useArchUIStore((s) => s.selectedSurfaceId);
  const selectSurface = useArchUIStore((s) => s.selectSurface);
  const selectedLayoutId = useArchUIStore((s) => s.selectedLayoutId);
  const selectLayout = useArchUIStore((s) => s.selectLayout);
  const openAddLayout = useArchUIStore((s) => s.openAddLayout);
  const { results, totals } = useMemo(() => computeArchitecture(model), [model]);

  return (
    <aside className="sidebar w-[300px] flex-shrink-0 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="primary-action detail-open-button"
          style={{ background: '#28a745', borderColor: '#28a745', width: '100%' }}
          onClick={() => { useUIStore.getState().setProductEditorSession({ subDetails: {}, activeDetailId: null } as never); }}
          title="Додати виріб — рецепція, сходи, портал: той самий редактор, що у VS3D"
        >
          Додати виріб
        </button>
        <button
          type="button"
          className="primary-action detail-open-button"
          style={{ background: '#1f2d3a', borderColor: '#1f2d3a', width: '100%' }}
          onClick={() => openAddLayout(selectedSurfaceId ?? model.surfaces[0]?.id ?? null)}
          title="Створити розкладку по поверхні з плану"
        >
          Створити розкладку
        </button>
      </div>

      <div className="flex bg-slate-100 p-1 rounded-lg">
        {([['surfaces', 'Поверхні'], ['layouts', 'Розкладки'], ['products', 'Вироби']] as const).map(([id, label]) => (
          <button key={id} className={`flex-1 py-2 text-[12.5px] font-bold rounded-md transition-all ${tab === id ? 'bg-white shadow text-[#0084ff]' : 'text-slate-600 hover:text-slate-900'}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'surfaces' && (
        <div className="flex flex-col gap-1">
          {model.surfaces.length === 0 && (
            <div className="text-[12.5px] text-slate-500 bg-white border border-slate-200 rounded-md p-3">
              Поверхонь ще немає. На вкладці «План» підвантаж PDF, задай масштаб і обведи підлогу.
              {mainView !== 'plan' && <button type="button" className="mt-2 inline-flex items-center gap-1 text-[12px] !px-2 !py-1 rounded border !border-slate-300 !bg-white" onClick={() => setMainView('plan')}><PenLine className="w-3.5 h-3.5" /> До плану</button>}
            </div>
          )}
          {model.surfaces.map((s) => {
            const active = s.id === selectedSurfaceId;
            const n = model.layouts.filter((l) => l.surfaceId === s.id).length;
            return (
              <div key={s.id} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer ${active ? 'border-[#1f93ef] bg-[#f0f7ff]' : 'border-slate-200 bg-white hover:border-slate-300'}`} onClick={() => { selectSurface(s.id); if (mainView !== 'plan') setMainView('plan'); }}>
                <Map className={`w-4 h-4 shrink-0 ${s.kind === 'floor' ? 'text-slate-500' : 'text-violet-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-slate-800 truncate">{s.name}</div>
                  <div className="text-[11px] text-slate-500">{s.kind === 'floor' ? 'підлога' : `стіна · h ${s.heightMm}`} · {fmt(surfaceAreaM2(s), 2)} м²{n ? ` · розкладок ${n}` : ''}</div>
                </div>
                <button type="button" className="!p-1 !bg-transparent !border-0 text-slate-400 hover:text-rose-600" title="Прибрати поверхню (і її розкладки)" onClick={(e) => { e.stopPropagation(); removeSurface(s.id); if (active) selectSurface(null); }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'layouts' && (
        <div className="flex flex-col gap-1">
          {results.length === 0 && (
            <div className="text-[12.5px] text-slate-500 bg-white border border-slate-200 rounded-md p-3">Розкладок ще немає — «Створити розкладку» вгорі.</div>
          )}
          {results.map(({ layout, surface, result }) => {
            const active = layout.id === selectedLayoutId;
            return (
              <div key={layout.id} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer ${active ? 'border-[#1f93ef] bg-[#f0f7ff]' : 'border-slate-200 bg-white hover:border-slate-300'}`} onClick={() => { selectLayout(layout.id); setMainView('layout'); }}>
                <Grid3x3 className="w-4 h-4 shrink-0 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-slate-800 truncate">{layout.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{surface.name} · {LAYOUT_PATTERN_LABELS[layout.pattern]} · {layout.tileW}×{layout.tileH} · {fmt(result.stats.areaM2, 1)} м² · {result.stats.sheetsNeeded} л.</div>
                </div>
                <button type="button" className="!p-1 !bg-transparent !border-0 text-slate-400 hover:text-rose-600" title="Прибрати розкладку" onClick={(e) => { e.stopPropagation(); removeLayout(layout.id); if (active) selectLayout(null); }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            );
          })}
          {results.length > 0 && (
            <div className="text-[11.5px] text-slate-600 bg-white border border-slate-200 rounded-md p-2 mt-1">
              Разом: <b>{fmt(totals.areaM2, 2)} м²</b> · листів <b>{totals.sheets}</b> · вага <b>{fmt(totals.weightKg / 1000, 2)} т</b> · машин <b>{totals.trucks}</b>
            </div>
          )}
        </div>
      )}

      {tab === 'products' && (
        <div className="flex flex-col gap-1">
          {(products ?? []).length === 0 && (
            <div className="text-[12.5px] text-slate-500 bg-white border border-slate-200 rounded-md p-3">Виробів у проєкті немає. «Додати виріб» — рецепція, сходи, портал; розкладки, передані «У розкрій», теж з'являться тут.</div>
          )}
          {(products ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
              <Layers className="w-4 h-4 shrink-0 text-slate-500" />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-slate-800 truncate">{p.name}</div>
                <div className="text-[11px] text-slate-500">{p.elements.length} ел. · {p.material ?? '—'}</div>
              </div>
            </div>
          ))}
          {(products ?? []).length > 0 && (
            <button type="button" className="mt-1 text-[12px] !px-2 !py-1.5 rounded border !border-slate-300 !bg-white" onClick={() => setMainView('2d')}>Відкрити 2D Розкрій</button>
          )}
        </div>
      )}
    </aside>
  );
}
