import { jsPDF } from 'jspdf';
import type { Project } from '../../domain/types';
import {
  QUOTE_METHODS,
  quoteProductType,
  type QuoteCalcDoc,
} from '../../domain/quoteCalc';
import {
  itemAreaM2,
  itemLengthM,
  quoteUnitLabel,
  QUOTE_GROUP_LABELS,
  type QuoteCalcLine,
  type QuoteCalcResult,
} from '../../engines/quoteCalc';
import type { PageSize } from './pdfTypes';
import { escapeXml, pageSvg, safeFilePart, svgStringToPngData } from './pdfUtils';

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

export function renderQuotePdfSvgPages(
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

    // № · Виріб · Форма · Товщина · К-сть · Обсяг · Примітки
    const cols = [34, 300, 120, 100, 70, 130, CONTENT_W - 34 - 300 - 120 - 100 - 70 - 130];
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
      ${t(colX[6] + 12, yy + 27, 'Примітки', 17, '#fff', 700)}`;

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
      const notes = [item.model, item.jointOrientation ? `стик: ${item.jointOrientation.toLowerCase()}` : '', item.processingNote]
        .filter(Boolean).join(' · ');
      const rowH = secondName ? 56 : 42;
      if (y + rowH > PAGE_LIMIT) { newPage(); body += headRow(y); y += 40; }

      if (index % 2 === 1) body += `<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="${rowH}" fill="${ROW_ALT}"/>`;
      const base = y + 28;
      body += t(colX[0] + 8, base, index + 1, 18, MUTED);
      body += t(colX[1] + 10, base, String(name).slice(0, 30), 19, INK, 600);
      if (secondName) body += t(colX[1] + 10, base + 22, secondName, 15, MUTED);
      body += t(colX[2] + 10, base, item.shape, 18, INK);
      body += t(colX[3] + cols[3] - 8, base, item.thicknessMm ? `${item.thicknessMm} мм` : '—', 18, INK, 400, 'end');
      body += t(colX[4] + cols[4] - 8, base, Math.max(1, item.count), 18, INK, 400, 'end');
      body += t(colX[5] + cols[5] - 8, base, amount, 18, INK, 600, 'end');
      body += t(colX[6] + 12, base, notes.slice(0, 34) || '—', 16, MUTED);
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
      if (y + 38 > PAGE_LIMIT) { newPage(); body += calcHead(y); y += 40; }
      if (zebra % 2 === 1) body += `<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="38" fill="${ROW_ALT}"/>`;
      const base = y + 26;
      body += t(cX[0] + 10, base, line.label.slice(0, 52), 18, INK);
      body += t(cX[1] + cCols[1] - 8, base, qtyText(line.qty), 18, INK, 400, 'end');
      body += t(cX[2] + cCols[2] / 2, base, quoteUnitLabel(line.unit), 17, MUTED, 400, 'middle');
      body += t(cX[3] + cCols[3] - 8, base, money(line.unitPrice), 18, INK, 400, 'end');
      body += t(cX[4] + cCols[4] - 8, base, money(line.sum), 18, INK, 600, 'end');
      body += `<line x1="${MARGIN}" y1="${y + 38}" x2="${A4.widthPx - MARGIN}" y2="${y + 38}" stroke="${LINE}" stroke-width="1"/>`;
      y += 38;
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
  return bodies.map((pageBody, index) => pageSvg(A4, pageBody + footer(index + 1, bodies.length)));
}

export async function exportQuotePdf(project: Project, doc: QuoteCalcDoc, result: QuoteCalcResult) {
  const pages = renderQuotePdfSvgPages(project, doc, result);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) pdf.addPage('a4', 'portrait');
    const png = await svgStringToPngData(pages[index]);
    pdf.addImage(png, 'PNG', 0, 0, A4.widthMm, A4.heightMm);
  }
  const name = `Прорахунок_${safeFilePart(project.orderNumber, 'без номера')}_${safeFilePart(doc.contragent, 'клієнт')}.pdf`;
  pdf.save(name);
}
