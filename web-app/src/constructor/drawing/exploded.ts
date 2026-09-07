/**
 * ВИБУХОВА СХЕМА (ізометрія) — інструкція збірки «як рознос тумби у меблевиків» (07.09.2026).
 *
 * Два аркуші на виріб:
 *  · «Збірка в цеху» — що клеїться в цеху: мийка з каменю під виріз,
 *    підвороти й потовщення, бортик; опора — там, де каже таблиця стиків.
 *  · «Монтаж на об'єкті» — що стикується на монтажі: стінова панель,
 *    стик стільниць (розпил під лист), опора (за словами власника 07.09).
 * Деталі розсунуті від місця склейки, штрихова лінія — куди ставити,
 * балон з номером — крок у таблиці праворуч. Зверху праворуч — виріб
 * у зборі (та сама ізометрія без розсуву).
 *
 * Це не рендер 3D-режиму, а власна ізометрія з моделі креслення: призми
 * (контур × товщина) в осях X (уздовж A), Y (углиб від стіни до кухаря),
 * Z (угору). Екран: sx = (X − Y)·cos30°, sy = (X + Y)·sin30° − Z, тож
 * видимі грані — верх, +X і +Y (лицьова). Порядок малювання — художника:
 * далі → ближче за X + Y − Z.
 */
import type { DrawingSheet, Entity, Pt } from './model';
import { SHEET, TEXT } from './style';
import { bbox, fmtMm, labelPoint, signedArea, sidesOf, textW } from './geom';
import { layoutBody, makeSheet, type DrawModel, type DrawPart, type SetInput } from './set';
import { miterJointFor } from '../../engines/miterAssembly';

/* ── тіла ───────────────────────────────────────────────────────── */

interface Solid {
  name: string;
  kind: DrawPart['kind'] | 'seam';
  /** контур у плані (X, Y), мм; Y росте від стіни до кухаря */
  footprint: Pt[];
  z0: number; z1: number;
  /** розсув у вибуховому виді, мм */
  explode: { x: number; y: number; z: number };
  /** отвори у верхній грані (вирізи стільниці) */
  holes?: Pt[][];
  /** крок у таблиці (балон) */
  step?: number;
  /** куди прикладається — точка на цільовому тілі (для штрихової лінії) */
  anchorTo?: { x: number; y: number; z: number };
  tint?: 'stone' | 'glue' | 'wall';
}

interface Step { no: number; what: string; how: string; where: 'цех' | 'об’єкт'; color: string }

const C30 = Math.cos(Math.PI / 6); const S30 = Math.sin(Math.PI / 6);
const proj = (x: number, y: number, z: number): Pt => ({ x: (x - y) * C30, y: (x + y) * S30 - z });

/** Тіла одного виробу з моделі креслення (розкладка стільниць — як на збірці, зазор по шву). */
function solidsOf(model: DrawModel, mode: 'shop' | 'site', exploded: boolean): { solids: Solid[]; steps: Step[]; gaps: string[] } {
  const t = model.thickness;
  const { placed } = layoutBody(model, 0);
  const mains = placed.filter((p) => p.dp.kind === 'main');
  const solids: Solid[] = []; const steps: Step[] = []; const gaps: string[] = [];
  const E = exploded ? 1 : 0;
  const stepNo = () => steps.length + 1;

  for (const pl of mains) {
    const holes = pl.dp.holes.map((h) => h.pts.map((q) => pl.holesT(q)));
    solids.push({ name: pl.dp.name, kind: 'main', footprint: pl.pts, z0: -t, z1: 0, explode: { x: 0, y: 0, z: 0 }, holes, tint: 'stone' });
  }
  // мийка з каменю — під вирізом
  const sinkHost = mains.find((pl) => pl.dp.holes.some((h) => h.isSink));
  const sinkHole = sinkHost?.dp.holes.find((h) => h.isSink);
  if (mode === 'shop' && model.sinkDetail && sinkHost && sinkHole) {
    const g = (model.sinkDetail.geometry ?? {}) as { innerVertical?: number };
    const D = g.innerVertical ?? 180; const ts = model.sinkDetail.thickness ?? t;
    const b = bbox(sinkHole.pts.map((q) => sinkHost.holesT(q)));
    const fp = [{ x: b.minX - ts, y: b.minY - ts }, { x: b.maxX + ts, y: b.minY - ts }, { x: b.maxX + ts, y: b.maxY + ts }, { x: b.minX - ts, y: b.maxY + ts }];
    const no = stepNo();
    solids.push({ name: 'Мийка (чаша з каменю)', kind: 'sink', footprint: fp, z0: -t - D - ts, z1: -t, explode: { x: 0, y: 0, z: -E * (D + 260) }, step: no, anchorTo: { x: (b.minX + b.maxX) / 2, y: b.maxY, z: -t }, tint: 'stone' });
    steps.push({ no, what: `Мийка — чаша ${fmtMm(b.w)}×${fmtMm(b.h)}×${fmtMm(D)} з каменю`, how: 'склеїти чашу (аркуш мийки), вклеїти під виріз знизу; зазор під клей 3–4* (ІНС-2)', where: 'цех', color: '#f0b400' });
  }
  for (const ad of model.additions) {
    const pl = placed.find((p) => p.dp === ad); const host = pl?.host ?? mains[0];
    if (!host) continue;
    const side = host.sides.find((s) => s.name === ad.parentSide); if (!side) continue;
    const from = ad.joint?.a.from ?? 0; const to = ad.joint?.a.to ?? side.len;
    const ux = (side.b.x - side.a.x) / side.len; const uy = (side.b.y - side.a.y) / side.len;
    const p0 = { x: side.a.x + ux * from, y: side.a.y + uy * from }; const p1 = { x: side.a.x + ux * to, y: side.a.y + uy * to };
    const n = side.n;
    const strip = (d0: number, d1: number): Pt[] => [
      { x: p0.x + n.x * d0, y: p0.y + n.y * d0 }, { x: p1.x + n.x * d0, y: p1.y + n.y * d0 },
      { x: p1.x + n.x * d1, y: p1.y + n.y * d1 }, { x: p0.x + n.x * d1, y: p0.y + n.y * d1 },
    ];
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const across = Math.min(ad.w, ad.h); const along = Math.max(ad.w, ad.h);
    const isSite = ad.kind === 'wall_panel' || ad.kind === 'leg';
    if ((mode === 'site') !== isSite) continue;
    const no = stepNo();
    if (ad.kind === 'wall_panel') {
      const H = across === t ? along : across; // панель 3000×600: висота — менша сторона
      solids.push({ name: ad.name, kind: 'wall_panel', footprint: strip(0, t), z0: 0, z1: H, explode: { x: n.x * E * 260, y: n.y * E * 260, z: E * 140 }, step: no, anchorTo: { x: mid.x, y: mid.y, z: 0 }, tint: 'wall' });
      steps.push({ no, what: `${ad.name} — ${fmtMm(along)}×${fmtMm(H)}×${fmtMm(t)}`, how: `стик монтажний по стороні ${ad.parentSide} стільниці, стоїть на стільниці впритул до стіни; кріплення — за техпроцесом (ІНС-7)`, where: 'об’єкт', color: '#ff00ff' });
    } else if (ad.kind === 'leg') {
      const H = along; // опора 600×880: висота — більша сторона
      solids.push({ name: ad.name, kind: 'leg', footprint: strip(0, t), z0: -H, z1: 0, explode: { x: n.x * E * 320, y: n.y * E * 320, z: -E * 120 }, step: no, anchorTo: { x: mid.x, y: mid.y, z: -t / 2 }, tint: 'stone' });
      steps.push({ no, what: `${ad.name} — водоспад ${fmtMm(Math.min(ad.w, ad.h))}×${fmtMm(H)}×${fmtMm(t)}`, how: `з'єднання під 45° по стороні ${ad.parentSide}, фаска 2×2 на ребрі, клей; опора до підлоги`, where: 'об’єкт', color: '#ff00ff' });
    } else if (ad.kind === 'fold') {
      solids.push({ name: ad.name, kind: 'fold', footprint: strip(0, t), z0: -across, z1: 0, explode: { x: n.x * E * 220, y: n.y * E * 220, z: -E * 60 }, step: no, anchorTo: { x: mid.x, y: mid.y, z: -t / 2 }, tint: 'stone' });
      steps.push({ no, what: `${ad.name} — смуга ${fmtMm(along)}×${fmtMm(across)}×${fmtMm(t)}`, how: `з'єднання під 45° по стороні ${ad.parentSide} (водоспад), текстура наскрізна, фаска 2×2 на ребрі, клей`, where: 'цех', color: '#f0b400' });
    } else if (ad.kind === 'thickening') {
      const miter = miterJointFor('thickening', model.material);
      solids.push({ name: ad.name, kind: 'thickening', footprint: strip(-across, 0), z0: -2 * t, z1: -t, explode: { x: 0, y: 0, z: -E * 200 }, step: no, anchorTo: { x: mid.x - n.x * across / 2, y: mid.y - n.y * across / 2, z: -t }, tint: 'stone' });
      steps.push({ no, what: `${ad.name} — смуга ${fmtMm(along)}×${fmtMm(across)}×${fmtMm(t)}`, how: miter ? `під ребро сторони ${ad.parentSide} знизу, стик 45° (керамограніт), клей` : `під ребро сторони ${ad.parentSide} знизу, пряма підклейка, клей`, where: 'цех', color: '#f0b400' });
    } else if (ad.kind === 'skirting') {
      solids.push({ name: ad.name, kind: 'skirting', footprint: strip(-t, 0), z0: 0, z1: across, explode: { x: -n.x * E * 0, y: -n.y * E * 0, z: E * 180 }, step: no, anchorTo: { x: mid.x - n.x * t / 2, y: mid.y - n.y * t / 2, z: 0 }, tint: 'stone' });
      steps.push({ no, what: `${ad.name} — ${fmtMm(along)}×${fmtMm(across)}×${fmtMm(t)}`, how: `на стільницю вздовж сторони ${ad.parentSide} впритул до стіни, клей`, where: 'цех', color: '#f0b400' });
    }
  }
  // стик стільниць (розпил під лист) — монтаж
  if (mode === 'site' && mains.length > 1) {
    for (let i = 1; i < mains.length; i += 1) {
      const a = mains[i - 1]; const b = mains[i];
      if (a.dp.detail !== b.dp.detail) continue;
      const sa = a.sides.find((s) => s.seam); if (!sa) continue;
      const no = stepNo();
      // друга частина від'їжджає від шва вздовж нормалі шва першої
      const sol = solids.find((s) => s.name === b.dp.name); if (sol) { sol.explode = { x: sa.n.x * E * 260, y: sa.n.y * E * 260, z: 0 }; sol.step = no; sol.anchorTo = { x: sa.mid.x, y: sa.mid.y, z: -t / 2 }; }
      steps.push({ no, what: `Стик стільниць: ${a.dp.name} + ${b.dp.name}`, how: `стик ${fmtMm(sa.len)} мм по розпилу, склейка на об'єкті*; фаска 2×2 на лицьових ребрах стику`, where: 'об’єкт', color: '#ff00ff' });
      gaps.push('* стик стільниць — де збирати (цех/об’єкт) у моделі не задано, показано як монтажний (ГІПОТЕЗА)');
    }
  }
  if (mode === 'site') {
    const no = stepNo();
    steps.push({ no, what: `${mains.map((m) => m.dp.name).join(', ')} — на корпус`, how: 'посадити на корпуси замовника; нависання від фасадів і рівень — за бланком заміру (КС-9, у моделі нема)', where: 'об’єкт', color: '#ff00ff' });
    gaps.push('Нависання, корпус замовника, кріплення панелі — у моделі нема (ВН-10, ІНС-7)');
  }
  return { solids, steps, gaps };
}

/* ── малювання ──────────────────────────────────────────────────── */

const FACE = { top: '#ffffff', x: '#e4e4e4', y: '#cfcfcf', topWall: '#f3f0ea', topGlue: '#fff1c2' };

function drawSolid(E: Entity[], s: Solid, T: (p: Pt) => Pt, dashedGhost = false) {
  const ex = s.explode; const fp = s.footprint;
  const P3 = (p: Pt, z: number) => T(proj(p.x + ex.x, p.y + ex.y, z + ex.z));
  const area = signedArea(fp);
  const sgn = area > 0 ? 1 : -1;
  const faces: Array<{ pts: Pt[]; fill: string; key: number }> = [];
  for (let i = 0; i < fp.length; i += 1) {
    const a = fp[i]; const b = fp[(i + 1) % fp.length];
    const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
    const n = { x: (dy / len) * sgn, y: (-dx / len) * sgn };
    if (n.x + n.y <= 0.01) continue; // невидима грань
    const fill = Math.abs(n.x) > Math.abs(n.y) ? FACE.x : FACE.y;
    const key = (a.x + b.x) / 2 + (a.y + b.y) / 2 - (s.z0 + s.z1) / 2;
    faces.push({ pts: [P3(a, s.z1), P3(b, s.z1), P3(b, s.z0), P3(a, s.z0)], fill, key });
  }
  faces.sort((p, q) => p.key - q.key);
  const topFill = s.tint === 'wall' ? FACE.topWall : s.tint === 'glue' ? FACE.topGlue : FACE.top;
  const stroke = dashedGhost ? '#9a9a9a' : '#000';
  // верх, потім бічні від дальніх до ближчих
  E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ІЗО', points: fp.map((p) => P3(p, s.z1)), closed: true, fillColor: topFill, color: stroke, weight: 0.35, dashed: dashedGhost });
  for (const h of s.holes ?? []) E.push({ kind: 'polyline', layer: 'Мойка', rule: 'ІЗО', points: h.map((p) => P3(p, s.z1)), closed: true, fillColor: '#f4f4f4', color: stroke, weight: 0.25, dashed: dashedGhost });
  for (const f of faces) E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ІЗО', points: f.pts, closed: true, fillColor: f.fill, color: stroke, weight: 0.35, dashed: dashedGhost });
}

function drawScene(E: Entity[], solids: Solid[], T: (p: Pt) => Pt, withGuides: boolean, balloonAt?: (s: Solid, c: Pt) => void) {
  const key = (s: Solid) => {
    const b = bbox(s.footprint);
    // тіла під плитою (мийка, потовщення) у зібраному виді — за плитою
    const under = (s.kind === 'sink' || s.kind === 'thickening') && s.explode.z === 0 ? -1e6 : 0;
    return under + (b.minX + b.maxX) / 2 + s.explode.x + (b.minY + b.maxY) / 2 + s.explode.y - ((s.z0 + s.z1) / 2 + s.explode.z);
  };
  const sorted = [...solids].sort((p, q) => key(p) - key(q));
  for (const s of sorted) {
    // штрихова «тінь» на місці склейки + лінія переносу
    if (withGuides && s.step && (s.explode.x || s.explode.y || s.explode.z)) {
      const ghost: Solid = { ...s, explode: { x: 0, y: 0, z: 0 } };
      drawSolid(E, ghost, T, true);
    }
    drawSolid(E, s, T);
    if (withGuides && s.step && s.anchorTo) {
      const b = bbox(s.footprint);
      const c3 = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: (s.z0 + s.z1) / 2 };
      const from = T(proj(c3.x + s.explode.x, c3.y + s.explode.y, c3.z + s.explode.z));
      const to = T(proj(s.anchorTo.x, s.anchorTo.y, s.anchorTo.z));
      E.push({ kind: 'polyline', layer: 'Виноска', rule: 'ІЗО', points: [from, to], closed: false, dashed: true, color: '#555', weight: 0.25 });
      // стрілочка в бік місця
      const dx = to.x - from.x; const dy = to.y - from.y; const L = Math.hypot(dx, dy) || 1; const ux = dx / L; const uy = dy / L;
      E.push({ kind: 'polyline', layer: 'Виноска', rule: 'ІЗО', points: [{ x: to.x - ux * 2.4 - uy * 1, y: to.y - uy * 2.4 + ux * 1 }, to, { x: to.x - ux * 2.4 + uy * 1, y: to.y - uy * 2.4 - ux * 1 }], closed: false, color: '#555', weight: 0.35 });
      balloonAt?.(s, from);
    }
  }
}

/** Габарит сцени на екрані (у мм ізометрії до масштабу). */
function sceneBox(solids: Solid[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts: Pt[] = [];
  for (const s of solids) for (const p of s.footprint) for (const z of [s.z0, s.z1]) { pts.push(proj(p.x + s.explode.x, p.y + s.explode.y, z + s.explode.z)); pts.push(proj(p.x, p.y, z)); }
  const b = bbox(pts);
  return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
}

/* ── аркуші ─────────────────────────────────────────────────────── */

export function composeExplodedSheet(model: DrawModel, input: SetInput, mode: 'shop' | 'site', sheetNo: number, sheetCount: number): DrawingSheet | null {
  if (!model.main.length) return null;
  const { solids, steps, gaps } = solidsOf(model, mode, true);
  const movable = solids.filter((s) => s.step);
  if (!movable.length && mode === 'shop') return null;
  if (mode === 'site' && !solids.some((s) => s.step && s.kind !== 'main')) {
    // немає ні панелі, ні опори, ні стику — лише «на корпус»: аркуш не потрібен
    if (!steps.some((st) => /Стінова|Опора|Стик стільниць/.test(st.what))) return null;
  }
  const E: Entity[] = [];
  const fr = SHEET.frame;
  const stampH = 15 * SHEET.stamp.rowH;
  // ліва частина — вибуховий вид; праворуч — таблиця кроків і виріб у зборі
  const tableW = 150;
  const area = { x: fr.x + 8, y: fr.y + 16, w: fr.w - tableW - 20, h: fr.h - stampH - 24 };
  const sb = sceneBox(solids);
  const sw = sb.maxX - sb.minX || 1; const sh = sb.maxY - sb.minY || 1;
  const k = Math.min(area.w / sw, area.h / sh) * 0.94;
  const ox = area.x + (area.w - sw * k) / 2 - sb.minX * k; const oy = area.y + (area.h - sh * k) / 2 - sb.minY * k;
  const T = (p: Pt): Pt => ({ x: ox + p.x * k, y: oy + p.y * k });
  const balloons: Array<{ s: Solid; at: Pt }> = [];
  drawScene(E, solids, T, true, (s, c) => balloons.push({ s, at: c }));
  // балони — праворуч-угору від тіла, щоб не лягали на грані
  for (const { s, at } of balloons) {
    const b = bbox(s.footprint);
    const corner = T(proj(b.maxX + s.explode.x, b.minY + s.explode.y, s.z1 + s.explode.z));
    const c = { x: corner.x + 9, y: corner.y - 7 };
    E.push({ kind: 'balloon', layer: 'Виноска', rule: 'КС-15', c, r: 3.4, text: String(s.step), color: steps.find((st) => st.no === s.step)?.color, target: at });
  }
  // назви тіл без кроку (стільниця) — у тілі, на вільному місці (не у вирізі П)
  for (const s of solids) {
    if (s.step) continue;
    const lp = labelPoint(s.footprint, sidesOf(s.footprint), [], 120, textW(s.name, TEXT.name.size) / k);
    const c = T(proj(lp.x + s.explode.x, lp.y + s.explode.y, s.z1 + s.explode.z));
    E.push({ kind: 'text', layer: 'Стільниця', rule: 'ВН-6', at: { x: c.x, y: c.y + 1 }, text: s.name, style: 'name', anchor: 'middle' });
  }

  // ── праворуч: виріб у зборі (мала ізометрія)
  const asm = solidsOf(model, mode, false).solids;
  const rx = fr.x + fr.w - tableW - 4; const ryTop = fr.y + 14;
  const ab = sceneBox(asm);
  const aw = ab.maxX - ab.minX || 1; const ah = ab.maxY - ab.minY || 1;
  const ka = Math.min((tableW - 8) / aw, 62 / ah);
  const aox = rx + 4 + ((tableW - 8) - aw * ka) / 2 - ab.minX * ka; const aoy = ryTop + 6 + (62 - ah * ka) / 2 - ab.minY * ka;
  E.push({ kind: 'text', layer: 'Стільниця', rule: 'ОФ-ЗБ', at: { x: rx + 4, y: ryTop }, text: 'Виріб у зборі', style: 'subtitle' });
  drawScene(E, asm, (p) => ({ x: aox + p.x * ka, y: aoy + p.y * ka }), false);

  // ── таблиця кроків
  const ty = ryTop + 76; const rh = 4.4;
  const cols = [8, 52, tableW - 8 - 52 - 16, 16];
  const cell = (x: number, y: number, w: number, h: number, text: string[], bold = false, color?: string, anchor: 'start' | 'middle' = 'start') => {
    E.push({ kind: 'polyline', layer: 'Штамп', rule: 'СП-1', points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true, fill: 'white' });
    text.forEach((line, i) => E.push({ kind: 'text', layer: 'Штамп', rule: 'СП-1', at: { x: anchor === 'middle' ? x + w / 2 : x + 1, y: y + 3.1 + i * 3.2 }, text: line, style: 'table', anchor, bold, color }));
  };
  const wrap = (s: string, wMm: number): string[] => {
    const out: string[] = []; let cur = '';
    for (const word of s.split(' ')) { const nxt = cur ? `${cur} ${word}` : word; if (textW(nxt, TEXT.table.size) > wMm - 2 && cur) { out.push(cur); cur = word; } else cur = nxt; }
    if (cur) out.push(cur); return out;
  };
  E.push({ kind: 'text', layer: 'Стільниця', rule: 'КС-15', at: { x: rx + 4, y: ty - 2 }, text: mode === 'shop' ? 'Кроки збірки в цеху' : 'Кроки монтажу на об’єкті', style: 'subtitle' });
  let x = rx + 4; ['№', 'Що', 'Як', 'Де'].forEach((h, i) => { cell(x, ty, cols[i], rh, [h], true, undefined, i === 0 || i === 3 ? 'middle' : 'start'); x += cols[i]; });
  let y = ty + rh;
  for (const st of steps) {
    const what = wrap(st.what, cols[1]); const how = wrap(st.how, cols[2]);
    const h = Math.max(what.length, how.length) * 3.2 + 1.6;
    x = rx + 4;
    cell(x, y, cols[0], h, [String(st.no)], false, st.color, 'middle'); x += cols[0];
    cell(x, y, cols[1], h, what); x += cols[1];
    cell(x, y, cols[2], h, how); x += cols[2];
    cell(x, y, cols[3], h, [st.where], false, st.color, 'middle');
    y += h;
  }
  const legend = mode === 'shop'
    ? ['Помаранчевий — склейка в цеху. Штрихова «тінь» — місце, куди стає деталь; стрілка — напрям.', 'Товщини за моделлю, розсув умовний. Клей і час витримки — за техпроцесом (ІНС-7).']
    : ['Пурпуровий — стик на об’єкті. Штрихова «тінь» — місце деталі; стрілка — напрям.', 'Корпус замовника не показано (ВН-10). Нависання — за бланком заміру.'];
  legend.forEach((l, i) => E.push({ kind: 'text', layer: 'Размер робочий', rule: 'КЛ-1', at: { x: rx + 4, y: y + 5 + i * 4 }, text: l, style: 'note' }));

  const title = mode === 'shop' ? 'Збірка в цеху — вибухова схема: що куди клеїться' : 'Монтаж на об’єкті — вибухова схема: що з чим стикується';
  return makeSheet(model, input, { title, entities: E, sections: [], den: Math.round(1 / k), sheetNo, sheetCount, typeLabel: mode === 'shop' ? 'Схема збірки (цех)' : 'Схема монтажу', gaps });
}

export const composeShopExplodedSheet = (m: DrawModel, i: SetInput, n: number, c: number) => composeExplodedSheet(m, i, 'shop', n, c);
export const composeSiteExplodedSheet = (m: DrawModel, i: SetInput, n: number, c: number) => composeExplodedSheet(m, i, 'site', n, c);


/* ── збірка мийки з каменю (комплект із 14 деталей) ─────────────── */

interface P3 { x: number; y: number; z: number }
interface Face { pts: P3[]; fill: string; stroke?: string; dashed?: boolean; key?: number }
interface SinkPart { no: number; name: string; faces: Face[]; explode: P3; anchor: P3 }

/** Видимі грані коробки (верх, +X, +Y) — як і в основній ізометрії. */
function boxFaces(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tint = 1): Face[] {
  const c = (f: string) => f;
  const top: Face = { pts: [{ x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }], fill: c(tint === 1 ? FACE.top : '#f4f4f4') };
  const fx: Face = { pts: [{ x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y0, z: z0 }], fill: FACE.x };
  const fy: Face = { pts: [{ x: x0, y: y1, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y1, z: z0 }, { x: x0, y: y1, z: z0 }], fill: FACE.y };
  return [top, fx, fy];
}

/**
 * Комплект прямокутної чаші — як його кладе рушій (`pushRectSinkParts`):
 * стінки 1–4 (довгі — length+24 × depth, бокові — depth × width),
 * дно з чотирьох трикутників 5–8 з нахилом до зливу в центрі
 * (катет ≈ пів ширини + 12 ⇒ падіння ≈ 70 мм), підклейки 9–12 —
 * рамка по верху стінок під стільницею (length+48 / width+24 × 30),
 * 13 — підклейка з отвором Ø114 під зливом, 14 — кругла деталь дна.
 * Послідовність склейки — ГІПОТЕЗА, у моделі її нема.
 */
function sinkKit(L: number, W: number, D: number, t: number, exploded: boolean): { parts: SinkPart[]; steps: Step[] } {
  const E = exploded ? 1 : 0;
  const hx = L / 2; const hy = W / 2; // внутрішня чаша
  const wallLen = L + 24;
  const parts: SinkPart[] = [];
  const steps: Step[] = [];
  // стінки: довгі вздовж X (задня y<0 — до стіни, передня y>0), бокові вздовж Y
  const back: SinkPart = { no: 1, name: `задня стінка ${fmtMm(wallLen)}×${fmtMm(D)}`, faces: boxFaces(-wallLen / 2, wallLen / 2, -hy - t, -hy, -D, 0), explode: { x: 0, y: -E * 170, z: 0 }, anchor: { x: 0, y: -hy - t / 2, z: -D / 2 } };
  const front: SinkPart = { no: 2, name: `передня стінка ${fmtMm(wallLen)}×${fmtMm(D)}`, faces: boxFaces(-wallLen / 2, wallLen / 2, hy, hy + t, -D, 0), explode: { x: 0, y: E * 170, z: 0 }, anchor: { x: 0, y: hy + t / 2, z: -D / 2 } };
  const left: SinkPart = { no: 3, name: `ліва бокова ${fmtMm(D)}×${fmtMm(W)}`, faces: boxFaces(-hx - t, -hx, -hy, hy, -D, 0), explode: { x: -E * 170, y: 0, z: 0 }, anchor: { x: -hx - t / 2, y: 0, z: -D / 2 } };
  const right: SinkPart = { no: 4, name: `права бокова ${fmtMm(D)}×${fmtMm(W)}`, faces: boxFaces(hx, hx + t, -hy, hy, -D, 0), explode: { x: E * 170, y: 0, z: 0 }, anchor: { x: hx + t / 2, y: 0, z: -D / 2 } };
  // перелив у задній стінці — прямокутний отвір 60×24 (рушій)
  back.faces.push({ pts: [{ x: -30, y: -hy - t, z: -D / 2 + 12 }, { x: 30, y: -hy - t, z: -D / 2 + 12 }, { x: 30, y: -hy - t, z: -D / 2 - 12 }, { x: -30, y: -hy - t, z: -D / 2 - 12 }], fill: '#bbb' });
  parts.push(back, front, left, right);
  // дно: чотири трикутники з нахилом до центру; падіння за довжиною катета (пів ширини + 12)
  const drop = Math.sqrt(Math.max(0, (hy + 12) ** 2 - hy ** 2)) || 70;
  const zc = -D - drop;
  const tri = (no: number, name: string, a: P3, b: P3, ex: P3): SinkPart => ({ no, name, faces: [{ pts: [a, b, { x: 0, y: 0, z: zc }], fill: '#ececec' }], explode: ex, anchor: { x: (a.x + b.x + 0) / 3, y: (a.y + b.y + 0) / 3, z: (a.z + b.z + zc) / 3 } });
  const bs = hy + 12; const bl = hx + 12;
  parts.push(
    tri(5, `задній трикутник дна ${fmtMm(wallLen)}×${fmtMm(bs)}`, { x: -hx, y: -hy, z: -D }, { x: hx, y: -hy, z: -D }, { x: 0, y: -E * 120, z: -E * 160 }),
    tri(6, `передній трикутник дна ${fmtMm(wallLen)}×${fmtMm(bs)}`, { x: hx, y: hy, z: -D }, { x: -hx, y: hy, z: -D }, { x: 0, y: E * 120, z: -E * 160 }),
    tri(7, `лівий трикутник дна ${fmtMm(bl)}×${fmtMm(W + 24)}`, { x: -hx, y: hy, z: -D }, { x: -hx, y: -hy, z: -D }, { x: -E * 120, y: 0, z: -E * 160 }),
    tri(8, `правий трикутник дна ${fmtMm(bl)}×${fmtMm(W + 24)}`, { x: hx, y: -hy, z: -D }, { x: hx, y: hy, z: -D }, { x: E * 120, y: 0, z: -E * 160 }),
  );
  // підклейки 9–12 — рамка над стінками (під стільницею)
  const gw = 30; const fl = L + 48; const fw = W + 24;
  const ring = (no: number, name: string, x0: number, x1: number, y0: number, y1: number, ex: P3): SinkPart => ({ no, name, faces: boxFaces(x0, x1, y0, y1, 0, t), explode: ex, anchor: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: t / 2 } });
  parts.push(
    ring(9, `підклейка ${fmtMm(fl)}×${fmtMm(gw)}`, -fl / 2, fl / 2, -hy - t - 5, -hy - t - 5 + gw, { x: 0, y: -E * 60, z: E * 150 }),
    ring(10, `підклейка ${fmtMm(fl)}×${fmtMm(gw)}`, -fl / 2, fl / 2, hy + t + 5 - gw, hy + t + 5, { x: 0, y: E * 60, z: E * 150 }),
    ring(11, `підклейка ${fmtMm(fw)}×${fmtMm(gw)}`, -hx - t - 5, -hx - t - 5 + gw, -fw / 2, fw / 2, { x: -E * 60, y: 0, z: E * 150 }),
    ring(12, `підклейка ${fmtMm(fw)}×${fmtMm(gw)}`, hx + t + 5 - gw, hx + t + 5, -fw / 2, fw / 2, { x: E * 60, y: 0, z: E * 150 }),
  );
  // 13 — підклейка з отвором під злив, 14 — кругла деталь
  const plate: SinkPart = { no: 13, name: `підклейка з отвором Ø114 — ${fmtMm(W + 24)}×200`, faces: boxFaces(-(W + 24) / 2, (W + 24) / 2, -100, 100, zc - t, zc, 2), explode: { x: 0, y: 0, z: -E * 300 }, anchor: { x: 0, y: 0, z: zc - t / 2 } };
  const ringPts = (r: number, z: number): P3[] => Array.from({ length: 24 }, (_, i) => ({ x: r * Math.cos((i / 24) * 2 * Math.PI), y: r * Math.sin((i / 24) * 2 * Math.PI), z }));
  plate.faces.push({ pts: ringPts(57, zc), fill: '#d8d8d8' });
  const disc: SinkPart = { no: 14, name: 'кругла деталь дна Ø114', faces: [{ pts: ringPts(57, zc - t), fill: FACE.top }, { pts: [...ringPts(57, zc - t).slice(0, 13), ...ringPts(57, zc - 2 * t).slice(0, 13).reverse()], fill: FACE.y }], explode: { x: 0, y: 0, z: -E * 420 }, anchor: { x: 0, y: 0, z: zc - t } };
  parts.push(plate, disc);
  steps.push(
    { no: 1, what: 'Стінки 1–4 у коробку', how: `дві довгі ${fmtMm(wallLen)}×${fmtMm(D)} і дві бокові ${fmtMm(D)}×${fmtMm(W)} — стик прямий, клей; перелив 60×24 у задній стінці`, where: 'цех', color: '#f0b400' },
    { no: 2, what: 'Дно — трикутники 5–8', how: `чотири трикутники з нахилом до центру (злив), падіння ≈ ${fmtMm(Math.round(drop))} мм; клей по ребрах`, where: 'цех', color: '#f0b400' },
    { no: 3, what: 'Злив — 13 і 14', how: 'підклейка з отвором Ø114 під центром дна, кругла деталь у отвір; клей', where: 'цех', color: '#f0b400' },
    { no: 4, what: 'Рамка 9–12', how: 'чотири підклейки по 30 мм по верху стінок — площина склейки зі стільницею; клей', where: 'цех', color: '#f0b400' },
    { no: 5, what: 'Чашу — під виріз стільниці', how: 'вклейка знизу, зазор під клей 3–4* (ІНС-2); калібрування й полірування стику — ЧПК', where: 'цех', color: '#f0b400' },
  );
  return { parts, steps };
}

function drawSinkKit(E: Entity[], parts: SinkPart[], T: (p: Pt) => Pt, guides: boolean, onBalloon?: (p: SinkPart, at: Pt) => void) {
  const key = (p: SinkPart) => p.anchor.x + p.explode.x + p.anchor.y + p.explode.y - (p.anchor.z + p.explode.z);
  const sorted = [...parts].sort((a, b) => key(a) - key(b));
  const P = (q: P3, ex: P3) => T(proj(q.x + ex.x, q.y + ex.y, q.z + ex.z));
  for (const p of sorted) {
    const moved = p.explode.x || p.explode.y || p.explode.z;
    if (guides && moved) {
      // «тінь» на місці склейки
      for (const f of p.faces) E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ІЗО', points: f.pts.map((q) => P(q, { x: 0, y: 0, z: 0 })), closed: true, fillColor: 'none', color: '#aaa', weight: 0.2, dashed: true });
    }
    const faces = [...p.faces].sort((a, b) => {
      const ka = a.pts.reduce((s, q) => s + q.x + q.y - q.z, 0) / a.pts.length; const kb = b.pts.reduce((s, q) => s + q.x + q.y - q.z, 0) / b.pts.length; return ka - kb;
    });
    for (const f of faces) E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ІЗО', points: f.pts.map((q) => P(q, p.explode)), closed: true, fillColor: f.fill, color: '#000', weight: 0.3 });
    if (guides && moved) {
      const from = P(p.anchor, p.explode); const to = P(p.anchor, { x: 0, y: 0, z: 0 });
      E.push({ kind: 'polyline', layer: 'Виноска', rule: 'ІЗО', points: [from, to], closed: false, dashed: true, color: '#555', weight: 0.25 });
      onBalloon?.(p, from);
    }
  }
}

/** Аркуш «Збірка мийки з каменю» — комплект чаші розсунутий: стінки, дно, злив, рамка; поруч чаша в зборі. */
export function composeSinkExplodedSheet(model: DrawModel, input: SetInput, sheetNo: number, sheetCount: number): DrawingSheet | null {
  const sd = model.sinkDetail;
  if (!sd) return null;
  const g = (sd.geometry ?? {}) as { width?: number; height?: number; innerVertical?: number; sinkKind?: string };
  if (g.sinkKind === 'slot' || (sd as { shape?: string }).shape === 'Мийка щілинна') return null;
  const L = g.width ?? 500; const W = g.height ?? 400; const D = g.innerVertical ?? 200; const t = sd.thickness ?? model.thickness;
  const E: Entity[] = [];
  const fr = SHEET.frame;
  const stampH = 15 * SHEET.stamp.rowH;
  const tableW = 150;
  const area = { x: fr.x + 8, y: fr.y + 16, w: fr.w - tableW - 20, h: fr.h - stampH - 24 };
  const { parts, steps } = sinkKit(L, W, D, t, true);
  const allPts: Pt[] = [];
  for (const p of parts) for (const f of p.faces) for (const q of f.pts) { allPts.push(proj(q.x + p.explode.x, q.y + p.explode.y, q.z + p.explode.z)); allPts.push(proj(q.x, q.y, q.z)); }
  const b = bbox(allPts);
  const k = Math.min(area.w / (b.w || 1), area.h / (b.h || 1)) * 0.9;
  const ox = area.x + (area.w - b.w * k) / 2 - b.minX * k; const oy = area.y + (area.h - b.h * k) / 2 - b.minY * k;
  const T = (p: Pt): Pt => ({ x: ox + p.x * k, y: oy + p.y * k });
  const balloons: Array<{ p: SinkPart; at: Pt }> = [];
  drawSinkKit(E, parts, T, true, (p, at) => balloons.push({ p, at }));
  for (const { p, at } of balloons) {
    // номер деталі — маленький балон біля деталі (не крок!)
    const dir = { x: Math.sign(p.explode.x || 0.001), y: Math.sign(p.explode.y || (p.explode.z < 0 ? 1 : -0.001)) };
    const c = { x: at.x + dir.x * 12 + (p.explode.z > 0 ? 0 : 0), y: at.y + (p.explode.z < 0 ? 9 : p.explode.z > 0 ? -9 : dir.y * 8) };
    E.push({ kind: 'balloon', layer: 'Виноска', rule: 'КС-15', c, r: 3, text: String(p.no), color: '#444', target: at });
  }
  E.push({ kind: 'text', layer: 'Стільниця', rule: 'ВН-6', at: { x: area.x + 2, y: area.y + 4 }, text: `Чаша ${fmtMm(L)} × ${fmtMm(W)} × ${fmtMm(D)} (внутр.), камінь ${fmtMm(t)} мм — 14 деталей; номери — як у таблиці аркуша мийки`, style: 'note' });

  // ── праворуч: чаша в зборі + кроки
  const asm = sinkKit(L, W, D, t, false).parts;
  const rx = fr.x + fr.w - tableW - 4; const ryTop = fr.y + 14;
  const ap: Pt[] = []; for (const p of asm) for (const f of p.faces) for (const q of f.pts) ap.push(proj(q.x, q.y, q.z));
  const ab = bbox(ap);
  const ka = Math.min((tableW - 8) / (ab.w || 1), 62 / (ab.h || 1));
  const aox = rx + 4 + ((tableW - 8) - ab.w * ka) / 2 - ab.minX * ka; const aoy = ryTop + 6 + (62 - ab.h * ka) / 2 - ab.minY * ka;
  E.push({ kind: 'text', layer: 'Стільниця', rule: 'ОФ-ЗБ', at: { x: rx + 4, y: ryTop }, text: 'Чаша в зборі (вид знизу-збоку — як лежить під стільницею)', style: 'subtitle' });
  drawSinkKit(E, asm, (p) => ({ x: aox + p.x * ka, y: aoy + p.y * ka }), false);

  const ty = ryTop + 76; const rh = 4.4;
  const cols = [8, 40, tableW - 8 - 40 - 16, 16];
  const cell = (x: number, y: number, w: number, h: number, text: string[], bold = false, color?: string, anchor: 'start' | 'middle' = 'start') => {
    E.push({ kind: 'polyline', layer: 'Штамп', rule: 'СП-1', points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true, fill: 'white' });
    text.forEach((line, i) => E.push({ kind: 'text', layer: 'Штамп', rule: 'СП-1', at: { x: anchor === 'middle' ? x + w / 2 : x + 1, y: y + 3.1 + i * 3.2 }, text: line, style: 'table', anchor, bold, color }));
  };
  const wrap = (s: string, wMm: number): string[] => {
    const out: string[] = []; let cur = '';
    for (const word of s.split(' ')) { const nxt = cur ? `${cur} ${word}` : word; if (textW(nxt, TEXT.table.size) > wMm - 2 && cur) { out.push(cur); cur = word; } else cur = nxt; }
    if (cur) out.push(cur); return out;
  };
  E.push({ kind: 'text', layer: 'Стільниця', rule: 'КС-15', at: { x: rx + 4, y: ty - 2 }, text: 'Кроки склейки чаші', style: 'subtitle' });
  let x = rx + 4; ['№', 'Що', 'Як', 'Де'].forEach((h, i) => { cell(x, ty, cols[i], rh, [h], true, undefined, i === 0 || i === 3 ? 'middle' : 'start'); x += cols[i]; });
  let y = ty + rh;
  for (const st of steps) {
    const what = wrap(st.what, cols[1]); const how = wrap(st.how, cols[2]);
    const h = Math.max(what.length, how.length) * 3.2 + 1.6;
    x = rx + 4;
    cell(x, y, cols[0], h, [String(st.no)], false, st.color, 'middle'); x += cols[0];
    cell(x, y, cols[1], h, what); x += cols[1];
    cell(x, y, cols[2], h, how); x += cols[2];
    cell(x, y, cols[3], h, [st.where], false, st.color, 'middle');
    y += h;
  }
  ['Послідовність склейки — ГІПОТЕЗА (у моделі її нема), уточнити в цеху. Розміри деталей — з рушія розкрою.', 'Нахил дна показано умовно; кути й припуски — за програмою ЧПК. * — довідковий розмір.']
    .forEach((l, i) => E.push({ kind: 'text', layer: 'Размер робочий', rule: 'КЛ-1', at: { x: rx + 4, y: y + 5 + i * 4 }, text: l, style: 'note' }));
  return makeSheet(model, input, { title: `Збірка мийки з каменю — чаша ${fmtMm(L)} × ${fmtMm(W)} × ${fmtMm(D)}: 14 деталей, що з чим клеїться`, entities: E, sections: [], den: Math.round(1 / k), sheetNo, sheetCount, typeLabel: 'Схема збірки мийки', gaps: ['Послідовність склейки чаші — ГІПОТЕЗА, уточнити в цеху'] });
}
