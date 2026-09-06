/**
 * Картинка розкладки: контур поверхні, отвори, плитки (цілі — світлі,
 * підрізані — штрихом), бордюр «периметр + центр». Одна на редактор
 * розкладки і на меню створення; масштабується під контейнер.
 */
import React, { useMemo } from 'react';
import type { LayoutResult } from '../../../engines/tileLayout';
import type { Surface } from '../../../domain/architecture';

export function LayoutPreview({ surface, result, className = '', showLabels = true }: {
  surface: Surface; result: LayoutResult; className?: string; showLabels?: boolean;
}) {
  const vb = useMemo(() => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const p of surface.points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const pad = Math.max(maxX - minX, maxY - minY) * 0.04 + 50;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [surface.points]);
  const px = (n: number) => (n * vb.w) / 1000; // «умовний піксель» відносно ширини
  const wall = surface.kind === 'wall';
  const path = (pts: { x: number; y: number }[]) => `M${pts.map((p) => `${p.x} ${p.y}`).join('L')}Z`;
  return (
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className={className} preserveAspectRatio="xMidYMid meet" style={{ background: '#fff' }}>
      <defs>
        <pattern id="lay-cut" width={px(6)} height={px(6)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={px(6)} stroke="#f59e0b" strokeWidth={px(1.2)} />
        </pattern>
        <pattern id="lay-hole" width={px(6)} height={px(6)} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1={0} y1={0} x2={0} y2={px(6)} stroke="#64748b" strokeWidth={px(1)} />
        </pattern>
        <clipPath id="lay-clip">
          <path d={`${path(surface.points)} ${surface.openings.map(path).join(' ')}`} clipRule="evenodd" />
        </clipPath>
      </defs>
      {/* Стіна малюється як розгортка: v угору → перевертаємо по Y */}
      <g transform={wall ? `translate(0 ${vb.y * 2 + vb.h}) scale(1 -1)` : undefined}>
        <path d={path(surface.points)} fill="#f8fafc" stroke="none" />
        <g clipPath="url(#lay-clip)">
          {result.pieces.map((p) => (
            <path
              key={p.id}
              d={path(p.points)}
              fill={p.border ? '#e2e8f0' : p.full ? '#ffffff' : 'url(#lay-cut)'}
              stroke={p.border ? '#475569' : '#334155'}
              strokeWidth={px(p.border ? 1.4 : 0.8)}
              strokeLinejoin="round"
            />
          ))}
        </g>
        {surface.openings.map((o, i) => <path key={i} d={path(o)} fill="url(#lay-hole)" stroke="#475569" strokeWidth={px(1)} />)}
        <path d={path(surface.points)} fill="none" stroke="#0f172a" strokeWidth={px(2)} />
        {showLabels && surface.points.map((p, i) => {
          const q = surface.points[(i + 1) % surface.points.length];
          const len = Math.round(Math.hypot(q.x - p.x, q.y - p.y));
          const mx = (p.x + q.x) / 2; const my = (p.y + q.y) / 2;
          const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
          const flip = ang > 90 || ang < -90 ? ang + 180 : ang;
          return (
            <text key={i} x={mx} y={my} fontSize={px(12)} fill="#0f172a" textAnchor="middle" transform={`${wall ? `translate(${mx} ${my}) scale(1 -1) translate(${-mx} ${-my}) ` : ''}rotate(${flip} ${mx} ${my}) translate(0 ${-px(4)})`} style={{ fontFamily: 'Roboto, sans-serif' }}>
              {len}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

export const StatCell = ({ label, value, unit, tone }: { label: string; value: React.ReactNode; unit?: string; tone?: 'amber' | 'green' }) => (
  <div className={`flex flex-col rounded-md border px-2.5 py-1.5 min-w-[92px] ${tone === 'amber' ? 'border-amber-200 bg-amber-50' : tone === 'green' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
    <span className="text-[10.5px] uppercase tracking-wide text-slate-500">{label}</span>
    <span className="text-[15px] font-bold text-slate-800 leading-tight">{value}{unit && <span className="text-[11px] font-medium text-slate-500 ml-1">{unit}</span>}</span>
  </div>
);
