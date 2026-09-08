/**
 * Розгортка стіни (u, z) — 07.09.2026 (журнал №126).
 *
 * ЗК-17/30: панель будують із 3D-контуру стіни, не з лінії на плані.
 * Показуємо контур стіни як прийшов (сірим), полігон панелі після кінців
 * обходу і дублетів (синім), розетки з висотами від НИЗУ панелі (ЗК-19,
 * ЗК-24), базу панелі (ЗК-54) і лінію лазера (ЗК-25). Y перевернуто —
 * z угору.
 */
import type { WallPlane } from './leicaDxf';
import { WText } from './MeasureSvg';
import type { PanelFromWall } from './measureOps';
import { fmt } from '../ui';

export function WallUnfoldSvg({ wall, panel, laserZ }: { wall: WallPlane; panel: PanelFromWall | null; laserZ?: number }) {
  const u0 = wall.uMin; const u1 = wall.uMax; const z0 = Math.min(wall.zMin, panel ? panel.baseZ : wall.zMin); const z1 = wall.zMax;
  const W = Math.max(100, u1 - u0); const H = Math.max(100, z1 - z0);
  const pad = Math.max(W, H) * 0.12;
  const viewBox = `${u0 - pad} ${-(z1 + pad)} ${W + 2 * pad} ${H + 2 * pad}`;
  const stroke = Math.max(0.6, W / 700);
  const font = Math.max(8, W / 60);
  const raw = wall.contourUZ.map((q) => `${q.u},${q.z}`).join(' ');
  // полігон панелі — назад у (u, z) стіни: u від лівого краю панелі + uMin панелі, v + baseZ
  const panelU0 = panel ? panel.uOffset : 0;
  const poly = panel ? panel.polygon.map((p) => `${p.u + panelU0},${p.v + panel.baseZ}`).join(' ') : '';
  return (
    <svg viewBox={viewBox} className="w-full h-full select-none" preserveAspectRatio="xMidYMid meet">
      <g transform="scale(1,-1)">
        {/* база панелі і нуль заміру */}
        <line x1={u0 - pad / 2} y1={0} x2={u1 + pad / 2} y2={0} stroke="#94a3b8" strokeWidth={stroke} strokeDasharray={`${stroke * 4} ${stroke * 3}`} />
        <WText x={u1 + pad / 2} y={0} anchor="end" fill="#64748b" size={font * 0.8}>z = 0 (нуль заміру)</WText>
        {panel && (
          <>
            <line x1={u0 - pad / 2} y1={panel.baseZ} x2={u1 + pad / 2} y2={panel.baseZ} stroke="#22a06b" strokeWidth={stroke} strokeDasharray={`${stroke * 4} ${stroke * 3}`} />
            <WText x={u0 - pad / 2} y={panel.baseZ + font * 0.3} fill="#15803d" size={font * 0.8}>низ панелі +{fmt(panel.baseZ, 0)}</WText>
          </>
        )}
        {laserZ !== undefined && (
          <>
            <line x1={u0} y1={laserZ} x2={u1} y2={laserZ} stroke="#dc2626" strokeWidth={stroke * 0.8} />
            <WText x={u1 + font * 0.5} y={laserZ} fill="#b91c1c" size={font * 0.8}>лазер {fmt(laserZ, 1)}</WText>
          </>
        )}
        {/* сирий контур стіни */}
        <polyline points={raw} fill="none" stroke="#94a3b8" strokeWidth={stroke * 1.2} strokeLinejoin="round" />
        {wall.contourUZ.map((q, i) => <circle key={i} cx={q.u} cy={q.z} r={stroke * 1.6} fill="#94a3b8" />)}
        {/* панель */}
        {panel && <polygon points={poly} fill="rgba(31,147,239,0.08)" stroke="#1f93ef" strokeWidth={stroke * 1.6} strokeLinejoin="round" />}
        {panel && panel.polygon.map((p, i) => {
          const a = panel.angles[i];
          const off = a !== undefined && Math.abs(a - 90) > 0.5 && Math.abs(a - 180) > 0.5;
          return off ? <WText key={i} x={p.u + panelU0 + font * 0.4} y={p.v + panel.baseZ + font * 0.4} fill="#b45309" size={font * 0.75}>{fmt(a, 1)}°</WText> : null;
        })}
        {/* розетки */}
        {wall.sockets.map((s, i) => (
          <g key={i}>
            <rect x={s.uMin} y={s.zMin} width={s.uMax - s.uMin} height={s.zMax - s.zMin} fill="rgba(217,119,6,0.12)" stroke="#d97706" strokeWidth={stroke} />
            <WText x={(s.uMin + s.uMax) / 2} y={s.zMax + font * 0.5} anchor="middle" fill="#92400e" size={font * 0.75}>
              {fmt(s.uMax - s.uMin, 0)}×{fmt(s.zMax - s.zMin, 0)}{panel ? ` · низ ${fmt(s.zMin - panel.baseZ, 0)}` : ` · z ${fmt(s.zMin, 0)}`}
            </WText>
          </g>
        ))}
        {/* габарит панелі */}
        {panel && (
          <>
            <WText x={(u0 + u1) / 2} y={z1 + pad * 0.5} anchor="middle" fill="#1d4ed8" size={font}>{fmt(panel.widthMm, 1)}</WText>
            <WText x={u1 + pad * 0.45} y={(z0 + z1) / 2} anchor="middle" fill="#1d4ed8" size={font}>{fmt(panel.heightMm, 1)}</WText>
          </>
        )}
      </g>
    </svg>
  );
}
