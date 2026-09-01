/**
 * ХВИЛЯ 4 · крок 4.4 (FG-34) — П-подібний виріз (ніша).
 *
 * Найдорожча помилка тут — сплутати нішу з отвором. Отвір лишає деталь
 * цілою і ріжеться зсередини; ніша РОЗРИВАЄ зовнішній контур, її ріжуть із
 * краю, а її стінки — справжні торці, які треба обробити й порахувати.
 * Тому тести перевіряють не «щось намалювалось», а три конкретні речі:
 * контур справді розірвано, площа зменшилась рівно на нішу, і кожен торець
 * ніші має власне ім'я, за яким його можна продати й завісити панеллю.
 */
import { describe, expect, it } from 'vitest';
import {
  U_CUTOUT_MIN_BRIDGE_MM,
  buildUCutoutContour,
  uCutoutAreaM2,
  uCutoutEdgeIds,
  uCutoutSideNames,
  uCutoutSideSegments,
  uCutoutWallIds,
  validateUCutout,
} from '../uCutout';
import type { UCutoutSide, UCutoutSpec } from '../uCutout';
import { explodeDetails } from '../../engines/geometry';
import { edgeLengthForSide } from '../../engines/geometryUtils';
import { DEFAULT_ALLOWANCES } from '../defaults';

/** Лицьова панель подіуму: 2000 × 700. */
const PANEL = { width: 2000, height: 700 };
const spec = (patch: Partial<UCutoutSpec> = {}): UCutoutSpec => ({
  side: 'A', offsetMm: 500, widthMm: 1000, depthMm: 400, ...patch,
});

const area = (points: Array<{ x: number; y: number }>) => Math.abs(points.reduce(
  (sum, p, i) => sum + (p.x * points[(i + 1) % points.length].y - points[(i + 1) % points.length].x * p.y),
  0,
) / 2);

describe('контур ніші', () => {
  it('площа деталі зменшується РІВНО на нішу', () => {
    const points = buildUCutoutContour(spec(), PANEL)!;
    expect(points).toBeDefined();
    const full = PANEL.width * PANEL.height;
    expect(area(points)).toBeCloseTo(full - 1000 * 400, 6);
  });

  it('це розрив контуру, а не отвір: точки ніші лежать на самому контурі', () => {
    const points = buildUCutoutContour(spec(), PANEL)!;
    // Дві точки на краю деталі (y = 0) — вхід у нішу.
    const onEdge = points.filter((p) => p.y === 0 && p.x > 0 && p.x < PANEL.width);
    expect(onEdge).toHaveLength(2);
    expect(onEdge.map((p) => p.x).sort((a, b) => a - b)).toEqual([500, 1500]);
  });

  it.each(['A', 'B', 'C', 'D'] as UCutoutSide[])(
    'на стороні %s: площа та сама, імена ребер унікальні',
    (side) => {
      // Сторони B і D — короткі (700 мм), тож ніша для них інша: перевіряємо
      // саму механіку, а не те, що великий виріз влізе куди завгодно.
      const long = side === 'A' || side === 'C';
      const niche = long
        ? spec({ side, offsetMm: 500, widthMm: 1000, depthMm: 400 })
        : spec({ side, offsetMm: 100, widthMm: 300, depthMm: 400 });
      const points = buildUCutoutContour(niche, PANEL)!;
      expect(points, `сторона ${side}`).toBeDefined();
      const full = PANEL.width * PANEL.height;
      expect(area(points)).toBeCloseTo(full - niche.widthMm * niche.depthMm, 6);

      const ids = points.map((p) => p.id);
      // Жодного дубля: інакше довжина сторони стає неоднозначною, а
      // панель, повішена на це ім'я, їде на випадкове ребро.
      expect(new Set(ids).size, `сторона ${side}: ${ids.join(',')}`).toBe(ids.length);
      // Три торці ніші присутні.
      uCutoutWallIds(side).forEach((wall) => expect(ids).toContain(wall));
    },
  );

  it('решта сторін імен не міняє — кромка на B лишається на B', () => {
    const names = uCutoutSideNames(spec({ side: 'A' }), PANEL);
    expect(names).toContain('B');
    expect(names).toContain('C');
    expect(names).toContain('D');
  });

  it('таблиця сторін збігається з контуром до міліметра', () => {
    const segments = uCutoutSideSegments(spec(), PANEL)!;
    const ids = uCutoutEdgeIds('A');
    // Дно ніші — горизонтальний відрізок довжиною 1000 на глибині 400.
    const bottom = segments[ids.bottom];
    expect(bottom.start).toEqual({ x: 500, y: 400 });
    expect(bottom.end).toEqual({ x: 1500, y: 400 });
    // Стінки — вертикальні, по 400.
    expect(Math.hypot(
      segments[ids.left].end.x - segments[ids.left].start.x,
      segments[ids.left].end.y - segments[ids.left].start.y,
    )).toBeCloseTo(400, 6);
    // Залишки сторони A: 500 і 500.
    expect(segments[ids.before].end.x - segments[ids.before].start.x).toBeCloseTo(500, 6);
    expect(segments[ids.after].end.x - segments[ids.after].start.x).toBeCloseTo(500, 6);
  });

  it('площа ніші в м² — для підказки в модалці', () => {
    expect(uCutoutAreaM2(spec())).toBeCloseTo(0.4, 6);
  });
});

describe('перевірки: коли різати не можна', () => {
  it('перемичка тонша за мінімум — деталь розпалась би на дві', () => {
    const problems = validateUCutout(spec({ depthMm: PANEL.height }), PANEL);
    expect(problems.map((p) => p.code)).toContain('no_bridge');
    expect(buildUCutoutContour(spec({ depthMm: PANEL.height }), PANEL)).toBeUndefined();
  });

  it('ніша впритул до кута — з боку не лишається деталі', () => {
    const problems = validateUCutout(spec({ offsetMm: 0 }), PANEL);
    expect(problems.map((p) => p.code)).toContain('out_of_side');
  });

  it('ніша вилазить за сторону', () => {
    const problems = validateUCutout(spec({ offsetMm: 1500, widthMm: 1000 }), PANEL);
    expect(problems.map((p) => p.code)).toContain('out_of_side');
  });

  it('надто дрібна ніша — це вже отвір', () => {
    const problems = validateUCutout(spec({ widthMm: 10, depthMm: 10 }), PANEL);
    expect(problems.map((p) => p.code)).toContain('too_small');
  });

  it('рівно на межі перемички — ще можна', () => {
    const ok = spec({ depthMm: PANEL.height - U_CUTOUT_MIN_BRIDGE_MM });
    expect(validateUCutout(ok, PANEL)).toEqual([]);
    expect(buildUCutoutContour(ok, PANEL)).toBeDefined();
  });
});

/**
 * Головне: ніша мусить доїхати до РОЗКРОЮ. Раніше деталь із довільним
 * контуром різалась правильно, але сторони їй відновлювали ПОЗИЦІЙНО
 * (за кількістю вершин), і на восьмивершинному контурі літери з'їжджали
 * на сусідні ребра. Тепер разом із контуром їде явна таблиця сторін.
 */
describe('ніша в розкрої', () => {
  const zeroAllowances = { ...DEFAULT_ALLOWANCES, show: false } as never;

  const partWithNiche = (patch: Partial<UCutoutSpec> = {}) => {
    const detail = {
      id: 'panel', type: 'Стінова панель', shape: 'Прямокутна', quantity: 1,
      thickness: 20, label: 'Лицьова панель',
      geometry: {
        width: PANEL.width,
        height: PANEL.height,
        ...(() => {
          const s = spec(patch);
          return { customPoints: buildUCutoutContour(s, PANEL), sideSegments: uCutoutSideSegments(s, PANEL) };
        })(),
      },
    } as never;
    return explodeDetails([detail], zeroAllowances).find((part) => part.isMain)!;
  };

  it('парт несе контур ніші, а не прямокутник', () => {
    const part = partWithNiche();
    expect(part.points).toHaveLength(8);
    expect(area(part.points)).toBeCloseTo(PANEL.width * PANEL.height - 1000 * 400, 3);
  });

  it('довжини сторін збігаються з кресленням і не їдуть на сусідні ребра', () => {
    const part = partWithNiche();
    const ids = uCutoutEdgeIds('A');
    expect(edgeLengthForSide(part, ids.before)).toBeCloseTo(500, 0);
    expect(edgeLengthForSide(part, ids.left)).toBeCloseTo(400, 0);
    expect(edgeLengthForSide(part, ids.bottom)).toBeCloseTo(1000, 0);
    expect(edgeLengthForSide(part, ids.right)).toBeCloseTo(400, 0);
    expect(edgeLengthForSide(part, ids.after)).toBeCloseTo(500, 0);
    // І сусідні сторони НЕ постраждали.
    expect(edgeLengthForSide(part, 'B')).toBeCloseTo(700, 0);
    expect(edgeLengthForSide(part, 'C')).toBeCloseTo(2000, 0);
    expect(edgeLengthForSide(part, 'D')).toBeCloseTo(700, 0);
  });

  it('сума торців ніші — це метри, які цех реально обробляє', () => {
    const part = partWithNiche();
    const walls = uCutoutWallIds('A').reduce((sum, id) => sum + edgeLengthForSide(part, id), 0);
    expect(walls).toBeCloseTo(400 + 1000 + 400, 0);
  });
});

/**
 * РЕГРЕСІЯ, знайдена Богданом одразу після релізу: «Добавив, а воно ніхуя,
 * але в розкрій деталь впала з вирізом нішою».
 *
 * Причина: контур із ніші виводився ЛИШЕ на межі «редактор → розкрій»
 * (`elementToDetail`). Розкрій бачив П-подібну деталь, а 3D отримувало
 * чернетку, в якої є `uCutout`, але немає `customPoints`, — і чесно малювало
 * прямокутник. Один об'єкт, дві різні форми залежно від того, хто дивиться.
 *
 * Тепер виведення контуру живе в `shapeBuilder.contourPointsFor` — спільній
 * для 3D і для розкрою точці.
 */
describe('ніша видима і в 3D, не лише в розкрої', () => {
  const draftWithNiche = {
    kind: 'rect', width: 1200, height: 600, thickness: 20,
    uCutout: { side: 'A', offsetMm: 100, widthMm: 400, depthMm: 300 },
  } as never;

  it('чернетка з нішею дає П-подібний контур, а не прямокутник', async () => {
    const { getDetailPointsAndBounds, contourPointsFor } = await import('../../engines/shapeBuilder');

    expect(contourPointsFor(draftWithNiche)).toHaveLength(8);
    const { points } = getDetailPointsAndBounds(draftWithNiche);
    expect(points).toHaveLength(8);
    expect(area(points)).toBeCloseTo(1200 * 600 - 400 * 300, 6);
  });

  it('форма 3D має ребра ніші з іменами', async () => {
    const { getDetailPointsAndBounds, buildDetailShape } = await import('../../engines/shapeBuilder');
    const { points, bounds } = getDetailPointsAndBounds(draftWithNiche);
    const { edgeMap, curves } = buildDetailShape(draftWithNiche, points, bounds);

    // Вісім точок — вісім названих ребер, включно із замикальним.
    expect(curves).toHaveLength(8);
    const names = Object.values(edgeMap);
    uCutoutWallIds('A').forEach((wall) => expect(names).toContain(wall));
    expect(names).toContain('B');
    expect(names).toContain('C');
    expect(names).toContain('D');
  });

  it('прибрали нішу — деталь знову прямокутна', async () => {
    const { getDetailPointsAndBounds } = await import('../../engines/shapeBuilder');
    const plain = { ...(draftWithNiche as object), uCutout: undefined } as never;
    const { points } = getDetailPointsAndBounds(plain);
    expect(points).toHaveLength(4);
  });

  it('імпортований контур головніший за нішу', async () => {
    const { contourPointsFor } = await import('../../engines/shapeBuilder');
    const imported = [
      { x: 0, y: 0, id: 'D' }, { x: 500, y: 0, id: 'A' },
      { x: 500, y: 500, id: 'B' }, { x: 0, y: 500, id: 'C' },
    ];
    const both = { ...(draftWithNiche as object), customPoints: imported } as never;
    expect(contourPointsFor(both)).toEqual(imported);
  });
});
