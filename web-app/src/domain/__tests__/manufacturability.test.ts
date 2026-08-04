import { describe, it, expect } from 'vitest';
import type { DetailPart, Point, Project } from '../types';
import {
  checkManufacturability,
  summarizeIssues,
  minRawWidthForLength,
  HOLE_LIMITS,
  CUTOUT_LIMITS,
  RADIUS_LIMITS,
  MIN_PART_WITH_PROCESSING,
  MAX_PART_FOR_PROCESSING,
} from '../manufacturability';

const rect = (w: number, h: number, x = 0, y = 0): Point[] => ([
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
]);

const circle = (cx: number, cy: number, r: number, segments = 24): Point[] =>
  Array.from({ length: segments }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

const part = (overrides: Partial<DetailPart> = {}): DetailPart => ({
  id: 'part_1',
  detailId: 'det_1',
  name: 'Стільниця',
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
} as DetailPart);

const project = (overrides: Record<string, unknown> = {}): Project => ({
  id: 'proj',
  projectMaterial: 'Керамограніт',
  details: [],
  products: [],
  slabs: [],
  placements: [],
  ...overrides,
} as unknown as Project);

const codes = (issues: ReturnType<typeof checkManufacturability>) => issues.map((i) => i.code);

// ── Габарити ─────────────────────────────────────────────────────────

describe('габарити деталі', () => {
  const withEdge = [{ id: 'det_1', edgeProfiles: { A: 'r2_top' } }] as never;

  it('нормальна деталь із обробкою проходить', () => {
    const issues = checkManufacturability(project(), [part()], { details: withEdge });
    expect(codes(issues)).toEqual([]);
  });

  it('деталь із обробкою менша за 400×200 не проходить', () => {
    const small = part({ points: rect(380, 250), width: 380, height: 250 });
    const issues = checkManufacturability(project(), [small], { details: withEdge });
    expect(codes(issues)).toContain('part_too_small');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain(`${MIN_PART_WITH_PROCESSING.long}×${MIN_PART_WITH_PROCESSING.short}`);
  });

  it('рівно 400×200 — межа, ще проходить', () => {
    const edge = part({ points: rect(400, 200) });
    expect(codes(checkManufacturability(project(), [edge], { details: withEdge }))).toEqual([]);
  });

  it('деталь, більша за робоче поле верстата', () => {
    const huge = part({ points: rect(3200, 1400) });
    const issues = checkManufacturability(project(), [huge], { details: withEdge });
    expect(codes(issues)).toContain('part_too_large');
    expect(issues[0].message).toContain(`${MAX_PART_FOR_PROCESSING.long}`);
  });

  it('чорнова деталь живе за іншими правилами', () => {
    // без крайок і отворів: 180×12 — коротка й тонка, це можна
    const raw = part({ points: rect(180, 12) });
    expect(codes(checkManufacturability(project(), [raw]))).toEqual([]);
  });

  it('довга й вузька чорнова деталь ламається на вібрації', () => {
    // 900 мм завдовжки при 20 мм ширини — треба від 30
    const raw = part({ points: rect(900, 20) });
    const issues = checkManufacturability(project(), [raw]);
    expect(codes(issues)).toContain('raw_part_too_narrow');
    expect(issues[0].message).toContain('30');
  });

  it('поріг ширини залежить від довжини', () => {
    expect(minRawWidthForLength(200)).toBe(10);
    expect(minRawWidthForLength(201)).toBe(30);
    expect(minRawWidthForLength(600)).toBe(30);
  });
});

// ── Отвори ───────────────────────────────────────────────────────────

describe('отвори', () => {
  it('Ø60 посередині деталі — усе гаразд', () => {
    const p = part({ holes: [circle(500, 300, 30)] });
    expect(codes(checkManufacturability(project(), [p]))).toEqual([]);
  });

  it('отвір, менший за Ø6, зробити нічим', () => {
    const p = part({ holes: [circle(500, 300, 2)] });
    const issues = checkManufacturability(project(), [p]);
    expect(codes(issues)).toContain('hole_too_small');
    expect(issues.find((i) => i.code === 'hole_too_small')?.severity).toBe('error');
  });

  it('малий отвір ближче 12.5 мм до краю — втрата гарантії', () => {
    // центр на 10 мм від лівого краю при радіусі 5 → відступ ≈5 мм
    const p = part({ holes: [circle(10, 300, 5)] });
    const issues = checkManufacturability(project(), [p]);
    const issue = issues.find((i) => i.code === 'hole_too_close_to_edge');
    expect(issue?.severity).toBe('guarantee');
    expect(issue?.message).toContain(String(HOLE_LIMITS.minEdgeDistanceSmall));
  });

  it('великий отвір міряється строгіше — 50 мм від краю', () => {
    // Ø200 з центром за 130 мм від краю → відступ 30 мм
    const p = part({ holes: [circle(130, 300, 100)] });
    const issues = checkManufacturability(project(), [p]);
    expect(codes(issues)).toContain('hole_too_close_to_edge');
    expect(issues.find((i) => i.code === 'hole_too_close_to_edge')?.message)
      .toContain(String(HOLE_LIMITS.minEdgeDistanceLarge));
  });

  it('на широкій деталі діаметр обмежений шириною мінус 100', () => {
    // деталь 1000×800, отвір Ø750 → максимум 800−100 = 700
    const p = part({ points: rect(1000, 800), holes: [circle(500, 400, 375)] });
    const issues = checkManufacturability(project(), [p]);
    expect(codes(issues)).toContain('hole_too_large_for_part');
  });
});

// ── Вирізи ───────────────────────────────────────────────────────────

describe('вирізи', () => {
  it('виріз посередині проходить', () => {
    const p = part({ points: rect(1500, 800), holes: [rect(500, 400, 500, 200)] });
    expect(codes(checkManufacturability(project(), [p]))).toEqual([]);
  });

  it('виріз ближче 50 мм до краю — втрата гарантії', () => {
    const p = part({ points: rect(1500, 800), holes: [rect(500, 400, 20, 200)] });
    const issues = checkManufacturability(project(), [p]);
    const issue = issues.find((i) => i.code === 'cutout_too_close_to_edge');
    expect(issue?.severity).toBe('guarantee');
    expect(issue?.message).toContain(String(CUTOUT_LIMITS.minEdgeDistance));
  });

  it('між двома вирізами має бути 100 мм', () => {
    const p = part({
      points: rect(2000, 900),
      holes: [rect(400, 300, 200, 300), rect(400, 300, 660, 300)], // просвіт 60 мм
    });
    const issues = checkManufacturability(project(), [p]);
    expect(codes(issues)).toContain('cutouts_too_close');
    expect(issues.find((i) => i.code === 'cutouts_too_close')?.message).toContain('60');
  });

  it('рівно 100 мм між вирізами — межа, проходить', () => {
    const p = part({
      points: rect(2000, 900),
      holes: [rect(400, 300, 200, 300), rect(400, 300, 700, 300)],
    });
    expect(codes(checkManufacturability(project(), [p]))).toEqual([]);
  });
});

// ── Кути ─────────────────────────────────────────────────────────────

describe('кути', () => {
  const productWith = (corners: Record<string, unknown>) => project({
    products: [{
      id: 'prod_1',
      elements: [{
        id: 'el_1', additions: [], joints: [],
        baseDefinition: { label: 'Стільниця', corners },
      }],
    }],
  });

  it('зовнішній радіус менший за 60 мм — попередження', () => {
    const issues = checkManufacturability(productWith({ A: { type: 'radius', radius: 30 } }), []);
    const issue = issues.find((i) => i.code === 'outer_radius_too_small');
    expect(issue?.severity).toBe('guarantee');
    expect(issue?.message).toContain(String(RADIUS_LIMITS.outerMin));
  });

  it('радіус 60 мм проходить', () => {
    expect(codes(checkManufacturability(productWith({ A: { type: 'radius', radius: 60 } }), []))).toEqual([]);
  });

  it('внутрішній радіус із крайкою менший за 15 мм — зробити не можна', () => {
    const issues = checkManufacturability(
      productWith({ E: { type: 'radius', radius: 10, reflex: true, edgeProcessing: 'Стандарт' } }),
      [],
    );
    const issue = issues.find((i) => i.code === 'inner_radius_with_edge');
    expect(issue?.severity).toBe('error');
  });

  it('внутрішній радіус без крайки менший за 15 мм — можна', () => {
    const issues = checkManufacturability(
      productWith({ E: { type: 'radius', radius: 10, reflex: true } }),
      [],
    );
    expect(codes(issues)).toEqual([]);
  });

  it('зріз кута радіусом не перевіряється', () => {
    expect(codes(checkManufacturability(productWith({ A: { type: 'chamfer', sizeB: 20 } }), []))).toEqual([]);
  });
});

// ── Радіус у куті вирізу ─────────────────────────────────────────────

describe('радіус у куті вирізу залежить від матеріалу', () => {
  const withCutout = (material: string, cornerRadius: number) => project({
    projectMaterial: material,
    products: [{
      id: 'prod_1',
      elements: [{
        id: 'el_1', additions: [], joints: [],
        baseDefinition: { cutouts: { sink: { id: 'sink', shape: 'rect', type: 'custom', cornerRadius } } },
      }],
    }],
  });

  it('керамограніт вимагає R5', () => {
    expect(codes(checkManufacturability(withCutout('Керамограніт', 4), []))).toContain('cutout_corner_radius');
    expect(codes(checkManufacturability(withCutout('Керамограніт', 5), []))).toEqual([]);
  });

  it('кварцит терпить R3', () => {
    expect(codes(checkManufacturability(withCutout('Кварцит', 4), []))).toEqual([]);
    expect(codes(checkManufacturability(withCutout('Кварцит', 2), []))).toContain('cutout_corner_radius');
  });
});

// ── Зведення ─────────────────────────────────────────────────────────

describe('summarizeIssues', () => {
  it('рахує помилки й гарантійні окремо', () => {
    const p = part({ points: rect(380, 250), holes: [circle(8, 100, 5)] });
    const details = [{ id: 'det_1', edgeProfiles: { A: 'r2_top' } }] as never;
    const summary = summarizeIssues(checkManufacturability(project(), [p], { details }));
    expect(summary.errors).toBeGreaterThan(0);
    expect(summary.guarantee).toBeGreaterThan(0);
    expect(summary.total).toBe(summary.errors + summary.guarantee);
  });

  it('порожній проєкт — жодної претензії', () => {
    expect(checkManufacturability(project(), [])).toEqual([]);
  });
});
