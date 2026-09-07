/**
 * ВКЛАДКА «2D РОЗКРІЙ І ДОКУМЕНТИ» — 04.09.2026.
 *
 * Власник: «типу комерційної, але там формуються креслення, тех карта і
 * т. д. з попереднім переглядом». Ліворуч — список документів пакета
 * для цеху, посередині — попередній перегляд, праворуч — інструкції
 * виконавцю (ОФ-ЧВ) і дії: друк, JSON для MES, журнал рішень.
 *
 * Пакет (розділ «Комплект аркушів» ОФ): збиральне креслення виробів,
 * аркуш фанери (якщо є підклад), аркуш металу (МК-1 — окремо), тех карта
 * по ділянках (ВЦ-1), бланк цеху (МЕС-1), JSON для MES.
 */
import React, { useMemo, useState } from 'react';
import { Printer, Download, Copy, Layers, FlaskConical } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useConstructorStore } from '../store';
import { computeEstimate } from '../../engines/estimate';
import { getAllProjectDetails } from '../../store/projectHelpers';
import { buildTechCard } from './techCard';
import { buildMesJson } from './mesJson';
import { AssemblySheet } from './AssemblySheet';
import { DrawingSetView } from './DrawingSetView';
import { buildSampleKitchenProduct, SAMPLE_PROJECT_HEADER, SAMPLE_PRODUCT_NAME } from '../drawing/sampleOrder';
import { needsSubstrate, buildPlywoodLayout } from '../plywood/plywoodRules';
import { DecisionsLog } from '../merge/MergeTab';
import { buildRouteModel, type RouteModel } from './routeMap';
import { PartsRouteTable, RouteLegend, RouteMap } from './RouteView';
import { BTN_BLUE, BTN_IDLE, Empty, Panel, Tag, fmt } from '../ui';

type DocId = 'drawings' | 'assembly' | 'plywood' | 'metal' | 'techcard' | 'shopsheet' | 'mes';

export function DocsTab() {
  const project = useProjectStore((s) => s.project);
  const parts = useProjectStore((s) => s.parts);
  const catalog = useSettingsStore((s) => s.serviceCatalog);
  const getRules = useSettingsStore((s) => s.getRules);
  const mappingOverrides = useSettingsStore((s) => s.mappingOverrides);
  const customRules = useSettingsStore((s) => s.customRules);
  const decisions = useConstructorStore((s) => s.decisions);
  const plywoodParams = useConstructorStore((s) => s.plywood);
  const [doc, setDoc] = useState<DocId>('drawings');
  const [instructions, setInstructions] = useState('');

  const estimate = useMemo(() => {
    const details = getAllProjectDetails(project);
    return computeEstimate(project, parts, { details, catalog, rules: getRules() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, parts, catalog, mappingOverrides, customRules]);

  const card = useMemo(() => buildTechCard(project, estimate), [project, estimate]);
  const details = useMemo(() => getAllProjectDetails(project), [project]);
  const detailById = useMemo(() => new Map(details.map((d) => [d.id, d])), [details]);
  const isMetalPart = (p: (typeof parts)[number]) => Boolean(detailById.get(p.detailId)?.geometry?.metalProfileId);
  const stone = useMemo(() => parts.filter((p) => !isMetalPart(p)), [parts, detailById]); // eslint-disable-line react-hooks/exhaustive-deps
  const metal = useMemo(() => parts.filter((p) => isMetalPart(p)), [parts, detailById]); // eslint-disable-line react-hooks/exhaustive-deps
  const plywood = useMemo(() => stone.filter((p) => { const d = detailById.get(p.detailId); return d ? needsSubstrate(d).needed : false; }), [stone, detailById]);
  /** Накладка фанери на аркуш: рама і ребра в мм деталі, у тому самому масштабі (КП-2…КП-6). */
  const plywoodOverlay = useMemo(() => (ctx: { toSheet: (partId: string, p: { x: number; y: number }) => { x: number; y: number } | null }) => {
    const out: import('../drawing/model').Entity[] = [];
    for (const p of plywood) {
      const src = p.nominalPoints ?? p.points; if (!src?.length) continue;
      const xs = src.map((q) => q.x); const ys = src.map((q) => q.y);
      const W = Math.max(...xs) - Math.min(...xs); const H = Math.max(...ys) - Math.min(...ys);
      const layout = buildPlywoodLayout(W, H, plywoodParams, [], 0);
      for (const r of layout.parts) {
        const pts = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }].map((q) => ctx.toSheet(p.id, q)).filter(Boolean) as Array<{ x: number; y: number }>;
        if (pts.length === 4) out.push({ kind: 'polyline', layer: 'Фанера', rule: 'КП-4', points: pts, closed: true, fill: 'hatch-plywood' });
      }
    }
    return out;
  }, [plywood, plywoodParams]);
  const instrList = instructions.split('\n').map((s) => s.trim()).filter(Boolean);
  const route = useMemo(() => buildRouteModel(project, parts, estimate.facts, {
    hasMetal: metal.length > 0, hasPlywood: plywood.length > 0, slabsUsed: card.header.slabs, areaM2: card.header.areaM2,
  }), [project, parts, estimate.facts, metal.length, plywood.length, card.header.slabs, card.header.areaM2]);
  const mes = useMemo(() => buildMesJson(card, { decisions, hasMetal: metal.length > 0, hasPlywood: plywood.length > 0, instructions: instrList, loops: route.loops }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card, decisions, metal.length, plywood.length, instructions, route]);

  const docs: Array<{ id: DocId; label: string; hint: string; available: boolean }> = [
    { id: 'drawings', label: 'Креслення цеху (набір)', hint: 'по аркушу: збірка, деталі, смуги, мийка, стики і склейка, специфікація', available: stone.length > 0 },
    { id: 'assembly', label: 'Збиральне креслення (старе)', hint: 'усі парти на одному аркуші', available: stone.length > 0 },
    { id: 'plywood', label: 'Підклад (фанера)', hint: 'аркуш 2: рама і ребра, ТБ-1', available: plywood.length > 0 },
    { id: 'metal', label: 'Металокаркас', hint: 'окремий аркуш, свій штамп (МК-1)', available: metal.length > 0 },
    { id: 'techcard', label: 'Тех карта по ділянках', hint: 'ВЦ-1: пила → вода → ЧПК → … → косметика', available: true },
    { id: 'shopsheet', label: 'Бланк цеху', hint: 'МЕС-1: вид робіт × одиниця', available: true },
    { id: 'mes', label: 'JSON для MES', hint: 'чернетка контракту, ТЗ §7.2', available: true },
  ];
  const sheetCount = 1 + (plywood.length ? 1 : 0) + (metal.length ? 1 : 0);

  const print = () => {
    const el = document.getElementById('ctor-doc-preview');
    if (!el) return;
    const w = window.open('', '_blank', 'width=1200,height=850');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${project.orderNumber || 'Документ'}</title>
      <style>@page{size:A3 landscape;margin:8mm} body{margin:0;font-family:Arial,sans-serif} .no-print{display:none} svg{width:100%;height:auto} .drawing-sheet{height:279mm;width:auto;display:block;margin:0 auto} table{border-collapse:collapse;font-size:12px} td,th{border:1px solid #999;padding:3px 6px} pre{font-size:11px}</style>
      </head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };
  /** Друк пакета: усі документи, крім JSON, кожен зі своєї сторінки. */
  const printAll = () => {
    const el = document.getElementById('ctor-doc-all');
    if (!el) return;
    const w = window.open('', '_blank', 'width=1200,height=850');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Пакет для цеху — ${project.orderNumber || 'проєкт'}</title>
      <style>@page{size:A3 landscape;margin:8mm} body{margin:0;font-family:Arial,sans-serif} .no-print{display:none} .drawing-sheet{height:270mm;width:auto;display:block;margin:0 auto} .pg{page-break-after:always;padding:0 6mm} .grid{display:grid;grid-template-columns:140px 1fr;gap:2px 12px;padding:8px;border:1px solid #ddd;border-radius:6px;background:#f8fafc;margin:8px 0 14px} .flex{display:flex;flex-wrap:wrap;gap:6px 16px} h2{margin:6px 0 2px} h3{margin:14px 0 4px;border-bottom:1px solid #ddd;padding-bottom:2px} p{margin:4px 0} .pg:last-child{page-break-after:auto} svg{width:100%;height:auto} table{border-collapse:collapse;font-size:12px;width:100%} td,th{border:1px solid #999;padding:3px 6px;vertical-align:top} .ctor-route td,.ctor-route th{font-size:11px}</style>
      </head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };
  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(mes, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `MES_${project.orderNumber || 'проєкт'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copyJson = () => { void navigator.clipboard?.writeText(JSON.stringify(mes, null, 2)); };
  const hasSample = Boolean(project.products?.some((p) => p.name === SAMPLE_PRODUCT_NAME));
  /** Тестове замовлення для перегляду набору: Г-кухня з мийкою, потовщеннями, підворотом, опорою і панеллю. */
  const addSample = () => {
    const st = useProjectStore.getState();
    if (!project.orderNumber) st.updateProjectHeader({ orderNumber: SAMPLE_PROJECT_HEADER.orderNumber, customer: project.customer || SAMPLE_PROJECT_HEADER.customer, customerContactPhone: project.customerContactPhone || SAMPLE_PROJECT_HEADER.customerContactPhone });
    if (!project.projectThickness || !project.projectMaterial) st.updateProject({ projectThickness: project.projectThickness || 20, projectMaterial: project.projectMaterial || 'Кварцит' });
    st.addProduct(buildSampleKitchenProduct(`kitchen_l_sample_${Date.now().toString(36)}`, project.projectMaterial || 'Кварцит'));
    setDoc('drawings');
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-[280px] shrink-0 border-r border-slate-200 bg-[#f7f9fb] p-3 overflow-y-auto custom-scrollbar flex flex-col gap-3">
        <Panel title="Пакет для цеху">
          <ul className="m-0 p-0 list-none space-y-1">
            {docs.map((d) => (
              <li key={d.id}>
                <button type="button" disabled={!d.available} onClick={() => setDoc(d.id)}
                  className={`w-full text-left px-2 py-1.5 rounded border text-[12.5px] ${doc === d.id ? '!bg-sky-50 !border-sky-300' : '!bg-white !border-slate-200'} disabled:opacity-50`}>
                  <div className="font-semibold text-slate-800">{d.label}</div>
                  <div className="text-[11.5px] text-slate-500">{d.hint}</div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Дії">
          <div className="flex flex-col gap-1.5">
            <button type="button" className={`${BTN_BLUE} justify-center`} onClick={print}><Printer className="w-4 h-4" /> Друк цього документа</button>
            <button type="button" className={`${BTN_BLUE} justify-center`} onClick={printAll} title="Усі документи пакета, крім JSON, кожен зі своєї сторінки"><Layers className="w-4 h-4" /> Друк пакета</button>
            <button type="button" className={`${BTN_IDLE} justify-center`} onClick={downloadJson}><Download className="w-4 h-4" /> JSON для MES (файл)</button>
            <button type="button" className={`${BTN_IDLE} justify-center`} onClick={copyJson}><Copy className="w-4 h-4" /> Копіювати JSON</button>
          </div>
        </Panel>
        <Panel title="Тест">
          <button type="button" className={`${BTN_IDLE} justify-center w-full`} onClick={addSample} title="Додає в проєкт виріб «Кухня Г-подібна (тест)»: стільниця 2600×1600 з мийкою з каменю, варильною, потовщеннями 40, підворотом 100, опорою і стіновою панеллю — щоб подивитися повний набір креслень">
            <FlaskConical className="w-4 h-4" /> {hasSample ? 'Ще одна тестова кухня' : 'Тестове замовлення: кухня'}
          </button>
          <p className="text-[11.5px] text-slate-500 mt-1 mb-0">Умовні дані замовника; виріб можна видалити у списку виробів.</p>
        </Panel>
      </aside>

      <div className="flex-1 min-w-0 bg-[#e9edf1] overflow-auto custom-scrollbar p-4">
        <div id="ctor-doc-preview" className="mx-auto bg-white shadow-md ctor-doc" style={{ maxWidth: doc === 'drawings' || doc === 'assembly' || doc === 'plywood' || doc === 'metal' ? 1180 : 900 }}>
          <style>{`.ctor-doc table{border-collapse:collapse;width:100%}.ctor-doc th,.ctor-doc td{padding:3px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}.ctor-doc th{font-weight:600}`}</style>
          {doc === 'drawings' && (stone.length
            ? <DrawingSetView project={project} parts={stone} details={details} instructions={instrList} />
            : <Empty>Немає кам'яних виробів — додайте виріб або натисніть «Тестове замовлення».</Empty>)}
          {doc === 'assembly' && (stone.length
            ? <AssemblySheet project={project} parts={stone} details={details} title="Збиральне креслення" sheetNo={1} sheetCount={sheetCount} instructions={instrList} showGaps />
            : <Empty>Немає кам'яних виробів.</Empty>)}
          {doc === 'plywood' && (
            <AssemblySheet project={project} parts={plywood} details={details} title="Підклад фанерний" kind="plywood" sheetNo={2} sheetCount={sheetCount} instructions={instrList} overlay={plywoodOverlay} showGaps />
          )}
          {doc === 'metal' && (
            <AssemblySheet project={project} parts={metal} details={details} title="Металокаркас" kind="metal" sheetNo={sheetCount} sheetCount={sheetCount} instructions={instrList} showGaps />
          )}
          {doc === 'techcard' && <TechCardView card={card} route={route} />}
          {doc === 'shopsheet' && <ShopSheetView card={card} />}
          {doc === 'mes' && <pre className="m-0 p-4 text-[11.5px] leading-snug overflow-auto">{JSON.stringify(mes, null, 2)}</pre>}
        </div>
        {/* Пакет для друку — усі документи, крім JSON; рендериться невидимо */}
        <div id="ctor-doc-all" className="ctor-doc" style={{ display: 'none' }}>
          {stone.length > 0 && <div className="pg"><AssemblySheet project={project} parts={stone} details={details} title="Збиральне креслення" sheetNo={1} sheetCount={sheetCount} instructions={instrList} /></div>}
          {plywood.length > 0 && <div className="pg"><AssemblySheet project={project} parts={plywood} details={details} title="Підклад фанерний" kind="plywood" sheetNo={2} sheetCount={sheetCount} instructions={instrList} overlay={plywoodOverlay} /></div>}
          {metal.length > 0 && <div className="pg"><AssemblySheet project={project} parts={metal} details={details} title="Металокаркас" kind="metal" sheetNo={sheetCount} sheetCount={sheetCount} instructions={instrList} /></div>}
          <div className="pg"><TechCardView card={card} route={route} /></div>
          <div className="pg"><ShopSheetView card={card} /></div>
        </div>
      </div>

      <aside className="w-[320px] shrink-0 border-l border-slate-200 bg-[#f7f9fb] p-3 overflow-y-auto custom-scrollbar flex flex-col gap-3">
        <Panel title="Інструкції виконавцю (ОФ-ЧВ)">
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} placeholder={'по рядку: «Кромку C не полірувати», «Виріз під мийку — на об’єкті»'} className="w-full border border-slate-300 rounded p-1.5 text-[12.5px] bg-white" />
          <p className="text-[11.5px] text-slate-500 mt-1 mb-0">Червоним на кресленні і verbatim у JSON для MES.</p>
        </Panel>
        <Panel title="Зведення">
          <div className="text-[12.5px] text-slate-700 space-y-0.5">
            <div>Площа деталей: <b>{fmt(card.header.areaM2, 3)} м²</b> (база косметики, ПС-1)</div>
            <div>Листів: <b>{card.header.slabs}</b> · обпил {fmt(9.6 * card.header.slabs, 1)} м.п. (ВЦ-16)</div>
            <div>Ділянок у маршруті: <b>{card.sections.length}</b></div>
            {card.unrouted.length > 0 && <div className="text-amber-700">Без ділянки: {card.unrouted.map((l) => l.name).join(', ')}</div>}
            {card.notes.map((n, i) => <div key={i} className="text-slate-500">{n}</div>)}
          </div>
        </Panel>
        <DecisionsLog />
      </aside>
    </div>
  );
}

function TechCardView({ card, route }: { card: ReturnType<typeof buildTechCard>; route: RouteModel }) {
  const mainParts = route.parts.filter((p) => p.role === 'main' || p.role === 'leg').length;
  return (
    <div className="p-6 text-[13px]">
      <div className="text-[11px] text-slate-400 mb-1">Viyar Stone 3D · конструктор · тех карта</div>
      <h2 className="m-0 text-[20px] font-bold">Технологічна карта — {card.header.orderNumber}</h2>
      <div className="text-slate-600 mb-3">{card.header.customer} · {card.header.material} {card.header.thickness ? `${card.header.thickness} мм` : ''} · {fmt(card.header.areaM2, 3)} м² · {card.header.date}</div>

      <div className="rounded-md bg-slate-50 border border-slate-200 p-3 mb-4 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-[12px]">
        <div className="text-slate-400 font-semibold uppercase text-[10px] tracking-wide pt-0.5">Що йде в цех</div>
        <div>{mainParts} детал{mainParts === 1 ? 'ь' : mainParts < 5 ? 'і' : 'ей'} ({route.parts.length} парт{route.parts.length === 1 ? '' : 'ів'} з доповненнями) {card.header.slabs ? ` з ${card.header.slabs} лист${card.header.slabs === 1 ? 'а' : 'ів'}` : ' (листи ще не розкладені)'} · {card.header.material} {card.header.thickness ? `${card.header.thickness} мм` : ''}</div>
        {route.features.map((f, i) => (
          <React.Fragment key={i}>
            <div className="text-slate-400 font-semibold uppercase text-[10px] tracking-wide pt-0.5">Особливість {i + 1}</div>
            <div>{f}</div>
          </React.Fragment>
        ))}
      </div>

      <h3 className="m-0 mb-1 text-[15px] font-bold text-slate-800 border-b border-slate-200 pb-1">1. Мапа руху по цеху</h3>
      <RouteMap model={route} />
      <RouteLegend />
      <p className="text-[11px] text-slate-500 mt-1 mb-4">Задіяність ділянок — з фактів розкрою; порядок між ділянками — ВЦ-1 (виведено з технологічної логіки, підтвердити в цеху); повернення — лише за ознаками ВЦ-7/ВЦ-18.</p>

      <h3 className="m-0 mb-1 text-[15px] font-bold text-slate-800 border-b border-slate-200 pb-1">2. Що робили з кожною деталлю</h3>
      <PartsRouteTable model={route} />
      <p className="text-[11px] text-slate-500 mt-1 mb-4">Кількості — з фактів рушія по кожному парту; кромка — три проходи на одному ребрі (ВЦ-17); отвори Ø&lt;100 рушій не ділить на воду й коронку (ПС-5).</p>

      <h3 className="m-0 mb-1 text-[15px] font-bold text-slate-800 border-b border-slate-200 pb-1">3. Операції по ділянках (з кошторису)</h3>
      {card.sections.map((s, si) => (
        <div key={s.area} className="mb-3">
          <h3 className="m-0 mb-1 text-[14px] font-bold text-slate-800">{si + 1}. {s.area}</h3>
          <table className="w-full">
            <thead><tr className="text-left text-slate-500"><th>Код</th><th>Операція</th><th className="text-right">К-сть</th><th>Од.</th><th>Правило</th></tr></thead>
            <tbody>
              {s.ops.map((o, i) => (
                <tr key={`${o.serviceId}${i}`}>
                  <td className="text-slate-500">{o.code ?? <span className="text-amber-600">{o.serviceId}</span>}</td>
                  <td>{o.name}</td>
                  <td className="text-right font-semibold">{fmt(o.qty, o.unit === 'шт' || o.unit === 'лист' ? 0 : 3)}</td>
                  <td>{o.unit}</td>
                  <td className="text-[11px] text-slate-500">{o.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {card.materials.length > 0 && (
        <div className="mb-3">
          <h3 className="m-0 mb-1 text-[14px] font-bold text-slate-800">Матеріали (вхід складу, МЕС-4)</h3>
          <table className="w-full"><tbody>{card.materials.map((m) => <tr key={m.serviceId}><td>{m.name}</td><td className="text-right">{fmt(m.quantity, 3)}</td><td>{m.unit}</td></tr>)}</tbody></table>
        </div>
      )}
      {card.unrouted.length > 0 && (
        <div className="mb-3">
          <h3 className="m-0 mb-1 text-[14px] font-bold text-amber-700">Без ділянки — треба вирішити</h3>
          <table className="w-full"><tbody>{card.unrouted.map((m) => <tr key={m.serviceId}><td>{m.name}</td><td className="text-right">{fmt(m.quantity, 3)}</td><td>{m.unit}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}

function ShopSheetView({ card }: { card: ReturnType<typeof buildTechCard> }) {
  return (
    <div className="p-6 text-[13px]">
      <h2 className="m-0 text-[18px] font-bold">Бланк цеху — {card.header.orderNumber}</h2>
      <div className="text-slate-600 mb-3">{card.header.customer} · {card.header.material} · {fmt(card.header.areaM2, 3)} м² · вироби: {card.header.productNames.join(', ') || '—'}</div>
      <table className="w-full">
        <thead><tr className="text-left text-slate-500"><th>Вид робіт</th><th>Од.</th><th className="text-right">К-сть</th><th>З яких послуг</th></tr></thead>
        <tbody>
          {card.mes.map((r) => (
            <tr key={`${r.kind}${r.unit}`}>
              <td className="font-semibold">{r.kind}</td><td>{r.unit}</td>
              <td className="text-right">{fmt(r.qty, r.unit === 'шт' ? 0 : 3)}</td>
              <td className="text-[11px] text-slate-500">{r.sources.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11.5px] text-slate-500 mt-3">МЕС-1: згортка за парою (вид робіт, одиниця). Комбінована порізка — у «пилу»; полірування крайки — у «Фрезування». <Tag>перевірено на 3 кейсах</Tag></p>
    </div>
  );
}

export default DocsTab;
