import type { DxfContour, DxfTextLabel, ParsedDxfFile, DxfPoint } from './types';
import { dxfBounds, dxfArea, dxfPointInPolygon, dxfIsClosed, dxfContour } from './geometry';
import { inferDxfEdgeProfile, inferDxfEdgeSide } from './inference';

function normalizeDxfLabel(value: string) {
  return value.replace(/\\P/gi, ' ').replace(/\{\\[^;]+;/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

function semanticDxfLabel(value: string) {
  return /(стільниц|мийк|фасад|плінтус|бортик|торець|потовщ|підклей|підвор|стін|панел|опор|кром|фаск|countertop|sink|facade|plinth|edge|fold|thicken|panel|chamfer|bullnose|sharknose|r2)/iu.test(value);
}

function likelyDimensionArrow(contour: DxfContour) {
  const vertices = dxfIsClosed(contour.points) ? contour.points.slice(0, -1) : contour.points;
  return vertices.length === 3 && contour.width <= 40 && contour.height <= 40 && contour.area <= 800;
}

function contourGap(a: ReturnType<typeof dxfBounds>, b: ReturnType<typeof dxfBounds>) {
  const dx = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
  const dy = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
  return Math.hypot(dx, dy);
}

function dxfEntityLayer(lines: string[], entityIndex: number) {
  for (let index = entityIndex + 1; index < lines.length; index += 2) {
    const code = lines[index];
    const value = lines[index + 1];
    if (!value || code === '0') break;
    if (code === '8') return value || '0';
  }
  return '0';
}

export { semanticDxfLabel };

export function parseDxfContours(text: string): ParsedDxfFile {
  const sourceLines = text.split(/\r?\n/).map((line) => line.trim());
  const entitiesIndex = sourceLines.findIndex((line) => line === 'ENTITIES');
  const entitiesEnd = entitiesIndex >= 0
    ? sourceLines.findIndex((line, index) => index > entitiesIndex && line === 'ENDSEC')
    : -1;
  const lines = entitiesIndex >= 0 && entitiesEnd > entitiesIndex
    ? sourceLines.slice(entitiesIndex + 1, entitiesEnd)
    : sourceLines;
  const contours: DxfContour[] = [];
  const labels: DxfTextLabel[] = [];
  const layers = new Set<string>();

  for (let i = 0; i < lines.length; i += 1) {
    const layer = dxfEntityLayer(lines, i);
    if (lines[i - 1] === '0') layers.add(layer);

    if (lines[i] === 'TEXT' || lines[i] === 'MTEXT') {
      const content: string[] = [];
      let x: number | undefined;
      let y: number | undefined;
      for (let j = i + 1; j < lines.length; j += 2) {
        const code = lines[j];
        const value = lines[j + 1];
        if (!value || code === '0') break;
        if (code === '1' || code === '3') content.push(value);
        if (code === '10') x = Number(value);
        if (code === '20') y = Number(value);
      }
      const label = normalizeDxfLabel(content.join(' '));
      if (label && semanticDxfLabel(label) && Number.isFinite(x) && Number.isFinite(y)) {
        labels.push({ text: label, point: { x: x as number, y: y as number }, layer });
      }
    }

    if (lines[i] === 'LWPOLYLINE') {
      const points: DxfPoint[] = [];
      let closed = false;
      for (let j = i + 1; j < lines.length; j += 2) {
        const code = lines[j];
        const value = lines[j + 1];
        if (!value || code === '0') break;
        if (code === '70') closed = (Number(value) & 1) === 1;
        if (code === '10') {
          const x = Number(value);
          let y: number | undefined;
          let bulge = 0;
          for (let k = j + 2; k < Math.min(lines.length, j + 12); k += 2) {
            if (lines[k] === '20') {
              y = Number(lines[k + 1]);
            }
            if (lines[k] === '42') bulge = Number(lines[k + 1]);
            if (lines[k] === '0' || lines[k] === '10') break;
          }
          if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y: y as number, bulge });
        }
      }
      const contour = (closed || dxfIsClosed(points)) ? dxfContour(points) : undefined;
      if (contour) contours.push({ ...contour, layer });
    }

    if (lines[i] === 'POLYLINE') {
      const points: DxfPoint[] = [];
      let closed = false;
      for (let j = i + 1; j < lines.length; j += 2) {
        const code = lines[j];
        const value = lines[j + 1];
        if (code === '0' && value === 'SEQEND') {
          i = j;
          break;
        }
        if (code === '70') closed = (Number(value) & 1) === 1;
        if (code === '0' && value === 'VERTEX') {
          let x: number | undefined;
          let y: number | undefined;
          let bulge = 0;
          for (let k = j + 2; k < lines.length; k += 2) {
            const vertexCode = lines[k];
            const vertexValue = lines[k + 1];
            if (vertexCode === '0') break;
            if (vertexCode === '10') x = Number(vertexValue);
            if (vertexCode === '20') y = Number(vertexValue);
            if (vertexCode === '42') bulge = Number(vertexValue);
          }
          if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x: x as number, y: y as number, bulge });
        }
      }
      const contour = (closed || dxfIsClosed(points)) ? dxfContour(points) : undefined;
      if (contour) contours.push({ ...contour, layer });
    }

    if (lines[i] === 'CIRCLE') {
      let cx: number | undefined;
      let cy: number | undefined;
      let radius: number | undefined;
      for (let j = i + 1; j < lines.length; j += 2) {
        const code = lines[j];
        const value = lines[j + 1];
        if (!value || code === '0') break;
        if (code === '10') cx = Number(value);
        if (code === '20') cy = Number(value);
        if (code === '40') radius = Number(value);
      }
      if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(radius) && (radius as number) > 0) {
        const points = Array.from({ length: 32 }, (_, index) => {
          const angle = (Math.PI * 2 * index) / 32;
          return {
            x: (cx as number) + Math.cos(angle) * (radius as number),
            y: (cy as number) + Math.sin(angle) * (radius as number),
          };
        });
        const contour = dxfContour(points);
        if (contour) contours.push({ ...contour, layer });
      }
    }
  }

  const filteredContours = contours.filter((contour) => !likelyDimensionArrow(contour));
  const depthOf = (contour: DxfContour) => filteredContours.filter((other) => (
    other !== contour
    && other.area > contour.area
    && dxfPointInPolygon(contour.center, other.points)
  )).length;

  const outerContours = filteredContours
    .filter((contour) => depthOf(contour) % 2 === 0)
    .sort((a, b) => b.area - a.area);
  if (!outerContours.length) return { contours: [], layers: [...layers].sort() };

  const documentBounds = outerContours.reduce((bounds, contour) => {
    const contourBounds = dxfBounds(contour.points);
    return {
      minX: Math.min(bounds.minX, contourBounds.minX),
      minY: Math.min(bounds.minY, contourBounds.minY),
      maxX: Math.max(bounds.maxX, contourBounds.maxX),
      maxY: Math.max(bounds.maxY, contourBounds.maxY),
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  const assignedGroups = new Map<DxfContour, string>();
  let groupNumber = 0;
  outerContours.forEach((start) => {
    if (assignedGroups.has(start)) return;
    groupNumber += 1;
    const groupId = `DXF група ${groupNumber}`;
    const queue = [start];
    assignedGroups.set(start, groupId);
    while (queue.length) {
      const current = queue.shift() as DxfContour;
      const currentBounds = dxfBounds(current.points);
      outerContours.forEach((candidate) => {
        if (assignedGroups.has(candidate)) return;
        if (contourGap(currentBounds, dxfBounds(candidate.points)) <= 160) {
          assignedGroups.set(candidate, groupId);
          queue.push(candidate);
        }
      });
    }
  });

  return {
    layers: [...layers].sort(),
    contours: outerContours.map((contour) => {
      const bounds = dxfBounds(contour.points);
      const depth = depthOf(contour);
      const holes = filteredContours
        .filter((candidate) => (
          depthOf(candidate) === depth + 1
          && candidate.area < contour.area
          && dxfPointInPolygon(candidate.center, contour.points)
        ))
        .map((hole) => hole.points.map((point) => ({ x: point.x - bounds.minX, y: bounds.maxY - point.y })));
      const insideLabels = labels.filter((label) => dxfPointInPolygon(label.point, contour.points));
      const nearbyLabels = labels
          .map((label) => ({ label, distance: Math.hypot(label.point.x - contour.center.x, label.point.y - contour.center.y) }))
          .filter((item) => item.distance <= Math.max(contour.width, contour.height) * 0.75 + 120)
          .sort((a, b) => a.distance - b.distance);
      const sourceLabel = insideLabels.find((label) => label.layer === contour.layer)
        ?? insideLabels[0]
        ?? nearbyLabels.find((item) => item.label.layer === contour.layer)?.label
        ?? nearbyLabels[0]?.label;
      const semanticLayerName = semanticDxfLabel(contour.layer) ? contour.layer : undefined;
      const semanticSource = sourceLabel?.text ?? semanticLayerName;
      return {
        width: contour.width,
        height: contour.height,
        points: contour.points.map((point) => ({ x: point.x - bounds.minX, y: bounds.maxY - point.y })),
        holes,
        sourceX: bounds.minX - documentBounds.minX,
        sourceY: documentBounds.maxY - bounds.maxY,
        groupId: assignedGroups.get(contour) ?? 'DXF група 1',
        layer: contour.layer,
        suggestedName: semanticSource,
        suggestedEdgeProfile: inferDxfEdgeProfile(semanticSource),
        suggestedEdgeSide: inferDxfEdgeSide(semanticSource),
      };
    }),
  };
}
