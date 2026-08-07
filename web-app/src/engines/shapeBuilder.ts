import * as THREE from 'three';
import type { DetailDraft } from '../components/forms/utils/draftHelpers';
import { cutoutCenter } from '../domain/cutoutAnchor';
import { anchorContextFor } from '../domain/elementToDetail';

export function buildDetailShape(detail: DetailDraft, points: any[], bounds: any) {
  const shape = new THREE.Shape();
    const edgeMap: Record<number, string> = {};
    let curveIndex = 0;

    const addLine = (id: string, x: number, y: number) => {
      shape.lineTo(x, y);
      edgeMap[curveIndex++] = id;
    };
    const addEllipse = (
      id: string,
      x: number,
      y: number,
      xRadius: number,
      yRadius: number,
      aStartAngle: number,
      aEndAngle: number,
      aClockwise: boolean,
      aRotation: number,
    ) => {
      shape.absellipse(
        x,
        y,
        xRadius,
        yRadius,
        aStartAngle,
        aEndAngle,
        aClockwise,
        aRotation,
      );
      edgeMap[curveIndex++] = id;
    };

    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;

    // Helper to get mapped coordinates
    const getCoords = (p: { x: number; y: number }) => ({
      nx: (p.x - bounds.minX) / (w || 1),
      ny: (p.y - bounds.minY) / (h || 1),
    });

    const corners = detail.corners || {};

    // Standard rendering for custom shapes or shapes without corner logic
    if (detail.kind !== "rect" && detail.kind !== "l" && detail.kind !== "u") {
      points.forEach((p, i) => {
        const { nx, ny } = getCoords(p);
        if (i === 0) shape.moveTo(nx, ny);
        else addLine(p.id || `edge-${i}`, nx, ny);
      });
    } else {
      if (detail.kind === "rect") {
        const cornerDA = corners["DA"];
        const cornerAB = corners["AB"];
        const cornerBC = corners["BC"];
        const cornerCD = corners["CD"];

        const rDA = cornerDA?.type === "radius" ? cornerDA.radius || 0 : 0;
        const rAB = cornerAB?.type === "radius" ? cornerAB.radius || 0 : 0;
        const rBC = cornerBC?.type === "radius" ? cornerBC.radius || 0 : 0;
        const rCD = cornerCD?.type === "radius" ? cornerCD.radius || 0 : 0;

        // Bottom edge (DA to AB)
        shape.moveTo(0 + rDA / w, 0);

        if (cornerAB?.type === "chamfer") {
          addLine("A", 1 - (cornerAB.sizeB || 0) / w, 0);
          addLine("AB_chamfer", 1, (cornerAB.sizeC || 0) / h);
        } else if (cornerAB?.type === "l-cut") {
          addLine("A", 1 - (cornerAB.sizeB || 0) / w, 0);
          addLine(
            "AB_lcut1",
            1 - (cornerAB.sizeB || 0) / w,
            (cornerAB.sizeC || 0) / h,
          );
          addLine("AB_lcut2", 1, (cornerAB.sizeC || 0) / h);
        } else if (rAB > 0) {
          addLine("A", 1 - rAB / w, 0);
          addEllipse(
            "AB_radius",
            1 - rAB / w,
            rAB / h,
            rAB / w,
            rAB / h,
            -Math.PI / 2,
            0,
            false,
            0,
          );
        } else {
          addLine("A", 1, 0);
        }

        // Right edge (AB to BC)
        if (cornerBC?.type === "chamfer") {
          addLine("B", 1, 1 - (cornerBC.sizeB || 0) / h);
          addLine("BC_chamfer", 1 - (cornerBC.sizeC || 0) / w, 1);
        } else if (cornerBC?.type === "l-cut") {
          addLine("B", 1, 1 - (cornerBC.sizeB || 0) / h);
          addLine(
            "BC_lcut1",
            1 - (cornerBC.sizeC || 0) / w,
            1 - (cornerBC.sizeB || 0) / h,
          );
          addLine("BC_lcut2", 1 - (cornerBC.sizeC || 0) / w, 1);
        } else if (rBC > 0) {
          addLine("B", 1, 1 - rBC / h);
          addEllipse(
            "BC_radius",
            1 - rBC / w,
            1 - rBC / h,
            rBC / w,
            rBC / h,
            0,
            Math.PI / 2,
            false,
            0,
          );
        } else {
          addLine("B", 1, 1);
        }

        // Top edge (BC to CD)
        if (cornerCD?.type === "chamfer") {
          addLine("C", (cornerCD.sizeB || 0) / w, 1);
          addLine("CD_chamfer", 0, 1 - (cornerCD.sizeC || 0) / h);
        } else if (cornerCD?.type === "l-cut") {
          addLine("C", (cornerCD.sizeB || 0) / w, 1);
          addLine(
            "CD_lcut1",
            (cornerCD.sizeB || 0) / w,
            1 - (cornerCD.sizeC || 0) / h,
          );
          addLine("CD_lcut2", 0, 1 - (cornerCD.sizeC || 0) / h);
        } else if (rCD > 0) {
          addLine("C", 0 + rCD / w, 1);
          addEllipse(
            "CD_radius",
            rCD / w,
            1 - rCD / h,
            rCD / w,
            rCD / h,
            Math.PI / 2,
            Math.PI,
            false,
            0,
          );
        } else {
          addLine("C", 0, 1);
        }

        // Left edge (CD to DA)
        if (cornerDA?.type === "chamfer") {
          addLine("D", 0, (cornerDA.sizeB || 0) / h);
          addLine("DA_chamfer", (cornerDA.sizeC || 0) / w, 0);
        } else if (cornerDA?.type === "l-cut") {
          addLine("D", 0, (cornerDA.sizeB || 0) / h);
          addLine(
            "DA_lcut1",
            (cornerDA.sizeC || 0) / w,
            (cornerDA.sizeB || 0) / h,
          );
          addLine("DA_lcut2", (cornerDA.sizeC || 0) / w, 0);
        } else if (rDA > 0) {
          addLine("D", 0, 0 + rDA / h);
          addEllipse(
            "DA_radius",
            rDA / w,
            rDA / h,
            rDA / w,
            rDA / h,
            Math.PI,
            Math.PI * 1.5,
            false,
            0,
          );
        } else {
          addLine("D", 0, 0);
        }
      } else {
        // Generic corner rendering for any axis-aligned polygon
        const len = points.length;
        if (len > 2) {
          // Move to the start point, but adjust if the first corner has a processing
          const startPt = points[0];
          const prevStartPt = points[len - 1];
          const nextStartPt = points[1];
          const { nx: sX, ny: sY } = getCoords(startPt);
          
          const sCorner = corners[startPt.id || ""] || {};
          if (sCorner.type === 'radius' || sCorner.type === 'chamfer' || sCorner.type === 'l-cut') {
             // For the first point, if it has a corner, we shouldn't just moveTo it, we must moveTo the start of its curve
             const { nx: psX, ny: psY } = getCoords(prevStartPt);
             const lenPrev = Math.hypot(psX - sX, psY - sY);
             const dirPrev = { x: (psX - sX) / (lenPrev || 1), y: (psY - sY) / (lenPrev || 1) };
             
             let sDist = 0;
             if (sCorner.type === 'radius') sDist = sCorner.radius || 0;
             if (sCorner.type === 'chamfer') sDist = sCorner.sizeB || 0;
             if (sCorner.type === 'l-cut') sDist = sCorner.sizeB || 0;
             
             shape.moveTo(sX + dirPrev.x * (sDist / w), sY + dirPrev.y * (sDist / h));
          } else {
             shape.moveTo(sX, sY);
          }

          for (let i = 0; i < len; i++) {
            const p = points[i];
            const pPrev = points[(i - 1 + len) % len];
            const pNext = points[(i + 1) % len];
            
            const corner = corners[p.id || ""] || {};
            const { nx: px, ny: py } = getCoords(p);
            const { nx: pxPrev, ny: pyPrev } = getCoords(pPrev);
            const { nx: pxNext, ny: pyNext } = getCoords(pNext);
            
            const lenPrev = Math.hypot(pxPrev - px, pyPrev - py);
            const lenNext = Math.hypot(pxNext - px, pyNext - py);
            
            const dirPrev = { x: (pxPrev - px) / (lenPrev || 1), y: (pyPrev - py) / (lenPrev || 1) };
            const dirNext = { x: (pxNext - px) / (lenNext || 1), y: (pyNext - py) / (lenNext || 1) };

            const edgeId = p.id || `edge-${i}`;

            if (corner.type === 'radius' && (corner.radius || 0) > 0) {
              const Rx = (corner.radius || 0) / w;
              const Ry = (corner.radius || 0) / h;
              
              const S = { x: px + dirPrev.x * Rx, y: py + dirPrev.y * Ry };
              const E = { x: px + dirNext.x * Rx, y: py + dirNext.y * Ry };
              const C = { x: px + dirPrev.x * Rx + dirNext.x * Rx, y: py + dirPrev.y * Ry + dirNext.y * Ry };
              
              // Only draw line to S if it's not the very first move (which is handled above)
              if (i !== 0) addLine(edgeId, S.x, S.y);
              
              const startAngle = Math.atan2((S.y - C.y) / Ry, (S.x - C.x) / Rx);
              const endAngle = Math.atan2((E.y - C.y) / Ry, (E.x - C.x) / Rx);
              const cross = (S.x - C.x) * (E.y - C.y) - (S.y - C.y) * (E.x - C.x);
              const clockwise = cross < 0;
              
              addEllipse(`${edgeId}_radius`, C.x, C.y, Rx, Ry, startAngle, endAngle, clockwise, 0);
            }
            else if (corner.type === 'chamfer') {
              const sizeB = corner.sizeB || 0;
              const sizeC = corner.sizeC || 0;
              const S = { x: px + dirPrev.x * (sizeB / w), y: py + dirPrev.y * (sizeB / h) };
              const E = { x: px + dirNext.x * (sizeC / w), y: py + dirNext.y * (sizeC / h) };
              
              if (i !== 0) addLine(edgeId, S.x, S.y);
              addLine(`${edgeId}_chamfer`, E.x, E.y);
            }
            else if (corner.type === 'l-cut') {
              const sizeB = corner.sizeB || 0;
              const sizeC = corner.sizeC || 0;
              const S = { x: px + dirPrev.x * (sizeB / w), y: py + dirPrev.y * (sizeB / h) };
              const E = { x: px + dirNext.x * (sizeC / w), y: py + dirNext.y * (sizeC / h) };
              const M = { x: px + dirPrev.x * (sizeB / w) + dirNext.x * (sizeC / w), y: py + dirPrev.y * (sizeB / h) + dirNext.y * (sizeC / h) };
              
              if (i !== 0) addLine(edgeId, S.x, S.y);
              addLine(`${edgeId}_lcut1`, M.x, M.y);
              addLine(`${edgeId}_lcut2`, E.x, E.y);
            }
            else {
              if (i !== 0) addLine(edgeId, px, py);
            }
          }
          
          // Close shape properly
          const lastPt = points[points.length - 1];
          const firstPt = points[0];
          const fCorner = corners[firstPt.id || ""] || {};
          let _endX = sX, _endY = sY;
          if (fCorner.type === 'radius') {
            _endX = sX + ((firstPt.x - lastPt.x) > 0 ? -1 : (firstPt.x - lastPt.x) < 0 ? 1 : 0) * ((fCorner.radius || 0) / w);
            _endY = sY + ((firstPt.y - lastPt.y) > 0 ? -1 : (firstPt.y - lastPt.y) < 0 ? 1 : 0) * ((fCorner.radius || 0) / h);
            // Actually, we can just let it close to the first moveTo coordinate
            // Wait, we already did shape.moveTo to the Start of the curve.
            // So if we just lineTo the Start of the curve, it will close perfectly!
            // The Start of the curve was calculated at the beginning!
          }
          
          // we don't need to explicitly close because shape.closePath() usually handles it?
          // Wait, Detail3DPreview uses a custom addLine function which maps id to points
          // Let's add a closing line to the initial moveTo point just in case.
          
          // Wait, if we just lineTo the start point, it's fine.
          // But we need the correct id for the closing edge!
          // The closing edge is from lastPt to firstPt.
          const closeId = firstPt.closeId || "close";
          
          // Let's just find the start of the curve for the first point again
          const { nx: psX, ny: psY } = getCoords(points[len - 1]);
          const lenPrev = Math.hypot(psX - sX, psY - sY);
          const dirPrev = { x: (psX - sX) / (lenPrev || 1), y: (psY - sY) / (lenPrev || 1) };
          let sDist = 0;
          if (fCorner.type === 'radius') sDist = fCorner.radius || 0;
          if (fCorner.type === 'chamfer') sDist = fCorner.sizeB || 0;
          if (fCorner.type === 'l-cut') sDist = fCorner.sizeB || 0;
          
          addLine(closeId, sX + dirPrev.x * (sDist / w), sY + dirPrev.y * (sDist / h));
        }
      }
    }

    if (detail.cutouts) {
      Object.values(detail.cutouts).forEach((cutout) => {
        // Прив'язку рахує спільний резолвер — той самий, яким користується
        // розкрій. Раніше тут жила власна копія математики, і вона мовчки не
        // працювала: точки контуру не несуть імен кутів, тому пошук bindCorner
        // ніколи не знаходив кут і виріз лягав від початку координат.
        const { cx: absX, cy: absY } = cutoutCenter(cutout, anchorContextFor(detail as never));
        const cx = (absX - bounds.minX) / (w || 1);
        const cy = (absY - bounds.minY) / (h || 1);

        const hole = new THREE.Path();
        if (cutout.shape === "circle") {
          const cr = (cutout.radius || 0) / w;
          // true means clockwise
          hole.absarc(cx, cy, cr, 0, Math.PI * 2, true);
        } else if (cutout.shape === "rect") {
          const cw = (cutout.width || 0) / w;
          const ch = (cutout.height || 0) / h;
          const rad = cutout.cornerRadius || 0;
          const rx = Math.min(rad / w, cw / 2);
          const ry = Math.min(rad / h, ch / 2);

          // Draw hole in clockwise direction to ensure THREE.js recognizes it as a hole
          if (rad > 0) {
            hole.moveTo(cx - cw / 2 + rx, cy - ch / 2);
            hole.absellipse(
              cx - cw / 2 + rx,
              cy - ch / 2 + ry,
              rx,
              ry,
              Math.PI * 1.5,
              Math.PI,
              true,
              0,
            );
            hole.lineTo(cx - cw / 2, cy + ch / 2 - ry);
            hole.absellipse(
              cx - cw / 2 + rx,
              cy + ch / 2 - ry,
              rx,
              ry,
              Math.PI,
              Math.PI / 2,
              true,
              0,
            );
            hole.lineTo(cx + cw / 2 - rx, cy + ch / 2);
            hole.absellipse(
              cx + cw / 2 - rx,
              cy + ch / 2 - ry,
              rx,
              ry,
              Math.PI / 2,
              0,
              true,
              0,
            );
            hole.lineTo(cx + cw / 2, cy - ch / 2 + ry);
            hole.absellipse(
              cx + cw / 2 - rx,
              cy - ch / 2 + ry,
              rx,
              ry,
              0,
              -Math.PI / 2,
              true,
              0,
            );
            hole.lineTo(cx - cw / 2 + rx, cy - ch / 2);
          } else {
            hole.moveTo(cx - cw / 2, cy - ch / 2);
            hole.lineTo(cx - cw / 2, cy + ch / 2);
            hole.lineTo(cx + cw / 2, cy + ch / 2);
            hole.lineTo(cx + cw / 2, cy - ch / 2);
            hole.lineTo(cx - cw / 2, cy - ch / 2);
          }
        }
        shape.holes.push(hole);
      });
    }

    return { shape, edgeMap, curves: shape.curves };
  
  
  return { shape, edgeMap, curves: shape.curves };
}

export function getDetailPointsAndBounds(detail: DetailDraft) {
  const getPoints = () => {

    let pts = detail.customPoints || [];
    if (pts.length > 0) return pts;

    let width = detail.width || 1000;
    let height = detail.height || 600;

    if (detail.kind === "l") {
      width = detail.outerWidth || 1200;
      height = detail.outerHeight || 1200;
      const iw = detail.innerHorizontal || 600;
      const ih = detail.innerVertical || 600;
      return [
        // Сторони Г-подібної названі буквами A..F — так само, як у
        // редакторі, у списку сторін і в ключах доповнень (`leg_A`,
        // `wall_panel_F`). Доти тут жила стара нотація AB/inner/CD/DA,
        // і жодне доповнення на Г-подібній не знаходило свого ребра.
        { id: "start", closeId: "F", x: 0, y: 0 },
        { id: "A", x: width, y: 0 },
        { id: "B", x: width, y: height - ih },
        { id: "C", x: iw, y: height - ih },
        { id: "D", x: iw, y: height },
        { id: "E", x: 0, y: height },
      ];
    }

    if (detail.kind === "u") {
      width = detail.width || 2400;
      height = detail.height || 1200;
      const leftH = detail.leftLegHeight ?? height;
      const rightH = detail.rightLegHeight ?? height;
      const cutW = detail.innerCutWidth || 1200;
      const cutD = detail.innerCutDepth || 600;
      const cutOff = detail.innerCutOffset || 600;

      const topBarHeight = Math.max(0, height - cutD);

      return [
        { id: "start", closeId: "H", x: 0, y: 0 },
        { id: "A", x: width, y: 0 },
        { id: "B", x: width, y: rightH },
        { id: "C", x: cutOff + cutW, y: rightH },
        { id: "D", x: cutOff + cutW, y: topBarHeight },
        { id: "E", x: cutOff, y: topBarHeight },
        { id: "F", x: cutOff, y: leftH },
        { id: "G", x: 0, y: leftH },
      ];
    }

    return [
      { id: "DA", x: 0, y: 0 },
      { id: "AB", x: width, y: 0 },
      { id: "BC", x: width, y: height },
      { id: "CD", x: 0, y: height },
    ];
  }
  const points = getPoints();
  
  const getBounds = () => {

    if (points.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return {
      minX: Math.min(...points.map((p: any) => p.x)),
      minY: Math.min(...points.map((p: any) => p.y)),
      maxX: Math.max(...points.map((p: any) => p.x)),
      maxY: Math.max(...points.map((p: any) => p.y)),
    };
  }
  const bounds = getBounds();
  
  return { points, bounds };
}

export function buildDetailGeometry(detail: DetailDraft, points: any[], bounds: any) {
  const s = 0.001;
  if ((detail.type as string) === 'Бортик') {
    const length = (detail.width || 1000) * s;
    const height = (detail.height || 50) * s;
    const depth = (detail.thickness || 20) * s;
    
    const shape = new THREE.Shape();
    const r = Math.min(3 * s, height, depth);
    shape.moveTo(-depth, 0);
    shape.lineTo(0, 0);
    shape.lineTo(0, height);
    shape.lineTo(-depth + r, height);
    shape.quadraticCurveTo(-depth, height, -depth, height - r);
    shape.lineTo(-depth, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: length,
      bevelEnabled: false,
    });
    geometry.translate(0, 0, -length / 2);
    geometry.rotateY(Math.PI / 2);
    
    return { geometry, edgeMap: {}, curves: [] };
  }
  
  const { shape, edgeMap, curves } = buildDetailShape(detail, points, bounds);
  const thickness = (detail.thickness || 20) * s;
  
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 32,
  });
  
  return { geometry, edgeMap, curves };
}