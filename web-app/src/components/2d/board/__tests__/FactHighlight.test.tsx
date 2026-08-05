/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { FactHighlight } from '../FactHighlight';
import type { DetailPart, Placement, Point } from '../../../../domain/types';
import type { FactRef } from '../../../../engines/productionFacts';

// Підсвітка мусить показувати рівно ті ділянки, за які взято гроші.
// Деталь 1000×600 зі зрізаним кутом 300×300: чотири осьові ділянки ріже
// пила, одну діагональ — вода. Якщо підсвітка малює весь контур на обидва
// рядки, вона бреше про те, за що виставлено рахунок.

const chamfered: Point[] = [
  { x: 0, y: 0 },
  { x: 700, y: 0 },
  { x: 1000, y: 300 },
  { x: 1000, y: 600 },
  { x: 0, y: 600 },
];

const part = (overrides: Partial<DetailPart> = {}): DetailPart => ({
  id: 'part_1',
  detailId: 'det_1',
  name: 'Стільниця',
  type: 'Стільниця',
  shape: 'Довільна',
  width: 1000,
  height: 600,
  rotation: 0,
  area: 0.54,
  points: chamfered,
  isMain: true,
  parentLabel: '1',
  dimsLabel: '1000×600',
  ...overrides,
} as unknown as DetailPart);

// НЕнульове розміщення навмисно: перша версія додавала зсув двічі, і на
// placement (0,0) це було непомітно — саме так баг і пройшов у реліз.
const placement = { id: 'pl_1', slabId: 'slab_1', partId: 'part_1', x: 100, y: 50, rotation: 0 } as unknown as Placement;

const draw = (refs: FactRef[], p = part()) =>
  render(<svg><FactHighlight part={p} placement={placement} refs={refs} scale={0.3} /></svg>).container;

beforeEach(() => cleanup());

describe('FactHighlight', () => {
  it('різ пилою — тільки осьові ділянки, без діагоналі', () => {
    const c = draw([{ factKind: 'saw_cut', partId: 'part_1' }]);
    expect(c.querySelectorAll('line')).toHaveLength(4);
    expect(c.querySelectorAll('polygon')).toHaveLength(0);
  });

  it('різ водою — тільки діагональ', () => {
    const c = draw([{ factKind: 'waterjet_cut', partId: 'part_1' }]);
    expect(c.querySelectorAll('line')).toHaveLength(1);
    const line = c.querySelector('line')!;
    // зріз іде з (700,0) у (1000,300); розміщення (100,50), масштаб 0.3:
    // x1 = (100+700)*0.3 = 240 — зсув додано РІВНО один раз
    expect(Number(line.getAttribute('x1'))).toBeCloseTo(240, 3);
    expect(Number(line.getAttribute('y2'))).toBeCloseTo(105, 3);
  });

  it('пила і вода разом покривають увесь контур і не перетинаються', () => {
    const saw = draw([{ factKind: 'saw_cut', partId: 'part_1' }]).querySelectorAll('line').length;
    cleanup();
    const water = draw([{ factKind: 'waterjet_cut', partId: 'part_1' }]).querySelectorAll('line').length;
    expect(saw + water).toBe(chamfered.length);
  });

  it('на прямокутнику водою не ріжеться нічого', () => {
    const rect = part({ points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }] });
    expect(draw([{ factKind: 'waterjet_cut', partId: 'part_1' }], rect).querySelectorAll('line')).toHaveLength(0);
  });

  it('виріз підсвічується власним контуром, а не контуром деталі', () => {
    const withHole = part({ holes: [[{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }, { x: 200, y: 400 }]] });
    const c = draw([{ factKind: 'cutout_perimeter', partId: 'part_1', cutoutIndex: 0 }], withHole);
    expect(c.querySelectorAll('polygon')).toHaveLength(1);
    // (100+200)*0.3 = 90, (50+200)*0.3 = 75
    expect(c.querySelector('polygon')!.getAttribute('points')).toContain('90,75');
  });

  it('площа й монтаж підсвічують увесь контур', () => {
    const c = draw([{ factKind: 'detail_area', partId: 'part_1' }]);
    expect(c.querySelectorAll('polygon')).toHaveLength(1);
    expect(c.querySelectorAll('line')).toHaveLength(0);
  });

  it('кут прив’язаний до Елемента, а не до парта — знаходимо через слот', () => {
    const p = part({ detailId: 'prod_1/element:main/detail:main' });
    const c = draw([{ factKind: 'corner', elementPath: 'prod_1/prod_1/element:main', cornerId: 'A' }], p);
    expect(c.querySelectorAll('polygon')).toHaveLength(1);
  });

  it('стик — ділянка сторони, а не контур деталі', () => {
    // Стик по стороні C (права, 0..600 мм), займає 100..500 мм.
    // Прямокутна форма: C іде з (1000,0) у (1000,600).
    const p = part({
      detailId: 'prod_1/element:main/detail:main',
      shape: 'Прямокутна',
      points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }],
    });
    const c = draw([{
      factKind: 'joint_length',
      elementPath: 'prod_1/element:main',
      side: 'C', fromMm: 100, toMm: 500,
    }], p);
    expect(c.querySelectorAll('polygon')).toHaveLength(0);
    const line = c.querySelector('line')!;
    // x = (100+1000)*0.3 = 330; y від (50+100)*0.3=45 до (50+500)*0.3=165
    expect(Number(line.getAttribute('x1'))).toBeCloseTo(330, 3);
    expect(Number(line.getAttribute('y1'))).toBeCloseTo(45, 3);
    expect(Number(line.getAttribute('y2'))).toBeCloseTo(165, 3);
  });

  it('стик видно і на другій деталі — через прив’язку B', () => {
    const p = part({
      detailId: 'prod_1/element:skirting_A/detail:main',
      shape: 'Прямокутна',
      points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 100 }, { x: 0, y: 100 }],
    });
    const c = draw([{
      factKind: 'joint_length',
      elementPath: 'prod_1/element:main', side: 'C', fromMm: 0, toMm: 600,
      elementPathB: 'prod_1/element:skirting_A', sideB: 'A', fromMmB: 0, toMmB: 100,
    }], p);
    // деталь відповідає лише прив'язці B — малюється рівно одна лінія
    expect(c.querySelectorAll('line')).toHaveLength(1);
    expect(c.querySelectorAll('polygon')).toHaveLength(0);
  });

  it('торець прямої сторони — рівно її відрізок', () => {
    const p = part({
      shape: 'Прямокутна',
      points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }],
    });
    const c = draw([{ factKind: 'edge', partId: 'part_1', side: 'C' }], p);
    const poly = c.querySelector('polyline')!;
    expect(poly).toBeTruthy();
    // C права: x = (100+1000)*0.3 = 330, y від (50+0)*0.3=15 до (50+600)*0.3=195
    const pts = poly.getAttribute('points')!.split(' ').map((pair) => pair.split(',').map(Number));
    expect(pts).toHaveLength(2);
    expect(pts[0][0]).toBeCloseTo(330, 3);
    expect(pts[0][1]).toBeCloseTo(15, 3);
    expect(pts[1][1]).toBeCloseTo(195, 3);
  });

  it('торець із радіусним кутом підсвічується разом із половиною дуги', () => {
    // Кут між B (низ) і C (право) зрізано дугою: B закінчується на (800,0),
    // C починається з (1000,200), між ними — середина дуги. Кошторис рахує
    // метри B разом із половиною дуги — підсвітка мусить показати те саме.
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
    const c = draw([{ factKind: 'edge', partId: 'part_1', side: 'B' }], p);
    const poly = c.querySelector('polyline')!;
    expect(poly).toBeTruthy();
    const pts = poly.getAttribute('points')!.split(' ').map((pair) => pair.split(',').map(Number));
    // (0,0) → (800,0) → середина дуги; зсув (100,50) додано рівно один раз
    expect(pts).toHaveLength(3);
    expect(pts[0][0]).toBeCloseTo(30, 3);   // (100+0)*0.3
    expect(pts[1][0]).toBeCloseTo(270, 3);  // (100+800)*0.3
    expect(pts[2][0]).toBeCloseTo(312.43, 1); // (100+941.42)*0.3
    expect(pts[2][1]).toBeCloseTo(32.57, 1);  // (50+58.58)*0.3
  });

  it('чужа деталь нічого не малює', () => {
    const c = draw([{ factKind: 'saw_cut', partId: 'part_ІНША' }]);
    expect(c.querySelectorAll('line, polygon')).toHaveLength(0);
  });

  it('порожній перелік нічого не малює', () => {
    expect(draw([]).querySelectorAll('g.fact-highlight')).toHaveLength(0);
  });
});
