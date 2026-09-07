/**
 * ДОДАТКОВІ АРКУШІ НАБОРУ — мийка, стики/склейка, специфікація (06.09.2026).
 *
 *  · МИЙКА (ОФ-МЙ): ліворуч — стільниця з вирізом під мийку і отворами
 *    сантехніки, розміри до країв (робочі) і до центру (довідкові, ОФ-ДР),
 *    спосіб установки в контурі (ІНС-1); праворуч — чаша з каменю: план і
 *    розріз A-A, товщини 20* (ВН-11: зірочка = довідковий), таблиця
 *    деталей чаші з рушія (стінки, дно, підклейка).
 *  · СТИКИ, ФАСКИ, СКЛЕЙКА: план виробу зі стиками кольором цех/об'єкт
 *    (КЛ-1), балони з номерами; таблиця «№ · що з чим · тип · довжина · де ·
 *    текстура»; розрізи кожного типу з'єднання; правило матеріалу
 *    (`miterJointFor`: підворот і опора — 45°, потовщення — 45° лише на
 *    керамограніті, кварцит — пряма підклейка).
 *  · СПЕЦИФІКАЦІЯ (СП-1): A4 портрет, дві таблиці — виріб і фурнітура
 *    (порожні рядки лишаються під дозапис).
 */
import type { DrawingSheet, Entity, SectionView } from './model';
import { SHEET, SHEET_A4P, TEXT } from './style';
import { bbox, fitScaleDen, fmtMm, textW, rectPts, labelPoint } from './geom';
import { chamferSection, dim, foldSection, legNode, profileSection, sinkCutSection, skirtingSection, thickeningSection, wallPanelSection } from './sections';
import { miterJointFor } from '../../engines/miterAssembly';
import { layoutSections } from './layoutSections';
import {
  ROW, bottomBandHeight, drawAdditionZones, drawContour, drawEdges, drawHoles, drawSideDims, edgeIndex, layoutBody, makeSheet, planHoleDims, stampFields,
  type Ctx, type DrawModel, type DrawPart, type SetInput, type Tf,
} from './set';

/* ── мийка ──────────────────────────────────────────────────────── */

export function composeSinkSheet(model: DrawModel, input: SetInput, sheetNo: number, sheetCount: number): DrawingSheet | null {
  const host = model.main.find((m) => m.holes.some((h) => h.isSink));
  if (!host) return null;
  const E: Entity[] = []; const gaps: string[] = [];
  const own = Boolean(model.sinkDetail);
  const g = (model.sinkDetail?.geometry ?? {}) as { width?: number; height?: number; innerVertical?: number };
  const L = g.width ?? 0; const W = g.height ?? 0; const D = g.innerVertical ?? 0;
  const t = model.sinkDetail?.thickness ?? model.thickness;
  const sections: SectionView[] = [sinkCutSection(model.thickness, own)];
  const stampRows = stampFields(model, input, 10, '').length;
  const band = bottomBandHeight(sections, stampRows);
  const fr = SHEET.frame;

  // ── ліва половина: стільниця з вирізом (усі розміри — тільки мийка й сантехніка)
  const sinkOnly = { ...host, holes: host.holes.filter((h) => h.isSink || (h.round && h.d > 14)) };
  const plan = planHoleDims(sinkOnly, sinkOnly.sides);
  const colW = fr.w * 0.56;
  const margin = { l: 10 + ROW * (plan.rows.left + 0.6), r: 8 + ROW * (plan.rows.right + 0.6), t: 12 + ROW * (plan.rows.top + 0.8), b: ROW * (plan.rows.bottom + 0.6) };
  const area = { x: fr.x + margin.l, y: fr.y + margin.t, w: colW - margin.l - margin.r, h: fr.h - band - margin.t - margin.b };
  const den = fitScaleDen(host.w, host.h, area.w, area.h);
  const S = 1 / den;
  const ox = area.x + (area.w - host.w * S) / 2; const oy = area.y + (area.h - host.h * S) / 2;
  const T: Tf = (p) => ({ x: ox + p.x * S, y: oy + p.y * S });
  const ctx: Ctx = { E, S, profileColor: model.profileColor, gaps };
  drawContour(ctx, host, T, host.pts, host.sides);
  drawEdges(ctx, host, T, host.sides, 3.4, false);
  drawSideDims(ctx, T, host.sides, 1);
  // решта вирізів — лише контуром, без підписів
  const others = { ...host, holes: host.holes.filter((h) => !(h.isSink || (h.round && h.d > 14))) };
  drawHoles(ctx, others, T, host.sides, { dims: false, ownSink: own, sinkText: 'short', labels: false });
  drawHoles(ctx, sinkOnly, T, host.sides, { dims: true, ownSink: own, sinkText: 'full' }, plan);
  const c = T({ x: host.w / 2, y: host.h / 2 });
  void c;
  E.push({ kind: 'text', layer: 'Стільниця', rule: 'ВН-6', at: { x: fr.x + 4, y: fr.y + 12 }, text: `${host.name}: виріз під мийку ${own ? '— мийка ViyarStone з каменю, вклейка знизу в цеху' : '— мийка замовника, вклейка знизу'}`, style: 'note' });

  // ── права половина: чаша з каменю
  const rx = fr.x + colW + 6; const rw = fr.w - colW - 12;
  const topY = fr.y + 14;
  if (own && L > 0 && W > 0) {
    const outerL = L + 2 * t; const outerW = W + 2 * t;
    const k = Math.min((rw - 40) / (outerL + 60), 50 / (outerW + 20), 0.1);
    // план чаші (вид зверху)
    const px = rx + 22; const py = topY + 8 + ROW * 2;
    const oc = { x: px + (outerL * k) / 2, y: py + (outerW * k) / 2 };
    E.push({ kind: 'text', layer: 'Стільниця', rule: 'ОФ-МЙ', at: { x: px, y: topY + 2 }, text: `Мийка з каменю — чаша ${fmtMm(L)} × ${fmtMm(W)} × ${fmtMm(D)} (внутр.), стінка ${fmtMm(t)}*`, style: 'node', bold: true });
    E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ОФ-МЙ', points: rectPts(oc, outerL * k, outerW * k), closed: true, fill: 'hatch-stone' });
    E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ОФ-МЙ', points: rectPts(oc, L * k, W * k), closed: true, fill: 'white' });
    E.push({ kind: 'axis', layer: 'Осевая', rule: 'ШАРИ', a: { x: oc.x - (outerL * k) / 2 - 3, y: oc.y }, b: { x: oc.x + (outerL * k) / 2 + 3, y: oc.y } });
    E.push(dim({ x: oc.x - (L * k) / 2, y: oc.y - (W * k) / 2 }, { x: oc.x + (L * k) / 2, y: oc.y - (W * k) / 2 }, -ROW, fmtMm(L), false, 'ШР-3'));
    E.push(dim({ x: oc.x - (outerL * k) / 2, y: oc.y - (outerW * k) / 2 }, { x: oc.x + (outerL * k) / 2, y: oc.y - (outerW * k) / 2 }, -ROW * 2, fmtMm(outerL), true, 'ВН-11'));
    E.push(dim({ x: oc.x + (L * k) / 2, y: oc.y - (W * k) / 2 }, { x: oc.x + (L * k) / 2, y: oc.y + (W * k) / 2 }, ROW, fmtMm(W), false, 'ШР-3'));
    E.push(dim({ x: oc.x + (outerL * k) / 2, y: oc.y - (outerW * k) / 2 }, { x: oc.x + (outerL * k) / 2, y: oc.y + (outerW * k) / 2 }, ROW * 2, fmtMm(outerW), true, 'ВН-11'));
    // позначення розрізу A-A через чашу (РЗ-1) — нижче середини, щоб не перетинати тексти вертикальних розмірів
    const ay = oc.y + (outerW * k) / 4;
    const rEdge = oc.x + (outerL * k) / 2 + ROW * 2 + 3; // за обома вертикальними розмірами
    E.push({ kind: 'polyline', layer: 'Размер робочий', rule: 'РЗ-1', points: [{ x: oc.x - (outerL * k) / 2 - 8, y: ay }, { x: oc.x - (outerL * k) / 2 - 3, y: ay }], closed: false, weight: 0.5 });
    E.push({ kind: 'polyline', layer: 'Размер робочий', rule: 'РЗ-1', points: [{ x: rEdge, y: ay }, { x: rEdge + 5, y: ay }], closed: false, weight: 0.5 });
    E.push({ kind: 'text', layer: 'Стільниця', rule: 'РЗ-1', at: { x: oc.x - (outerL * k) / 2 - 9, y: ay - 1.5 }, text: 'A', style: 'section', anchor: 'end' });
    E.push({ kind: 'text', layer: 'Стільниця', rule: 'РЗ-1', at: { x: rEdge + 6, y: ay - 1.5 }, text: 'A', style: 'section' });
    // розріз A-A: стільниця зверху, чаша під нею (U), підклейка
    const sy = py + outerW * k + 22;
    const sx = px;
    const tS = t * k; const dS = D * k;
    const topSlab = { x: sx - 12, y: sy, w: outerL * k + 24, h: model.thickness * k };
    E.push({ kind: 'text', layer: 'Стільниця', rule: 'РЗ-1', at: { x: sx, y: sy - 3 }, text: 'A-A', style: 'section', underline: true });
    E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ШТ-1', points: [{ x: topSlab.x, y: topSlab.y }, { x: sx + tS, y: topSlab.y }, { x: sx + tS, y: topSlab.y + topSlab.h }, { x: topSlab.x, y: topSlab.y + topSlab.h }], closed: true, fill: 'hatch-stone' });
    E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ШТ-1', points: [{ x: sx + tS + L * k, y: topSlab.y }, { x: topSlab.x + topSlab.w, y: topSlab.y }, { x: topSlab.x + topSlab.w, y: topSlab.y + topSlab.h }, { x: sx + tS + L * k, y: topSlab.y + topSlab.h }], closed: true, fill: 'hatch-stone' });
    const uy = topSlab.y + topSlab.h + 0.6; // зазор клею
    const U = [
      { x: sx, y: uy }, { x: sx + tS, y: uy }, { x: sx + tS, y: uy + dS }, { x: sx + tS + L * k, y: uy + dS }, { x: sx + tS + L * k, y: uy },
      { x: sx + outerL * k, y: uy }, { x: sx + outerL * k, y: uy + dS + tS }, { x: sx, y: uy + dS + tS },
    ];
    E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ОФ-МЙ', points: U, closed: true, fill: 'hatch-stone' });
    E.push({ kind: 'polyline', layer: 'Цеховской стык', rule: 'КЛ-1', points: [{ x: sx, y: uy - 0.3 }, { x: sx + tS, y: uy - 0.3 }], closed: false, weight: 0.7, color: '#f0b400' });
    E.push({ kind: 'polyline', layer: 'Цеховской стык', rule: 'КЛ-1', points: [{ x: sx + tS + L * k, y: uy - 0.3 }, { x: sx + outerL * k, y: uy - 0.3 }], closed: false, weight: 0.7, color: '#f0b400' });
    E.push({ kind: 'leader', layer: 'Виноска', rule: 'ІНС-1', at: { x: topSlab.x + topSlab.w + 4, y: uy + 3 }, text: 'вклейка знизу, клей', targets: [{ x: sx + outerL * k, y: uy - 0.3 }] });
    E.push(dim({ x: sx + tS, y: uy }, { x: sx + tS, y: uy + dS }, -ROW, fmtMm(D), false, 'ШР-3'));
    E.push(dim({ x: sx, y: uy + dS + tS }, { x: sx + outerL * k, y: uy + dS + tS }, ROW, fmtMm(outerL), true, 'ВН-11'));
    E.push(dim({ x: sx + outerL * k - tS, y: uy + dS + tS }, { x: sx + outerL * k, y: uy + dS + tS }, ROW * 2, `${fmtMm(t)}*`, false, 'ВН-11'));
    E.push({ kind: 'text', layer: 'Размер', rule: 'ВН-11', at: { x: sx, y: uy + dS + tS + ROW * 2 + 6 }, text: '* — довідковий розмір (товщина каменю)', style: 'dim', color: '#808080' });

    // таблиця деталей чаші — з рушія розкрою
    const rows = model.sinkParts.map((p) => ({ name: p.name.replace(/^Мийка \([^)]*\)\s*/, ''), dims: `${fmtMm(p.width)} × ${fmtMm(p.height)} × ${fmtMm(p.thickness ?? t)}` }));
    const ty = uy + dS + tS + ROW * 2 + 12;
    const tx = rx + 4; const tw = rw - 8; const rh = 3.6;
    const cols = [8, tw - 8 - 36, 36];
    const cell = (x: number, y: number, w: number, text: string, bold = false, anchor: 'start' | 'middle' = 'start') => {
      E.push({ kind: 'polyline', layer: 'Штамп', rule: 'СП-1', points: rectPts({ x: x + w / 2, y: y + rh / 2 }, w, rh), closed: true, fill: 'white' });
      E.push({ kind: 'text', layer: 'Штамп', rule: 'СП-1', at: { x: anchor === 'middle' ? x + w / 2 : x + 1.2, y: y + rh * 0.72 }, text, style: 'table', anchor, bold });
    };
    E.push({ kind: 'text', layer: 'Стільниця', rule: 'СП-1', at: { x: tx, y: ty - 1.5 }, text: `Деталі чаші з каменю (${rows.length} шт, розкрій разом зі стільницею)`, style: 'dim', bold: true });
    cell(tx, ty, cols[0], '№', true, 'middle'); cell(tx + cols[0], ty, cols[1], 'Деталь', true); cell(tx + cols[0] + cols[1], ty, cols[2], 'Розмір, мм', true, 'middle');
    // таблиця стоїть праворуч від розрізів — може йти до низу рамки (над номером аркуша)
    const secRight = Math.max(...layoutSections(sections, fr, stampRows * SHEET.stamp.rowH, false).placed.map((pl) => pl.x + pl.s.w), 0);
    const bottomLimit = tx > secRight + 6 ? fr.y + fr.h - SHEET.sheetNoBox.h - 3 : fr.y + fr.h - band;
    const maxRows = Math.floor((bottomLimit - ty - rh) / rh);
    rows.slice(0, maxRows).forEach((r, i) => {
      const y = ty + rh * (i + 1);
      cell(tx, y, cols[0], String(i + 1), false, 'middle'); cell(tx + cols[0], y, cols[1], r.name); cell(tx + cols[0] + cols[1], y, cols[2], r.dims, false, 'middle');
    });
    if (rows.length > maxRows) E.push({ kind: 'text', layer: 'Размер', rule: 'СП-1', at: { x: tx, y: ty + rh * (maxRows + 1) + 3 }, text: `… ще ${rows.length - maxRows} — у специфікації`, style: 'dim', color: '#808080' });
  } else {
    E.push({ kind: 'text', layer: 'Вимога', rule: 'ОФ-ЧВ', at: { x: rx + 4, y: topY + 4 }, text: 'Мийка замовника: перевірити по шаблону', style: 'note', color: '#ff0000' });
    E.push({ kind: 'text', layer: 'Вимога', rule: 'ОФ-ЧВ', at: { x: rx + 4, y: topY + 9 }, text: 'Монтаж на об’єкті', style: 'note', color: '#ff0000' });
    gaps.push('Модель і шаблон мийки замовника в проєкті відсутні — лише виріз');
  }
  const title = own ? `Мийка 1 · камінь ViyarStone · чаша ${fmtMm(L)} × ${fmtMm(W)} × ${fmtMm(D)} · виріз у ${host.name}` : `Мийка замовника · виріз у ${host.name}`;
  return makeSheet(model, input, { title, entities: E, sections, den, sheetNo, sheetCount, typeLabel: 'Креслення мийки', gaps });
}

/* ── стики, фаски, склейка ──────────────────────────────────────── */

interface JointRow { no: number; a: string; b: string; type: string; lengthMm: number; where: 'цех' | 'об’єкт' | 'об’єкт*'; texture: string; color: string }

export function composeJointsSheet(model: DrawModel, input: SetInput, sheetNo: number, sheetCount: number): DrawingSheet | null {
  if (!model.main.length || !model.additions.length) return null;
  const E: Entity[] = []; const gaps: string[] = [];
  const material = model.material;
  const sections: SectionView[] = [];
  const th = model.additions.find((a) => a.kind === 'thickening');
  if (th) sections.push(thickeningSection(model.thickness, Math.min(th.w, th.h), miterJointFor('thickening', material), '#f0b400'));
  const fold = model.additions.find((a) => a.kind === 'fold');
  if (fold) sections.push(foldSection(model.thickness, Math.min(fold.w, fold.h), '#f0b400'));
  const leg = model.additions.find((a) => a.kind === 'leg');
  if (leg) sections.push(legNode(model.thickness, model.main[0].name, leg.name));
  if (model.additions.some((a) => a.kind === 'wall_panel')) sections.push(wallPanelSection(model.thickness, '#ff00ff'));
  const sk = model.additions.find((a) => a.kind === 'skirting');
  if (sk) sections.push(skirtingSection(model.thickness, Math.min(sk.w, sk.h), '#f0b400'));
  if (model.additions.some((a) => a.kind === 'fold' || a.kind === 'leg')) sections.push(chamferSection(model.thickness));
  const stampRows = stampFields(model, input, 10, '').length;
  const band = bottomBandHeight(sections, stampRows);
  const fr = SHEET.frame;

  // ── таблиця стиків (праворуч)
  const rows: JointRow[] = [];
  model.additions.forEach((ad) => {
    if (!ad.joint) return;
    const host = model.main.find((m) => m.productKey === ad.productKey) ?? model.main[0];
    const j = ad.joint;
    const len = Math.abs(j.a.to - j.a.from);
    const miter = ad.kind === 'fold' || ad.kind === 'leg' ? true : ad.kind === 'thickening' ? miterJointFor('thickening', material) : false;
    // панель — стик монтажний; опора (водоспад) — за словами власника 07.09 теж на об'єкті
    const onSite = ad.kind === 'wall_panel' || ad.kind === 'leg';
    const type = ad.kind === 'wall_panel' ? 'стик прямий, монтажний' : ad.kind === 'skirting' ? 'бортик на стільницю, клей' : miter ? "з'єднання під 45°, клей" : ad.kind === 'thickening' ? 'пряма підклейка знизу, клей' : `${j.type === 'miter45' ? "з'єднання під 45°" : j.type === 'butt' ? 'стик прямий' : 'склейка'}, клей`;
    rows.push({ no: rows.length + 1, a: `${host.name} · ${ad.parentSide}`, b: `${ad.name} · ${j.b.sideId}`, type, lengthMm: len, where: onSite ? 'об’єкт' : 'цех', texture: j.textureContinuity ? 'наскрізна' : '—', color: onSite ? '#ff00ff' : '#f0b400' });
  });
  // стики стільниць — деталь, розпиляна рушієм на частини (шви `~N`): збірка на об'єкті — ГІПОТЕЗА, у моделі типу нема
  const seamRows: Array<{ a: DrawPart; b: DrawPart; len: number }> = [];
  for (let i = 0; i < model.main.length; i += 1) for (let k = i + 1; k < model.main.length; k += 1) {
    const a = model.main[i]; const b = model.main[k];
    if (!a.detail || a.detail !== b.detail) continue;
    const sa = a.sides.filter((sd) => sd.seam); const sb = b.sides.filter((sd) => sd.seam);
    for (const x of sa) { const y = sb.find((q) => Math.abs(q.len - x.len) < 1); if (y) { seamRows.push({ a, b, len: x.len }); break; } }
  }
  seamRows.forEach((r) => rows.push({ no: rows.length + 1, a: `${r.a.name} · стик`, b: `${r.b.name} · стик`, type: 'стик стільниць (розпил під лист)', lengthMm: r.len, where: 'об’єкт*', texture: r.a.part.textureGroupLabel && r.a.part.textureGroupLabel === r.b.part.textureGroupLabel ? 'наскрізна' : '—', color: '#ff00ff' }));
  if (seamRows.length) gaps.push('* стик стільниць: де збирати (цех/об’єкт) у моделі немає — на аркуші як монтажний (ГІПОТЕЗА)');

  const tableW = 168;
  const tx = fr.x + fr.w - tableW - 4; const ty = fr.y + 14; const rh = 4.6;
  const cols = [7, 38, 38, 44, 13, 12, 16];
  const heads = ['№', 'Деталь · сторона', 'З чим · сторона', 'Тип з’єднання', 'L, мм', 'Де', 'Текст.'];
  const cell = (x: number, y: number, w: number, text: string, bold = false, anchor: 'start' | 'middle' = 'start', color?: string) => {
    E.push({ kind: 'polyline', layer: 'Штамп', rule: 'КС-15', points: rectPts({ x: x + w / 2, y: y + rh / 2 }, w, rh), closed: true, fill: 'white' });
    E.push({ kind: 'text', layer: 'Штамп', rule: 'КС-15', at: { x: anchor === 'middle' ? x + w / 2 : x + 1, y: y + rh * 0.72 }, text, style: 'table', anchor, bold, color });
  };
  E.push({ kind: 'text', layer: 'Стільниця', rule: 'КС-15', at: { x: tx, y: ty - 2 }, text: 'Стики і склейка', style: 'subtitle' });
  let x = tx; heads.forEach((hd, i) => { cell(x, ty, cols[i], hd, true, i === 0 || i >= 4 ? 'middle' : 'start'); x += cols[i]; });
  rows.forEach((r, i) => {
    const y = ty + rh * (i + 1); let xx = tx;
    const vals = [String(r.no), r.a, r.b, r.type, fmtMm(r.lengthMm), r.where, r.texture];
    vals.forEach((v, k) => { cell(xx, y, cols[k], v, false, k === 0 || k >= 4 ? 'middle' : 'start', k === 5 ? r.color : undefined); xx += cols[k]; });
  });
  const legendY = ty + rh * (rows.length + 1) + 6;
  const rule = miterJointFor('thickening', material) ? 'Потовщення на керамограніті — стик 45° (каталог цеху).' : 'Потовщення на кварциті/акрилі — пряма підклейка знизу без скосу (каталог цеху).';
  const notes = [
    'Кольори: помаранчевий — стик у цеху (склейка), пурпуровий — стик на об’єкті (монтажний).',
    'Підворот і опора — з’єднання під 45° (водоспад), фаска 2×2 на ребрі стику; підворот клеїться в цеху, опора — на об’єкті (власник, 07.09).',
    rule,
    'Клей, час витримки, кріплення — за техпроцесом цеху (на кресленні не пишуться, ІНС-7).',
    ...(seamRows.length ? ['* Стик стільниць — деталь розпиляна під лист; збирати на об’єкті чи в цеху — вирішує технолог (у моделі не задано).'] : []),
  ];
  notes.forEach((n, i) => E.push({ kind: 'text', layer: 'Размер робочий', rule: 'КЛ-1', at: { x: tx, y: legendY + i * 4.2 }, text: n, style: 'note' }));

  // ── вузли — під таблицею, у правій колонці (сітка), а не в нижній смузі: тоді план ліворуч має всю висоту
  {
    let gx = tx; let gy = legendY + notes.length * 4.2 + 6; let rowH = 0;
    const maxX = fr.x + fr.w - 4;
    for (const sec of sections) {
      if (gx + sec.w > maxX && gx > tx) { gx = tx; gy += rowH + 6; rowH = 0; }
      sec.at = { x: gx, y: gy }; gx += sec.w + 6; rowH = Math.max(rowH, sec.h);
    }
  }

  // ── план зі стиками (ліворуч) — на всю висоту над штампом
  const colW = fr.w - tableW - 14;
  const stampBand = stampRows * SHEET.stamp.rowH + 4;
  const margin = { l: 10 + 1.6 * ROW, r: 8, t: 8 + 1.2 * ROW, b: 1.2 * ROW };
  const area = { x: fr.x + margin.l, y: fr.y + margin.t, w: colW - margin.l - margin.r, h: fr.h - stampBand - margin.t - margin.b };
  void band;
  let { placed, box } = layoutBody(model, 300);
  let den = fitScaleDen(box.w, box.h, area.w, area.h);
  ({ placed, box } = layoutBody(model, 16 * den));
  den = fitScaleDen(box.w, box.h, area.w, area.h);
  const S = 1 / den;
  const ox = area.x + (area.w - box.w * S) / 2; const oy = area.y + (area.h - box.h * S) / 2;
  const T: Tf = (p) => ({ x: ox + p.x * S, y: oy + p.y * S });
  const ctx: Ctx = { E, S, profileColor: model.profileColor, gaps };
  for (const pl of placed) {
    drawContour(ctx, pl.dp, T, pl.pts, pl.sides);
    drawEdges(ctx, pl.dp, T, pl.sides, 3.4, false);
    const TH: Tf = (p) => T(pl.holesT(p));
    drawHoles(ctx, pl.dp, TH, pl.dp.sides, { dims: false, ownSink: Boolean(model.sinkDetail), sinkText: 'short', labels: false });
    const b = bbox(pl.pts);
    const thin = Math.min(pl.w, pl.h) * S < 9;
    void b;
    if (!thin) { const lp = TH(labelPoint(pl.dp.pts, pl.dp.sides, pl.dp.holes, 60, textW(pl.dp.name, TEXT.dim.size) / S)); E.push({ kind: 'text', layer: 'Стільниця', rule: 'ВН-6', at: { x: lp.x, y: lp.y + 1 }, text: pl.dp.name, style: 'dim', anchor: 'middle' }); }
    if (pl.dp.kind === 'main') drawAdditionZones(ctx, model, pl.dp, T, pl.sides, false);
  }
  // балони стиків: на середині ділянки стику, лінія стику кольором
  model.additions.forEach((ad, i) => {
    if (!ad.joint) return;
    const hostPl = placed.find((p) => p.dp.productKey === ad.productKey) ?? placed[0];
    const side = hostPl.sides.find((s) => s.name === ad.parentSide); if (!side) return;
    const ux = (side.b.x - side.a.x) / side.len; const uy = (side.b.y - side.a.y) / side.len;
    const p0 = T({ x: side.a.x + ux * ad.joint.a.from, y: side.a.y + uy * ad.joint.a.from });
    const p1 = T({ x: side.a.x + ux * ad.joint.a.to, y: side.a.y + uy * ad.joint.a.to });
    const row = rows[i];
    E.push({ kind: 'polyline', layer: ad.kind === 'wall_panel' ? 'Монтажный стык' : 'Цеховской стык', rule: 'КЛ-1', points: [p0, p1], closed: false, weight: 0.9 });
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const at = { x: mid.x + side.n.x * 9, y: mid.y + side.n.y * 9 };
    E.push({ kind: 'balloon', layer: 'Виноска', rule: 'КС-15', c: at, r: 3.2, text: String(row?.no ?? i + 1), color: row?.color, target: mid });
  });
  // балони стиків стільниць — на середині шва першої частини
  seamRows.forEach((r, k) => {
    const pl = placed.find((p) => p.dp === r.a); if (!pl) return;
    const sd = pl.sides.find((q) => q.seam && Math.abs(q.len - r.len) < 1); if (!sd) return;
    const no = rows.length - seamRows.length + k + 1;
    const mid = T(sd.mid);
    E.push({ kind: 'balloon', layer: 'Виноска', rule: 'КС-15', c: { x: mid.x + sd.n.x * 9, y: mid.y + sd.n.y * 9 + (Math.abs(sd.n.x) > 0.5 ? -9 : 0) }, r: 3.2, text: String(no), color: '#ff00ff', target: mid });
  });
  gaps.push('Марка клею й час витримки — не на кресленні (ІНС-7), у техпроцесі');
  return makeSheet(model, input, { title: 'Стики, фаски, склейка — що з чим і як', entities: E, sections, den, sheetNo, sheetCount, typeLabel: 'Схема склейки', gaps });
}

/* ── специфікація (A4 портрет, СП-1) ────────────────────────────── */

export function composeSpecSheet(model: DrawModel, _input: SetInput, sheetNo: number, sheetCount: number): DrawingSheet {
  const E: Entity[] = [];
  const fr = SHEET_A4P.frame;
  // логотип текстом — праворуч угорі (СП-1)
  E.push({ kind: 'text', layer: 'Стільниця', rule: 'СП-1', at: { x: fr.x + fr.w - 4, y: fr.y + 14 }, text: 'viyar stone', style: 'title', anchor: 'end', bold: true });
  E.push({ kind: 'text', layer: 'Размер', rule: 'СП-1', at: { x: fr.x + 4, y: fr.y + 10 }, text: `Замовлення ${model.project.orderNumber || '—'} · ${model.project.customer || ''}`, style: 'dim' });
  const rh = 6;
  const table = (y0: number, title: string, cols: number[], heads: string[], rows: string[][], minRows: number) => {
    const totalW = cols.reduce((a, b) => a + b, 0);
    const x0 = fr.x + (fr.w - totalW) / 2;
    E.push({ kind: 'polyline', layer: 'Штамп', rule: 'СП-1', points: rectPts({ x: x0 + totalW / 2, y: y0 + rh / 2 }, totalW, rh), closed: true, fill: 'white' });
    E.push({ kind: 'text', layer: 'Штамп', rule: 'СП-1', at: { x: x0 + totalW / 2, y: y0 + rh * 0.72 }, text: title, style: 'name', anchor: 'middle', bold: true });
    const line = (y: number, vals: string[], bold: boolean) => {
      let x = x0;
      vals.forEach((v, i) => {
        E.push({ kind: 'polyline', layer: 'Штамп', rule: 'СП-1', points: rectPts({ x: x + cols[i] / 2, y: y + rh / 2 }, cols[i], rh), closed: true, fill: 'white' });
        E.push({ kind: 'text', layer: 'Штамп', rule: 'СП-1', at: { x: i === 1 ? x + 1.5 : x + cols[i] / 2, y: y + rh * 0.72 }, text: v, style: 'table', anchor: i === 1 ? 'start' : 'middle', bold });
        x += cols[i];
      });
    };
    line(y0 + rh, heads, true);
    const n = Math.max(minRows, rows.length);
    for (let i = 0; i < n; i += 1) line(y0 + rh * (i + 2), rows[i] ?? cols.map(() => ''), false);
    return y0 + rh * (n + 2);
  };
  const productRows = model.body.map((p, i) => [String(i + 1), p.name, `${fmtMm(p.w)}×${fmtMm(p.h)}×${fmtMm(p.thickness)}`, p.kind === 'thickening' ? 'клеїться знизу' : p.kind === 'fold' ? "з'єднання 45°" : p.kind === 'leg' ? "з'єднання 45°" : p.kind === 'wall_panel' ? 'монтаж на об’єкті' : '']);
  if (model.sinkDetail) {
    const g = model.sinkDetail.geometry as { width?: number; height?: number; innerVertical?: number };
    productRows.push([String(productRows.length + 1), `Мийка з каменю (${model.sinkParts.length} дет.)`, `${fmtMm(g.width ?? 0)}×${fmtMm(g.height ?? 0)}×${fmtMm(g.innerVertical ?? 0)} внутр.`, 'вклейка знизу']);
  }
  let y = fr.y + 22;
  y = table(y, 'Специфікація Виробу', [12, 78, 46, 44], ['Поз.', 'Найменування', 'Габарит', 'Примітка'], productRows, 14);
  y += 10;
  table(y, 'Специфікація Фурнітури', [12, 74, 18, 34, 42], ['Поз.', 'Найменування', 'К-сть', 'Артикул', 'Фото'], [], 6);
  return {
    size: { w: SHEET_A4P.w, h: SHEET_A4P.h }, frame: { ...fr }, header: undefined, title: undefined, noStamp: true,
    entities: E, sections: [], stamp: { fields: [] }, sheetNo, sheetCount, scaleDen: 1, gaps: [],
  };
}

export { textW, TEXT, edgeIndex, profileSection };
