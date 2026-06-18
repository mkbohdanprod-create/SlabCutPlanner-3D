import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = process.cwd();
const tmpDir = path.join(root, '.tmp-approval-test');
const fixtureDir = path.join(root, 'test-fixtures', 'approval-forms');
const expectedPath = path.join(fixtureDir, 'expected-results.json');

async function rmTmp() {
  await fs.rm(tmpDir, { recursive: true, force: true });
}

async function patchCompiledImports(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await patchCompiledImports(filePath);
    } else if (entry.name.endsWith('.js')) {
      let text = await fs.readFile(filePath, 'utf8');
      text = text
        .replaceAll("'../domain/defaults'", "'../domain/defaults.js'")
        .replaceAll("'../domain/types'", "'../domain/types.js'");
      await fs.writeFile(filePath, text);
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function almostEqual(a, b, tolerance = 1) {
  return Math.abs(a - b) <= tolerance;
}

function normalizePoint(point) {
  return [Math.round(point.x), Math.round(point.y)];
}

function assertPolygon(actual, expected, label) {
  assert(actual?.length === expected.length, `${label}: expected ${expected.length} contour points, got ${actual?.length ?? 0}`);
  expected.forEach((expectedPoint, index) => {
    const actualPoint = normalizePoint(actual[index]);
    assert(
      almostEqual(actualPoint[0], expectedPoint[0]) && almostEqual(actualPoint[1], expectedPoint[1]),
      `${label}: point ${index} expected ${expectedPoint.join(',')}, got ${actualPoint.join(',')}`,
    );
  });
}

function assertSpecRows(rows, requiredRows, label) {
  for (const required of requiredRows ?? []) {
    const found = rows.find((row) => (
      (!required.side || row.side === required.side)
      && (!required.typeContains || `${row.elementType} ${row.profile}`.toLocaleLowerCase('uk-UA').includes(required.typeContains.toLocaleLowerCase('uk-UA')))
      && (!required.height || almostEqual(row.height, required.height))
      && (!required.width || almostEqual(row.width, required.width))
    ));
    assert(found, `${label}: missing spec row ${JSON.stringify(required)}`);
  }
}

function assertDimensions(dimensions, requiredDimensions, label) {
  for (const required of requiredDimensions ?? []) {
    const found = dimensions.find((dimension) => (
      dimension.label === required.label
      && almostEqual(dimension.valueMm, required.value)
    ));
    assert(found, `${label}: missing drawing dimension ${required.label}=${required.value}`);
  }
}

await patchCompiledImports(tmpDir);

const modulePath = path.join(tmpDir, 'utils', 'approvalImport.js');
const { parseApprovalFile, APPROVAL_IMPORT_PIPELINE_VERSION, APPROVAL_IMPORT_BUILD_ID } = await import(pathToFileURL(modulePath).href);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')).href;

const expected = JSON.parse(await fs.readFile(expectedPath, 'utf8'));
const results = [];

for (const [fileName, fileExpected] of Object.entries(expected)) {
  const filePath = path.join(fixtureDir, fileName);
  const buffer = await fs.readFile(filePath);
  const preview = await parseApprovalFile(new File([buffer], fileName, { type: 'application/pdf' }));
  assert(preview.pipelineVersion === APPROVAL_IMPORT_PIPELINE_VERSION, `${fileName}: parser did not return approval-import-v2`);
  assert(preview.debugDump.pipelineVersion === APPROVAL_IMPORT_PIPELINE_VERSION, `${fileName}: debug dump did not return approval-import-v2`);
  assert(preview.approvalImportBuildId === APPROVAL_IMPORT_BUILD_ID, `${fileName}: preview did not return current approval import build id`);
  assert(preview.debugDump.approvalImportBuildId === APPROVAL_IMPORT_BUILD_ID, `${fileName}: debug dump did not return current approval import build id`);
  assert(preview.items.length >= fileExpected.minimumProducts, `${fileName}: expected at least ${fileExpected.minimumProducts} products, got ${preview.items.length}`);

  if (fileExpected.requireNoTinySquares) {
    preview.items.forEach((item) => {
      assert(item.width >= 80 && item.height >= 80, `${fileName} product ${item.sourceProductNumber}: tiny-square fallback detected`);
    });
  }

  for (const [productNumber, productExpected] of Object.entries(fileExpected.products ?? {})) {
    const item = preview.items.find((candidate) => String(candidate.sourceProductNumber) === productNumber);
    const debugProduct = preview.debugDump.products.find((candidate) => String(candidate.productNumber) === productNumber);
    assert(item, `${fileName}: missing product ${productNumber}`);
    assert(debugProduct, `${fileName}: missing debug product ${productNumber}`);
    assert(item.pipelineVersion === APPROVAL_IMPORT_PIPELINE_VERSION, `${fileName} product ${productNumber}: missing item pipeline marker`);
    assert(item.shapeMode === productExpected.shapeMode, `${fileName} product ${productNumber}: expected shapeMode ${productExpected.shapeMode}, got ${item.shapeMode}`);
    assert(debugProduct.sourcePage !== null, `${fileName} product ${productNumber}: sourcePage was not detected`);
    assert(debugProduct.sourceImageRegion !== null, `${fileName} product ${productNumber}: sourceImageRegion was not detected`);
    assert(debugProduct.detectedDimensions.length > 0, `${fileName} product ${productNumber}: drawing dimensions were not detected`);
    assertDimensions(debugProduct.detectedDimensions, productExpected.requiredDimensions, `${fileName} product ${productNumber}`);
    assert(debugProduct.finalDetail.shapeMode === productExpected.shapeMode, `${fileName} product ${productNumber}: debug shapeMode expected ${productExpected.shapeMode}, got ${debugProduct.finalDetail.shapeMode}`);
    assert(debugProduct.finalDetail.contourPoints.length > 0, `${fileName} product ${productNumber}: final detail contour is empty`);
    assert(debugProduct.detectedGeometry.outerContourPointsMm.length > 0, `${fileName} product ${productNumber}: detected outer contour is empty`);
    assert(debugProduct.detectedGeometry.source === 'image-contour', `${fileName} product ${productNumber}: expected image-contour source, got ${debugProduct.detectedGeometry.source}`);
    assert(item.geometrySource !== 'manual-fallback' && item.geometrySource !== 'reconstructed', `${fileName} product ${productNumber}: old/manual fallback used`);
    assert(almostEqual(item.width, productExpected.width), `${fileName} product ${productNumber}: expected width ${productExpected.width}, got ${item.width}`);
    assert(almostEqual(item.height, productExpected.height), `${fileName} product ${productNumber}: expected height ${productExpected.height}, got ${item.height}`);
    assert(almostEqual(debugProduct.finalDetail.widthMm, productExpected.width), `${fileName} product ${productNumber}: debug width expected ${productExpected.width}, got ${debugProduct.finalDetail.widthMm}`);
    assert(almostEqual(debugProduct.finalDetail.heightMm, productExpected.height), `${fileName} product ${productNumber}: debug height expected ${productExpected.height}, got ${debugProduct.finalDetail.heightMm}`);
    assert(debugProduct.validation.status !== 'ERROR' && debugProduct.validation.status !== 'Error', `${fileName} product ${productNumber}: product is Error`);
    if (productExpected.polygon) assertPolygon(item.customPoints, productExpected.polygon, `${fileName} product ${productNumber}`);
    assertSpecRows(item.rows, productExpected.requiredSpecRows, `${fileName} product ${productNumber}`);
  }

  results.push({
    fileName,
    products: preview.items.length,
    pipelineVersion: preview.pipelineVersion,
    checkedProducts: Object.keys(fileExpected.products ?? {}),
  });
}

console.log(JSON.stringify({ status: 'OK', results }, null, 2));
await rmTmp();
