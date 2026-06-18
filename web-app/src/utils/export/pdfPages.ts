import type {
  Detail,
  DetailPart,
  Point,
  Project,
  Rotation,
  SlabInstance,
  TextureFrame,
} from '../../domain/types';
import { getStatusLabel, placementPolygon, pointString, rotatePoint, rotatedLocalPoints, rotatedPoints, rotatedSize } from '../../lib/project';
import { edgeMarkersForPart, edgeProfileShortLabel } from '../edgeProfiles';
import {
  attachedCurvedPosition,
  attachedDisplayPosition,
  curvedEdgeOffset,
  curvedSideDirection,
  findEdgeThickness,
  findMainLayout,
  findPart,
  frameIntersectsItem,
  getSourceRotation,
  getSourceX,
  getSourceY,
  getTextureItems,
  localHoles,
  outwardNormal,
  pathFromPolygons,
  placementHoles,
  pointInPolygon,
  pointOnSegment,
  pointsBounds,
  resolveTextureOverlaps,
  rotateVector,
  sideSegment,
  textureBox,
  textureBoxesOverlap,
} from './pdfGeometry';
import type {
  PageSize,
  PdfExportOptions,
  PdfSlabMode,
  Slot,
  TextureItem,
} from './pdfTypes';
import { defaultPdfExportOptions } from './pdfTypes';
import {
  PAGE_MARGIN,
  PAGE_TITLE_Y,
  calculateTotalArea,
  clampText,
  detailDimensions,
  detailName,
  escapeXml,
  formatDate,
  pageSvg,
  partParentLabel,
  projectText,
  text,
  textMiddle,
  uiText,
  uniqueText,
  unitText,
} from './pdfUtils';
import { textureCoordinateMatrix } from '../../lib/textureMatrix';

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

export function renderTitlePage(project: Project, parts: DetailPart[], options: PdfExportOptions, size: PageSize) {
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

export function renderOverviewPage(project: Project, parts: DetailPart[], options: PdfExportOptions, size: PageSize) {
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

export function renderDetailsPages(project: Project, parts: DetailPart[], options: PdfExportOptions, size: PageSize) {
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

export function renderUnplacedPages(project: Project, parts: DetailPart[], size: PageSize) {
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

export function renderSlabPages(project: Project, parts: DetailPart[], options: PdfExportOptions, size: PageSize, mode: PdfSlabMode) {
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

export function renderTextureZonePages(project: Project, parts: DetailPart[], size: PageSize) {
  const frames = project.textureFrames ?? [];
  const filledFrames = frames.length
    ? frames.filter((frame) => getTextureItems(project, parts, true).some((item) => frameIntersectsItem(frame, item)))
    : [];
  return frames.length
    ? filledFrames.map((frame) => renderTextureZonePage(project, parts, size, frame))
    : [renderTextureZonePage(project, parts, size)];
}

export function render3dPhotosPages(project: Project, size: PageSize, snapshots: string[]) {
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

export function renderSlabSvg(project: Project, parts: DetailPart[], slab: SlabInstance, mode: 'technical' | 'photo'): string {
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


