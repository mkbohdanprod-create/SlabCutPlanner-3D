/**
 * SVG-полотно заміру — 04.09.2026.
 *
 * Малює відрізки/дуги заміру по шарах, мітки (МТ-1: як є), карту висот
 * (ЗМ-Т9: точка + число). Y перевернуто (DXF → екран). Колесо — масштаб,
 * тягнення — панорама. Приймає додаткові шари (`children`) для зведення:
 * контури виробів, фанера, метал — у тих самих світових координатах.
 */
import React, { useMemo, useRef, useState } from 'react';
import type { MeasureModel } from './leicaDxf';

const LAYER_COLORS = ['#0f172a', '#1f93ef', '#22a06b', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d'];

export function layerColor(layer: string, layers: string[]) {
  const idx = Math.max(0, layers.indexOf(layer));
  return LAYER_COLORS[idx % LAYER_COLORS.length];
}

export interface Viewport { minX: number; minY: number; maxX: number; maxY: number }

export function MeasureSvg({ model, hiddenLayers, children, extraBox, onWorldClick }: {
  model: MeasureModel | null;
  hiddenLayers?: Set<string>;
  children?: React.ReactNode;
  /** Додатковий габарит (вироби), щоб кадр вмістив усе. */
  extraBox?: Viewport | null;
  onWorldClick?: (p: { x: number; y: number }) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const box = useMemo<Viewport>(() => {
    const b = model ? { ...model.bbox } : { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    if (extraBox) {
      b.minX = Math.min(b.minX, extraBox.minX); b.minY = Math.min(b.minY, extraBox.minY);
      b.maxX = Math.max(b.maxX, extraBox.maxX); b.maxY = Math.max(b.maxY, extraBox.maxY);
    }
    const w = Math.max(100, b.maxX - b.minX); const h = Math.max(100, b.maxY - b.minY);
    const pad = Math.max(w, h) * 0.08;
    return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
  }, [model, extraBox]);

  const W = box.maxX - box.minX; const H = box.maxY - box.minY;
  // viewBox у світових координатах з перевернутим Y: малюємо у групі scale(1,-1)
  const vbW = W / zoom; const vbH = H / zoom;
  const cx = (box.minX + box.maxX) / 2 + pan.x; const cy = (box.minY + box.maxY) / 2 + pan.y;
  const viewBox = `${cx - vbW / 2} ${-(cy + vbH / 2)} ${vbW} ${vbH}`;
  const stroke = Math.max(0.5, vbW / 600);
  const font = Math.max(6, vbW / 70);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(40, Math.max(0.2, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };
  const toWorld = (e: React.MouseEvent) => {
    const svg = ref.current; if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const sx = (e.clientX - r.left) / r.width; const sy = (e.clientY - r.top) / r.height;
    return { x: cx - vbW / 2 + sx * vbW, y: cy + vbH / 2 - sy * vbH };
  };
  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; };
  const onMove = (e: React.MouseEvent) => {
    const d = drag.current; const svg = ref.current; if (!d || !svg) return;
    const r = svg.getBoundingClientRect();
    const k = vbW / r.width;
    setPan({ x: d.px - (e.clientX - d.x) * k, y: d.py + (e.clientY - d.y) * k });
  };
  const onUp = (e: React.MouseEvent) => {
    const d = drag.current; drag.current = null;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3 && onWorldClick) { const p = toWorld(e); if (p) onWorldClick(p); }
  };

  const hidden = hiddenLayers ?? new Set<string>();
  const layers = model?.layers ?? [];

  return (
    <svg ref={ref} viewBox={viewBox} className="w-full h-full select-none cursor-grab active:cursor-grabbing" preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { drag.current = null; }}>
      <g transform="scale(1,-1)">
        {/* сітка 500 мм */}
        <Grid box={box} step={500} stroke={stroke * 0.4} />
        {model && model.segments.filter((s) => !hidden.has(s.layer)).map((s) => (
          s.arc
            ? <path key={s.id} d={arcPath(s.arc)} fill="none" stroke={layerColor(s.layer, layers)} strokeWidth={stroke} />
            : <line key={s.id} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={layerColor(s.layer, layers)} strokeWidth={stroke} strokeLinecap="round" />
        ))}
        {/* Карта висот (ЗМ-Т9): точки завжди, числа — лише при наближенні, інакше каша */}
        {model && model.heights.map((h, i) => (
          <g key={`h${i}`}>
            <circle cx={h.x} cy={h.y} r={stroke * 1.5} fill="#a78bfa" />
            {zoom >= 2.5 && <text x={h.x + stroke * 3} y={h.y} fontSize={font * 0.7} fill="#7c3aed" transform={`scale(1,-1) translate(0 ${-2 * h.y})`}>{h.z.toFixed(0)}</text>}
          </g>
        ))}
        {model && model.marks.map((m, i) => (
          <text key={`m${i}`} x={m.x} y={m.y} fontSize={font} fill="#b91c1c" fontWeight="bold" transform={`scale(1,-1) translate(0 ${-2 * m.y})`}>{m.text}</text>
        ))}
        {children}
      </g>
    </svg>
  );
}

function Grid({ box, step, stroke }: { box: Viewport; step: number; stroke: number }) {
  const lines: React.ReactNode[] = [];
  const x0 = Math.floor(box.minX / step) * step; const x1 = Math.ceil(box.maxX / step) * step;
  const y0 = Math.floor(box.minY / step) * step; const y1 = Math.ceil(box.maxY / step) * step;
  if ((x1 - x0) / step > 200 || (y1 - y0) / step > 200) return null;
  for (let x = x0; x <= x1; x += step) lines.push(<line key={`x${x}`} x1={x} y1={y0} x2={x} y2={y1} stroke="#e2e8f0" strokeWidth={stroke} />);
  for (let y = y0; y <= y1; y += step) lines.push(<line key={`y${y}`} x1={x0} y1={y} x2={x1} y2={y} stroke="#e2e8f0" strokeWidth={stroke} />);
  return <g>{lines}</g>;
}

function arcPath(a: { cx: number; cy: number; r: number; startDeg: number; endDeg: number }) {
  const s = (a.startDeg * Math.PI) / 180; let e = (a.endDeg * Math.PI) / 180;
  if (e < s) e += Math.PI * 2;
  const large = e - s > Math.PI ? 1 : 0;
  const x1 = a.cx + a.r * Math.cos(s); const y1 = a.cy + a.r * Math.sin(s);
  const x2 = a.cx + a.r * Math.cos(e); const y2 = a.cy + a.r * Math.sin(e);
  return `M ${x1} ${y1} A ${a.r} ${a.r} 0 ${large} 1 ${x2} ${y2}`;
}

/** Текст у світових координатах з перевернутим Y — щоб літери не були догори дриґом. */
export function WText({ x, y, size, fill = '#0f172a', children, anchor = 'start', weight }: { x: number; y: number; size: number; fill?: string; children: React.ReactNode; anchor?: 'start' | 'middle' | 'end'; weight?: string }) {
  return <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} fontWeight={weight} transform={`scale(1,-1) translate(0 ${-2 * y})`}>{children}</text>;
}
