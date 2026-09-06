import { describe, it, expect } from 'vitest';
import { clipByConvex, generateLayout, boqForLayout, computeArchitecture, balancedStart } from '../tileLayout';
import { DEFAULT_ARCH_NORMS, emptyArchitecture, polygonArea, wallFromEdge, type Surface, type TileLayout } from '../../domain/architecture';

const rect = (w: number, h: number, x = 0, y = 0) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

function floor(points = rect(6000, 4000), openings: ReturnType<typeof rect>[] = []): Surface {
  return { id: 'f1', name: 'Хол', kind: 'floor', points, openings };
}

function layout(over: Partial<TileLayout> = {}): TileLayout {
  return {
    id: 'l1', name: 'Т', surfaceId: 'f1', pattern: 'straight', tileW: 1200, tileH: 600, jointMm: 0, offsetFraction: 0.5,
    angleDeg: 0, origin: 'corner', originShift: { x: 0, y: 0 }, borderMm: 300, innerPattern: 'herringbone',
    material: { name: 'К12', thicknessMm: 12, kgPerM2: 30, sheetW: 3200, sheetH: 1600 },
    ...over,
  };
}

const sumArea = (r: ReturnType<typeof generateLayout>) => r.pieces.filter((p) => !p.border).reduce((s, p) => s + p.areaMm2, 0);

describe('clipByConvex', () => {
  it('прямокутник у прямокутнику — перетин', () => {
    const c = clipByConvex(rect(1000, 1000), rect(500, 500, 800, 800));
    expect(polygonArea(c)).toBeCloseTo(200 * 200, 3);
  });
  it('увігнутий контур (Г) ріжеться опуклим вікном правильно', () => {
    const L = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 4000 }, { x: 0, y: 4000 }];
    const win = rect(3000, 3000, 1000, 1000); // накриває виріз
    const c = clipByConvex(L, win);
    // площа Г ∩ вікно = 3000×3000 − (виріз 2000..4000 × 2000..4000 ∩ вікно = 2000×2000)
    expect(polygonArea(c)).toBeCloseTo(9e6 - 4e6, 0);
  });
  it('повернуте вікно', () => {
    const win = rect(1000, 1000, 500, 500).map((p) => {
      const cx = 1000; const cy = 1000; const a = Math.PI / 4; const dx = p.x - cx; const dy = p.y - cy;
      return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
    });
    const c = clipByConvex(rect(2000, 2000), win);
    expect(polygonArea(c)).toBeCloseTo(1e6, 0);
  });
});

describe('generateLayout — покриття', () => {
  it('пряма сітка без шва покриває підлогу цілком; цілі + підрізані = площа', () => {
    const r = generateLayout(floor(), layout());
    expect(sumArea(r)).toBeCloseTo(24e6, 0);
    expect(r.stats.fullCount).toBe(5 * 6 + 0); // 6000/1200=5 × 4000/600=6.67 → 5×6 цілих
    expect(r.stats.cutCount).toBe(5); // останній ряд по 400 мм
    expect(r.stats.areaM2).toBeCloseTo(24, 6);
  });
  it('розбіжка ½ без шва — покриття повне, ряди зміщені', () => {
    const r = generateLayout(floor(), layout({ pattern: 'brick' }));
    expect(sumArea(r)).toBeCloseTo(24e6, 0);
    expect(r.stats.cutCount).toBeGreaterThan(5); // зміщені ряди дають підрізи по бічних стінах
  });
  it('діагональ 45° без шва — покриття повне, цілих менше', () => {
    const r = generateLayout(floor(), layout({ pattern: 'diagonal' }));
    expect(sumArea(r)).toBeCloseTo(24e6, -2);
    const straight = generateLayout(floor(), layout());
    expect(r.stats.fullCount).toBeLessThan(straight.stats.fullCount);
  });
  it('ялинка без шва замощує площину без дір і накладань', () => {
    const r = generateLayout(floor(), layout({ pattern: 'herringbone', tileW: 1200, tileH: 300, angleDeg: 0 }));
    expect(sumArea(r)).toBeCloseTo(24e6, -1);
    const r45 = generateLayout(floor(), layout({ pattern: 'herringbone', tileW: 1200, tileH: 300, angleDeg: 45 }));
    expect(sumArea(r45)).toBeCloseTo(24e6, -2);
    // жодна пара цілих плиток не перекривається
    const full = r.pieces.filter((p) => p.full).slice(0, 80);
    for (let i = 0; i < full.length; i += 1) {
      for (let j = i + 1; j < full.length; j += 1) {
        const inter = clipByConvex(full[i].points, full[j].points);
        expect(inter.length ? polygonArea(inter) : 0).toBeLessThan(1);
      }
    }
  });
  it('ялинка зі швом 2 мм: площа плиток = площа × частка плитки в парі зі швами', () => {
    const r = generateLayout(floor(), layout({ pattern: 'herringbone', tileW: 1200, tileH: 300, jointMm: 2 }));
    const share = (2 * 1200 * 300) / (2 * 1202 * 302);
    expect(sumArea(r) / 24e6).toBeCloseTo(share, 2);
  });
  it('шов зменшує площу плиток на частку шва', () => {
    const r = generateLayout(floor(), layout({ jointMm: 10 }));
    const share = (1200 * 600) / (1210 * 610);
    expect(sumArea(r) / 24e6).toBeCloseTo(share, 2);
  });
  it('отвір (колона) віднімається і робить плитку підрізаною', () => {
    const f = floor(rect(6000, 4000), [rect(400, 400, 1500, 900)]);
    const r = generateLayout(f, layout());
    expect(r.stats.areaM2).toBeCloseTo(24 - 0.16, 6);
    expect(sumArea(r)).toBeCloseTo(24e6 - 160000, 0);
    const plain = generateLayout(floor(), layout());
    expect(r.stats.fullCount).toBeLessThan(plain.stats.fullCount);
  });
  it('старт із центру зсуває сітку: симетричні підрізи з обох боків', () => {
    const r = generateLayout(floor(), layout({ origin: 'center', tileW: 1000, tileH: 1000 }));
    // 6000 = 6 × 1000 від центру → 0 підрізів по X; 4000 = 4 × 1000 → 0 по Y
    expect(r.stats.cutCount).toBe(0);
    expect(r.stats.fullCount).toBe(24);
  });
  it('периметр + центр: бордюр і центр разом дають площу підлоги', () => {
    const r = generateLayout(floor(), layout({ pattern: 'perimeter_center', borderMm: 500, innerPattern: 'straight' }));
    const border = r.pieces.find((p) => p.border)!;
    expect(border.areaMm2).toBeCloseTo(24e6 - 5000 * 3000, 0);
    expect(sumArea(r)).toBeCloseTo(5000 * 3000, 0);
  });
});

describe('правила старту РЗ-1 / РЗ-4 (auto)', () => {
  const N = DEFAULT_ARCH_NORMS;
  it('balancedStart: ідеальне вкладання — без підрізів', () => {
    expect(balancedStart(0, 6000, 1000, 1000, N)).toBe(0);
  });
  it('balancedStart: залишок великий — підрізи r/2 з обох боків (варіант А)', () => {
    // 6800 = 400 + 6×1000 + 400 → перша плитка на −600 (видно 400)
    expect(balancedStart(0, 6800, 1000, 1000, N)).toBe(-600);
  });
  it('balancedStart: залишок малий — зсув на пів кроку (варіант Б), підрізи ≥ пів плитки', () => {
    // 6500: r/2 = 250 < ⅓·1000 → 750 + 5×1000 + 750 → перша плитка на −250 (видно 750)
    expect(balancedStart(0, 6500, 1000, 1000, N)).toBe(-250);
  });
  it('auto на підлозі 6500×4000, плитка 1000×1000: 5×4 цілих, 8 підрізів по 750', () => {
    const r = generateLayout(floor(rect(6500, 4000)), layout({ origin: 'auto', tileW: 1000, tileH: 1000 }));
    expect(r.stats.fullCount).toBe(20);
    expect(r.stats.cutCount).toBe(8);
    const cuts = r.pieces.filter((p) => !p.full).map((p) => p.areaMm2);
    cuts.forEach((a) => expect(a).toBeCloseTo(750 * 1000, 0));
  });
  it('auto на 6800×4000: підрізи по 400 з обох боків, 6×4 цілих', () => {
    const r = generateLayout(floor(rect(6800, 4000)), layout({ origin: 'auto', tileW: 1000, tileH: 1000 }));
    expect(r.stats.fullCount).toBe(24);
    r.pieces.filter((p) => !p.full).forEach((p) => expect(p.areaMm2).toBeCloseTo(400 * 1000, 0));
  });
  it('auto для діагоналі — центр габариту (симетрія по діагоналях), покриття повне', () => {
    const r = generateLayout(floor(), layout({ origin: 'auto', pattern: 'diagonal', tileW: 600, tileH: 600 }));
    expect(sumArea(r)).toBeCloseTo(24e6, -2);
  });
  it('старі норми без полів РЗ-4 — доливаються дефолти', () => {
    const old = { ...DEFAULT_ARCH_NORMS } as Record<string, unknown>;
    delete old.minCutFraction; delete old.minCutMm;
    const r = generateLayout(floor(rect(6500, 4000)), layout({ origin: 'auto', tileW: 1000, tileH: 1000 }), old as never);
    expect(r.stats.cutCount).toBe(8);
  });
});

describe('generateLayout — числа відомості', () => {
  it('шви: сітка 1200×600 на 6000×4000 без шва', () => {
    const r = generateLayout(floor(), layout());
    // вертикальні внутрішні лінії: 4 × 4000; горизонтальні: 6 × 6000 (600·6=3600 → лінії на 600..3600)
    expect(r.stats.seamLengthM).toBeCloseTo((4 * 4000 + 6 * 6000) / 1000, 1);
    expect(r.stats.cutLengthM).toBeCloseTo(20, 6);
  });
  it('запас і листи: 3200×1600 дає 5 плиток 1200×600 (kerf 3, краща з двох орієнтацій)', () => {
    const r = generateLayout(floor(), layout());
    expect(r.stats.wastePct).toBe(DEFAULT_ARCH_NORMS.wastePctByPattern.straight + DEFAULT_ARCH_NORMS.largeFormatExtraPct);
    const along = Math.floor(3203 / 1203) * Math.floor(1603 / 603); // 2 × 2 = 4
    const across = Math.floor(3203 / 603) * Math.floor(1603 / 1203); // 5 × 1 = 5
    expect(r.stats.tilesPerSheet).toBe(Math.max(along, across));
    expect(r.stats.sheetsNeeded).toBe(Math.ceil(r.stats.tilesNeeded / r.stats.tilesPerSheet));
    expect(r.stats.weightKg).toBeCloseTo(r.stats.materialAreaM2 * 30, 6);
  });
  it('панель = лист: листів рівно стільки, скільки панелей', () => {
    const wall = wallFromEdge(floor(), 0, 3000, 'Стіна A');
    const r = generateLayout(wall, layout({ surfaceId: wall.id, tileW: 1600, tileH: 3200, wastePctOverride: 0 }));
    expect(r.stats.tilesPerSheet).toBe(0);
    expect(r.stats.sheetsNeeded).toBe(r.stats.tilesNeeded);
    expect(r.stats.tilesNeeded).toBe(4); // 6000/1600 = 3,75 → 3 цілі + підріз = 4
  });
  it('BOQ і зведення по моделі', () => {
    const model = emptyArchitecture();
    const f = floor();
    model.surfaces.push(f);
    model.layouts.push(layout());
    const { results, totals } = computeArchitecture(model);
    expect(results).toHaveLength(1);
    const boq = boqForLayout(f, model.layouts[0], results[0].result.stats);
    expect(boq.find((l) => l.code === 'AR-M1')!.qty).toBeCloseTo(24, 6);
    expect(boq.some((l) => l.provisional)).toBe(true);
    expect(totals.areaM2).toBeCloseTo(24, 6);
    expect(totals.trucks).toBeGreaterThan(0);
  });
});
