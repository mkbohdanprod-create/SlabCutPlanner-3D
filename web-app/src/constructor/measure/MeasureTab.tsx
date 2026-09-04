/**
 * ВКЛАДКА «ЗАМІР» — 04.09.2026.
 *
 * Підвантажили DXF з Leica — він відмалювався. Ліворуч: файл, шари,
 * що відкинули; праворуч: ланцюги (стіни) з довжинами і кутами, не-90°
 * підсвічені (КС-14: 89,14–90,64° — норма життя, а не помилка приладу).
 * «Прийняти як приміщення» — стіни з контуру тим самим інструментом,
 * що й вкладка «Приміщення» (`wallsFromContour`), у `project.room`.
 */
import { useMemo, useRef, useState } from 'react';
import { Upload, Home, Trash2 } from 'lucide-react';
import { useConstructorStore } from '../store';
import { parseLeicaDxf, roomContourOf, type MeasureModel } from './leicaDxf';
import { useProjectStore } from '../../store/useProjectStore';
import { ROOM_DEFAULTS, emptyRoom, wallsFromContour } from '../../domain/room';
import { BTN_BLUE, BTN_IDLE, Empty, Panel, Tag, fmt } from '../ui';
import { MeasureSvg } from './MeasureSvg';

export function MeasureTab() {
  const measure = useConstructorStore((s) => s.measure);
  const setMeasure = useConstructorStore((s) => s.setMeasure);
  const addDecision = useConstructorStore((s) => s.addDecision);
  const updateProject = useProjectStore((s) => s.updateProject);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    try {
      const text = await file.text();
      const model = parseLeicaDxf(text, file.name);
      if (model.segments.length === 0 && model.heights.length === 0) {
        setError('У файлі не знайшлось жодного відрізка на робочих шарах — це точно замір?');
      } else {
        setError(null);
      }
      setMeasure(model);
      setHidden(new Set());
    } catch (e) {
      setError(`Не прочитав файл: ${(e as Error).message}`);
    }
  };

  const room = useMemo(() => (measure ? roomContourOf(measure) : undefined), [measure]);

  const acceptAsRoom = () => {
    if (!room) return;
    const contour = room.points.map((p) => ({ x: p.x, y: -p.y }));
    const solids = wallsFromContour(contour, ROOM_DEFAULTS.wallThicknessMm, ROOM_DEFAULTS.wallHeightMm, { floor: true });
    updateProject({ room: { ...emptyRoom(), solids } });
    addDecision({ tab: 'measure', what: `Прийнято контур заміру як приміщення (${room.points.length} вершин, ${fmt(room.lengthMm / 1000, 2)} м)`, why: 'замір із приладу — джерело правди про стіни (ЗМ-Т1)', rule: 'ЗМ-Т1' });
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-[300px] shrink-0 border-r border-slate-200 bg-[#f7f9fb] p-3 overflow-y-auto custom-scrollbar flex flex-col gap-3">
        <Panel title="Файл заміру">
          <input ref={inputRef} type="file" accept=".dxf,.DXF" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
          <button type="button" className={`${BTN_BLUE} w-full justify-center`} onClick={() => inputRef.current?.click()}>
            <Upload className="w-4 h-4" /> Підвантажити DXF (Leica)
          </button>
          {measure && (
            <div className="mt-2 text-[12.5px] text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800 break-all">{measure.fileName}</div>
              <div>Варіант: <Tag tone="blue">{variantLabel(measure.variant)}</Tag></div>
              <div>Відрізків: {measure.segments.length} · дуг: {measure.segments.filter((s) => s.arc).length}</div>
              <div>Ланцюгів: {measure.chains.length} · міток: {measure.marks.length}</div>
              {measure.heights.length > 0 && <div>Карта висот: {measure.heights.length} точок (ЗМ-Т9)</div>}
              {measure.frames > 0 && <div>Рамок кадру: {measure.frames}, дублів прибрано: {measure.dedupedSegments} (ЗМ-Т3)</div>}
              <div>Габарит: {fmt(measure.bbox.maxX - measure.bbox.minX, 0)} × {fmt(measure.bbox.maxY - measure.bbox.minY, 0)} мм</div>
              <button type="button" className={`${BTN_IDLE} mt-1`} onClick={() => setMeasure(null)}><Trash2 className="w-3.5 h-3.5" /> Прибрати замір</button>
            </div>
          )}
          {error && <div className="mt-2 text-[12.5px] text-rose-600">{error}</div>}
        </Panel>

        {measure && (
          <Panel title="Шари">
            <ul className="m-0 p-0 list-none space-y-1 text-[12.5px]">
              {measure.layers.map((layer) => {
                const count = measure.segments.filter((s) => s.layer === layer).length;
                const on = !hidden.has(layer);
                return (
                  <li key={layer} className="flex items-center gap-2">
                    <input type="checkbox" className="!w-4 !h-4 shrink-0 !m-0" checked={on} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(layer)) n.delete(layer); else n.add(layer); return n; })} />
                    <span className="flex-1 truncate" title={layer}>{layer}</span>
                    <span className="text-slate-400">{count}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        {measure && measure.dropped.length > 0 && (
          <Panel title="Відкинуто (службове)">
            <ul className="m-0 p-0 list-none space-y-1 text-[12px] text-slate-500">
              {measure.dropped.map((d) => (
                <li key={d.layer}><span className="text-slate-700">{d.layer}</span> ×{d.count} — {d.reason}</li>
              ))}
            </ul>
          </Panel>
        )}

        {room && (
          <Panel title="Приміщення">
            <div className="text-[12.5px] text-slate-600 mb-2">
              Закритий контур на «{room.layer}»: {room.points.length} вершин, периметр {fmt(room.lengthMm / 1000, 2)} м
            </div>
            <button type="button" className={`${BTN_IDLE} w-full justify-center`} onClick={acceptAsRoom} title="Стіни з контуру — у вкладку «Приміщення» і 3D">
              <Home className="w-4 h-4" /> Прийняти як приміщення
            </button>
          </Panel>
        )}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {!measure ? (
          <Empty>
            <p className="font-semibold text-slate-700 mb-1">Заміру ще немає</p>
            <p>Підвантаж DXF з Leica iCON (2D-файл — основний вхід, ФР-1). Рамки кадру, Level і MchOrg відкинуться самі, дублі площин — теж.</p>
          </Empty>
        ) : (
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 bg-white">
              <MeasureSvg model={measure} hiddenLayers={hidden} />
            </div>
            <ChainsTable model={measure} />
          </div>
        )}
      </div>
    </div>
  );
}

function variantLabel(v: MeasureModel['variant']) {
  return v === 'polylines' ? 'полілінії (2D)' : v === 'external-internal' ? 'External/Internal' : v === 'zlines' ? 'один файл + ZLines' : 'невідомий';
}

function ChainsTable({ model }: { model: MeasureModel }) {
  const chains = model.chains.slice(0, 40);
  return (
    <aside className="w-[340px] shrink-0 border-l border-slate-200 bg-[#f7f9fb] overflow-y-auto custom-scrollbar p-3">
      <h3 className="text-[13px] font-bold text-slate-700 m-0 mb-2">Ланцюги і кути</h3>
      <p className="text-[11.5px] text-slate-500 mt-0 mb-2">Зшито за близькістю кінців (1,5 мм). Це чернетка, не затверджений контур (НЕ-3). Кути ≠ 90° ± 0,5 підсвічені.</p>
      {chains.map((c) => {
        const odd = c.cornerAngles.filter((a) => a !== undefined && Math.abs(a - 90) > 0.5 && Math.abs(a - 180) > 0.5);
        return (
          <details key={c.id} className="mb-1.5 bg-white border border-slate-200 rounded" open={c.closed}>
            <summary className="cursor-pointer px-2 py-1 text-[12.5px] flex items-center gap-2">
              <span className="font-semibold text-slate-800">{c.layer}</span>
              <span className="text-slate-500">{c.points.length} т. · {fmt(c.lengthMm / 1000, 2)} м</span>
              {c.closed && <Tag tone="green">закритий</Tag>}
              {odd.length > 0 && <Tag tone="amber">{odd.length} кут{odd.length === 1 ? '' : 'и'} ≠ 90°</Tag>}
            </summary>
            <table className="w-full text-[11.5px] border-t border-slate-100">
              <tbody>
                {c.points.map((p, i) => {
                  const next = c.points[(i + 1) % c.points.length];
                  const len = (i < c.points.length - 1 || c.closed) ? Math.hypot(next.x - p.x, next.y - p.y) : undefined;
                  const a = c.cornerAngles[i];
                  const off = a !== undefined && Math.abs(a - 90) > 0.5 && Math.abs(a - 180) > 0.5;
                  return (
                    <tr key={i} className={off ? 'bg-amber-50' : ''}>
                      <td className="px-2 py-0.5 text-slate-400">{i + 1}</td>
                      <td className="px-1 py-0.5 text-right">{fmt(p.x, 0)}</td>
                      <td className="px-1 py-0.5 text-right">{fmt(p.y, 0)}</td>
                      <td className="px-1 py-0.5 text-right text-slate-600">{len !== undefined ? fmt(len, 0) : ''}</td>
                      <td className={`px-2 py-0.5 text-right ${off ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>{a !== undefined ? `${fmt(a, 2)}°` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        );
      })}
    </aside>
  );
}

export default MeasureTab;
