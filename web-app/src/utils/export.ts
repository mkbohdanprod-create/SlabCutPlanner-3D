import { jsPDF } from 'jspdf';
import type {
  Detail,
  DetailPart,
  Placement,
  Point,
  Project,
  Rotation,
  SlabInstance,
  TextureFrame,
  TextureLayout,
} from '../domain/types';
import { localeForLanguage, translateStaticUiText } from '../i18n';
import { getStatusLabel, placementPolygon, pointString, rotatePoint, rotatedLocalPoints, rotatedPoints, rotatedSize } from '../lib/project';
import { edgeMarkersForPart, edgeProfileShortLabel } from './edgeProfiles';
import { round } from './math';

export type PdfPageFormat = 'a4' | 'a3';
export type PdfOrientation = 'portrait' | 'landscape';
export type PdfSlabLayout = 'one' | 'two' | 'multi' | 'auto';
export type PdfScaleMode = 'auto' | '100' | '75' | '50';
export type PdfSlabMode = 'technical' | 'photo' | 'texture';

export interface PdfExportOptions {
  format: PdfPageFormat;
  orientation: PdfOrientation;
  scaleMode: PdfScaleMode;
  slabLayout: PdfSlabLayout;
  includeTitle: boolean;
  includeDetails: boolean;
  includeUnplaced: boolean;
  includeTechnical: boolean;
  includePhoto: boolean;
  includeTexture: boolean;
  includeTextureZone: boolean;
  include3d: boolean;
  showDimensions: boolean;
  includeDefects: boolean;
  includeComments: boolean;
  author: string;
}

export const defaultPdfExportOptions: PdfExportOptions = {
  format: 'a4',
  orientation: 'landscape',
  scaleMode: 'auto',
  slabLayout: 'one',
  includeTitle: true,
  includeDetails: true,
  includeUnplaced: true,
  includeTechnical: true,
  includePhoto: true,
  includeTexture: true,
  includeTextureZone: true,
  include3d: false,
  showDimensions: true,
  includeDefects: true,
  includeComments: true,
  author: '',
};

type PageSize = {
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type Slot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TextureItem = {
  layout: TextureLayout;
  part: DetailPart;
  slab?: SlabInstance;
  displayX: number;
  displayY: number;
};

const PAGE_MARGIN = 54;
const PAGE_TITLE_Y = 56;
const PAGE_FONT = "Arial, 'Noto Sans', 'DejaVu Sans', sans-serif";

export function calculateTotalArea(parts: DetailPart[]): number {
  return round(parts.reduce((sum, part) => sum + part.area, 0), 3);
}

function pageSize(options: PdfExportOptions): PageSize {
  const base = options.format === 'a3'
    ? { width: 297, height: 420 }
    : { width: 210, height: 297 };
  const widthMm = options.orientation === 'landscape' ? base.height : base.width;
  const heightMm = options.orientation === 'landscape' ? base.width : base.height;
  const widthPx = options.orientation === 'landscape' ? 1600 : 1200;
  const heightPx = Math.round(widthPx * (heightMm / widthMm));
  return { widthMm, heightMm, widthPx, heightPx };
}

function escapeXml(value: string | number | undefined | null) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function text(
  x: number,
  y: number,
  content: string | number,
  size = 22,
  color = '#1f2d3a',
  weight = 400,
  anchor: 'start' | 'middle' | 'end' = 'start',
) {
  return `<text x="${x}" y="${y}" font-family="${PAGE_FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}">${escapeXml(content)}</text>`;
}

function textMiddle(
  x: number,
  y: number,
  content: string | number,
  size = 22,
  color = '#1f2d3a',
  weight = 400,
  anchor: 'start' | 'middle' | 'end' = 'start',
) {
  return `<text x="${x}" y="${y}" font-family="${PAGE_FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="middle" fill="${color}">${escapeXml(content)}</text>`;
}

function pageSvg(size: PageSize, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.widthPx}" height="${size.heightPx}" viewBox="0 0 ${size.widthPx} ${size.heightPx}">
    <rect width="${size.widthPx}" height="${size.heightPx}" fill="#ffffff"/>
    <style>
      text { font-family: ${PAGE_FONT}; }
      .muted { fill: #617789; }
      .table-head { fill: #dfe8ee; stroke: #bdd0dd; stroke-width: 1; }
      .table-row { fill: #f7fbfd; stroke: #d8e3eb; stroke-width: 1; }
      .table-row-alt { fill: #eef4f8; stroke: #d8e3eb; stroke-width: 1; }
    </style>
    ${body}
  </svg>`;
}

function pointsBounds(points: Point[]): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function pathFromPolygons(polygons: Point[][], scale = 1, offsetX = 0, offsetY = 0) {
  return polygons
    .filter((polygon) => polygon.length)
    .map((polygon) => `M ${polygon.map((point) => `${offsetX + point.x * scale} ${offsetY + point.y * scale}`).join(' L ')} Z`)
    .join(' ');
}

function localHoles(part: DetailPart, rotation: Rotation) {
  return (part.holes ?? []).map((hole) => rotatedLocalPoints(hole, rotation, part.width, part.height, part.points));
}

function placementHoles(part: DetailPart, placement: Placement) {
  return localHoles(part, placement.rotation).map((hole) => hole.map((point) => ({
    x: point.x + placement.x,
    y: point.y + placement.y,
  })));
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function clampText(value: string | undefined, max = 34) {
  const textValue = value?.trim() || '-';
  return textValue.length > max ? `${textValue.slice(0, Math.max(0, max - 1))}…` : textValue;
}

function uiText(language: Project['uiLanguage'] | undefined, value: string | number | undefined | null) {
  return translateStaticUiText(language, String(value ?? ''));
}

function projectText(project: Project, value: string | number | undefined | null) {
  return uiText(project.uiLanguage, value);
}

function unitText(project: Project, value: 'мм' | 'м²') {
  return projectText(project, value);
}

const generatedLabelFragments = [
  'Стінова панель',
  'Стільниця',
  'Потовщення',
  'Підворот',
  'DXF контур',
  'стільниці',
  'сторони',
  'сторона',
  'Мийка',
  'Фасад',
  'Опора',
].sort((a, b) => b.length - a.length);

function generatedLabel(language: Project['uiLanguage'] | undefined, value: string) {
  return generatedLabelFragments.reduce((result, fragment) => (
    result.split(fragment).join(uiText(language, fragment))
  ), value);
}

function partParentLabel(project: Project, part: DetailPart) {
  const detail = project.details.find((item) => item.id === part.detailId);
  return detail?.label?.trim() ? part.parentLabel : generatedLabel(project.uiLanguage, part.parentLabel);
}

function formatDate(value?: string, language?: Project['uiLanguage']) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(localeForLanguage(language));
}

function uniqueText(values: Array<string | undefined>) {
  const list = Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
  return list.length ? list.join(', ') : '-';
}

function detailName(detail: Detail, index: number, language?: Project['uiLanguage']) {
  return detail.label?.trim() || `${uiText(language, detail.type)} ${index + 1}`;
}

function detailDimensions(detail: Detail, language?: Project['uiLanguage']) {
  const g = detail.geometry;
  switch (detail.shape) {
    case 'Кругла':
      return g.diameter ? `Ø${g.diameter}` : g.width ? `Ø${g.width}` : '-';
    case 'Овальна':
      return `${g.ellipseWidth ?? g.width ?? 0}×${g.ellipseHeight ?? g.height ?? 0}`;
    case 'Г-подібна':
      return `${g.outerWidth ?? g.width ?? 0}×${g.outerHeight ?? g.height ?? 0}; ${uiText(language, 'виріз')} ${g.innerHorizontal ?? g.innerCutWidth ?? 0}×${g.innerVertical ?? g.innerCutDepth ?? 0}`;
    case 'П-подібна':
      return `${g.outerWidth ?? g.width ?? 0}×${g.outerHeight ?? g.height ?? 0}; ${uiText(language, 'виріз')} ${g.innerCutWidth ?? 0}×${g.innerCutDepth ?? 0}`;
    default:
      return `${g.width ?? 0}×${g.height ?? 0}`;
  }
}

function detailMaterial(project: Project) {
  return project.slabs[0]?.material ? projectText(project, project.slabs[0].material) : '-';
}

function detailDecor(project: Project) {
  return project.slabs[0]?.decor || projectText(project, 'без декору');
}

function detailStatus(project: Project, parts: DetailPart[], detail: Detail) {
  const ids = parts.filter((part) => part.detailId === detail.id).map((part) => part.id);
  const placements = project.placements.filter((placement) => ids.includes(placement.partId));
  if (placements.some((placement) => placement.conflict)) return projectText(project, 'конфлікт');
  if (placements.some((placement) => placement.outOfBounds)) return projectText(project, 'поза слебом');
  if (ids.length && placements.length === ids.length) return projectText(project, 'розміщено');
  if (placements.length > 0) return projectText(project, 'частково');
  return projectText(project, 'нерозміщено');
}

function detailArea(parts: DetailPart[], detail: Detail) {
  return parts
    .filter((part) => part.detailId === detail.id)
    .reduce((sum, part) => sum + part.area, 0);
}

function sectionTitle(title: string, subtitle?: string) {
  return [
    text(PAGE_MARGIN, PAGE_TITLE_Y, title, 32, '#173049', 700),
    subtitle ? text(PAGE_MARGIN, PAGE_TITLE_Y + 34, subtitle, 18, '#617789') : '',
  ].join('');
}

function renderTitlePage(project: Project, parts: DetailPart[], options: PdfExportOptions, size: PageSize) {
  const totalArea = calculateTotalArea(parts);
  const materials = uniqueText(project.slabs.map((slab) => projectText(project, slab.material)));
  const decors = uniqueText(project.slabs.map((slab) => slab.decor || projectText(project, 'без декору')));
  const detailCount = project.details.reduce((sum, detail) => sum + detail.quantity, 0);
  const rows = [
    [projectText(project, 'Номер замовлення'), project.orderNumber || projectText(project, 'без номера')],
    [projectText(project, 'Контрагент'), project.customer || '-'],
    [projectText(project, 'Автор розкрою'), options.author || '-'],
    [projectText(project, 'Дата створення'), formatDate(project.versions[0]?.timestamp ?? project.updatedAt, project.uiLanguage)],
    [projectText(project, 'Дата експорту'), formatDate(new Date().toISOString(), project.uiLanguage)],
    [projectText(project, 'Загальний статус'), getStatusLabel(project.calculationStatus, project.uiLanguage)],
    [projectText(project, 'Матеріали'), materials],
    [projectText(project, 'Декори'), decors],
    [projectText(project, 'Площа заготовок'), `${totalArea.toFixed(3)} ${unitText(project, 'м²')}`],
    [projectText(project, 'Кількість слебів'), project.slabs.length],
    [projectText(project, 'Кількість деталей'), detailCount],
  ];
  const cardX = PAGE_MARGIN;
  const cardY = 136;
  const cardW = size.widthPx - PAGE_MARGIN * 2;
  const rowH = 52;
  const body = [
    sectionTitle('SlabCutPlanner', projectText(project, 'Звіт попереднього розкрою')),
    `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${rows.length * rowH + 26}" rx="18" fill="#f3f8fb" stroke="#c6d6e1"/>`,
    ...rows.map(([label, value], index) => {
      const y = cardY + 26 + index * rowH;
      return [
        index > 0 ? `<line x1="${cardX + 22}" y1="${y}" x2="${cardX + cardW - 22}" y2="${y}" stroke="#d8e3eb"/>` : '',
        text(cardX + 28, y + 33, String(label), 20, '#617789', 600),
        text(cardX + Math.min(360, cardW * 0.33), y + 33, clampText(String(value), 82), 21, '#1f2d3a', 600),
      ].join('');
    }),
  ].join('');
  return pageSvg(size, body);
}

function compactTable(title: string, x: number, y: number, width: number, columns: string[], rows: string[][], maxRows: number, language?: Project['uiLanguage']) {
  const rowH = 28;
  const headerH = 30;
  const shown = rows.slice(0, maxRows);
  const colW = width / columns.length;
  return [
    text(x, y - 12, title, 20, '#173049', 700),
    `<rect x="${x}" y="${y}" width="${width}" height="${headerH}" rx="7" fill="#dfe8ee" stroke="#bdd0dd"/>`,
    ...columns.map((column, index) => text(x + index * colW + 8, y + 21, column, 13, '#28475d', 700)),
    ...shown.map((row, rowIndex) => {
      const rowY = y + headerH + rowIndex * rowH;
      return [
        `<rect x="${x}" y="${rowY}" width="${width}" height="${rowH}" fill="${rowIndex % 2 ? '#eef4f8' : '#f7fbfd'}" stroke="#d8e3eb"/>`,
        ...columns.map((_, columnIndex) => text(x + columnIndex * colW + 8, rowY + 19, clampText(row[columnIndex], Math.max(8, Math.floor(colW / 8))), 12, '#1f2d3a')),
      ].join('');
    }),
    rows.length > shown.length ? text(x + 8, y + headerH + shown.length * rowH + 22, `${uiText(language, 'Ще')} ${rows.length - shown.length} ${uiText(language, 'рядків у повному списку')}`, 13, '#617789') : '',
  ].join('');
}

function renderOverviewPage(project: Project, parts: DetailPart[], options: PdfExportOptions, size: PageSize) {
  const totalArea = calculateTotalArea(parts);
  const detailsRows = project.details.map((detail, index) => [
    detailName(detail, index, project.uiLanguage),
    projectText(project, detail.type),
    String(detail.quantity),
    detailDimensions(detail, project.uiLanguage),
    detailStatus(project, parts, detail),
  ]);
  const unplacedRows = project.unplacedPartIds
    .map((id) => parts.find((part) => part.id === id))
    .filter(Boolean)
    .map((part) => [partParentLabel(project, part!), projectText(project, part!.type), part!.dimsLabel]);
  const summaryRows = [
    [projectText(project, 'Замовлення'), project.orderNumber || projectText(project, 'без номера')],
    [projectText(project, 'Контрагент'), project.customer || '-'],
    [projectText(project, 'Автор'), options.author || '-'],
    [projectText(project, 'Експорт'), formatDate(new Date().toISOString(), project.uiLanguage)],
    [projectText(project, 'Статус'), getStatusLabel(project.calculationStatus, project.uiLanguage)],
    [projectText(project, 'Матеріали'), uniqueText(project.slabs.map((slab) => projectText(project, slab.material)))],
    [projectText(project, 'Декори'), uniqueText(project.slabs.map((slab) => slab.decor || projectText(project, 'без декору')))],
    [projectText(project, 'Площа'), `${totalArea.toFixed(3)} ${unitText(project, 'м²')}`],
    [projectText(project, 'Слебів'), String(project.slabs.length)],
    [projectText(project, 'Деталей'), String(project.details.reduce((sum, detail) => sum + detail.quantity, 0))],
  ];
  const contentW = size.widthPx - PAGE_MARGIN * 2;
  const summaryY = 112;
  const summaryH = 164;
  const rowW = contentW / 2;
  const detailsY = summaryY + summaryH + 58;
  const showUnplaced = options.includeUnplaced;
  const detailsTableH = showUnplaced ? Math.floor((size.heightPx - detailsY - PAGE_MARGIN - 62) * 0.58) : size.heightPx - detailsY - PAGE_MARGIN;
  const detailsMax = options.includeDetails ? Math.max(3, Math.floor((detailsTableH - 30) / 28)) : 0;
  const unplacedY = detailsY + (options.includeDetails ? detailsMax * 28 + 74 : 0);
  const unplacedMax = showUnplaced ? Math.max(2, Math.floor((size.heightPx - unplacedY - PAGE_MARGIN - 30) / 28)) : 0;
  const body = [
    sectionTitle('SlabCutPlanner', projectText(project, 'Зведення розкрою')),
    `<rect x="${PAGE_MARGIN}" y="${summaryY}" width="${contentW}" height="${summaryH}" rx="16" fill="#f3f8fb" stroke="#c6d6e1"/>`,
    ...summaryRows.map(([label, value], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = PAGE_MARGIN + col * rowW + 18;
      const y = summaryY + 34 + row * 28;
      return [
        text(x, y, label, 14, '#617789', 600),
        text(x + 112, y, clampText(value, 44), 15, '#1f2d3a', 700),
      ].join('');
    }),
    options.includeDetails ? compactTable(projectText(project, 'Загальний список деталей'), PAGE_MARGIN, detailsY, contentW, [projectText(project, 'Назва'), projectText(project, 'Тип'), projectText(project, 'К-сть'), projectText(project, 'Габарити'), projectText(project, 'Статус')], detailsRows, detailsMax, project.uiLanguage) : '',
    showUnplaced ? compactTable(projectText(project, 'Список нерозміщених деталей'), PAGE_MARGIN, unplacedY, contentW, [projectText(project, 'Назва'), projectText(project, 'Тип'), projectText(project, 'Габарити')], unplacedRows.length ? unplacedRows : [[projectText(project, 'Нерозміщених деталей немає'), '-', '-']], unplacedMax, project.uiLanguage) : '',
  ].join('');
  return {
    svg: pageSvg(size, body),
    detailsIncluded: !options.includeDetails || detailsRows.length <= detailsMax,
    unplacedIncluded: !showUnplaced || unplacedRows.length <= unplacedMax,
  };
}

function tablePage(
  size: PageSize,
  title: string,
  subtitle: string,
  columns: Array<{ label: string; width: number }>,
  rows: string[][],
) {
  const tableX = PAGE_MARGIN;
  const tableY = 126;
  const rowH = 38;
  const headerH = 42;
  const tableW = size.widthPx - PAGE_MARGIN * 2;
  const scale = tableW / columns.reduce((sum, column) => sum + column.width, 0);
  let x = tableX;
  const header = [
    `<rect class="table-head" x="${tableX}" y="${tableY}" width="${tableW}" height="${headerH}" rx="8"/>`,
    ...columns.map((column) => {
      const cell = text(x + 10, tableY + 27, column.label, 15, '#28475d', 700);
      x += column.width * scale;
      return cell;
    }),
  ].join('');
  const bodyRows = rows.map((row, rowIndex) => {
    const y = tableY + headerH + rowIndex * rowH;
    let cellX = tableX;
    return [
      `<rect class="${rowIndex % 2 ? 'table-row-alt' : 'table-row'}" x="${tableX}" y="${y}" width="${tableW}" height="${rowH}"/>`,
      ...columns.map((column, columnIndex) => {
        const cellW = column.width * scale;
        const maxChars = Math.max(7, Math.floor(cellW / 8.6));
        const cell = text(cellX + 10, y + 25, clampText(row[columnIndex], maxChars), 14, '#1f2d3a');
        cellX += cellW;
        return cell;
      }),
    ].join('');
  }).join('');
  return pageSvg(size, [sectionTitle(title, subtitle), header, bodyRows].join(''));
}

function renderDetailsPages(project: Project, parts: DetailPart[], options: PdfExportOptions, size: PageSize) {
  const columns = [
    { label: projectText(project, 'Назва'), width: 210 },
    { label: projectText(project, 'Тип'), width: 120 },
    { label: projectText(project, 'Форма'), width: 120 },
    { label: projectText(project, 'К-сть'), width: 56 },
    { label: projectText(project, 'Матеріал'), width: 130 },
    { label: projectText(project, 'Декор'), width: 130 },
    { label: projectText(project, 'Товщ.'), width: 58 },
    { label: projectText(project, 'Габарити'), width: 160 },
    { label: projectText(project, 'Площа'), width: 76 },
    { label: projectText(project, 'Статус'), width: 92 },
    { label: projectText(project, 'Коментар'), width: 150 },
  ];
  const rows = project.details.map((detail, index) => [
    detailName(detail, index, project.uiLanguage),
    projectText(project, detail.type),
    projectText(project, detail.shape),
    String(detail.quantity),
    detailMaterial(project),
    detailDecor(project),
    `${detail.thickness} ${unitText(project, 'мм')}`,
    detailDimensions(detail, project.uiLanguage),
    `${detailArea(parts, detail).toFixed(3)} ${unitText(project, 'м²')}`,
    detailStatus(project, parts, detail),
    options.includeComments ? '-' : '',
  ]);
  const rowsPerPage = Math.max(8, Math.floor((size.heightPx - 214) / 38));
  const pages: string[] = [];
  for (let i = 0; i < rows.length; i += rowsPerPage) {
    const pageRows = rows.slice(i, i + rowsPerPage);
    pages.push(tablePage(size, projectText(project, 'Загальний список деталей'), `${projectText(project, 'Сторінка')} ${Math.floor(i / rowsPerPage) + 1}`, columns, pageRows));
  }
  if (!pages.length) pages.push(tablePage(size, projectText(project, 'Загальний список деталей'), projectText(project, 'Деталі не додані'), columns, []));
  return pages;
}

function renderUnplacedPages(project: Project, parts: DetailPart[], size: PageSize) {
  const columns = [
    { label: '№', width: 50 },
    { label: projectText(project, 'Назва'), width: 310 },
    { label: projectText(project, 'Тип'), width: 170 },
    { label: projectText(project, 'Форма'), width: 160 },
    { label: projectText(project, 'Габарити'), width: 160 },
    { label: projectText(project, 'Статус'), width: 150 },
  ];
  const unplaced = project.unplacedPartIds
    .map((id) => parts.find((part) => part.id === id))
    .filter(Boolean) as DetailPart[];
  if (!unplaced.length) {
    return [
      pageSvg(size, [
        sectionTitle(projectText(project, 'Список нерозміщених деталей')),
        `<rect x="${PAGE_MARGIN}" y="146" width="${size.widthPx - PAGE_MARGIN * 2}" height="120" rx="16" fill="#f3f8fb" stroke="#c6d6e1"/>`,
        text(PAGE_MARGIN + 30, 214, projectText(project, 'Нерозміщених деталей немає.'), 24, '#1f2d3a', 600),
      ].join('')),
    ];
  }
  const rows = unplaced.map((part, index) => [
    String(index + 1),
    partParentLabel(project, part),
    projectText(project, part.type),
    projectText(project, part.shape),
    part.dimsLabel,
    projectText(project, 'нерозміщено'),
  ]);
  const rowsPerPage = Math.max(8, Math.floor((size.heightPx - 214) / 38));
  const pages: string[] = [];
  for (let i = 0; i < rows.length; i += rowsPerPage) {
    pages.push(tablePage(size, projectText(project, 'Список нерозміщених деталей'), `${projectText(project, 'Сторінка')} ${Math.floor(i / rowsPerPage) + 1}`, columns, rows.slice(i, i + rowsPerPage)));
  }
  return pages;
}

function photoTransform(slab: SlabInstance, x: number, y: number, scale: number) {
  if (!slab.textureTransform.rotation) return '';
  const cx = x + (slab.width * scale) / 2;
  const cy = y + (slab.height * scale) / 2;
  return ` transform="rotate(${slab.textureTransform.rotation} ${cx} ${cy})"`;
}

function defectSvg(defect: SlabInstance['defects'][number], x: number, y: number, scale: number) {
  const common = 'fill="rgba(214,40,40,0.18)" stroke="#d62828" stroke-width="2"';
  if ((defect.shapeType === 'polygon' || defect.shapeType === 'triangle') && defect.points?.length) {
    return `<polygon points="${pointString(defect.points, scale, x, y)}" ${common}/>`;
  }
  if (defect.shapeType === 'circle') {
    return `<ellipse cx="${x + (defect.x + defect.width / 2) * scale}" cy="${y + (defect.y + defect.height / 2) * scale}" rx="${(defect.width / 2) * scale}" ry="${(defect.height / 2) * scale}" ${common}/>`;
  }
  return `<rect x="${x + defect.x * scale}" y="${y + defect.y * scale}" width="${defect.width * scale}" height="${defect.height * scale}" rx="4" ${common}/>`;
}

function edgeProfileSvg(
  part: DetailPart,
  detail: Detail | undefined,
  rotation: Rotation,
  scale: number,
  offsetX = 0,
  offsetY = 0,
  baseX = 0,
  baseY = 0,
) {
  const markers = edgeMarkersForPart(part, detail?.edgeProfiles, rotation);
  if (!markers.length) return '';
  return markers.map((marker) => {
    const x1 = offsetX + (baseX + marker.start.x) * scale;
    const y1 = offsetY + (baseY + marker.start.y) * scale;
    const x2 = offsetX + (baseX + marker.end.x) * scale;
    const y2 = offsetY + (baseY + marker.end.y) * scale;
    const labelX = offsetX + (baseX + marker.labelPoint.x) * scale;
    const labelY = offsetY + (baseY + marker.labelPoint.y) * scale - 4;
    return [
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1f5f87" stroke-width="1.4" stroke-dasharray="8 5"/>`,
      text(labelX, labelY, edgeProfileShortLabel(marker.profile), 10, '#1f5f87', 700, 'middle'),
    ].join('');
  }).join('');
}

function renderSlabBoard(
  project: Project,
  parts: DetailPart[],
  slab: SlabInstance,
  mode: PdfSlabMode,
  options: PdfExportOptions,
  slot: Slot,
  boardScale: number,
  boardIndex: number,
) {
  const boardW = slab.width * boardScale;
  const boardH = slab.height * boardScale;
  const boardX = slot.x + (slot.width - boardW) / 2;
  const boardY = slot.y + 38 + Math.max(0, (slot.height - 46 - boardH) / 2);
  const clipId = `slab_clip_${slab.id}_${mode}_${boardIndex}`.replace(/[^a-zA-Z0-9_]/g, '_');
  const placements = project.placements.filter((placement) => placement.slabId === slab.id);
  const photo = slab.photo && mode !== 'technical'
    ? `<image href="${escapeXml(slab.photo)}" x="${boardX + slab.textureTransform.offsetX * boardScale}" y="${boardY + slab.textureTransform.offsetY * boardScale}" width="${slab.width * boardScale * slab.textureTransform.scale}" height="${slab.height * boardScale * slab.textureTransform.scale}" opacity="${slab.textureTransform.opacity}" preserveAspectRatio="none"${photoTransform(slab, boardX, boardY, boardScale)}/>`
    : '';
  const details = placements.map((placement) => {
    const part = parts.find((candidate) => candidate.id === placement.partId);
    if (!part) return '';
    const poly = placementPolygon(part, placement);
    const bounds = pointsBounds(poly);
    const cx = boardX + ((bounds.minX + bounds.maxX) / 2) * boardScale;
    const cy = boardY + ((bounds.minY + bounds.maxY) / 2) * boardScale;
    const stroke = placement.conflict ? '#d62828' : placement.outOfBounds ? '#c46a12' : '#244d68';
    const fill = mode === 'technical' ? 'rgba(114,147,171,0.30)' : mode === 'texture' ? 'rgba(20,58,83,0.24)' : 'rgba(255,255,255,0.10)';
    const labelSize = Math.max(8, Math.min(16, Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * boardScale / 6));
    const holes = placementHoles(part, placement);
    const detail = project.details.find((item) => item.id === part.detailId);
    const outline = holes.length
      ? `<path d="${pathFromPolygons([poly, ...holes], boardScale, boardX, boardY)}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="2"/>`
      : `<polygon points="${pointString(poly, boardScale, boardX, boardY)}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    return [
      outline,
      edgeProfileSvg(part, detail, placement.rotation, boardScale, boardX, boardY, placement.x, placement.y),
      textMiddle(cx, cy - labelSize * 0.35, partParentLabel(project, part), labelSize, '#102536', 700, 'middle'),
      options.showDimensions ? textMiddle(cx, cy + labelSize * 0.85, part.dimsLabel, Math.max(7, labelSize * 0.78), '#102536', 700, 'middle') : '',
    ].join('');
  }).join('');
  const defects = options.includeDefects ? slab.defects.map((defect) => defectSvg(defect, boardX, boardY, boardScale)).join('') : '';
  const margin = slab.minMargin > 0
    ? `<rect x="${boardX + slab.minMargin * boardScale}" y="${boardY + slab.minMargin * boardScale}" width="${(slab.width - slab.minMargin * 2) * boardScale}" height="${(slab.height - slab.minMargin * 2) * boardScale}" fill="none" stroke="#8ca6b8" stroke-dasharray="8 6" stroke-width="1.5"/>`
    : '';
  const comment = options.includeComments && slab.comment
    ? text(slot.x + 8, slot.y + slot.height - 8, clampText(`${projectText(project, 'Коментар')}: ${slab.comment}`, 90), 14, '#617789')
    : '';

  return [
    text(slot.x + 8, slot.y + 20, `${slab.serialNumber} · ${projectText(project, slab.material)} · ${slab.decor || projectText(project, 'без декору')} · ${slab.width}×${slab.height} ${unitText(project, 'мм')}`, 16, '#173049', 700),
    `<defs><clipPath id="${clipId}"><rect x="${boardX}" y="${boardY}" width="${boardW}" height="${boardH}"/></clipPath></defs>`,
    `<rect x="${boardX}" y="${boardY}" width="${boardW}" height="${boardH}" fill="#f3f7fa" stroke="#7f98ad" stroke-width="2"/>`,
    `<g clip-path="url(#${clipId})">${photo}</g>`,
    margin,
    details,
    defects,
    comment,
  ].join('');
}

function slabsPerPage(options: PdfExportOptions) {
  if (options.slabLayout === 'one') return 1;
  if (options.slabLayout === 'two') return 2;
  if (options.slabLayout === 'multi') return 4;
  if (options.format === 'a3') return 4;
  return options.orientation === 'landscape' ? 2 : 1;
}

function scaleFactor(options: PdfExportOptions) {
  if (options.scaleMode === '100') return 1;
  if (options.scaleMode === '75') return 0.75;
  if (options.scaleMode === '50') return 0.5;
  return 1;
}

function makeSlots(count: number, size: PageSize) {
  const top = 116;
  const contentW = size.widthPx - PAGE_MARGIN * 2;
  const contentH = size.heightPx - top - PAGE_MARGIN;
  const columns = size.widthPx < size.heightPx ? 1 : count <= 1 ? 1 : 2;
  const rows = Math.ceil(count / columns);
  const gap = 28;
  const slotW = (contentW - gap * (columns - 1)) / columns;
  const slotH = (contentH - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => ({
    x: PAGE_MARGIN + (index % columns) * (slotW + gap),
    y: top + Math.floor(index / columns) * (slotH + gap),
    width: slotW,
    height: slotH,
  }));
}

function renderSlabPages(project: Project, parts: DetailPart[], options: PdfExportOptions, size: PageSize, mode: PdfSlabMode) {
  const perPage = slabsPerPage(options);
  const pages: string[] = [];
  const modeLabel = mode === 'technical' ? projectText(project, 'Технічний режим') : mode === 'photo' ? projectText(project, 'Фото-режим') : projectText(project, 'Текстурний режим');
  for (let i = 0; i < project.slabs.length; i += perPage) {
    const chunk = project.slabs.slice(i, i + perPage);
    const slots = makeSlots(chunk.length, size);
    const minSlotW = Math.min(...slots.map((slot) => slot.width - 20));
    const minSlotH = Math.min(...slots.map((slot) => slot.height - 64));
    const maxSlabW = Math.max(...chunk.map((slab) => slab.width));
    const maxSlabH = Math.max(...chunk.map((slab) => slab.height));
    const autoScale = Math.min(minSlotW / maxSlabW, minSlotH / maxSlabH);
    const boardScale = Math.max(0.035, autoScale * scaleFactor(options));
    const body = [
      sectionTitle(modeLabel, `${project.orderNumber || projectText(project, 'без номера')} · ${projectText(project, 'сліби')} ${i + 1}-${i + chunk.length}`),
      ...chunk.map((slab, index) => renderSlabBoard(project, parts, slab, mode, options, slots[index], boardScale, i + index)),
    ].join('');
    pages.push(pageSvg(size, body));
  }
  return pages;
}

function findPart(layout: TextureLayout, parts: DetailPart[]) {
  return parts.find((part) => part.id === layout.partId);
}

function findMainLayout(part: DetailPart, layouts: TextureLayout[], parts: DetailPart[]) {
  return layouts.find((layout) => {
    const candidate = findPart(layout, parts);
    return candidate?.isMain && candidate.detailId === part.detailId && candidate.parentLabel === part.parentLabel;
  });
}

function findEdgeThickness(part: DetailPart, parts: DetailPart[]) {
  const thickening = parts.find((candidate) => (
    candidate.detailId === part.detailId
    && candidate.parentLabel === part.parentLabel
    && candidate.edgeSide === part.edgeSide
    && candidate.edgeKind === 'thickening'
  ));
  if (!thickening) return 0;
  const size = rotatedSize(thickening, 0);
  return ['B', 'D', 'F', 'H'].includes(part.edgeSide ?? '') ? size.height : size.width;
}

function sideSegment(part: DetailPart, side: string | undefined, rotation: Rotation) {
  if (!side) return undefined;
  const segmentIndexes: Record<string, Partial<Record<string, number>>> = {
    'Прямокутна': { B: 0, C: 1, D: 2, A: 3 },
    'Г-подібна': { B: 0, C: 1, D: 2, E: 3, F: 4, A: 5 },
    'П-подібна': { B: 0, C: 1, D: 2, E: 3, F: 4, G: 5, H: 6, A: 7 },
  };
  const index = segmentIndexes[part.shape]?.[side];
  if (index === undefined || !part.points[index]) return undefined;
  const rotated = rotatedPoints(part, rotation);
  return { start: rotated[index], end: rotated[(index + 1) % rotated.length] };
}

function pointOnSegment(point: Point, a: Point, b: Point, epsilon = 0.001) {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > epsilon) return false;
  return (
    point.x >= Math.min(a.x, b.x) - epsilon
    && point.x <= Math.max(a.x, b.x) + epsilon
    && point.y >= Math.min(a.y, b.y) - epsilon
    && point.y <= Math.max(a.y, b.y) + epsilon
  );
}

function pointInPolygon(point: Point, polygon: Point[]) {
  if (polygon.some((current, index) => pointOnSegment(point, current, polygon[(index + 1) % polygon.length]))) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

function outwardNormal(segment: { start: Point; end: Point }, polygon: Point[]) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const midpoint = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
  const candidates = [
    { x: -dy / length, y: dx / length },
    { x: dy / length, y: -dx / length },
  ];
  return candidates.find((normal) => !pointInPolygon({ x: midpoint.x + normal.x * 8, y: midpoint.y + normal.y * 8 }, polygon)) ?? candidates[0];
}

function rotateVector(point: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 90: return { x: -point.y, y: point.x };
    case 180: return { x: -point.x, y: -point.y };
    case 270: return { x: point.y, y: -point.x };
    default: return point;
  }
}

function curvedSideDirection(side: string | undefined, rotation: Rotation) {
  const directions: Record<string, Point> = {
    A: { x: -1, y: -1 },
    B: { x: 1, y: -1 },
    C: { x: 1, y: 1 },
    D: { x: -1, y: 1 },
  };
  const direction = side ? directions[side] : undefined;
  return direction ? rotateVector(direction, rotation) : undefined;
}

function curvedEdgeOffset(part: DetailPart, parts: DetailPart[], rotation: Rotation) {
  if (part.edgeKind !== 'fold') return { width: 0, height: 0 };
  const thickening = parts.find((candidate) => (
    candidate.detailId === part.detailId
    && candidate.parentLabel === part.parentLabel
    && candidate.edgeSide === part.edgeSide
    && candidate.edgeKind === 'thickening'
  ));
  return thickening ? rotatedSize(thickening, rotation) : { width: 0, height: 0 };
}

function attachedCurvedPosition(layout: TextureLayout, part: DetailPart, mainLayout: TextureLayout, mainPart: DetailPart, parts: DetailPart[]) {
  const direction = curvedSideDirection(part.edgeSide, mainLayout.rotation);
  if (!direction) return { displayX: layout.x, displayY: layout.y };
  const mainSize = rotatedSize(mainPart, mainLayout.rotation);
  const itemSize = rotatedSize(part, layout.rotation);
  const offset = curvedEdgeOffset(part, parts, layout.rotation);
  return {
    displayX: direction.x < 0
      ? mainLayout.x - offset.width - itemSize.width
      : mainLayout.x + mainSize.width + offset.width,
    displayY: direction.y < 0
      ? mainLayout.y - offset.height - itemSize.height
      : mainLayout.y + mainSize.height + offset.height,
  };
}

function attachedDisplayPosition(layout: TextureLayout, part: DetailPart, layouts: TextureLayout[], parts: DetailPart[]) {
  if (part.isMain || !part.edgeSide) return { displayX: layout.x, displayY: layout.y };

  const mainLayout = findMainLayout(part, layouts, parts);
  const mainPart = mainLayout ? findPart(mainLayout, parts) : undefined;
  if (!mainLayout || !mainPart) return { displayX: layout.x, displayY: layout.y };

  const itemSize = rotatedSize(part, layout.rotation);
  const outsideOffset = part.edgeKind === 'fold' ? findEdgeThickness(part, parts) : 0;
  const segment = sideSegment(mainPart, part.edgeSide, mainLayout.rotation);
  if (!segment) return attachedCurvedPosition(layout, part, mainLayout, mainPart, parts);
  const normal = outwardNormal(segment, rotatedPoints(mainPart, mainLayout.rotation));
  const minX = Math.min(segment.start.x, segment.end.x);
  const maxX = Math.max(segment.start.x, segment.end.x);
  const minY = Math.min(segment.start.y, segment.end.y);
  const maxY = Math.max(segment.start.y, segment.end.y);
  const horizontal = Math.abs(segment.end.x - segment.start.x) >= Math.abs(segment.end.y - segment.start.y);
  return {
    displayX: horizontal
      ? mainLayout.x + minX + ((maxX - minX) - itemSize.width) / 2
      : normal.x < 0 ? mainLayout.x + minX - outsideOffset - itemSize.width : mainLayout.x + maxX + outsideOffset,
    displayY: horizontal
      ? normal.y < 0 ? mainLayout.y + minY - outsideOffset - itemSize.height : mainLayout.y + maxY + outsideOffset
      : mainLayout.y + minY + ((maxY - minY) - itemSize.height) / 2,
  };
}

import { textureCoordinateMatrix } from '../lib/textureMatrix';

function getSourceX(layout: TextureLayout) {
  return layout.sourceX ?? layout.x;
}

function getSourceY(layout: TextureLayout) {
  return layout.sourceY ?? layout.y;
}

function getSourceRotation(layout: TextureLayout): Rotation {
  return layout.sourceRotation ?? layout.rotation;
}

function getTextureItems(project: Project, parts: DetailPart[], includeIrrelevant = false) {
  return project.textureLayouts
    .map((layout) => {
      const part = findPart(layout, parts);
      if (!part || (!includeIrrelevant && part.textureIrrelevant)) return undefined;
      const position = attachedDisplayPosition(layout, part, project.textureLayouts, parts);
      return {
        layout,
        part,
        slab: project.slabs.find((slab) => slab.id === layout.slabId),
        ...position,
      };
    })
    .filter(Boolean) as TextureItem[];
}

function textureBox(item: TextureItem) {
  const size = rotatedSize(item.part, item.layout.rotation);
  return { x: item.displayX, y: item.displayY, width: size.width, height: size.height };
}

function frameIntersectsItem(frame: TextureFrame, item: TextureItem) {
  const box = textureBox(item);
  return box.x < frame.x + frame.width
    && box.x + box.width > frame.x
    && box.y < frame.y + frame.height
    && box.y + box.height > frame.y;
}

function textureBoxesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, gap = 18) {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

function resolveTextureOverlaps(items: TextureItem[]) {
  const groups = new Map<string, { items: TextureItem[]; index: number }>();
  items.forEach((item, index) => {
    const key = `${item.part.detailId}:${item.part.parentLabel}`;
    const group = groups.get(key) ?? { items: [], index };
    group.items.push(item);
    groups.set(key, group);
  });
  const placed: ReturnType<typeof textureBox>[] = [];
  const shifts = new Map<string, { x: number; y: number }>();
  [...groups.entries()].sort((a, b) => a[1].index - b[1].index).forEach(([key, group]) => {
    const boxes = group.items.map(textureBox);
    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.width));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height));
    const groupBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    const shiftX = groupBox.x < 0 ? Math.abs(groupBox.x) + 20 : 0;
    let shiftY = 0;
    let candidate = { ...groupBox, x: groupBox.x + shiftX };
    for (let guard = 0; guard < 80 && placed.some((box) => textureBoxesOverlap(candidate, box)); guard += 1) {
      const blocker = placed.find((box) => textureBoxesOverlap(candidate, box));
      shiftY = blocker ? blocker.y + blocker.height + 22 - groupBox.y : shiftY + 40;
      candidate = { ...groupBox, x: groupBox.x + shiftX, y: groupBox.y + shiftY };
    }
    shifts.set(key, { x: shiftX, y: shiftY });
    placed.push(candidate);
  });
  return items.map((item) => {
    const shift = shifts.get(`${item.part.detailId}:${item.part.parentLabel}`) ?? { x: 0, y: 0 };
    return shift.x || shift.y ? { ...item, displayX: item.displayX + shift.x, displayY: item.displayY + shift.y } : item;
  });
}

function textureItemSvg(project: Project, item: TextureItem, scale: number, offsetX: number, offsetY: number, index: number) {
  const { layout, part, slab, displayX, displayY } = item;
  const x = offsetX + displayX * scale;
  const y = offsetY + displayY * scale;
  const local = rotatedPoints(part, layout.rotation).map((point) => ({ x: point.x * scale, y: point.y * scale }));
  const holes = localHoles(part, layout.rotation).map((hole) => hole.map((point) => ({ x: point.x * scale, y: point.y * scale })));
  const size = rotatedSize(part, layout.rotation);
  const sourceX = getSourceX(layout);
  const sourceY = getSourceY(layout);
  const sourceRotation = getSourceRotation(layout);
  const clipId = `texture_pdf_clip_${layout.id}_${index}`.replace(/[^a-zA-Z0-9_]/g, '_');
  const matrix = textureCoordinateMatrix(part, sourceRotation, layout.rotation, scale);
  const textureRotation = slab?.textureTransform.rotation
    ? ` transform="rotate(${slab.textureTransform.rotation} ${(slab.width / 2 - sourceX) * scale} ${(slab.height / 2 - sourceY) * scale})"`
    : '';
  const image = slab?.photo
    ? `<g clip-path="url(#${clipId})"><g transform="${matrix}"><image href="${escapeXml(slab.photo)}" x="${(slab.textureTransform.offsetX - sourceX) * scale}" y="${(slab.textureTransform.offsetY - sourceY) * scale}" width="${slab.width * scale * slab.textureTransform.scale}" height="${slab.height * scale * slab.textureTransform.scale}" preserveAspectRatio="none" opacity="0.95"${textureRotation}/></g></g>`
    : holes.length
      ? `<path d="${pathFromPolygons([local, ...holes])}" fill="rgba(114,147,171,0.24)" fill-rule="evenodd"/>`
      : `<polygon points="${pointString(local)}" fill="rgba(114,147,171,0.24)"/>`;
  const clipShape = holes.length
    ? `<path d="${pathFromPolygons([local, ...holes])}" fill-rule="evenodd" clip-rule="evenodd"/>`
    : `<polygon points="${pointString(local)}"/>`;
  const outline = holes.length
    ? `<path d="${pathFromPolygons([local, ...holes])}" fill="rgba(255,255,255,0.08)" fill-rule="evenodd" stroke="#35556b" stroke-width="2"/>`
    : `<polygon points="${pointString(local)}" fill="rgba(255,255,255,0.08)" stroke="#35556b" stroke-width="2"/>`;
  const detail = project.details.find((item) => item.id === part.detailId);
  const edgeProfiles = edgeProfileSvg(part, detail, layout.rotation, scale);
  const label = part.isMain && (!part.textureGroupKind || part.textureGroupAnchor)
    ? [
      textMiddle((size.width * scale) / 2, (size.height * scale) / 2 - 8, partParentLabel(project, part), Math.max(12, Math.min(22, 12 * scale / 0.18)), '#102536', 700, 'middle'),
      textMiddle((size.width * scale) / 2, (size.height * scale) / 2 + 12, part.dimsLabel, Math.max(10, Math.min(18, 10 * scale / 0.18)), '#24475c', 700, 'middle'),
    ].join('')
    : '';
  return `<g transform="translate(${x}, ${y})">
    <defs><clipPath id="${clipId}">${clipShape}</clipPath></defs>
    ${image}
    ${outline}
    ${edgeProfiles}
    ${label}
  </g>`;
}

function renderTextureZonePage(project: Project, parts: DetailPart[], size: PageSize, frame?: TextureFrame) {
  const items = frame
    ? getTextureItems(project, parts, true).filter((item) => frameIntersectsItem(frame, item))
    : getTextureItems(project, parts);
  if (!project.textureSelectionEnabled || !items.length) {
    return pageSvg(size, [
      sectionTitle(projectText(project, 'Зона підбору текстури')),
      `<rect x="${PAGE_MARGIN}" y="146" width="${size.widthPx - PAGE_MARGIN * 2}" height="120" rx="16" fill="#f3f8fb" stroke="#c6d6e1"/>`,
      text(PAGE_MARGIN + 30, 214, projectText(project, 'Зона підбору текстури не містить деталей.'), 24, '#1f2d3a', 600),
    ].join(''));
  }
  const itemBounds = items.reduce((acc, item) => {
    const size = rotatedSize(item.part, item.layout.rotation);
    return {
      minX: Math.min(acc.minX, item.displayX),
      minY: Math.min(acc.minY, item.displayY),
      maxX: Math.max(acc.maxX, item.displayX + size.width),
      maxY: Math.max(acc.maxY, item.displayY + size.height),
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const bounds = frame
    ? { minX: frame.x, minY: frame.y, maxX: frame.x + frame.width, maxY: frame.y + frame.height }
    : itemBounds;
  const contentX = PAGE_MARGIN;
  const contentY = 126;
  const contentW = size.widthPx - PAGE_MARGIN * 2;
  const contentH = size.heightPx - contentY - PAGE_MARGIN;
  const layoutW = Math.max(1, bounds.maxX - bounds.minX);
  const layoutH = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(contentW / layoutW, contentH / layoutH) * 0.92;
  const offsetX = contentX + (contentW - layoutW * scale) / 2 - bounds.minX * scale;
  const offsetY = contentY + (contentH - layoutH * scale) / 2 - bounds.minY * scale;
  const clipId = frame ? `texture_frame_clip_${frame.id}`.replace(/[^a-zA-Z0-9_]/g, '_') : undefined;
  const body = [
    sectionTitle(projectText(project, 'Зона підбору текстури'), projectText(project, 'Фрагменти текстури з розміщених деталей')),
    `<rect x="${contentX}" y="${contentY}" width="${contentW}" height="${contentH}" rx="14" fill="#f8fbfd" stroke="#c6d6e1"/>`,
    clipId ? `<defs><clipPath id="${clipId}"><rect x="${contentX}" y="${contentY}" width="${contentW}" height="${contentH}" rx="14"/></clipPath></defs><g clip-path="url(#${clipId})">` : '',
    ...items.map((item, index) => textureItemSvg(project, item, scale, offsetX, offsetY, index)),
    clipId ? '</g>' : '',
  ].join('');
  return pageSvg(size, body);
}

function renderTextureZonePages(project: Project, parts: DetailPart[], size: PageSize) {
  const frames = project.textureFrames ?? [];
  const filledFrames = frames.length
    ? frames.filter((frame) => getTextureItems(project, parts, true).some((item) => frameIntersectsItem(frame, item)))
    : [];
  return frames.length
    ? filledFrames.map((frame) => renderTextureZonePage(project, parts, size, frame))
    : [renderTextureZonePage(project, parts, size)];
}

function render3dPhotosPages(project: Project, size: PageSize, snapshots: string[]) {
  if (!snapshots || snapshots.length === 0) {
    return [pageSvg(size, [
      sectionTitle(projectText(project, '3D-збірка')),
      `<rect x="${PAGE_MARGIN}" y="146" width="${size.widthPx - PAGE_MARGIN * 2}" height="140" rx="16" fill="#f3f8fb" stroke="#c6d6e1"/>`,
      text(PAGE_MARGIN + 30, 214, projectText(project, 'Помилка захоплення 3D. Перевірте збірку або перезавантажте сторінку.'), 24, '#1f2d3a', 600),
    ].join(''))];
  }

  const startY = 160;
  const contentHeight = size.heightPx - startY - PAGE_MARGIN;
  const contentWidth = size.widthPx - PAGE_MARGIN * 2;

  return snapshots.map((snap, index) => {
    const titleSvg = sectionTitle(projectText(project, '3D-збірка'));
    const imageSvg = `<image href="${snap}" x="${PAGE_MARGIN}" y="${startY}" width="${contentWidth}" height="${contentHeight}" preserveAspectRatio="xMidYMid meet" clip-path="url(#roundedClip)"/>`;
    
    return pageSvg(size, [
      titleSvg,
      `<defs>
        <clipPath id="roundedClip">
          <rect x="0" y="0" width="100%" height="100%" rx="16" />
        </clipPath>
      </defs>`,
      imageSvg
    ].join(''));
  });
}

function renderSlabSvg(project: Project, parts: DetailPart[], slab: SlabInstance, mode: 'technical' | 'photo'): string {
  const width = 1200;
  const scale = Math.min((width - 40) / slab.width, 700 / slab.height);
  const height = slab.height * scale + 40;
  const size = { widthMm: 0, heightMm: 0, widthPx: width, heightPx: height };
  const svg = [
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    renderSlabBoard(project, parts, slab, mode, { ...defaultPdfExportOptions, showDimensions: true }, { x: 20, y: -18, width: width - 40, height }, scale, 0),
  ].join('');
  return pageSvg(size, svg);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function svgStringToPngData(svg: string): Promise<string> {
  const img = await loadImage(svgToDataUrl(svg));
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function concatBytes(chunks: Uint8Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function dataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function zipStore(entries: Array<{ name: string; bytes: Uint8Array }>) {
  const encoder = new TextEncoder();
  const now = dosDateTime();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(now.time), ...u16(now.date),
      ...u32(crc), ...u32(entry.bytes.length), ...u32(entry.bytes.length), ...u16(name.length), ...u16(0), ...name,
    ]);
    const central = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(now.time), ...u16(now.date),
      ...u32(crc), ...u32(entry.bytes.length), ...u32(entry.bytes.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
    ]);
    localChunks.push(local, entry.bytes);
    centralChunks.push(central);
    offset += local.length + entry.bytes.length;
  });

  const central = concatBytes(centralChunks);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(central.length), ...u32(offset), ...u16(0),
  ]);
  return concatBytes([...localChunks, central, end]);
}

function safeFilePart(value: string, fallback: string) {
  const clean = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ');
  return clean || fallback;
}

function exportStamp(project: Project) {
  const createdAt = project.versions[0]?.timestamp ?? project.updatedAt;
  return new Date(createdAt).toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

function projectBaseName(project: Project) {
  return `${safeFilePart(project.orderNumber, 'без номера')}_${safeFilePart(project.customer, 'без контрагента')}_${exportStamp(project)}`;
}

function downloadBytes(filename: string, bytes: Uint8Array, type: string) {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy.buffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportProjectPng(project: Project, parts: DetailPart[]) {
  if (!project.slabs.length) return;
  const entries = await Promise.all(project.slabs.map(async (slab, index) => {
    const mode = slab.photo ? 'photo' : 'technical';
    const svg = renderSlabSvg(project, parts, slab, mode);
    const png = await svgStringToPngData(svg);
    const name = `${String(index + 1).padStart(2, '0')}_${safeFilePart(slab.serialNumber, `slab-${index + 1}`)}.png`;
    return { name, bytes: dataUrlBytes(png) };
  }));
  downloadBytes(`${projectBaseName(project)}_PNG.zip`, zipStore(entries), 'application/zip');
}

export async function exportProjectPdf(project: Project, parts: DetailPart[], options: PdfExportOptions = defaultPdfExportOptions, snapshots3D?: string[]) {
  const size = pageSize(options);
  const pages: string[] = [];

  if (options.includeTitle || options.includeDetails || options.includeUnplaced) {
    const overview = renderOverviewPage(project, parts, options, size);
    pages.push(overview.svg);
    if (options.includeDetails && !overview.detailsIncluded) pages.push(...renderDetailsPages(project, parts, options, size));
    if (options.includeUnplaced && !overview.unplacedIncluded) pages.push(...renderUnplacedPages(project, parts, size));
  }
  if (options.includeTechnical) pages.push(...renderSlabPages(project, parts, options, size, 'technical'));
  if (options.includePhoto) pages.push(...renderSlabPages(project, parts, options, size, 'photo'));
  if (options.includeTexture) pages.push(...renderSlabPages(project, parts, options, size, 'texture'));
  if (options.includeTextureZone && project.textureSelectionEnabled) pages.push(...renderTextureZonePages(project, parts, size));
  if (options.include3d) pages.push(render3dPlaceholderPage(project, size));
  if (!pages.length) pages.push(renderTitlePage(project, parts, options, size));

  const doc = new jsPDF({ orientation: options.orientation, unit: 'mm', format: options.format });
  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) doc.addPage(options.format, options.orientation);
    const png = await svgStringToPngData(pages[index]);
    doc.addImage(png, 'PNG', 0, 0, size.widthMm, size.heightMm);
  }
  doc.save(`${projectBaseName(project)}.pdf`);
}

