import { describe, it, expect } from 'vitest';
import {
  jointAnchorPoints,
  jointAxisForSide,
  nearestAnchorId,
  oppositeSideId,
  manualJointPosition,
  reflexJointShift,
  type JointSideSegment,
} from '../joints';
import { pointInPolygonStrict } from '../../engines/geometryUtils';

/** Прямокутник 2400×600 у мм, сторони названі як у shapeBuilder: A/B/C/D. */
const RECT: JointSideSegment[] = [
  { id: 'A', v1: { x: 0, y: 0 }, v2: { x: 2400, y: 0 } },      // низ
  { id: 'B', v1: { x: 2400, y: 0 }, v2: { x: 2400, y: 600 } }, // право
  { id: 'C', v1: { x: 2400, y: 600 }, v2: { x: 0, y: 600 } },  // верх
  { id: 'D', v1: { x: 0, y: 600 }, v2: { x: 0, y: 0 } },       // ліво
];

describe('сторони і стики', () => {
  it('протилежна сторона прямокутника', () => {
    expect(oppositeSideId(RECT, 'A')).toBe('C');
    expect(oppositeSideId(RECT, 'C')).toBe('A');
    expect(oppositeSideId(RECT, 'B')).toBe('D');
    expect(oppositeSideId(RECT, 'D')).toBe('B');
  });

  it('горизонтальна сторона ріжеться вертикально, і навпаки', () => {
    expect(jointAxisForSide(RECT[0])).toBe('vertical');
    expect(jointAxisForSide(RECT[1])).toBe('horizontal');
  });

  it('опорний кут — найближчий із того словника, який читає рушій', () => {
    const anchors = jointAnchorPoints('Прямокутна', { width: 2400, height: 600 });
    expect(anchors && Object.keys(anchors).sort()).toEqual(['AB', 'BC', 'CD', 'DA']);
    // сторона A починається в (0,0) — це кут DA
    expect(nearestAnchorId(anchors, RECT[0].v1)).toBe('DA');
    // сторона B починається в (2400,0) — це кут AB
    expect(nearestAnchorId(anchors, RECT[1].v1)).toBe('AB');
    // сторона C починається в (2400,600) — це кут BC
    expect(nearestAnchorId(anchors, RECT[2].v1)).toBe('BC');
  });

  it('відступ від кута перетворюється на абсолютну позицію', () => {
    const anchors = jointAnchorPoints('Прямокутна', { width: 2400, height: 600 });
    const { requested, snapped } = manualJointPosition(anchors, {}, {
      axis: 'vertical',
      anchorCorner: 'AB', // x = 2400
      offset: -900,
    });
    expect(requested).toBe(1500);
    expect(snapped).toBe(1500);
  });

  it('стик, що потрапив на дугу, відсувається до її межі', () => {
    // П-форма з прикладу RULE_joint_vs_inner_radius: увігнутий кут D на (1800,600), R300.
    const anchors = jointAnchorPoints('П-подібна', {
      width: 2400, height: 1200, innerCutWidth: 1200, innerCutDepth: 600, innerCutOffset: 600,
    });
    expect(anchors?.D).toEqual({ x: 1800, y: 600 });

    const corners = { D: { type: 'radius' as const, radius: 300 } };
    const { requested, snapped } = manualJointPosition(anchors, corners, {
      axis: 'vertical', anchorCorner: 'D', offset: 0,
    });
    expect(requested).toBe(1800);
    // рівно в куті — всередині дуги, має відсунутись на радіус
    expect(Math.abs(snapped - 1800)).toBe(300);
  });

  it('П-форма: у верхньої смуги протилежна сторона є, у ніжок теж', () => {
    // Спрощений контур П 2400×1200, виріз 1200×600 зі зсувом 600.
    const U: JointSideSegment[] = [
      { id: 'A', v1: { x: 0, y: 0 }, v2: { x: 2400, y: 0 } },
      { id: 'B', v1: { x: 2400, y: 0 }, v2: { x: 2400, y: 1200 } },
      { id: 'C', v1: { x: 2400, y: 1200 }, v2: { x: 1800, y: 1200 } },
      { id: 'D', v1: { x: 1800, y: 1200 }, v2: { x: 1800, y: 600 } },
      { id: 'E', v1: { x: 1800, y: 600 }, v2: { x: 600, y: 600 } },
      { id: 'F', v1: { x: 600, y: 600 }, v2: { x: 600, y: 1200 } },
      { id: 'G', v1: { x: 600, y: 1200 }, v2: { x: 0, y: 1200 } },
      // Замикаюче ліве ребро в shapeBuilder має саме таке ім'я — `start`.
      // Воно мусить лишатись у списку сторін, інакше протилежною до B
      // знайдеться внутрішня стінка вирізу.
      { id: 'start', v1: { x: 0, y: 1200 }, v2: { x: 0, y: 0 } },
    ];
    // Нижня сторона A — найдальша паралельна це E (y=600) чи C/G (y=1200)? Беремо найдальшу.
    expect(oppositeSideId(U, 'A')).toBe('C');
    // Права B (x=2400) — найдальша паралельна це замикаюче ліве ребро (x=0)
    expect(oppositeSideId(U, 'B')).toBe('start');
    // Внутрішня стінка вирізу D (x=1800) — теж ліве ребро
    expect(oppositeSideId(U, 'D')).toBe('start');
  });
});

/**
 * Обрізка лінії стику по контуру — та сама математика, що в `jointSpansOnShape`
 * у `Detail3DPreview`. Стик є хордою, а не нескінченною прямою: на П-формі
 * вертикальна лінія в зоні вирізу мусить дати ДВА окремі шматки, інакше вона
 * повисне в повітрі над вирізом.
 */
function spans(poly: Array<{ x: number; y: number }>, axis: 'vertical' | 'horizontal', position: number) {
  const crossings: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const av = axis === 'vertical' ? a.x : a.y;
    const bv = axis === 'vertical' ? b.x : b.y;
    if (Math.abs(bv - av) < 1e-6) continue;
    const t = (position - av) / (bv - av);
    if (t < 0 || t > 1) continue;
    crossings.push(axis === 'vertical' ? a.y + t * (b.y - a.y) : a.x + t * (b.x - a.x));
  }
  crossings.sort((p, q) => p - q);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < crossings.length; i++) {
    const lo = crossings[i];
    const hi = crossings[i + 1];
    if (hi - lo < 1) continue;
    const mid = (lo + hi) / 2;
    const probe = axis === 'vertical' ? { x: position, y: mid } : { x: mid, y: position };
    if (pointInPolygonStrict(probe, poly)) out.push([lo, hi]);
  }
  return out;
}

describe('зсув стику з дуги увігнутого кута', () => {
  const R300 = { E: { type: 'radius' as const, radius: 300 } };

  it('без радіуса зсуву немає', () => {
    expect(reflexJointShift({}, 'E', [1200, 600], 'second')).toBe(0);
    expect(reflexJointShift(undefined, 'E', [1200, 600], 'second')).toBe(0);
  });

  it('фаска — не радіус, зсуву теж немає', () => {
    const chamfer = { E: { type: 'chamfer' as const, sizeB: 100, sizeC: 100 } };
    expect(reflexJointShift(chamfer, 'E', [1200, 600], 'second')).toBe(0);
  });

  it('second (за замовчуванням) віддає дугу сусідній деталі — зсув від’ємний', () => {
    expect(reflexJointShift(R300, 'E', [1200, 600], 'second')).toBe(-300);
    expect(reflexJointShift(R300, 'E', [1200, 600], undefined)).toBe(-300);
  });

  it('first лишає дугу деталі з меншою координатою — зсув додатний', () => {
    expect(reflexJointShift(R300, 'E', [1200, 600], 'first')).toBe(300);
  });

  it('радіус обмежується розмірами вирізу, інакше стик перескочив би за край', () => {
    const huge = { E: { type: 'radius' as const, radius: 5000 } };
    expect(reflexJointShift(huge, 'E', [1200, 600], 'first')).toBe(600);
  });
});

describe('лінія стику лежить на матеріалі', () => {
  const RECT_POLY = [
    { x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 600 }, { x: 0, y: 600 },
  ];

  // П 2400×1200, виріз 1200×600 зі зсувом 600 — контур як у Detail3DNode.
  const U_POLY = [
    { x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 1200 }, { x: 1800, y: 1200 },
    { x: 1800, y: 600 }, { x: 600, y: 600 }, { x: 600, y: 1200 }, { x: 0, y: 1200 },
  ];

  it('на прямокутнику — один суцільний шматок на всю висоту', () => {
    expect(spans(RECT_POLY, 'vertical', 1200)).toEqual([[0, 600]]);
  });

  it('на П-формі поза вирізом — теж один шматок', () => {
    // x = 300 проходить через ліву ніжку
    expect(spans(U_POLY, 'vertical', 300)).toEqual([[0, 1200]]);
  });

  it('на П-формі горизонталь у зоні вирізу дає ДВА шматки', () => {
    // y = 900 — вище дна вирізу (600), тому ріже обидві ніжки й не йде по повітрю
    expect(spans(U_POLY, 'horizontal', 900)).toEqual([[0, 600], [1800, 2400]]);
  });

  it('на П-формі вертикаль у зоні вирізу обрізається до нижньої смуги', () => {
    // x = 1200 — усередині вирізу по горизонталі, матеріал лише знизу до y=600
    expect(spans(U_POLY, 'vertical', 1200)).toEqual([[0, 600]]);
  });
});
