import { useMemo, useState } from 'react';
import type { DetailDraft } from '../forms/utils/draftHelpers';
import { curvedContour, isCurvedKind } from '../../domain/baseContour';
import { DIAMETER_SIDE, ELLIPSE_H_SIDE, ELLIPSE_W_SIDE, sideIsLockable, WIDTH_SIDE } from '../../domain/sideLocks';

/**
 * БЕЙДЖ СТОРОНИ НА КРЕСЛЕННІ (04.09.2026).
 *
 * Білий квадратик — звичайна сторона, зелений — закрита замком. Клік по
 * квадратику замикає і відмикає: власник просив ставити замки просто на
 * рисунку, а не бігати очима в таблицю. Був суцільно синій — тоді стан
 * замка на кресленні не читався взагалі.
 */
function SideBadge({ x, y, size, fontSize, id, locked, lockable, onToggle }: {
  x: number; y: number; size: number; fontSize: number; id: string;
  locked?: boolean; lockable?: boolean; onToggle?: () => void;
}) {
  return (
    <g
      onClick={lockable ? onToggle : undefined}
      style={lockable ? { cursor: 'pointer' } : undefined}
    >
      {lockable && <title>{locked ? `Розмір ${id} закріплено — клік знімає замок` : `Клік — закріпити розмір ${id}`}</title>}
      <rect
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        fill={locked ? '#22c55e' : '#ffffff'}
        stroke={locked ? '#15803d' : '#94a3b8'}
        strokeWidth={size * 0.06}
        rx={size * 0.15}
      />
      <text
        x={x}
        y={y}
        fill={locked ? '#ffffff' : '#334155'}
        fontSize={fontSize}
        fontWeight="bold"
        fontFamily="sans-serif"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {id}
      </text>
    </g>
  );
}

/**
 * ЧИСЛО РОЗМІРУ НА КРЕСЛЕННІ (04.09.2026).
 *
 * Було «G = 600 mm» — літера дублювала квадратик поруч, «mm» повторювалось
 * вісім разів, а сам розмір був мертвим написом. Власник: «лишаємо просто
 * цифру і коли на неї натискаєш можна змінювати розмір».
 *
 * Тепер це кнопка: клік — і на місці напису з'являється поле вводу
 * (`foreignObject`, тому воно живе в тих самих координатах креслення й
 * повертається разом із розміром). Enter застосовує, Esc скасовує, клік
 * поза полем — застосовує. Закритий замком розмір блідий і не клікається:
 * стан замка видно просто по кресленню.
 */
function DimValue({ x, y, rotate, fontSize, value, editable, editing, onStart, onCommit, onCancel }: {
  x: number; y: number; rotate: number; fontSize: number; value: number;
  editable: boolean; editing: boolean;
  onStart: () => void; onCommit: (next: number) => void; onCancel: () => void;
}) {
  const w = fontSize * 4.2;
  const h = fontSize * 1.7;
  if (editing) {
    return (
      <foreignObject
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        transform={`rotate(${rotate}, ${x}, ${y})`}
      >
        <input
          type="number"
          defaultValue={Math.round(value)}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => onCommit(Number(e.currentTarget.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit(Number((e.target as HTMLInputElement).value));
            if (e.key === 'Escape') onCancel();
          }}
          style={{
            width: '100%', height: '100%', boxSizing: 'border-box',
            fontSize: `${fontSize * 0.95}px`, fontFamily: 'sans-serif', textAlign: 'center',
            border: `${Math.max(1, fontSize * 0.06)}px solid #1f93ef`, borderRadius: `${fontSize * 0.15}px`,
            background: '#ffffff', color: '#0f172a', padding: 0, outline: 'none',
          }}
        />
      </foreignObject>
    );
  }
  return (
    <text
      x={x}
      y={y}
      fill={editable ? '#334155' : '#94a3b8'}
      fontSize={fontSize}
      fontFamily="sans-serif"
      textAnchor="middle"
      dominantBaseline="central"
      transform={`rotate(${rotate}, ${x}, ${y})`}
      style={editable ? { cursor: 'text' } : undefined}
      onClick={editable ? onStart : undefined}
    >
      {editable && <title>Клік — змінити розмір</title>}
      {Math.round(value)}
    </text>
  );
}

export function Detail2DBlueprint({ detail, lockedSides, onToggleSideLock, onCommitSide, isSideEditable }: {
  detail: DetailDraft;
  /** Розміри, закріплені замком (див. domain/sideLocks.ts). */
  lockedSides?: ReadonlySet<string>;
  onToggleSideLock?: (side: string) => void;
  /** Записати новий розмір сторони (або λ) — редагування просто в кресленні. */
  onCommitSide?: (side: string, value: number) => void;
  /** Чи можна зараз редагувати цей розмір (замки, довільний контур). */
  isSideEditable?: (side: string) => boolean;
}) {
  const [editingSide, setEditingSide] = useState<string | null>(null);
  const canEdit = (side: string) => Boolean(onCommitSide) && (isSideEditable?.(side) ?? true);
  const commit = (side: string, next: number) => {
    setEditingSide(null);
    if (Number.isFinite(next) && next > 0) onCommitSide?.(side, next);
  };
  const curved = isCurvedKind(detail.kind);
  /*
   * Довільний контур (03.09.2026, кейс 81-2009298). Чернетка редактора
   * тримає точки в `customPoints` на самій собі, а не в `geometry` — тут
   * читалось лише друге, і стільниця з нішею вікна малювалась на кресленні
   * прямокутником за габаритом. Імена сторін такого контуру — за угодою
   * customPoints (id точки = ребро, що в ній закінчується), а не за
   * порядковим номером A–D.
   */
  const customPoints = detail.geometry?.customPoints
    || (detail as { customPoints?: Array<{ x: number; y: number; id?: string; closeId?: string }> }).customPoints
    || [];
  const isCustom = customPoints.length > 0;
  const points = useMemo(() => {
    if (isCustom) return customPoints;
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
      if (isCustom) {
        const first = pts[0] as { id?: string; closeId?: string };
        id = i === pts.length - 1 ? (first.closeId ?? first.id ?? "") : ((p2 as { id?: string }).id ?? "");
      } else if (detail.kind === "u" || detail.kind === "l") {
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
              
              {/* Розмір: просто цифра, і вона ж поле вводу */}
              <DimValue
                x={textX}
                y={textY}
                rotate={-angle}
                fontSize={fontSize}
                value={seg.length}
                editable={Boolean(seg.id) && canEdit(seg.id as string)}
                editing={Boolean(seg.id) && editingSide === seg.id}
                onStart={() => setEditingSide(seg.id as string)}
                onCommit={(next) => commit(seg.id as string, next)}
                onCancel={() => setEditingSide(null)}
              />
              
              {/* Літера сторони всередині контуру; зелена — закрита замком */}
              {seg.id && (
                <SideBadge
                  x={seg.midX - seg.nx * (boxSize * 0.8)}
                  y={seg.midY - seg.ny * (boxSize * 0.8)}
                  size={boxSize}
                  fontSize={fontSize}
                  id={seg.id}
                  locked={lockedSides?.has(seg.id)}
                  lockable={Boolean(onToggleSideLock) && sideIsLockable(detail, seg.id)}
                  onToggle={() => onToggleSideLock?.(seg.id!)}
                />
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
              {/* Ø лишається позначкою (як λ у П-подібної), редагується число */}
              {isCircle && (
                <text x={cx - fontSize * 1.6} y={dimY - textOffset * 0.5} fill="#64748b" fontSize={fontSize} fontFamily="sans-serif" textAnchor="middle" dominantBaseline="central">
                  Ø
                </text>
              )}
              <DimValue
                x={isCircle ? cx + fontSize * 0.5 : cx}
                y={dimY - textOffset * 0.5}
                rotate={0}
                fontSize={fontSize}
                value={Math.round(w)}
                editable={canEdit(isCircle ? DIAMETER_SIDE : ELLIPSE_W_SIDE)}
                editing={editingSide === (isCircle ? DIAMETER_SIDE : ELLIPSE_W_SIDE)}
                onStart={() => setEditingSide(isCircle ? DIAMETER_SIDE : ELLIPSE_W_SIDE)}
                onCommit={(next) => commit(isCircle ? DIAMETER_SIDE : ELLIPSE_W_SIDE, next)}
                onCancel={() => setEditingSide(null)}
              />
              {!isCircle && (
                <>
                  <line x1={w} y1={0} x2={dimX} y2={0} stroke="#cbd5e1" strokeWidth={Math.max(w, h) * 0.002} />
                  <line x1={w} y1={h} x2={dimX} y2={h} stroke="#cbd5e1" strokeWidth={Math.max(w, h) * 0.002} />
                  <line x1={dimX} y1={0} x2={dimX} y2={h} stroke="#64748b" strokeWidth={Math.max(w, h) * 0.004} />
                  <DimValue
                    x={dimX + textOffset * 0.5}
                    y={cy}
                    rotate={-90}
                    fontSize={fontSize}
                    value={Math.round(h)}
                    editable={canEdit(ELLIPSE_H_SIDE)}
                    editing={editingSide === ELLIPSE_H_SIDE}
                    onStart={() => setEditingSide(ELLIPSE_H_SIDE)}
                    onCommit={(next) => commit(ELLIPSE_H_SIDE, next)}
                    onCancel={() => setEditingSide(null)}
                  />
                </>
              )}
              {quadrants.map(([id, a]) => {
                const qx = cx + Math.cos(a) * (w / 2) * 0.72;
                const qy = cy + Math.sin(a) * (h / 2) * 0.72;
                return (
                  <g key={id}>
                    <SideBadge x={qx} y={qy} size={boxSize} fontSize={fontSize} id={id} />
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* ШИРИНА ПЕРЕМИЧКИ П-подібної.
            До 04.09.2026 це була жирна ЧЕРВОНА стріла точно по центру
            перемички — рівно там, де стоять сині бейджі сторін A та E, і
            підпис («λ», колишня «Ширина») лягав просто на них. Тепер це
            звичайний розмір креслення: тонкий, сірий, зміщений на чверть
            вирізу від його лівого краю, тому нічого не перекриває. */}
        {uShapeProps && uShapeProps.topBarHeight > 0 && (() => {
          const x = uShapeProps.cutOff + uShapeProps.cutW * 0.25;
          const tick = boxSize * 0.26;
          return (
            <g>
              <line x1={x} y1={0} x2={x} y2={uShapeProps.topBarHeight} stroke="#64748b" strokeWidth={Math.max(w, h) * 0.003} />
              <polygon points={`${x},0 ${x - tick},${tick * 2} ${x + tick},${tick * 2}`} fill="#64748b" />
              <polygon points={`${x},${uShapeProps.topBarHeight} ${x - tick},${uShapeProps.topBarHeight - tick * 2} ${x + tick},${uShapeProps.topBarHeight - tick * 2}`} fill="#64748b" />
              {/* λ лишає свою літеру: квадратика-бейджа в неї немає,
                  без позначки цифра висіла б у повітрі. */}
              <text
                x={x + fontSize * 0.75}
                y={uShapeProps.topBarHeight / 2 + fontSize * 1.5}
                fill="#64748b"
                fontSize={fontSize * 0.95}
                fontFamily="sans-serif"
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(-90, ${x + fontSize * 0.75}, ${uShapeProps.topBarHeight / 2 + fontSize * 1.5})`}
              >
                λ
              </text>
              <DimValue
                x={x + fontSize * 0.75}
                y={uShapeProps.topBarHeight / 2 - fontSize * 0.4}
                rotate={-90}
                fontSize={fontSize}
                value={Math.round(uShapeProps.topBarHeight)}
                editable={canEdit(WIDTH_SIDE)}
                editing={editingSide === WIDTH_SIDE}
                onStart={() => setEditingSide(WIDTH_SIDE)}
                onCommit={(next) => commit(WIDTH_SIDE, next)}
                onCancel={() => setEditingSide(null)}
              />
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
