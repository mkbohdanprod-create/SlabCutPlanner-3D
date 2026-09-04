/**
 * МАРШРУТ ПО ЦЕХУ — по замовленню і по кожній деталі — 04.09.2026.
 *
 * За `06_ОБУЧАЛОЧКА/ПРАВИЛА_ВИРОБНИЦТВА.md` (розділ A — мапа цеху ВЦ-1,
 * розділ B — повернення ВЦ-7/ВЦ-18/ВЦ-5, обхід «Мийки» при мийці
 * замовника, паралельна гілка металокаркаса), `ПРАВИЛА_MES.md` (МЕС-9:
 * маршрут — граф, ділянка може зустрітись двічі) і форматом
 * `КЕЙСИ/<замовлення>/МАРШРУТ_<замовлення>.pdf`: «Мапа руху по цеху» + «Що робили з
 * кожною деталлю» (ПИЛА / ВОДА / ЧПК / ШЛІФ-ФАСКА / КОСМ).
 *
 * Джерело кількостей — факти рушія (`extractProductionFacts`), кожен із
 * прив'язкою до парта (`ref.partId`) або деталі. Тут нічого не рахується
 * вдруге: факти лише розкладаються по партах і ділянках.
 *
 * Що з цього ФАКТ, а що логіка: склад ділянок і задіяність — з фактів;
 * порядок між ділянками — ВЦ-1 (виведено з технологічної логіки,
 * підтвердити в Саші); петлі ВЦ-7 і ВЦ-18 ставляться лише за ознаками з
 * правил (власна мийка; плінтус із профілем тонший за лист).
 */
import type { DetailPart, Project } from '../../domain/types';
import type { ProductionFact } from '../../engines/productionFacts';
import { referenceData } from '../../domain/defaults';
import { round3 } from './techCard';

export type RouteStage = 'ПІДГОТОВКА' | 'РІЗ' | 'ЧПК' | 'СПЕЦ' | 'РУЧНА ОБРОБКА' | 'ЗДАЧА';

export interface RouteNode {
  id: string;
  stage: RouteStage;
  label: string;
  sub: string[];
  /** Ділянка з послугами / контроль-логістика без білінгу / зовнішній крок (монтаж). */
  kind: 'area' | 'control' | 'external';
  active: boolean;
  /** Крок, специфічний для цього замовлення (синім у кейсах). */
  highlight?: boolean;
  /** Чому ділянка не задіяна — підпис для «НЕ БЕРУТЬ УЧАСТІ». */
  why?: string;
}

export interface RouteLoop {
  from: string;
  to: string;
  label: string;
  rule: string;
}

export interface PartRoute {
  partId: string;
  detailId: string;
  name: string;
  role: 'main' | 'thickening' | 'fold' | 'skirting' | 'sink' | 'leg' | 'other';
  nominal: string;
  blank?: string;
  slab?: string;
  pila: string[];
  voda: string[];
  chpk: string[];
  spec: string[];
  grind: string[];
  cosm: boolean;
  /** Ділянки, які проходить саме цей парт, у порядку ВЦ-1. */
  areas: string[];
  loops: RouteLoop[];
}

export interface RouteModel {
  nodes: RouteNode[];
  loops: RouteLoop[];
  parts: PartRoute[];
  /** Ознаки замовлення для шапки («особливості»). */
  features: string[];
  hasSpec: boolean;
}

const m = (v: number) => round3(v).toFixed(3).replace(/\.?0+$/, '');
const mm = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

function profileLabel(id: string | undefined): string {
  if (!id) return '';
  const def = referenceData.edgeProfiles?.find((p) => p.id === id);
  return def?.shortLabel ?? id;
}

function bbox(points: Array<{ x: number; y: number }> | undefined) {
  if (!points?.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { w: maxX - minX, h: maxY - minY };
}

function roleOf(part: DetailPart): PartRoute['role'] {
  if (part.edgeKind === 'thickening') return 'thickening';
  if (part.edgeKind === 'fold') return 'fold';
  if (part.type === 'Мийка') return 'sink';
  if (part.type === 'Опора') return 'leg';
  if (part.parentDetailId && /плінтус/i.test(part.name)) return 'skirting';
  if (part.type === 'Потовщення') return 'thickening';
  if (part.type === 'Підворот') return 'fold';
  return part.isMain ? 'main' : 'other';
}

export function buildRouteModel(project: Project, parts: DetailPart[], facts: ProductionFact[], opts: {
  hasMetal: boolean;
  hasPlywood: boolean;
  slabsUsed: number;
  areaM2: number;
}): RouteModel {
  const cutParts = parts.filter((p) => p.points?.length >= 3);
  const byPart = new Map<string, ProductionFact[]>();
  const add = (pid: string | undefined, f: ProductionFact) => { if (!pid) return; if (!byPart.has(pid)) byPart.set(pid, []); byPart.get(pid)!.push(f); };
  const partsOfDetail = (did: string) => cutParts.filter((p) => p.detailId === did);
  /**
   * Парт деталі, на якому лежить сторона: після розрізу стиком сторона B
   * живе на правій половині, D — на лівій (`sideSegments` парта). Без
   * збігу — перший парт деталі.
   */
  const partForSide = (did: string, side?: string) => {
    const list = partsOfDetail(did);
    if (side) {
      const hit = list.find((p) => p.sideSegments && Object.prototype.hasOwnProperty.call(p.sideSegments, side))
        ?? list.find((p) => p.sideAliases && Object.values(p.sideAliases).includes(side as never));
      if (hit) return hit.id;
    }
    return list[0]?.id;
  };
  for (const f of facts) {
    const r = f.ref;
    if (!r) continue;
    if (r.partId) {
      add(r.partId, f);
      // Шов між двома половинами однієї деталі: пропил і кромка стику є на
      // ОБОХ половинах (кейс 81-1430086: пропил у кожній деталі з'єднання).
      if ((f.kind === 'joint_count' || f.kind === 'joint_length') && r.detailId) {
        for (const sib of partsOfDetail(r.detailId)) if (sib.id !== r.partId) add(sib.id, { ...f, ref: { ...r, partId: sib.id } });
      }
      continue;
    }
    if (r.elementPath && (f.kind === 'joint_count' || f.kind === 'joint_length')) {
      // Стик двох елементів (стільниця ↔ опора): по одному запису на кожну сторону з'єднання
      add(partForSide(`${r.elementPath}/detail:main`, r.side), f);
      if (r.elementPathB) add(partForSide(`${r.elementPathB}/detail:main`, r.sideB), { ...f, ref: { ...r, side: r.sideB } });
      continue;
    }
    const did = r.detailId ?? (r.elementPath ? `${r.elementPath}/detail:main` : undefined);
    if (did) add(partForSide(did, r.side), f);
  }

  const slabIndex = new Map<string, number>();
  (project.slabs ?? []).forEach((s, i) => slabIndex.set(s.id, i + 1));
  const slabOfPart = new Map<string, number>();
  for (const pl of project.placements ?? []) { const n = slabIndex.get(pl.slabId); if (n) slabOfPart.set(pl.partId, n); }
  const trimNoted = new Set<number>();

  const textureOn = Boolean(project.textureSelectionEnabled) || (project.textureLayouts?.length ?? 0) > 0;
  const partRoutes: PartRoute[] = [];
  let anySink = false; let anyGlue = false; let anyGrind = false; let anyWater = false; let anyChpk = false;
  const loops: RouteLoop[] = [];

  for (const part of cutParts) {
    const fs = byPart.get(part.id) ?? [];
    const role = roleOf(part);
    const pila: string[] = []; const voda: string[] = []; const chpk: string[] = []; const spec: string[] = []; const grind: string[] = [];
    const sum = (kind: ProductionFact['kind'], variant?: string) => fs.filter((f) => f.kind === kind && (variant === undefined || f.variant === variant)).reduce((a, f) => a + f.qty, 0);

    // ПИЛА
    const slabNo = slabOfPart.get(part.id);
    if (slabNo && !trimNoted.has(slabNo)) { trimNoted.add(slabNo); pila.push(`обпил листа ${slabNo} (9,6 м.п., ВЦ-16)`); }
    const saw = sum('saw_cut');
    if (saw > 0) pila.push(`${role === 'thickening' || role === 'fold' ? 'смуга' : 'розкрій заготовки'} P ${m(saw)} м.п.`);
    const chamfer = fs.filter((f) => f.kind === 'corner' && f.variant === 'chamfer');
    if (chamfer.length) pila.push(`зріз кута ×${chamfer.length} (ГІПОТЕЗА: пилою)`);
    const miter = fs.filter((f) => f.kind === 'joint_length' && f.variant === 'miter45');
    if (miter.length) pila.push(`різ під 45° ${miter.map((f) => m(f.qty)).join(' + ')} м.п.${miter.some((f) => f.ref?.side) ? ` (сторона ${miter.map((f) => f.ref?.side ?? '').filter(Boolean).join(', ')})` : ''}`);

    // ВОДА
    const water = sum('waterjet_cut');
    if (water > 0) voda.push(`криволінійний контур ${m(water)} м.п.`);
    (part.holes ?? []).forEach((hole) => {
      const b = bbox(hole); if (!b) return;
      const round = Math.abs(b.w - b.h) < 2 && hole.length > 8;
      if (round) voda.push(`отвір Ø${mm(b.w)}${b.w < 100 ? '' : ' (водою)'}`);
      else voda.push(`виріз ${mm(b.w)} × ${mm(b.h)}`);
    });
    const lcut = fs.filter((f) => f.kind === 'corner' && f.variant === 'l-cut');
    if (lcut.length) voda.push(`виріз кута ×${lcut.length} (кейс 81-1430086: під цоколь, водою)`);
    const holeLarge = sum('hole_large');
    if (holeLarge > 0 && !(part.holes ?? []).length) voda.push(`отвір >100: ${m(holeLarge)} м.п.`);

    // ЧПК
    const edgeByProfile = new Map<string, { sides: string[]; len: number }>();
    for (const f of fs.filter((x) => x.kind === 'edge')) {
      const key = f.variant ?? '';
      const cur = edgeByProfile.get(key) ?? { sides: [], len: 0 };
      if (f.ref?.side && !cur.sides.includes(f.ref.side)) cur.sides.push(f.ref.side);
      cur.len += f.qty;
      edgeByProfile.set(key, cur);
    }
    for (const [prof, e] of edgeByProfile) {
      chpk.push(`${profileLabel(prof)} ${e.sides.length ? 'на ' + e.sides.join(', ') : ''} ${m(e.len)} м.п. — калібр. → профіль → полір. (ВЦ-17)`.replace(/\s+/g, ' '));
    }
    const butt = fs.filter((f) => f.kind === 'joint_length' && f.variant !== 'miter45');
    if (butt.length) chpk.push(`кромка стику ${butt.map((f) => `${f.ref?.side ? f.ref.side + ' ' : ''}${mm(f.qty * 1000)}`).join('; ')} мм`);
    const radius = fs.filter((f) => f.kind === 'corner' && f.variant === 'radius');
    if (radius.length) chpk.push(`радіус кута ×${radius.length}`);
    const relem = fs.filter((f) => f.kind === 'radius_element');
    if (relem.length) chpk.push(`радіусний елемент ×${relem.length}`);
    const holeSmall = sum('hole_small');
    if (holeSmall > 0) voda.push(`отвори Ø<100 ×${holeSmall} (Ø12 під муфту — ЧПК коронкою; рушій не розрізняє, ПС-5)`);

    // СПЕЦ: мийки, поклейка
    if (role === 'sink') { spec.push('склейка чаші, фарбування (Мийки)'); anySink = true; }
    if (role === 'thickening') { spec.push(`поклейка потовщення${part.edgeSide ? ' на ' + part.edgeSide : ''} (Поклейка крайки)`); anyGlue = true; }
    if (role === 'fold') { spec.push(`поклейка підвороту${part.edgeSide ? ' на ' + part.edgeSide : ''} під 45° (Поклейка крайки)`); anyGlue = true; }

    // ШЛІФ / ФАСКА
    const jointCount = sum('joint_count');
    if (jointCount > 0) { grind.push(`пропил для стику ×${jointCount}`); grind.push('техфаска по стику'); }
    const manual = fs.filter((f) => f.kind === 'edge_manual_finish');
    if (manual.length) grind.push(`ручна доводка ${manual.map((f) => f.ref?.side ?? '').filter(Boolean).join(', ')} ${m(manual.reduce((a, f) => a + f.qty, 0))} м.п.`.replace(/\s+/g, ' '));
    if (miter.length && role === 'leg') grind.push('зведення фаски на опорі');

    // Петлі
    const partLoops: RouteLoop[] = [];
    if (role === 'sink') partLoops.push({ from: 'sinks', to: 'chpk', label: 'калібрування склеєної мийки', rule: 'ВЦ-7' });
    const thin = Math.min(part.width, part.height) <= 40 && edgeByProfile.size > 0;
    if (role === 'skirting' && thin) partLoops.push({ from: 'chpk', to: 'saw', label: 'підрізка плінтуса в розмір після фрезерування', rule: 'ВЦ-18' });
    for (const l of partLoops) if (!loops.some((x) => x.rule === l.rule)) loops.push(l);

    if (voda.length) anyWater = true;
    if (chpk.length) anyChpk = true;
    if (grind.length) anyGrind = true;

    const areas: string[] = ['Склад'];
    if (textureOn) areas.push('Підбір текстури');
    areas.push('Пильний центр');
    if (voda.length) areas.push('Порізка водою');
    if (chpk.length) areas.push('ЧПК');
    if (role === 'sink') areas.push('Мийки', 'ЧПК');
    if (role === 'thickening' || role === 'fold') areas.push('Поклейка крайки');
    if (role === 'skirting' && thin) areas.push('Пильний центр');
    if (grind.length) areas.push('Шліфування');
    if (role === 'main' || role === 'leg') areas.push('Косметика');
    areas.push('Комплектація');

    const nb = bbox(part.nominalPoints ?? part.points); const bb = bbox(part.points);
    const nominal = nb ? `${mm(nb.w)} × ${mm(nb.h)}` : `${mm(part.width)} × ${mm(part.height)}`;
    const blank = nb && bb && (Math.abs(bb.w - nb.w) > 0.4 || Math.abs(bb.h - nb.h) > 0.4) ? `${mm(bb.w)} × ${mm(bb.h)}` : undefined;

    partRoutes.push({
      partId: part.id, detailId: part.detailId, name: part.name, role, nominal, blank,
      slab: slabNo ? `слеб ${slabNo}` : undefined,
      pila, voda, chpk, spec, grind, cosm: role === 'main' || role === 'leg' || role === 'other',
      areas, loops: partLoops,
    });
  }

  // Вузли мапи
  const sawM = round3(facts.filter((f) => f.kind === 'saw_cut').reduce((a, f) => a + f.qty, 0));
  const waterM = round3(facts.filter((f) => f.kind === 'waterjet_cut' || f.kind === 'cutout_perimeter' || f.kind === 'hole_large').reduce((a, f) => a + f.qty, 0));
  const holes = facts.filter((f) => f.kind === 'hole_small').reduce((a, f) => a + f.qty, 0);
  const edgeM = round3(facts.filter((f) => f.kind === 'edge').reduce((a, f) => a + f.qty, 0));
  const jointM = round3(facts.filter((f) => f.kind === 'joint_length').reduce((a, f) => a + f.qty, 0));
  // Пропили — сума по партах (по одному в КОЖНІЙ деталі з'єднання), а не
  // кількість стиків: 3 стики острова дають 6 пропилів (кейс 81-1430086).
  const joints = partRoutes.reduce((a, p) => a + (byPart.get(p.partId) ?? []).filter((f) => f.kind === 'joint_count').reduce((x, f) => x + f.qty, 0), 0);
  const jointsN = facts.filter((f) => f.kind === 'joint_count').reduce((a, f) => a + f.qty, 0);
  const manualM = round3(facts.filter((f) => f.kind === 'edge_manual_finish').reduce((a, f) => a + f.qty, 0));
  const slabs = project.slabs ?? [];
  const slabLabel = slabs.length ? `${opts.slabsUsed || slabs.length} лист${slabs.length === 1 ? '' : 'и'} · ${slabs.slice(0, 1).map((s) => `${Math.round(s.width)}×${Math.round(s.height)}`).join('')}` : 'листів у проєкті немає';
  const mainCount = cutParts.filter((p) => p.isMain).length;

  const nodes: RouteNode[] = [
    { id: 'stock', stage: 'ПІДГОТОВКА', label: 'Склад каменю', sub: [slabLabel], kind: 'area', active: true },
    { id: 'texture', stage: 'ПІДГОТОВКА', label: 'Підбір текстури', sub: ['крій на фото слебів (ВЦ-10)'], kind: 'area', active: textureOn, highlight: textureOn, why: 'підбір не вмикали' },
    { id: 'saw', stage: 'РІЗ', label: 'Пильний центр', sub: [`Combicut · ${m(sawM + 9.6 * opts.slabsUsed)} м.п.`, opts.slabsUsed ? `обпил ${m(9.6 * opts.slabsUsed)} + розкрій ${m(sawM)}` : `розкрій ${m(sawM)}`], kind: 'area', active: true },
    { id: 'water', stage: 'РІЗ', label: 'Порізка водою', sub: [`гідроабразив · ${m(waterM)} м.п.${holes ? ` + ${holes} отв.` : ''}`], kind: 'area', active: anyWater, why: 'кривих і вирізів немає' },
    { id: 'chpk', stage: 'ЧПК', label: 'ЧПК NC300', sub: [`кромка ${m(edgeM)} м.п.${jointM ? ` · стики ${m(jointM)}` : ''}`, 'калібр. → профіль → полір. (ВЦ-17)'], kind: 'area', active: anyChpk, why: 'кромок і стиків немає' },
    { id: 'sinks', stage: 'СПЕЦ', label: 'Мийки', sub: ['склейка чаші, вклейка'], kind: 'area', active: anySink, highlight: anySink, why: 'мийка замовника — вклейка на об\'єкті (ВЦ-3)' },
    { id: 'glue', stage: 'СПЕЦ', label: 'Поклейка крайки', sub: ['опуск, підворот, облицювання'], kind: 'area', active: anyGlue, highlight: anyGlue, why: 'опусків немає' },
    { id: 'plywood', stage: 'СПЕЦ', label: 'Фанера', sub: ['підклад під борт (КП-4)'], kind: 'area', active: opts.hasPlywood, highlight: opts.hasPlywood, why: 'борт не вищий за плиту' },
    { id: 'metal', stage: 'СПЕЦ', label: 'Металокаркас', sub: ['окреме замовлення, «Доставка: Цех»'], kind: 'external', active: opts.hasMetal, highlight: opts.hasMetal, why: 'каркас не потрібен' },
    { id: 'grind', stage: 'РУЧНА ОБРОБКА', label: 'Шліфування / фаска', sub: [`${joints ? `${joints} пропил${joints === 1 ? '' : 'и'}` : ''}${manualM ? ` · ${m(manualM)} м.п. доводки` : ''}`.replace(/^ · /, '') || 'техфаска'], kind: 'area', active: anyGrind, why: 'стиків і ручної доводки немає' },
    { id: 'polish', stage: 'РУЧНА ОБРОБКА', label: 'Полірування тилу', sub: ['Wanlong · м² тильної'], kind: 'area', active: false, why: 'у моделі немає (ПИТАННЯ)' },
    { id: 'cosm', stage: 'ЗДАЧА', label: 'Косметика', sub: [`${m(opts.areaM2)} м² (ПС-1)`], kind: 'area', active: true },
    { id: 'qc', stage: 'ЗДАЧА', label: 'ВТК', sub: ['контроль'], kind: 'control', active: true },
    { id: 'kit', stage: 'ЗДАЧА', label: 'Комплектація', sub: [`${mainCount} детал${mainCount === 1 ? 'ь' : mainCount < 5 ? 'і' : 'ей'}`], kind: 'control', active: true },
    { id: 'pack', stage: 'ЗДАЧА', label: 'Пакування', sub: [`на монтаж · ${m(opts.areaM2)} м² (ПК-1)`], kind: 'area', active: true },
    { id: 'montage', stage: 'ЗДАЧА', label: 'Монтаж', sub: [anySink ? 'вклейка мийки, акт (ВЦ-15)' : 'вклейка мийки замовника (ВЦ-3), акт (ВЦ-15)'], kind: 'external', active: true },
  ];

  const features: string[] = [];
  if (jointsN > 1) features.push(`Стиків ${jointsN}, а не один: ${joints} пропил${joints < 5 ? 'и' : 'ів'} — по одному в кожній деталі з'єднання (кейс 81-1430086).`);
  if (cutParts.some((p) => roleOf(p) === 'leg')) features.push('Є опори: кромка лише на бічних ребрах, припуск по одній осі (кейс 81-1430086).');
  if (!anySink) features.push('Мийка замовника — ділянка «Мийки» не бере участі, вклейка на об\'єкті (ВЦ-3).');
  else features.push('Власна мийка — склейка чаші і повернення на ЧПК для калібрування (ВЦ-7).');
  if (opts.hasMetal) features.push('Металокаркас — окреме замовлення, зустріч на монтажі (МЕС-6).');
  if (loops.some((l) => l.rule === 'ВЦ-18')) features.push('Плінтус тонший за лист: профіль на широкій заготовці, потім назад на пилу (ВЦ-18).');

  return { nodes, loops, parts: partRoutes, features, hasSpec: anySink || anyGlue || opts.hasPlywood || opts.hasMetal };
}
