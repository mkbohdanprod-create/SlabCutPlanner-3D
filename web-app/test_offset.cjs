const fs = require('fs');

function isPointInsidePreviewPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const crosses = (current.y > point.y) !== (previous.y > point.y);
    if (crosses) {
      const x = ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

const points = [
  { x: 0, y: 1580 },
  { x: 2210, y: 1580 },
  { x: 2210, y: 980 },
  { x: 600, y: 980 },
  { x: 600, y: 0 },
  { x: 0, y: 0 }
];

const sideSegments = {
  A: { start: points[0], end: points[1] },
  B: { start: points[1], end: points[2] },
  C: { start: points[2], end: points[3] },
  D: { start: points[3], end: points[4] },
  E: { start: points[4], end: points[5] },
  F: { start: points[5], end: points[0] },
};

const offset = 55.3;

for (const side of Object.keys(sideSegments)) {
  const segment = sideSegments[side];
  const startIdx = points.reduce((best, p, i) => {
    const dist = Math.hypot(p.x - segment.start.x, p.y - segment.start.y);
    return dist < best.dist ? { i, dist } : best;
  }, { i: 0, dist: Infinity }).i;

  const nextSide = Object.keys(sideSegments)[(Object.keys(sideSegments).indexOf(side) + 1) % 6];
  const nextSegmentStart = sideSegments[nextSide].start;
  const endIdx = points.reduce((best, p, i) => {
    const dist = Math.hypot(p.x - nextSegmentStart.x, p.y - nextSegmentStart.y);
    return dist < best.dist ? { i, dist } : best;
  }, { i: 0, dist: Infinity }).i;

  let forwardSteps = 0;
  let i = startIdx;
  while (i !== endIdx && forwardSteps < points.length) {
    i = (i + 1) % points.length;
    forwardSteps++;
  }
  let backwardSteps = 0;
  i = startIdx;
  while (i !== endIdx && backwardSteps < points.length) {
    i = (i - 1 + points.length) % points.length;
    backwardSteps++;
  }
  const step = forwardSteps <= backwardSteps ? 1 : -1;
  const stepsCount = Math.min(forwardSteps, backwardSteps);
  
  const midSeqIdx = (startIdx + Math.floor(stepsCount / 2) * step + points.length) % points.length;
  const midP = points[midSeqIdx];
  const midNext = points[(midSeqIdx + step + points.length) % points.length];
  const midPoint = { x: (midP.x + midNext.x) / 2, y: (midP.y + midNext.y) / 2 };
  const midDx = midNext.x - midP.x;
  const midDy = midNext.y - midP.y;
  const midLen = Math.hypot(midDx, midDy) || 1;
  const midLeftNorm = { x: midDy / midLen, y: -midDx / midLen };
  const isMidLeftInside = [offset, 6, 2].some((d) => (
    isPointInsidePreviewPolygon({ x: midPoint.x + midLeftNorm.x * d, y: midPoint.y + midLeftNorm.y * d }, points)
  ));
  const globalSign = isMidLeftInside ? 1 : -1;

  const insetPathPoints = [];
  i = startIdx;
  while (true) {
    const p = points[i];
    let len1 = 0, dx1 = 0, dy1 = 0;
    for (let s = 1; s < 10; s++) {
      const prevIdx = (i - s + points.length) % points.length;
      dx1 = p.x - points[prevIdx].x;
      dy1 = p.y - points[prevIdx].y;
      len1 = Math.hypot(dx1, dy1);
      if (len1 >= 10) break;
    }
    let len2 = 0, dx2 = 0, dy2 = 0;
    for (let s = 1; s < 10; s++) {
      const nextIdx = (i + s * step + points.length) % points.length;
      dx2 = points[nextIdx].x - p.x;
      dy2 = points[nextIdx].y - p.y;
      len2 = Math.hypot(dx2, dy2);
      if (len2 >= 10) break;
    }
    const n1 = { x: -dy1 / (len1 || 1), y: dx1 / (len1 || 1) };
    const n2 = { x: -dy2 / (len2 || 1), y: dx2 / (len2 || 1) };
    let nx = n1.x + n2.x;
    let ny = n1.y + n2.y;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const dot = n1.x * n2.x + n1.y * n2.y;
    const scale = Math.min(5, 1 / Math.max(0.1, Math.sqrt(Math.max(0, (1 + dot) / 2))));
    
    insetPathPoints.push({
      x: p.x + nx * globalSign * offset * scale,
      y: p.y + ny * globalSign * offset * scale,
    });
    if (i === endIdx) break;
    i = (i + step + points.length) % points.length;
  }
  
  console.log(`Side ${side}:`);
  console.log(`  isMidLeftInside=${isMidLeftInside}, globalSign=${globalSign}`);
  console.log(`  insetPathPoints=`, insetPathPoints.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(' -> '));
}
