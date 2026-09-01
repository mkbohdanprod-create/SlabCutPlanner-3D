import  { useMemo } from 'react';
import type { DetailDraft } from '../forms/utils/draftHelpers';
import { curvedContour, isCurvedKind } from '../../domain/baseContour';

export function Detail2DBlueprint({ detail }: { detail: DetailDraft }) {
  const curved = isCurvedKind(detail.kind);
  const points = useMemo(() => {
    let pts = detail.geometry?.customPoints || [];
    if (pts.length > 0) return pts;
    // Коло й овал (01.09): контур квадрантами, а не прямокутник за габаритом.
    const curve = curvedContour(detail);
    if (curve) return curve;

    let width = detail.width || 1200;
    let height = detail.height || 600;

    if (detail.kind === "l") {
      width = detail.outerWidth || 1200;
      height = detail.outerHeight || 1200;
      const iw = detail.innerHorizontal || 600;
      const ih = detail.innerVertical || 600;
            if (detail.mirrorL) {
        /* ЛІВА Г (26.08): виріз ліворуч — обхід BL, як у lShapePoints
           рушія. Літери йдуть за обходом, тому в лівої B — повна права
           сторона, E — внутрішня горизонталь вирізу, F — коротка ліва.
           На кресленні (y вниз) виріз опиняється внизу ліворуч. */
        return [
          { id: "start", closeId: "F", x: 0, y: 0 },
          { id: "A", x: width, y: 0 },
          { id: "B", x: width, y: height },
          { id: "C", x: iw, y: height },
          { id: "D", x: iw, y: height - ih },
          { id: "E", x: 0, y: height - ih },
        ];
      }
      return [
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
      const leftH = detail.leftLegHeight ?? (detail.height || 1200);
      const rightH = detail.rightLegHeight ?? (detail.height || 1200);
      height = Math.max(leftH, rightH);
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
  }, [detail]);

  const bounds = useMemo(() => {
    return {
      minX: Math.min(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxX: Math.max(...points.map((p) => p.x)),
      maxY: Math.max(...points.map((p) => p.y)),
    };
  }, [points]);

  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);

  // Padding to fit dimensions and blue boxes
  const padding = Math.max(w, h) * 0.2; 
  const viewBox = `${bounds.minX - padding} ${bounds.minY - padding} ${w + padding * 2} ${h + padding * 2}`;

  const segments = useMemo(() => {
    const segs = [];
    const pts = points;
    // Крива форма: 64 хорди не розмірюємо — габарити й квадранти нижче окремо.
    if (curved) return segs;
    
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      
      let id = "";
      if (detail.kind === "u" || detail.kind === "l") {
        id = p2.id === "start" ? (p2.closeId || "") : p2.id;
      } else {
        if (i === 0) id = "A";
        else if (i === 1) id = "B";
        else if (i === 2) id = "C";
        else if (i === 3) id = "D";
      }

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.round(Math.sqrt(dx * dx + dy * dy));
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      
      const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      const nx = dy / len;
      const ny = -dx / len;

      segs.push({ id, p1, p2, midX, midY, nx, ny, length });
    }
    return segs;
  }, [points, detail, curved]);

  const pathD = useMemo(() => {
    const pts = points;
    const len = pts.length;
    if (len < 3) return `M 0 0 L 0 0 Z`;

    let path = "";
    
    // Move to start point
    const startPt = pts[0];
    const prevStartPt = pts[len - 1];
    const nextStartPt = pts[1];
    const sCorner = detail.corners?.[startPt.id || ""] || {};
    
    let startX = startPt.x;
    let startY = startPt.y;
    
    if (sCorner.type === 'radius' || sCorner.type === 'chamfer' || sCorner.type === 'l-cut') {
      const lenPrev = Math.hypot(prevStartPt.x - startPt.x, prevStartPt.y - startPt.y);
      const dirPrev = { x: (prevStartPt.x - startPt.x) / (lenPrev || 1), y: (prevStartPt.y - startPt.y) / (lenPrev || 1) };
      let sDist = 0;
      if (sCorner.type === 'radius') sDist = sCorner.radius || 0;
      if (sCorner.type === 'chamfer') sDist = sCorner.sizeB || 0;
      if (sCorner.type === 'l-cut') sDist = sCorner.sizeB || 0;
      startX = startPt.x + dirPrev.x * sDist;
      startY = startPt.y + dirPrev.y * sDist;
    }
    
    path += `M ${startX} ${startY} `;

    for (let i = 0; i < len; i++) {
      const p = pts[i];
      const pPrev = pts[(i - 1 + len) % len];
      const pNext = pts[(i + 1) % len];
      
      const corner = detail.corners?.[p.id || ""] || {};
      const lenPrev = Math.hypot(pPrev.x - p.x, pPrev.y - p.y);
      const lenNext = Math.hypot(pNext.x - p.x, pNext.y - p.y);
      const dirPrev = { x: (pPrev.x - p.x) / (lenPrev || 1), y: (pPrev.y - p.y) / (lenPrev || 1) };
      const dirNext = { x: (pNext.x - p.x) / (lenNext || 1), y: (pNext.y - p.y) / (lenNext || 1) };

      if (corner.type === 'radius' && (corner.radius || 0) > 0) {
        const R = corner.radius || 0;
        const S = { x: p.x + dirPrev.x * R, y: p.y + dirPrev.y * R };
        const E = { x: p.x + dirNext.x * R, y: p.y + dirNext.y * R };
        const C = { x: p.x + dirPrev.x * R + dirNext.x * R, y: p.y + dirPrev.y * R + dirNext.y * R };
        
        if (i !== 0) path += `L ${S.x} ${S.y} `;
        
        const cross = (S.x - C.x) * (E.y - C.y) - (S.y - C.y) * (E.x - C.x);
        const sweep = cross < 0 ? 0 : 1; 
        
        path += `A ${R} ${R} 0 0 ${sweep} ${E.x} ${E.y} `;
      }
      else if (corner.type === 'chamfer') {
        const sizeB = corner.sizeB || 0;
        const sizeC = corner.sizeC || 0;
        const S = { x: p.x + dirPrev.x * sizeB, y: p.y + dirPrev.y * sizeB };
        const E = { x: p.x + dirNext.x * sizeC, y: p.y + dirNext.y * sizeC };
        
        if (i !== 0) path += `L ${S.x} ${S.y} `;
        path += `L ${E.x} ${E.y} `;
      }
      else if (corner.type === 'l-cut') {
        const sizeB = corner.sizeB || 0;
        const sizeC = corner.sizeC || 0;
        const S = { x: p.x + dirPrev.x * sizeB, y: p.y + dirPrev.y * sizeB };
        const E = { x: p.x + dirNext.x * sizeC, y: p.y + dirNext.y * sizeC };
        const M = { x: p.x + dirPrev.x * sizeB + dirNext.x * sizeC, y: p.y + dirPrev.y * sizeB + dirNext.y * sizeC };
        
        if (i !== 0) path += `L ${S.x} ${S.y} `;
        path += `L ${M.x} ${M.y} `;
        path += `L ${E.x} ${E.y} `;
      }
      else {
        if (i !== 0) path += `L ${p.x} ${p.y} `;
      }
    }
    
    path += " Z";
    return path;
  }, [points, detail.corners]);

  const uShapeProps = useMemo(() => {
    if (detail.kind === 'u') {
      const leftH = detail.leftLegHeight ?? (detail.height || 1200);
      const rightH = detail.rightLegHeight ?? (detail.height || 1200);
      const height = Math.max(leftH, rightH);
      return {
        topBarHeight: Math.max(0, height - (detail.innerCutDepth || 600)),
        cutOff: detail.innerCutOffset || 600,
        cutW: detail.innerCutWidth || 1200
      };
    }
    return null;
  }, [detail]);

  const boxSize = Math.max(w, h) * 0.05;
  const fontSize = boxSize * 0.6;
  const offset = Math.max(w, h) * 0.04;
  const textOffset = Math.max(w, h) * 0.09;

  return (
    <div className="w-full h-full flex items-center justify-center bg-white p-4">
      {/* Розворот «як у житті» (26.08): глобального scaleY(-1) більше немає.
          Геометрія рендериться прямо в екранних координатах SVG (y вниз):
          сторона A опиняється ЗВЕРХУ (задня кромка при стіні), виріз Г і
          отвір П дивляться ВНИЗ — на глядача, як на реальній кухні.
          3D і бланк погодження ніколи не фліпались — тепер конструктор
          збігається з ними. */}
      <svg viewBox={viewBox} className="w-full h-full">
        {/* Draw main shape */}
        <path 
          d={pathD} 
          fill="#e2e8f0" 
          stroke="#94a3b8" 
          strokeWidth={Math.max(w, h) * 0.005} 
          strokeLinejoin="round" 
        />

        {/* Draw dimension lines and text */}
        {segments.map((seg, i) => {
          if (seg.length < 20) return null;
          
          const textX = seg.midX + seg.nx * textOffset;
          const textY = seg.midY + seg.ny * textOffset;
          
          const lx1 = seg.p1.x + seg.nx * offset;
          const ly1 = seg.p1.y + seg.ny * offset;
          const lx2 = seg.p2.x + seg.nx * offset;
          const ly2 = seg.p2.y + seg.ny * offset;

          let angle = Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x) * (180 / Math.PI);
          if (angle > 90 || angle < -90) angle += 180;

          return (
            <g key={`dim-${i}`}>
              {/* Reference lines */}
              <line x1={seg.p1.x} y1={seg.p1.y} x2={lx1} y2={ly1} stroke="#cbd5e1" strokeWidth={Math.max(w, h) * 0.002} />
              <line x1={seg.p2.x} y1={seg.p2.y} x2={lx2} y2={ly2} stroke="#cbd5e1" strokeWidth={Math.max(w, h) * 0.002} />
              {/* Main dimension line */}
              <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="#64748b" strokeWidth={Math.max(w, h) * 0.004} />
              
              {/* Text */}
              <text
                x={textX}
                y={textY}
                fill="#334155"
                fontSize={fontSize}
                fontFamily="sans-serif"
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${-angle}, ${textX}, ${textY})`}
              >
                {seg.id ? `${seg.id} = ${seg.length} mm` : `${seg.length} mm`}
              </text>
              
              {/* Blue ID Box Inside Shape */}
              {seg.id && (
                <g>
                  <rect
                    x={seg.midX - seg.nx * (boxSize * 0.8) - boxSize/2}
                    y={seg.midY - seg.ny * (boxSize * 0.8) - boxSize/2}
                    width={boxSize}
                    height={boxSize}
                    fill="#1f93ef"
                    rx={boxSize * 0.15}
                  />
                  <text
                    x={seg.midX - seg.nx * (boxSize * 0.8)}
                    y={seg.midY - seg.ny * (boxSize * 0.8)}
                    fill="#ffffff"
                    fontSize={fontSize}
                    fontWeight="bold"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                    dominantBaseline="central"

                  >
                    {seg.id}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Кругла/овальна: два габарити і квадранти A–D замість 64 хорд */}
        {curved && (() => {
          const cx = w / 2; const cy = h / 2;
          const isCircle = detail.kind === 'circle';
          const dimY = -offset; const dimX = w + offset;
          const quadrants: Array<[string, number]> = [['A', Math.PI * 1.25], ['B', Math.PI * 1.75], ['C', Math.PI * 0.25], ['D', Math.PI * 0.75]];
          return (
            <g>
              <line x1={0} y1={0} x2={0} y2={dimY} stroke="#cbd5e1" strokeWidth={Math.max(w, h) * 0.002} />
              <line x1={w} y1={0} x2={w} y2={dimY} stroke="#cbd5e1" strokeWidth={Math.max(w, h) * 0.002} />
              <line x1={0} y1={dimY} x2={w} y2={dimY} stroke="#64748b" strokeWidth={Math.max(w, h) * 0.004} />
              <text x={cx} y={dimY - textOffset * 0.5} fill="#334155" fontSize={fontSize} fontFamily="sans-serif" textAnchor="middle" dominantBaseline="central">
                {isCircle ? `Ø ${Math.round(w)} mm` : `${Math.round(w)} mm`}
              </text>
              {!isCircle && (
                <>
                  <line x1={w} y1={0} x2={dimX} y2={0} stroke="#cbd5e1" strokeWidth={Math.max(w, h) * 0.002} />
                  <line x1={w} y1={h} x2={dimX} y2={h} stroke="#cbd5e1" strokeWidth={Math.max(w, h) * 0.002} />
                  <line x1={dimX} y1={0} x2={dimX} y2={h} stroke="#64748b" strokeWidth={Math.max(w, h) * 0.004} />
                  <text x={dimX + textOffset * 0.5} y={cy} fill="#334155" fontSize={fontSize} fontFamily="sans-serif" textAnchor="middle" dominantBaseline="central" transform={`rotate(-90, ${dimX + textOffset * 0.5}, ${cy})`}>
                    {Math.round(h)} mm
                  </text>
                </>
              )}
              {quadrants.map(([id, a]) => {
                const qx = cx + Math.cos(a) * (w / 2) * 0.72;
                const qy = cy + Math.sin(a) * (h / 2) * 0.72;
                return (
                  <g key={id}>
                    <rect x={qx - boxSize / 2} y={qy - boxSize / 2} width={boxSize} height={boxSize} fill="#1f93ef" rx={boxSize * 0.15} />
                    <text x={qx} y={qy} fill="#ffffff" fontSize={fontSize} fontWeight="bold" fontFamily="sans-serif" textAnchor="middle" dominantBaseline="central">{id}</text>
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* U-Shape Width Marker */}
        {uShapeProps && (
          <g>
            <line 
              x1={uShapeProps.cutOff + uShapeProps.cutW / 2} 
              y1={0} 
              x2={uShapeProps.cutOff + uShapeProps.cutW / 2} 
              y2={uShapeProps.topBarHeight} 
              stroke="#ef4444" 
              strokeWidth={Math.max(w, h) * 0.006} 
            />
            {/* Arrow heads */}
            <polygon 
              points={`${uShapeProps.cutOff + uShapeProps.cutW / 2},0 ${uShapeProps.cutOff + uShapeProps.cutW / 2 - boxSize*0.3},${boxSize*0.6} ${uShapeProps.cutOff + uShapeProps.cutW / 2 + boxSize*0.3},${boxSize*0.6}`}
              fill="#ef4444" 
            />
            <polygon 
              points={`${uShapeProps.cutOff + uShapeProps.cutW / 2},${uShapeProps.topBarHeight} ${uShapeProps.cutOff + uShapeProps.cutW / 2 - boxSize*0.3},${uShapeProps.topBarHeight - boxSize*0.6} ${uShapeProps.cutOff + uShapeProps.cutW / 2 + boxSize*0.3},${uShapeProps.topBarHeight - boxSize*0.6}`}
              fill="#ef4444" 
            />
            <text
              x={uShapeProps.cutOff + uShapeProps.cutW / 2 + boxSize * 0.5}
              y={uShapeProps.topBarHeight / 2}
              fill="#ef4444"
              fontSize={fontSize}
              fontWeight="bold"
              fontFamily="sans-serif"
              textAnchor="middle"
              dominantBaseline="central"
              transform={`rotate(90, ${uShapeProps.cutOff + uShapeProps.cutW / 2 + boxSize * 0.5}, ${uShapeProps.topBarHeight / 2})`}
            >
              Ширина = {Math.round(uShapeProps.topBarHeight)} mm
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
