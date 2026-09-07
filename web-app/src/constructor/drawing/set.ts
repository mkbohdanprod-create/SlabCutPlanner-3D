/**
 * НАБІР КРЕСЛЕНЬ ЦЕХУ — «як у кейсах», один аркуш на один сюжет (06.09.2026).
 *
 * Замовлення власника: «щоб конструктор робив гарні виробничі креслення як
 * у кейсах, на одну сторінку: мийка окремо, стики, фаски, деталі окремо, а
 * потім збірка — що куди клеїться, підвороти».
 *
 * Аркуші набору (усі A3 альбомні, крім специфікації — A4 портрет, СП-1):
 *   1. ЗБІРКА — план виробу з лицьової сторони (ЗГ-1): стільниця, опори й
 *      стінові панелі розгорнуті в площину біля своїх сторін (як у
 *      81-1430086), кромки зигзагом (КР-1), вирізи з двома тиражами
 *      розмірів (ОФ-ДР), стики під 45° підписом (ОФ-45), розрізи кромок,
 *      вирізу під мийку і вузол 1-1 біля штампа (РЗ-2), штамп (ШП-1);
 *   2…N. ДЕТАЛЬ — кожна деталь тіла окремо у великому масштабі: усі
 *      сторони з розмірами, кромки, кути, вирізи, зони потовщень і
 *      підворотів, розрізи її кромок (каталожні креслення профілів);
 *   N+1. МИЙКА — окремий аркуш на мийку (ОФ-МЙ): виріз у стільниці з
 *      робочими й довідковими розмірами, отвори сантехніки, спосіб
 *      установки в контурі (ІНС-1), переріз, збірка чаші з каменю
 *      (стінки, дно, підклейка) і її деталі;
 *   N+2. СТИКИ, ФАСКИ, СКЛЕЙКА — план зі стиками кольором цех/об'єкт (КЛ-1),
 *      номери стиків, таблиця «що з чим, як, де», розрізи кожного типу
 *      з'єднання (45°, пряма підклейка, монтажний), фаски;
 *   N+3. СПЕЦИФІКАЦІЯ — портретний бланк (СП-1): деталі з габаритами,
 *      фурнітура під дозапис.
 *
 * Модель — та сама, що в розкрою: `Project` → деталі → парти рушія. Нічого
 * не вигадуємо: чого в моделі нема (спосіб установки мийки замовника,
 * нависання, «корпус» замовника), те йде в `gaps` і на аркуш не потрапляє.
 */
import type { Detail, DetailPart, Joint, Product, Project } from '../../domain/types';
import type { DrawingSheet, Entity, Pt, SectionView, StampField } from './model';
import { LINK_COLORS, SHEET, SHEET_A4P, TEXT } from './style';
import { additionKind, bbox, cornerVertex, fitScaleDen, fmtMm, holesOf, isFastener, labelPoint, profileOfSide, rectPts, roundedContour, sidesOf, slotOf, textW, translate, type AdditionKind, type BBox, type Hole, type Side } from './geom';
import { dim, foldSection, legNode, profileSection, sinkCutSection, thickeningSection, wallPanelSection } from './sections';
import { layoutSections } from './layoutSections';
import { miterJointFor } from '../../engines/miterAssembly';

export interface SetInput {
  project: Project;
  parts: DetailPart[];
  details: Detail[];
  /** Вимоги виконавцю (ОФ-ЧВ) — червоним на збірці. */
  instructions?: string[];
  /** Поля штампа, яких у проєкті немає (адреса, поверх, ліфт, автор…). */
  stampExtra?: Partial<Record<'Адреса/Філія ВіЯр/Доставка' | 'Поверх' | 'Ліфт' | 'Декор стін.панель / плінтус' | 'Автор' | 'Перевірив' | 'Менеджер', string>>;
}

/** Деталь тіла виробу в термінах креслення. */
export interface DrawPart {
  part: DetailPart;
  detail?: Detail;
  slot: string;
  kind: AdditionKind | 'main';
  /** порядковий номер у наборі: «Деталь 2» */
  no: number;
  /** ім'я на кресленні: «Стільниця 1», «Опора 1», «Стінова панель 1» (ВН-6) */
  name: string;
  /** контур у власних координатах, зсунутий у (0,0) */
  pts: Pt[];
  w: number; h: number;
  off: Pt;
  sides: Side[];
  /** сторона → id профілю кромки */
  profiles: Map<string, string>;
  holes: Hole[];
  /** сторона батьківської деталі, до якої кріпиться */
  parentSide?: string;
  /** Ключ виробу (`prod_…` з id деталі) — доповнення шукає СВОЮ стільницю, а не першу в проєкті. */
  productKey: string;
  joint?: Joint;
  thickness: number;
}

export interface DrawModel {
  project: Project;
  main: DrawPart[];
  additions: DrawPart[];
  /** усі деталі тіла (без мийки) у порядку нумерації */
  body: DrawPart[];
  sinkParts: DetailPart[];
  sinkDetail?: Detail;
  /** id профілю → колір (КЛ-1) і номер «Кромка N» */
  profileColor: Map<string, string>;
  thickness: number;
  material?: string;
  gaps: string[];
}

export const ROW = 7.5; // крок рядів розмірів, мм аркуша (ШР-3: 1,5×тексту ×2 — місце під стрілки)
const TYPE_NAMES: Record<string, string> = { 'Стільниця': 'Стільниця', 'Опора': 'Опора', 'Стінова панель': 'Стінова панель', 'Потовщення': 'Потовщення', 'Підворот': 'Підворот', 'Фасад': 'Фасад', 'Довільний елемент': 'Деталь' };

/* ── модель ─────────────────────────────────────────────────────── */

export function buildDrawModel(input: SetInput): DrawModel {
  const { project, parts, details } = input;
  const detailById = new Map(details.map((d) => [d.id, d]));
  const products: Product[] = project.products ?? [];
  // стики: ключ разом із виробом — у двох виробах бувають однакові joint_leg_B
  const productKeyOf = (id: string) => (/^(?:part:)?([^/]+)\/element:/.exec(id)?.[1] ?? id);
  const joints = new Map<string, Joint>();
  for (const pr of products) for (const el of pr.elements) for (const j of el.joints ?? []) joints.set(`${productKeyOf(j.a.elementPath)}|${j.id}`, j);
  const thickness = project.projectThickness ?? parts[0]?.thickness ?? 20;
  const material = project.projectMaterial;

  const sinkParts = parts.filter((p) => p.type === 'Мийка');
  const sinkDetail = details.find((d) => d.type === 'Мийка');
  const bodyRaw = parts.filter((p) => p.type !== 'Мийка' && (p.nominalPoints ?? p.points)?.length >= 3);

  const counters = new Map<string, number>();
  const profileColor = new Map<string, string>();
  const colorFor = (id: string) => { if (!profileColor.has(id)) profileColor.set(id, LINK_COLORS[profileColor.size % LINK_COLORS.length]); return profileColor.get(id)!; };

  const toDraw = (part: DetailPart): DrawPart => {
    const detail = detailById.get(part.detailId);
    const slot = slotOf(part.detailId);
    const productKey = productKeyOf(part.detailId);
    const kind: DrawPart['kind'] = slot === 'main' || (part.isMain && part.type === 'Стільниця' && !part.parentDetailSide) ? 'main' : additionKind(slot);
    const src = part.nominalPoints ?? part.points;
    const b = bbox(src);
    const pts = src.map((p) => ({ x: p.x - b.minX, y: p.y - b.minY }));
    const segs = part.sideSegments ? Object.fromEntries(Object.entries(part.sideSegments).map(([k, v]) => [k, { start: { x: v.start.x - b.minX, y: v.start.y - b.minY }, end: { x: v.end.x - b.minX, y: v.end.y - b.minY } }])) : undefined;
    const sides = sidesOf(pts, segs);
    const profiles = new Map<string, string>();
    for (const s of sides) { const id = profileOfSide(detail, part, s.name); if (id) { profiles.set(s.name, id); colorFor(id); } }
    const base = kind === 'main' ? 'Стільниця' : kind === 'leg' ? 'Опора' : kind === 'wall_panel' ? 'Стінова панель' : kind === 'thickening' ? 'Потовщення' : kind === 'fold' ? 'Підворот' : kind === 'skirting' ? 'Бортик' : (TYPE_NAMES[part.type] ?? part.type);
    const n = (counters.get(base) ?? 0) + 1; counters.set(base, n);
    return {
      part, detail, slot, kind, no: 0, name: `${base} ${n}`, pts, w: b.w, h: b.h, off: { x: b.minX, y: b.minY }, sides, profiles,
      holes: holesOf(part, detail, { x: b.minX, y: b.minY }),
      parentSide: part.parentDetailSide ?? detail?.parentDetailSide, joint: joints.get(`${productKey}|joint_${slot}`), thickness: part.thickness ?? thickness,
      productKey,
    };
  };
  const all = bodyRaw.map(toDraw);
  const main = all.filter((p) => p.kind === 'main');
  const order: DrawPart['kind'][] = ['main', 'leg', 'wall_panel', 'skirting', 'fold', 'thickening', 'other', 'sink'];
  const body = [...all].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name, 'uk', { numeric: true }));
  body.forEach((p, i) => { p.no = i + 1; });
  const gaps: string[] = [];
  if (!main.length) gaps.push('У проєкті немає стільниці — нема чого розкласти на збірці');
  return { project, main, additions: all.filter((p) => p.kind !== 'main'), body, sinkParts, sinkDetail, profileColor, thickness, material, gaps };
}

/* ── спільне малювання деталі ───────────────────────────────────── */

export interface Ctx { E: Entity[]; S: number; profileColor: Map<string, string>; gaps: string[] }
/** точка деталі → аркуш */
export type Tf = (p: Pt) => Pt;

export const edgeIndex = (id: string, map: Map<string, string>) => [...map.keys()].indexOf(id) + 1;

export function drawContour(ctx: Ctx, dp: DrawPart, T: Tf, pts: Pt[], sides: Side[]) {
  const corners = (dp.detail?.geometry?.corners ?? {}) as Record<string, { type?: string; radius?: number }>;
  const rounded = roundedContour(pts, sides, corners);
  ctx.E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ЛН-1', points: rounded.map(T), closed: true, fill: 'white' });
  // розпил деталі на частини — стик стільниць, пурпуровим як монтажний (КЛ-1); тип збірки — ГІПОТЕЗА (на об'єкті)
  for (const sd of sides) if (sd.seam) ctx.E.push({ kind: 'polyline', layer: 'Монтажный стык', rule: 'КЛ-1', points: [T(sd.a), T(sd.b)], closed: false, weight: 0.9 });
}

/** Кромки зигзагом з підписом усередині деталі (КР-1/КР-2, КЛ-1). */
export function drawEdges(ctx: Ctx, dp: DrawPart, T: Tf, sides: Side[], labelOffset = 3.4, withLabel = true, avoid: BBox[] = []) {
  for (const s of sides) {
    const id = dp.profiles.get(s.name); if (!id) continue;
    const a = T(s.a); const b = T(s.b);
    const color = ctx.profileColor.get(id) ?? '#000';
    const r0 = id === 'polished_straight';
    if (!r0) ctx.E.push({ kind: 'zigzag', layer: 'Кромка', rule: 'КР-1', a, b, color });
    if (!withLabel || s.len * ctx.S < 26) continue;
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    let rot = ang; if (rot > 90) rot -= 180; if (rot <= -90) rot += 180; // текст читається зліва направо / знизу вгору
    const text = r0 ? 'кромка R0' : `Кромка ${edgeIndex(id, ctx.profileColor)}`;
    // місце вздовж ребра: середина, а якщо там виріз — зсуваємось до чвертей (ВН-6: підпис не на вирізі)
    const tw = textW(text, TEXT.node.size) * 1.12; const along = Math.abs(rot) > 45;
    // штраф за перекриття з вирізами: 0 — вільно; менше 0 — лише запас; більше 0 — реальний наїзд
    const penalty = (t: number, off: number) => {
      const q = T({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t });
      const c = { x: q.x - s.n.x * off, y: q.y - s.n.y * off };
      const hw = along ? 1.8 : tw / 2; const hh = along ? tw / 2 : 1.8;
      const box = { minX: c.x - hw, maxX: c.x + hw, minY: c.y - hh, maxY: c.y + hh };
      let worst = -Infinity;
      for (const h of avoid) {
        const dx = Math.max(h.minX - box.maxX, box.minX - h.maxX); const dy = Math.max(h.minY - box.maxY, box.minY - h.maxY);
        const gap = Math.max(dx, dy); // > 0 — між ними є проміжок
        worst = Math.max(worst, -gap);
      }
      return worst; // -Infinity, коли вирізів нема
    };
    const cands = [0.5, 0.38, 0.62, 0.28, 0.72, 0.18, 0.82];
    let best = { t: 0.5, off: labelOffset, pen: Infinity };
    for (const t of cands) { const pen = penalty(t, labelOffset); if (pen < best.pen) best = { t, off: labelOffset, pen }; if (pen <= -2.5) break; }
    // всередині ніде — підпис зовні ребра, між контуром і рядом розмірів
    if (best.pen > -0.5) best = { t: 0.5, off: -Math.min(labelOffset, 3.2), pen: 0 };
    const q = T({ x: s.a.x + (s.b.x - s.a.x) * best.t, y: s.a.y + (s.b.y - s.a.y) * best.t });
    const at = { x: q.x - s.n.x * best.off, y: q.y - s.n.y * best.off + (along ? 0 : 0.9) };
    ctx.E.push({ kind: 'text', layer: 'Кромка', rule: r0 ? 'КР-2' : 'КР-1', at, text, style: 'node', anchor: 'middle', rotate: rot, color });
  }
}

/** Габарити отворів у координатах аркуша — щоб підписи їх обходили. */
export function holeBoxes(dp: DrawPart, T: Tf): BBox[] {
  return dp.holes.map((h) => bbox([T({ x: h.box.minX, y: h.box.minY }), T({ x: h.box.maxX, y: h.box.minY }), T({ x: h.box.maxX, y: h.box.maxY }), T({ x: h.box.minX, y: h.box.maxY })]));
}

/** Літери сторін дрібним сірим — зовні біля середини ребра (для посилань у таблицях). */
export function drawSideLetters(ctx: Ctx, T: Tf, sides: Side[]) {
  for (const s of sides) {
    if (s.len * ctx.S < 8) continue;
    const mid = T(s.mid);
    if (s.seam) { ctx.E.push({ kind: 'text', layer: 'Монтажный стык', rule: 'КЛ-1', at: { x: mid.x - s.n.x * 2.6, y: mid.y - s.n.y * 2.6 + 0.9 }, text: 'стик стільниць', style: 'dim', anchor: 'middle', color: '#ff00ff', rotate: Math.abs(s.n.x) > 0.5 ? -90 : 0 }); continue; }
    ctx.E.push({ kind: 'text', layer: 'Размер', rule: 'П-2', at: { x: mid.x + s.n.x * 2.2, y: mid.y + s.n.y * 2.2 + 0.9 }, text: s.name, style: 'dim', anchor: 'middle', color: '#808080' });
  }
}

/** Розміри всіх сторін зовні (ряд 1) — для аркуша деталі. */
export function drawSideDims(ctx: Ctx, T: Tf, sides: Side[], row = 1, withSeams = true) {
  for (const s of sides) {
    if (s.len < 1) continue;
    if (s.seam && !withSeams) continue;
    let a = T(s.a); let b = T(s.b);
    // DimView: від'ємний offset = угору/ліворуч лише коли a→b іде вправо/вниз — нормалізуємо порядок
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    if (horizontal ? b.x < a.x : b.y < a.y) [a, b] = [b, a];
    const outward = horizontal ? (s.n.y < 0 ? -1 : 1) : (s.n.x < 0 ? -1 : 1);
    ctx.E.push(dim(a, b, outward * ROW * row, fmtMm(s.len), false, 'ОФ-ДР'));
  }
}

/** Кути: радіус — виноска «R50» до вершини (КС-7); фаска — «фаска b×c». */
export function drawCorners(ctx: Ctx, dp: DrawPart, T: Tf, sides: Side[]) {
  const corners = (dp.detail?.geometry?.corners ?? {}) as Record<string, { type?: string; radius?: number; sizeB?: number; sizeC?: number }>;
  for (const [id, c] of Object.entries(corners)) {
    const v = cornerVertex(sides, id); if (!v || !c) continue;
    const p = T(v);
    const text = c.type === 'radius' && c.radius ? `R${fmtMm(c.radius)}` : c.type === 'chamfer' ? `фаска ${fmtMm(c.sizeB ?? 0)}×${fmtMm(c.sizeC ?? c.sizeB ?? 0)}` : c.type === 'l-cut' ? `зріз ${fmtMm(c.sizeB ?? 0)}×${fmtMm(c.sizeC ?? 0)}` : '';
    if (!text) continue;
    // виноска назовні від кута — по бісектрисі нормалей суміжних сторін
    const s1 = sides.find((s) => s.name === id[0]); const s2 = sides.find((s) => s.name === id[1]);
    const nx = (s1?.n.x ?? 0) + (s2?.n.x ?? 0); const ny = (s1?.n.y ?? 0) + (s2?.n.y ?? 0);
    const nl = Math.hypot(nx, ny) || 1;
    const at = { x: p.x + (nx / nl) * 9, y: p.y + (ny / nl) * 9 };
    ctx.E.push({ kind: 'leader', layer: 'Виноска', rule: 'КС-7', at: { x: at.x + (nx < 0 ? -textW(text, TEXT.node.size) : 0), y: at.y }, text, targets: [p] });
  }
}

type Band = 'top' | 'bottom' | 'left' | 'right';
interface HoleDimPlan { h: Hole; xBand: Band; yBand: Band; /** горизонтальна база y-відступу */ xRef?: Side; /** вертикальна база x-відступу */ yRef?: Side; /** сторона, біля якої лежить смуга x-розмірів */ xLine?: Side }
interface DimPlan { items: HoleDimPlan[]; rows: Record<Band, number> }

/**
 * Куди йдуть розміри вирізів (ОФ-ДР): x-відступи — у смугу під найближчою
 * горизонтальною стороною ЗНИЗУ від вирізу (для Г-подібної — у виріз-нішу;
 * над деталлю лишаються тільки габарит і виноски отворів), інакше зверху;
 * y-відступи — до найближчої вертикальної сторони (ліворуч чи праворуч).
 * Ряд 1 кожної смуги зайнятий габаритом сторони.
 */
export function planHoleDims(dp: DrawPart, sides: Side[]): DimPlan {
  const rows: Record<Band, number> = { top: 1, bottom: 1, left: 1, right: 1 };
  const horiz = (sd: Side) => Math.abs(sd.b.x - sd.a.x) >= Math.abs(sd.b.y - sd.a.y);
  const items: HoleDimPlan[] = [];
  for (const h of dp.holes) {
    if (isFastener(h)) continue;
    const below = sides.filter((sd) => horiz(sd) && Math.min(sd.a.x, sd.b.x) <= h.cx && Math.max(sd.a.x, sd.b.x) >= h.cx && sd.a.y >= h.box.maxY - 0.1).sort((p, q) => p.a.y - q.a.y)[0];
    const above = sides.filter((sd) => horiz(sd) && Math.min(sd.a.x, sd.b.x) <= h.cx && Math.max(sd.a.x, sd.b.x) >= h.cx && sd.a.y <= h.box.minY + 0.1).sort((p, q) => q.a.y - p.a.y)[0];
    const left = sides.filter((sd) => !horiz(sd) && Math.min(sd.a.y, sd.b.y) <= h.cy && Math.max(sd.a.y, sd.b.y) >= h.cy && sd.a.x <= h.box.minX + 0.1).sort((p, q) => q.a.x - p.a.x)[0];
    const right = sides.filter((sd) => !horiz(sd) && Math.min(sd.a.y, sd.b.y) <= h.cy && Math.max(sd.a.y, sd.b.y) >= h.cy && sd.a.x >= h.box.maxX - 0.1).sort((p, q) => p.a.x - q.a.x)[0];
    // база — сторони прив'язки вирізу (bindCorner 'FA' → F і A), якщо вони накривають виріз; інакше ближчі
    const bind = (h.cut as { bindCorner?: string } | undefined)?.bindCorner ?? '';
    const bound = [...bind].map((ch) => sides.find((sd) => sd.name === ch)).filter(Boolean) as Side[];
    // …але сторона прив'язки не має бути далі ніж удвічі від найближчої: інакше лінія-виноска йде через усю деталь
    const dLeft = left ? h.box.minX - left.a.x : Infinity; const dRight = right ? right.a.x - h.box.maxX : Infinity;
    const dAbove = above ? h.box.minY - above.a.y : Infinity; const dBelow = below ? below.a.y - h.box.maxY : Infinity;
    const boundV = bound.find((sd) => !horiz(sd) && ((sd === left && dLeft <= 2 * dRight) || (sd === right && dRight <= 2 * dLeft)));
    const boundH = bound.find((sd) => horiz(sd) && ((sd === above && dAbove <= 2 * dBelow) || (sd === below && dBelow <= 2 * dAbove)));
    const yBand: Band = boundV ? (boundV === left ? 'left' : 'right') : left && right ? (dLeft <= dRight ? 'left' : 'right') : right ? 'right' : 'left';
    const yRef = yBand === 'left' ? left : right;
    // горизонтальна база — сторона прив'язки, а без неї ближча з двох (верх чи низ)
    const xRef = boundH ?? (dBelow < dAbove ? below : above);
    // смуга для x-відступів: нижня лише коли нижня сторона накриває весь розмір (лінія не піде по тілу деталі)
    const covers = (sd: Side | undefined, x1: number, x2: number) => Boolean(sd) && Math.min(sd!.a.x, sd!.b.x) <= Math.min(x1, x2) + 0.1 && Math.max(sd!.a.x, sd!.b.x) >= Math.max(x1, x2) - 0.1;
    const refX = yRef?.a.x ?? h.cx;
    const xBand: Band = below && covers(below, refX, h.cx) ? 'bottom' : above && covers(above, refX, h.cx) ? 'top' : below ? 'bottom' : 'top';
    const n = h.round ? 1 : 2;
    const item: HoleDimPlan = { h, xBand, yBand, xRef, yRef, xLine: xBand === 'bottom' ? below : above };
    // x-відступ міряється від вертикальної сторони (лівої, якщо є), y — від горизонтальної
    if (item.yRef) rows[xBand] += n;
    if (item.xRef) rows[yBand] += n;
    items.push(item);
  }
  return { items, rows };
}

/** Вирізи й отвори: мийка, прямокутні, сантехніка, кріплення (ІНС-1/ІНС-3, ВН-1/2/4/5, КС-7, ОФ-ДР). */
export function drawHoles(ctx: Ctx, dp: DrawPart, T: Tf, sides: Side[], opts: { dims: boolean; ownSink: boolean; sinkText: 'full' | 'short'; labels?: boolean; insideLabels?: boolean }, plan?: DimPlan) {
  const labels = opts.labels ?? true;
  // збірка: підписи лише всередині вирізів, якщо вміщаються (ІНС-1), без виносок і рядів
  const inside = labels || Boolean(opts.insideLabels);
  const S = ctx.S;
  const fasteners = dp.holes.filter(isFastener);
  const P = plan ?? planHoleDims(dp, sides);
  const used: Record<Band, number> = { top: 1, bottom: 1, left: 1, right: 1 };
  const ext = (from: Pt, to: Pt, grey: boolean) => ctx.E.push({ kind: 'polyline', layer: grey ? 'Размер' : 'Размер робочий', rule: 'ОФ-ДР', points: [from, to], closed: false });
  const seen = new Set<string>();
  const offsetDims = (it: HoleDimPlan, edgeX: number, edgeY: number) => {
    const { h, xRef, yRef } = it;
    const xLine = it.xLine ?? xRef;
    // однакові відступи двох отворів (змішувач і дозатор на одній лінії) — один розмір
    const keyX = yRef ? `x|${it.xBand}|${yRef.name}|${fmtMm(Math.abs(edgeX - yRef.a.x))}` : '';
    const keyY = xRef && yRef ? `y|${it.yBand}|${xRef.name}|${fmtMm(Math.abs(edgeY - xRef.a.y))}` : '';
    if (yRef && xLine && !seen.has(keyX)) {
      seen.add(keyX);
      // x-відступ: горизонтальний розмір у смузі xBand (над/під стороною xLine), від вертикальної сторони yRef
      const sign = it.xBand === 'top' ? -1 : 1;
      const r = used[it.xBand] + 1; used[it.xBand] = r + (h.round ? 0 : 1);
      const yLine = T({ x: 0, y: xLine.a.y }).y;
      const xs = [T({ x: yRef.a.x, y: 0 }).x, T({ x: edgeX, y: 0 }).x].sort((a, b) => a - b);
      ctx.E.push(dim({ x: xs[0], y: yLine }, { x: xs[1], y: yLine }, sign * r * ROW, fmtMm(Math.abs(edgeX - yRef.a.x)), false, 'ОФ-ДР: робочий до краю'));
      const holeEdgeY = it.xBand === 'top' ? (h.round ? h.cy : h.box.minY) : (h.round ? h.cy : h.box.maxY);
      void holeEdgeY;
      ext(T({ x: edgeX, y: holeEdgeY }), { x: T({ x: edgeX, y: 0 }).x, y: yLine + sign * (r * ROW + 1.25) }, false);
      if (!h.round) {
        const xs2 = [T({ x: yRef.a.x, y: 0 }).x, T({ x: h.cx, y: 0 }).x].sort((a, b) => a - b);
        ctx.E.push(dim({ x: xs2[0], y: yLine }, { x: xs2[1], y: yLine }, sign * (r + 1) * ROW, fmtMm(Math.abs(h.cx - yRef.a.x)), true, 'ОФ-ДР: довідковий до центру'));
        ext(T({ x: h.cx, y: holeEdgeY }), { x: T({ x: h.cx, y: 0 }).x, y: yLine + sign * ((r + 1) * ROW + 1.25) }, true);
      }
    }
    if (xRef && yRef && !seen.has(keyY)) {
      seen.add(keyY);
      // y-відступ: вертикальний розмір у смузі yBand (ліворуч/праворуч від yRef), від горизонтальної сторони xRef
      const sign = it.yBand === 'left' ? -1 : 1;
      const r = used[it.yBand] + 1; used[it.yBand] = r + (h.round ? 0 : 1);
      const xLine = T({ x: yRef.a.x, y: 0 }).x;
      const ys = [T({ x: 0, y: xRef.a.y }).y, T({ x: 0, y: edgeY }).y].sort((a, b) => a - b);
      ctx.E.push(dim({ x: xLine, y: ys[0] }, { x: xLine, y: ys[1] }, sign * r * ROW, fmtMm(Math.abs(edgeY - xRef.a.y)), false, 'ОФ-ДР: робочий до краю'));
      const holeEdgeX = it.yBand === 'left' ? (h.round ? h.cx : h.box.minX) : (h.round ? h.cx : h.box.maxX);
      ext(T({ x: holeEdgeX, y: edgeY }), { x: xLine + sign * (r * ROW + 1.25), y: T({ x: 0, y: edgeY }).y }, false);
      if (!h.round) {
        const ys2 = [T({ x: 0, y: xRef.a.y }).y, T({ x: 0, y: h.cy }).y].sort((a, b) => a - b);
        ctx.E.push(dim({ x: xLine, y: ys2[0] }, { x: xLine, y: ys2[1] }, sign * (r + 1) * ROW, fmtMm(Math.abs(h.cy - xRef.a.y)), true, 'ОФ-ДР: довідковий до центру'));
        ext(T({ x: holeEdgeX, y: h.cy }), { x: xLine + sign * ((r + 1) * ROW + 1.25), y: T({ x: 0, y: h.cy }).y }, true);
      }
    }
  };
  let roundIdx = 0;
  for (const it of P.items) {
    const h = it.h;
    const C = T({ x: h.cx, y: h.cy }); const sw = h.box.w * S; const sh = h.box.h * S;
    if (h.round) {
      const stagger = roundIdx * 4.5; roundIdx += 1;
      ctx.E.push({ kind: 'circle', layer: 'Мойка', rule: 'ІНС-3', c: C, r: sw / 2, fill: 'white' });
      ctx.E.push({ kind: 'axis', layer: 'Осевая', rule: 'ШАРИ', a: { x: C.x - sw / 2 - 1.5, y: C.y }, b: { x: C.x + sw / 2 + 1.5, y: C.y } });
      ctx.E.push({ kind: 'axis', layer: 'Осевая', rule: 'ШАРИ', a: { x: C.x, y: C.y - sh / 2 - 1.5 }, b: { x: C.x, y: C.y + sh / 2 + 1.5 } });
      if (labels) {
        // виноска вгору-праворуч, над рядами розмірів верхньої смуги (якщо вони там є); Ø окремо (ВН-4)
        const label = h.cut?.type === 'faucet' ? 'Отвір під змішувач' : h.cut?.type === 'socket' ? 'Отвір під розетку' : 'Отвір';
        const topY = T({ x: 0, y: bboxTop(sides) }).y - (P.rows.top + 0.4) * ROW;
        const at = { x: C.x + sw / 2 + 4 + stagger * 1.4, y: topY - stagger };
        ctx.E.push({ kind: 'leader', layer: 'Виноска', rule: 'ВН-1/ВН-2', at, text: label, targets: [{ x: C.x + sw / 2 * 0.7, y: C.y - sh / 2 * 0.7 }], underline: true });
        ctx.E.push({ kind: 'text', layer: 'Размер робочий', rule: 'ВН-4', at: { x: at.x + textW(label, TEXT.node.size) + 1.5, y: at.y }, text: `Ø${fmtMm(h.d)}`, style: 'dim' });
      }
      if (opts.dims) offsetDims(it, h.cx, h.cy);
      continue;
    }
    // прямокутний виріз
    const rx = (h.isSink ? 10 : (h.cut?.cornerRadius ?? 0)) * S;
    ctx.E.push({ kind: 'polyline', layer: 'Мойка', rule: 'ІНС-3', points: rectPts(C, sw, sh), closed: true, fill: 'white', rx });
    ctx.E.push({ kind: 'axis', layer: 'Осевая', rule: 'ШАРИ', a: { x: C.x - sw / 2 - 2, y: C.y }, b: { x: C.x + sw / 2 + 2, y: C.y } });
    ctx.E.push({ kind: 'axis', layer: 'Осевая', rule: 'ШАРИ', a: { x: C.x, y: C.y - sh / 2 - 2 }, b: { x: C.x, y: C.y + sh / 2 + 2 } });
    if (h.isSink) {
      // ІНС-1: спосіб установки — всередині контуру вирізу; якщо там ще й габарит (розміри всередині) — місця менше,
      // тоді коротший текст, а коли й він не лізе — виноска
      const insideDims = opts.dims && sw > 22 && sh > 16;
      const full = ['Виріз під мийку', opts.ownSink ? 'мийка ViyarStone' : 'мийка замовника', '(вклейка знизу)'];
      const short = ['Виріз під мийку', '(вклейка знизу)'];
      const small = sw < textW(full[0], TEXT.node.size) + 3;
      const style = small ? 'dim' : 'node'; const lh = small ? 3.2 : 4.2;
      const room = sh - (insideDims ? 6.5 : 2);
      const lines = opts.sinkText === 'full' && full.length * lh < room ? full : short;
      const fits = inside && lines.length * lh < room && sw > textW(lines[0], TEXT[style].size) + 2;
      if (fits) {
        const dy = insideDims ? -2 : 0; // усередині ще й габарит знизу — текст трохи вище
        lines.forEach((t, i) => ctx.E.push({ kind: 'text', layer: 'Мойка', rule: 'ІНС-1', at: { x: C.x, y: C.y + dy - ((lines.length - 1) * lh) / 2 + i * lh + 1 }, text: t, style, anchor: 'middle', color: i === 1 && !opts.ownSink && lines === full ? '#ff0000' : undefined }));
        ctx.E.push({ kind: 'text', layer: 'Размер робочий', rule: 'КС-7', at: { x: C.x + sw / 2 - 0.8, y: C.y - sh / 2 + 3 }, text: 'R10x4', style: 'dim', anchor: 'end' });
      } else if (labels) {
        // дрібний масштаб: виноска до вирізу, текст у смузі під деталлю за рядами розмірів
        const bottom = it.xLine && it.xBand === 'bottom' ? it.xLine : undefined;
        const text = `Виріз під мийку (вклейка знизу)${opts.ownSink ? '' : ' — мийка замовника'}`;
        const tw = textW(text, TEXT.node.size);
        const anchorY = bottom ? T({ x: h.cx, y: bottom.a.y }).y + (P.rows.bottom + 1.2) * ROW : C.y + sh / 2 + 10;
        const minX = bottom ? T({ x: Math.min(bottom.a.x, bottom.b.x), y: 0 }).x + 12 : C.x - tw / 2;
        ctx.E.push({ kind: 'leader', layer: 'Виноска', rule: 'ІНС-1', at: { x: Math.max(minX, C.x - tw / 2), y: anchorY }, text, targets: [{ x: C.x, y: C.y + sh / 2 }] });
        ctx.E.push({ kind: 'text', layer: 'Размер робочий', rule: 'КС-7', at: { x: C.x + sw / 2 + 1, y: C.y - sh / 2 + 2.4 }, text: 'R10x4', style: 'dim' });
      }
    } else if (labels || (inside && sw > textW('Виріз', TEXT.node.size) + 2 && sh > 6)) {
      ctx.E.push({ kind: 'text', layer: 'Мойка', rule: 'ІНС-1', at: { x: C.x, y: C.y + 1.1 }, text: 'Виріз', style: 'node', anchor: 'middle' });
      if (labels && h.cut?.cornerRadius) ctx.E.push({ kind: 'text', layer: 'Размер робочий', rule: 'КС-7', at: { x: C.x + sw / 2 - 0.8, y: C.y - sh / 2 + 3 }, text: `R${fmtMm(h.cut.cornerRadius)}x4`, style: 'dim', anchor: 'end' });
    }
    if (opts.dims) {
      // габарит вирізу — чорний. Великий виріз: усередині контуру (низ і лівий край), щоб не лізти на ребро деталі;
      // малий: зовні, з боку, дальшого від бази (там немає рядів відступів)
      const insideOk = sw > 22 && sh > 16;
      if (insideOk) {
        ctx.E.push(dim({ x: C.x - sw / 2, y: C.y + sh / 2 }, { x: C.x + sw / 2, y: C.y + sh / 2 }, -3.4, fmtMm(h.box.w), false, 'ОФ-ДР'));
        ctx.E.push(dim({ x: C.x - sw / 2, y: C.y - sh / 2 }, { x: C.x - sw / 2, y: C.y + sh / 2 }, 3.4, fmtMm(h.box.h), false, 'ОФ-ДР'));
      } else {
        const wSign = it.xBand === 'top' ? 1 : -1; const hSign = it.yBand === 'left' ? 1 : -1;
        const wy = wSign > 0 ? C.y + sh / 2 : C.y - sh / 2; const hx = hSign > 0 ? C.x + sw / 2 : C.x - sw / 2;
        ctx.E.push(dim({ x: C.x - sw / 2, y: wy }, { x: C.x + sw / 2, y: wy }, wSign * ROW * 0.9, fmtMm(h.box.w), false, 'ОФ-ДР'));
        ctx.E.push(dim({ x: hx, y: C.y - sh / 2 }, { x: hx, y: C.y + sh / 2 }, hSign * ROW * 0.9, fmtMm(h.box.h), false, 'ОФ-ДР'));
      }
      const edgeX = it.yBand === 'left' ? h.box.minX : h.box.maxX;
      const edgeY = it.xRef && it.xRef.a.y > h.cy ? h.box.maxY : h.box.minY;
      offsetDims(it, edgeX, edgeY);
    }
  }
  if (fasteners.length) {
    const cs = fasteners.map((h) => T({ x: h.cx, y: h.cy })); const r = (fasteners[0].d / 2) * S;
    for (const c of cs) ctx.E.push({ kind: 'circle', layer: 'Мойка', rule: 'ІНС-3', c, r, fill: 'white' });
    const b = bbox(cs); const pad = 2.5;
    ctx.E.push({ kind: 'rect', layer: 'Група', rule: 'ВН-5', a: { x: b.minX - pad, y: b.minY - pad }, b: { x: b.maxX + pad, y: b.maxY + pad } });
    if (labels) {
      ctx.E.push({ kind: 'leader', layer: 'Виноска', rule: 'ВН-5/ВН-2', at: { x: b.maxX + pad + 6, y: b.minY - pad - 4 }, text: fasteners.length > 1 ? 'Отвори під муфти' : 'Отвір під муфту', targets: [{ x: b.maxX + pad, y: b.minY - pad }], underline: true });
      ctx.E.push({ kind: 'text', layer: 'Размер робочий', rule: 'ВН-4', at: { x: b.maxX + pad + 1, y: b.maxY + pad + 3 }, text: `Ø${fmtMm(fasteners[0].d)}`, style: 'dim' });
    }
  }
}

const bboxTop = (sides: Side[]) => Math.min(...sides.map((s) => Math.min(s.a.y, s.b.y)));

/** Ряди розмірів, що виходять за габарит деталі (для полів аркуша): смуги біля крайніх сторін. */
function marginRows(plan: DimPlan, dp: DrawPart): Record<Band, number> {
  const rows: Record<Band, number> = { top: 1, bottom: 1, left: 1, right: 1 };
  for (const it of plan.items) {
    const n = it.h.round ? 1 : 2;
    const xl = it.xLine ?? it.xRef;
    if (xl && it.yRef) { if (it.xBand === 'top' && xl.a.y <= 0.1) rows.top += n; if (it.xBand === 'bottom' && xl.a.y >= dp.h - 0.1) rows.bottom += n; }
    if (it.yRef && it.xRef) { if (it.yBand === 'left' && it.yRef.a.x <= 0.1) rows.left += n; if (it.yBand === 'right' && it.yRef.a.x >= dp.w - 0.1) rows.right += n; }
  }
  return rows;
}

/** Зони потовщень (смуга під ребром, штрих) і підворотів (позначка стику) на плані деталі. */
export function drawAdditionZones(ctx: Ctx, model: DrawModel, host: DrawPart, T: Tf, sides: Side[], labels = true, rows?: Record<Band, number>, foldLabels = labels) {
  const S = ctx.S;
  const bandOf = (side: Side): Band => (Math.abs(side.n.x) > Math.abs(side.n.y) ? (side.n.x > 0 ? 'right' : 'left') : (side.n.y > 0 ? 'bottom' : 'top'));
  const labelRow = (side: Side) => ((rows?.[bandOf(side)] ?? 1) + 0.9);
  const thick = new Map<string, { at: Pt; targets: Pt[]; vertical: boolean; rule: string }>();
  for (const ad of model.additions.filter((a) => a.productKey === host.productKey)) {
    if (!ad.parentSide || !ad.joint) continue;
    if (ad.parentSide === undefined) continue;
    const side = sides.find((s) => s.name === ad.parentSide); if (!side) continue;
    const from = ad.joint.a.from; const to = ad.joint.a.to;
    const ux = (side.b.x - side.a.x) / side.len; const uy = (side.b.y - side.a.y) / side.len;
    const p0 = { x: side.a.x + ux * from, y: side.a.y + uy * from }; const p1 = { x: side.a.x + ux * to, y: side.a.y + uy * to };
    if (ad.kind === 'thickening') {
      const band = Math.min(ad.w, ad.h); // ширина смуги (40)
      const inward = { x: -side.n.x * band, y: -side.n.y * band };
      const quad = [p0, p1, { x: p1.x + inward.x, y: p1.y + inward.y }, { x: p0.x + inward.x, y: p0.y + inward.y }].map(T);
      ctx.E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'КС-12', points: quad, closed: true, fill: 'hatch-stone', dashed: true, weight: 0.2 });
      if (labels) {
        const midS = T({ x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 });
        const target = T({ x: (p0.x + p1.x) / 2 - side.n.x * band * 0.5, y: (p0.y + p1.y) / 2 - side.n.y * band * 0.5 });
        const vertical = Math.abs(side.n.x) > Math.abs(side.n.y);
        const text = `Потовщення ${fmtMm(band)}`;
        const lr = labelRow(side);
        // біля вертикальної сторони текст усе одно горизонтальний — від ряду за розмірами, назовні (ВН-1)
        const topP = T(p0.y < p1.y ? p0 : p1);
        const at = vertical
          ? (side.n.x > 0
            ? { x: midS.x + side.n.x * ROW * lr, y: midS.y + 1 }
            // ліва зовнішня сторона: ліворуч — поле аркуша, тож текст над верхнім кінцем зони, вправо по деталі
            : { x: topP.x + 1.5, y: topP.y - 2.4 })
          : { x: midS.x - textW(text, TEXT.node.size) / 2, y: midS.y + side.n.y * ROW * lr + (side.n.y > 0 ? 2.5 : 0) };
        // однакові смуги (Г-стільниця: дві по 40) — один підпис із двома виносками; горизонтальна сторона — головна
        const prev = thick.get(text);
        if (prev) { prev.targets.push(target); if (!vertical && prev.vertical) { prev.at = at; prev.vertical = false; } }
        else thick.set(text, { at, targets: [target], vertical, rule: 'ВН-2' });
      }
    } else if (ad.kind === 'fold') {
      const a = T(p0); const b = T(p1);
      ctx.E.push({ kind: 'polyline', layer: 'Цеховской стык', rule: 'КЛ-1', points: [a, b], closed: false });
      if (foldLabels) {
        const text = `Підворот ${fmtMm(Math.min(ad.w, ad.h))}, 45°`;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
        const lr = Math.max(2.2, labelRow(side));
        const topF = a.y < b.y ? a : b;
        const at = vertical
          ? (side.n.x > 0 ? { x: mid.x + side.n.x * ROW * lr, y: mid.y + 1 } : { x: topF.x + 1.5, y: topF.y - 2.4 })
          : { x: mid.x - textW(text, TEXT.node.size) / 2, y: mid.y + side.n.y * ROW * lr + (side.n.y > 0 ? 2.5 : 0) };
        // однакові підвороти (обидві лицьові сторони Г) — один підпис із двома виносками (ВН-3)
        const prev = thick.get(text);
        if (prev) { prev.targets.push(mid); if (!vertical && prev.vertical) { prev.at = at; prev.vertical = false; } }
        else thick.set(text, { at, targets: [mid], vertical, rule: 'ОФ-45' });
      }
    }
    void S;
  }
  for (const [text, l] of thick) ctx.E.push({ kind: 'leader', layer: 'Виноска', rule: l.rule, at: l.at, text, targets: l.targets, underline: true });
}

/* ── збірка ─────────────────────────────────────────────────────── */

export interface PlacedPart { dp: DrawPart; pts: Pt[]; sides: Side[]; holesT: Tf; x: number; y: number; w: number; h: number; rot: number; /** стільниця, до якої прикладене доповнення */ host?: PlacedPart }

/** Розкласти тіло виробу в площині: стільниця, доповнення розгорнуті біля своїх сторін. */
export function layoutBody(model: DrawModel, gapMm = 90): { placed: PlacedPart[]; box: { w: number; h: number } } {
  const placed: PlacedPart[] = [];
  const main = model.main[0];
  if (!main) return { placed, box: { w: 1, h: 1 } };
  let cursorX = 0;
  const seamGap = Math.max(20, gapMm * 0.35);
  for (const m of model.main) {
    const prev = placed[placed.length - 1];
    // частини однієї деталі (рушій розпиляв П/Г під лист): кладемо впритул по шву, а не в ряд через зазор
    const mySeam = m.sides.find((sd) => sd.seam);
    const prevSeam = prev && prev.dp.detail && prev.dp.detail === m.detail ? prev.sides.find((sd) => sd.seam && Math.abs(sd.len - (mySeam?.len ?? -1)) < 1) : undefined;
    if (prev && mySeam && prevSeam) {
      // шов сусіда і мій мають збігтися: зсув = (середина шва сусіда + нормаль·зазор) − середина мого шва
      const dx = prevSeam.mid.x + prevSeam.n.x * seamGap - mySeam.mid.x; const dy = prevSeam.mid.y + prevSeam.n.y * seamGap - mySeam.mid.y;
      const pts = translate(m.pts, dx, dy);
      placed.push({ dp: m, pts, sides: sidesOf(pts, shiftSegs(m, dx, dy)), holesT: (p) => ({ x: p.x + dx, y: p.y + dy }), x: dx, y: dy, w: m.w, h: m.h, rot: 0 });
      cursorX = Math.max(cursorX, dx + m.w) + gapMm;
      continue;
    }
    const cx = cursorX; // не замикатись на змінну, що росте далі в циклі
    placed.push({ dp: m, pts: translate(m.pts, cx, 0), sides: sidesOf(translate(m.pts, cx, 0), shiftSegs(m, cx, 0)), holesT: (p) => ({ x: p.x + cx, y: p.y }), x: cx, y: 0, w: m.w, h: m.h, rot: 0 });
    cursorX += m.w + gapMm;
  }
  const perSide = new Map<string, number>();
  for (const ad of model.additions) {
    // своя стільниця, і саме та частина, у якої є ця сторона (після розпилу літери розходяться по частинах)
    const host = placed.find((p) => p.dp.kind === 'main' && p.dp.productKey === ad.productKey && p.sides.some((sd) => sd.name === ad.parentSide))
      ?? placed.find((p) => p.dp.kind === 'main' && p.dp.productKey === ad.productKey) ?? placed[0];
    // потовщення й підвороти на плані — лінія стику + підпис на своїй стороні (ОФ-45, КС-12); окремо вони на аркуші смуг.
    // Дві смуги у внутрішньому куті Г інакше перетинались би.
    if (ad.kind === 'thickening' || ad.kind === 'fold' || ad.kind === 'sink' || !ad.parentSide) continue;
    const side = host.sides.find((s) => s.name === ad.parentSide); if (!side) continue;
    // поворот: сторона C доповнення (нормаль (0,1)) має дивитись на батька, тобто в −n батька
    const target = { x: -side.n.x, y: -side.n.y };
    const rot = Math.round((Math.atan2(target.y, target.x) - Math.atan2(1, 0)) * (180 / Math.PI) / 90) * 90;
    const rad = (rot * Math.PI) / 180; const c = Math.cos(rad); const s = Math.sin(rad);
    const rp = ad.pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
    const rb = bbox(rp);
    const local = rp.map((p) => ({ x: p.x - rb.minX, y: p.y - rb.minY }));
    // положення: уздовж сторони — від from стику; назовні — зазор
    const sideKey = `${host.dp.productKey}|${side.name}`;
    const k = perSide.get(sideKey) ?? 0; perSide.set(sideKey, k + 1);
    const from = ad.joint?.a.from ?? 0; const to = ad.joint?.a.to ?? side.len;
    const ux = (side.b.x - side.a.x) / side.len; const uy = (side.b.y - side.a.y) / side.len;
    const pMid = { x: side.a.x + ux * ((from + to) / 2), y: side.a.y + uy * ((from + to) / 2) };
    const along = Math.abs(ux) > Math.abs(uy) ? rb.w : rb.h; const across = Math.abs(ux) > Math.abs(uy) ? rb.h : rb.w;
    void along;
    const gap = gapMm + k * (across + gapMm);
    const centre = { x: pMid.x + side.n.x * (gap + across / 2), y: pMid.y + side.n.y * (gap + across / 2) };
    const x = centre.x - rb.w / 2; const y = centre.y - rb.h / 2;
    const pts = translate(local, x, y);
    const tf: Tf = (p) => { const q = { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; return { x: q.x - rb.minX + x, y: q.y - rb.minY + y }; };
    placed.push({ dp: ad, pts, sides: sidesOf(pts, shiftSegsRot(ad, tf)), holesT: tf, x, y, w: rb.w, h: rb.h, rot, host });
  }
  // нормалізуємо в (0,0)
  const all = bbox(placed.flatMap((p) => p.pts));
  for (const p of placed) {
    p.pts = translate(p.pts, -all.minX, -all.minY);
    p.sides = sidesOf(p.pts, Object.fromEntries(p.sides.map((s) => [s.name, { start: { x: s.a.x - all.minX, y: s.a.y - all.minY }, end: { x: s.b.x - all.minX, y: s.b.y - all.minY } }])));
    const prev = p.holesT; p.holesT = (q) => { const r = prev(q); return { x: r.x - all.minX, y: r.y - all.minY }; };
    p.x -= all.minX; p.y -= all.minY;
  }
  return { placed, box: { w: all.w, h: all.h } };
}

function shiftSegs(dp: DrawPart, dx: number, dy: number) {
  return Object.fromEntries(dp.sides.map((s) => [s.name, { start: { x: s.a.x + dx, y: s.a.y + dy }, end: { x: s.b.x + dx, y: s.b.y + dy } }]));
}
function shiftSegsRot(dp: DrawPart, tf: Tf) {
  return Object.fromEntries(dp.sides.map((s) => [s.name, { start: tf(s.a), end: tf(s.b) }]));
}

export function stampFields(model: DrawModel, input: SetInput, den: number, typeLabel: string): StampField[] {
  const project = model.project;
  const slab = project.slabs?.[0];
  const decor = slab?.decor || project.slabTypes?.[0]?.name || '—';
  const ownSink = Boolean(model.sinkDetail);
  const areaM2 = Math.round(model.body.reduce((a, p) => a + (p.part.area ?? 0), 0) * 100) / 100;
  const extra = input.stampExtra ?? {};
  const qc = project.quoteCalc as { address?: string; contactPhone?: string } | undefined;
  const fields: StampField[] = [
    { key: 'Тип виробу', value: typeLabel },
    { key: 'Номер', value: project.orderNumber || '—' },
    { key: 'Замовник', value: project.customer || '—' },
    { key: 'Контакт', value: project.customerContactPhone || qc?.contactPhone || '' },
    { key: 'Адреса/Філія ВіЯр/Доставка', value: extra['Адреса/Філія ВіЯр/Доставка'] ?? qc?.address ?? '' },
  ];
  if (extra['Поверх']) fields.push({ key: 'Поверх', value: extra['Поверх'] });
  if (extra['Ліфт']) fields.push({ key: 'Ліфт', value: extra['Ліфт'] });
  fields.push(
    { key: 'Декор', value: decor },
    { key: 'Матеріал / товщина', value: `${model.material ?? '—'} / ${fmtMm(model.thickness)} мм` },
    { key: 'Підбір текстури', value: project.textureSelectionEnabled ? 'Так' : 'Ні' },
    { key: 'Мийка', value: ownSink ? 'ViyarStone (камінь)' : model.main.some((m) => m.holes.some((h) => h.isSink)) ? 'Замовника (не передають)' : 'Немає' },
    ...(model.additions.some((a) => a.kind === 'wall_panel') ? [{ key: 'Декор стін.панель / плінтус', value: extra['Декор стін.панель / плінтус'] ?? decor }] : []),
    { key: 'Площа м²', value: String(areaM2).replace('.', ',') },
    { key: 'Масштаб', value: `1:${den}` },
    { key: 'Автор', value: extra['Автор'] ?? '' },
    { key: 'Перевірив', value: extra['Перевірив'] ?? '' },
    { key: 'Менеджер', value: extra['Менеджер'] ?? '' },
    { key: 'Дата створення креслення', value: new Date().toLocaleDateString('uk-UA') },
  );
  return fields;
}

/** Висота смуги знизу під штамп і розрізи (спільна розкладка з рендером). */
export function bottomBandHeight(sections: SectionView[], stampRows: number): number {
  return layoutSections(sections, SHEET.frame, stampRows * SHEET.stamp.rowH, false).bandH + 4;
}

export function makeSheet(model: DrawModel, input: SetInput, opts: { title?: string; entities: Entity[]; sections: SectionView[]; den: number; sheetNo: number; sheetCount: number; typeLabel: string; gaps?: string[] }): DrawingSheet {
  return {
    size: { w: SHEET.w, h: SHEET.h }, frame: { ...SHEET.frame }, header: SHEET.header, title: opts.title,
    entities: opts.entities, sections: opts.sections, stamp: { fields: stampFields(model, input, opts.den, opts.typeLabel) },
    sheetNo: opts.sheetNo, sheetCount: opts.sheetCount, scaleDen: opts.den, gaps: [...model.gaps, ...(opts.gaps ?? [])],
  };
}

/** Аркуш 1 — збірка. */
export function composeAssembly(model: DrawModel, input: SetInput, sheetNo: number, sheetCount: number): DrawingSheet {
  const E: Entity[] = []; const gaps: string[] = [];
  const sections = assemblySections(model);
  const stampRows = stampFields(model, input, 10, '').length;
  const band = bottomBandHeight(sections, stampRows);
  const fr = SHEET.frame;
  const margin = { l: 8 + 2.4 * ROW, r: 8 + 2 * ROW, t: 5 + 1.3 * ROW, b: 1.5 * ROW };
  // два поля для плану: на всю ширину над штампом і розрізами, або праворуч від штампа над самими розрізами
  // (високий вузький план — стільниця з панеллю зверху і опорою знизу — виграє від другого)
  const sectionsBand = layoutSections(sections, fr, 0, false).bandH + 2;
  const areaFull = { x: fr.x + margin.l, y: fr.y + margin.t, w: fr.w - margin.l - margin.r, h: fr.h - band - margin.t - margin.b };
  const rightX = fr.x + SHEET.stamp.w + 6 + margin.l;
  const areaRight = { x: rightX, y: fr.y + margin.t, w: fr.x + fr.w - margin.r - rightX, h: fr.h - sectionsBand - margin.t - margin.b };
  // зазор між деталями — ~20 мм аркуша, щоб між ними читався підпис стику: два проходи
  let { placed, box } = layoutBody(model, 300);
  const pick = (a: typeof areaFull) => { const d0 = fitScaleDen(box.w, box.h, a.w, a.h); const l = layoutBody(model, 17 * d0); return { area: a, den: fitScaleDen(l.box.w, l.box.h, a.w, a.h), ...l }; };
  const cands = [pick(areaFull), pick(areaRight)];
  const best = cands[1].den < cands[0].den ? cands[1] : cands[0];
  const area = best.area; let den = best.den;
  ({ placed, box } = best);
  const S = 1 / den;
  const ox = area.x + (area.w - box.w * S) / 2; const oy = area.y + (area.h - box.h * S) / 2;
  const T: Tf = (p) => ({ x: ox + p.x * S, y: oy + p.y * S });
  const ctx: Ctx = { E, S, profileColor: model.profileColor, gaps };

  for (const pl of placed) {
    const dp = pl.dp;
    drawContour(ctx, dp, T, pl.pts, pl.sides);
    const TH: Tf = (p) => T(pl.holesT(p));
    drawEdges(ctx, dp, T, pl.sides, 3.2, true, holeBoxes(dp, TH));
    // назва в тілі (ВН-6) — або у вільному куті, коли центр зайнятий вирізом
    const b = bbox(pl.pts); const c = T({ x: b.minX + b.w / 2, y: b.minY + b.h / 2 });
    const nameAt = TH(labelPoint(dp.pts, dp.sides, dp.holes, 60, textW(dp.name, TEXT.name.size) / S));
    const busy = false;
    const vertical = pl.w < pl.h * 0.35;
    const thin = Math.min(pl.w, pl.h) * S < 9;
    if (thin) {
      // вузька смуга (підворот): ім'я поруч, уздовж довгої сторони, з того боку, де немає стільниці
      const host = pl.host ?? placed[0]; const side = host.sides.find((sd) => sd.name === dp.parentSide);
      const nx = side?.n.x ?? 0; const ny = side?.n.y ?? 1;
      const at = { x: c.x + nx * (pl.w * S / 2 + 3.5) + (vertical ? 1.2 : 0), y: c.y + ny * (pl.h * S / 2 + 3.5) + (vertical ? 0 : 1) };
      E.push({ kind: 'text', layer: 'Стільниця', rule: 'ВН-6', at, text: dp.name, style: 'name', anchor: 'middle', rotate: vertical ? -90 : 0 });
    } else {
      E.push({ kind: 'text', layer: 'Стільниця', rule: 'ВН-6', at: { x: nameAt.x, y: nameAt.y + 1 }, text: dp.name, style: 'name', anchor: busy ? 'start' : 'middle', rotate: vertical ? -90 : 0 });
    }
    // отвори — у локальних координатах деталі через холдер-трансформацію (сторони — теж локальні)
    // ЗБІРКА — про те, що з чим і як; розміри й підписи вирізів — на аркушах деталей
    drawHoles(ctx, dp, TH, dp.sides, { dims: false, ownSink: Boolean(model.sinkDetail), sinkText: 'short', labels: false, insideLabels: true });
    drawCorners(ctx, dp, T, pl.sides);
    if (dp.kind === 'main') {
      drawSideDims(ctx, T, pl.sides, 1, false); drawAdditionZones(ctx, model, dp, T, pl.sides, true, undefined, true);
      // стик стільниць (розпил): підпис у зазорі між частинами, один на пару
      for (const sd of pl.sides) {
        if (!sd.seam) continue;
        const partner = placed.find((q) => q !== pl && q.dp.kind === 'main' && q.dp.detail === dp.detail && q.sides.some((x) => x.seam && Math.abs(x.len - sd.len) < 1));
        if (!partner || placed.indexOf(partner) < placed.indexOf(pl)) continue;
        const ps = partner.sides.find((x) => x.seam && Math.abs(x.len - sd.len) < 1)!;
        const c = T({ x: (sd.mid.x + ps.mid.x) / 2, y: (sd.mid.y + ps.mid.y) / 2 });
        const vert = Math.abs(sd.n.x) > 0.5;
        E.push({ kind: 'text', layer: 'Монтажный стык', rule: 'КЛ-1', at: { x: c.x + (vert ? 1.1 : 0), y: c.y + (vert ? 0 : 1.1) }, text: 'Стик стільниць', style: 'node', anchor: 'middle', rotate: vert ? -90 : 0, underline: true, color: '#ff00ff' });
      }
    }
    else {
      // габарит доповнення — два розміри, з боків, ДАЛЬНІХ від стільниці (у зазорі — підпис стику)
      const bb = bbox(pl.pts);
      const host = pl.host ?? placed[0]; const side = host.sides.find((s) => s.name === dp.parentSide);
      const nx = side?.n.x ?? 0; const ny = side?.n.y ?? 1;
      const wOff = ny > 0.5 ? ROW : -ROW; // доповнення знизу → розмір ширини знизу
      const hOff = nx < -0.5 ? -ROW : ROW; // доповнення ліворуч → розмір висоти ліворуч
      if (!thin || bb.w < bb.h) E.push(dim(T({ x: bb.minX, y: wOff > 0 ? bb.maxY : bb.minY }), T({ x: bb.maxX, y: wOff > 0 ? bb.maxY : bb.minY }), wOff, fmtMm(bb.w), false, 'ОФ-ДР'));
      if (!thin || bb.h < bb.w) E.push(dim(T({ x: hOff > 0 ? bb.maxX : bb.minX, y: bb.minY }), T({ x: hOff > 0 ? bb.maxX : bb.minX, y: bb.maxY }), hOff, fmtMm(bb.h), false, 'ОФ-ДР'));
      // підпис стику між доповненням і стільницею (ОФ-45 / КС-15) — між ними
      if (side) {
        const from = dp.joint?.a.from ?? 0; const to = dp.joint?.a.to ?? side.len;
        const ux = (side.b.x - side.a.x) / side.len; const uy = (side.b.y - side.a.y) / side.len;
        const q = from + (to - from) * 0.22;
        const onSide = { x: side.a.x + ux * q, y: side.a.y + uy * q };
        const gapMid = { x: onSide.x + side.n.x * ((pl.x + (side.n.x > 0 ? 0 : bb.w)) - onSide.x) * 0 , y: 0 };
        void gapMid;
        const towards = { x: side.n.x, y: side.n.y };
        // середина зазору між стороною і доповненням
        const dist = Math.abs(towards.x) > 0.5 ? Math.abs((towards.x > 0 ? bb.minX : bb.maxX) - onSide.x) : Math.abs((towards.y > 0 ? bb.minY : bb.maxY) - onSide.y);
        const off = Math.min(dist * 0.72, (ROW * 1.9) / S);
        const mid = T({ x: onSide.x + towards.x * off, y: onSide.y + towards.y * off });
        const miter = miterJointFor(dp.kind === 'other' ? undefined : dp.kind, model.material) || dp.joint?.type === 'miter45';
        const text = dp.kind === 'fold' ? `Підворот ${fmtMm(Math.min(bb.w, bb.h))}, 45°` : miter ? "З'єднання під 45°" : dp.kind === 'wall_panel' ? 'Стик монтажний' : dp.kind === 'skirting' ? 'Бортик, клей' : 'Стик стільниць';
        const vert = Math.abs(side.n.y) > Math.abs(side.n.x);
        const pA = T({ x: side.a.x + ux * from, y: side.a.y + uy * from }); const pB = T({ x: side.a.x + ux * to, y: side.a.y + uy * to });
        if (vert) {
          E.push({ kind: 'text', layer: miter ? 'Стільниця' : 'Монтажный стык', rule: miter ? 'ОФ-45' : 'КС-15', at: { x: mid.x, y: mid.y + 1 }, text, style: 'node', anchor: 'middle', underline: !miter });
        } else {
          // вертикальний стик: підпис горизонтально над верхнім кінцем стику, у зазорі (як у 81-1430086), а не боком уздовж
          const top = pA.y < pB.y ? pA : pB;
          E.push({ kind: 'text', layer: miter ? 'Стільниця' : 'Монтажный стык', rule: miter ? 'ОФ-45' : 'КС-15', at: { x: top.x + side.n.x * 1.2, y: top.y - 2.4 }, text, style: 'node', anchor: side.n.x > 0 ? 'start' : 'end', underline: !miter });
        }
        // позначка розрізу «1» з обох кінців стику опори (ВН-9) — вузол 1-1 унизу аркуша; за кінцями стику, поза деталями
        if (dp.kind === 'leg') {
          const tx = ux; const ty = uy; // уздовж стику
          for (const [pt, dir, nSign] of [[pA, -1, -1], [pB, 1, 1]] as Array<[Pt, number, number]>) {
            const o = { x: pt.x + side.n.x * 2.2 * nSign + tx * dir * 2.5, y: pt.y + side.n.y * 2.2 * nSign + ty * dir * 2.5 };
            E.push({ kind: 'polyline', layer: 'Стільниця', rule: 'ВН-9', points: [o, { x: o.x + tx * dir * 3.5, y: o.y + ty * dir * 3.5 }], closed: false, weight: 0.7 });
            E.push({ kind: 'text', layer: 'Стільниця', rule: 'ВН-9', at: { x: o.x + tx * dir * 5 + side.n.x * nSign * 0.4, y: o.y + ty * dir * 5 + side.n.y * nSign * 0.4 + 1.5 }, text: '1', style: 'section', anchor: 'middle', bold: true });
          }
        }
      }
    }
  }
  // вимоги (ОФ-ЧВ)
  (input.instructions ?? []).forEach((t, i) => E.push({ kind: 'text', layer: 'Вимога', rule: 'ОФ-ЧВ', at: { x: fr.x + fr.w - 6, y: fr.y + 12 + i * 4.5 }, text: t, style: 'note', anchor: 'end', color: '#ff0000' }));
  if (model.sinkDetail === undefined && model.main.some((m) => m.holes.some((h) => h.isSink))) gaps.push('Мийка замовника: шаблон і спосіб монтажу — з бланку попередніх робіт');
  gaps.push('Нависання над фасадами (КС-9) і «Корпус» замовника (ВН-10) — у моделі немає, на аркуш не пишуться');
  return makeSheet(model, input, { entities: E, sections, den, sheetNo, sheetCount, typeLabel: 'Креслення / Монтаж', gaps });
}

function assemblySections(model: DrawModel): SectionView[] {
  const out: SectionView[] = [];
  for (const [id, color] of model.profileColor) out.push(profileSection(id, edgeIndex(id, model.profileColor), color, model.thickness));
  if (model.main.some((m) => m.holes.some((h) => h.isSink))) out.push(sinkCutSection(model.thickness, Boolean(model.sinkDetail)));
  const leg = model.additions.find((a) => a.kind === 'leg');
  if (leg) out.push(legNode(model.thickness, model.main[0]?.name ?? 'Стільниця', leg.name));
  return out;
}

/* ── аркуш деталі ───────────────────────────────────────────────── */

export function composeDetailSheet(model: DrawModel, input: SetInput, dp: DrawPart, sheetNo: number, sheetCount: number): DrawingSheet {
  const E: Entity[] = []; const gaps: string[] = [];
  const sections: SectionView[] = [];
  for (const id of new Set(dp.profiles.values())) sections.push(profileSection(id, edgeIndex(id, model.profileColor), model.profileColor.get(id) ?? '#000', dp.thickness));
  if (dp.kind === 'main') {
    if (dp.holes.some((h) => h.isSink)) sections.push(sinkCutSection(model.thickness, Boolean(model.sinkDetail)));
    const own = model.additions.filter((a) => a.productKey === dp.productKey);
    const th = own.find((a) => a.kind === 'thickening');
    if (th) sections.push(thickeningSection(model.thickness, Math.min(th.w, th.h), miterJointFor('thickening', model.material)));
    const fold = own.find((a) => a.kind === 'fold');
    if (fold) sections.push(foldSection(model.thickness, Math.min(fold.w, fold.h)));
  }
  if (dp.kind === 'leg') sections.push(legNode(model.thickness, model.main[0]?.name ?? 'Стільниця', dp.name));
  if (dp.kind === 'wall_panel') sections.push(wallPanelSection(model.thickness));
  const stampRows = stampFields(model, input, 10, '').length;
  const band = bottomBandHeight(sections, stampRows);
  const fr = SHEET.frame;
  const plan = planHoleDims(dp, dp.sides);
  const R = marginRows(plan, dp);
  const margin = { l: 12 + ROW * (R.left + 0.6), r: 12 + ROW * (R.right + 0.6), t: 12 + ROW * (R.top + 0.8), b: ROW * (R.bottom + 0.6) };
  // два поля: на всю ширину над штампом і розрізами, або праворуч від штампа над самими розрізами
  const sectionsBand = layoutSections(sections, fr, 0, false).bandH + 2;
  const areaFull = { x: fr.x + margin.l, y: fr.y + margin.t, w: fr.w - margin.l - margin.r, h: fr.h - band - margin.t - margin.b };
  const rightX = fr.x + SHEET.stamp.w + 6 + margin.l;
  const areaRight = { x: rightX, y: fr.y + margin.t, w: fr.x + fr.w - margin.r - rightX, h: fr.h - sectionsBand - margin.t - margin.b };
  const denFull = fitScaleDen(dp.w, dp.h, areaFull.w, areaFull.h); const denRight = fitScaleDen(dp.w, dp.h, areaRight.w, areaRight.h);
  const area = denRight < denFull ? areaRight : areaFull;
  const den = Math.min(denFull, denRight);
  const S = 1 / den;
  const ox = area.x + (area.w - dp.w * S) / 2; const oy = area.y + (area.h - dp.h * S) / 2;
  const T: Tf = (p) => ({ x: ox + p.x * S, y: oy + p.y * S });
  const ctx: Ctx = { E, S, profileColor: model.profileColor, gaps };

  drawContour(ctx, dp, T, dp.pts, dp.sides);
  drawEdges(ctx, dp, T, dp.sides, 4, true, holeBoxes(dp, T));
  drawSideLetters(ctx, T, dp.sides);
  drawSideDims(ctx, T, dp.sides, 1);
  drawCorners(ctx, dp, T, dp.sides);
  drawHoles(ctx, dp, T, dp.sides, { dims: true, ownSink: Boolean(model.sinkDetail), sinkText: 'full' }, plan);
  if (dp.kind === 'main') drawAdditionZones(ctx, model, dp, T, dp.sides, true, plan.rows);
  // назва в тілі
  const nameAt = T(labelPoint(dp.pts, dp.sides, dp.holes, 60, textW(dp.name, TEXT.name.size) / S));
  E.push({ kind: 'text', layer: 'Стільниця', rule: 'ВН-6', at: { x: nameAt.x, y: nameAt.y + 1 }, text: dp.name, style: 'name', anchor: 'middle', bold: true });
  // кромки — таблиця «Кромка N — профіль — сторони» праворуч угорі, якщо є
  if (dp.profiles.size) {
    const byId = new Map<string, string[]>();
    for (const [side, id] of dp.profiles) byId.set(id, [...(byId.get(id) ?? []), side]);
    let y = fr.y + 12;
    for (const [id, sidesN] of byId) {
      const color = model.profileColor.get(id) ?? '#000';
      E.push({ kind: 'text', layer: 'Кромка', rule: 'КР-1', at: { x: fr.x + fr.w - 6, y }, text: `Кромка ${edgeIndex(id, model.profileColor)} · ${profileLabelOf(id)} · сторони ${sidesN.join(', ')}`, style: 'dim', anchor: 'end', color });
      y += 4;
    }
    const noProfile = dp.sides.filter((s) => !dp.profiles.has(s.name) && s.len > 1).map((s) => s.name);
    if (noProfile.length) { E.push({ kind: 'text', layer: 'Размер', rule: 'КР-2', at: { x: fr.x + fr.w - 6, y }, text: `без обробки: ${noProfile.join(', ')}`, style: 'dim', anchor: 'end', color: '#808080' }); }
  }
  // що це в збірці
  if (dp.kind !== 'main' && dp.parentSide) {
    const host = model.main[0];
    const rel = dp.kind === 'leg' ? `опора під стороною ${dp.parentSide} стільниці, з'єднання під 45°` : dp.kind === 'wall_panel' ? `стінова панель на стороні ${dp.parentSide} стільниці, стик монтажний` : dp.kind === 'fold' ? `підворот сторони ${dp.parentSide}, з'єднання під 45°, текстура наскрізна` : dp.kind === 'thickening' ? `потовщення під стороною ${dp.parentSide}, клеїться знизу` : '';
    if (rel && host) E.push({ kind: 'text', layer: 'Стільниця', rule: 'ВН-6', at: { x: fr.x + 4, y: fr.y + 12 }, text: `${host.name}: ${rel}`, style: 'note' });
  }
  const title = `Деталь ${dp.no} · ${dp.name} · ${fmtMm(dp.w)} × ${fmtMm(dp.h)} × ${fmtMm(dp.thickness)} · ${model.material ?? ''}`;
  return makeSheet(model, input, { title, entities: E, sections, den, sheetNo, sheetCount, typeLabel: 'Креслення деталі', gaps });
}

function profileLabelOf(id: string): string {
  return profileSection(id, 1, '#000', 20).entities.find((e) => e.kind === 'text')?.text ?? id;
}

/** Смуги (потовщення, підвороти) — усі на одному аркуші, одна під одною. */
export function composeStripsSheet(model: DrawModel, input: SetInput, strips: DrawPart[], sheetNo: number, sheetCount: number): DrawingSheet {
  const E: Entity[] = []; const gaps: string[] = [];
  const sections: SectionView[] = [];
  const th = strips.find((a) => a.kind === 'thickening');
  if (th) sections.push(thickeningSection(model.thickness, Math.min(th.w, th.h), miterJointFor('thickening', model.material)));
  const fold = strips.find((a) => a.kind === 'fold');
  if (fold) sections.push(foldSection(model.thickness, Math.min(fold.w, fold.h)));
  for (const id of new Set(strips.flatMap((st) => [...st.profiles.values()]))) sections.push(profileSection(id, edgeIndex(id, model.profileColor), model.profileColor.get(id) ?? '#000', model.thickness));
  const stampRows = stampFields(model, input, 10, '').length;
  const band = bottomBandHeight(sections, stampRows);
  const fr = SHEET.frame;
  const area = { x: fr.x + 70, y: fr.y + 14 + ROW * 1.5, w: fr.w - 70 - 12 - ROW * 2, h: fr.h - band - 14 - ROW * 1.5 - ROW };
  // усі смуги горизонтально (довгою стороною по X), одна під одною
  const rows = strips.map((st) => ({ st, w: Math.max(st.w, st.h), h: Math.min(st.w, st.h), rotated: st.h > st.w }));
  const gapMm = 0; // зазор рахуємо в мм аркуша окремо
  const maxW = Math.max(...rows.map((r) => r.w));
  const rowGap = ROW * 3.2; // місце під розмір + підпис
  let den = fitScaleDen(maxW, rows.reduce((a, r) => a + r.h, 0) + gapMm, area.w, area.h - rows.length * rowGap);
  const S = 1 / den;
  const ctx: Ctx = { E, S, profileColor: model.profileColor, gaps };
  let y = area.y;
  for (const r of rows) {
    const st = r.st;
    const pts = r.rotated ? st.pts.map((p) => ({ x: p.y, y: st.w - p.x })) : st.pts;
    const b = bbox(pts);
    const x0 = area.x; const y0 = y;
    const T: Tf = (p) => ({ x: x0 + (p.x - b.minX) * S, y: y0 + (p.y - b.minY) * S });
    const sides = sidesOf(pts.map((p) => ({ x: p.x - b.minX, y: p.y - b.minY })));
    const TT: Tf = (p) => ({ x: x0 + p.x * S, y: y0 + p.y * S });
    drawContour(ctx, st, TT, pts.map((p) => ({ x: p.x - b.minX, y: p.y - b.minY })), sides);
    void T;
    E.push(dim({ x: x0, y: y0 }, { x: x0 + r.w * S, y: y0 }, -ROW, fmtMm(r.w), false, 'ОФ-ДР'));
    E.push(dim({ x: x0 + r.w * S, y: y0 }, { x: x0 + r.w * S, y: y0 + r.h * S }, ROW, fmtMm(r.h), false, 'ОФ-ДР'));
    const host = model.main[0];
    const what = st.kind === 'thickening'
      ? `клеїться знизу під сторону ${st.parentSide} (${host?.name ?? 'стільниця'}), ${miterJointFor('thickening', model.material) ? 'стик 45°' : 'пряма підклейка'}`
      : st.kind === 'fold' ? `підворот сторони ${st.parentSide} (${host?.name ?? 'стільниця'}), з'єднання під 45°, текстура наскрізна` : '';
    E.push({ kind: 'text', layer: 'Стільниця', rule: 'ВН-6', at: { x: x0 - 4, y: y0 + (r.h * S) / 2 + 1 }, text: `Деталь ${st.no} · ${st.name}`, style: 'name', anchor: 'end', bold: true });
    E.push({ kind: 'text', layer: 'Размер робочий', rule: 'КС-12', at: { x: x0, y: y0 + r.h * S + ROW * 1.9 }, text: `${fmtMm(r.w)} × ${fmtMm(r.h)} × ${fmtMm(st.thickness)} — ${what}`, style: 'note' });
    y += r.h * S + rowGap + ROW;
  }
  const nos = strips.map((st) => st.no);
  const title = `Деталі ${Math.min(...nos)}–${Math.max(...nos)} · смуги: потовщення й підвороти · ${model.material ?? ''}`;
  return makeSheet(model, input, { title, entities: E, sections, den, sheetNo, sheetCount, typeLabel: 'Креслення деталей', gaps });
}

/* ── набір ──────────────────────────────────────────────────────── */

export interface DrawingSetResult { sheets: DrawingSheet[]; model: DrawModel }

type SheetFn = (model: DrawModel, input: SetInput, no: number, count: number) => DrawingSheet | null;
export function composeDrawingSet(input: SetInput, extra?: { sink?: SheetFn; joints?: SheetFn; explodedShop?: SheetFn; explodedSink?: SheetFn; explodedSite?: SheetFn; spec?: SheetFn }): DrawingSetResult {
  const model = buildDrawModel(input);
  const plan: Array<(no: number, count: number) => DrawingSheet | null> = [];
  plan.push((no, count) => composeAssembly(model, input, no, count));
  const strips = model.body.filter((dp) => dp.kind === 'thickening' || dp.kind === 'fold');
  for (const dp of model.body.filter((d) => !strips.includes(d))) plan.push((no, count) => composeDetailSheet(model, input, dp, no, count));
  if (strips.length) plan.push((no, count) => composeStripsSheet(model, input, strips, no, count));
  if (extra?.sink && (model.sinkDetail || model.main.some((m) => m.holes.some((h) => h.isSink)))) plan.push((no, count) => extra.sink!(model, input, no, count));
  if (extra?.joints && model.additions.length) plan.push((no, count) => extra.joints!(model, input, no, count));
  if (extra?.explodedShop) plan.push((no, count) => extra.explodedShop!(model, input, no, count));
  if (extra?.explodedSink && model.sinkDetail) plan.push((no, count) => extra.explodedSink!(model, input, no, count));
  if (extra?.explodedSite) plan.push((no, count) => extra.explodedSite!(model, input, no, count));
  if (extra?.spec) plan.push((no, count) => extra.spec!(model, input, no, count));
  const count = plan.length;
  const sheets = plan.map((fn, i) => fn(i + 1, count)).filter((s): s is DrawingSheet => Boolean(s));
  sheets.forEach((s, i) => { s.sheetNo = i + 1; s.sheetCount = sheets.length; });
  return { sheets, model };
}

export { SHEET_A4P };
