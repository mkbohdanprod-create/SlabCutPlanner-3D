/**
 * ВКЛАДКА «К-Р ФАНЕРИ» — 04.09.2026.
 *
 * Для кожної головної деталі: чи потрібен підклад (КП-7/КП-8), товщина
 * (КП-1 = висота кромки − плита), розкладка рама+ребра (КП-2…КП-6) у
 * SVG і таблиця ТБ-1. Параметри з гіпотез (крок ребер, відступ) — поля,
 * не константи. Габарит — bbox контуру; довільний контур смуги не
 * обрізає (борг v1, записано в СТАРТЕР).
 */
import { useMemo, useState } from 'react';
import { useConstructorStore, PLYWOOD_DEFAULTS } from '../store';
import { useProjectStore } from '../../store/useProjectStore';
import { productOutlines } from '../geometry';
import { buildPlywoodLayout, needsSubstrate, plywoodThickness, type CutoutRect } from './plywoodRules';
import { BTN_IDLE, Empty, Field, NumInput, Panel, Tag, fmt } from '../ui';

export function PlywoodTab() {
  const params = useConstructorStore((s) => s.plywood);
  const setPlywood = useConstructorStore((s) => s.setPlywood);
  const placements = useConstructorStore((s) => s.placements);
  const addDecision = useConstructorStore((s) => s.addDecision);
  const project = useProjectStore((s) => s.project);
  const [edgeHeight, setEdgeHeight] = useState<Record<string, number>>({});
  const [force, setForce] = useState<Record<string, boolean>>({});

  const outlines = useMemo(() => productOutlines(project, placements), [project, placements]);
  const [selected, setSelected] = useState<string | null>(null);
  const current = outlines.find((o) => o.detail.id === selected) ?? outlines[0];

  if (!outlines.length) {
    return <Empty><p className="font-semibold text-slate-700 mb-1">Немає деталей</p><p>Додай виріб у «2D Розкрій» — тут з'явиться підклад під кожну стільницю, якій він потрібен.</p></Empty>;
  }

  const rows = outlines.map((o) => {
    const eh = edgeHeight[o.detail.id];
    const need = needsSubstrate(o.detail, eh);
    return { o, need, forced: Boolean(force[o.detail.id]) };
  });

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-[320px] shrink-0 border-r border-slate-200 bg-[#f7f9fb] p-3 overflow-y-auto custom-scrollbar flex flex-col gap-3">
        <Panel title="Деталі">
          <ul className="m-0 p-0 list-none space-y-1">
            {rows.map(({ o, need, forced }) => (
              <li key={o.detail.id}>
                <button type="button" onClick={() => setSelected(o.detail.id)}
                  className={`w-full text-left px-2 py-1.5 rounded border text-[12.5px] ${current?.detail.id === o.detail.id ? '!bg-sky-50 !border-sky-300' : '!bg-white !border-slate-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate font-semibold text-slate-800">{o.productName}</span>
                    {need.needed || forced ? <Tag tone="amber">підклад</Tag> : <Tag>без</Tag>}
                  </div>
                  <div className="text-slate-500 text-[11.5px]">{o.detail.type} · {fmt(o.detail.geometry.width, 0)}×{fmt(o.detail.geometry.height, 0)} · {o.detail.thickness} мм</div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Параметри (з обучалочки)">
          <Field label="Смуга периметра, мм" hint="КП-2 — ФАКТ, 2 кейси"><NumInput value={params.stripWidth} min={30} onChange={(v) => setPlywood({ stripWidth: v })} /></Field>
          <Field label="Відступ від краю, мм" hint="КП-3 — 1 приклад"><NumInput value={params.edgeOffset} min={0} onChange={(v) => setPlywood({ edgeOffset: v })} /></Field>
          <Field label="Крок ребер, мм" hint="КП-5 — ГІПОТЕЗА 380–560"><NumInput value={params.ribStep} min={100} step={10} onChange={(v) => setPlywood({ ribStep: v })} /></Field>
          <Field label="Крок біля вирізів, мм" hint="КП-5 — ГІПОТЕЗА 200–290"><NumInput value={params.ribStepNearCutout} min={50} step={10} onChange={(v) => setPlywood({ ribStepNearCutout: v })} /></Field>
          <Field label="Підворот, мм" hint="ПВ-1 — 18, не 30"><NumInput value={params.turnHeight} min={0} onChange={(v) => setPlywood({ turnHeight: v })} /></Field>
          <button type="button" className={`${BTN_IDLE} mt-2`} onClick={() => setPlywood(PLYWOOD_DEFAULTS)}>Скинути до обучалочки</button>
        </Panel>
      </aside>

      {current && (
        <PlywoodDetail
          key={current.detail.id}
          outline={current}
          edgeHeightMm={edgeHeight[current.detail.id]}
          onEdgeHeight={(v) => setEdgeHeight((m) => ({ ...m, [current.detail.id]: v }))}
          forced={Boolean(force[current.detail.id])}
          onForce={(v) => {
            setForce((m) => ({ ...m, [current.detail.id]: v }));
            addDecision({ tab: 'plywood', detailId: current.detail.id, what: `${v ? 'Додано' : 'Прибрано'} підклад руками для «${current.productName}»`, why: v ? 'борт/профіль поза списком КП-7' : 'підклад не потрібен', rule: 'КП-8' });
          }}
        />
      )}
    </div>
  );
}

function PlywoodDetail({ outline, edgeHeightMm, onEdgeHeight, forced, onForce }: {
  outline: ReturnType<typeof productOutlines>[number];
  edgeHeightMm: number | undefined;
  onEdgeHeight: (v: number) => void;
  forced: boolean;
  onForce: (v: boolean) => void;
}) {
  const params = useConstructorStore((s) => s.plywood);
  const d = outline.detail;
  const need = needsSubstrate(d, edgeHeightMm);
  const show = need.needed || forced;
  const eh = edgeHeightMm ?? (d.thickening?.enabled ? d.thickness + (d.thickening.size || 0) : d.thickness);
  const thick = plywoodThickness(eh, d.thickness);

  const xs = outline.local.map((p) => p.x); const ys = outline.local.map((p) => p.y);
  const minX = Math.min(...xs); const minY = Math.min(...ys);
  const W = Math.max(...xs) - minX; const H = Math.max(...ys) - minY;

  const cutouts: CutoutRect[] = Object.values(d.geometry.cutouts ?? {}).map((c) => {
    const w = c.shape === 'circle' ? (c.radius ?? 0) * 2 : (c.width ?? 0);
    const h = c.shape === 'circle' ? (c.radius ?? 0) * 2 : (c.height ?? 0);
    return { x: c.x - w / 2 - minX, y: c.y - h / 2 - minY, w, h, label: c.type === 'faucet' ? 'змішувач' : c.type === 'socket' ? 'розетка' : 'виріз' };
  });
  // Мийки-доповнення теж «кліщі» (КП-6) — у v1 беремо лише вирізи на самій деталі
  const layout = useMemo(() => buildPlywoodLayout(W, H, params, cutouts, thick), [W, H, params, cutouts, thick]);

  const pad = 60;
  return (
    <div className="flex-1 min-w-0 flex">
      <div className="flex-1 min-w-0 bg-white p-3 flex flex-col">
        <div className="flex items-center gap-3 text-[13px] mb-2">
          <span className="font-bold text-slate-800">{outline.productName}</span>
          <span className="text-slate-500">{d.type}, плита {d.thickness} мм</span>
          <Tag tone={show ? 'amber' : 'slate'}>{need.reason}</Tag>
        </div>
        <svg viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`} className="flex-1 min-h-0 w-full">
          <polygon points={outline.local.map((p) => `${p.x - minX},${p.y - minY}`).join(' ')} fill="#f8fafc" stroke="#0f172a" strokeWidth={3} />
          {cutouts.map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="8 6" />)}
          {show && layout.parts.map((r, i) => (
            <g key={i}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.kind === 'strip' ? 'rgba(217,119,6,0.35)' : r.kind === 'clamp' ? 'rgba(220,38,38,0.30)' : 'rgba(217,119,6,0.20)'} stroke="#b45309" strokeWidth={1.5} />
              <text x={r.x + r.w / 2} y={r.y + r.h / 2} fontSize={Math.min(22, Math.max(10, W / 60))} textAnchor="middle" dominantBaseline="middle" fill="#7c2d12" transform={r.h > r.w ? `rotate(-90 ${r.x + r.w / 2} ${r.y + r.h / 2})` : undefined}>{Math.round(Math.max(r.w, r.h))}</text>
            </g>
          ))}
          <text x={W / 2} y={-pad / 3} fontSize={Math.max(14, W / 50)} textAnchor="middle" fill="#334155">{Math.round(W)}</text>
          <text x={-pad / 3} y={H / 2} fontSize={Math.max(14, W / 50)} textAnchor="middle" fill="#334155" transform={`rotate(-90 ${-pad / 3} ${H / 2})`}>{Math.round(H)}</text>
        </svg>
      </div>
      <aside className="w-[340px] shrink-0 border-l border-slate-200 bg-[#f7f9fb] overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
        <Panel title="Борт і товщина">
          <Field label="Висота кромки, мм" hint="КП-8: ознака — висота борту, не матеріал"><NumInput value={eh} min={d.thickness} onChange={onEdgeHeight} /></Field>
          <Field label="Фанера (КП-1), мм"><span className="font-semibold text-slate-800">{thick > 0 ? thick : '—'}</span></Field>
          <label className="flex items-center gap-2 text-[12.5px] text-slate-600 mt-1">
            <input type="checkbox" className="!w-4 !h-4 shrink-0 !m-0" checked={forced} onChange={(e) => onForce(e.target.checked)} /> підклад потрібен (руками)
          </label>
        </Panel>
        {show && (
          <Panel title="Специфікація (ТБ-1)">
            <table className="w-full text-[12px]">
              <thead><tr className="text-slate-400 text-left"><th className="py-0.5">№</th><th>Назва</th><th className="text-right">Розмір</th><th className="text-right">К-сть</th></tr></thead>
              <tbody>
                {layout.table.map((r) => (
                  <tr key={r.no} className="border-t border-slate-100"><td className="py-0.5 text-slate-400">{r.no}</td><td>{r.name}</td><td className="text-right">{r.size}</td><td className="text-right">{r.qty}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="text-[11.5px] text-slate-500 mt-2">Матеріал: {layout.table[0]?.material ?? '—'}. Ребра «в кліщі» біля вирізів — червоним (КП-6).</div>
            {layout.notes.map((n, i) => <div key={i} className="text-[11.5px] text-amber-700 mt-1">{n}</div>)}
          </Panel>
        )}
      </aside>
    </div>
  );
}

export default PlywoodTab;
