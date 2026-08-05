import { describe, it, expect } from 'vitest';
import type { DetailPart, Point, Project } from '../../domain/types';
import {
  extractProductionFacts,
  summarizeFacts,
  sumFacts,
  isCircleLike,
  jointLengthMm,
  HOLE_SIZE_THRESHOLD_MM,
  JOINT_LENGTH_THRESHOLD_MM,
} from '../productionFacts';

// Усі очікувані числа порахованi руками й записані в коментарях.
// Якщо тест впаде — спершу перерахуйте на папері, а вже потім правте код.

// ── Фабрики ──────────────────────────────────────────────────────────

/** Прямокутник із порядком вершин, який дає сторони B(низ) C(право) D(верх) A(ліво) */
function rect(w: number, h: number, x = 0, y = 0): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function circle(cx: number, cy: number, r: number, segments = 24): Point[] {
  return Array.from({ length: segments }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

function part(overrides: Partial<DetailPart> = {}): DetailPart {
  return {
    id: 'part_1',
    detailId: 'det_1',
    name: 'Деталь',
    type: 'Стільниця',
    shape: 'Прямокутна',
    width: 1000,
    height: 600,
    rotation: 0,
    area: 0.6,
    points: rect(1000, 600),
    isMain: true,
    parentLabel: '1',
    dimsLabel: '1000×600',
    ...overrides,
  } as DetailPart;
}

function project(overrides: Record<string, unknown> = {}): Project {
  return {
    id: 'proj',
    orderNumber: 'test',
    projectMaterial: 'Керамограніт',
    details: [],
    products: [],
    slabs: [],
    placements: [],
    ...overrides,
  } as unknown as Project;
}

// ── Дрібні функції ───────────────────────────────────────────────────

describe('isCircleLike', () => {
  it('коло з 24 сегментів — коло', () => {
    expect(isCircleLike(circle(0, 0, 30))).toBe(true);
  });

  it('прямокутник — не коло', () => {
    expect(isCircleLike(rect(500, 400))).toBe(false);
  });

  it('витягнутий 24-кутник — не коло', () => {
    const oval = circle(0, 0, 100).map((p) => ({ x: p.x * 3, y: p.y }));
    expect(isCircleLike(oval)).toBe(false);
  });
});

describe('jointLengthMm', () => {
  const joint = (aFrom: number, aTo: number, bFrom: number, bTo: number) => ({
    id: 'j', origin: 'authored', type: 'butt', dominant: 'a', textureContinuity: true,
    a: { elementPath: 'p/e', sideId: 'A', from: aFrom, to: aTo },
    b: { elementPath: 'p/e2', sideId: 'C', from: bFrom, to: bTo },
  }) as never;

  it('однакові прив’язки — та сама довжина', () => {
    expect(jointLengthMm(joint(0, 600, 0, 600))).toBe(600);
  });

  it('різні — беремо спільну, тобто меншу', () => {
    expect(jointLengthMm(joint(0, 900, 0, 600))).toBe(600);
  });

  it('зворотний напрям не робить довжину від’ємною', () => {
    expect(jointLengthMm(joint(900, 0, 600, 0))).toBe(600);
  });
});

// ── Різ по контуру ───────────────────────────────────────────────────

describe('різ по зовнішньому контуру', () => {
  it('прямокутник 1000×600 — уся довжина йде на пилу', () => {
    // периметр = 2*(1000+600) = 3200 мм = 3.2 м
    const facts = extractProductionFacts(project(), [part()]);
    expect(sumFacts(facts, 'saw_cut')).toBe(3.2);
    expect(sumFacts(facts, 'waterjet_cut')).toBe(0);
  });

  it('зрізаний кут переводить свою ділянку на воду', () => {
    // Прямокутник 1000×600 зі зрізом 300×300 у куті (1000,0):
    // низ 700, гіпотенуза √(300²+300²)=424.264, право 300, верх 1000, ліво 600
    // пила  = 700 + 300 + 1000 + 600 = 2600 мм = 2.6 м
    // вода  = 424.3 мм = 0.4243 м → округлення до 0.1 мм дає 0.4243
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 700, y: 0 },
      { x: 1000, y: 300 },
      { x: 1000, y: 600 },
      { x: 0, y: 600 },
    ];
    const facts = extractProductionFacts(project(), [part({ points })]);
    expect(sumFacts(facts, 'saw_cut')).toBe(2.6);
    expect(sumFacts(facts, 'waterjet_cut')).toBeCloseTo(0.4243, 4);
  });

  it('пила і вода разом дають повний периметр', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 700, y: 0 },
      { x: 1000, y: 300 },
      { x: 1000, y: 600 },
      { x: 0, y: 600 },
    ];
    const facts = extractProductionFacts(project(), [part({ points })]);
    const total = sumFacts(facts, 'saw_cut') + sumFacts(facts, 'waterjet_cut');
    expect(total).toBeCloseTo((700 + Math.hypot(300, 300) + 300 + 1000 + 600) / 1000, 3);
  });

  it('доповнення (підворот) теж ріжеться і потрапляє у факти', () => {
    const facts = extractProductionFacts(project(), [
      part(),
      part({ id: 'part_2', isMain: false, points: rect(1000, 100), area: 0.1 }),
    ]);
    // 3.2 (деталь) + 2*(1000+100)/1000 = 3.2 + 2.2 = 5.4
    expect(sumFacts(facts, 'saw_cut')).toBe(5.4);
    // площа рахується лише по головних партах
    expect(sumFacts(facts, 'detail_area')).toBe(0.6);
  });
});

// ── Отвори та вирізи ─────────────────────────────────────────────────

describe('отвори та вирізи', () => {
  it('коло Ø60 — одна штука, не метри', () => {
    const facts = extractProductionFacts(project(), [part({ holes: [circle(500, 300, 30)] })]);
    expect(sumFacts(facts, 'hole_small')).toBe(1);
    expect(sumFacts(facts, 'hole_large')).toBe(0);
    expect(sumFacts(facts, 'cutout_perimeter')).toBe(0);
  });

  it('коло Ø200 — метри периметра', () => {
    const facts = extractProductionFacts(project(), [part({ holes: [circle(500, 300, 100)] })]);
    expect(sumFacts(facts, 'hole_small')).toBe(0);
    // 24-кутник, вписаний у Ø200: периметр ≈ π*200*(sin(π/24)/(π/24)) ≈ 626.5 мм
    expect(sumFacts(facts, 'hole_large')).toBeGreaterThan(0.62);
    expect(sumFacts(facts, 'hole_large')).toBeLessThan(0.63);
  });

  it('поріг 100 мм: Ø99 — штука, Ø101 — метри', () => {
    const small = extractProductionFacts(project(), [part({ holes: [circle(500, 300, 49.5)] })]);
    const large = extractProductionFacts(project(), [part({ holes: [circle(500, 300, 50.5)] })]);
    expect(HOLE_SIZE_THRESHOLD_MM).toBe(100);
    expect(sumFacts(small, 'hole_small')).toBe(1);
    expect(sumFacts(large, 'hole_small')).toBe(0);
    expect(sumFacts(large, 'hole_large')).toBeGreaterThan(0);
  });

  it('прямокутний виріз 500×400 — периметр 1.8 м', () => {
    const facts = extractProductionFacts(project(), [part({ holes: [rect(500, 400, 200, 100)] })]);
    expect(sumFacts(facts, 'cutout_perimeter')).toBe(1.8);
    expect(sumFacts(facts, 'hole_small')).toBe(0);
  });

  it('кілька отворів рахуються окремими фактами', () => {
    const facts = extractProductionFacts(project(), [
      part({ holes: [circle(200, 300, 20), circle(400, 300, 20), rect(500, 400, 500, 100)] }),
    ]);
    expect(sumFacts(facts, 'hole_small')).toBe(2);
    expect(sumFacts(facts, 'cutout_perimeter')).toBe(1.8);
    expect(facts.filter((f) => f.kind === 'hole_small')).toHaveLength(2);
  });
});

// ── Крайка ───────────────────────────────────────────────────────────

describe('обробка торця', () => {
  const details = [{ id: 'det_1', edgeProfiles: { A: 'd_12', B: 'r2_top' } }] as never;

  it('довжина береться з реального сегмента сторони, а не з габариту', () => {
    // A — ліва сторона (600 мм), B — нижня (1000 мм)
    const facts = extractProductionFacts(project({ details }), [part()]);
    expect(sumFacts(facts, 'edge', 'd_12')).toBe(0.6);
    expect(sumFacts(facts, 'edge', 'r2_top')).toBe(1.0);
  });

  it('лицьове і тильне ребро — два окремі проходи фрези', () => {
    const detailsBoth = [{
      id: 'det_1',
      edgeProfiles: { B: { top: { profileId: 'r2_top' }, bottom: { profileId: 'r2_top' } } },
    }] as never;
    const facts = extractProductionFacts(project({ details: detailsBoth }), [part()]);
    expect(sumFacts(facts, 'edge', 'r2_top')).toBe(2.0);
  });

  it('крайка з карти крою перебиває крайку деталі', () => {
    const p = project({
      details,
      placements: [{ id: 'pl_1', slabId: 'slab_1', partId: 'part_1', edgeProfiles: { B: 'sharknose' } }],
    });
    const facts = extractProductionFacts(p, [part()]);
    expect(sumFacts(facts, 'edge', 'sharknose')).toBe(1.0);
    expect(sumFacts(facts, 'edge', 'd_12')).toBe(0);
  });

  it('доповнення крайку не отримує — вона належить деталі', () => {
    const facts = extractProductionFacts(project({ details }), [
      part({ id: 'part_2', isMain: false }),
    ]);
    expect(sumFacts(facts, 'edge')).toBe(0);
  });

  it('кромка через радіусний кут — разом із половинами дуги', () => {
    // Кут між B (низ, 1000) і C (право, 600) зрізано дугою: B закінчується
    // на (800,0), C починається з (1000,200), між ними — середина дуги.
    // Дуга не належить жодній стороні, але фреза профілю через неї не
    // перестрибує: кожна сторона забирає свою половину.
    //   хорда (800,0)→середина = √(141.42² + 58.58²) ≈ 153.07 мм
    //   B: 800 + 153.07 = 953.1 мм → 0.9531 · C: 153.07 + 400 = 553.1 → 0.5531
    const arcMid = { x: 941.4213562373095, y: 58.57864376269049 };
    const p = part({
      points: [
        { x: 0, y: 0 }, { x: 800, y: 0 }, arcMid, { x: 1000, y: 200 },
        { x: 1000, y: 600 }, { x: 0, y: 600 },
      ],
      sideSegments: {
        B: { start: { x: 0, y: 0 }, end: { x: 800, y: 0 } },
        C: { start: { x: 1000, y: 200 }, end: { x: 1000, y: 600 } },
        D: { start: { x: 1000, y: 600 }, end: { x: 0, y: 600 } },
        A: { start: { x: 0, y: 600 }, end: { x: 0, y: 0 } },
      },
    } as Partial<DetailPart>);
    const detailsArc = [{ id: 'det_1', edgeProfiles: { B: 'r2_top', C: 'r2_top' } }] as never;
    const facts = extractProductionFacts(project({ details: detailsArc }), [p]);
    expect(sumFacts(facts, 'edge', 'r2_top')).toBeCloseTo(1.5062, 4);
  });
});

// ── Стики ────────────────────────────────────────────────────────────

describe('стики', () => {
  const withJoint = (from: number, to: number, type = 'butt') => project({
    products: [{
      id: 'prod_1',
      elements: [{
        id: 'el_1',
        baseDefinition: {},
        additions: [],
        joints: [{
          id: 'j1', origin: 'authored', type, dominant: 'a', textureContinuity: true,
          a: { elementPath: 'prod_1/el_1', sideId: 'C', from, to },
          b: { elementPath: 'prod_1/el_2', sideId: 'A', from, to },
        }],
      }],
    }],
  });

  it('довжина стику потрапляє у факти разом із типом', () => {
    const facts = extractProductionFacts(withJoint(0, 600, 'miter45'), []);
    expect(sumFacts(facts, 'joint_length', 'miter45')).toBe(0.6);
  });

  it('поріг 500 мм ділить стики на дві категорії', () => {
    expect(JOINT_LENGTH_THRESHOLD_MM).toBe(500);
    expect(sumFacts(extractProductionFacts(withJoint(0, 400), []), 'joint_count', 'lt500')).toBe(1);
    expect(sumFacts(extractProductionFacts(withJoint(0, 600), []), 'joint_count', 'gt500')).toBe(1);
  });

  it('стик у вкладеному елементі теж рахується', () => {
    const p = project({
      products: [{
        id: 'prod_1',
        elements: [{
          id: 'el_1',
          baseDefinition: {},
          joints: [],
          additions: [{
            id: 'el_1a',
            baseDefinition: {},
            additions: [],
            joints: [{
              id: 'j2', origin: 'authored', type: 'glued', dominant: 'a', textureContinuity: false,
              a: { elementPath: 'prod_1/el_1a', sideId: 'A', from: 0, to: 800 },
              b: { elementPath: 'prod_1/el_1', sideId: 'C', from: 0, to: 800 },
            }],
          }],
        }],
      }],
    });
    const facts = extractProductionFacts(p, []);
    expect(sumFacts(facts, 'joint_length', 'glued')).toBe(0.8);
  });

  it('один стик не рахується двічі, навіть якщо трапився в обох елементах', () => {
    const joint = {
      id: 'shared', origin: 'authored', type: 'butt', dominant: 'a', textureContinuity: true,
      a: { elementPath: 'prod_1/el_1', sideId: 'C', from: 0, to: 600 },
      b: { elementPath: 'prod_1/el_2', sideId: 'A', from: 0, to: 600 },
    };
    const p = project({
      products: [{
        id: 'prod_1',
        elements: [
          { id: 'el_1', baseDefinition: {}, additions: [], joints: [joint] },
          { id: 'el_2', baseDefinition: {}, additions: [], joints: [joint] },
        ],
      }],
    });
    expect(sumFacts(extractProductionFacts(p, []), 'joint_length')).toBe(0.6);
  });
});

// ── Кути ─────────────────────────────────────────────────────────────

describe('оброблені кути', () => {
  it('радіуси і зрізи рахуються окремо', () => {
    const p = project({
      products: [{
        id: 'prod_1',
        elements: [{
          id: 'el_1',
          additions: [],
          joints: [],
          baseDefinition: {
            corners: {
              A: { type: 'radius', radius: 60 },
              B: { type: 'chamfer', sizeB: 30, sizeC: 30 },
              C: { type: 'radius', radius: 15 },
            },
          },
        }],
      }],
    });
    const facts = extractProductionFacts(p, []);
    expect(sumFacts(facts, 'corner', 'radius')).toBe(2);
    expect(sumFacts(facts, 'corner', 'chamfer')).toBe(1);
  });

  it('кути деталі без виробу теж рахуються', () => {
    const p = project({
      details: [{ id: 'det_1', geometry: { corners: { A: { type: 'chamfer' } } } }] as never,
    });
    expect(sumFacts(extractProductionFacts(p, []), 'corner', 'chamfer')).toBe(1);
  });
});

// ── Матеріал ─────────────────────────────────────────────────────────

describe('матеріал і відхід', () => {
  const slabs = [
    { id: 'slab_1', width: 3200, height: 1600, thickness: 20, material: 'Керамограніт', decor: '', comment: '', minMargin: 10 },
    { id: 'slab_2', width: 3200, height: 1600, thickness: 20, material: 'Керамограніт', decor: '', comment: '', minMargin: 10 },
  ] as never;

  it('рахуються лише задіяні сляби, а не всі створені', () => {
    const p = project({
      slabs,
      placements: [{ id: 'pl_1', slabId: 'slab_1', partId: 'part_1' }],
    });
    const facts = extractProductionFacts(p, [part()]);
    expect(sumFacts(facts, 'slabs_used')).toBe(1);
    // 3200*1600 мм² = 5.12 м²
    expect(sumFacts(facts, 'slab_area')).toBe(5.12);
  });

  it('без розміщень падаємо на всі сляби проєкту', () => {
    const facts = extractProductionFacts(project({ slabs }), [part()]);
    expect(sumFacts(facts, 'slabs_used')).toBe(2);
    expect(sumFacts(facts, 'slab_area')).toBe(10.24);
  });

  it('відхід — різниця, а не коефіцієнт 1.2', () => {
    const p = project({
      slabs,
      placements: [{ id: 'pl_1', slabId: 'slab_1', partId: 'part_1' }],
    });
    const facts = extractProductionFacts(p, [part()]); // площа деталі 0.6 м²
    // 5.12 − 0.6 = 4.52
    expect(sumFacts(facts, 'waste_area')).toBe(4.52);
  });
});

// ── Зведення ─────────────────────────────────────────────────────────

describe('summarizeFacts', () => {
  it('згортає по виду і варіанту, рахуючи кількість джерел', () => {
    const facts = extractProductionFacts(project(), [
      part({ holes: [circle(200, 300, 20), circle(400, 300, 20)] }),
    ]);
    const totals = summarizeFacts(facts);
    const holes = totals.find((t) => t.kind === 'hole_small');
    expect(holes?.qty).toBe(2);
    expect(holes?.count).toBe(2);
    expect(holes?.unit).toBe('pcs');
  });

  it('нульові величини у факти не потрапляють', () => {
    const facts = extractProductionFacts(project(), [part()]);
    expect(facts.every((f) => f.qty > 0)).toBe(true);
    expect(facts.some((f) => f.kind === 'waterjet_cut')).toBe(false);
  });
});

// ── Порожній проєкт ──────────────────────────────────────────────────

describe('порожній проєкт', () => {
  it('не падає і не вигадує чисел', () => {
    const facts = extractProductionFacts(project(), []);
    expect(facts).toEqual([]);
  });

  it('парт без контуру ігнорується', () => {
    const facts = extractProductionFacts(project(), [part({ points: [] })]);
    expect(sumFacts(facts, 'saw_cut')).toBe(0);
  });
});
