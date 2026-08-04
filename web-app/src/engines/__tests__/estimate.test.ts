import { describe, it, expect } from 'vitest';
import type { DetailPart, Point, Project } from '../../domain/types';
import { computeEstimate, computeDetailEstimate, CATEGORY_LABELS } from '../estimate';
import { DEFAULT_SERVICE_CATALOG } from '../../domain/services';
import { effectiveRules } from '../../domain/serviceMapping';
import { calculateCommercialQuote } from '../pricing';
import { defaultCommercialQuoteSettings } from '../../domain/defaults';
import { extractProductionFacts, sumFacts } from '../productionFacts';

// Тестовий проєкт: прямокутна стільниця 1000×600 з керамограніту,
// торець R2 на нижній стороні, круглий отвір Ø60, один сляб 3200×1600.
// Усі очікувані числа пораховані руками.

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
  holes: [circle(500, 300, 30)],
  isMain: true,
  parentLabel: '1',
  dimsLabel: '1000×600',
  ...overrides,
} as DetailPart);

const details = [{ id: 'det_1', edgeProfiles: { B: 'r2_top' } }] as never;

const project = (overrides: Record<string, unknown> = {}): Project => ({
  id: 'proj',
  orderNumber: 'test',
  projectMaterial: 'Керамограніт',
  details,
  products: [],
  slabs: [{ id: 'slab_1', width: 3200, height: 1600, thickness: 20, material: 'Керамограніт', decor: '', comment: '', minMargin: 10 }],
  placements: [{ id: 'pl_1', slabId: 'slab_1', partId: 'part_1' }],
  commercialQuote: defaultCommercialQuoteSettings,
  ...overrides,
} as unknown as Project);

describe('computeEstimate', () => {
  const result = computeEstimate(project(), [part()], { details, catalog: DEFAULT_SERVICE_CATALOG });

  it('прямий різ береться з периметра, а не з габаритів', () => {
    // 2*(1000+600) = 3200 мм = 3.2 м × 200 ₴ = 640 ₴
    const line = result.lines.find((l) => l.serviceId === 'CUT_STRAIGHT');
    expect(line?.quantity).toBe(3.2);
    expect(line?.total).toBe(640);
  });

  it('отвір Ø60 рахується штукою', () => {
    expect(result.lines.find((l) => l.serviceId === 'CUTOUT_HOLE')?.quantity).toBe(1);
  });

  it('торець рахується по реальній стороні', () => {
    // B — нижня сторона, 1000 мм = 1 м; профіль r2_top → EDGE_ROUND 500 ₴
    const line = result.lines.find((l) => l.serviceId === 'EDGE_ROUND');
    expect(line?.quantity).toBe(1);
    expect(line?.total).toBe(500);
  });

  it('матеріал рахується за площею деталей, без коефіцієнта 1.2', () => {
    const line = result.lines.find((l) => l.serviceId === 'MATERIAL_CERAMIC');
    expect(line?.quantity).toBe(0.6);
    // 0.6 × 6000 = 3600, а не 0.72 × 6000 = 4320
    expect(line?.total).toBe(3600);
  });

  it('сума збігається із сумою рядків і сумою груп', () => {
    const fromLines = result.lines.reduce((sum, line) => sum + line.total, 0);
    const fromGroups = result.groups.reduce((sum, group) => sum + group.total, 0);
    expect(Math.round(fromLines * 100) / 100).toBe(result.total);
    expect(Math.round(fromGroups * 100) / 100).toBe(result.total);
  });

  it('усі рядки розкладені по групах без втрат', () => {
    const inGroups = result.groups.flatMap((group) => group.lines).length;
    expect(inGroups).toBe(result.lines.length);
    result.groups.forEach((group) => expect(CATEGORY_LABELS[group.category]).toBeTruthy());
  });

  it('нічого не загубилось: усі прив’язки вказують на наявні послуги', () => {
    expect(result.missingServiceIds).toEqual([]);
  });
});

describe('поведінка при поламаних налаштуваннях', () => {
  it('прив’язка на неіснуючу послугу не мовчить і не вигадує ціну', () => {
    const rules = effectiveRules({
      customRules: [{
        id: 'broken', factKind: 'saw_cut', serviceId: 'НЕМАЄ',
        multiplier: 1, enabled: true, source: 'custom',
      }],
    });
    const result = computeEstimate(project(), [part()], { details, rules });
    expect(result.missingServiceIds).toContain('НЕМАЄ');
    expect(result.lines.find((l) => l.serviceId === 'НЕМАЄ')).toBeUndefined();
  });

  it('порожній проєкт дає нуль, а не помилку', () => {
    const empty = computeEstimate(project({ placements: [], slabs: [] }), []);
    expect(empty.total).toBe(0);
    expect(empty.lines).toEqual([]);
  });
});

describe('кошторис і КП рахують з однієї геометрії', () => {
  const proj = project();
  const parts = [part()];
  const facts = extractProductionFacts(proj, parts, { details });
  const quote = calculateCommercialQuote(proj, parts, details);

  it('площа деталей однакова', () => {
    expect(quote.metrics.detailAreaM2).toBe(sumFacts(facts, 'detail_area'));
  });

  it('задіяні сляби однакові', () => {
    expect(quote.metrics.usedSlabs).toBe(sumFacts(facts, 'slabs_used'));
  });

  it('різ пилою більше не включає непрямі ділянки', () => {
    // Раніше sawCutM дорівнював повному периметру і дублював водяну різку.
    expect(quote.metrics.sawCutM).toBe(sumFacts(facts, 'saw_cut'));
  });

  it('водяна різка — це метри великих вирізів, малі отвори туди не входять', () => {
    expect(quote.metrics.waterjetCutM).toBe(
      sumFacts(facts, 'waterjet_cut') + sumFacts(facts, 'cutout_perimeter') + sumFacts(facts, 'hole_large'),
    );
  });

  it('малі отвори не зникають із КП, а йдуть окремим рядком у штуках', () => {
    expect(quote.metrics.holeCount).toBe(1);
    expect(quote.lines.find((line) => line.id === 'holes')?.quantity).toBe(1);
  });

  it('метри торця за профілями збігаються', () => {
    expect(quote.metrics.edgeLengths.r2_top).toBe(sumFacts(facts, 'edge', 'r2_top'));
  });

  it('на деталі зі зрізом пила і вода не перетинаються', () => {
    const cut: Point[] = [
      { x: 0, y: 0 }, { x: 700, y: 0 }, { x: 1000, y: 300 },
      { x: 1000, y: 600 }, { x: 0, y: 600 },
    ];
    const p = [part({ points: cut, holes: [] })];
    const q = calculateCommercialQuote(proj, p, details);
    const f = extractProductionFacts(proj, p, { details });
    const perimeterM = (700 + Math.hypot(300, 300) + 300 + 1000 + 600) / 1000;
    expect(q.metrics.sawCutM + q.metrics.waterjetCutM).toBeCloseTo(perimeterM, 3);
    expect(q.metrics.sawCutM).toBe(sumFacts(f, 'saw_cut'));
  });
});

// ── Розріз по одній деталі ───────────────────────────────────────────

describe('computeDetailEstimate', () => {
  it('віддає тільки обробки цієї деталі', () => {
    const proj = project();
    const two = [
      part(),
      part({ id: 'part_2', detailId: 'det_2', name: 'Панель', points: rect(800, 400), holes: [], area: 0.32 }),
    ];
    const detailsTwo = [
      { id: 'det_1', edgeProfiles: { B: 'r2_top' } },
      { id: 'det_2', edgeProfiles: {} },
    ] as never;

    const first = computeDetailEstimate(proj, two, 'det_1', { details: detailsTwo });
    const second = computeDetailEstimate(proj, two, 'det_2', { details: detailsTwo });

    // 2*(1000+600)=3200 мм проти 2*(800+400)=2400 мм
    expect(first.lines.find((l) => l.serviceId === 'CUT_STRAIGHT')?.quantity).toBe(3.2);
    expect(second.lines.find((l) => l.serviceId === 'CUT_STRAIGHT')?.quantity).toBe(2.4);

    // отвір і торець є лише на першій
    expect(first.lines.find((l) => l.serviceId === 'CUTOUT_HOLE')).toBeDefined();
    expect(second.lines.find((l) => l.serviceId === 'CUTOUT_HOLE')).toBeUndefined();
    expect(second.lines.find((l) => l.serviceId === 'EDGE_ROUND')).toBeUndefined();
  });

  it('знаходить деталь за коротким слотом, а не лише за повним шляхом', () => {
    const proj = project();
    const p = [part({ detailId: 'prod_1/element:skirting_A/detail:main' })];
    const d = [{ id: 'prod_1/element:skirting_A/detail:main', edgeProfiles: {} }] as never;
    const byPath = computeDetailEstimate(proj, p, 'prod_1/element:skirting_A/detail:main', { details: d });
    const bySlot = computeDetailEstimate(proj, p, 'skirting_A', { details: d });
    expect(bySlot.facts.length).toBe(byPath.facts.length);
    expect(bySlot.total).toBe(byPath.total);
    expect(bySlot.facts.length).toBeGreaterThan(0);
  });

  it('кути й стики приходять через елемент, а не через деталь — і все одно знаходяться', () => {
    const proj = project({
      products: [{
        id: 'prod_1',
        elements: [{
          id: 'prod_1/element:main',
          additions: [],
          joints: [],
          baseDefinition: { corners: { A: { type: 'radius', radius: 60 } } },
        }],
      }],
    });
    const result = computeDetailEstimate(proj, [], 'main', { details: [] });
    expect(result.facts.some((f) => f.kind === 'corner')).toBe(true);
    expect(result.lines.find((l) => l.serviceId === 'CORNER_RADIUS')?.quantity).toBe(1);
  });

  it('проєктні факти без прив’язки до деталі в розріз не потрапляють', () => {
    const result = computeDetailEstimate(project(), [part()], 'det_1', { details });
    // площа й сляби — це рівень проєкту, у паспорті деталі їм не місце
    expect(result.facts.some((f) => f.kind === 'slabs_used')).toBe(false);
    expect(result.lines.find((l) => l.serviceId === 'MATERIAL_CERAMIC')).toBeUndefined();
  });
});
