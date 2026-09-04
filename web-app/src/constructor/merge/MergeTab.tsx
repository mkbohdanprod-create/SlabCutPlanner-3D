/**
 * ВКЛАДКА «ЗВЕДЕННЯ» — 04.09.2026.
 *
 * Шари: замір / виріб / приміщення / фанера / метал — вмикаються
 * окремо і зводяться на одному полотні у координатах заміру. Виріб
 * ставиться зсувом і поворотом (кліком по полотну — кут виробу в точку),
 * «Лист розбіжностей» показує кожну сторону проти найближчої стіни.
 * «Підігнати до стіни» переносить кінці сторони на пряму стіни через
 * customPoints тієї самої деталі — нативний метод, як у 2D-редакторі
 * (власник: «конструктор повинен схожим нативним методом підігнати
 * замовлення під замір»). Кожне таке рішення — з причиною у журнал (§10).
 */
import { useEffect, useMemo, useState } from 'react';
import { Crosshair, RotateCw, Wand2 } from 'lucide-react';
import { useConstructorStore, placementOf, type MergeLayer } from '../store';
import { useProjectStore } from '../../store/useProjectStore';
import { MeasureSvg, WText } from '../measure/MeasureSvg';
import { bboxOfPoints, productOutlines, toLocal, withCustomPoints, type ProductOutline } from '../geometry';
import { discrepancySheet, fitSideToWall, worldToCustomPoints, type SideDiff } from './discrepancy';
import { BTN_BLUE, BTN_IDLE, Field, NumInput, Panel, Tag, fmt } from '../ui';
import { buildPlywoodLayout, needsSubstrate } from '../plywood/plywoodRules';

const LAYER_LABELS: Record<MergeLayer, string> = {
  measure: 'Замір', product: 'Виріб', room: 'Приміщення', plywood: 'Фанера', metal: 'Метал',
};

export function MergeTab() {
  const measure = useConstructorStore((s) => s.measure);
  const placements = useConstructorStore((s) => s.placements);
  const setPlacement = useConstructorStore((s) => s.setPlacement);
  const layers = useConstructorStore((s) => s.layers);
  const toggleLayer = useConstructorStore((s) => s.toggleLayer);
  const toleranceMm = useConstructorStore((s) => s.toleranceMm);
  const setTolerance = useConstructorStore((s) => s.setTolerance);
  const addDecision = useConstructorStore((s) => s.addDecision);
  const plywood = useConstructorStore((s) => s.plywood);
  const project = useProjectStore((s) => s.project);
  const updateProduct = useProjectStore((s) => s.updateProduct);

  const products = project.products ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(products[0]?.id ?? null);
  const [placeMode, setPlaceMode] = useState(false);
  const [why, setWhy] = useState('');
  const selected = products.find((p) => p.id === selectedId) ?? products[0] ?? null;

  const outlines = useMemo(() => productOutlines(project, placements), [project, placements]);
  // Перший показ: виріб без зсуву висів би під віссю X (Y деталі вниз →
  // світ угору). Ставимо його лівим-верхнім кутом у (0, H), щоб лежав у
  // додатній чверті поруч із заміром — далі людина рухає сама.
  useEffect(() => {
    for (const o of outlines) {
      if (placements[o.productId]) continue;
      const ys = o.local.map((p) => p.y); const xs = o.local.map((p) => p.x);
      setPlacement(o.productId, { dx: -Math.min(...xs), dy: Math.max(...ys) - Math.min(...ys), rotDeg: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlines.map((o) => o.productId).join('|')]);
  const sheet = useMemo(() => discrepancySheet(outlines, measure, toleranceMm), [outlines, measure, toleranceMm]);
  const extraBox = useMemo(() => (outlines.length ? bboxOfPoints(outlines.flatMap((o) => o.world)) : null), [outlines]);

  const onWorldClick = (p: { x: number; y: number }) => {
    if (!placeMode || !selected) return;
    setPlacement(selected.id, { dx: p.x, dy: p.y });
    setPlaceMode(false);
  };

  const fit = (d: SideDiff) => {
    if (!d.wall) return;
    const o = outlines.find((x) => x.detail.id === d.detailId);
    const product = products.find((x) => x.id === d.productId);
    if (!o || !product) return;
    const next = fitSideToWall(o.world, d.side.index, d.wall);
    if (!next) { window.alert('Стіна паралельна сусідній стороні — перетину немає, підганяй руками.'); return; }
    const placement = placementOf(placements, product.id);
    const points = worldToCustomPoints(o.local, next, (w) => toLocal(w, placement));
    // Ядро нормалізує customPoints до початку координат (normalizePoints):
    // компенсуємо зсув у placement, щоб виріб не стрибнув на полотні.
    const minX = Math.min(...points.map((p) => p.x)); const minY = Math.min(...points.map((p) => p.y));
    if (Math.abs(minX) > 1e-6 || Math.abs(minY) > 1e-6) {
      const rad = (placement.rotDeg * Math.PI) / 180; const c = Math.cos(rad); const sn = Math.sin(rad);
      const lx = minX; const ly = -minY;
      setPlacement(product.id, { dx: placement.dx + lx * c - ly * sn, dy: placement.dy + lx * sn + ly * c });
    }
    updateProduct(product.id, withCustomPoints(product, o.detail.id, points, o.sideNames));
    addDecision({
      tab: 'merge', detailId: o.detail.id, rule: 'КС-14',
      what: `Сторона ${d.side.name} «${o.productName}» підігнана до стіни (${fmt(d.gapA, 1)} / ${fmt(d.gapB, 1)} мм, кут ${fmt(d.angleDeg, 2)}°)`,
      why: why.trim() || 'стіна за заміром не під 90°, виріб має повторити стіну',
    });
    setWhy('');
  };

  const roomContour = useMemo(() => {
    const solids = project.room?.solids ?? [];
    // План приміщення: тіла з полігоном у плані (стіни, підлога); Y плану вниз → світ Y вгору
    return solids
      .filter((s) => s.role !== 'floor' && s.points.length > 2)
      .map((s) => s.points.map((p) => ({ x: p.x, y: -p.y })));
  }, [project.room]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-[300px] shrink-0 border-r border-slate-200 bg-[#f7f9fb] p-3 overflow-y-auto custom-scrollbar flex flex-col gap-3">
        <Panel title="Шари">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(LAYER_LABELS) as MergeLayer[]).map((l) => (
              <button key={l} type="button" onClick={() => toggleLayer(l)} className={layers[l] ? BTN_BLUE : BTN_IDLE}>{LAYER_LABELS[l]}</button>
            ))}
          </div>
          {!measure && <p className="text-[12px] text-slate-500 mt-2 mb-0">Заміру немає — підвантаж у вкладці «Замір». Вироби все одно видно.</p>}
        </Panel>

        <Panel title="Виріб">
          {products.length === 0 ? (
            <p className="text-[12.5px] text-slate-500 m-0">У проєкті немає виробів. Додай у «2D Розкрій» → «Додати виріб».</p>
          ) : (
            <>
              <select value={selected?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)} className="w-full h-8 border border-slate-300 rounded px-2 text-[13px] bg-white mb-2">
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {selected && (() => {
                const pl = placementOf(placements, selected.id);
                return (
                  <>
                    <Field label="Зсув X, мм"><NumInput value={pl.dx} step={10} onChange={(v) => setPlacement(selected.id, { dx: v })} /></Field>
                    <Field label="Зсув Y, мм"><NumInput value={pl.dy} step={10} onChange={(v) => setPlacement(selected.id, { dy: v })} /></Field>
                    <Field label="Поворот, °"><NumInput value={pl.rotDeg} step={0.5} onChange={(v) => setPlacement(selected.id, { rotDeg: v })} /></Field>
                    <div className="flex gap-1.5 mt-2">
                      <button type="button" className={placeMode ? BTN_BLUE : BTN_IDLE} onClick={() => setPlaceMode((v) => !v)} title="Клік по полотну ставить лівий верхній кут виробу в точку">
                        <Crosshair className="w-4 h-4" /> {placeMode ? 'Клікни точку…' : 'Поставити кліком'}
                      </button>
                      <button type="button" className={BTN_IDLE} onClick={() => setPlacement(selected.id, { rotDeg: (pl.rotDeg + 90) % 360 })} title="+90°">
                        <RotateCw className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </Panel>

        <Panel title="Допуск">
          <Field label="По стіні, ± мм" hint="Сторона далі за допуск — «не по стіні»"><NumInput value={toleranceMm} min={0} step={0.5} onChange={setTolerance} /></Field>
          <label className="block text-[12px] text-slate-500 mt-2">
            Причина для наступного рішення
            <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} placeholder="чому підганяємо саме так…" className="w-full mt-1 border border-slate-300 rounded p-1.5 text-[12.5px] bg-white" />
          </label>
        </Panel>
      </aside>

      <div className="flex-1 min-w-0 bg-white">
        <MeasureSvg model={layers.measure ? measure : null} extraBox={extraBox} onWorldClick={onWorldClick}>
          {layers.room && roomContour.map((pts, i) => (
            <polygon key={`room${i}`} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#94a3b8" strokeWidth={4} strokeDasharray="20 10" />
          ))}
          {layers.product && outlines.map((o) => <OutlineShape key={o.detail.id} o={o} selected={o.productId === selected?.id} sheet={sheet} />)}
          {layers.plywood && outlines.map((o) => <PlywoodShape key={`pw${o.detail.id}`} o={o} params={plywood} />)}
        </MeasureSvg>
      </div>

      <aside className="w-[380px] shrink-0 border-l border-slate-200 bg-[#f7f9fb] overflow-y-auto custom-scrollbar p-3">
        <h3 className="text-[13px] font-bold text-slate-700 m-0 mb-1">Лист розбіжностей</h3>
        <p className="text-[11.5px] text-slate-500 mt-0 mb-2">Кожна сторона виробу проти найближчої стіни заміру (радіус пошуку 120 мм). Рішення — за тобою (НЕ-3).</p>
        {sheet.length === 0 && <p className="text-[12.5px] text-slate-500">Немає що звіряти: потрібні виріб і замір.</p>}
        {outlines.map((o) => {
          const rows = sheet.filter((d) => d.detailId === o.detail.id);
          if (!rows.length) return null;
          return (
            <div key={o.detail.id} className="mb-3 bg-white border border-slate-200 rounded">
              <div className="px-2 py-1 text-[12.5px] font-semibold text-slate-800 border-b border-slate-100">{o.productName} · {o.detail.type}</div>
              <table className="w-full text-[11.5px]">
                <thead><tr className="text-slate-400"><th className="text-left px-2 py-0.5">Стор.</th><th className="text-right">Довж.</th><th className="text-right">Δ поч.</th><th className="text-right">Δ кін.</th><th className="text-right">Кут</th><th></th></tr></thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.side.name} className={d.status === 'off' ? 'bg-rose-50' : d.status === 'ok' ? 'bg-emerald-50/50' : ''}>
                      <td className="px-2 py-0.5 font-semibold">{d.side.name}</td>
                      <td className="text-right px-1">{fmt(d.side.lengthMm, 0)}</td>
                      <td className="text-right px-1">{fmt(d.gapA, 1)}</td>
                      <td className="text-right px-1">{fmt(d.gapB, 1)}</td>
                      <td className="text-right px-1">{d.angleDeg !== undefined ? `${fmt(d.angleDeg, 2)}°` : '—'}</td>
                      <td className="text-right px-1 py-0.5">
                        {d.status === 'nowall' ? <Tag>вільна</Tag> : d.status === 'ok' ? <Tag tone="green">ок</Tag> : (
                          <button type="button" className={`${BTN_IDLE} !h-6 !px-1.5 !text-[11px]`} onClick={() => fit(d)} title="Кінці сторони — на пряму стіни, сусідні сторони — на перетин">
                            <Wand2 className="w-3 h-3" /> до стіни
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        <DecisionsLog />
      </aside>
    </div>
  );
}

function OutlineShape({ o, selected, sheet }: { o: ProductOutline; selected: boolean; sheet: SideDiff[] }) {
  const pts = o.world.map((p) => `${p.x},${p.y}`).join(' ');
  const isMetal = Boolean(o.detail.geometry?.metalProfileId);
  const stroke = isMetal ? '#7c3aed' : selected ? '#1f93ef' : '#0f172a';
  const c = centroid(o.world);
  const bb = bboxOfPoints(o.world);
  const fs = Math.max(30, Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) / 28);
  return (
    <g>
      <polygon points={pts} fill={isMetal ? 'rgba(124,58,237,0.08)' : 'rgba(31,147,239,0.10)'} stroke={stroke} strokeWidth={selected ? 5 : 3} />
      {o.world.map((p, i) => {
        const n = o.world.length;
        const q = o.world[(i + 1) % n];
        const name = o.sideNames[i] ?? '';
        const d = sheet.find((x) => x.detailId === o.detail.id && x.side.index === (i + 1) % n);
        const mx = (p.x + q.x) / 2; const my = (p.y + q.y) / 2;
        const color = d?.status === 'off' ? '#e11d48' : d?.status === 'ok' ? '#15803d' : '#475569';
        return <WText key={i} x={mx} y={my} size={fs} fill={color} anchor="middle" weight="bold">{name}</WText>;
      })}
      <WText x={c.x} y={c.y} size={fs * 0.9} fill="#334155" anchor="middle">{o.productName}</WText>
    </g>
  );
}

function PlywoodShape({ o, params }: { o: ProductOutline; params: ReturnType<typeof useConstructorStore.getState>['plywood'] }) {
  const need = needsSubstrate(o.detail);
  if (!need.needed) return null;
  const b = bboxOfPoints(o.local.map((p) => ({ x: p.x, y: p.y })));
  const layout = buildPlywoodLayout(b.maxX - b.minX, b.maxY - b.minY, params, [], 0);
  // локальні (Y вниз) → світові через ту саму трансформацію, що й контур
  return (
    <g>
      {layout.parts.map((r, i) => {
        const corners = [
          { x: b.minX + r.x, y: b.minY + r.y }, { x: b.minX + r.x + r.w, y: b.minY + r.y },
          { x: b.minX + r.x + r.w, y: b.minY + r.y + r.h }, { x: b.minX + r.x, y: b.minY + r.y + r.h },
        ];
        const w = toWorldLike(o, corners);
        return <polygon key={i} points={w.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(217,119,6,0.25)" stroke="#d97706" strokeWidth={1.5} />;
      })}
    </g>
  );
}

/** Ту саму трансформацію, що дала o.world з o.local, застосовуємо до інших локальних точок. */
function toWorldLike(o: ProductOutline, pts: Array<{ x: number; y: number }>) {
  // Розв'язуємо афінне перетворення з перших двох точок контуру (поворот + зсув, без масштабу)
  const l0 = o.local[0]; const l1 = o.local[1]; const w0 = o.world[0]; const w1 = o.world[1];
  const la = Math.atan2(-(l1.y - l0.y), l1.x - l0.x);
  const wa = Math.atan2(w1.y - w0.y, w1.x - w0.x);
  const rot = wa - la;
  const c = Math.cos(rot); const s = Math.sin(rot);
  return pts.map((p) => {
    const x = p.x - l0.x; const y = -(p.y - l0.y);
    return { x: w0.x + x * c - y * s, y: w0.y + x * s + y * c };
  });
}

function centroid(pts: Array<{ x: number; y: number }>) {
  const n = pts.length || 1;
  return { x: pts.reduce((a, p) => a + p.x, 0) / n, y: pts.reduce((a, p) => a + p.y, 0) / n };
}

export function DecisionsLog() {
  const decisions = useConstructorStore((s) => s.decisions);
  const remove = useConstructorStore((s) => s.removeDecision);
  if (!decisions.length) return null;
  return (
    <div className="mt-2">
      <h4 className="text-[12.5px] font-bold text-slate-700 m-0 mb-1">Журнал рішень ({decisions.length})</h4>
      <ul className="m-0 p-0 list-none space-y-1">
        {decisions.slice().reverse().map((d) => (
          <li key={d.id} className="bg-white border border-slate-200 rounded px-2 py-1 text-[11.5px]">
            <div className="flex items-start gap-1">
              <span className="flex-1 text-slate-800">{d.what}</span>
              <button type="button" className="!border-0 !bg-transparent !p-0 text-slate-400 hover:text-rose-600" onClick={() => remove(d.id)} title="Прибрати запис">×</button>
            </div>
            <div className="text-slate-500">чому: {d.why} {d.rule && <Tag>{d.rule}</Tag>}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MergeTab;
