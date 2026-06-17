import React from 'react';
import type { ApprovalImportItem, ApprovalImportPreview } from '../../../utils/approvalImport';
import type { DxfPoint } from '../../../parsers/dxf';

export function approvalItemPoints(item: ApprovalImportItem): DxfPoint[] {
  if (item.customPoints?.length) return item.customPoints;
  return [];
}

export function approvalItemHasExtractedGeometry(item: ApprovalImportItem) {
  return item.importStatus !== 'Error'
    && item.geometrySource !== 'none'
    && item.shapeMode === 'customContour'
    && Boolean(item.customPoints?.length)
    && item.dimensions.length > 0
    && Boolean(item.debug.sourcePage)
    && Boolean(item.debug.sourceImageRegion);
}

export function approvalPreviewDebugDumpFromState(preview: ApprovalImportPreview): ApprovalImportPreview['debugDump'] {
  return {
    pipelineVersion: preview.pipelineVersion,
    approvalImportBuildId: preview.approvalImportBuildId,
    sourceFileName: preview.fileName,
    orderNumber: preview.orderNumber || null,
    customer: preview.customer || null,
    products: preview.items.map((item) => ({
      productNumber: item.sourceProductNumber,
      productName: item.name,
      sourcePage: item.debug.sourcePage ?? null,
      sourceImageRegion: item.debug.sourceImageRegion
        ? {
          x: item.debug.sourceImageRegion.x,
          y: item.debug.sourceImageRegion.y,
          width: item.debug.sourceImageRegion.width,
          height: item.debug.sourceImageRegion.height,
        }
        : null,
      detectedDimensions: item.dimensions.map((dimension) => ({
        label: dimension.side,
        valueMm: dimension.value,
        rawText: dimension.source,
      })),
      detectedSpecificationRows: item.rows.map((row) => ({
        side: row.side,
        type: row.elementType,
        height: row.height,
        width: row.width,
        form: row.profile,
      })),
      detectedGeometry: {
        source: item.geometrySource,
        outerContourPointsMm: item.customPoints ?? [],
        holesMm: item.customHoles ?? [],
        jointsMm: [],
        boundingBoxMm: { width: item.width, height: item.height },
      },
      finalDetail: {
        id: item.id,
        name: item.name,
        kind: item.type,
        shapeMode: item.shapeMode,
        widthMm: item.width,
        heightMm: item.height,
        contourPoints: item.customPoints ?? [],
        holes: item.customHoles ?? [],
        joints: [],
      },
      validation: {
        status: item.importStatus,
        warnings: item.warnings,
      },
      dimensionsSource: item.dimensionsSource,
      shapeMode: item.shapeMode,
      contourPointsCount: item.customPoints?.length ?? 0,
      finalImportAllowed: approvalItemHasExtractedGeometry(item),
      blockedReason: approvalItemHasExtractedGeometry(item)
        ? null
        : item.warnings.find((warning) => warning.includes('Geometry not extracted')) ?? 'No real contour extracted',
    })),
  };
}

export function approvalPreviewDebugSummary(preview: ApprovalImportPreview) {
  const lines = [
    `BuildId: ${preview.approvalImportBuildId}`,
    `Pipeline: ${preview.pipelineVersion}`,
    `File: ${preview.fileName}`,
  ];
  preview.items.forEach((item) => {
    lines.push(
      `Product ${item.sourceProductNumber}: ${item.name}`,
      `sourcePage: ${item.debug.sourcePage ?? 'null'}`,
      `sourceImageRegion: ${item.debug.sourceImageRegion ? JSON.stringify(item.debug.sourceImageRegion) : 'null'}`,
      `dimensions: ${item.dimensions.length ? item.dimensions.map((dimension) => `${dimension.side}=${dimension.value}`).join(', ') : '[]'}`,
      `geometrySource: ${item.geometrySource}`,
      `shapeMode: ${item.shapeMode}`,
      `width/height: ${Math.round(item.width)}x${Math.round(item.height)}`,
      `contourPointsCount: ${item.customPoints?.length ?? 0}`,
      `finalImportAllowed: ${approvalItemHasExtractedGeometry(item)}`,
      `blockedReason: ${approvalItemHasExtractedGeometry(item) ? 'null' : item.warnings.find((warning) => warning.includes('Geometry not extracted')) ?? 'No real contour extracted'}`,
      `validation: ${item.importStatus}`,
    );
  });
  return lines.join('\n');
}

export function ApprovalItemCrop({ item }: { item: ApprovalImportItem }) {
  if (!item.sourcePreview) return <span className="approval-error-text">Drawing crop was not found.</span>;
  const hasContour = Boolean(item.customPoints?.length);
  const viewWidth = hasContour
    ? Math.max(1, item.width, item.sourcePreview.x + item.sourcePreview.width)
    : Math.max(1, item.sourcePreview.width);
  const viewHeight = hasContour
    ? Math.max(1, item.height, item.sourcePreview.y + item.sourcePreview.height)
    : Math.max(1, item.sourcePreview.height);
  return (
    <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} aria-label="Crop креслення з PDF">
      <image
        href={item.sourcePreview.image}
        x={hasContour ? item.sourcePreview.x : 0}
        y={hasContour ? item.sourcePreview.y : 0}
        width={item.sourcePreview.width}
        height={item.sourcePreview.height}
        preserveAspectRatio="none"
      />
      {hasContour ? <path d={dxfSvgPath(approvalItemPoints(item), item.customHoles ?? [])} fillRule="evenodd" /> : null}
    </svg>
  );
}

export function ApprovalOverview({ items }: { items: ApprovalImportItem[] }) {
  const drawableItems = items.filter(approvalItemHasExtractedGeometry);
  const width = Math.max(1, ...drawableItems.map((item) => item.sourceX + item.width));
  const height = Math.max(1, ...drawableItems.map((item) => item.sourceY + item.height));
  const pad = Math.max(60, Math.max(width, height) * 0.04);
  return (
    <svg className="approval-overview" viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`} aria-label="Схема імпорту бланку погодження">
      {drawableItems.map((item) => (
        <g key={item.id} transform={`translate(${item.sourceX} ${item.sourceY})`}>
          {item.sourcePreview && (
            <image
              href={item.sourcePreview.image}
              x={item.sourcePreview.x}
              y={item.sourcePreview.y}
              width={item.sourcePreview.width}
              height={item.sourcePreview.height}
              opacity="0.28"
              preserveAspectRatio="none"
            />
          )}
          <path d={dxfSvgPath(approvalItemPoints(item), item.customHoles ?? [])} fillRule="evenodd" />
          <text x={item.width / 2} y={item.height / 2}>{item.name}</text>
          {item.importStatus !== 'OK' && <text className="approval-overview-note" x={item.width / 2} y={item.height / 2 - 24}>{item.importStatus}</text>}
          {Object.keys(item.edgeProfiles).length > 0 && <text className="approval-overview-note" x={item.width / 2} y={item.height / 2 + 22}>Кромки: {Object.keys(item.edgeProfiles).join(', ')}</text>}
          {item.thickening.sides.length > 0 && <text className="approval-overview-note" x={item.width / 2} y={item.height / 2 + 40}>Потовщення: {item.thickening.sides.join(', ')}</text>}
          {item.fold.sides.length > 0 && <text className="approval-overview-note" x={item.width / 2} y={item.height / 2 + 58}>Підворот: {item.fold.sides.join(', ')}</text>}
        </g>
      ))}
    </svg>
  );
}

