import type { DetailPart, EdgeProfileSelection, EdgeProfileType, Point, Rotation } from '../domain/types';
import { mirroredLocalPoints, polygonBounds, rotatePoint, rotatedPoints } from '../lib/project';
import { pointInPolygonStrict as pointInPolygon, sideContourRange, sideVertexIndices, edgeLengthForSide } from '../engines/geometryUtils';
import { edgeTreatmentProfileKinds, edgeTreatmentSpan, slicePolylineByLength } from '../domain/edgeTreatment';
import { boxEdgeIndexForSide, rotationQuarter } from '../domain/sideNaming';

export const DEFAULT_EDGE_PROFILE: EdgeProfileType = 'polished_straight';

export type EdgeProfileMarker = {
  side: string;
  profiles: string[];
  start: Point;
  end: Point;
  points?: Point[];
  labelPoint: Point;
  /**
   * Одиничний вектор ВСЕРЕДИНУ деталі в точці підпису (28.08, власник:
   * «підписи по центру деталі, всередині деталі — і на розкрої, і в
   * бланку»). Раніше кожен споживач зсував текст на кілька пікселів
   * угору — на верхній стороні це виносило підпис за контур, на нижній
   * заводило всередину, тобто одна крайка підписувалась двома способами.
   * Тепер напрямок рахується з геометрії сторони і однаковий скрізь.
   */
  labelInward: Point;
};

function rotateLocalPoint(point: Point, rotation: Rotation, part: DetailPart, mirror = false) {
  const source = mirror ? mirroredLocalPoints(part.points, part.width) : part.points;
  const rotatedReference = source.map((item) => rotatePoint(item, rotation, part.width, part.height));
  const bounds = polygonBounds(rotatedReference);
  const local = mirror ? { x: part.width - point.x, y: point.y } : point;
  const rotated = rotatePoint(local, rotation, part.width, part.height);
  return { x: rotated.x - bounds.minX, y: rotated.y - bounds.minY };
}

/**
 * Профілі торця, доступні на матеріалі проєкту.
 *
 * Серія 12 фізично існує лише на керамограніті, серія 20 — на кварциті
 * (SERVICES_ARCHITECTURE_LOGIC §4). Показувати кварцитний H40 на
 * керамограніті означає прийняти замовлення, яке цех не виконає.
 * Поки матеріал не обрано — показуємо все.
 */
export function edgeProfilesForMaterial<T extends { materialGroup?: string }>(
  profiles: T[] | undefined,
  material?: string | null,
): T[] {
  const all = profiles ?? [];
  /*
   * ФІЛЬТР ВИМКНЕНИЙ 26.08.2026 за рішенням власника: показуємо ВСІ
   * профілі на всіх матеріалах.
   *
   * Фільтр працював, поки матеріал проєкту виставлявся руками і часто
   * лишався порожнім (нижче `if (!material) return all`). 25.08 матеріал
   * почав братися з першого слеба автоматично — і список кромок мовчки
   * звузився з 70 до 16. Це помітив власник, а не ми.
   *
   * Логіка «серія 12 — керамограніт, серія 20 — кварцит» лишається
   * нижче в коді і не видалена: коли повернемось до обмеження, воно
   * має вмикатись СВІДОМО і з попередженням, а не як побічний ефект.
   */
  return all;
  // eslint-disable-next-line no-unreachable
  if (!material) return all;
  return all.filter((profile) => !profile.materialGroup || profile.materialGroup === material);
}

/**
 * Сегмент логічної сторони у координатах, ВЖЕ повернутих під розкрій.
 * Експортовано, щоб підсвітка на карті крою малювала рівно ту саму лінію,
 * по якій нараховано послугу.
 */
export function logicalSegmentForSide(part: DetailPart, side: string, rotation: Rotation, mirror = false) {
  const resolvedSide = part.sideAliases?.[side] ?? side;
  const points = rotatedPoints(part, rotation, { mirror });

  /*
   * ХВИЛЯ 3, крок 3.3 — позначка тримається за РЕБРО КОНТУРУ, а не за букву.
   *
   * Було: для прямокутних деталей сторони відновлювались із габаритного
   * боксу, а поворот компенсувався окремою математикою «зсунь букву на
   * чверть». Це працювало рівно для чотирьох кутів кратних 90° і не знало
   * ні про радіуси, ні про фаски, ні про дзеркало.
   *
   * Стало: беремо ІНДЕКСИ вершин сторони (`sideVertexIndices`) і читаємо
   * точки з УЖЕ трансформованого контуру. Нумерація вершин трансформацію
   * переживає, тому позначка їде за деталлю сама — при будь-якому повороті,
   * а коли з'явиться дзеркалення (крок 3.4), воно запрацює без правок тут.
   */
  const indices = sideVertexIndices(part, side);
  if (indices && points[indices.startIdx] && points[indices.endIdx]) {
    return { start: points[indices.startIdx], end: points[indices.endIdx] };
  }

  /*
   * Коло й овал — єдиний випадок, де сторони не є ребрами контуру: це
   * чверті дуги, і жодна з десятків вершин не «початок сторони A». Тільки
   * тут лишається габаритний бокс.
   */
  if (part.shape === 'Кругла' || part.shape === 'Овальна') {
    const sizeBounds = polygonBounds(points);
    const edges = [
      { start: { x: sizeBounds.minX, y: sizeBounds.maxY }, end: { x: sizeBounds.minX, y: sizeBounds.minY } }, // left
      { start: { x: sizeBounds.minX, y: sizeBounds.minY }, end: { x: sizeBounds.maxX, y: sizeBounds.minY } }, // top
      { start: { x: sizeBounds.maxX, y: sizeBounds.minY }, end: { x: sizeBounds.maxX, y: sizeBounds.maxY } }, // right
      { start: { x: sizeBounds.maxX, y: sizeBounds.maxY }, end: { x: sizeBounds.minX, y: sizeBounds.maxY } }, // bottom
    ];
    const idx = boxEdgeIndexForSide(resolvedSide);
    if (idx !== undefined) {
      // Дзеркало по вертикальній осі міняє місцями ліве й праве ребро
      // габариту (0 ↔ 2), верх і низ лишає. Застосовуємо ДО повороту —
      // рівно в тому ж порядку, що й rotatedPoints.
      const mirrored = mirror ? [2, 1, 0, 3][idx] : idx;
      return edges[(mirrored + rotationQuarter(rotation)) % 4];
    }
  }

  // Остання лінія оборони: сегмент є, але його кінці не лягли на вершини
  // контуру (інша система координат). Краще повернути його як є, ніж нічого.
  const raw = part.sideSegments?.[resolvedSide] ?? part.sideSegments?.[side];
  if (raw) {
    return {
      start: rotateLocalPoint(raw.start, rotation, part, mirror),
      end: rotateLocalPoint(raw.end, rotation, part, mirror),
    };
  }
  return undefined;
}

function insetPathForSide(
  segment: { start: Point; end: Point },
  polygon: Point[],
  offset: number,
  range?: { startIdx: number; endIdx: number },
): Point[] {
  if (polygon.length < 3) return [segment.start, segment.end];

  // Явний діапазон (сторона + половини кутових дуг) надійніший за пошук
  // найближчих вершин: він знає точні індекси і завжди йде вперед по обходу.
  const startIdx = range?.startIdx ?? polygon.reduce((best, p, i) => {
    const dist = Math.hypot(p.x - segment.start.x, p.y - segment.start.y);
    return dist < best.dist ? { i, dist } : best;
  }, { i: 0, dist: Infinity }).i;

  const endIdx = range?.endIdx ?? polygon.reduce((best, p, i) => {
    const dist = Math.hypot(p.x - segment.end.x, p.y - segment.end.y);
    return dist < best.dist ? { i, dist } : best;
  }, { i: 0, dist: Infinity }).i;

  let forwardSteps = 0;
  let i = startIdx;
  while (i !== endIdx && forwardSteps < polygon.length) {
    i = (i + 1) % polygon.length;
    forwardSteps++;
  }
  let backwardSteps = 0;
  i = startIdx;
  while (i !== endIdx && backwardSteps < polygon.length) {
    i = (i - 1 + polygon.length) % polygon.length;
    backwardSteps++;
  }

  const step = range ? 1 : (forwardSteps <= backwardSteps ? 1 : -1);
  const stepsCount = step === 1 ? forwardSteps : backwardSteps;

  const midSeqIdx = (startIdx + Math.floor(stepsCount / 2) * step + polygon.length) % polygon.length;
  const midP = polygon[midSeqIdx];
  const midNext = polygon[(midSeqIdx + step + polygon.length) % polygon.length];
  const midPoint = { x: (midP.x + midNext.x) / 2, y: (midP.y + midNext.y) / 2 };
  const midDx = midNext.x - midP.x;
  const midDy = midNext.y - midP.y;
  const midLen = Math.hypot(midDx, midDy) || 1;
  const midLeftNorm = { x: -midDy / midLen, y: midDx / midLen };
  const isMidLeftInside = [offset, 6, 2].some((d) => (
    pointInPolygon({ x: midPoint.x + midLeftNorm.x * d, y: midPoint.y + midLeftNorm.y * d }, polygon)
  ));
  const globalSign = isMidLeftInside ? 1 : -1;

  const insetPathPoints: Point[] = [];
  i = startIdx;
  while (true) {
    const p = polygon[i];
    const prevIdx = (i - step + polygon.length) % polygon.length;
    const nextIdx = (i + step + polygon.length) % polygon.length;
    const prevP = polygon[prevIdx];
    const nextP = polygon[nextIdx];
    
    const dx1 = p.x - prevP.x;
    const dy1 = p.y - prevP.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    const n1 = { x: -dy1 / len1, y: dx1 / len1 };
    
    const dx2 = nextP.x - p.x;
    const dy2 = nextP.y - p.y;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const n2 = { x: -dy2 / len2, y: dx2 / len2 };
    
    let nx = n1.x + n2.x;
    let ny = n1.y + n2.y;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    
    const dot = n1.x * n2.x + n1.y * n2.y;
    const scale = Math.min(5, 1 / Math.max(0.1, Math.sqrt(Math.max(0, (1 + dot) / 2))));
    
    insetPathPoints.push({
      x: p.x + nx * globalSign * offset * scale,
      y: p.y + ny * globalSign * offset * scale,
    });
    
    if (i === endIdx) break;
    i = (i + step + polygon.length) % polygon.length;
  }
  return insetPathPoints;
}

/**
 * Повна лінія сторони на контурі в повернутих координатах: пряма ділянка
 * плюс половини сусідніх кутових дуг — рівно той шлях, за яким рушій
 * фактів рахує метри кромки. Для простих форм без обробки кутів — просто
 * відрізок сторони.
 */
export function sideContourPolyline(
  part: DetailPart,
  side: string,
  rotation: Rotation,
  mirror = false,
): Point[] | undefined {
  const range = sideContourRange(part, side);
  if (range) {
    const polygon = rotatedPoints(part, rotation, { mirror });
    const n = polygon.length;
    const path: Point[] = [polygon[range.startIdx]];
    let index = range.startIdx;
    let guard = 0;
    while (index !== range.endIdx && guard <= n) {
      index = (index + 1) % n;
      path.push(polygon[index]);
      guard += 1;
    }
    return path;
  }
  const segment = logicalSegmentForSide(part, side, rotation, mirror);
  return segment ? [segment.start, segment.end] : undefined;
}

/**
 * Точка на середині ДОВЖИНИ полілінії і напрямок ходу в ній.
 * Саме довжини, а не індексу: у прямої сторони дві точки, і середній
 * індекс — це її кінець.
 */
function midOfPolyline(points: Point[]): { point: Point; dir: Point } {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const half = total / 2;
  let walked = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    if (step <= 0) continue;
    if (walked + step >= half || i === points.length - 1) {
      const t = Math.max(0, Math.min(1, (half - walked) / step));
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        dir: { x: (b.x - a.x) / step, y: (b.y - a.y) / step },
      };
    }
    walked += step;
  }
  const a = points[0];
  const b = points[points.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { point: a, dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } };
}

export function edgeMarkersForPart(
  part: DetailPart,
  profiles: EdgeProfileSelection | undefined,
  rotation: Rotation,
  offset = 16,
  mirror = false,
): EdgeProfileMarker[] {
  if (!part.isMain || !profiles) return [];
  const entries = Object.entries(profiles).filter((entry) => Boolean(entry[1]));
  if (!entries.length) return [];

  const polygon = rotatedPoints(part, rotation, { mirror });
  return entries
    .map(([side, rawProfile]) => {
      const profileIds = edgeTreatmentProfileKinds(rawProfile);
      if (!profileIds.length) return undefined;

      const segment = logicalSegmentForSide(part, side, rotation, mirror);
      if (!segment) return undefined;
      // Позначка накриває і половини сусідніх кутових дуг — рівно ту
      // довжину, за якою рушій фактів рахує метри профілю.
      const fullPath = insetPathForSide(segment, polygon, offset, sideContourRange(part, side));
      // Крайка «не на всю довжину» має і на кресленні бути короткою: інакше
      // лінія обіцяє цеху повне ребро, а кошторис рахує ділянку.
      const sideLengthMm = edgeLengthForSide(part, side);
      const span = edgeTreatmentSpan(rawProfile, sideLengthMm);
      const points = slicePolylineByLength(fullPath, span.from, span.to);
      if (points.length < 2) return undefined;

      /*
       * Підпис — на СЕРЕДИНІ ДОВЖИНИ лінії, не на середньому індексі:
       * у прямої сторони точок усього дві, і `points[length/2]` давав її
       * КІНЕЦЬ — підпис сідав у кут деталі.
       */
      const { point: labelPoint, dir: labelDir } = midOfPolyline(points);

      /*
       * Напрямок «усередину деталі» в точці підпису.
       *
       * Проба на одну відстань не годиться: лінія маркера вже відступлена
       * від контуру на `offset` (16 мм), тож коротка проба НАЗОВНІ теж
       * потрапляє в тіло деталі — саме на цьому напрямок і перевертався.
       * Тому шукаємо відстань, на якій боки РОЗРІЗНЯЮТЬСЯ: один усередині,
       * другий зовні. Великі відстані перші — вони дають чисту відповідь;
       * дрібні лишаються для вузьких деталей на кшталт панелі 165 мм.
       */
      const leftNorm = { x: -labelDir.y, y: labelDir.x };
      const rightNorm = { x: labelDir.y, y: -labelDir.x };
      const probe = (norm: Point, d: number) => pointInPolygon(
        { x: labelPoint.x + norm.x * d, y: labelPoint.y + norm.y * d },
        polygon,
      );
      let labelInward = leftNorm;
      for (const d of [60, 40, 26, 16, 8, 3]) {
        const leftIn = probe(leftNorm, d);
        const rightIn = probe(rightNorm, d);
        if (leftIn !== rightIn) {
          labelInward = leftIn ? leftNorm : rightNorm;
          break;
        }
      }

      return {
        side,
        profiles: profileIds,
        start: points[0] ?? segment.start,
        end: points[points.length - 1] ?? segment.end,
        points,
        labelPoint,
        labelInward,
      };
    })
    .filter(Boolean) as EdgeProfileMarker[];
}
