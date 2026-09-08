import { useMemo, useState } from 'react';
import type { DetailDraft } from '../forms/utils/draftHelpers';
import { curvedContour, isCurvedKind } from '../../domain/baseContour';
import { DIAMETER_SIDE, ELLIPSE_H_SIDE, ELLIPSE_W_SIDE, sideIsLockable, WIDTH_SIDE } from '../../domain/sideLocks';
import {
  jointAnchorPoints, jointAxisForSide, jointFieldPairs, manualJointPosition,
  nearestAnchorId, referenceSideForJoint, referenceSideInField, type JointSideSegment,
} from '../../domain/joints';
import { toDetailShape } from '../../domain/elementToDetail';

/**
 * БЕЙДЖ СТОРОНИ НА КРЕСЛЕННІ (04.09.2026).
 *
 * Білий квадратик — звичайна сторона, зелений — закрита замком. Клік по
 * квадратику замикає і відмикає: власник просив ставити замки просто на
 * рисунку, а не бігати очима в таблицю. Був суцільно синій — тоді стан
 * замка на кресленні не читався взагалі.
 */
function SideBadge({ x, y, size, fontSize, id, locked, lockable, onToggle, picked, candidate, pickable }: {
  x: number; y: number; size: number; fontSize: number; id: string;
  locked?: boolean; lockable?: boolean; onToggle?: () => void;
  /** №137: сторона обрана під стик — зелена, як намалював власник. */
  picked?: boolean;
  /** Сторона, з якою обрану ще МОЖНА зістикувати — жовта (крок вибору пари). */
  candidate?: boolean;
  pickable?: boolean;
}) {
  const green = picked || locked;
  const amber = candidate && !green;
  return (
    <g
      onClick={(lockable || pickable) ? onToggle : undefined}
      style={(lockable || pickable) ? { cursor: 'pointer' } : undefined}
    >
      {pickable && <title>{candidate ? `Клік — стик із стороною ${id}` : `Клік — обрати сторону ${id} для стику`}</title>}
      {lockable && !pickable && <title>{locked ? `Розмір ${id} закріплено — клік знімає замок` : `Клік — закріпити розмір ${id}`}</title>}
      <rect
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        fill={green ? '#22c55e' : amber ? '#fde68a' : '#ffffff'}
        stroke={green ? '#15803d' : amber ? '#b45309' : '#94a3b8'}
        strokeWidth={size * 0.06}
        rx={size * 0.15}
      />
      <text
        x={x}
        y={y}
        fill={green ? '#ffffff' : amber ? '#78350f' : '#334155'}
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
      /* №133: білий ореол під цифрою — там, де розмір лягає на контур або на
         сусідню лінію, цифра лишається читабельною без «підкладок»-плашок. */
      stroke="#ffffff"
      strokeWidth={fontSize * 0.22}
      paintOrder="stroke"
      strokeLinejoin="round"
      style={editable ? { cursor: 'text' } : undefined}
      onClick={editable ? onStart : undefined}
    >
      {editable && <title>Клік — змінити розмір</title>}
      {Math.round(value)}
    </text>
  );
}

export function Detail2DBlueprint({ detail, lockedSides, onToggleSideLock, onCommitSide, isSideEditable, bare, sideLabels, jointMode, dimsReadOnly, joints, onJointCreate, onJointEdit }: {
  detail: DetailDraft;
  /** Розміри, закріплені замком (див. domain/sideLocks.ts). */
  lockedSides?: ReadonlySet<string>;
  onToggleSideLock?: (side: string) => void;
  /** Записати новий розмір сторони (або λ) — редагування просто в кресленні. */
  onCommitSide?: (side: string, value: number) => void;
  /** Чи можна зараз редагувати цей розмір (замки, довільний контур). */
  isSideEditable?: (side: string) => boolean;
  /** №134: «голе» креслення — сам контур, без виносок розмірів і без літер
      сторін. Потрібне секціям «Стики / Вирізи / Мийки / Розетки»: там людина
      клацає по площині деталі, і розмірна графіка тільки заважає. */
  bare?: boolean;
  /** №136: у «голому» режимі лишити літери сторін (A, B, C…) — вимога
      власника для секції «Стики»: розмірів не треба, а сторону назвати
      треба, бо стик призначається саме на сторону. */
  sideLabels?: boolean;
  /** №137: режим «Стики» — клік по літері сторони починає створення стику. */
  jointMode?: boolean;
  /** №137: розміри показані, але не редагуються (секція «Стики»). */
  dimsReadOnly?: boolean;
  /** Уже створені стики цієї деталі — малюються суцільними з підписом. */
  joints?: Array<{
    id: string; axis: 'vertical' | 'horizontal'; position: number; offset: number;
    sideId?: string; oppositeId?: string;
  }>;
  /** Enter у полі відступу: віддаємо готовий опис стику назовні. */
  onJointCreate?: (joint: {
    sideId: string; oppositeSideId: string; axis: 'vertical' | 'horizontal';
    anchorCorner?: string; referenceSideId?: string; offset: number;
  }) => void;
  /** Подвійний клік по підпису готового стику — редагувати відступ. */
  onJointEdit?: (id: string) => void;
}) {
  const [editingSide, setEditingSide] = useState<string | null>(null);
  /* ── СТИКИ НА КРЕСЛЕННІ (№137, механіка від власника 08.09) ────────────
     Клік по літері сторони → протилежна сторона підсвічується сама (домен
     знає, яка це), між ними лягає пунктир, збоку — поле відступу від
     сторони-лінійки. Enter → стик записується в деталь і лінія стає
     суцільною з підписом. Це єдине місце, де стики створюються. */
  const [jointSide, setJointSide] = useState<string | null>(null);
  const [jointOther, setJointOther] = useState<string | null>(null);
  const [jointOffset, setJointOffset] = useState<string>('');

  const canEdit = (side: string) => !dimsReadOnly && Boolean(onCommitSide) && (isSideEditable?.(side) ?? true);
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

  /* Сторони як відрізки в міліметрах — цього чекає домен стиків. */
  const jointSides: JointSideSegment[] = useMemo(
    () => segments
      .filter((seg) => seg.id)
      .map((seg) => ({ id: seg.id as string, v1: { x: seg.p1.x, y: seg.p1.y }, v2: { x: seg.p2.x, y: seg.p2.y } })),
    [segments],
  );
  const jointAnchors = useMemo(
    () => jointAnchorPoints(toDetailShape(detail.kind), detail as never),
    [detail],
  );
  /**
   * Межі лінії стику: РІВНО від сторони до сторони (правка власника 08.09:
   * «відмальовуй лінію стику від сторони до сторони»). Раніше кінці були
   * підтиснуті, щоб лінія не лізла під бейджі; тепер бейджі винесені за
   * контур деталі (№139), тому підтискати нема від чого — і лінія чесно
   * впирається в обидві сторони, як на кресленні.
   */
  const jointSpan = (axis: 'vertical' | 'horizontal', aId?: string, bId?: string): [number, number] => {
    const along = (side: JointSideSegment | undefined) =>
      side ? (axis === 'vertical' ? (side.v1.y + side.v2.y) / 2 : (side.v1.x + side.v2.x) / 2) : undefined;
    const a = along(jointSides.find((x) => x.id === aId));
    const b = along(jointSides.find((x) => x.id === bId));
    if (a === undefined || b === undefined) {
      return axis === 'vertical' ? [bounds.minY, bounds.maxY] : [bounds.minX, bounds.maxX];
    }
    return [Math.min(a, b), Math.max(a, b)];
  };

  /**
   * ПАРИ ДЛЯ СТИКУ (№139, правка власника 08.09: «сторона A дублюється 2 рази,
   * H і B — 2 рази, залежно від того, зі скількома сторонами можна робити стик»).
   *
   * Стик іде між сторонами, які стоять НАПРОТИ одна одної: паралельні,
   * нормалі дивляться назустріч, і проекції перекриваються. У П-подібної
   * деталі верхня A стоїть напроти і G, і E, і C — тому на A має бути стільки
   * бейджів, скільки в неї пар, кожен над «своєю» ділянкою. Один бейдж на
   * сторону не давав зробити другий стик — звідси «стик до стика не робиться».
   */
  const jointPairs = useMemo(
    () => (jointMode ? jointFieldPairs(jointSides, points) : []),
    [jointMode, jointSides, points],
  );

  /** Опис майбутнього стику: напрямок і кути виводяться, а не вводяться. */
  const jointPick = useMemo(() => {
    if (!jointMode || !jointSide || !jointOther) return null;
    const side = jointSides.find((item) => item.id === jointSide);
    if (!side) return null;
    /* Пара обрана кліком по конкретному бейджу: на стороні їх стільки,
       скільки в неї протилежних сторін (№139). */
    const opposite = jointOther;
    const pair = jointSides.find((item) => item.id === opposite);
    const axis = jointAxisForSide(side);
    const anchorCorner = nearestAnchorId(jointAnchors, side.v1);
    const anchorPoint = anchorCorner ? jointAnchors?.[anchorCorner] : undefined;
    /* СТОРОНА-ЛІНІЙКА (№143, власник: «не зрозуміло, від якої сторони
       відступ»). Шукаємо її ТІЛЬКИ серед тих, що обмежують саме це поле:
       у П-подібної низ лівої ноги (G) і низ правої (C) лежать на одній
       висоті, і раніше для стику в лівій нозі лінійкою оголошувалась C. */
    const field = jointPairs.find((pr) => pr.sideId === jointSide && pr.otherId === opposite);
    const reference = field
      ? referenceSideInField(jointSides, axis, anchorPoint, field.box)
      : undefined;
    const referenceSideId = reference?.id
      ?? referenceSideForJoint(jointSides, axis, anchorPoint);
    /* Відлік — від САМОЇ сторони-лінійки: вона проходить через опорний кут,
       тому число те саме, що рахує рушій, а виноска впирається в підписану
       сторону, а не в порожнє місце. */
    const refPos = reference?.position
      ?? (anchorPoint ? (axis === 'vertical' ? anchorPoint.x : anchorPoint.y) : 0);
    /* Поки відступ не введено, пунктир стоїть посеред ПОЛЯ, а не посеред
       сторони: у П-подібної сторона A тягнеться на всі 2400, і чернетка
       стику для пари A↔G лягала по центру деталі, за межами свого поля. */
    const midPos = field
      ? (axis === 'vertical'
        ? (field.box.minX + field.box.maxX) / 2
        : (field.box.minY + field.box.maxY) / 2)
      : (axis === 'vertical' ? (side.v1.x + side.v2.x) / 2 : (side.v1.y + side.v2.y) / 2);
    const typed = Number(jointOffset);
    /* Позицію чернетки рахує та сама доменна функція, що й для готового
       стику — тому пунктир стоїть рівно там, куди ляже різ. */
    const position = Number.isFinite(typed) && jointOffset !== '' && typed >= 0
      ? manualJointPosition(jointAnchors, detail.corners, { axis, anchorCorner, offset: typed }).snapped
      : midPos;
    return { side, pair, opposite, axis, anchorCorner, referenceSideId, refPos, position };
  }, [jointMode, jointSide, jointOther, jointSides, jointAnchors, jointOffset, detail.corners, jointPairs]);

  /* №138: бейджі сторін винесені ЗА контур і зменшені на 30 % (0.05 → 0.035
     габариту) — на кресленні вони затуляли тіло деталі, а власнику треба
     бачити саму площину. Розмірна лінія трохи відсунута, щоб бейдж став між
     контуром і виноскою, а не наліз на неї. */
  const boxSize = Math.max(w, h) * 0.035;
  const fontSize = boxSize * 0.6;
  const offset = Math.max(w, h) * 0.062;
  /* №133 — виноски за кресленським правилом (було: виносні впритул до контуру
     і рівно до розмірної лінії, через що габарит читався як «приліплена
     рамка», а цифра висіла високо над лінією):
       · extGap  — зазор між контуром деталі й початком виносної;
       · extOver — виступ виносної ЗА розмірну лінію;
       · tickLen — засічка 45° на перетині (класика будівельного креслення);
       · textOffset — цифра сидить одразу над лінією, а не на подвійній
         відстані від неї. */
  const extGap = Math.max(w, h) * 0.008;
  const extOver = Math.max(w, h) * 0.014;
  const tickLen = Math.max(w, h) * 0.011;
  const thinW = Math.max(w, h) * 0.0016;
  const dimW = Math.max(w, h) * 0.0028;
  const textOffset = offset + fontSize * 0.72;

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

        {/* ПОЛЯ ПАР — тільки обране (власник 08.09: «прибери ці сірі фони типу
            зонувань, то було тобі, шоб ти розібрався»). Розрахунок полів
            лишається — на ньому стоять бейджі й діапазон різу, — але сірої
            підкладки на кресленні більше немає. Підсвічуємо зеленим лише те
            поле, у якому користувач саме зараз ставить стик. */}
        {jointMode && jointPairs
          .filter((pr) => (pr.sideId as string) < (pr.otherId as string))
          .filter((pr) => (jointSide === pr.sideId && jointOther === pr.otherId)
            || (jointSide === pr.otherId && jointOther === pr.sideId))
          .map((pr) => (
            <polygon
              key={`zone-${pr.sideId}|${pr.otherId}`}
              points={pr.zone.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="#22c55e"
              fillOpacity={0.12}
              stroke="#15803d"
              strokeOpacity={0.45}
              strokeWidth={thinW * 1.4}
              pointerEvents="none"
            />
          ))}

        {/* Draw dimension lines and text */}
        {(!bare || sideLabels) && segments.map((seg, i) => {
          if (seg.length < 20) return null;
          
          const textX = seg.midX + seg.nx * textOffset;
          const textY = seg.midY + seg.ny * textOffset;
          
          const lx1 = seg.p1.x + seg.nx * offset;
          const ly1 = seg.p1.y + seg.ny * offset;
          const lx2 = seg.p2.x + seg.nx * offset;
          const ly2 = seg.p2.y + seg.ny * offset;

          let angle = Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x) * (180 / Math.PI);
          if (angle > 90 || angle < -90) angle += 180;

          /* Напрямок уздовж сторони — потрібен для засічок 45°. */
          const dLen = Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y) || 1;
          const dx = (seg.p2.x - seg.p1.x) / dLen;
          const dy = (seg.p2.y - seg.p1.y) / dLen;
          const tx = (dx + seg.nx) * tickLen * 0.707;
          const ty = (dy + seg.ny) * tickLen * 0.707;

          return (
            <g key={`dim-${i}`}>
              {!bare && (<>
              {/* Виносні: із зазором від контуру і виступом за розмірну лінію */}
              <line
                x1={seg.p1.x + seg.nx * extGap} y1={seg.p1.y + seg.ny * extGap}
                x2={seg.p1.x + seg.nx * (offset + extOver)} y2={seg.p1.y + seg.ny * (offset + extOver)}
                stroke="#b6c2cf" strokeWidth={thinW} strokeLinecap="round"
              />
              <line
                x1={seg.p2.x + seg.nx * extGap} y1={seg.p2.y + seg.ny * extGap}
                x2={seg.p2.x + seg.nx * (offset + extOver)} y2={seg.p2.y + seg.ny * (offset + extOver)}
                stroke="#b6c2cf" strokeWidth={thinW} strokeLinecap="round"
              />
              {/* Розмірна лінія */}
              <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="#64748b" strokeWidth={dimW} strokeLinecap="round" />
              {/* Засічки 45° на перетинах */}
              <line x1={lx1 - tx} y1={ly1 - ty} x2={lx1 + tx} y2={ly1 + ty} stroke="#64748b" strokeWidth={dimW} strokeLinecap="round" />
              <line x1={lx2 - tx} y1={ly2 - ty} x2={lx2 + tx} y2={ly2 + ty} stroke="#64748b" strokeWidth={dimW} strokeLinecap="round" />
              
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
              </>)}

              {/* Літера сторони — за контуром. Поза режимом стиків бейдж один
                  (замок); у режимі стиків їх стільки, скільки в сторони пар:
                  кожен стоїть над «своєю» ділянкою (№139). */}
              {seg.id && !jointMode && (
                <SideBadge
                  x={seg.midX + seg.nx * (boxSize * 0.75)}
                  y={seg.midY + seg.ny * (boxSize * 0.75)}
                  size={boxSize}
                  fontSize={fontSize}
                  id={seg.id}
                  locked={lockedSides?.has(seg.id)}
                  lockable={Boolean(onToggleSideLock) && sideIsLockable(detail, seg.id)}
                  onToggle={() => onToggleSideLock?.(seg.id!)}
                />
              )}
              {seg.id && jointMode && (() => {
                const mine = jointPairs.filter((pr) => pr.sideId === seg.id);
                if (!mine.length) {
                  // сторона без пари — показуємо блідо, клікати нема сенсу
                  return (
                    <SideBadge
                      x={seg.midX + seg.nx * (boxSize * 0.75)}
                      y={seg.midY + seg.ny * (boxSize * 0.75)}
                      size={boxSize} fontSize={fontSize} id={seg.id}
                    />
                  );
                }
                return mine.map((pr) => {
                  const bx = pr.at.x + pr.normal.x * (boxSize * 0.75);
                  const by = pr.at.y + pr.normal.y * (boxSize * 0.75);
                  const isPicked = (jointSide === seg.id && jointOther === pr.otherId)
                    || (jointSide === pr.otherId && jointOther === seg.id);
                  /* Сторона, від якої міряють відступ, — жовта: видно, звідки
                     відлік, без жодного зайвого тексту на кресленні (№143). */
                  const isRuler = Boolean(jointPick) && seg.id === jointPick?.referenceSideId;
                  return (
                    <SideBadge
                      key={`${seg.id}-${pr.otherId}`}
                      x={bx} y={by} size={boxSize} fontSize={fontSize} id={seg.id as string}
                      picked={isPicked}
                      candidate={isRuler}
                      pickable
                      onToggle={() => {
                        if (isPicked) { setJointSide(null); setJointOther(null); setJointOffset(''); return; }
                        setJointSide(seg.id as string);
                        setJointOther(pr.otherId);
                        setJointOffset('');
                      }}
                    />
                  );
                });
              })()}
            </g>
          );
        })}

        {/* ── Готові стики: суцільна лінія з підписом ─────────────────── */}
        {(joints ?? []).map((j) => {
          const [from, to] = jointSpan(j.axis, j.sideId, j.oppositeId);
          const x1 = j.axis === 'vertical' ? j.position : from;
          const y1 = j.axis === 'vertical' ? from : j.position;
          const x2 = j.axis === 'vertical' ? j.position : to;
          const y2 = j.axis === 'vertical' ? to : j.position;
          /* Ніяких підписів на кресленні (вимога власника 08.09): лишається
             сама лінія і виноска з відстанню від краю — так, як міряють. */
          const side = jointSides.find((x) => x.id === j.sideId);
          const anchorId = side ? nearestAnchorId(jointAnchors, side.v1) : undefined;
          const anchorPt = anchorId ? jointAnchors?.[anchorId] : undefined;
          /* Виноска впирається в сторону, ЩО ОБМЕЖУЄ ЦЕ ПОЛЕ (№143) — інакше
             вона тягнулась до однойменної сторони сусіднього виступа. */
          const jField = jointPairs.find((pr) => pr.sideId === j.sideId && pr.otherId === j.oppositeId);
          const jRef = jField ? referenceSideInField(jointSides, j.axis, anchorPt, jField.box) : undefined;
          const base = jRef?.position
            ?? (anchorPt ? (j.axis === 'vertical' ? anchorPt.x : anchorPt.y) : (j.axis === 'vertical' ? bounds.minX : bounds.minY));
          /* Виноску тримаємо ближче до краю: у центрі деталі живуть внутрішні
             розміри, і число стику лізло просто на них. Після того, як лінія
             пішла рівно від сторони до сторони (№140), частку зменшено — інакше
             число з'їжджало на середину і збігалося з лініями інших стиків. */
          const t = j.axis === 'vertical' ? 0.16 : 0.07;
          const px = x1 + (x2 - x1) * t;
          const py = y1 + (y2 - y1) * t;
          return (
            <g key={j.id} onDoubleClick={() => onJointEdit?.(j.id)} style={{ cursor: onJointEdit ? 'pointer' : undefined }}>
              <title>Подвійний клік — змінити відступ</title>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#15803d" strokeWidth={dimW * 1.4} strokeLinecap="round" />
              {j.axis === 'vertical' ? (
                <>
                  <line x1={base} y1={py} x2={j.position} y2={py} stroke="#15803d" strokeWidth={dimW} />
                  <line x1={base} y1={py - tickLen} x2={base} y2={py + tickLen} stroke="#15803d" strokeWidth={dimW} />
                  <line x1={j.position} y1={py - tickLen} x2={j.position} y2={py + tickLen} stroke="#15803d" strokeWidth={dimW} />
                  <text
                    x={(base + j.position) / 2} y={py - fontSize * 0.75}
                    fill="#15803d" fontSize={fontSize * 0.9} fontFamily="sans-serif"
                    textAnchor="middle" dominantBaseline="central"
                    stroke="#ffffff" strokeWidth={fontSize * 0.22} paintOrder="stroke" strokeLinejoin="round"
                  >{Math.round(j.offset)}</text>
                </>
              ) : (
                <>
                  <line x1={px} y1={base} x2={px} y2={j.position} stroke="#15803d" strokeWidth={dimW} />
                  <line x1={px - tickLen} y1={base} x2={px + tickLen} y2={base} stroke="#15803d" strokeWidth={dimW} />
                  <line x1={px - tickLen} y1={j.position} x2={px + tickLen} y2={j.position} stroke="#15803d" strokeWidth={dimW} />
                  <text
                    x={px + fontSize * 0.75} y={(base + j.position) / 2}
                    fill="#15803d" fontSize={fontSize * 0.9} fontFamily="sans-serif"
                    textAnchor="middle" dominantBaseline="central"
                    transform={`rotate(-90, ${px + fontSize * 0.75}, ${(base + j.position) / 2})`}
                    stroke="#ffffff" strokeWidth={fontSize * 0.22} paintOrder="stroke" strokeLinejoin="round"
                  >{Math.round(j.offset)}</text>
                </>
              )}
            </g>
          );
        })}

        {/* ── Чернетка стику: пунктир + поле відступу ──────────────────── */}
        {jointPick && (() => {
          const { axis, position, refPos } = jointPick;
          const [from, to] = jointSpan(axis, jointSide ?? undefined, jointPick.opposite);
          const x1 = axis === 'vertical' ? position : from;
          const y1 = axis === 'vertical' ? from : position;
          const x2 = axis === 'vertical' ? position : to;
          const y2 = axis === 'vertical' ? to : position;
          /* Поле відступу ставимо на чверті лінії — там, де його намалював
             власник: збоку від пунктиру, з розмірною стрілкою до лінійки. */
          const t = 0.25;
          const px = x1 + (x2 - x1) * t;
          const py = y1 + (y2 - y1) * t;
          const boxW = fontSize * 5;
          const boxH = fontSize * 2;
          /* Поле сидить НАД серединою виноски — воно підписує саме цю
             відстань, а не висить окремо збоку. */
          const bx = axis === 'vertical' ? (px + refPos) / 2 : px;
          const by = axis === 'vertical' ? py - boxH * 0.9 : (py + refPos) / 2;
          return (
            <g>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#15803d" strokeWidth={dimW * 1.2} strokeDasharray={`${tickLen * 2} ${tickLen * 1.4}`} />
              {/* стрілка від сторони-лінійки до пунктиру */}
              {axis === 'vertical' ? (
                <>
                  <line x1={refPos} y1={py} x2={px} y2={py} stroke="#15803d" strokeWidth={dimW} />
                  <line x1={refPos} y1={py - tickLen} x2={refPos} y2={py + tickLen} stroke="#15803d" strokeWidth={dimW} />
                  <line x1={px} y1={py - tickLen} x2={px} y2={py + tickLen} stroke="#15803d" strokeWidth={dimW} />
                </>
              ) : (
                <>
                  <line x1={px} y1={refPos} x2={px} y2={py} stroke="#15803d" strokeWidth={dimW} />
                  <line x1={px - tickLen} y1={refPos} x2={px + tickLen} y2={refPos} stroke="#15803d" strokeWidth={dimW} />
                  <line x1={px - tickLen} y1={py} x2={px + tickLen} y2={py} stroke="#15803d" strokeWidth={dimW} />
                </>
              )}
              {/* №143: біля поля вводу — від ЯКОЇ сторони міряємо. Власник:
                  «не зрозуміло, від якої сторони відступ». */}
              {jointPick.referenceSideId && (
                <text
                  x={bx}
                  y={by - boxH * 0.75}
                  fill="#15803d"
                  fontSize={fontSize * 0.85}
                  fontFamily="sans-serif"
                  textAnchor="middle"
                  dominantBaseline="central"
                  stroke="#ffffff"
                  strokeWidth={fontSize * 0.2}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >{`від ${jointPick.referenceSideId}`}</text>
              )}
              <foreignObject x={bx - boxW / 2} y={by - boxH / 2} width={boxW} height={boxH}>
                <input
                  autoFocus
                  value={jointOffset}
                  placeholder="мм"
                  onChange={(e) => setJointOffset(e.target.value.replace(/[^0-9]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const mm = Number(jointOffset);
                      /* Нуль — законний відступ: стик рівно по краю сторони. */
                      if (Number.isFinite(mm) && mm >= 0 && jointOffset !== '' && jointSide) {
                        onJointCreate?.({
                          sideId: jointSide,
                          oppositeSideId: jointPick.opposite,
                          axis: jointPick.axis,
                          anchorCorner: jointPick.anchorCorner,
                          referenceSideId: jointPick.referenceSideId,
                          offset: mm,
                        });
                        setJointSide(null);
                        setJointOther(null);
                        setJointOffset('');
                      }
                    }
                    if (e.key === 'Escape') { setJointSide(null); setJointOther(null); setJointOffset(''); }
                  }}
                  style={{
                    width: '100%', height: '100%', boxSizing: 'border-box',
                    fontSize: `${fontSize * 0.95}px`, fontFamily: 'sans-serif', textAlign: 'center',
                    border: `${Math.max(1, fontSize * 0.06)}px solid #15803d`,
                    borderRadius: `${fontSize * 0.15}px`, outline: 'none', color: '#14532d',
                  }}
                />
              </foreignObject>
            </g>
          );
        })()}

        {/* Кругла/овальна: два габарити і квадранти A–D замість 64 хорд */}
        {!bare && curved && (() => {
          const cx = w / 2; const cy = h / 2;
          const isCircle = detail.kind === 'circle';
          const dimY = -offset; const dimX = w + offset;
          const quadrants: Array<[string, number]> = [['A', Math.PI * 1.25], ['B', Math.PI * 1.75], ['C', Math.PI * 0.25], ['D', Math.PI * 0.75]];
          return (
            <g>
              <line x1={0} y1={-extGap} x2={0} y2={dimY - extOver} stroke="#b6c2cf" strokeWidth={thinW} strokeLinecap="round" />
              <line x1={w} y1={-extGap} x2={w} y2={dimY - extOver} stroke="#b6c2cf" strokeWidth={thinW} strokeLinecap="round" />
              <line x1={0} y1={dimY} x2={w} y2={dimY} stroke="#64748b" strokeWidth={dimW} strokeLinecap="round" />
              <line x1={-tickLen * 0.707} y1={dimY + tickLen * 0.707} x2={tickLen * 0.707} y2={dimY - tickLen * 0.707} stroke="#64748b" strokeWidth={dimW} strokeLinecap="round" />
              <line x1={w - tickLen * 0.707} y1={dimY + tickLen * 0.707} x2={w + tickLen * 0.707} y2={dimY - tickLen * 0.707} stroke="#64748b" strokeWidth={dimW} strokeLinecap="round" />
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
                  <line x1={w + extGap} y1={0} x2={dimX + extOver} y2={0} stroke="#b6c2cf" strokeWidth={thinW} strokeLinecap="round" />
                  <line x1={w + extGap} y1={h} x2={dimX + extOver} y2={h} stroke="#b6c2cf" strokeWidth={thinW} strokeLinecap="round" />
                  <line x1={dimX} y1={0} x2={dimX} y2={h} stroke="#64748b" strokeWidth={dimW} strokeLinecap="round" />
                  <line x1={dimX - tickLen * 0.707} y1={-tickLen * 0.707} x2={dimX + tickLen * 0.707} y2={tickLen * 0.707} stroke="#64748b" strokeWidth={dimW} strokeLinecap="round" />
                  <line x1={dimX - tickLen * 0.707} y1={h - tickLen * 0.707} x2={dimX + tickLen * 0.707} y2={h + tickLen * 0.707} stroke="#64748b" strokeWidth={dimW} strokeLinecap="round" />
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
        {!bare && uShapeProps && uShapeProps.topBarHeight > 0 && (() => {
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
