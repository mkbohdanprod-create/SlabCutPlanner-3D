import re

with open('src/engines/geometry.ts', 'r', encoding='utf-8') as f:
    code = f.read()

helpers = """
function mapCornersToRect(detail: Detail, rectX: number, rectY: number, rectW: number, rectH: number): Record<string, import('../domain/types').CornerProcessing> | undefined {
  if (!detail.geometry?.corners) return undefined;
  
  let originalCorners: Record<string, { x: number, y: number }> = {};
  const g = detail.geometry;
  if (detail.shape === 'П-подібна') {
    const width = g.width || 1200;
    const height = g.height || 600;
    const leftH = g.leftLegHeight ?? height;
    const rightH = g.rightLegHeight ?? height;
    const cutW = g.innerCutWidth || 600;
    const cutD = g.innerCutDepth || 300; 
    const cutOff = g.innerCutOffset || 300;
    const topBarHeight = Math.max(0, height - cutD);
    originalCorners = {
      start: { x: 0, y: 0 }, A: { x: width, y: 0 }, B: { x: width, y: rightH }, C: { x: cutOff + cutW, y: rightH },
      D: { x: cutOff + cutW, y: topBarHeight }, E: { x: cutOff, y: topBarHeight }, F: { x: cutOff, y: leftH }, G: { x: 0, y: leftH }
    };
  } else if (detail.shape === 'Г-подібна') {
    const width = g.outerWidth || 1200;
    const height = g.outerHeight || 1200;
    const iw = g.innerHorizontal || 600;
    const ih = g.innerVertical || 600;
    originalCorners = {
      start: { x: 0, y: 0 }, A: { x: width, y: 0 }, B: { x: width, y: height - ih }, C: { x: iw, y: height - ih },
      D: { x: iw, y: height }, E: { x: 0, y: height }
    };
  } else {
    return undefined;
  }

  const mapped: Record<string, import('../domain/types').CornerProcessing> = {};
  const match = (x: number, y: number) => {
    for (const [id, pt] of Object.entries(originalCorners)) {
      if (Math.abs(pt.x - x) < 0.1 && Math.abs(pt.y - y) < 0.1) return detail.geometry.corners[id];
    }
    return undefined;
  };
  const da = match(rectX, rectY); if (da) mapped['DA'] = da;
  const ab = match(rectX + rectW, rectY); if (ab) mapped['AB'] = ab;
  const bc = match(rectX + rectW, rectY + rectH); if (bc) mapped['BC'] = bc;
  const cd = match(rectX, rectY + rectH); if (cd) mapped['CD'] = cd;
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function mapCutoutsToRect(detail: Detail, rectX: number, rectY: number, rectW: number, rectH: number): Record<string, import('../domain/types').CutoutProcessing> | undefined {
  if (!detail.geometry?.cutouts) return undefined;
  const mapped: Record<string, import('../domain/types').CutoutProcessing> = {};
  for (const [id, cutout] of Object.entries(detail.geometry.cutouts)) {
    if (cutout.x >= rectX && cutout.x <= rectX + rectW && cutout.y >= rectY && cutout.y <= rectY + rectH) {
      mapped[id] = { ...cutout, x: cutout.x - rectX, y: cutout.y - rectY };
    }
  }
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

"""

if "mapCornersToRect" not in code:
    code = code.replace("function explodeDetails(", helpers + "function explodeDetails(")

# Replace 'const mark = (part: DetailPart, x: number, y: number, sideAliases?: Record<string, \\'A\\' | \\'B\\' | \\'C\\' | \\'D\\'>) => {' in U shape
pattern_u = r"const mark = \(part: DetailPart, x: number, y: number, sideAliases\?: Record<string, 'A' \| 'B' \| 'C' \| 'D'>\) => {[\s\S]*?return part;\s*};"
repl_u = """const markRect = (name: string, nominalW: number, nominalH: number, parentLabel: string, x: number, y: number, sideAliases?: Record<string, 'A' | 'B' | 'C' | 'D'>) => {
            const mappedCorners = mapCornersToRect(detail, x, y, nominalW, nominalH);
            const mappedCutouts = mapCutoutsToRect(detail, x, y, nominalW, nominalH);
            const meta = splitMeta(parentLabel, x, y, sideAliases);
            (meta as any).mappedCorners = mappedCorners;
            (meta as any).mappedCutouts = mappedCutouts;
            const part = buildSlotSinkRectPart(detail, name, nominalW, nominalH, parentLabel, meta);
            const sideSegments: Record<string, { start: Point; end: Point }> = {};
            if (sideAliases?.E) sideSegments.E = verticalSegment(Math.max(0, rightX - x), Math.max(0, part.height - cutD), Math.min(cutD, part.height));
            if (sideAliases?.F) sideSegments.F = horizontalSegment(Math.max(0, leftWidth - x), part.height, Math.min(cutW, part.width));
            if (sideAliases?.G) sideSegments.G = verticalSegment(Math.max(0, leftWidth - x), Math.max(0, part.height - cutD), Math.min(cutD, part.height));
            if (sideAliases?.H) sideSegments.H = horizontalSegment(0, part.height, Math.min(leftWidth, part.width));
            part.sideSegments = sideSegments;
            return part;
          };
          
          const markL = (name: string, nominalW: number, nominalH: number, innerW: number, innerH: number, orient: 'TL' | 'TR' | 'BL' | 'BR', parentLabel: string, x: number, y: number, sideAliases?: Record<string, 'A' | 'B' | 'C' | 'D'>) => {
            const mappedCorners = mapCornersToRect(detail, x, y, nominalW, nominalH);
            const mappedCutouts = mapCutoutsToRect(detail, x, y, nominalW, nominalH);
            const meta = splitMeta(parentLabel, x, y, sideAliases);
            (meta as any).mappedCorners = mappedCorners;
            (meta as any).mappedCutouts = mappedCutouts;
            const part = buildAllowanceLPart(detail, name, nominalW, nominalH, innerW, innerH, orient, parentLabel, undefined, meta);
            const sideSegments: Record<string, { start: Point; end: Point }> = {};
            // Simplified side segments mapping for L part within U shape
            part.sideSegments = sideSegments;
            return part;
          };"""

code = re.sub(pattern_u, repl_u, code, count=1)

# Do the same for L-shape
pattern_l = r"const mark = \(part: DetailPart, x: number, y: number, sideAliases\?: Record<string, 'A' \| 'B' \| 'C' \| 'D'>\) => {[\s\S]*?return part;\s*};"
repl_l = """const markRect = (name: string, nominalW: number, nominalH: number, parentLabel: string, x: number, y: number, sideAliases?: Record<string, 'A' | 'B' | 'C' | 'D'>) => {
            const mappedCorners = mapCornersToRect(detail, x, y, nominalW, nominalH);
            const mappedCutouts = mapCutoutsToRect(detail, x, y, nominalW, nominalH);
            const meta = splitMeta(parentLabel, x, y, sideAliases);
            (meta as any).mappedCorners = mappedCorners;
            (meta as any).mappedCutouts = mappedCutouts;
            const part = buildSlotSinkRectPart(detail, name, nominalW, nominalH, parentLabel, meta);
            const sideSegments: Record<string, { start: Point; end: Point }> = {};
            if (sideAliases?.E) sideSegments.E = horizontalSegment(0, Math.max(0, part.height - ih), Math.min(part.width, nominalOW - iw));
            if (sideAliases?.F) sideSegments.F = verticalSegment(Math.max(0, part.width - (nominalOW - iw)), 0, Math.max(0, part.height - ih));
            part.sideSegments = sideSegments;
            return part;
          };"""
code = re.sub(pattern_l, repl_l, code, count=1)

with open('src/engines/geometry.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("Fixed geometry.ts definitions")
