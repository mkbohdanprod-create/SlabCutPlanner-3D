/**
 * РЕНДЕР АРКУША — сутності → SVG за стилем цеху — 04.09.2026.
 *
 * Тут немає жодного рішення «що малювати» — лише «як»: шар дає колір,
 * товщину і тип лінії (ШАРИ, ЛН-1), текстовий стиль — шрифт і висоту
 * (ШР-1/2), розмір — стрілки й виносні за ШР-3, виноска — текст і тонка
 * лінія без полиці (ВН-1), зигзаг — тип лінії кромки (КР-1), штриховка —
 * матеріал (ШТ-1), штамп — таблиця «поле | значення» ліворуч унизу (ШП-1),
 * номер аркуша — рамка праворуч унизу (ШП-2), заголовок над рамкою (ЗГ-1).
 */
import type { DimEntity, DrawingSheet, Entity, LeaderEntity, Pt, SectionView } from './model';
import { DIMSTYLE, HATCH, LAYERS, SHEET, TEXT, ZIGZAG, type TextStyleName } from './style';

const DASH: Record<string, string | undefined> = { continuous: undefined, dashed: '1.6 0.9', center: '3 0.7 0.5 0.7', zigzag: undefined };

export function DrawingSvg({ sheet, className }: { sheet: DrawingSheet; className?: string }) {
  const fr = sheet.frame;
  const stampH = sheet.stamp.fields.length * SHEET.stamp.rowH;
  const stampY = fr.y + fr.h - stampH;
  return (
    <svg viewBox={`0 0 ${sheet.size.w} ${sheet.size.h}`} className={`drawing-sheet ${className ?? 'w-full h-full bg-white'}`} style={{ fontFamily: TEXT.dim.family }}>
      <defs>
        <pattern id={HATCH.stone.id} width={HATCH.stone.step} height={HATCH.stone.step} patternUnits="userSpaceOnUse" patternTransform={`rotate(${HATCH.stone.angle})`}>
          <line x1="0" y1="0" x2="0" y2={HATCH.stone.step} stroke="#000" strokeWidth="0.12" />
        </pattern>
        <pattern id={HATCH.plywood.id} width={HATCH.plywood.step} height={HATCH.plywood.step} patternUnits="userSpaceOnUse" patternTransform={`rotate(${HATCH.plywood.angle})`}>
          <path d={`M 0 0 V ${HATCH.plywood.step} M 0 0 H ${HATCH.plywood.step}`} stroke="#000" strokeWidth="0.1" fill="none" />
        </pattern>
        <marker id="dw-arrow-grey" viewBox="0 0 10 10" refX="10" refY="5" markerWidth={DIMSTYLE.dimasz} markerHeight={DIMSTYLE.dimasz} markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 1.6 L 10 5 L 0 8.4 z" fill={LAYERS['Размер'].color} /></marker>
        <marker id="dw-arrow-black" viewBox="0 0 10 10" refX="10" refY="5" markerWidth={DIMSTYLE.dimasz} markerHeight={DIMSTYLE.dimasz} markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 1.6 L 10 5 L 0 8.4 z" fill="#000" /></marker>
      </defs>
      <rect x={0} y={0} width={sheet.size.w} height={sheet.size.h} fill="#fff" />
      {sheet.header && <text x={sheet.size.w / 2} y={fr.y - 4} fontSize={TEXT.title.size} textAnchor="middle" fill="#000">{sheet.header}</text>}
      <rect x={fr.x} y={fr.y} width={fr.w} height={fr.h} fill="none" stroke={LAYERS['Рамка'].color} strokeWidth={LAYERS['Рамка'].weight} />

      {sheet.entities.map((e, i) => <EntityView key={i} e={e} />)}

      {/* РЗ-2: розрізи праворуч унизу, біля штампа, в один ряд */}
      {(() => {
        let x = fr.x + SHEET.stamp.w + 18;
        return sheet.sections.map((s, i) => {
          const node = <SectionBlock key={i} s={s} x={x} y={stampY + 4} />;
          x += s.w + 10;
          return node;
        });
      })()}

      {/* ШП-1 */}
      <g transform={`translate(${fr.x} ${stampY})`}>
        {sheet.stamp.fields.map((f, i) => (
          <g key={f.key}>
            <rect x={0} y={i * SHEET.stamp.rowH} width={SHEET.stamp.w} height={SHEET.stamp.rowH} fill="#fff" stroke={LAYERS['Штамп'].color} strokeWidth={LAYERS['Штамп'].weight} />
            <line x1={SHEET.stamp.keyW} y1={i * SHEET.stamp.rowH} x2={SHEET.stamp.keyW} y2={(i + 1) * SHEET.stamp.rowH} stroke={LAYERS['Штамп'].color} strokeWidth={LAYERS['Штамп'].weight} />
            <text x={1.5} y={i * SHEET.stamp.rowH + SHEET.stamp.rowH * 0.7} fontSize={TEXT.stamp.size} fill="#000">{f.key}</text>
            <text x={SHEET.stamp.keyW + 2} y={i * SHEET.stamp.rowH + SHEET.stamp.rowH * 0.7} fontSize={TEXT.stamp.size} fill={f.color ?? '#000'}>{f.value}</text>
          </g>
        ))}
      </g>
      {/* ШП-2 */}
      <rect x={fr.x + fr.w - SHEET.sheetNoBox.w} y={fr.y + fr.h - SHEET.sheetNoBox.h} width={SHEET.sheetNoBox.w} height={SHEET.sheetNoBox.h} fill="#fff" stroke="#000" strokeWidth={0.35} />
      <text x={fr.x + fr.w - SHEET.sheetNoBox.w / 2} y={fr.y + fr.h - 1.9} fontSize={TEXT.node.size} textAnchor="middle" fill="#000">Аркуш {sheet.sheetNo}{sheet.sheetNo === 1 ? `/${sheet.sheetCount}` : ''}</text>
    </svg>
  );
}

function fontAttrs(style: TextStyleName) {
  const t = TEXT[style];
  return { fontSize: t.size, fontFamily: t.family, fontWeight: t.weight, fontStyle: t.italic ? 'italic' : 'normal' } as const;
}

export function EntityView({ e }: { e: Entity }) {
  const L = LAYERS[e.layer];
  switch (e.kind) {
    case 'polyline': {
      const d = e.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + (e.closed ? ' Z' : '');
      const fill = e.fill === 'white' ? '#fff' : e.fill === 'hatch-stone' ? `url(#${HATCH.stone.id})` : e.fill === 'hatch-plywood' ? `url(#${HATCH.plywood.id})` : 'none';
      if (e.rx && e.points.length === 4) {
        const xs = e.points.map((p) => p.x); const ys = e.points.map((p) => p.y);
        return <rect x={Math.min(...xs)} y={Math.min(...ys)} width={Math.max(...xs) - Math.min(...xs)} height={Math.max(...ys) - Math.min(...ys)} rx={e.rx} fill={fill} stroke={e.color ?? L.color} strokeWidth={L.weight} strokeDasharray={DASH[L.linetype]} />;
      }
      return <path d={d} fill={fill} stroke={e.color ?? L.color} strokeWidth={L.weight} strokeLinejoin="round" strokeDasharray={DASH[L.linetype]} />;
    }
    case 'circle':
      return <circle cx={e.c.x} cy={e.c.y} r={e.r} fill={e.fill === 'white' ? '#fff' : 'none'} stroke={L.color} strokeWidth={L.weight} />;
    case 'rect':
      return <rect x={Math.min(e.a.x, e.b.x)} y={Math.min(e.a.y, e.b.y)} width={Math.abs(e.b.x - e.a.x)} height={Math.abs(e.b.y - e.a.y)} fill="none" stroke={L.color} strokeWidth={L.weight} strokeDasharray={DASH[L.linetype]} />;
    case 'axis':
      return <line x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke={L.color} strokeWidth={L.weight} strokeDasharray={DASH.center} />;
    case 'zigzag':
      return <path d={zigzagPath(e.a, e.b)} fill="none" stroke={e.color ?? L.color} strokeWidth={L.weight} strokeLinejoin="round" />;
    case 'text': {
      const f = fontAttrs(e.style);
      const tr = e.rotate ? `rotate(${e.rotate} ${e.at.x} ${e.at.y})` : undefined;
      return <text x={e.at.x} y={e.at.y} {...f} textAnchor={e.anchor ?? 'start'} fill={e.color ?? L.color} transform={tr} textDecoration={e.underline ? 'underline' : undefined}>{e.text}</text>;
    }
    case 'dim':
      return <DimView e={e} />;
    case 'leader':
      return <LeaderView e={e} />;
    default:
      return null;
  }
}

/** ШР-3: виносні лінії з відступом dimexo і виносом dimexe, стрілки dimasz, текст над лінією із зазором dimgap. */
function DimView({ e }: { e: DimEntity }) {
  const color = e.grey ? LAYERS['Размер'].color : '#000';
  const marker = e.grey ? 'url(#dw-arrow-grey)' : 'url(#dw-arrow-black)';
  const w = LAYERS['Размер'].weight;
  const dx = e.b.x - e.a.x; const dy = e.b.y - e.a.y; const len = Math.hypot(dx, dy) || 1;
  // нормаль: для горизонтального розміру від'ємний offset — угору
  const nx = dy / len; const ny = -dx / len;
  const sgn = Math.abs(dx) >= Math.abs(dy) ? -1 : 1;
  const ox = nx * e.offset * sgn; const oy = ny * e.offset * sgn;
  const A = { x: e.a.x + ox, y: e.a.y + oy }; const B = { x: e.b.x + ox, y: e.b.y + oy };
  const extA = { x: e.a.x + nx * sgn * DIMSTYLE.dimexo, y: e.a.y + ny * sgn * DIMSTYLE.dimexo };
  const extB = { x: e.b.x + nx * sgn * DIMSTYLE.dimexo, y: e.b.y + ny * sgn * DIMSTYLE.dimexo };
  const overA = { x: A.x + nx * sgn * DIMSTYLE.dimexe, y: A.y + ny * sgn * DIMSTYLE.dimexe };
  const overB = { x: B.x + nx * sgn * DIMSTYLE.dimexe, y: B.y + ny * sgn * DIMSTYLE.dimexe };
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const rot = ang > 90 || ang < -90 ? ang + 180 : ang;
  const tx = mid.x + nx * sgn * DIMSTYLE.dimgap * 1.4 * (Math.abs(rot) > 45 ? -1 : 1);
  const ty = mid.y + ny * sgn * DIMSTYLE.dimgap * 1.4;
  const short = len < DIMSTYLE.dimasz * 2.4;
  return (
    <g>
      <line x1={extA.x} y1={extA.y} x2={overA.x} y2={overA.y} stroke={color} strokeWidth={w} />
      <line x1={extB.x} y1={extB.y} x2={overB.x} y2={overB.y} stroke={color} strokeWidth={w} />
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={color} strokeWidth={w} markerStart={short ? undefined : marker} markerEnd={short ? undefined : marker} />
      <text x={tx} y={ty} fontSize={TEXT.dim.size} textAnchor="middle" fill={color} transform={`rotate(${rot} ${tx} ${ty})`}>{e.text}</text>
    </g>
  );
}

/** ВН-1: текст + тонкі лінії до цілей (ВН-3: кілька), без полиці й стрілки. */
function LeaderView({ e }: { e: LeaderEntity }) {
  const w = LAYERS['Виноска'].weight; const color = e.color ?? LAYERS['Виноска'].color;
  const tr = e.rotate ? `rotate(${e.rotate} ${e.at.x} ${e.at.y})` : undefined;
  return (
    <g>
      {e.targets.map((t, i) => <line key={i} x1={e.at.x - 0.5} y1={e.at.y + 0.6} x2={t.x} y2={t.y} stroke={color} strokeWidth={w} />)}
      <text x={e.at.x} y={e.at.y} {...fontAttrs('node')} fill={color} transform={tr} textDecoration={e.underline ? 'underline' : undefined}>{e.text}</text>
    </g>
  );
}

function SectionBlock({ s, x, y }: { s: SectionView; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {s.zigzagIcon && <path d={zigzagPath({ x: 0, y: 0 }, { x: 14, y: 0 }, 2.6, 0.9)} fill="none" stroke={s.color ?? '#000'} strokeWidth={LAYERS['Кромка'].weight} />}
      <text x={0} y={4.6} {...fontAttrs(s.title.includes('-') ? 'section' : 'node')} fill={s.color ?? '#000'} textDecoration={s.title.includes('-') ? 'underline' : undefined}>{s.title}</text>
      {s.entities.map((e, i) => <EntityView key={i} e={e} />)}
    </g>
  );
}

export function zigzagPath(a: Pt, b: Pt, period = ZIGZAG.period, amp = ZIGZAG.amp): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < period) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const ux = (b.x - a.x) / len; const uy = (b.y - a.y) / len;
  const nx = -uy; const ny = ux;
  const n = Math.max(2, Math.round(len / period));
  const step = len / n;
  let d = `M ${a.x} ${a.y}`;
  for (let i = 1; i <= n; i += 1) {
    const t = i * step; const mid = t - step / 2; const s = i % 2 === 0 ? 1 : -1;
    d += ` L ${a.x + ux * mid + nx * amp * s} ${a.y + uy * mid + ny * amp * s} L ${a.x + ux * t} ${a.y + uy * t}`;
  }
  return d;
}
