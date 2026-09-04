/**
 * МАПА РУХУ ПО ЦЕХУ І ТАБЛИЦЯ «ЩО РОБИЛИ З КОЖНОЮ ДЕТАЛЛЮ» — 04.09.2026.
 *
 * Вигляд — як у `КЕЙСИ/<замовлення>/МАРШРУТ_<замовлення>.pdf` з обучалочки: етапи підписами
 * зверху, ділянки коробками, буфери/контроль пунктиром, кроки лише цього
 * замовлення — синім, повернення — помаранчевим пунктиром знизу
 * (МЕС-9: маршрут — граф), «НЕ БЕРУТЬ УЧАСТІ» — сірим. Дані — з
 * `routeMap.ts`, тут лише малювання.
 */
import type { RouteModel, RouteNode } from './routeMap';

const BOX_W = 186; const BOX_H = 56; const GAP_X = 30; const ROW_H = 118; const PER_ROW = 5;
const PAD_X = 16; const PAD_TOP = 34;

interface Placed { node: RouteNode; x: number; y: number; row: number; col: number }

export function RouteMap({ model }: { model: RouteModel }) {
  // Потік — активні вузли у порядку ВЦ-1; метал — паралельна гілка
  const flow = model.nodes.filter((n) => n.active && n.id !== 'metal');
  const metal = model.nodes.find((n) => n.id === 'metal' && n.active);
  const absent = model.nodes.filter((n) => !n.active);

  const placed: Placed[] = flow.map((node, i) => ({
    node, row: Math.floor(i / PER_ROW), col: i % PER_ROW,
    x: PAD_X + (i % PER_ROW) * (BOX_W + GAP_X), y: PAD_TOP + Math.floor(i / PER_ROW) * ROW_H,
  }));
  const rows = Math.max(1, Math.ceil(flow.length / PER_ROW));
  const byId = new Map(placed.map((p) => [p.node.id, p]));
  const width = PAD_X * 2 + PER_ROW * BOX_W + (PER_ROW - 1) * GAP_X;
  const absentY = PAD_TOP + rows * ROW_H + 8;
  const height = absentY + (absent.length ? 58 : 0) + 16 + (metal ? 0 : 0);

  const stageStarts = new Set<string>();
  const seen = new Set<string>();
  for (const p of placed) { if (!seen.has(p.node.stage)) { seen.add(p.node.stage); stageStarts.add(p.node.id); } }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" style={{ fontFamily: 'Segoe UI, Roboto, Arial, sans-serif' }}>
      <defs>
        <marker id="rm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#1f93ef" />
        </marker>
        <marker id="rm-arrow-loop" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#d97706" />
        </marker>
      </defs>

      {/* стрілки потоку */}
      {placed.slice(1).map((p, i) => {
        const prev = placed[i];
        if (prev.row === p.row) {
          return <line key={`e${i}`} x1={prev.x + BOX_W} y1={prev.y + BOX_H / 2} x2={p.x - 2} y2={p.y + BOX_H / 2} stroke="#1f93ef" strokeWidth={1.6} markerEnd="url(#rm-arrow)" />;
        }
        // перехід на наступний ряд: вниз від останнього, вліво, і в перший
        const midY = prev.y + BOX_H + (ROW_H - BOX_H) / 2;
        const d = `M ${prev.x + BOX_W / 2} ${prev.y + BOX_H} V ${midY} H ${p.x + BOX_W / 2} V ${p.y - 2}`;
        return <path key={`e${i}`} d={d} fill="none" stroke="#1f93ef" strokeWidth={1.6} markerEnd="url(#rm-arrow)" />;
      })}

      {/* петлі повернення (МЕС-9) */}
      {model.loops.map((l, i) => {
        const a = byId.get(l.from); const b = byId.get(l.to);
        if (!a || !b) return null;
        const ax = a.x + BOX_W / 2; const ay = a.y + BOX_H;
        const bx = b.x + BOX_W / 2; const by = b.y + BOX_H;
        const dip = Math.max(ay, by) + 26 + i * 14;
        const d = `M ${ax} ${ay} C ${ax} ${dip}, ${bx} ${dip}, ${bx} ${by + 2}`;
        return (
          <g key={`l${i}`}>
            <path d={d} fill="none" stroke="#d97706" strokeWidth={1.4} strokeDasharray="6 4" markerEnd="url(#rm-arrow-loop)" />
            <text x={(ax + bx) / 2} y={dip - 3} fontSize={9.5} textAnchor="middle" fill="#b45309">{l.rule}: {l.label}</text>
          </g>
        );
      })}

      {/* металокаркас — паралельна гілка до монтажу */}
      {metal && (() => {
        const target = byId.get('montage') ?? placed[placed.length - 1];
        const x = target.x; const y = target.y - ROW_H + (ROW_H - BOX_H) / 2 - 4;
        const safeY = y < PAD_TOP ? PAD_TOP : y;
        return (
          <g>
            <Box node={metal} x={x} y={safeY} />
            <line x1={x + BOX_W / 2} y1={safeY + BOX_H} x2={target.x + BOX_W / 2} y2={target.y - 2} stroke="#7c3aed" strokeWidth={1.4} strokeDasharray="5 4" markerEnd="url(#rm-arrow)" />
          </g>
        );
      })()}

      {/* коробки і підписи етапів */}
      {placed.map((p) => (
        <g key={p.node.id}>
          {stageStarts.has(p.node.id) && <text x={p.x} y={p.y - 8} fontSize={9} fontWeight={700} fill="#94a3b8" letterSpacing={1}>{p.node.stage}</text>}
          <Box node={p.node} x={p.x} y={p.y} />
        </g>
      ))}

      {/* не беруть участі */}
      {absent.length > 0 && (
        <g>
          <text x={PAD_X} y={absentY + 8} fontSize={9} fontWeight={700} fill="#94a3b8" letterSpacing={1}>НЕ БЕРУТЬ УЧАСТІ</text>
          {absent.map((n, i) => {
            const w = Math.min(BOX_W, (width - PAD_X * 2 - (absent.length - 1) * 12) / absent.length);
            const x = PAD_X + i * (w + 12);
            return (
              <g key={n.id}>
                <rect x={x} y={absentY + 14} width={w} height={40} rx={5} fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="4 3" />
                <text x={x + 8} y={absentY + 30} fontSize={10.5} fontWeight={700} fill="#94a3b8">{n.label}</text>
                <text x={x + 8} y={absentY + 44} fontSize={8.5} fill="#94a3b8">{truncate(n.why ?? '', Math.floor(w / 5.2))}</text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

function Box({ node, x, y }: { node: RouteNode; x: number; y: number }) {
  const control = node.kind === 'control';
  const external = node.kind === 'external';
  const fill = node.highlight ? '#eaf4ff' : control ? '#f8fafc' : '#ffffff';
  const stroke = node.highlight ? '#1f93ef' : external ? '#7c3aed' : control ? '#cbd5e1' : '#0f172a';
  return (
    <g>
      <rect x={x} y={y} width={BOX_W} height={BOX_H} rx={6} fill={fill} stroke={stroke} strokeWidth={node.highlight ? 1.6 : 1.2} strokeDasharray={control ? '4 3' : undefined} />
      {control && <text x={x + 10} y={y + 13} fontSize={7.5} fontWeight={700} fill="#94a3b8" letterSpacing={1}>КОНТРОЛЬ</text>}
      <text x={x + 10} y={y + (control ? 27 : 21)} fontSize={11.5} fontWeight={700} fill="#0f172a">{node.label}</text>
      {node.sub.slice(0, 2).map((s, i) => (
        <text key={i} x={x + 10} y={y + (control ? 41 : 35) + i * 12} fontSize={8.8} fill={node.highlight ? '#1f6fb5' : '#475569'}>{truncate(s, 34)}</text>
      ))}
    </g>
  );
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

const ROLE_LABEL: Record<string, string> = {
  main: '', leg: 'опора', sink: 'мийка', thickening: 'потовщення', fold: 'підворот', skirting: 'плінтус', other: '',
};

export function PartsRouteTable({ model }: { model: RouteModel }) {
  const cols = ['ПИЛА', 'ВОДА', 'ЧПК NC300', ...(model.hasSpec ? ['МИЙКИ / ПОКЛЕЙКА'] : []), 'ШЛІФ / ФАСКА', 'КОСМ.'];
  return (
    <table className="w-full text-[11.5px] ctor-route">
      <thead>
        <tr className="text-left text-slate-500 uppercase tracking-wide text-[9.5px]">
          <th>Деталь</th>{cols.map((c) => <th key={c}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {model.parts.map((p) => (
          <tr key={p.partId} className="align-top">
            <td className="w-[150px]">
              <div className="font-bold text-slate-800">{p.name}</div>
              {ROLE_LABEL[p.role] && <div className="text-slate-500">{ROLE_LABEL[p.role]}</div>}
              <div className="text-slate-400">чистовий {p.nominal}</div>
              {p.blank && <div className="text-slate-400">заготовка <span className="text-slate-600 font-semibold">{p.blank}</span></div>}
              {p.slab && <div className="text-slate-400">{p.slab}</div>}
            </td>
            <Cell items={p.pila} />
            <Cell items={p.voda} />
            <Cell items={p.chpk} />
            {model.hasSpec && <Cell items={p.spec} />}
            <Cell items={p.grind} />
            <td className="text-center text-emerald-600 font-bold">{p.cosm ? '✓' : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({ items }: { items: string[] }) {
  return <td className="text-slate-700">{items.length ? items.map((s, i) => <div key={i} className="mb-0.5">{s}</div>) : <span className="text-slate-300">—</span>}</td>;
}

export const RouteLegend = () => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-slate-500 mt-1">
    <span><span className="inline-block w-3 h-3 border border-slate-800 rounded-sm align-middle mr-1 bg-white" />ділянка з послугами</span>
    <span><span className="inline-block w-3 h-3 border border-sky-500 rounded-sm align-middle mr-1 bg-sky-50" />крок лише цього замовлення</span>
    <span><span className="inline-block w-3 h-3 border border-dashed border-slate-400 rounded-sm align-middle mr-1 bg-slate-50" />контроль / логістика, без білінгу</span>
    <span><span className="inline-block w-6 border-t-2 border-dashed border-amber-500 align-middle mr-1" />повернення на ділянку (МЕС-9)</span>
    <span><span className="inline-block w-6 border-t-2 border-dashed border-violet-500 align-middle mr-1" />паралельна гілка</span>
  </div>
);

export default RouteMap;
