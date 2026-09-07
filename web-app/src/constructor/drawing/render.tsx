/**
 * РЕНДЕР АРКУША — сутності → SVG за стилем цеху — 04.09.2026, розширено 06.09.
 *
 * Тут немає жодного рішення «що малювати» — лише «як»: шар дає колір,
 * товщину і тип лінії (ШАРИ, ЛН-1), текстовий стиль — шрифт і висоту
 * (ШР-1/2), розмір — стрілки й виносні за ШР-3, виноска — текст і тонка
 * лінія без полиці (ВН-1), зигзаг — тип лінії кромки (КР-1), штриховка —
 * матеріал (ШТ-1), штамп — таблиця «поле | значення» ліворуч унизу (ШП-1),
 * номер аркуша — рамка праворуч унизу (ШП-2), заголовок над рамкою (ЗГ-1).
 * 06.09: аркуш будь-якого розміру (A4 портрет для специфікації), підзаголовок
 * у рамці, вкладені креслення профілів з каталогу (`svg`), балони, розрізи з
 * явним місцем або в ряд біля штампа з переносом.
 */
import type { BalloonEntity, DimEntity, DrawingSheet, Entity, LeaderEntity, Pt, SectionView } from './model';
import { DIMSTYLE, HATCH, LAYERS, SHEET, TEXT, ZIGZAG, type TextStyleName } from './style';
import { layoutSections } from './layoutSections';

const DASH: Record<string, string | undefined> = { continuous: undefined, dashed: '1.6 0.9', center: '3 0.7 0.5 0.7', zigzag: undefined };

export function DrawingSvg({ sheet, className }: { sheet: DrawingSheet; className?: string }) {
  const fr = sheet.frame;
  const stampH = sheet.noStamp ? 0 : sheet.stamp.fields.length * SHEET.stamp.rowH;
  const stampY = fr.y + fr.h - stampH;
  // РЗ-2: розрізи без явного місця — рядами біля штампа (спільна розкладка з компонувальником)
  const placedAuto = layoutSections(sheet.sections, fr, stampH, Boolean(sheet.noStamp)).placed;
  return (
    <svg viewBox={`0 0 ${sheet.size.w} ${sheet.size.h}`} className={`drawing-sheet ${className ?? 'w-full h-full bg-white'}`} style={{ fontFamily: TEXT.dim.family }}>
      <defs>
        <pattern id={HATCH.stone.id} width={HATCH.stone.step} height={HATCH.stone.step} patternUnits="userSpaceOnUse" patternTransform={`rotate(${HATCH.stone.angle})`}>
          <line x1="0" y1="0" x2="0" y2={HATCH.stone.step} stroke="#000" strokeWidth="0.12" />
        </pattern>
        <pattern id={HATCH.plywood.id} width={HATCH.plywood.step} height={HATCH.plywood.step} patternUnits="userSpaceOnUse" patternTransform={`rotate(${HATCH.plywood.angle})`}>
          <path d={`M 0 0 V ${HATCH.plywood.step} M 0 0 H ${HATCH.plywood.step}`} stroke="#000" strokeWidth="0.1" fill="none" />
        </pattern>
        <pattern id={HATCH.red.id} width={HATCH.red.step} height={HATCH.red.step} patternUnits="userSpaceOnUse" patternTransform={`rotate(${HATCH.red.angle})`}>
          <line x1="0" y1="0" x2="0" y2={HATCH.red.step} stroke="#ff0000" strokeWidth="0.14" />
        </pattern>
        <pattern id={HATCH.grey.id} width={HATCH.grey.step} height={HATCH.grey.step} patternUnits="userSpaceOnUse" patternTransform={`rotate(${HATCH.grey.angle})`}>
          <path d={`M 0 0 V ${HATCH.grey.step} M 0 0 H ${HATCH.grey.step}`} stroke="#9a9a9a" strokeWidth="0.1" fill="none" />
        </pattern>
        <marker id="dw-arrow-grey" viewBox="0 0 10 10" refX="10" refY="5" markerWidth={DIMSTYLE.dimasz} markerHeight={DIMSTYLE.dimasz} markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 1.6 L 10 5 L 0 8.4 z" fill={LAYERS['Размер'].color} /></marker>
        <marker id="dw-arrow-black" viewBox="0 0 10 10" refX="10" refY="5" markerWidth={DIMSTYLE.dimasz} markerHeight={DIMSTYLE.dimasz} markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 1.6 L 10 5 L 0 8.4 z" fill="#000" /></marker>
      </defs>
      <rect x={0} y={0} width={sheet.size.w} height={sheet.size.h} fill="#fff" />
      {sheet.header && <text x={sheet.size.w / 2} y={fr.y - 4} fontSize={TEXT.title.size} textAnchor="middle" fill="#000">{sheet.header}</text>}
      <rect x={fr.x} y={fr.y} width={fr.w} height={fr.h} fill="none" stroke={LAYERS['Рамка'].color} strokeWidth={LAYERS['Рамка'].weight} />
      {sheet.title && <text x={fr.x + 4} y={fr.y + 6.5} {...fontAttrs('subtitle')} fill="#000">{sheet.title}</text>}

      {sheet.entities.map((e, i) => <EntityView key={i} e={e} />)}

      {sheet.sections.filter((s) => s.at).map((s, i) => <SectionBlock key={`s${i}`} s={s} x={s.at!.x} y={s.at!.y} />)}
      {placedAuto.map((p, i) => <SectionBlock key={`a${i}`} s={p.s} x={p.x} y={p.y} />)}

      {/* ШП-1 */}
      {!sheet.noStamp && (
        <g transform={`translate(${fr.x} ${stampY})`}>
          {sheet.stamp.title && <text x={1.5} y={-1.5} {...fontAttrs('stamp')} fontWeight={700} fill="#000">{sheet.stamp.title}</text>}
          {sheet.stamp.fields.map((f, i) => (
            <g key={f.key}>
              <rect x={0} y={i * SHEET.stamp.rowH} width={SHEET.stamp.w} height={SHEET.stamp.rowH} fill="#fff" stroke={LAYERS['Штамп'].color} strokeWidth={LAYERS['Штамп'].weight} />
              <line x1={SHEET.stamp.keyW} y1={i * SHEET.stamp.rowH} x2={SHEET.stamp.keyW} y2={(i + 1) * SHEET.stamp.rowH} stroke={LAYERS['Штамп'].color} strokeWidth={LAYERS['Штамп'].weight} />
              <text x={1.5} y={i * SHEET.stamp.rowH + SHEET.stamp.rowH * 0.7} fontSize={TEXT.stamp.size} fill="#000">{f.key}</text>
              <text x={SHEET.stamp.keyW + 2} y={i * SHEET.stamp.rowH + SHEET.stamp.rowH * 0.7} fontSize={TEXT.stamp.size} fill={f.color ?? '#000'}>{f.value}</text>
            </g>
          ))}
        </g>
      )}
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

/** Внутрішній вміст каталожного <svg …>…</svg> без зовнішнього тега. */
function innerSvg(svg: string): { inner: string; viewBox: string } {
  const open = svg.indexOf('>'); const close = svg.lastIndexOf('</svg>');
  const head = svg.slice(0, open);
  const vb = /viewBox="([^"]+)"/.exec(head)?.[1] ?? '0 0 100 50';
  return { inner: open >= 0 && close > open ? svg.slice(open + 1, close) : svg, viewBox: vb };
}

export function EntityView({ e }: { e: Entity }) {
  const L = LAYERS[e.layer];
  switch (e.kind) {
    case 'polyline': {
      const d = e.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + (e.closed ? ' Z' : '');
      const fill = e.fillColor ? e.fillColor : e.fill === 'white' ? '#fff' : e.fill === 'hatch-stone' ? `url(#${HATCH.stone.id})` : e.fill === 'hatch-plywood' ? `url(#${HATCH.plywood.id})` : e.fill === 'hatch-red' ? `url(#${HATCH.red.id})` : e.fill === 'hatch-grey' ? `url(#${HATCH.grey.id})` : e.fill === 'glue' ? '#ffe28a' : 'none';
      const dash = e.dashed ? DASH.dashed : DASH[L.linetype];
      if (e.rx && e.points.length === 4) {
        const xs = e.points.map((p) => p.x); const ys = e.points.map((p) => p.y);
        return <rect x={Math.min(...xs)} y={Math.min(...ys)} width={Math.max(...xs) - Math.min(...xs)} height={Math.max(...ys) - Math.min(...ys)} rx={e.rx} fill={fill} stroke={e.color ?? L.color} strokeWidth={e.weight ?? L.weight} strokeDasharray={dash} />;
      }
      return <path d={d} fill={fill} stroke={e.color ?? L.color} strokeWidth={e.weight ?? L.weight} strokeLinejoin="round" strokeDasharray={dash} />;
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
      return <text x={e.at.x} y={e.at.y} {...f} fontWeight={e.bold ? 700 : f.fontWeight} textAnchor={e.anchor ?? 'start'} fill={e.color ?? L.color} transform={tr} textDecoration={e.underline ? 'underline' : undefined}>{e.text}</text>;
    }
    case 'dim':
      return <DimView e={e} />;
    case 'leader':
      return <LeaderView e={e} />;
    case 'svg': {
      const { inner, viewBox } = innerSvg(e.svg);
      return <svg x={e.at.x} y={e.at.y} width={e.w} height={e.h} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: inner }} />;
    }
    case 'balloon':
      return <BalloonView e={e} />;
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
  const dir = Math.sign(e.offset) || 1;
  const extA = { x: e.a.x + nx * sgn * DIMSTYLE.dimexo * dir, y: e.a.y + ny * sgn * DIMSTYLE.dimexo * dir };
  const extB = { x: e.b.x + nx * sgn * DIMSTYLE.dimexo * dir, y: e.b.y + ny * sgn * DIMSTYLE.dimexo * dir };
  const overA = { x: A.x + nx * sgn * DIMSTYLE.dimexe * dir, y: A.y + ny * sgn * DIMSTYLE.dimexe * dir };
  const overB = { x: B.x + nx * sgn * DIMSTYLE.dimexe * dir, y: B.y + ny * sgn * DIMSTYLE.dimexe * dir };
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  let rot = ang > 90 || ang < -90 ? ang + 180 : ang;
  if (rot > 45) rot -= 180; // вертикальний розмір читається знизу вгору
  // текст завжди «над» розмірною лінією відносно читання (угору / ліворуч)
  const up = Math.abs(rot) > 45 ? { x: -Math.abs(nx), y: 0 } : { x: 0, y: -Math.abs(ny) };
  const tx = mid.x + up.x * (DIMSTYLE.dimgap + 0.4);
  const ty = mid.y + up.y * (DIMSTYLE.dimgap + 0.4);
  const short = len < DIMSTYLE.dimasz * 2.4;
  const outside = len < TEXT.dim.size * 0.6 * e.text.length + 2;
  const tPos = outside && Math.abs(rot) <= 45 ? { x: B.x + 1 + (e.text.length * TEXT.dim.size * 0.56) / 2, y: ty } : { x: tx, y: ty };
  return (
    <g>
      <line x1={extA.x} y1={extA.y} x2={overA.x} y2={overA.y} stroke={color} strokeWidth={w} />
      <line x1={extB.x} y1={extB.y} x2={overB.x} y2={overB.y} stroke={color} strokeWidth={w} />
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={color} strokeWidth={w} markerStart={short ? undefined : marker} markerEnd={short ? undefined : marker} />
      <text x={tPos.x} y={tPos.y} fontSize={TEXT.dim.size} textAnchor="middle" fill={color} transform={`rotate(${rot} ${tPos.x} ${tPos.y})`}>{e.text}</text>
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

function BalloonView({ e }: { e: BalloonEntity }) {
  const color = e.color ?? '#000';
  return (
    <g>
      {e.target && <line x1={e.c.x} y1={e.c.y} x2={e.target.x} y2={e.target.y} stroke={color} strokeWidth={LAYERS['Виноска'].weight} />}
      <circle cx={e.c.x} cy={e.c.y} r={e.r} fill="#fff" stroke={color} strokeWidth={0.25} />
      <text x={e.c.x} y={e.c.y + e.r * 0.42} fontSize={e.r * 1.2} fontWeight={700} textAnchor="middle" fill={color}>{e.text}</text>
    </g>
  );
}

function SectionBlock({ s, x, y }: { s: SectionView; x: number; y: number }) {
  const isCut = /^[A-ZА-Я0-9]{1,2}-[A-ZА-Я0-9]{1,2}$/.test(s.title);
  return (
    <g transform={`translate(${x} ${y})`}>
      {s.zigzagIcon && <path d={zigzagPath({ x: 0, y: 0 }, { x: 14, y: 0 }, 2.6, 0.9)} fill="none" stroke={s.color ?? '#000'} strokeWidth={LAYERS['Кромка'].weight} />}
      <text x={0} y={4.6} {...fontAttrs(isCut ? 'section' : 'node')} fill={s.color ?? '#000'} textDecoration={isCut ? 'underline' : undefined}>{s.title}</text>
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
