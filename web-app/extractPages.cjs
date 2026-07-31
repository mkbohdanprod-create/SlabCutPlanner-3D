const fs = require('fs');
const path = require('path');

const exportFile = path.join(__dirname, 'src/utils/export.ts');
const targetFile = path.join(__dirname, 'src/utils/export/pdfPages.ts');

const lines = fs.readFileSync(exportFile, 'utf8').split('\n');

const startIndex = lines.findIndex(line => line.startsWith('function detailMaterial(project: Project) {'));
const endIndex = lines.findIndex(line => line.startsWith('export async function exportProjectPng'));

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find start or end index');
  process.exit(1);
}

const pageLines = lines.slice(startIndex, endIndex);

const imports = `import type {
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

`;

const myExports = pageLines.join('\n')
  .replace('function renderTitlePage', 'export function renderTitlePage')
  .replace('function renderOverviewPage', 'export function renderOverviewPage')
  .replace('function renderDetailsPages', 'export function renderDetailsPages')
  .replace('function renderUnplacedPages', 'export function renderUnplacedPages')
  .replace('function renderSlabPages', 'export function renderSlabPages')
  .replace('function renderTextureZonePages', 'export function renderTextureZonePages')
  .replace('function render3dPhotosPages', 'export function render3dPhotosPages')
  .replace('function renderSlabSvg', 'export function renderSlabSvg');

fs.writeFileSync(targetFile, imports + myExports, 'utf8');

// Also update export.ts by removing the extracted lines and adding imports
const newExportLines = [
  ...lines.slice(0, startIndex),
  `import {
  renderTitlePage,
  renderOverviewPage,
  renderDetailsPages,
  renderUnplacedPages,
  renderSlabPages,
  renderTextureZonePages,
  render3dPhotosPages,
  renderSlabSvg
} from './export/pdfPages';
`,
  ...lines.slice(endIndex)
];

// wait, we also need to clean up unused imports from export.ts, but we can do that in a follow-up or using eslint.
fs.writeFileSync(exportFile, newExportLines.join('\n'), 'utf8');

console.log('Done extraction!');
