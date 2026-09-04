/**
 * КОМПОНУВАЛЬНИК КРЕСЛЕННЯ — «машина», що робить аркуш за правилами — 04.09.2026.
 *
 * Вхід — проєкт VS3D (парти розкрою, деталі, шапка). Вихід — `DrawingSheet`
 * із сутностями, кожна з кодом правила. Правила тут двох родів:
 *   · ОФОРМЛЕННЯ (`ПРАВИЛА_ОФОРМЛЕННЯ_КРЕСЛЕНЬ.md`) — як виглядає;
 *   · КОНСТРУКТИВУ (`ПРАВИЛА_КОНСТРУКТИВУ.md`) — що мусить бути на аркуші.
 *
 * Що робить:
 *   ЗГ-1   заголовок над рамкою;
 *   ЛН-1   контур на шарі «Стільниця» (найтовща лінія);
 *   КР-1/2 профільована сторона — зигзаг на шарі «Кромка» з підписом
 *          «Кромка N» уздовж сторони всередині деталі; R0 — без зигзага;
 *   КЛ-1   кожен профіль — свій колір, і той самий колір у розрізі;
 *   ВН-6   назва деталі в тілі, без виноски;
 *   ОФ-ДР  два тиражі розмірів: чорні робочі до країв, сірі довідкові до
 *          центру вирізу;
 *   ІНС-3  отвори: сантехніка (Ø35/Ø30) — поштучно, однина; кріплення
 *          (Ø12) — групою в штриховій рамці, множина (ВН-5);
 *   ВН-1/2/4 виноска = текст + лінія; підкреслення для елемента;
 *          вертикально, коли по горизонталі тісно;
 *   КС-7   радіус кута вирізу підписується (R15 мийка, R5 варильна);
 *   КС-15/ОФ-45 стик стільниць — лінія цехового стику + підпис; стик
 *          під 45° — текст над стиком, зріз не малюється;
 *   ОФ-ЧВ  вимоги виконавцю — червоним, у вільному місці;
 *   РЗ-2/КР-3 розрізи кромок і вузол — праворуч унизу, біля штампа;
 *   ШП-1/2 штамп списком полів ліворуч унизу; номер аркуша праворуч;
 *   НЕ-2   дані штампа на плані не дублюються.
 *
 * Чого НЕ робить, бо даних у моделі немає (пише в `gaps`): спосіб
 * установки мийки в контурі (ІНС-1), зона «полірувати тил», нависання
 * (КС-9 — має бути явним полем), кути ≠ 90° (ОФ-КУТ), «Корпус» у вузлі
 * (ВН-10), зазор під клей у перерізі (ІНС-2).
 */
import type { Detail, DetailPart, Project, SurfaceCutout } from '../../domain/types';
import { referenceData } from '../../domain/defaults';
import type { DimEntity, DrawingSheet, Entity, Pt, SectionView, StampField } from './model';
import { DIMSTYLE, LINK_COLORS, SCALES, SHEET } from './style';

export interface ComposeInput {
  project: Project;
  parts: DetailPart[];
  details: Detail[];
  sheetNo: number;
  sheetCount: number;
  instructions?: string[];
  kind?: 'stone' | 'plywood' | 'metal';
  /** Додаткові сутності від інших модулів (фанера, метал) у мм деталі → малюються тим самим масштабом. */
  overlay?: (ctx: { toSheet: (partId: string, p: Pt) => Pt | null; scale: number }) => Entity[];
}

interface Placed {
  part: DetailPart;
  detail?: Detail;
  pts: Pt[];          // чистовий контур, зсунутий у 0,0 (мм деталі)
  w: number; h: number;
  offX: number; offY: number; // зсув парта в координатах деталі (для вирізів)
  blank?: { w: number; h: number };
  x: number; y: number;        // аркуш, мм
  role: 'main' | 'leg' | 'other';
  side?: string;
}

const bbox = (pts: Pt[]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
};
/** DWG: dimdec 2, але цілі — без коми (2922,5 · 901). */
export const fmtMm = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : (Math.round(v * 100) / 100).toString().replace('.', ','));
const profileLabel = (id: string) => referenceData.edgeProfiles?.find((p) => p.id === id)?.shortLabel ?? id;
const isR0 = (id: string) => id === 'polished_straight';
const ROW = DIMSTYLE.dimdli * 2; // крок між рядами розмірів, мм аркуша (1,5×тексту ×2 — місце під стрілки)

function profileOf(detail: Detail | undefined, part: DetailPart, side: string): string | undefined {
  const ep = detail?.edgeProfiles ?? {};
  const direct = ep[side];
  if (typeof direct === 'string') return direct;
  const alias = part.sideAliases?.[side];
  const v = alias ? ep[alias] : undefined;
  return typeof v === 'string' ? v : undefined;
}

export function composeAssemblySheet(input: ComposeInput): DrawingSheet {
  const { project, parts, details, kind = 'stone' } = input;
  const detailById = new Map(details.map((d) => [d.id, d]));
  const E: Entity[] = [];
  const gaps: string[] = [];

  // ── 1. Парти → розкладка на аркуші. Опори: з боку D — ліворуч, B — праворуч (як стоять у виробі)
  const cut = parts.filter((p) => (p.nominalPoints ?? p.points)?.length >= 3 && !p.edgeKind);
  const placed: Placed[] = cut.map((part) => {
    const src = part.nominalPoints ?? part.points;
    const b = bbox(src);
    const blankB = part.nominalPoints ? bbox(part.points) : null;
    const detail = detailById.get(part.detailId);
    const role: Placed['role'] = part.type === 'Опора' ? 'leg' : part.isMain ? 'main' : 'other';
    return {
      part, detail, pts: src.map((p) => ({ x: p.x - b.minX, y: p.y - b.minY })), w: b.w, h: b.h,
      offX: b.minX, offY: b.minY,
      blank: blankB && (Math.abs(blankB.w - b.w) > 0.4 || Math.abs(blankB.h - b.h) > 0.4) ? { w: blankB.w, h: blankB.h } : undefined,
      x: 0, y: 0, role, side: part.parentDetailSide ?? detail?.parentDetailSide ?? part.elementSide,
    };
  });
  const rank = (p: Placed) => (p.role === 'leg' ? (p.side === 'D' ? 0 : p.side === 'B' ? 4 : 3) : 1);
  placed.sort((a, b) => rank(a) - rank(b) || a.part.name.localeCompare(b.part.name, 'uk', { numeric: true }));

  const fr = SHEET.frame;
  const stampRows = 14; // приблизно; точно — нижче
  const stampH = stampRows * SHEET.stamp.rowH;
  const area = { x: fr.x + 22, y: fr.y + 4 * ROW, w: fr.w - 34, h: fr.h - stampH - 6 * ROW - 6 };
  const gapMm = 60; // мм деталі між партами — стик читається як розрив
  const totalW = placed.reduce((a, p) => a + p.w, 0) + gapMm * Math.max(0, placed.length - 1);
  const maxH = Math.max(1, ...placed.map((p) => p.h));
  const raw = Math.min(area.w / Math.max(1, totalW), area.h / maxH);
  const den = SCALES.find((d) => 1 / d <= raw) ?? SCALES[SCALES.length - 1];
  const S = 1 / den;
  let cursor = area.x + Math.max(0, (area.w - totalW * S) / 2);
  const baseY = area.y + Math.max(0, (area.h - maxH * S) / 2);
  for (const p of placed) { p.x = cursor; p.y = baseY + (maxH - p.h) * S; cursor += (p.w + gapMm) * S; }
  const toSheetOf = (p: Placed) => (q: Pt): Pt => ({ x: p.x + q.x * S, y: p.y + q.y * S });

  // ── 2. Кольори кромок (КЛ-1): профіль → колір, стабільно по аркушу
  const profileColor = new Map<string, string>();
  const colorFor = (id: string) => { if (!profileColor.has(id)) profileColor.set(id, LINK_COLORS[profileColor.size % LINK_COLORS.length]); return profileColor.get(id)!; };

  const mains = placed.filter((p) => p.role === 'main');
  const topY = Math.min(...placed.map((p) => p.y));

  // ── 3. Загальний розмір по головних деталях (чорний робочий)
  if (mains.length > 1) {
    const a = mains[0]; const b = mains[mains.length - 1];
    E.push(dim({ x: a.x, y: topY }, { x: b.x + b.w * S, y: topY }, -ROW * 2, fmtMm(mains.reduce((s, m) => s + m.w, 0)), false, 'ОФ-ДР: загальний робочий розмір'));
  }

  placed.forEach((p, i) => {
    const T = toSheetOf(p);
    const cx = p.x + (p.w * S) / 2; const cy = p.y + (p.h * S) / 2;

    // Контур (ЛН-1)
    E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ЛН-1', points: p.pts.map(T), closed: true, fill: 'white' });

    // Кромки (КР-1/КР-2, КЛ-1)
    for (const [side, seg] of Object.entries(p.part.sideSegments ?? {})) {
      const id = profileOf(p.detail, p.part, side);
      if (!id) continue;
      const a = T({ x: seg.start.x - p.offX, y: seg.start.y - p.offY });
      const b = T({ x: seg.end.x - p.offX, y: seg.end.y - p.offY });
      const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const rot = ang > 90 || ang < -90 ? ang + 180 : ang;
      const nx = -(b.y - a.y); const ny = b.x - a.x; const nl = Math.hypot(nx, ny) || 1;
      const inward = (cx - mx) * nx + (cy - my) * ny > 0 ? 1 : -1;
      const at = { x: mx + (nx / nl) * inward * 3.4, y: my + (ny / nl) * inward * 3.4 };
      const color = colorFor(id);
      if (!isR0(id)) E.push({ kind: 'zigzag', layer: 'Кромка', rule: 'КР-1', a, b, color });
      E.push({ kind: 'text', layer: 'Кромка', rule: isR0(id) ? 'КР-2' : 'КР-1', at, text: isR0(id) ? 'кромка R0' : `Кромка ${edgeIndexOf(id, profileColor)}`, style: 'node', anchor: 'middle', rotate: rot, color });
    }

    // Габарити деталі — чорні робочі зверху і праворуч
    E.push(dim({ x: p.x, y: p.y }, { x: p.x + p.w * S, y: p.y }, -ROW, fmtMm(p.w), false, 'ОФ-ДР'));
    E.push(dim({ x: p.x + p.w * S, y: p.y }, { x: p.x + p.w * S, y: p.y + p.h * S }, ROW, fmtMm(p.h), false, 'ОФ-ДР'));
    // Заготовка (РЗ-11) — сірим унизу, лише якщо є припуск
    if (p.blank) E.push({ kind: 'text', layer: 'Размер', rule: 'РЗ-11', at: { x: cx, y: p.y + p.h * S + ROW * 3.2 }, text: `заготовка ${fmtMm(p.blank.w)} × ${fmtMm(p.blank.h)}`, style: 'dim', anchor: 'middle' });

    // Вирізи й отвори (ІНС-3, ВН-1/2/4/5, КС-7, ОФ-ДР).
    // Геометрія — з отворів парта (вони вже в координатах парта, після
    // розрізу стиком); тип/радіус — з вирізу деталі того самого розміру.
    const cutouts = Object.values(p.detail?.geometry?.cutouts ?? {}) as SurfaceCutout[];
    const holes = (p.part.nominalHoles ?? p.part.holes ?? []).filter((h) => h && h.length >= 3);
    const holeInfo = holes.map((h) => {
      const hb = bbox(h.map((q) => ({ x: q.x - p.offX, y: q.y - p.offY })));
      const round = Math.abs(hb.w - hb.h) < 2 && h.length > 8;
      const match = cutouts.find((c) => {
        const cw = c.shape === 'circle' ? (c.radius ?? 0) * 2 : (c.width ?? 0);
        const ch = c.shape === 'circle' ? (c.radius ?? 0) * 2 : (c.height ?? 0);
        return Math.abs(cw - hb.w) < 1.5 && Math.abs(ch - hb.h) < 1.5;
      });
      return { w: hb.w, h: hb.h, cx: hb.minX + hb.w / 2, cy: hb.minY + hb.h / 2, round, cut: match };
    });
    const fasteners = holeInfo.filter((h) => h.round && h.w <= 14);
    const singles = holeInfo.filter((h) => !fasteners.includes(h));
    let rowN = 0; // ряди розмірів під деталлю
    // ВН-6: назва деталі в тілі; якщо центр зайнятий вирізом — у вільний кут
    const nameBusy = singles.some((h) => Math.abs(h.cx - p.w / 2) < h.w / 2 + 40 && Math.abs(h.cy - p.h / 2) < h.h / 2 + 20);
    E.push({ kind: 'text', layer: 'Стільниця', rule: 'ВН-6', at: nameBusy ? { x: p.x + 4, y: p.y + 6 } : { x: cx, y: cy + 1 }, text: p.part.name, style: 'name', anchor: nameBusy ? 'start' : 'middle' });
    for (const hd of singles) {
      const c = hd.cut; const w = hd.w; const h = hd.h; const lx = hd.cx; const ly = hd.cy;
      const C = T({ x: lx, y: ly }); const sw = w * S; const sh = h * S;
      if (hd.round) {
        E.push({ kind: 'circle', layer: 'Мойка', rule: 'ІНС-3', c: C, r: sw / 2, fill: 'white' });
        E.push({ kind: 'axis', layer: 'Осевая', rule: 'ШАРИ', a: { x: C.x - sw / 2 - 1.5, y: C.y }, b: { x: C.x + sw / 2 + 1.5, y: C.y } });
        E.push({ kind: 'axis', layer: 'Осевая', rule: 'ШАРИ', a: { x: C.x, y: C.y - sh / 2 - 1.5 }, b: { x: C.x, y: C.y + sh / 2 + 1.5 } });
        // ВН-1/ВН-2: виноска до отвору, підкреслена (елемент); Ø окремо, горизонтально (ВН-4)
        const label = c?.type === 'faucet' ? 'Отвір під змішувач' : c?.type === 'socket' ? 'Отвір під розетку' : 'Отвір';
        E.push({ kind: 'leader', layer: 'Виноска', rule: 'ВН-1/ВН-2', at: { x: C.x + 7, y: C.y - sh / 2 - 7 }, text: label, targets: [{ x: C.x, y: C.y - sh / 2 }], underline: true });
        E.push({ kind: 'text', layer: 'Размер робочий', rule: 'ВН-4', at: { x: C.x + sw / 2 + 1, y: C.y + 1 }, text: `Ø${fmtMm(w)}`, style: 'dim' });
      } else {
        E.push({ kind: 'polyline', layer: 'Мойка', rule: 'ІНС-3', points: rectPts(C, sw, sh), closed: true, fill: 'white', rx: (c?.cornerRadius ?? 0) * S });
        E.push({ kind: 'axis', layer: 'Осевая', rule: 'ШАРИ', a: { x: C.x - sw / 2 - 2, y: C.y }, b: { x: C.x + sw / 2 + 2, y: C.y } });
        E.push({ kind: 'axis', layer: 'Осевая', rule: 'ШАРИ', a: { x: C.x, y: C.y - sh / 2 - 2 }, b: { x: C.x, y: C.y + sh / 2 + 2 } });
        // ІНС-1: спосіб установки — властивість вирізу, якої в моделі ще немає; пишемо лише «Виріз»
        E.push({ kind: 'text', layer: 'Мойка', rule: 'ІНС-1', at: { x: C.x, y: C.y - 0.5 }, text: 'Виріз', style: 'node', anchor: 'middle' });
        if (c?.cornerRadius) E.push({ kind: 'text', layer: 'Размер робочий', rule: 'КС-7', at: { x: C.x + sw / 2 - 0.8, y: C.y - sh / 2 + 3 }, text: `R${fmtMm(c.cornerRadius)}x4`, style: 'dim', anchor: 'end' });
        // чорні робочі: габарит вирізу і від краю деталі до ближнього краю (ОФ-ДР)
        E.push(dim({ x: C.x - sw / 2, y: C.y + sh / 2 }, { x: C.x + sw / 2, y: C.y + sh / 2 }, ROW, fmtMm(w), false, 'ОФ-ДР'));
        E.push(dim({ x: C.x - sw / 2, y: C.y - sh / 2 }, { x: C.x - sw / 2, y: C.y + sh / 2 }, -ROW, fmtMm(h), false, 'ОФ-ДР'));
        const rowY = p.y + p.h * S + ROW * (1 + rowN);
        E.push(dim({ x: p.x, y: p.y + p.h * S }, { x: C.x - sw / 2, y: p.y + p.h * S }, rowY - (p.y + p.h * S), fmtMm(lx - w / 2), false, 'ОФ-ДР: робочий до краю вирізу'));
        // сірий довідковий — до центру
        E.push(dim({ x: p.x, y: p.y + p.h * S }, { x: C.x, y: p.y + p.h * S }, rowY + ROW - (p.y + p.h * S), fmtMm(lx), true, 'ОФ-ДР: довідковий до центру'));
        E.push(dim({ x: p.x + p.w * S, y: p.y }, { x: p.x + p.w * S, y: C.y }, ROW * 2, fmtMm(ly), true, 'ОФ-ДР: довідковий до центру'));
        rowN += 2;
      }
    }
    // ВН-5: група кріплень — штрихова рамка, підпис у множині
    if (fasteners.length) {
      const cs = fasteners.map((h) => T({ x: h.cx, y: h.cy }));
      const r = (fasteners[0].w / 2) * S;
      for (const c of cs) E.push({ kind: 'circle', layer: 'Мойка', rule: 'ІНС-3', c, r, fill: 'white' });
      const b = bbox(cs);
      const pad = 2.5;
      E.push({ kind: 'rect', layer: 'Група', rule: 'ВН-5', a: { x: b.minX - pad, y: b.minY - pad }, b: { x: b.maxX + pad, y: b.maxY + pad } });
      E.push({ kind: 'leader', layer: 'Виноска', rule: 'ВН-5/ВН-2', at: { x: b.maxX + pad + 6, y: b.minY - pad - 4 }, text: fasteners.length > 1 ? 'Отвори під муфти' : 'Отвір під муфту', targets: [{ x: b.maxX + pad, y: b.minY - pad }], underline: true });
      E.push({ kind: 'text', layer: 'Размер робочий', rule: 'ВН-4', at: { x: b.maxX + pad + 1, y: b.maxY + pad + 3 }, text: `Ø${fmtMm(fasteners[0].w)}`, style: 'dim' });
      // КС-8: крок між отворами в ряду — робочий розмір
      if (cs.length > 1) {
        const sorted = [...cs].sort((a, b) => a.x - b.x);
        const stepMm = (sorted[1].x - sorted[0].x) / S;
        if (stepMm > 1) E.push(dim({ x: sorted[0].x, y: b.minY - pad }, { x: sorted[1].x, y: b.minY - pad }, -ROW, fmtMm(stepMm), false, 'КС-8'));
      }
    }

    // Стик із попереднім партом (КС-15 / ОФ-45 / КЛ-1)
    if (i > 0) {
      const prev = placed[i - 1];
      const jx = (prev.x + prev.w * S + p.x) / 2;
      const miter = p.role === 'leg' || prev.role === 'leg';
      if (miter) {
        E.push({ kind: 'text', layer: 'Стільниця', rule: 'ОФ-45', at: { x: jx, y: topY - ROW * 2 - 1.5 }, text: "З'єднання під 45°", style: 'node', anchor: 'middle' });
      } else {
        const y1 = Math.max(p.y, prev.y); const y2 = Math.min(p.y + p.h * S, prev.y + prev.h * S);
        E.push({ kind: 'polyline', layer: 'Цеховской стык', rule: 'КЛ-1', points: [{ x: jx, y: y1 }, { x: jx, y: y2 }], closed: false });
        E.push({ kind: 'leader', layer: 'Виноска', rule: 'КС-15/ВН-2', at: { x: jx + 8, y: cy - 8 }, text: 'Стик стільниць', targets: [{ x: jx, y: cy }], underline: true });
      }
    }
  });

  // ── 4. Накладки інших модулів (фанера/метал) у тому самому масштабі
  if (input.overlay) {
    const idx = new Map(placed.map((p) => [p.part.id, p]));
    E.push(...input.overlay({ scale: S, toSheet: (partId, q) => { const p = idx.get(partId); return p ? toSheetOf(p)(q) : null; } }));
  }

  // ── 5. Вимоги виконавцю (ОФ-ЧВ) — червоним, у вільному місці під планом
  (input.instructions ?? []).forEach((t, i) => {
    E.push({ kind: 'text', layer: 'Вимога', rule: 'ОФ-ЧВ', at: { x: fr.x + fr.w - 6, y: area.y + area.h + 2 + i * 4.5 }, text: t, style: 'note', anchor: 'end', color: '#ff0000' });
  });

  // ── 6. Розрізи (РЗ-2, КР-3, ШТ-1, КЛ-1)
  const thickness = project.projectThickness ?? placed[0]?.part.thickness ?? 20;
  const sections: SectionView[] = [];
  for (const [id, color] of profileColor) {
    const t = thickness * 1.4; const w = 36;
    const ents: Entity[] = [
      { kind: 'polyline', layer: 'Стільниця', rule: 'ШТ-1', points: rectPts({ x: w / 2, y: 6 + t / 2 }, w, t), closed: true, fill: 'hatch-stone', rx: isR0(id) ? 0 : 1.2 },
      { kind: 'polyline', layer: 'Штамп', rule: 'ШТ-2', points: rectPts({ x: w / 2, y: 6 + t / 2 }, 20, 6), closed: true, fill: 'white' },
      { kind: 'text', layer: 'Стільниця', rule: 'ШТ-2', at: { x: w / 2, y: 6 + t / 2 + 1.3 }, text: profileLabel(id), style: 'node', anchor: 'middle' },
      dim({ x: 0, y: 6 }, { x: 0, y: 6 + t }, -3, fmtMm(thickness), false, 'ШР-3'),
    ];
    sections.push({ title: `Кромка ${edgeIndexOf(id, profileColor)}`, color, zigzagIcon: !isR0(id), entities: ents, w: w + 8, h: 6 + t + 4 });
  }
  if (placed.some((p) => p.role === 'leg')) {
    const s = 1.2; const tt = thickness * s; const L = 26;
    const leg = placed.find((p) => p.role === 'leg')!; const main = mains[0];
    sections.push({
      title: '1-1', entities: [
        { kind: 'polyline', layer: 'Стільниця', rule: 'ІНС-5', points: [{ x: 0, y: 6 }, { x: L, y: 6 }, { x: L, y: 6 + tt }, { x: tt, y: 6 + tt }, { x: tt, y: 6 + L }, { x: 0, y: 6 + L }], closed: true, fill: 'hatch-stone' },
        { kind: 'polyline', layer: 'Цеховской стык', rule: 'КС-15', points: [{ x: 0, y: 6 }, { x: tt, y: 6 + tt }], closed: false },
        { kind: 'leader', layer: 'Виноска', rule: 'ВН-10', at: { x: L + 3, y: 6 + tt * 0.8 }, text: main?.part.name ?? 'Стільниця', targets: [{ x: L, y: 6 + tt / 2 }] },
        { kind: 'leader', layer: 'Виноска', rule: 'ВН-10', at: { x: tt + 3, y: 6 + L }, text: leg.part.name, targets: [{ x: tt, y: 6 + L - 4 }] },
        dim({ x: tt, y: 6 + L }, { x: 0, y: 6 + L }, 3, fmtMm(thickness), false, 'ШР-3'),
      ], w: L + 30, h: 6 + L + 8,
    });
    gaps.push('Вузол 1-1: «Корпус» замовника і висота 900–902 у моделі відсутні (ВН-10, ІНС-5)');
  }

  // ── 7. Штамп (ШП-1): набір полів залежить від замовлення
  const slab = project.slabs?.[0];
  const decor = slab?.decor || project.slabTypes?.[0]?.name || '—';
  const hasOwnSink = details.some((d) => d.type === 'Мийка');
  const area2 = Math.round(parts.filter((p) => p.isMain).reduce((a, p) => a + (p.area ?? 0), 0) * 100) / 100;
  const fields: StampField[] = kind === 'metal'
    ? [
        { key: 'Метало каркас', value: '' },
        { key: 'Номер рахунку (камінь)', value: project.orderNumber || '—' },
        { key: 'Матеріал', value: 'профіль за специфікацією' },
        { key: 'Фарба', value: '' },
        { key: 'Доставка', value: 'Цех' },
        { key: 'Автор', value: '' },
        { key: 'Дата', value: new Date().toLocaleDateString('uk-UA') },
      ]
    : [
        { key: 'Тип виробу', value: kind === 'plywood' ? 'Підклад фанерний' : 'Креслення / Монтаж' },
        { key: 'Номер', value: project.orderNumber || '—' },
        { key: 'Замовник', value: project.customer || '—' },
        { key: 'Контакт', value: project.customerContactPhone || '' },
        { key: 'Адреса/Філія ВіЯр/Доставка', value: '' },
        { key: 'Декор', value: decor },
        { key: 'Підбір текстури', value: project.textureSelectionEnabled ? 'Так' : 'Ні' },
        { key: 'Мийка', value: hasOwnSink ? 'ViyarStone' : 'Замовника (не передають)' },
        { key: 'Площа м²', value: String(area2).replace('.', ',') },
        { key: 'Масштаб', value: `1:${den}` },
        { key: 'Автор', value: '' },
        { key: 'Перевірив', value: '' },
        { key: 'Менеджер', value: '' },
        { key: 'Дата створення креслення', value: new Date().toLocaleDateString('uk-UA') },
      ];

  if (placed.some((p) => (p.part.holes ?? []).length > 0)) gaps.push('Спосіб установки мийки в контурі вирізу (ІНС-1) — властивості вирізу в моделі немає');
  gaps.push('Нависання над фасадами (КС-9) — явного поля у виробі немає, на аркуш не пишеться');
  gaps.push('Зона «Полірувати тильну сторону» — у моделі немає');

  return {
    size: { w: SHEET.w, h: SHEET.h }, frame: fr, header: SHEET.header,
    entities: E, sections, stamp: { fields }, sheetNo: input.sheetNo, sheetCount: input.sheetCount, scaleDen: den, gaps,
  };
}

function edgeIndexOf(id: string, map: Map<string, string>) { return [...map.keys()].indexOf(id) + 1; }

function rectPts(c: Pt, w: number, h: number): Pt[] {
  return [{ x: c.x - w / 2, y: c.y - h / 2 }, { x: c.x + w / 2, y: c.y - h / 2 }, { x: c.x + w / 2, y: c.y + h / 2 }, { x: c.x - w / 2, y: c.y + h / 2 }];
}

/** Розмір між a і b, зміщений на `offset` мм перпендикулярно (знак — бік). */
function dim(a: Pt, b: Pt, offset: number, text: string, grey: boolean, rule: string): DimEntity {
  return { kind: 'dim', layer: grey ? 'Размер' : 'Размер робочий', rule, a, b, offset, text, grey };
}

