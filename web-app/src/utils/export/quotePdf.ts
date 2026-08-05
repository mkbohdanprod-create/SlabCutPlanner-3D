import { jsPDF } from 'jspdf';
import {
  QUOTE_METHODS,
  quoteProductType,
  type QuoteCalcDoc,
  type QuoteItem,
} from '../../domain/quoteCalc';
import {
  itemAreaM2,
  itemLengthM,
  quoteUnitLabel,
  QUOTE_GROUP_LABELS,
  type QuoteCalcLine,
  type QuoteCalcResult,
} from '../../engines/quoteCalc';
import type { Detail, DetailPart, Point, Project } from '../../domain/types';
import type { PageSize } from './pdfTypes';
import { defaultPdfExportOptions } from './pdfTypes';
import { escapeXml, pageSvg, safeFilePart, svgStringToPngData } from './pdfUtils';
import { renderDetailsPages } from './pdfPages';
import { pointDistance, sideSegmentOfPart } from '../../engines/geometryUtils';

/**
 * PDF прорахунку для клієнта.
 *
 * Той самий конвеєр, що й у експорту карт крою: SVG-сторінка → PNG →
 * jsPDF. Кирилицю растеризує браузер, тому вбудовувати шрифти в jsPDF
 * не треба. Сторінки збираються чистими рядками — їх покривають тести,
 * а DOM потрібен лише останньому крокові (растеризації).
 *
 * Це КЛІЄНТСЬКИЙ документ: без внутрішніх попереджень, без кодів
 * номенклатур — лише те, що погоджують із замовником.
 */

const A4: PageSize = { widthMm: 210, heightMm: 297, widthPx: 1200, heightPx: 1697 };

const MARGIN = 72;
const CONTENT_W = A4.widthPx - MARGIN * 2;
const FOOTER_Y = A4.heightPx - 64;
const PAGE_LIMIT = FOOTER_Y - 40;

const INK = '#1e293b';
const MUTED = '#64748b';
const BRAND_DARK = '#303f50';
const ACCENT = '#0084ff';
const LINE = '#d8e3eb';
const ROW_ALT = '#f4f8fb';

const money = (value: number) =>
  value.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (value: number) => String(Number(value.toFixed(3)));

const t = (
  x: number, y: number, content: string | number,
  size = 22, color = INK, weight = 400,
  anchor: 'start' | 'middle' | 'end' = 'start',
) => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}">${escapeXml(content)}</text>`;

/** Фірмова шапка: темна плашка з логотипом, як у застосунку */
function headerBand(project: Project) {
  const now = new Date().toLocaleDateString('uk-UA');
  return `
    <rect x="0" y="0" width="${A4.widthPx}" height="150" fill="${BRAND_DARK}"/>
    <text x="${MARGIN}" y="88" fill="#ffffff">
      <tspan font-size="44" font-weight="500" letter-spacing="-1">viyar</tspan>
      <tspan font-size="44" font-weight="300" dx="10">stone</tspan>
      <tspan font-size="24" font-weight="700" letter-spacing="3" dx="8" dy="-14">3D</tspan>
    </text>
    ${t(A4.widthPx - MARGIN, 66, 'ПРОРАХУНОК ЗАМОВЛЕННЯ', 30, '#ffffff', 700, 'end')}
    ${t(A4.widthPx - MARGIN, 102, `№ ${project.orderNumber || '—'} · ${now}`, 22, '#b8c6d4', 400, 'end')}
    <rect x="0" y="150" width="${A4.widthPx}" height="6" fill="${ACCENT}"/>`;
}

function continuationHeader(project: Project) {
  return `
    <rect x="0" y="0" width="${A4.widthPx}" height="64" fill="${BRAND_DARK}"/>
    <text x="${MARGIN}" y="42" fill="#ffffff">
      <tspan font-size="26" font-weight="500">viyar</tspan>
      <tspan font-size="26" font-weight="300" dx="6">stone</tspan>
      <tspan font-size="15" font-weight="700" letter-spacing="2" dx="5" dy="-8">3D</tspan>
    </text>
    ${t(A4.widthPx - MARGIN, 42, `Прорахунок № ${project.orderNumber || '—'} · продовження`, 20, '#b8c6d4', 400, 'end')}
    <rect x="0" y="64" width="${A4.widthPx}" height="4" fill="${ACCENT}"/>`;
}

function footer(pageIndex: number, total: number) {
  return `
    <line x1="${MARGIN}" y1="${FOOTER_Y}" x2="${A4.widthPx - MARGIN}" y2="${FOOTER_Y}" stroke="${LINE}" stroke-width="1"/>
    ${t(MARGIN, FOOTER_Y + 30, 'Розрахунок є попереднім; остаточна вартість фіксується після погодження креслень.', 16, MUTED)}
    ${t(A4.widthPx - MARGIN, FOOTER_Y + 30, `Сторінка ${pageIndex} з ${total}`, 16, MUTED, 400, 'end')}`;
}

/** Пара «підпис — значення» в інфоблоці */
function infoRow(x: number, y: number, label: string, value: string) {
  return t(x, y, label.toUpperCase(), 15, MUTED, 700) + t(x, y + 26, value || '—', 21, INK, 500);
}

/** Тіла сторінок розрахунку (КП) — без футерів, нумерація на збиранні */
export function renderQuoteCalcBodies(
  project: Project,
  doc: QuoteCalcDoc,
  result: QuoteCalcResult,
): string[] {
  const bodies: string[] = [];
  let body = headerBand(project);
  let y = 200;

  const newPage = () => {
    bodies.push(body);
    body = continuationHeader(project);
    y = 110;
  };
  const ensure = (height: number) => { if (y + height > PAGE_LIMIT) newPage(); };

  // ── Інфоблок замовлення ────────────────────────────────────────────
  const methodLabel = QUOTE_METHODS.find((method) => method.id === doc.method)?.label ?? doc.method;
  const material = [doc.materialType, doc.manufacturer].filter(Boolean).join(' · ');
  const contact = [doc.contactName, doc.contactPhone].filter(Boolean).join(', ');
  const zone = doc.deliveryZone > 0 ? ` (зона виїзду ${doc.deliveryZone})` : '';

  const colW = CONTENT_W / 3;
  const rows: Array<[string, string]> = [
    ['Спосіб виконання', methodLabel],
    ['Контрагент', doc.contragent],
    ['Контактна особа', contact],
    ['Матеріал', material],
    ['Декор', doc.decorCode],
    ['Філія', doc.branch],
  ];
  if (doc.materialType === 'Акриловий камінь' && doc.surfaceType) rows.push(['Тип поверхні', doc.surfaceType]);
  if (doc.method === 'measure_install') rows.push(['Адреса', `${doc.address || '—'}${zone}`]);

  rows.forEach(([label, value], index) => {
    const col = index % 3;
    if (col === 0 && index > 0) y += 72;
    body += infoRow(MARGIN + col * colW, y, label, value);
  });
  y += 72;

  if (doc.comment.trim()) {
    body += infoRow(MARGIN, y, 'Коментар', doc.comment.trim().slice(0, 120));
    y += 72;
  }

  body += `<line x1="${MARGIN}" y1="${y - 20}" x2="${A4.widthPx - MARGIN}" y2="${y - 20}" stroke="${LINE}" stroke-width="1"/>`;

  // ── Специфікація виробів ───────────────────────────────────────────
  if (doc.items.length) {
    ensure(120);
    body += t(MARGIN, y + 8, 'ВИРОБИ', 22, BRAND_DARK, 700);
    y += 28;

    // Вартість виготовлення КОЖНОГО виробу: його обсяг × ставка його
    // номенклатури з розрахунку (з урахуванням ручних цін). Нога
    // тарифікується ставкою стільниці, в яку влита (Логіка §3).
    const lineById = new Map(result.lines.map((entry) => [entry.id, entry]));
    const itemFabCost = (item: QuoteItem): { cost: number; folded: boolean } => {
      const type = quoteProductType(item.productTypeId);
      if (!type) return { cost: 0, folded: false };
      const folded = Boolean(type.foldInto?.length);
      const targetId = folded
        ? (type.foldInto!.find((candidate) => doc.items.some((other) => other.productTypeId === candidate)) ?? type.foldInto![0])
        : type.id;
      const fabLine = lineById.get(`fab:${targetId}`);
      if (!fabLine) return { cost: 0, folded };
      const qty = type.unit === 'm2' ? itemAreaM2(item)
        : type.unit === 'mp' ? itemLengthM(item)
        : Math.max(1, item.count);
      return { cost: qty * fabLine.unitPrice, folded };
    };

    // № · Виріб · Форма · Товщина · К-сть · Обсяг · Вартість · Примітки
    const cols = [34, 280, 104, 88, 56, 118, 150, CONTENT_W - 34 - 280 - 104 - 88 - 56 - 118 - 150];
    const colX: number[] = [];
    cols.reduce((acc, width) => { colX.push(acc); return acc + width; }, MARGIN);

    const headRow = (yy: number) => `
      <rect x="${MARGIN}" y="${yy}" width="${CONTENT_W}" height="40" fill="${BRAND_DARK}"/>
      ${t(colX[0] + 8, yy + 27, '№', 17, '#fff', 700)}
      ${t(colX[1] + 10, yy + 27, 'Виріб', 17, '#fff', 700)}
      ${t(colX[2] + 10, yy + 27, 'Форма', 17, '#fff', 700)}
      ${t(colX[3] + cols[3] - 8, yy + 27, 'Товщина', 17, '#fff', 700, 'end')}
      ${t(colX[4] + cols[4] - 8, yy + 27, 'К-сть', 17, '#fff', 700, 'end')}
      ${t(colX[5] + cols[5] - 8, yy + 27, 'Обсяг', 17, '#fff', 700, 'end')}
      ${t(colX[6] + cols[6] - 8, yy + 27, 'Вартість, грн', 17, '#fff', 700, 'end')}
      ${t(colX[7] + 12, yy + 27, 'Примітки', 17, '#fff', 700)}`;

    body += headRow(y);
    y += 40;

    doc.items.forEach((item, index) => {
      const type = quoteProductType(item.productTypeId);
      const unit = type?.unit ?? 'pcs';
      const amount = unit === 'm2' ? `${itemAreaM2(item).toFixed(3)} м²`
        : unit === 'mp' ? `${itemLengthM(item).toFixed(2)} м.п.`
        : `${Math.max(1, item.count)} шт`;
      const name = item.sourceLabel || type?.label || item.productTypeId;
      const secondName = item.sourceLabel && type ? type.label : '';
      const { cost, folded } = itemFabCost(item);
      const notes = [item.model, item.jointOrientation ? `стик: ${item.jointOrientation.toLowerCase()}` : '', item.processingNote]
        .filter(Boolean).join(' · ');
      const rowH = secondName || folded ? 56 : 42;
      if (y + rowH > PAGE_LIMIT) { newPage(); body += headRow(y); y += 40; }

      if (index % 2 === 1) body += `<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="${rowH}" fill="${ROW_ALT}"/>`;
      const base = y + 28;
      body += t(colX[0] + 8, base, index + 1, 18, MUTED);
      body += t(colX[1] + 10, base, String(name).slice(0, 27), 19, INK, 600);
      if (secondName) body += t(colX[1] + 10, base + 22, secondName, 15, MUTED);
      body += t(colX[2] + 10, base, item.shape, 17, INK);
      body += t(colX[3] + cols[3] - 8, base, item.thicknessMm ? `${item.thicknessMm} мм` : '—', 17, INK, 400, 'end');
      body += t(colX[4] + cols[4] - 8, base, Math.max(1, item.count), 17, INK, 400, 'end');
      body += t(colX[5] + cols[5] - 8, base, amount, 17, INK, 600, 'end');
      body += t(colX[6] + cols[6] - 8, base, money(cost), 18, INK, 700, 'end');
      if (folded) body += t(colX[6] + cols[6] - 8, base + 20, 'у складі стільниці', 13, MUTED, 400, 'end');
      body += t(colX[7] + 12, base, notes.slice(0, 22) || '—', 15, MUTED);
      body += `<line x1="${MARGIN}" y1="${y + rowH}" x2="${A4.widthPx - MARGIN}" y2="${y + rowH}" stroke="${LINE}" stroke-width="1"/>`;
      y += rowH;
    });
    y += 36;
  }

  // ── Розрахунок вартості ────────────────────────────────────────────
  ensure(140);
  body += t(MARGIN, y + 8, 'РОЗРАХУНОК ВАРТОСТІ', 22, BRAND_DARK, 700);
  y += 28;

  const cCols = [CONTENT_W - 120 - 90 - 170 - 190, 120, 90, 170, 190];
  const cX: number[] = [];
  cCols.reduce((acc, width) => { cX.push(acc); return acc + width; }, MARGIN);

  const calcHead = (yy: number) => `
    <rect x="${MARGIN}" y="${yy}" width="${CONTENT_W}" height="40" fill="${BRAND_DARK}"/>
    ${t(cX[0] + 10, yy + 27, 'Найменування', 17, '#fff', 700)}
    ${t(cX[1] + cCols[1] - 8, yy + 27, 'К-сть', 17, '#fff', 700, 'end')}
    ${t(cX[2] + cCols[2] / 2, yy + 27, 'Од.', 17, '#fff', 700, 'middle')}
    ${t(cX[3] + cCols[3] - 8, yy + 27, 'Ціна, грн', 17, '#fff', 700, 'end')}
    ${t(cX[4] + cCols[4] - 8, yy + 27, 'Сума, грн', 17, '#fff', 700, 'end')}`;

  body += calcHead(y);
  y += 40;

  const groups = new Map<QuoteCalcLine['group'], QuoteCalcLine[]>();
  result.lines.forEach((line) => groups.set(line.group, [...(groups.get(line.group) ?? []), line]));

  let zebra = 0;
  groups.forEach((lines, group) => {
    if (y + 34 + 40 > PAGE_LIMIT) { newPage(); body += calcHead(y); y += 40; }
    body += `<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="32" fill="#e6eef4"/>`;
    body += t(MARGIN + 10, y + 22, QUOTE_GROUP_LABELS[group].toUpperCase(), 15, '#41586d', 700);
    y += 32;
    zebra = 0;

    lines.forEach((line) => {
      // Довга назва (наприклад, «… — Laminam (з ногою 0.99 м²)») не
      // обрізається, а переносить дужкову частину другим рядком.
      let main = line.label;
      let extra = '';
      if (main.length > 52) {
        const bracket = main.indexOf(' (');
        if (bracket > 0) {
          extra = main.slice(bracket + 1);
          main = main.slice(0, bracket);
        }
        if (main.length > 52) main = `${main.slice(0, 51)}…`;
      }
      const rowH = extra ? 52 : 38;
      if (y + rowH > PAGE_LIMIT) { newPage(); body += calcHead(y); y += 40; }
      if (zebra % 2 === 1) body += `<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="${rowH}" fill="${ROW_ALT}"/>`;
      const base = y + 26;
      body += t(cX[0] + 10, base, main, 18, INK);
      if (extra) body += t(cX[0] + 10, base + 19, extra, 14, MUTED);
      body += t(cX[1] + cCols[1] - 8, base, qtyText(line.qty), 18, INK, 400, 'end');
      body += t(cX[2] + cCols[2] / 2, base, quoteUnitLabel(line.unit), 17, MUTED, 400, 'middle');
      body += t(cX[3] + cCols[3] - 8, base, money(line.unitPrice), 18, INK, 400, 'end');
      body += t(cX[4] + cCols[4] - 8, base, money(line.sum), 18, INK, 600, 'end');
      body += `<line x1="${MARGIN}" y1="${y + rowH}" x2="${A4.widthPx - MARGIN}" y2="${y + rowH}" stroke="${LINE}" stroke-width="1"/>`;
      y += rowH;
      zebra += 1;
    });
  });

  // ── Підсумок ───────────────────────────────────────────────────────
  ensure(90);
  y += 14;
  body += `<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="58" fill="${BRAND_DARK}"/>`;
  body += t(MARGIN + 16, y + 38, 'ЗАГАЛЬНА ВАРТІСТЬ ПОСЛУГ ТА МАТЕРІАЛУ', 19, '#b8c6d4', 700);
  body += t(A4.widthPx - MARGIN - 16, y + 40, `${money(result.total)} ₴`, 30, '#ffffff', 700, 'end');
  y += 58;

  bodies.push(body);
  return bodies;
}

/**
 * Сторінка візуалізацій: 1 великий ракурс + до 2 менших, на білому фоні.
 * Знімки приходять із 3D-в'ювера в режимі showcase (biлий фон, без осей).
 */
export function renderQuoteVisualizationBody(project: Project, snapshots: string[]): string {
  let body = continuationHeader(project);
  let y = 110;
  body += t(MARGIN, y + 8, 'ВІЗУАЛІЗАЦІЯ ВИРОБУ', 22, BRAND_DARK, 700);
  body += t(A4.widthPx - MARGIN, y + 8, 'Зображення попередні, до погодження креслень', 15, MUTED, 400, 'end');
  y += 30;

  const frame = (href: string, x: number, yy: number, width: number, height: number) => `
    <rect x="${x}" y="${yy}" width="${width}" height="${height}" fill="#ffffff" stroke="${LINE}" stroke-width="1.5"/>
    <image href="${href}" x="${x + 6}" y="${yy + 6}" width="${width - 12}" height="${height - 12}" preserveAspectRatio="xMidYMid meet"/>`;

  const [main, ...rest] = snapshots;
  const bigH = rest.length ? 780 : 1180;
  if (main) {
    body += frame(main, MARGIN, y, CONTENT_W, bigH);
    y += bigH + 16;
  }
  if (rest.length) {
    const smallW = (CONTENT_W - 16) / 2;
    const smallH = 470;
    rest.slice(0, 2).forEach((snap, index) => {
      body += frame(snap, MARGIN + index * (smallW + 16), y, smallW, smallH);
    });
    y += smallH;
  }
  return body;
}

// ── Бланк погодження ─────────────────────────────────────────────────
//  Відтворює структуру старих бланків VIYARSTONE: шапка-таблиця,
//  на кожен виріб — контур з літерами сторін і розмірами, позначки
//  підворотів/бортиків на сторонах, таблиця «Специфікація виробу»,
//  в кінці — застереження «Увага!» і рядок підпису замовника.

/** Додаток до виробу (підворот/бортик/потовщення) зі слота продукту */
interface ApprovalAttachment {
  kind: string;
  side: string;
  heightMm: number;
  lengthMm: number;
}

const SLOT_KINDS: Array<[prefix: string, label: string]> = [
  ['fold_', 'Підворот'],
  ['skirting_', 'Бортик'],
  ['thickening_', 'Потовщення'],
];

function attachmentsOf(group: Detail[]): ApprovalAttachment[] {
  const out: ApprovalAttachment[] = [];
  group.forEach((detail) => {
    const slot = String(detail.slot ?? detail.id.split('element:')[1]?.split('/')[0] ?? '');
    const match = SLOT_KINDS.find(([prefix]) => slot.startsWith(prefix));
    if (!match) return;
    out.push({
      kind: match[1],
      side: detail.parentDetailSide ?? slot.slice(match[0].length),
      heightMm: detail.geometry?.height ?? 0,
      lengthMm: detail.geometry?.width ?? 0,
    });
  });
  return out;
}

/** Легасі-деталі (DXF, ручні) несуть підвороти прапорцями на самій деталі */
function legacyAttachmentsOf(detail: Detail): ApprovalAttachment[] {
  const out: ApprovalAttachment[] = [];
  const push = (kind: string, sides: string[] | undefined, size?: number, sideSizes?: Record<string, number>) => {
    (sides ?? []).forEach((side) => out.push({
      kind, side,
      heightMm: sideSizes?.[side] ?? size ?? 0,
      lengthMm: 0,
    }));
  };
  if (detail.fold?.enabled) push('Підворот', detail.fold.sides, detail.fold.size, detail.fold.sideSizes);
  if (detail.thickening?.enabled) push('Потовщення', detail.thickening.sides, detail.thickening.size, detail.thickening.sideSizes);
  Object.entries(detail.skirtings ?? {}).forEach(([side, skirting]) => {
    out.push({ kind: 'Бортик', side, heightMm: (skirting as { height?: number })?.height ?? 0, lengthMm: 0 });
  });
  return out;
}

/** Контур деталі з літерами сторін, розмірами і позначками обробок */
function blueprintSvg(
  part: DetailPart,
  marks: ApprovalAttachment[],
  radii: number[],
  x0: number,
  y0: number,
  maxW: number,
  maxH: number,
): { svg: string; height: number } {
  const points = part.points ?? [];
  if (points.length < 3) return { svg: '', height: 0 };
  const scale = Math.min(maxW / Math.max(part.width, 1), maxH / Math.max(part.height, 1));
  const w = part.width * scale;
  const h = part.height * scale;
  const ox = x0 + (maxW - w) / 2;
  const oy = y0;
  const map = (p: Point) => ({ x: ox + p.x * scale, y: oy + p.y * scale });

  let svg = `<polygon points="${points.map((p) => { const m = map(p); return `${m.x},${m.y}`; }).join(' ')}" fill="#f8fafc" stroke="${INK}" stroke-width="2"/>`;

  // Вирізи: контур + розмір прямо на отворі («300×200» чи «Ø35»)
  (part.holes ?? []).forEach((hole) => {
    svg += `<polygon points="${hole.map((p) => { const m = map(p); return `${m.x},${m.y}`; }).join(' ')}" fill="#ffffff" stroke="${INK}" stroke-width="1.5"/>`;
    const xs = hole.map((p) => p.x);
    const ys = hole.map((p) => p.y);
    const holeW = Math.max(...xs) - Math.min(...xs);
    const holeH = Math.max(...ys) - Math.min(...ys);
    const isRound = hole.length >= 8 && Math.abs(holeW - holeH) <= Math.max(holeW, holeH) * 0.05;
    const label = isRound ? `Ø${Math.round(holeW)}` : `${Math.round(holeW)}×${Math.round(holeH)}`;
    const centerMapped = map({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 });
    // Дрібний отвір підписуємо над ним, більший — усередині
    const fitsInside = holeW * scale > 90 && holeH * scale > 26;
    svg += t(centerMapped.x, fitsInside ? centerMapped.y + 5 : centerMapped.y - holeH * scale / 2 - 8, label, 14, MUTED, 600, 'middle');
  });

  // «R…» біля дуги радіусного кута. Дуга впізнається як серія коротких
  // неосьових сегментів; радіуси беруться з обробок кутів деталі.
  if (radii.length) {
    const isAxis = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.001 || Math.abs(a.y - b.y) < 0.001;
    const runs: Array<{ from: number; to: number }> = [];
    let runStart = -1;
    for (let index = 0; index < points.length; index += 1) {
      const next = points[(index + 1) % points.length];
      if (!isAxis(points[index], next)) {
        if (runStart < 0) runStart = index;
      } else if (runStart >= 0) {
        if (index - runStart >= 3) runs.push({ from: runStart, to: index });
        runStart = -1;
      }
    }
    if (runStart >= 0 && points.length - runStart >= 3) runs.push({ from: runStart, to: points.length - 1 });
    // Позначаємо лише коли кількість дуг збігається з кількістю радіусів —
    // інакше ризикуємо підписати чужу дугу; специфікація нижче все одно
    // несе повний перелік.
    if (runs.length === radii.length) {
      runs.forEach((run, index) => {
        const mid = points[Math.floor((run.from + run.to) / 2)];
        const mapped = map(mid);
        svg += t(mapped.x + 14, mapped.y + 18, `R${Math.round(radii[index])}`, 15, INK, 700);
      });
    }
  }

  const centroid = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 });
  const marksBySide = new Map(marks.map((mark) => [mark.side, mark]));

  // Літера сторони + її довжина зовні; позначка обробки — всередині,
  // як «опуск» у старих бланках.
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((letter) => {
    const segment = sideSegmentOfPart(part, letter);
    if (!segment) return;
    const mid = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    const toCentroid = { x: centroid.x - mid.x, y: centroid.y - mid.y };
    if (nx * toCentroid.x + ny * toCentroid.y > 0) { nx = -nx; ny = -ny; } // назовні
    const outer = map({ x: mid.x + nx * (34 / scale), y: mid.y + ny * (34 / scale) });
    svg += t(outer.x, outer.y + 6, `${letter}=${Math.round(pointDistance(segment.start, segment.end))} мм`, 16, INK, 700, 'middle');
    const mark = marksBySide.get(letter);
    if (mark) {
      const inner = map({ x: mid.x - nx * (26 / scale), y: mid.y - ny * (26 / scale) });
      svg += t(inner.x, inner.y + 5, mark.kind.toLowerCase(), 14, MUTED, 400, 'middle');
    }
  });

  return { svg, height: h };
}

/**
 * Паспорт мийки: три проєкції, як у старих бланках погодження —
 * «Вид спереду (розріз)», «Вид збоку (розріз)», «Вид зверху» з діагоналями
 * і зливом, плюс кількість. Стандартний контур деталі тут не годиться:
 * він показував би одну стінку чаші з розкрою, а не сам виріб.
 */
function sinkPassportSvg(detail: Detail, x0: number, y0: number, maxW: number): { svg: string; height: number } {
  const g = (detail.geometry ?? {}) as { width?: number; height?: number; innerVertical?: number };
  const L = Math.max(1, g.width ?? 500);
  const W = Math.max(1, g.height ?? 400);
  const D = Math.max(1, g.innerVertical ?? 200);
  const T = Math.max(8, detail.thickness ?? 20);

  let svg = `<rect x="${x0}" y="${y0}" width="${maxW}" height="500" fill="#fbfdfe" stroke="${LINE}" stroke-width="1"/>`;

  const dimLabel = (cx: number, cy: number, label: string) => {
    const w = Math.max(52, label.length * 11 + 16);
    svg += `<rect x="${cx - w / 2}" y="${cy - 12}" width="${w}" height="24" fill="#ffffff" stroke="${LINE}" stroke-width="1"/>`;
    svg += t(cx, cy + 5, label, 15, INK, 700, 'middle');
  };
  const dimH = (x: number, y: number, w: number, label: string) => {
    svg += `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${MUTED}" stroke-width="1"/>`;
    svg += `<line x1="${x}" y1="${y - 5}" x2="${x}" y2="${y + 5}" stroke="${MUTED}" stroke-width="1"/>`;
    svg += `<line x1="${x + w}" y1="${y - 5}" x2="${x + w}" y2="${y + 5}" stroke="${MUTED}" stroke-width="1"/>`;
    dimLabel(x + w / 2, y, label);
  };
  const dimV = (x: number, y: number, h: number, label: string) => {
    svg += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + h}" stroke="${MUTED}" stroke-width="1"/>`;
    svg += `<line x1="${x - 5}" y1="${y}" x2="${x + 5}" y2="${y}" stroke="${MUTED}" stroke-width="1"/>`;
    svg += `<line x1="${x - 5}" y1="${y + h}" x2="${x + 5}" y2="${y + h}" stroke="${MUTED}" stroke-width="1"/>`;
    dimLabel(x, y + h / 2, label);
  };

  // ── Ряд 1: два розрізи (спереду — по довжині, збоку — по ширині) ────
  const sectionTop = y0 + 66;
  const section = (cx: number, innerMm: number, title: string) => {
    const scale = Math.min(280 / (innerMm + 2 * T + 120), 130 / (D + 10));
    const w = innerMm * scale;
    const wall = Math.max(3, T * scale);
    const h = Math.max(24, D * scale);
    const bx = cx - w / 2;
    svg += t(cx, y0 + 28, title, 15, MUTED, 600, 'middle');
    // площина стільниці над чашею (виступає за чашу з обох боків)
    svg += `<rect x="${bx - wall - 46}" y="${sectionTop}" width="${w + 2 * wall + 92}" height="10" fill="#dbe7f0" stroke="${INK}" stroke-width="1"/>`;
    const by = sectionTop + 10;
    // U-подібний розріз: стінки і дно товщиною каменю
    const pts: Array<[number, number]> = [
      [bx - wall, by], [bx - wall, by + h], [bx + w + wall, by + h], [bx + w + wall, by],
      [bx + w, by], [bx + w, by + h - wall], [bx, by + h - wall], [bx, by],
    ];
    svg += `<polygon points="${pts.map(([px, py]) => `${px},${py}`).join(' ')}" fill="#f8fafc" stroke="${INK}" stroke-width="1.5"/>`;
    dimH(bx, sectionTop - 14, w, String(Math.round(innerMm)));
    dimV(bx - wall - 30, by, h, String(Math.round(D)));
    return by + h;
  };
  const frontBottom = section(x0 + Math.round(maxW * 0.27), L, 'Вид спереду (розріз)');
  const sideBottom = section(x0 + Math.round(maxW * 0.72), W, 'Вид збоку (розріз)');

  // ── Ряд 2: вид зверху (діагоналі + злив) і кількість ────────────────
  const topTitleY = Math.max(frontBottom, sideBottom) + 44;
  const s2 = Math.min(320 / L, 190 / W);
  const tw = L * s2;
  const th = W * s2;
  const tx = x0 + Math.round(maxW * 0.27) - tw / 2;
  const ty = topTitleY + 18;
  svg += t(tx + tw / 2, topTitleY, 'Вид зверху', 15, MUTED, 600, 'middle');
  svg += `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="#f8fafc" stroke="${INK}" stroke-width="1.5"/>`;
  svg += `<line x1="${tx}" y1="${ty}" x2="${tx + tw}" y2="${ty + th}" stroke="${MUTED}" stroke-width="1"/>`;
  svg += `<line x1="${tx + tw}" y1="${ty}" x2="${tx}" y2="${ty + th}" stroke="${MUTED}" stroke-width="1"/>`;
  const drainR = Math.max(8, Math.min(tw, th) * 0.09);
  svg += `<circle cx="${tx + tw / 2}" cy="${ty + th / 2}" r="${drainR}" fill="#ffffff" stroke="${INK}" stroke-width="1.5"/>`;
  dimV(tx - 30, ty, th, String(Math.round(W)));
  dimH(tx, ty + th + 22, tw, String(Math.round(L)));

  // Кількість — праворуч від виду зверху, як у старому бланку
  const qx = x0 + Math.round(maxW * 0.72);
  svg += t(qx, ty + th / 2 - 22, 'Кількість', 15, MUTED, 600, 'middle');
  svg += `<rect x="${qx - 34}" y="${ty + th / 2 - 8}" width="68" height="32" fill="#ffffff" stroke="${LINE}" stroke-width="1"/>`;
  svg += t(qx, ty + th / 2 + 14, String(detail.quantity ?? 1), 17, INK, 700, 'middle');

  const bottom = ty + th + 44;
  const height = bottom - y0;
  // Рамка панелі — фактичної висоти
  svg = svg.replace(`height="500" fill="#fbfdfe"`, `height="${height}" fill="#fbfdfe"`);
  return { svg, height };
}

/** Тіла сторінок бланку погодження — додаються до КП перед збиранням */
export function renderApprovalBodies(
  project: Project,
  doc: QuoteCalcDoc,
  parts: DetailPart[],
  details: Detail[],
): string[] {
  const bodies: string[] = [];
  let body = continuationHeader(project);
  let y = 96;
  const newPage = () => { bodies.push(body); body = continuationHeader(project); y = 96; };
  const ensure = (height: number) => { if (y + height > PAGE_LIMIT) newPage(); };

  body += t(A4.widthPx / 2, y + 20, `БЛАНК ПОГОДЖЕННЯ ВИРОБУ ДО ЗАМОВЛЕННЯ № ${project.orderNumber || '—'}`, 24, BRAND_DARK, 700, 'middle');
  y += 44;

  // ── Шапка-таблиця, як у старому бланку ─────────────────────────────
  const totalArea = parts.reduce((sum, part) => sum + (part.area || 0), 0);
  const headRows: Array<[string, string]> = [
    ['Контрагент', doc.contragent || '—'],
    ['Контактний номер телефону', [doc.contactName, doc.contactPhone].filter(Boolean).join(', ') || '—'],
    ...(doc.method === 'measure_install' ? [['Адреса приміщення для замірів', doc.address || '—'] as [string, string]] : []),
    ['Загальна площа виробу (м.кв)', totalArea.toFixed(3)],
    ['Матеріал', [doc.materialType, doc.manufacturer].filter(Boolean).join(' · ')],
    ['Декор', doc.decorCode || '—'],
    ...(doc.surfaceType ? [['Поверхня', doc.surfaceType] as [string, string]] : []),
    ...(doc.comment.trim() ? [['Примітка', doc.comment.trim().slice(0, 80)] as [string, string]] : []),
  ];
  headRows.forEach(([label, value]) => {
    body += `<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="34" fill="none" stroke="${LINE}" stroke-width="1"/>`;
    body += `<line x1="${MARGIN + 360}" y1="${y}" x2="${MARGIN + 360}" y2="${y + 34}" stroke="${LINE}" stroke-width="1"/>`;
    body += t(MARGIN + 10, y + 23, label, 16, MUTED, 600);
    body += t(MARGIN + 374, y + 23, value, 17, INK, 700);
    y += 34;
  });
  y += 26;

  // ── Вироби: контур + специфікація ──────────────────────────────────
  //  Головні деталі малюються; підвороти/бортики/потовщення їхнього
  //  продукту стають позначками на сторонах і рядками специфікації.
  const groups = new Map<string, Detail[]>();
  details.forEach((detail) => {
    const key = detail.id.includes('/') ? detail.id.split('/')[0] : detail.id;
    groups.set(key, [...(groups.get(key) ?? []), detail]);
  });

  const profileLabel = (raw: unknown): string => {
    const id = typeof raw === 'string'
      ? raw
      : (raw as { top?: { profileId?: string } })?.top?.profileId ?? '';
    const profile = project.referenceData?.edgeProfiles?.find((item) => item.id === id);
    return profile?.label ?? profile?.shortLabel ?? String(id || '—');
  };

  let productIndex = 0;
  groups.forEach((group) => {
    const mains = group.filter((detail) => !SLOT_KINDS.some(([prefix]) => String(detail.slot ?? '').startsWith(prefix)));
    const attachments = attachmentsOf(group);

    mains.forEach((detail) => {
      // Мийка — свій паспорт: три проєкції чаші (розрізи + вид зверху),
      // а не контур першої-ліпшої стінки з розкрою.
      if (detail.geometry?.sinkKind) {
        productIndex += 1;
        const bowlArea = parts
          .filter((item) => item.detailId === detail.id)
          .reduce((sum, item) => sum + (item.area || 0), 0);
        ensure(560);
        body += t(MARGIN, y + 20, `Виріб №${productIndex} — ${detail.label || 'Мийка'} (${bowlArea.toFixed(3)} м.кв)`, 20, BRAND_DARK, 700);
        y += 34;
        const passport = sinkPassportSvg(detail, MARGIN, y, CONTENT_W);
        body += passport.svg;
        y += passport.height + 30;
        return;
      }

      const part = parts.find((item) => item.detailId === detail.id && item.isMain);
      if (!part) return;
      productIndex += 1;

      // Позначки лише свого виробу: додатки продукту чіпляються до
      // головної деталі (Стільниці), легасі — до самої деталі
      const own = (detail.type === 'Стільниця' ? attachments : [])
        .concat(legacyAttachmentsOf(detail));

      const drawingMaxH = 430;
      const scale = Math.min((CONTENT_W - 200) / Math.max(part.width, 1), drawingMaxH / Math.max(part.height, 1));
      const drawingH = part.height * scale;
      const specRows: Array<[string, string, string, string]> = [];
      Object.entries(detail.edgeProfiles ?? {}).forEach(([side, raw]) => {
        if (!raw) return;
        const segment = sideSegmentOfPart(part, side);
        const lengthMm = segment ? Math.round(pointDistance(segment.start, segment.end)) : 0;
        specRows.push([side, `Крайка — ${profileLabel(raw)}`, String(detail.thickness ?? ''), lengthMm ? String(lengthMm) : '—']);
      });
      own.forEach((attachment) => {
        specRows.push([
          attachment.side, attachment.kind,
          attachment.heightMm ? String(Math.round(attachment.heightMm)) : '—',
          attachment.lengthMm ? String(Math.round(attachment.lengthMm)) : '—',
        ]);
      });

      // Обробки кутів: радіус несе своє R, фаска й Г-заріз — обидва катети
      const corners = detail.geometry?.corners ?? {};
      const radii: number[] = [];
      Object.entries(corners).forEach(([cornerId, corner]) => {
        if (!corner) return;
        if (corner.type === 'radius' && (corner.radius ?? 0) > 0) {
          radii.push(corner.radius ?? 0);
          specRows.push([`Кут ${cornerId}`, `Радіус R${Math.round(corner.radius ?? 0)}`, '—', '—']);
        } else if (corner.type === 'chamfer') {
          specRows.push([`Кут ${cornerId}`, 'Фаска', String(corner.sizeB ?? '—'), String(corner.sizeC ?? '—')]);
        } else if (corner.type === 'l-cut') {
          specRows.push([`Кут ${cornerId}`, 'Г-заріз', String(corner.sizeB ?? '—'), String(corner.sizeC ?? '—')]);
        }
      });

      // Вирізи: тип і розміри (прямокутний — Ш×Г, круглий — Ø)
      const cutoutTypeLabels: Record<string, string> = { socket: ' під розетку', faucet: ' під змішувач' };
      Object.values(detail.geometry?.cutouts ?? {}).forEach((cutout) => {
        const c = cutout as { shape?: string; width?: number; height?: number; diameter?: number; type?: string };
        const dims = c.shape === 'circle'
          ? `Ø${Math.round(c.diameter ?? c.width ?? 0)}`
          : `${Math.round(c.width ?? 0)}×${Math.round(c.height ?? 0)}`;
        specRows.push(['—', `Виріз${cutoutTypeLabels[c.type ?? ''] ?? ''} ${dims} мм`, '—', '—']);
      });

      const blockH = 34 + drawingH + 70 + (specRows.length ? 36 + specRows.length * 30 + 24 : 20);
      ensure(Math.min(blockH, PAGE_LIMIT - 96));

      body += t(MARGIN, y + 20, `Виріб №${productIndex} — ${detail.label || detail.type} (${(part.area || 0).toFixed(3)} м.кв)`, 20, BRAND_DARK, 700);
      y += 34;

      const blueprint = blueprintSvg(part, own, radii, MARGIN + 60, y + 24, CONTENT_W - 200, drawingMaxH);
      body += blueprint.svg;
      y += blueprint.height + 70;

      if (specRows.length) {
        const cols = [70, CONTENT_W - 70 - 150 - 170, 150, 170];
        const cx: number[] = [];
        cols.reduce((acc, width) => { cx.push(acc); return acc + width; }, MARGIN);
        body += `<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="32" fill="#e6eef4"/>`;
        body += t(cx[0] + 8, y + 22, 'Сторона', 15, '#41586d', 700);
        body += t(cx[1] + 8, y + 22, 'Тип елементу виробу', 15, '#41586d', 700);
        body += t(cx[2] + cols[2] - 8, y + 22, 'Висота, мм', 15, '#41586d', 700, 'end');
        body += t(cx[3] + cols[3] - 8, y + 22, 'Довжина, мм', 15, '#41586d', 700, 'end');
        y += 32;
        specRows.forEach(([side, kind, height, length], index) => {
          if (index % 2 === 1) body += `<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="30" fill="${ROW_ALT}"/>`;
          body += t(cx[0] + 8, y + 21, side, 16, INK, 700);
          body += t(cx[1] + 8, y + 21, kind, 16, INK);
          body += t(cx[2] + cols[2] - 8, y + 21, height, 16, INK, 400, 'end');
          body += t(cx[3] + cols[3] - 8, y + 21, length, 16, INK, 400, 'end');
          body += `<line x1="${MARGIN}" y1="${y + 30}" x2="${A4.widthPx - MARGIN}" y2="${y + 30}" stroke="${LINE}" stroke-width="1"/>`;
          y += 30;
        });
        y += 24;
      } else {
        y += 20;
      }
    });
  });

  // ── «Увага!» + підпис — як у старих бланках ────────────────────────
  const notes = [
    'Будь-який виріб виготовляється з декількох деталей, які з\'єднуються між собою за допомогою клею.',
    'Кількість деталей та місця їх з\'єднань визначає спеціаліст. На деяких декорах місце з\'єднання (шов) може бути помітним.',
    'У зв\'язку з тим, що кожен виріб виготовляється індивідуально, можливі відхилення від розмірів у горизонтальній',
    'та вертикальній площині до 2 мм. Таке відхилення вважається нормою, якщо воно не помітне візуально з відстані 1 м.',
    'Для компенсації розширення матеріалу виріб повинен мати зазори не менше 3 мм у місцях примикання до стін.',
  ];
  ensure(60 + notes.length * 24 + 90);
  body += t(MARGIN, y + 20, 'Увага!', 20, BRAND_DARK, 700);
  y += 34;
  notes.forEach((note) => {
    body += t(MARGIN, y + 16, `– ${note}`, 15, MUTED);
    y += 24;
  });
  y += 24;
  body += `<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="52" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
  body += `<line x1="${MARGIN + 420}" y1="${y}" x2="${MARGIN + 420}" y2="${y + 52}" stroke="${INK}" stroke-width="1"/>`;
  body += `<line x1="${MARGIN + 780}" y1="${y}" x2="${MARGIN + 780}" y2="${y + 52}" stroke="${INK}" stroke-width="1"/>`;
  body += t(MARGIN + 10, y + 24, 'З розмірами деталей, матеріалом і', 15, INK, 600);
  body += t(MARGIN + 10, y + 42, 'видами обробки згоден:', 15, INK, 600);
  body += t(MARGIN + 434, y + 32, doc.contactName || 'П.І.Б', 16, doc.contactName ? INK : MUTED, 600);
  body += t(MARGIN + 794, y + 32, 'Підпис', 14, MUTED);
  y += 52;

  bodies.push(body);
  return bodies;
}

/** Збирання тіл у сторінки з наскрізною нумерацією */
export function assembleQuotePages(bodies: string[]): string[] {
  return bodies.map((pageBody, index) => pageSvg(A4, pageBody + footer(index + 1, bodies.length)));
}

export function renderQuotePdfSvgPages(
  project: Project,
  doc: QuoteCalcDoc,
  result: QuoteCalcResult,
): string[] {
  return assembleQuotePages(renderQuoteCalcBodies(project, doc, result));
}

// ── Склад документа ──────────────────────────────────────────────────

export interface QuotePdfOptions {
  /** КП: шапка замовлення, вироби, розрахунок вартості */
  includeCalc: boolean;
  /** 3D-візуалізації (знімки з в'ювера в режимі showcase) */
  snapshots: string[];
  /** Загальний список деталей (таблиця з габаритами і площами) */
  includeDetailsList: boolean;
  /** Креслення на погодження — технічні карти деталей */
  includeDrawings: boolean;
}

export const DEFAULT_QUOTE_PDF_OPTIONS: QuotePdfOptions = {
  includeCalc: true,
  snapshots: [],
  includeDetailsList: false,
  includeDrawings: false,
};

export async function exportQuotePdf(
  project: Project,
  doc: QuoteCalcDoc,
  result: QuoteCalcResult,
  options: QuotePdfOptions = DEFAULT_QUOTE_PDF_OPTIONS,
  parts: DetailPart[] = [],
  details: Detail[] = [],
) {
  const bodies: string[] = [];
  if (options.includeCalc) bodies.push(...renderQuoteCalcBodies(project, doc, result));
  if (options.snapshots.length) bodies.push(renderQuoteVisualizationBody(project, options.snapshots));
  if (options.includeDrawings) bodies.push(...renderApprovalBodies(project, doc, parts, details));
  const pages = assembleQuotePages(bodies);

  // Список деталей — зі спільного конвеєра PDF розкрою, у портретному А4
  const attachmentOptions = { ...defaultPdfExportOptions, format: 'a4' as const, orientation: 'portrait' as const };
  if (options.includeDetailsList) pages.push(...renderDetailsPages(project, parts, attachmentOptions, A4));

  if (!pages.length) return;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) pdf.addPage('a4', 'portrait');
    const png = await svgStringToPngData(pages[index]);
    pdf.addImage(png, 'PNG', 0, 0, A4.widthMm, A4.heightMm);
  }
  const name = `Прорахунок_${safeFilePart(project.orderNumber, 'без номера')}_${safeFilePart(doc.contragent, 'клієнт')}.pdf`;
  pdf.save(name);
}
