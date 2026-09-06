/**
 * ВКЛАДКА «ЦЕХ» (MES v0) — 06.09.2026. Пасхалка Студії поруч із
 * Конструктором. Карта цеху 202 (ізометрія) + навантаження на п'яти
 * живих заявках 1С за умовними нормами. План:
 * 12_ВИРОБНИЦТВО_І_МЕС/04_ПЛАН_MES_ФУНДАМЕНТ_04-09.md, етапи E1–E3.
 *
 * Логіка — `sim.ts` (без React), дані — `data/*`, малювання — `render.ts`.
 * Усе, що порахованo на умовних нормах, підписане «УМОВНО».
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AREAS, STAGES, HALL, FLOW, BRANCH, REVERSE, type ShopArea } from './data/shopMap';
import { ORDERS } from './data/orders';
import { SIM_AREAS, AREA_OBJ, UNITS, DEFAULT_NORMS, DEFAULT_FUND, cloneNorms, type Norms, type Fund, type SimArea } from './data/norms';
import { simulate, unmappedLines, type Mix } from './sim';
import { renderShopSvg, KIND } from './render';
import { BTN_IDLE, Panel, Tag } from '../constructor/ui';

const f0 = (v: number) => (Number.isFinite(v) ? v.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) : '∞');
const f1 = (v: number) => (Number.isFinite(v) ? v.toLocaleString('uk-UA', { maximumFractionDigits: 1 }) : '∞');
const RED = '#c0262b';

const STYLE = `
.mes-root { --paper:#f7f8fa; --ink:#1c2430; --muted:#5c6878; --line:#c5ccd6; --grid:#dfe4ea; --floor:#e4e8ed; --stage:rgba(62,92,138,.06);
  --machine-top:#7f9bc4; --machine-l:#4f6d9a; --machine-r:#3b5680; --machine-edge:#2b4266;
  --manual-top:#d3b58a; --manual-l:#b08c58; --manual-r:#8e6e42; --manual-edge:#6b5230;
  --buffer-top:#f2c94c; --buffer-l:#d9a52a; --buffer-r:#b4841a; --buffer-edge:#8a6410;
  --slab:#9aa7b6; --slab-edge:#6b7686; --control-top:#b9cfc0; --control-l:#8fae98; --control-r:#6f8f78; --control-edge:#4f6d58;
  --store-top:#c9c2d6; --store-l:#a094b4; --store-r:#7f7494; --store-edge:#5d546e;
  --flow:#1f7a8c; --reverse:#c018b0; --water:#8fc4d8; --accent:#3e5c8a; --sel:#ff9f1c; }
.mes-root svg.shop { display:block; width:100%; height:auto; min-width:980px; font-family: Roboto, "Arial Narrow", sans-serif; }
.mes-root .area { cursor:pointer; }
.mes-root .area .lbl { font-size:11.5px; font-weight:600; fill:var(--ink); paint-order:stroke; stroke:var(--paper); stroke-width:3px; stroke-linejoin:round; }
.mes-root .area .sub { font-size:9.5px; fill:var(--muted); paint-order:stroke; stroke:var(--paper); stroke-width:3px; }
.mes-root .hl { display:none; fill:none; stroke:var(--sel); stroke-width:2.5; stroke-dasharray:5 3; }
.mes-root .area.sel .hl { display:block; }
.mes-root .stagelbl { font-size:13px; font-weight:700; fill:var(--muted); letter-spacing:.06em; }
.mes-root .umov { display:inline-block; font:600 10px/1.3 ui-monospace,monospace; color:#b45309; border:1px solid #b45309; padding:0 4px; border-radius:3px; vertical-align:1px; }
.mes-root input.n { width:58px; height:26px; padding:0 4px; text-align:right; border:1px solid #cbd5e1; border-radius:4px; font-size:12.5px; background:#fff; font-variant-numeric:tabular-nums; }
.mes-root table.t { border-collapse:collapse; width:100%; font-size:12.5px; background:#fff; }
.mes-root table.t th, .mes-root table.t td { border:1px solid #e2e8f0; padding:3px 6px; text-align:left; vertical-align:top; }
.mes-root table.t th { background:#f1f5f9; font-weight:600; }
.mes-root table.t td.n, .mes-root table.t th.n { text-align:right; font-variant-numeric:tabular-nums; }
`;

type Layer = 'grid' | 'flow' | 'rev' | 'names';

export default function MesTab() {
  const [selected, setSelected] = useState<ShopArea | null>(null);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ grid: true, flow: true, rev: true, names: true });
  const [norms, setNorms] = useState<Norms>(() => cloneNorms(DEFAULT_NORMS));
  const [fund, setFund] = useState<Fund>(DEFAULT_FUND);
  const [mix, setMix] = useState<Mix>(() => Object.fromEntries(ORDERS.map((o) => [o.id, { on: true, n: 1 }])));
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const shop = useMemo(() => renderShopSvg(), []);
  const res = useMemo(() => simulate(ORDERS, mix, norms, fund), [mix, norms, fund]);

  // кліки по об'єктах карти — делегування на <svg>
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const onClick = (e: Event) => {
      const g = (e.target as Element).closest('.area') as SVGGElement | null;
      if (!g) return;
      const a = AREAS.find((x) => x.id === g.dataset.id) ?? null;
      setSelected(a);
      svg.querySelectorAll('.area').forEach((el) => el.classList.toggle('sel', el === g));
    };
    svg.addEventListener('click', onClick);
    return () => svg.removeEventListener('click', onClick);
  }, []);

  // шари
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    (['grid', 'flow', 'rev'] as const).forEach((l) => {
      svg.querySelectorAll<SVGGElement>(`[data-layer="${l}"]`).forEach((el) => { el.style.display = layers[l] ? '' : 'none'; });
    });
    svg.querySelectorAll<SVGGElement>('.names').forEach((el) => { el.style.display = layers.names ? '' : 'none'; });
  }, [layers]);

  // тепло і бейджі за результатом симуляції
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    for (const a of SIM_AREAS) {
      const u = res.util[a];
      const over = u > 1;
      for (const id of AREA_OBJ[a]) {
        const heat = svg.querySelector<SVGElement>(`.area[data-id="${id}"] .heat`);
        if (heat) { heat.setAttribute('fill', over ? RED : 'var(--accent)'); heat.setAttribute('fill-opacity', String(over ? 0.55 : Math.min(0.55, 0.08 + u * 0.5))); }
        const b = svg.querySelector<SVGElement>(`.area[data-id="${id}"] .badge`);
        if (b) { b.textContent = `${f0(u * 100)} %`; b.setAttribute('fill', over ? RED : 'var(--accent)'); }
      }
    }
  }, [res]);

  const setNorm = (a: SimArea, k: keyof Norms[SimArea], v: number) => setNorms((n) => ({ ...n, [a]: { ...n[a], [k]: v } }));
  const activeLeads = ORDERS.filter((o) => mix[o.id]?.on).map((o) => res.leadShifts[o.id]);
  const avgLead = activeLeads.length ? activeLeads.reduce((s, v) => s + v, 0) / activeLeads.length : 0;
  const totalHours = SIM_AREAS.reduce((s, a) => s + res.daily[a], 0) / 60;
  const mapJson = useMemo(() => JSON.stringify({ hall_m: HALL, stages: STAGES, areas: AREAS, flow: FLOW, branches: BRANCH, reverse: REVERSE }, null, 2), []);

  // діаграма навантаження (одна серія + контур фонду)
  const chart = (() => {
    const W = 900, rowH = 26, left = 150, right = 170, top = 8;
    const H = top + SIM_AREAS.length * rowH + 8;
    const maxV = Math.max(...SIM_AREAS.map((a) => Math.max(res.daily[a], res.fundMin[a])), 1);
    const sx = (v: number) => left + (v / maxV) * (W - left - right);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Навантаження ділянок за добу проти фонду часу" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {SIM_AREAS.map((a, i) => {
          const y = top + i * rowH, u = res.util[a], over = u > 1;
          return (
            <g key={a}>
              <text x={left - 8} y={y + 17} textAnchor="end" fontSize="12.5" fill="#1c2430">{a}</text>
              <rect x={left} y={y + 5} width={Math.max(0, sx(res.fundMin[a]) - left)} height={16} fill="none" stroke="#c5ccd6" strokeDasharray="3 2" />
              <rect
                x={left} y={y + 5} width={Math.max(0, sx(res.daily[a]) - left)} height={16} rx={3}
                fill={over ? RED : '#3e5c8a'} fillOpacity={over ? 0.85 : 0.75}
                onMouseMove={(e) => {
                  const parts = ORDERS.filter((o) => mix[o.id]?.on && res.perOrder[o.id][a]).map((o) => `${o.id}: ${f0((res.perOrder[o.id][a] ?? 0) * mix[o.id].n)} хв`).join(' · ');
                  setHover({ x: e.clientX, y: e.clientY, text: `${a}: ${f0(res.daily[a])} хв/добу = ${parts || 'нічого'}` });
                }}
                onMouseLeave={() => setHover(null)}
              />
              <text x={Math.max(sx(res.daily[a]), sx(res.fundMin[a])) + 6} y={y + 17} fontSize="12" fill="#1c2430">
                {f0(u * 100)} %{over ? ' ▲' : ''} <tspan fill="#5c6878">· {f0(res.daily[a])} / {f0(res.fundMin[a])} хв</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    );
  })();

  return (
    <div className="mes-root flex-1 overflow-auto bg-slate-100 p-3">
      <style>{STYLE}</style>
      <div className="max-w-[1280px] mx-auto flex flex-col gap-3">
        <header className="flex items-end justify-between gap-4 border-b-2 border-slate-800 pb-2">
          <div>
            <h2 className="text-[26px] font-bold leading-none m-0 text-slate-900">Цех 202 — Васильків · MES v0</h2>
            <p className="text-[13px] text-slate-500 mt-1.5 mb-0">Карта цеху за розкладкою прототипу Smart MES v2.0 (ручні ділянки → їхні буфери → верстати: Breton, Combicut, ЧПУ 1, Поліровка станок, Panda) і навантаження на п'яти живих заявках 1С. Клік по об'єкту — паспорт. Синя тінь і відсоток над ділянкою — її завантаження за добу за <span className="umov">УМОВНО</span> нормами.</p>
          </div>
          <div className="text-[11.5px] font-mono text-slate-500 border border-slate-300 bg-white px-2.5 py-1.5 shrink-0">
            <div>Аркуш <b className="text-slate-800">КЦ-202 · чернетка</b></div>
            <div>Компонування <b className="text-slate-800">ГІПОТЕЗА — виправляє Саша</b></div>
            <div>Норми <b className="text-amber-700">УМОВНО</b></div>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
          {([['flow', 'Потік ВЦ-1'], ['rev', 'Реверси ВЦ-5 / ВЦ-7 / ВЦ-18'], ['grid', 'Сітка 1 м'], ['names', 'Підписи']] as Array<[Layer, string]>).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" className="!w-4 !h-4 !m-0" checked={layers[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} /> {label}
            </label>
          ))}
          <span className="ml-auto flex flex-wrap gap-3 text-[12px] text-slate-500">
            <span><i className="inline-block w-3 h-3 border border-slate-700 mr-1 align-[-1px]" style={{ background: '#7f9bc4' }} />верстат</span>
            <span><i className="inline-block w-3 h-3 border border-slate-700 mr-1 align-[-1px]" style={{ background: '#d3b58a' }} />ручна ділянка</span>
            <span><i className="inline-block w-3 h-3 border border-slate-700 mr-1 align-[-1px]" style={{ background: '#f2c94c' }} />буфер (піраміда / тура)</span>
            <span><i className="inline-block w-3 h-3 border border-slate-700 mr-1 align-[-1px]" style={{ background: '#b9cfc0' }} />контроль / логістика</span>
            <span><i className="inline-block w-3 h-3 border border-slate-700 mr-1 align-[-1px]" style={{ background: '#c9c2d6' }} />склад</span>
          </span>
        </div>

        <figure className="m-0 bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <svg ref={svgRef} className="shop" viewBox={shop.viewBox} role="img" aria-label="Ізометричний план цеху 202" dangerouslySetInnerHTML={{ __html: shop.inner }} />
          <figcaption className="text-[12px] text-slate-500 px-3 py-2 border-t border-slate-200">
            Потік за ВЦ-1: черга на складі → перевірка → буфер в роботу → пили (Breton / Combicut, вода на Combicut) → буфер порізки → ЧПУ 1 → мийки / поклейка крайки / фанера → шліфування → поліровка станок → полірування → косметика → ВТК → пакування → буфер монтаж. Розкладка — з карти прототипу (скрін 06.09); етапи внизу — наша шкала. Пунктир — повернення: мийка на ЧПК (ВЦ-7), плінтус на пилу (ВЦ-18), рекламація з монтажу на пилу (ВЦ-5).
          </figcaption>
        </figure>

        <Panel title={selected ? selected.name : 'Паспорт об\'єкта — клік по верстату, столу або буферу'}>
          {selected ? (
            <div className="grid grid-cols-[110px_1fr_110px_1fr] gap-x-3 gap-y-1 text-[13px]">
              <span className="text-slate-500">Тип</span><span>{KIND[selected.type]} · етап {selected.st} · {STAGES[selected.st - 1].name.toLowerCase()}</span>
              <span className="text-slate-500">Статус</span><span><Tag tone={selected.status === 'ФАКТ' ? 'green' : selected.status === 'ГІПОТЕЗА' ? 'amber' : 'red'}>{selected.status}</Tag></span>
              <span className="text-slate-500">Обладнання</span><span className="col-span-3">{selected.gear}</span>
              <span className="text-slate-500">Місце</span><span>x {selected.x}–{(selected.x + selected.w).toFixed(1)} м · y {selected.y}–{(selected.y + selected.d).toFixed(1)} м{selected.n ? ` · ${selected.n} шт` : ''} <Tag tone="amber">розмір — ГІПОТЕЗА</Tag></span>
              <span className="text-slate-500">Послуг</span><span>{selected.services ? `${selected.services} кодів (02_ПОСЛУГИ_НА_ДІЛЯНКАХ)` : '—'}</span>
              <span className="text-slate-500">Правила</span><span className="col-span-3">{selected.rules.length ? selected.rules.map((r) => <Tag key={r}>{r}</Tag>) : '—'}</span>
              {selected.q && (<><span className="text-slate-500">Питання</span><span className="col-span-3">{selected.q}</span></>)}
            </div>
          ) : (
            <p className="text-[13px] text-slate-500 m-0">Розкладка, назви ділянок і буферів — <b>ФАКТ</b> з карти прототипу Smart MES v2.0 (скрін власника 06.09). Моделі верстатів — з бланку обліку і ЛОГІКА_ОБРОБОК. Розміри в метрах і кількість столів — <b>ГІПОТЕЗА</b>, поки Саша не виправить; об'єкти, яких на карті прототипу немає, позначені ГІПОТЕЗА.</p>
          )}
        </Panel>

        <h3 className="text-[18px] font-bold text-slate-800 mt-3 mb-0">Що виходить для MES: навантаження на живих замовленнях</h3>
        <p className="text-[13px] text-slate-500 m-0 max-w-[80ch]">П'ять заявок 1С із кейсів (22–27 рядків) розкладені по ділянках за кодом послуги (214 кодів: CSV-2026 + бланк обліку). Кількості — <b>ФАКТ</b>. Норми часу — <span className="umov">УМОВНО</span>: заглушки, їх перепише Саша; поки вони стоять, усі хвилини і відсотки — оцінка за умовними нормами. Черг і буферів ця версія не рахує (статика, v0).</p>

        <div className="grid grid-cols-4 gap-2.5 max-md:grid-cols-2">
          {[
            [f1(res.throughput), 'замовлень/добу пропускає цех при цьому міксі', `УМОВНО · обмежує ${res.bottleneck}`],
            [`${f0(res.util[res.bottleneck] * 100)} %`, `вузьке місце — ${res.bottleneck} (${f0(res.daily[res.bottleneck])} хв із ${f0(res.fundMin[res.bottleneck])})`, 'УМОВНО'],
            [`${f1(avgLead)} зм.`, `середній чистий час замовлення в роботі (без черг), змін по ${fund.hours} год`, 'УМОВНО · шлях ВЦ-1'],
            [`${f0(totalHours)} год`, `сумарне навантаження цеху за добу на ${f1(res.nOrders)} замовл.`, 'УМОВНО'],
          ].map(([v, l, m], i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
              <div className="text-[28px] font-bold leading-none tabular-nums text-slate-900">{v}</div>
              <div className="text-[12px] text-slate-500 mt-1">{l}</div>
              <div className="text-[11px] font-mono text-amber-700">{m}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[1.4fr_1fr] gap-3 max-md:grid-cols-1">
          <Panel title="Замовлення в міксі · скільки таких на день">
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-x-2.5 gap-y-1.5 items-center text-[13px]">
              {ORDERS.map((o) => (
                <div key={o.id} className="contents">
                  <input type="checkbox" className="!w-4 !h-4 !m-0" checked={mix[o.id].on} onChange={(e) => setMix((m) => ({ ...m, [o.id]: { ...m[o.id], on: e.target.checked } }))} aria-label={`${o.id} у міксі`} />
                  <b>{o.id}</b>
                  <span className="text-[12px] text-slate-500">{o.customer} · {o.desc} · {o.lines.filter((l) => l.area).length} послуг</span>
                  <span className="whitespace-nowrap">×<input type="number" className="n" min={0} max={50} step={1} value={mix[o.id].n} onChange={(e) => setMix((m) => ({ ...m, [o.id]: { ...m[o.id], n: Math.max(0, +e.target.value || 0) } }))} /> /день</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={<span>Фонд часу ділянки <span className="umov">УМОВНО</span></span>}>
            <div className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1.5 items-center text-[13px]">
              <span>Годин у зміні</span><span><input type="number" className="n" min={1} max={24} step={0.5} value={fund.hours} onChange={(e) => setFund((f) => ({ ...f, hours: +e.target.value || 8 }))} /></span>
              <span>Змін на добу</span><span><input type="number" className="n" min={1} max={3} step={1} value={fund.shifts} onChange={(e) => setFund((f) => ({ ...f, shifts: +e.target.value || 1 }))} /></span>
              <span>Коеф. готовності</span><span><input type="number" className="n" min={0.3} max={1} step={0.05} value={fund.avail} onChange={(e) => setFund((f) => ({ ...f, avail: +e.target.value || 0.85 }))} /> <span className="text-slate-500 text-[12px]">наладка, обід, простої</span></span>
              <span>Одиниць</span><span className="text-slate-500 text-[12px]">2 пили (Breton + Combicut) · 1 ЧПУ · столи за кількістю — у таблиці норм нижче</span>
              <span /><button className={BTN_IDLE} onClick={() => { setNorms(cloneNorms(DEFAULT_NORMS)); setFund(DEFAULT_FUND); }}>Скинути норми до умовних</button>
            </div>
          </Panel>
        </div>

        <Panel title={<span>Навантаження ділянок за добу, хв — заливка: робота за нормами <span className="umov">УМОВНО</span>; пунктир: фонд ({fund.hours} год × {fund.shifts} зм. × одиниць × {fund.avail})</span>}>
          {chart}
        </Panel>

        <div className="overflow-x-auto">
          <table className="t">
            <thead><tr><th>Замовлення</th>{SIM_AREAS.map((a) => <th key={a} className="n">{a}</th>)}<th className="n">Разом, год</th><th className="n">Чистий час, змін</th></tr></thead>
            <tbody>
              {ORDERS.map((o) => {
                const L = res.perOrder[o.id]; const tot = SIM_AREAS.reduce((s, a) => s + (L[a] ?? 0), 0);
                return (
                  <tr key={o.id} style={{ opacity: mix[o.id].on ? 1 : 0.45 }}>
                    <td><b>{o.id}</b><div className="text-[11.5px] text-slate-500">{o.customer} · {o.desc}</div></td>
                    {SIM_AREAS.map((a) => <td key={a} className="n">{L[a] ? f0(L[a] ?? 0) : '—'}</td>)}
                    <td className="n">{f1(tot / 60)}</td><td className="n">{f1(res.leadShifts[o.id])}</td>
                  </tr>
                );
              })}
              <tr><th>Разом за добу (×N)</th>{SIM_AREAS.map((a) => <th key={a} className="n">{f0(res.daily[a])}</th>)}<th className="n">{f1(totalHours)}</th><th /></tr>
              <tr><th>Фонд за добу</th>{SIM_AREAS.map((a) => <th key={a} className="n">{f0(res.fundMin[a])}</th>)}<th /><th /></tr>
            </tbody>
          </table>
        </div>

        <details className="bg-white border border-slate-200 rounded-lg px-3 py-2">
          <summary className="cursor-pointer text-[13px] font-medium">Умовні норми: наладка на замовлення і штучний час по ділянках <span className="umov">УМОВНО — правити тут</span></summary>
          <p className="text-[12.5px] text-slate-500 mt-2">Штучний час — хвилин на одиницю послуги (м.п., м², шт, лист). Наладка — хвилин на кожне замовлення, яке заходить на ділянку (ТЗ §4.3). «Одиниць» — скільки робочих місць / верстатів працюють паралельно.</p>
          <div className="overflow-x-auto">
            <table className="t">
              <thead><tr><th>Ділянка</th><th className="n">Одиниць</th><th className="n">Наладка, хв/замовл.</th>{UNITS.map((u) => <th key={u} className="n">хв / {u}</th>)}</tr></thead>
              <tbody>
                {SIM_AREAS.map((a) => (
                  <tr key={a}>
                    <td>{a}</td>
                    <td className="n"><input type="number" className="n" min={0} step={1} value={norms[a].units} onChange={(e) => setNorm(a, 'units', Math.max(0, +e.target.value || 0))} /></td>
                    <td className="n"><input type="number" className="n" min={0} step={1} value={norms[a].setup} onChange={(e) => setNorm(a, 'setup', Math.max(0, +e.target.value || 0))} /></td>
                    {UNITS.map((u) => <td key={u} className="n"><input type="number" className="n" min={0} step={0.5} value={norms[a][u]} onChange={(e) => setNorm(a, u, Math.max(0, +e.target.value || 0))} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="bg-white border border-slate-200 rounded-lg px-3 py-2">
          <summary className="cursor-pointer text-[13px] font-medium">Рядки заявок без ділянки — мають бути лише матеріали (МЕС-4)</summary>
          <div className="overflow-x-auto mt-2">
            <table className="t">
              <thead><tr><th>Замовлення</th><th>Код</th><th>Рядок</th><th>Од.</th><th className="n">К-сть</th></tr></thead>
              <tbody>{ORDERS.flatMap((o) => unmappedLines(o).map((l) => <tr key={o.id + l.code + l.unit}><td>{o.id}</td><td>{l.code}</td><td>{l.name}</td><td>{l.unit}</td><td className="n">{l.qty ?? ''}</td></tr>))}</tbody>
            </table>
          </div>
        </details>

        <details className="bg-white border border-slate-200 rounded-lg px-3 py-2">
          <summary className="cursor-pointer text-[13px] font-medium">Реєстр об'єктів карти — чекліст для Саші ({AREAS.length})</summary>
          <div className="overflow-x-auto mt-2">
            <table className="t">
              <thead><tr><th>#</th><th>Етап</th><th>Об'єкт</th><th>Тип</th><th>Обладнання / як зроблено</th><th className="n">Послуг</th><th>Правила</th><th>Статус</th><th>Питання</th></tr></thead>
              <tbody>{AREAS.map((a, i) => <tr key={a.id}><td className="n">{i + 1}</td><td>{a.st}</td><td>{a.name}</td><td>{KIND[a.type]}</td><td>{a.gear}</td><td className="n">{a.services ?? ''}</td><td>{a.rules.join(', ')}</td><td><Tag tone={a.status === 'ФАКТ' ? 'green' : a.status === 'ГІПОТЕЗА' ? 'amber' : 'red'}>{a.status}</Tag></td><td>{a.q}</td></tr>)}</tbody>
            </table>
          </div>
        </details>

        <details className="bg-white border border-slate-200 rounded-lg px-3 py-2">
          <summary className="cursor-pointer text-[13px] font-medium">Дані карти (JSON для E1 — ПАСПОРТ_ДІЛЯНОК)</summary>
          <pre className="text-[11.5px] leading-snug max-h-[360px] overflow-auto bg-slate-50 border border-slate-200 p-2 mt-2">{mapJson}</pre>
        </details>
      </div>
      {hover && <div className="fixed z-[50] pointer-events-none bg-slate-900 text-white text-[12px] px-2 py-1 rounded" style={{ left: hover.x + 12, top: hover.y + 12 }}>{hover.text}</div>}
    </div>
  );
}
