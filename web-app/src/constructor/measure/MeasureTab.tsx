/**
 * ВКЛАДКА «ЗАМІР» — 04.09.2026, переписано під 3D 07.09.2026 (журнал №126).
 *
 * Що вміє (ЗК-27…35, звід ПРАВИЛА_ОБРОБКИ_ЗАМІРУ_КОНСТРУКТОР):
 *   • читає DXF або ZIP iCONtrades; з пари бере `_3D`, 2D — як звірку (ЗК-27);
 *     проєктів у ZIP може бути кілька — вибір (ЗМ-Т22);
 *   • шари розкладає по сім'ях: план · площини стін · сирі точки · лазер ·
 *     службове (ЗК-21) — сирі й службові read-only;
 *   • «Дублети» — пари/трійки точок у кутах < d → перетин ліній; прийняти
 *     всі або по одному (ЗК-11, ЗК-28); проміжні точки не чіпає (ЗК-13);
 *     контур стін лишається відкритим (ЗК-14);
 *   • «Зшити» з порогом 5 мм → полілінія + closed (ЗК-15, ЗК-29);
 *   • «Довернути по ребру» — увесь замір, ребро вибирає людина (ЗК-10);
 *   • «Переріз на висоті» — план як перетин площин стін з z = h (ЗК-32);
 *   • «Хвиля стіни» — сирі точки проти площини, кольором, з порогом (ЗК-33);
 *   • «Горизонт по лазеру» — нахил у площині кожної стіни (ЗК-34);
 *   • «Панель зі стіни» — полігон із 3D-контуру: кінці обходу геть, дублети,
 *     замкнути; розетки з висотами від низу панелі і число (ЗК-30, ЗК-24);
 *     нуль по висоті — верх корпусів, низ панелі +43 (ЗК-54) — параметри;
 *   • провенанс: кожна оброблена вершина знає сиру (ЗК-31); експорт назад у
 *     DXF — не робимо (питання власнику №49).
 *   • «Прийняти як приміщення» — стіни з контуру в `project.room` (як і раніше).
 *
 * НЕ-3: нічого не затверджує саме — усе, що прийнято, лягає в `derived`
 * і в журнал рішень із кодом правила.
 */
import { useMemo, useRef, useState } from 'react';
import { Upload, Home, Trash2, Check, RotateCw, Scissors, Layers, Ruler, Waves, Crosshair } from 'lucide-react';
import { useConstructorStore } from '../store';
import { buildChains, parseLeicaDxf, planContourOf, roomContourOf, type MeasureModel, type MeasureChain } from './leicaDxf';
import {
  findDoublets, processPlanContour, stitchSegments, longestEdgeIndex, rotationToAxisDeg, edgeAngleDeg, rotateModel,
  sectionAtHeight, wallWave, waveStats, laserHorizon, panelFromWall, PANEL_DEFAULTS, matchRaw, projectionCheck,
  chainGaps, stitchStats, detectMarkChains, markSegmentIds,
  type PanelFromWallOptions, type ChainGap,
} from './measureOps';
import { readMeasureZip, type ZipMeasure, type ZipMeasureProject } from './measureZip';
import { useProjectStore } from '../../store/useProjectStore';
import { ROOM_DEFAULTS, emptyRoom, wallsFromContour } from '../../domain/room';
import { BTN_BLUE, BTN_GREEN, BTN_IDLE, Empty, Field, HelpDot, NumInput, Panel, Tag, fmt } from '../ui';
import { MeasureSvg, WText, layerColor, useMeasureViewWidth } from './MeasureSvg';
import { WallUnfoldSvg } from './WallUnfoldSvg';

type View = 'plan' | 'wall';

export function MeasureTab() {
  const measure = useConstructorStore((s) => s.measure);
  const setMeasure = useConstructorStore((s) => s.setMeasure);
  const addDecision = useConstructorStore((s) => s.addDecision);
  const updateProject = useProjectStore((s) => s.updateProject);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [zip, setZip] = useState<ZipMeasure | null>(null);
  const [view, setView] = useState<View>('plan');
  const [wallIdx, setWallIdx] = useState(0);
  // параметри обробки
  const [doubletMm, setDoubletMm] = useState(20);
  const [accepted, setAccepted] = useState<Set<number> | null>(null); // null = усі
  const [stitchMm, setStitchMm] = useState(5);
  const [edgeIdx, setEdgeIdx] = useState<number | null>(null);
  const [sectionH, setSectionH] = useState<number | null>(null);
  const [waveOn, setWaveOn] = useState(false);
  const [waveThr, setWaveThr] = useState(10);
  const [showRaw, setShowRaw] = useState(true);
  const [showGaps, setShowGaps] = useState(true);
  const [showMarks, setShowMarks] = useState(true);
  const [panelOpts, setPanelOpts] = useState<PanelFromWallOptions>(PANEL_DEFAULTS);

  const load = (model: MeasureModel) => {
    if (model.segments.length === 0 && model.heights.length === 0 && model.rawPoints.length === 0) {
      setError('У файлі не знайшлось жодного відрізка на робочих шарах — це точно замір?');
    } else setError(null);
    setMeasure(model);
    setHidden(new Set(['Сырые измерения']));
    setAccepted(null); setEdgeIdx(null); setSectionH(null); setWaveOn(false); setWallIdx(0); setView('plan');
  };

  const loadProject = (p: ZipMeasureProject, zipName: string) => {
    const main = p.dxf3d ?? p.dxf2d;
    if (!main) return;
    const model = parseLeicaDxf(main.text, `${zipName} › ${main.path.split('/').pop()}`);
    if (p.dxf3d && p.dxf2d) {
      const m2 = parseLeicaDxf(p.dxf2d.text, p.dxf2d.path);
      const c = projectionCheck(model, m2);
      model.check2d = { fileName: p.dxf2d.path.split('/').pop() ?? '2D', polylines: c.polylines, matched: c.matched, maxDeltaMm: c.maxDeltaMm, frameLabels: m2.frameLabels };
    }
    load(model);
  };

  const onFile = async (file: File) => {
    try {
      if (/\.zip$/i.test(file.name)) {
        const z = await readMeasureZip(await file.arrayBuffer(), file.name);
        if (!z.projects.length && !z.looseDxf.length) { setError('У ZIP немає DXF — це точно експорт iCONtrades?'); return; }
        setZip(z);
        if (z.projects.length === 1) loadProject(z.projects[0], file.name);
        else if (!z.projects.length) load(parseLeicaDxf(z.looseDxf[0].text, z.looseDxf[0].path));
        return;
      }
      setZip(null);
      load(parseLeicaDxf(await file.text(), file.name));
    } catch (e) {
      setError(`Не прочитав файл: ${(e as Error).message}`);
    }
  };

  // ── похідне ─────────────────────────────────────────────────────────
  const room = useMemo(() => (measure ? roomContourOf(measure) : undefined), [measure]);
  /*
   * МІТКИ МОНТАЖНИКА «М»/«В» — ГЕТЬ ІЗ ГЕОМЕТРІЇ (№130). Власник:
   * «оце М і В це так монтажники позначають де мийка і де варочна, їх мож
   * ігнорувати». На кейсі 81-1430086 шість із дев'ятнадцяти розривів
   * лежали ВСЕРЕДИНІ цих літер — саме тому «зшити з порогом 5» щось
   * рахувало, а стіни лишались розсипаними. Літери не викидаємо: вони
   * кажуть, де мийка і варильна, — показуємо приглушено і не пускаємо в
   * зшивання, розриви й контур (ЗК-16, МТ-1).
   */
  // Мітки шукаються по СИРОМУ файлу (базове зшивання 1,5 мм), а не по
  // поточному стану: інакше після «зшити з порогом 25» літери зливаються
  // з сусідами і перестають упізнаватись.
  const baseChains = useMemo(() => (measure ? buildChains(measure.segments, 1.5) : []), [measure]);
  const markChains = useMemo(() => detectMarkChains(baseChains), [baseChains]);
  const markSegs = useMemo(() => markSegmentIds(baseChains, markChains), [baseChains, markChains]);
  const markChainList = useMemo(() => baseChains.filter((c) => markChains.has(c.id)), [baseChains, markChains]);
  const geomSegments = useMemo(() => (measure ? measure.segments.filter((s) => !markSegs.has(s.id)) : []), [measure, markSegs]);
  const geomChains = useMemo(
    () => (measure ? measure.chains.filter((c) => !c.segmentIds.every((id) => markSegs.has(id))) : []),
    [measure, markSegs],
  );
  const plan = useMemo(() => (measure ? planContourOf({ ...measure, chains: geomChains }) : undefined), [measure, geomChains]);
  const doublets = useMemo(() => (plan ? findDoublets(plan.points, doubletMm, plan.closed) : []), [plan, doubletMm]);
  const processed = useMemo(() => (plan ? processPlanContour(plan, doubletMm, accepted ?? undefined) : null), [plan, doubletMm, accepted]);
  const rawMatch = useMemo(() => (processed && measure ? matchRaw(processed.points, measure.rawPoints, 0.05) : []), [processed, measure]);
  const edges = useMemo(() => {
    if (!plan) return [];
    const n = plan.closed ? plan.points.length : plan.points.length - 1;
    return Array.from({ length: n }, (_, i) => {
      const a = plan.points[i]; const b = plan.points[(i + 1) % plan.points.length];
      return { i, lengthMm: Math.hypot(b.x - a.x, b.y - a.y), angleDeg: edgeAngleDeg(a, b), rotDeg: rotationToAxisDeg(a, b) };
    }).sort((p, q) => q.lengthMm - p.lengthMm).slice(0, 8);
  }, [plan]);
  const chosenEdge = edgeIdx ?? (plan ? longestEdgeIndex(plan.points, plan.closed) : 0);
  const chosen = edges.find((e) => e.i === chosenEdge) ?? edges[0];
  /* ЗК-15: де саме розрив і що дасть поріг — щоб не гадати число (№129). */
  const gaps = useMemo(() => chainGaps(geomChains), [geomChains]);
  const stitchPreview = useMemo(() => (measure ? stitchStats(geomSegments, stitchMm) : null), [measure, geomSegments, stitchMm]);
  const wave = useMemo(() => (measure && waveOn ? wallWave(measure, 60) : []), [measure, waveOn]);
  const wStats = useMemo(() => waveStats(wave, waveThr), [wave, waveThr]);
  const horizon = useMemo(() => (measure ? laserHorizon(measure) : null), [measure]);
  const wall = measure?.walls[wallIdx];
  const panel = useMemo(() => (wall ? panelFromWall(wall, panelOpts) : null), [wall, panelOpts]);
  const sectionDefault = measure?.walls.length ? Math.round((Math.min(...measure.walls.map((w) => w.zMin)) + Math.max(...measure.walls.map((w) => w.zMax))) / 2) : 900;
  const sectionSegs = useMemo(() => (measure && sectionH !== null ? sectionAtHeight(measure, sectionH) : []), [measure, sectionH]);

  // ── дії ─────────────────────────────────────────────────────────────
  const acceptDoublets = () => {
    if (!measure || !processed) return;
    const derived = { panels: [], sections: [], ...(measure.derived ?? {}), plan: { sourceChainId: processed.sourceChainId, layer: processed.layer, points: processed.points, closed: processed.closed, replaced: processed.replaced, provenance: processed.provenance } };
    setMeasure({ ...measure, derived, ops: [...measure.ops, `дублети → перетин: ${processed.replaced} (ЗК-11), поріг ${doubletMm} мм`] });
    addDecision({ tab: 'measure', what: `Кути контуру стін: ${processed.replaced} дублетів замінено перетином ліній (поріг ${doubletMm} мм); контур лишено відкритим`, why: 'дублет у куті — слід ведення приладу, справжній кут — перетин стін (ЗК-11); контур стін — не деталь (ЗК-14)', rule: 'ЗК-11' });
  };
  const doStitch = () => {
    if (!measure) return;
    const stitched = stitchSegments(geomSegments, stitchMm);
    // мітки не зшиваємо, але й не втрачаємо — вони лишаються в моделі
    const chains = [...stitched, ...markChainList];
    const closedN = stitched.filter((c) => c.closed).length;
    // Зшивання завжди рахується від СИРИХ відрізків, тому в журналі
    // операцій має бути один запис про зшивання, а не ланцюжок
    // суперечливих (№129: власник бачив «30 мм → 7» і зразу «5 мм → 11»).
    const ops = measure.ops.filter((o) => !o.startsWith('зшито з порогом'));
    setMeasure({ ...measure, chains, ops: [...ops, `зшито з порогом ${stitchMm} мм: ${stitched.length} ланцюгів, ${closedN} замкнених (ЗК-15)`] });
    addDecision({ tab: 'measure', what: `Розсипані примітиви зшито з порогом ${stitchMm} мм: ${chains.length} ланцюгів, ${closedN} замкнено`, why: 'ніші й корпуси приходять розсипаними із зазорами до 5 мм (ЗК-6); зшивання з порогом — те, що конструктор робить руками (ЗК-15)', rule: 'ЗК-15' });
  };
  const doRotate = () => {
    if (!measure || !chosen) return;
    const next = rotateModel(measure, chosen.rotDeg);
    setMeasure({ ...next, derived: undefined });
    setAccepted(null); setSectionH(null);
    addDecision({ tab: 'measure', what: `Замір довернуто на ${fmt(chosen.rotDeg, 3)}° по ребру ${chosen.i + 1} (${fmt(chosen.lengthMm, 0)} мм)`, why: 'довгу стіну кладуть по осі, щоб деталі не були під кутом до системи координат; який кут — вибір людини (ЗК-10)', rule: 'ЗК-10' });
  };
  const acceptSection = () => {
    if (!measure || sectionH === null) return;
    const derived = { panels: [], ...(measure.derived ?? {}), sections: sectionSegs };
    setMeasure({ ...measure, derived, ops: [...measure.ops, `переріз z=${sectionH}: ${sectionSegs.length} відрізків (ЗК-32)`] });
    addDecision({ tab: 'measure', what: `Переріз площин стін на висоті z = ${sectionH} мм: ${sectionSegs.length} відрізків`, why: 'план — це проєкція точок з різних висот (ЗК-23); контур на висоті виробу треба брати перетином площин (ЗК-32)', rule: 'ЗК-32' });
  };
  const acceptPanel = () => {
    if (!measure || !wall || !panel) return;
    const derived = { sections: [], ...(measure.derived ?? {}), panels: [...(measure.derived?.panels ?? []).filter((p) => p.wallIndex !== wall.index), { wallIndex: wall.index, layer: wall.layer, polygon: panel.polygon, widthMm: panel.widthMm, heightMm: panel.heightMm, sockets: panel.sockets, baseZ: panel.baseZ }] };
    setMeasure({ ...measure, derived, ops: [...measure.ops, `панель зі стіни «${wall.layer}»: ${fmt(panel.widthMm, 1)}×${fmt(panel.heightMm, 1)}, розеток ${panel.socketCount} (ЗК-30)`] });
    addDecision({ tab: 'measure', what: `Панель зі стіни «${wall.layer}»: ${fmt(panel.widthMm, 1)} × ${fmt(panel.heightMm, 1)} мм, ${panel.socketCount} розеток, низ панелі +${panel.baseZ} над нулем`, why: `панель будують із 3D-контуру стіни, не з лінії на плані (ЗК-17); нуль по висоті — ${panelOpts.zeroMode === 'cabinet-top' ? 'верх корпусів' : panelOpts.zeroMode === 'floor' ? 'підлога' : 'задано вручну'} (ЗК-54)`, rule: 'ЗК-30' });
  };
  const acceptAsRoom = () => {
    if (!room) return;
    const contour = room.points.map((p) => ({ x: p.x, y: -p.y }));
    const solids = wallsFromContour(contour, ROOM_DEFAULTS.wallThicknessMm, ROOM_DEFAULTS.wallHeightMm, { floor: true });
    updateProject({ room: { ...emptyRoom(), solids } });
    addDecision({ tab: 'measure', what: `Прийнято контур заміру як приміщення (${room.points.length} вершин, ${fmt(room.lengthMm / 1000, 2)} м)`, why: 'замір із приладу — джерело правди про стіни (ЗМ-Т1)', rule: 'ЗМ-Т1' });
  };

  const layerFamilies = useMemo(() => measure ? groupLayers(measure) : [], [measure]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-[318px] shrink-0 border-r border-slate-200 bg-[#f7f9fb] p-3 overflow-y-auto custom-scrollbar flex flex-col gap-3">
        <Panel title="Файл заміру" right={<HelpDot section="measure" />}>
          <input ref={inputRef} type="file" accept=".dxf,.DXF,.zip,.ZIP" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
          <button type="button" className={`${BTN_BLUE} w-full justify-center`} onClick={() => inputRef.current?.click()}>
            <Upload className="w-4 h-4" /> Підвантажити DXF або ZIP (Leica)
          </button>
          {zip && zip.projects.length > 1 && (
            <div className="mt-2 text-[12.5px]">
              <div className="text-slate-500 mb-1">У ZIP кілька проєктів (ЗМ-Т22) — який відкрити:</div>
              <div className="flex flex-wrap gap-1">
                {zip.projects.map((p) => (
                  <button key={p.name} type="button" className={`${BTN_IDLE} !px-2`} onClick={() => loadProject(p, zip.fileName)} title={`${p.dxf3d ? '3D' : ''}${p.dxf2d ? ' 2D' : ''}${p.panorama.length ? ' панорама' : ''}`}>{p.name}</button>
                ))}
              </div>
            </div>
          )}
          {measure && (
            <div className="mt-2 text-[12.5px] text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800 break-all">{measure.fileName}</div>
              <div>Формат: <Tag tone={measure.is3d ? 'green' : 'blue'}>{variantLabel(measure.variant)}</Tag> {measure.acadVersion && <span className="text-slate-400">{measure.acadVersion}</span>}</div>
              {measure.is3d && <div>Сирих точок: {measure.rawPoints.length} · площин стін: {measure.walls.length} · опускань відкинуто: {measure.verticalDrops}</div>}
              <div>Відрізків: {measure.segments.length} · ланцюгів: {measure.chains.length} · міток: {measure.marks.length}</div>
              {measure.heights.length > 0 && <div>Карта висот: {measure.heights.length} точок (ЗМ-Т9)</div>}
              {measure.frames > 0 && <div>Рамок кадру: {measure.frames}, дублів прибрано: {measure.dedupedSegments} (ЗМ-Т3){measure.frameLabels.length > 0 && <span className="text-slate-400"> · {measure.frameLabels.join(' · ')}</span>}</div>}
              {measure.check2d && (
                <div>Звірка з 2D ({measure.check2d.fileName}): {measure.check2d.matched} з {measure.check2d.polylines} контурів збіглись, Δ max {fmt(measure.check2d.maxDeltaMm, 3)} мм {measure.check2d.maxDeltaMm < 0.01 ? <Tag tone="green">2D = проєкція 3D (ЗК-0)</Tag> : <Tag tone="amber">є розбіжність</Tag>}</div>
              )}
              <div>Габарит: {fmt(measure.bbox.maxX - measure.bbox.minX, 0)} × {fmt(measure.bbox.maxY - measure.bbox.minY, 0)} мм</div>
              {measure.ops.length > 0 && <div className="text-slate-500">Операції: {measure.ops.join(' → ')}</div>}
              <button type="button" className={`${BTN_IDLE} mt-1`} onClick={() => { setMeasure(null); setZip(null); }}><Trash2 className="w-3.5 h-3.5" /> Прибрати замір</button>
            </div>
          )}
          {error && <div className="mt-2 text-[12.5px] text-rose-600">{error}</div>}
        </Panel>

        {measure && (
          <Panel title="Шари" right={<label className="text-[11.5px] text-slate-500 flex items-center gap-1"><input type="checkbox" className="!w-3.5 !h-3.5 !m-0" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />сирі точки</label>}>
            {layerFamilies.map((fam) => (
              <div key={fam.name} className="mb-1.5">
                <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-0.5">{fam.name}{fam.readonly && <span className="ml-1 normal-case tracking-normal">· read-only</span>}</div>
                <ul className="m-0 p-0 list-none space-y-0.5 text-[12.5px]">
                  {fam.layers.map((layer) => {
                    const count = measure.segments.filter((s) => s.layer === layer).length;
                    const on = !hidden.has(layer);
                    return (
                      <li key={layer} className="flex items-center gap-2">
                        <input type="checkbox" className="!w-4 !h-4 shrink-0 !m-0" checked={on} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(layer)) n.delete(layer); else n.add(layer); return n; })} />
                        <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: layerColor(layer, measure.layers) }} />
                        <span className="flex-1 truncate" title={layer}>{layer}</span>
                        <span className="text-slate-400">{count}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </Panel>
        )}

        {measure && markChains.size > 0 && (
          <Panel title="Мітки монтажника">
            <label className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" className="!w-4 !h-4 shrink-0 !m-0" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} />
              <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: '#b45309' }} />
              <span className="flex-1">«М» і «В» — мийка і варильна</span>
              <span className="text-slate-400">{markSegs.size}</span>
            </label>
            <p className="text-[11.5px] text-slate-500 mt-1 mb-0">
              Замірник малює їх просто на плані. Це не геометрія: у зшивання, розриви й контур
              не йдуть (ЗК-16, МТ-1) — інакше поріг зшиває літери замість стін.
            </p>
          </Panel>
        )}
        {measure && measure.dropped.length > 0 && (
          <details className="text-[12px] text-slate-500">
            <summary className="cursor-pointer">Відкинуто (службове) · {measure.dropped.reduce((a, d) => a + d.count, 0)}</summary>
            <ul className="m-0 mt-1 p-0 list-none space-y-1">
              {measure.dropped.map((d) => (
                <li key={d.layer}><span className="text-slate-700">{d.layer}</span> ×{d.count} — {d.reason}</li>
              ))}
            </ul>
          </details>
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
            <p>Підвантаж ZIP з iCONtrades або DXF. З пари 2D/3D інструмент бере 3D — там висоти, площини стін і сирі точки; 2D піде як звірка (ЗК-27). Рамки кадру, Level і MchOrg відкинуться самі.</p>
          </Empty>
        ) : (
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 bg-white flex flex-col">
              <div className="flex items-center gap-1 px-2 h-9 border-b border-slate-200 bg-[#fbfcfd] text-[12.5px]">
                <button type="button" className={view === 'plan' ? BTN_BLUE : BTN_IDLE} onClick={() => setView('plan')}><Layers className="w-3.5 h-3.5" /> План</button>
                <button type="button" className={view === 'wall' ? BTN_BLUE : BTN_IDLE} onClick={() => setView('wall')} disabled={!measure.walls.length} title={measure.walls.length ? '' : 'у файлі немає площин стін (3D)'}><Ruler className="w-3.5 h-3.5" /> Розгортка стіни</button>
                {view === 'wall' && measure.walls.length > 0 && (
                  <select className="h-7 ml-2 border border-slate-300 rounded text-[12.5px] bg-white max-w-[300px]" value={wallIdx} onChange={(e) => setWallIdx(Number(e.target.value))}>
                    {measure.walls.map((w) => <option key={w.index} value={w.index}>{w.layer} · {fmt(w.uMax - w.uMin, 0)} × {fmt(w.zMax - w.zMin, 0)} · розеток {w.sockets.length}</option>)}
                  </select>
                )}
                {/* Підказка не має розсовувати тулбар: вибір стіни довгий, тому обрізаємо (№128). */}
                <span className="ml-auto text-slate-400 truncate max-w-[46%] hidden md:inline" title={view === 'plan' ? 'колесо — масштаб, тягнення — панорама' : 'u — уздовж стіни, z — угору; сіре — як прийшло, синє — панель'}>{view === 'plan' ? 'колесо — масштаб, тягнення — панорама' : 'u — уздовж стіни, z — угору; сіре — як прийшло, синє — панель'}</span>
                <HelpDot section="measure" />
              </div>
              <div className="flex-1 min-h-0">
                {view === 'plan' ? (
                  <MeasureSvg model={measure} hiddenLayers={hidden} markIds={markSegs} showMarks={showMarks}>
                    <PlanOverlays model={measure} processed={processed} doublets={doublets} accepted={accepted} showRaw={showRaw} wave={waveOn ? wave : []} waveThr={waveThr} sections={sectionSegs.length ? sectionSegs : (measure.derived?.sections ?? [])} gaps={showGaps ? gaps : []} stitchMm={stitchMm} chosenEdge={plan && chosen ? { a: plan.points[chosen.i], b: plan.points[(chosen.i + 1) % plan.points.length] } : null} />
                  </MeasureSvg>
                ) : wall ? (
                  <WallUnfoldSvg wall={wall} panel={panel} laserZ={measure.laser?.zMean} />
                ) : null}
              </div>
            </div>
            <ProcessingPanel
              model={measure} plan={plan} processed={processed} doublets={doublets} accepted={accepted} setAccepted={setAccepted}
              doubletMm={doubletMm} setDoubletMm={setDoubletMm} acceptDoublets={acceptDoublets}
              stitchMm={stitchMm} setStitchMm={setStitchMm} doStitch={doStitch}
              gaps={gaps} stitchPreview={stitchPreview} showGaps={showGaps} setShowGaps={setShowGaps} geomChains={geomChains} markSegs={markSegs}
              edges={edges} chosenEdge={chosenEdge} setEdgeIdx={setEdgeIdx} doRotate={doRotate}
              sectionH={sectionH} setSectionH={setSectionH} sectionDefault={sectionDefault} sectionSegs={sectionSegs} acceptSection={acceptSection}
              waveOn={waveOn} setWaveOn={setWaveOn} waveThr={waveThr} setWaveThr={setWaveThr} wStats={wStats}
              horizon={horizon}
              wall={wall} panel={panel} panelOpts={panelOpts} setPanelOpts={setPanelOpts} acceptPanel={acceptPanel} setView={setView}
              rawMatch={rawMatch}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function variantLabel(v: MeasureModel['variant']) {
  return v === '3d' ? '3D нативний (iCONtrades)' : v === 'polylines' ? 'полілінії (2D)' : v === 'external-internal' ? 'External/Internal' : v === 'zlines' ? 'один файл + ZLines' : 'невідомий';
}

/** Шари по сім'ях (ЗК-21/27): план · площини стін · сирі точки · лазер · службове. */
function groupLayers(m: MeasureModel): Array<{ name: string; layers: string[]; readonly: boolean }> {
  const wallLayers = new Set(m.walls.map((w) => w.layer));
  const fam = (l: string) => (l === 'Сырые измерения' ? 'сирі точки' : l === 'Лінія лазера' ? 'лазер' : wallLayers.has(l) ? 'площини стін' : l === 'ZLines' ? 'карта висот' : 'план');
  const groups = new Map<string, string[]>();
  for (const l of m.layers) { const f = fam(l); if (!groups.has(f)) groups.set(f, []); groups.get(f)!.push(l); }
  const order = ['план', 'площини стін', 'сирі точки', 'лазер', 'карта висот'];
  return order.filter((o) => groups.has(o)).map((o) => ({ name: o, layers: groups.get(o)!, readonly: o === 'сирі точки' || o === 'площини стін' }));
}

// ── Оверлеї на плані ──────────────────────────────────────────────────

function PlanOverlays({ model, processed, doublets, accepted, showRaw, wave, waveThr, sections, gaps, stitchMm, chosenEdge }: {
  model: MeasureModel;
  processed: ReturnType<typeof processPlanContour> | null;
  doublets: ReturnType<typeof findDoublets>;
  accepted: Set<number> | null;
  showRaw: boolean;
  wave: ReturnType<typeof wallWave>;
  waveThr: number;
  sections: MeasureModel['segments'];
  /** Розриви між ланцюгами (ЗК-15) — пунктиром прямо на плані. */
  gaps: ChainGap[];
  stitchMm: number;
  chosenEdge: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
}) {
  // Розміри підписів і кружечків — від ТОГО, ЩО ЗАРАЗ ВИДНО (№128), а не
  // від габариту файла: інакше при наближенні підпис росте на все полотно.
  const vbW = useMeasureViewWidth();
  const r = vbW / 260;
  const sw = vbW / 700;
  const font = vbW / 42;
  const waveColor = (d: number) => (Math.abs(d) <= waveThr ? '#22a06b' : Math.abs(d) <= 2 * waveThr ? '#d97706' : '#dc2626');
  return (
    <g>
      {showRaw && wave.length === 0 && model.rawPoints.map((p) => <circle key={p.id} cx={p.x} cy={p.y} r={r * 0.7} fill="#94a3b8" opacity={0.7} />)}
      {wave.map((s) => (
        <g key={s.raw.id}>
          <circle cx={s.raw.x} cy={s.raw.y} r={r * 1.1} fill={waveColor(s.devMm)} />
          <WText x={s.raw.x + r * 1.5} y={s.raw.y} size={font * 0.75} fill={waveColor(s.devMm)}>{s.devMm > 0 ? '+' : ''}{s.devMm.toFixed(0)}</WText>
        </g>
      ))}
      {chosenEdge && <line x1={chosenEdge.a.x} y1={chosenEdge.a.y} x2={chosenEdge.b.x} y2={chosenEdge.b.y} stroke="#7c3aed" strokeWidth={sw * 3} opacity={0.35} />}
      {processed && processed.replaced > 0 && (
        <polyline points={processed.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#1f93ef" strokeWidth={sw * 1.4} strokeDasharray={`${sw * 6} ${sw * 4}`} />
      )}
      {doublets.map((d) => {
        const on = !accepted || accepted.has(d.i);
        const p = d.intersection;
        // Паралельні лінії перетину не дають — такий дублет не показуємо
        // кружечком у нулі координат (було до №128).
        if (!p) return null;
        return (
          <g key={d.i}>
            <circle cx={p.x} cy={p.y} r={r * 2.2} fill="none" stroke={on ? '#1f93ef' : '#94a3b8'} strokeWidth={sw * 1.4} />
            <WText x={p.x + r * 2.6} y={p.y + r * 2.6} size={font * 0.8} fill={on ? '#1d4ed8' : '#64748b'}>{d.count === 2 ? 'дублет' : `×${d.count}`} {d.distMm.toFixed(1)}</WText>
          </g>
        );
      })}
      {sections.map((s) => <line key={s.id} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke="#0891b2" strokeWidth={sw * 2} strokeLinecap="round" />)}
      {/* ЗК-15: кожен розрив між кінцями ланцюгів — видимий. Зелений
          пунктир перекриває поточний поріг, червоний — ні. Раніше
          натиснути «Зшити» і не побачити нічого було звичайною справою. */}
      {gaps.map((g, i) => {
        const on = g.distMm <= stitchMm;
        const col = on ? '#22a06b' : '#dc2626';
        return (
          <g key={`g${i}`}>
            <line x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} stroke={col} strokeWidth={sw * 2.2} strokeDasharray={`${sw * 5} ${sw * 4}`} strokeLinecap="round" />
            <circle cx={g.a.x} cy={g.a.y} r={r * 0.8} fill={col} />
            <circle cx={g.b.x} cy={g.b.y} r={r * 0.8} fill={col} />
            <WText x={(g.a.x + g.b.x) / 2 + r} y={(g.a.y + g.b.y) / 2 + r} size={font * 0.7} fill={col}>{g.distMm.toFixed(1)}</WText>
          </g>
        );
      })}
      {model.walls.map((w) => {
        const a = { x: w.origin.x + w.uMin * w.dir.x, y: w.origin.y + w.uMin * w.dir.y };
        const b = { x: w.origin.x + w.uMax * w.dir.x, y: w.origin.y + w.uMax * w.dir.y };
        return <WText key={w.index} x={(a.x + b.x) / 2 + w.normal.x * font} y={(a.y + b.y) / 2 + w.normal.y * font} size={font * 0.85} fill="#475569" anchor="middle">{w.layer} · {fmt(w.zMax - w.zMin, 0)} ↑</WText>;
      })}
    </g>
  );
}

// ── Права панель: обробка ─────────────────────────────────────────────

function ProcessingPanel(props: {
  model: MeasureModel; plan?: MeasureChain; processed: ReturnType<typeof processPlanContour> | null;
  doublets: ReturnType<typeof findDoublets>; accepted: Set<number> | null; setAccepted: (s: Set<number> | null) => void;
  doubletMm: number; setDoubletMm: (v: number) => void; acceptDoublets: () => void;
  stitchMm: number; setStitchMm: (v: number) => void; doStitch: () => void;
  /** ЗК-15 (№129): розриви між ланцюгами, прев'ю порога і показ розривів на плані. */
  gaps: ChainGap[]; stitchPreview: { chains: number; closed: number } | null; showGaps: boolean; setShowGaps: (v: boolean) => void;
  /** Ланцюги без міток М/В і самі мітки (№130). */
  geomChains: MeasureChain[]; markSegs: Set<string>;
  edges: Array<{ i: number; lengthMm: number; angleDeg: number; rotDeg: number }>; chosenEdge: number; setEdgeIdx: (i: number) => void; doRotate: () => void;
  sectionH: number | null; setSectionH: (v: number | null) => void; sectionDefault: number; sectionSegs: MeasureModel['segments']; acceptSection: () => void;
  waveOn: boolean; setWaveOn: (v: boolean) => void; waveThr: number; setWaveThr: (v: number) => void; wStats: ReturnType<typeof waveStats>;
  horizon: ReturnType<typeof laserHorizon>;
  wall?: MeasureModel['walls'][number]; panel: ReturnType<typeof panelFromWall> | null; panelOpts: PanelFromWallOptions; setPanelOpts: (o: PanelFromWallOptions) => void; acceptPanel: () => void; setView: (v: View) => void;
  rawMatch: ReturnType<typeof matchRaw>;
}) {
  const { model, plan, processed, doublets, accepted, setAccepted, doubletMm, setDoubletMm, acceptDoublets, stitchMm, setStitchMm, doStitch, gaps, stitchPreview, showGaps, setShowGaps, geomChains, markSegs, edges, chosenEdge, setEdgeIdx, doRotate, sectionH, setSectionH, sectionDefault, sectionSegs, acceptSection, waveOn, setWaveOn, waveThr, setWaveThr, wStats, horizon, wall, panel, panelOpts, setPanelOpts, acceptPanel, setView, rawMatch } = props;
  const toggle = (i: number) => {
    const base = accepted ?? new Set(doublets.map((d) => d.i));
    const n = new Set(base); if (n.has(i)) n.delete(i); else n.add(i); setAccepted(n);
  };
  const [tab, setTab] = useState<'ops' | 'chains' | 'prov'>('ops');
  return (
    <aside className="w-[372px] shrink-0 border-l border-slate-200 bg-[#f7f9fb] overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
      <div className="flex gap-1 text-[12.5px]">
        <button type="button" className={tab === 'ops' ? BTN_BLUE : BTN_IDLE} onClick={() => setTab('ops')}>Обробка</button>
        <button type="button" className={tab === 'chains' ? BTN_BLUE : BTN_IDLE} onClick={() => setTab('chains')}>Ланцюги і кути</button>
        <button type="button" className={tab === 'prov' ? BTN_BLUE : BTN_IDLE} onClick={() => setTab('prov')} disabled={!processed}>Провенанс</button>
      </div>

      {tab === 'chains' && <ChainsTable model={model} markSegs={markSegs} />}

      {tab === 'prov' && processed && (
        <Panel title="Провенанс вершин (ЗК-31)">
          <p className="text-[11.5px] text-slate-500 mt-0 mb-2">Кожна вершина обробленого контуру знає, з яких сирих народилась. «= сира» — збіг із точкою приладу ≤ 0,05 мм (ЗК-53).</p>
          <table className="w-full text-[11.5px]">
            <thead><tr className="text-slate-400"><td className="px-1">#</td><td className="px-1">x</td><td className="px-1">y</td><td className="px-1">звідки</td><td className="px-1">сира</td></tr></thead>
            <tbody>
              {processed.points.map((p, i) => {
                const pv = processed.provenance[i]; const rm = rawMatch[i];
                return (
                  <tr key={i} className={pv?.kind === 'intersection' ? 'bg-sky-50' : ''}>
                    <td className="px-1 text-slate-400">{i + 1}</td>
                    <td className="px-1 text-right">{fmt(p.x, 1)}</td>
                    <td className="px-1 text-right">{fmt(p.y, 1)}</td>
                    <td className="px-1">{pv?.kind === 'intersection' ? `перетин ← ${pv.from.map((k) => k + 1).join('+')}` : `сира ${(pv?.from[0] ?? i) + 1}`}</td>
                    <td className="px-1 text-slate-500">{rm?.raw ? (rm.raw.label ?? '= сира') : rm ? `${fmt(rm.distMm, 1)} мм` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === 'ops' && (
        <>
          <Panel title="Дублети в кутах (ЗК-11)" right={<Tag tone={doublets.length ? 'amber' : 'green'}>{doublets.length}</Tag>}>
            <Field label="поріг, мм" hint="5–8 мм у 81-1395178, до 42 мм у 81-1130988"><NumInput value={doubletMm} onChange={setDoubletMm} min={1} step={1} width="w-16" /></Field>
            {!plan && <div className="text-[12px] text-slate-500">Контуру стін на плані не знайшов.</div>}
            {plan && (
              <div className="text-[12px] text-slate-600 mb-1">Контур «{plan.layer}»: {plan.points.length} вершин, {plan.closed ? 'замкнений' : 'відкритий — лишаємо відкритим (ЗК-14)'}</div>
            )}
            {doublets.length > 0 && (
              <ul className="m-0 p-0 list-none text-[12px] space-y-0.5 max-h-40 overflow-y-auto">
                {doublets.map((d) => {
                  const on = !accepted || accepted.has(d.i);
                  return (
                    <li key={d.i} className="flex items-center gap-2">
                      <input type="checkbox" className="!w-4 !h-4 !m-0" checked={on} onChange={() => toggle(d.i)} disabled={!d.intersection} />
                      <span>вершини {d.i + 1}–{d.i + d.count}: {fmt(d.distMm, 1)} мм</span>
                      <span className="text-slate-400 ml-auto">{d.intersection ? `→ Δ ${fmt(d.deltaMm[0], 1)} / ${fmt(d.deltaMm[1], 1)}` : 'паралельні'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex gap-1 mt-2">
              <button type="button" className={BTN_GREEN} disabled={!processed || processed.replaced === 0} onClick={acceptDoublets}><Check className="w-3.5 h-3.5" /> Прийняти {processed?.replaced ?? 0}</button>
              {accepted && <button type="button" className={BTN_IDLE} onClick={() => setAccepted(null)}>усі</button>}
              {model.derived?.plan && <Tag tone="green">прийнято: {model.derived.plan.replaced}</Tag>}
            </div>
          </Panel>

          <Panel title="Зшити розсипане (ЗК-15)" right={gaps.length > 0 ? <label className="text-[11.5px] text-slate-500 flex items-center gap-1"><input type="checkbox" className="!w-3.5 !h-3.5 !m-0" checked={showGaps} onChange={(e) => setShowGaps(e.target.checked)} />розриви</label> : undefined}>
            <Field label="поріг, мм"><NumInput value={stitchMm} onChange={setStitchMm} min={0.5} step={0.5} width="w-16" /></Field>
            <div className="text-[12px] text-slate-600">
              Зараз: <b>{geomChains.length}</b> ланцюгів, {geomChains.filter((c) => c.closed).length} замкнених.
              {stitchPreview && (
                <div className={stitchPreview.chains < geomChains.length ? 'text-emerald-700' : 'text-slate-500'}>
                  Поріг {fmt(stitchMm, 1)} мм дасть <b>{stitchPreview.chains}</b> ланцюгів
                  {stitchPreview.chains < geomChains.length ? ` (−${geomChains.length - stitchPreview.chains})` : ''}, {stitchPreview.closed} замкнених.
                </div>
              )}
            </div>
            {gaps.length > 0 && (
              <div className="mt-1.5">
                <div className="text-[11.5px] text-slate-500 mb-1">Розриви між кінцями, мм — клік ставить поріг:</div>
                <div className="flex flex-wrap gap-1">
                  {gaps.slice(0, 10).map((g, i) => {
                    const on = g.distMm <= stitchMm;
                    return (
                      <button key={i} type="button" title={`Поставити поріг ${fmt(Math.ceil(g.distMm * 10) / 10, 1)} мм`}
                        className={`!px-1.5 !py-0.5 !min-h-0 rounded border text-[11.5px] font-mono ${on ? '!bg-emerald-50 !text-emerald-700 !border-emerald-300' : '!bg-white !text-rose-600 !border-rose-200'}`}
                        onClick={() => setStitchMm(Math.ceil(g.distMm * 10) / 10)}>
                        {fmt(g.distMm, 1)}
                      </button>
                    );
                  })}
                  {gaps.length > 10 && <span className="text-[11.5px] text-slate-400 self-center">і ще {gaps.length - 10}</span>}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Зелений — поріг його вже перекриває, червоний — ні. На плані ці місця показані пунктиром.</div>
              </div>
            )}
            <button type="button" className={`${BTN_IDLE} mt-2`} onClick={doStitch}><Scissors className="w-3.5 h-3.5" /> Зшити з порогом</button>
          </Panel>

          <Panel title="Довернути по ребру (ЗК-10)">
            {edges.length === 0 ? <div className="text-[12px] text-slate-500">Немає ребер.</div> : (
              <>
                <select className="w-full h-7 border border-slate-300 rounded text-[12.5px] bg-white mb-1" value={chosenEdge} onChange={(e) => setEdgeIdx(Number(e.target.value))}>
                  {edges.map((e) => <option key={e.i} value={e.i}>ребро {e.i + 1}: {fmt(e.lengthMm, 0)} мм · {fmt(e.angleDeg, 3)}° → доворот {fmt(e.rotDeg, 3)}°</option>)}
                </select>
                <button type="button" className={BTN_IDLE} onClick={doRotate}><RotateCw className="w-3.5 h-3.5" /> Довернути весь замір</button>
              </>
            )}
          </Panel>

          {model.walls.length > 0 && (
            <Panel title="Переріз на висоті (ЗК-32)">
              <Field label="z, мм від нуля заміру" hint="нуль у файлі — верх корпусів (ЗК-54), тому висота панелі ≈ 0…620">
                <NumInput value={sectionH ?? sectionDefault} onChange={(v) => setSectionH(v)} step={10} width="w-20" />
              </Field>
              <div className="flex gap-1 items-center">
                <button type="button" className={BTN_IDLE} onClick={() => setSectionH(sectionH ?? sectionDefault)}><Crosshair className="w-3.5 h-3.5" /> Побудувати</button>
                <button type="button" className={BTN_GREEN} disabled={!sectionSegs.length} onClick={acceptSection}><Check className="w-3.5 h-3.5" /> Прийняти</button>
                {sectionSegs.length > 0 && <span className="text-[12px] text-slate-500">{sectionSegs.length} відрізків</span>}
              </div>
            </Panel>
          )}

          {model.rawPoints.length > 0 && model.walls.length > 0 && (
            <Panel title="Хвиля стіни (ЗК-33)" right={<label className="text-[11.5px] text-slate-500 flex items-center gap-1"><input type="checkbox" className="!w-3.5 !h-3.5 !m-0" checked={waveOn} onChange={(e) => setWaveOn(e.target.checked)} />показати</label>}>
              <Field label="поріг, мм"><NumInput value={waveThr} onChange={setWaveThr} min={1} step={1} width="w-16" /></Field>
              {waveOn && (
                <div className="text-[12px] text-slate-600">
                  Точок біля стін: {wStats.count} · поза ±{waveThr}: <b>{wStats.over}</b> · max {fmt(wStats.maxMm, 1)} · RMS {fmt(wStats.rmsMm, 1)} мм
                  <div className="text-slate-400 mt-0.5">зелене ≤ поріг · жовте ≤ 2× · червоне далі; знак «+» — у кімнату</div>
                </div>
              )}
            </Panel>
          )}

          {horizon && (
            <Panel title="Горизонт по лазеру (ЗК-34)">
              <div className="text-[12px] text-slate-600">
                Лінія лазера: z = {fmt(horizon.zMean, 1)} мм, розкид {fmt(horizon.spreadMm, 2)} мм, точок {horizon.pointCount}
                {horizon.perWall.length > 0 && (
                  <table className="w-full text-[11.5px] mt-1">
                    <tbody>{horizon.perWall.map((w) => <tr key={w.wallIndex}><td className="pr-2">{w.layer}</td><td className="text-right">{fmt(w.tiltDeg, 3)}°</td><td className="text-right text-slate-500 pl-2">{fmt(w.mmPerM, 2)} мм/м</td></tr>)}</tbody>
                  </table>
                )}
              </div>
            </Panel>
          )}

          {model.walls.length > 0 && (
            <Panel title="Панель зі стіни (ЗК-30)" right={wall && <button type="button" className={`${BTN_IDLE} !min-h-6 !py-0 !px-2 text-[11.5px]`} onClick={() => setView('wall')}>показати</button>}>
              <Field label="нуль по висоті">
                <select className="h-7 border border-slate-300 rounded text-[12.5px] bg-white" value={panelOpts.zeroMode} onChange={(e) => setPanelOpts({ ...panelOpts, zeroMode: e.target.value as PanelFromWallOptions['zeroMode'] })}>
                  <option value="cabinet-top">верх корпусів (ЗК-54)</option>
                  <option value="floor">підлога</option>
                  <option value="custom">своє число</option>
                </select>
              </Field>
              {panelOpts.zeroMode === 'custom' && <Field label="z нуля, мм"><NumInput value={panelOpts.zZeroMm ?? 0} onChange={(v) => setPanelOpts({ ...panelOpts, zZeroMm: v })} step={1} width="w-20" /></Field>}
              <Field label="низ панелі над нулем, мм" hint="43 = камінь 20 + фанера 20 + шов ≈ 3 (ЗК-54)"><NumInput value={panelOpts.baseMm} onChange={(v) => setPanelOpts({ ...panelOpts, baseMm: v })} step={1} width="w-20" /></Field>
              <Field label="дублети в розгортці, мм" hint="до 75 мм у 81-1395178"><NumInput value={panelOpts.doubletMm} onChange={(v) => setPanelOpts({ ...panelOpts, doubletMm: v })} step={5} width="w-20" /></Field>
              <Field label="зсув горизонталей, мм" hint="ЗК-18: −5,5 у кейсі — гіпотеза, 0 = вимкнено"><NumInput value={panelOpts.horizontalShiftMm} onChange={(v) => setPanelOpts({ ...panelOpts, horizontalShiftMm: v })} step={0.5} width="w-20" /></Field>
              <label className="flex items-center gap-2 text-[12.5px] text-slate-600 py-1"><input type="checkbox" className="!w-4 !h-4 !m-0" checked={panelOpts.dropTraversalEnds} onChange={(e) => setPanelOpts({ ...panelOpts, dropTraversalEnds: e.target.checked })} />викидати кінці обходу (ЗК-30)</label>
              {wall && panel && (
                <div className="text-[12px] text-slate-700 mt-1 space-y-0.5">
                  <div><b>{wall.layer}</b>: панель <b>{fmt(panel.widthMm, 1)} × {fmt(panel.heightMm, 1)}</b> мм, {panel.polygon.length} вершин</div>
                  <div className="text-slate-500">кінців обходу знято {panel.droppedEnds} · дублетів замінено {panel.doubletsReplaced} · кутів ≠ 90/180: {panel.angles.filter((a) => a !== undefined && Math.abs(a - 90) > 0.5 && Math.abs(a - 180) > 0.5).length}</div>
                  <div>Розеток: <b>{panel.socketCount}</b>{panel.sockets.map((s, i) => <span key={i} className="block text-slate-600">· {fmt(s.wMm, 0)} × {fmt(s.hMm, 0)}, від лівого краю {fmt(s.uMin, 0)}, від правого {fmt(panel.widthMm - s.uMax, 0)}, низ {fmt(s.vMin, 0)} над низом панелі</span>)}</div>
                </div>
              )}
              <div className="flex gap-1 mt-2 items-center">
                <button type="button" className={BTN_GREEN} disabled={!panel} onClick={acceptPanel}><Check className="w-3.5 h-3.5" /> Прийняти панель</button>
                {model.derived?.panels?.length ? <Tag tone="green">прийнято: {model.derived.panels.length}</Tag> : null}
              </div>
            </Panel>
          )}

          {model.walls.length > 0 && <div className="text-[11.5px] text-slate-400 flex items-center gap-1"><Waves className="w-3.5 h-3.5" /> Площини стін уже підігнані приладом (RMS {model.walls.map((w) => fmt(w.planeRmsMm, 3)).join(' / ')} мм, ЗК-22) — «хвиля» читається із сирих точок.</div>}
        </>
      )}
    </aside>
  );
}

function ChainsTable({ model, markSegs }: { model: MeasureModel; markSegs: Set<string> }) {
  const chains = model.chains.slice(0, 40);
  return (
    <div>
      <p className="text-[11.5px] text-slate-500 mt-0 mb-2">Зшито за близькістю кінців (1,5 мм). Це чернетка, не затверджений контур (НЕ-3). Кути ≠ 90° ± 0,5 підсвічені.</p>
      {chains.map((c) => {
        const odd = c.cornerAngles.filter((a) => a !== undefined && Math.abs(a - 90) > 0.5 && Math.abs(a - 180) > 0.5);
        return (
          <details key={c.id} className="mb-1.5 bg-white border border-slate-200 rounded" open={c.closed}>
            <summary className="cursor-pointer px-2 py-1 text-[12.5px] flex items-center gap-2">
              <span className="font-semibold text-slate-800">{c.layer}</span>
              <span className="text-slate-500">{c.points.length} т. · {fmt(c.lengthMm / 1000, 2)} м</span>
              {c.segmentIds.every((id) => markSegs.has(id)) && <Tag tone="amber">мітка М/В</Tag>}
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
    </div>
  );
}

export default MeasureTab;
