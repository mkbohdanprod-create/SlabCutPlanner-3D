import type { DetailPart, Placement, Point } from '../../../domain/types';
import type { FactRef } from '../../../engines/productionFacts';
import { mirroredLocalPoints, rotatedLocalPoints } from '../../../lib/project';
import { logicalSegmentForSide, sideContourPolyline } from '../../../utils/edgeProfiles';
import { toSlot } from '../../../domain/ids';

/**
 * Підсвітка ліній, за якими нараховано послугу.
 *
 * Клік по рядку кошторису кладе в стор посилання з цього рядка, а тут
 * вони перетворюються назад у геометрію. Підсвічуємо РІВНО ті ділянки,
 * за які взято гроші, а не весь контур деталі:
 *
 *   · різ пилою        — тільки осьові ділянки контуру
 *   · різ водою        — тільки неосьові: дуги, зрізи, радіуси
 *   · торець           — один відрізок сторони
 *   · стик             — його ділянка на ОБОХ деталях, від і до
 *   · виріз чи отвір   — його власний контур
 *   · площа, монтаж    — увесь контур деталі
 *
 * Поділ на «осьове / неосьове» — той самий, за яким рушій фактів рахує
 * метри (polygonAxisLength / polygonNonAxisLength). Інакше підсвітка
 * показувала б не те, за що виставлено рахунок.
 */

/** Той самий поріг, що в geometryUtils: після поворотів координати не цілі */
const AXIS_EPSILON = 0.001;

function isAxisAligned(a: Point, b: Point) {
  return Math.abs(a.x - b.x) < AXIS_EPSILON || Math.abs(a.y - b.y) < AXIS_EPSILON;
}

/**
 * Обрізати сегмент сторони до ділянки [fromMm, toMm] уздовж неї.
 * Стик рідко займає всю сторону — прив'язки кажуть, де саме він проходить.
 * Якщо прив'язок немає або вони виродилися — показуємо всю сторону.
 */
function clipSegment(
  segment: { start: Point; end: Point },
  fromMm?: number,
  toMm?: number,
) {
  if (fromMm === undefined || toMm === undefined) return segment;
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1) return segment;
  const t0 = Math.max(0, Math.min(1, fromMm / length));
  const t1 = Math.max(0, Math.min(1, toMm / length));
  if (Math.abs(t1 - t0) < 0.005) return segment;
  return {
    start: { x: segment.start.x + dx * t0, y: segment.start.y + dy * t0 },
    end: { x: segment.start.x + dx * t1, y: segment.start.y + dy * t1 },
  };
}

/** Ділянки контуру, які ріже пила (осьові) або вода (решта) */
function contourSegments(points: Point[], want: 'axis' | 'nonaxis') {
  const out: { start: Point; end: Point }[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    const axis = isAxisAligned(start, end);
    if ((want === 'axis') === axis) out.push({ start, end });
  }
  return out;
}

export function FactHighlight({
  part,
  placement,
  refs,
  scale,
}: {
  part: DetailPart;
  placement: Placement;
  refs: FactRef[];
  scale: number;
}) {
  // Кути й стики прив'язані до Елемента виробу, а не до парта на слебі:
  // у них немає partId. Зіставляємо через слот — так само, як це робить
  // решта коду з ідентифікаторами у двох формах.
  const partSlot = toSlot(part.detailId);
  const matchesA = (ref: FactRef) => !!ref.elementPath && toSlot(ref.elementPath) === partSlot;
  const matchesB = (ref: FactRef) => !!ref.elementPathB && toSlot(ref.elementPathB) === partSlot;
  const mine = refs.filter((ref) => (
    ref.partId ? ref.partId === part.id : matchesA(ref) || matchesB(ref)
  ));
  if (!mine.length) return null;

  // ЛОКАЛЬНІ повернуті координати — без зсуву розміщення.
  // Крок 3.4: дзеркалимо ДО повороту, як і решта геометрії розкрою.
  const localPoints = placement.mirror ? mirroredLocalPoints(part.points, part.width) : part.points;
  const outline = rotatedLocalPoints(localPoints, placement.rotation, part.width, part.height, localPoints);
  const toScreen = (points: Point[]) =>
    points.map((p) => `${(placement.x + p.x) * scale},${(placement.y + p.y) * scale}`).join(' ');
  const lineOf = (start: Point, end: Point, key: string) => (
    <line
      key={key}
      x1={(placement.x + start.x) * scale}
      y1={(placement.y + start.y) * scale}
      x2={(placement.x + end.x) * scale}
      y2={(placement.y + end.y) * scale}
    />
  );

  const shapes: React.ReactNode[] = [];

  mine.forEach((ref, index) => {
    // ── різ по контуру: пила окремо, вода окремо ────────────────────
    if (ref.factKind === 'saw_cut' || ref.factKind === 'waterjet_cut') {
      const want = ref.factKind === 'saw_cut' ? 'axis' : 'nonaxis';
      contourSegments(outline, want).forEach((segment, i) => {
        shapes.push(lineOf(segment.start, segment.end, `${ref.factKind}_${index}_${i}`));
      });
      return;
    }

    // ── стик: його ділянка на кожній із двох деталей ────────────────
    if (ref.factKind === 'joint_length' || ref.factKind === 'joint_count') {
      if (matchesA(ref) && ref.side) {
        const segment = logicalSegmentForSide(part, ref.side, placement.rotation, Boolean(placement.mirror));
        if (segment) {
          const clipped = clipSegment(segment, ref.fromMm, ref.toMm);
          shapes.push(lineOf(clipped.start, clipped.end, `jointA_${index}`));
        }
      }
      if (matchesB(ref) && ref.sideB) {
        const segment = logicalSegmentForSide(part, ref.sideB, placement.rotation, Boolean(placement.mirror));
        if (segment) {
          const clipped = clipSegment(segment, ref.fromMmB, ref.toMmB);
          shapes.push(lineOf(clipped.start, clipped.end, `jointB_${index}`));
        }
      }
      return;
    }

    // ── сторона деталі: торець, ручна доводка ───────────────────────
    // Ламана, а не відрізок: кромка йде через кутові дуги (радіус, фаска),
    // і метри в кошторисі нараховано разом із половинами цих дуг.
    if (ref.side) {
      const path = sideContourPolyline(part, ref.side, placement.rotation, Boolean(placement.mirror));
      if (path && path.length >= 2) {
        shapes.push(
          <polyline
            key={`side_${ref.side}_${index}`}
            points={toScreen(path)}
            fill="none"
          />,
        );
      }
      return;
    }

    // ── виріз або отвір ─────────────────────────────────────────────
    if (ref.cutoutIndex !== undefined) {
      const hole = part.holes?.[ref.cutoutIndex];
      if (hole?.length) {
        shapes.push(
          <polygon
            key={`hole_${ref.cutoutIndex}_${index}`}
            points={toScreen(rotatedLocalPoints(placement.mirror ? mirroredLocalPoints(hole, part.width) : hole, placement.rotation, part.width, part.height, localPoints))}
            fill="none"
          />,
        );
      }
      return;
    }

    // ── кут: точну вершину з наявних даних не відновити, тому
    //    показуємо деталь, на якій цей кут оброблено ────────────────
    // ── площа, монтаж, пакування: теж уся деталь ───────────────────
    shapes.push(
      <polygon key={`outline_${index}`} points={toScreen(outline)} fill="none" />,
    );
  });

  if (!shapes.length) return null;
  return <g className="fact-highlight" pointerEvents="none">{shapes}</g>;
}
