// Шаблон «Консоль під поличку» (03.09.2026, кейс 81-2009298, аркуш 2).
// Перевіряємо геометрію числом: кожен кронштейн — замкнутий трикутник
// плече / розкос / стійка, і жоден поворот черепашки не «недосяжний».
import { describe, it, expect } from 'vitest';
import { wallConsoleTemplate, METAL_TEMPLATES, templateDefaults } from '../metalTemplates';
import { metalChainPieces, metalChainWeightKg } from '../metalChain';

const endOf = (p: { start: number[]; dir: number[]; lengthMm: number }) =>
  p.start.map((v, k) => Math.round(v + p.dir[k] * p.lengthMm));

describe('консоль під поличку', () => {
  it('рівномірно: 3 кронштейни на рейці 2000, відступ 20', () => {
    const tpl = wallConsoleTemplate({ rail: 2000, arm: 470, drop: 120, braceInset: 70, brackets: 3, edgeInset: 20 });
    const pieces = metalChainPieces({ width: tpl.baseLength, metalProfileId: 'pr40x20', metalSegments: tpl.segments } as never);
    expect(pieces.length).toBe(1 + 3 * 3);
    const ends = pieces.map(endOf);
    for (const x of [20, 1000, 1980]) {
      expect(ends).toContainEqual([x, 0, 470]);
      expect(ends).toContainEqual([x, -120, 0]);
      expect(ends).toContainEqual([x, 0, 0]);
    }
  });

  it('явні позиції під тумби (кейс 81-2009298)', () => {
    const at = [20, 517, 1035, 1716, 2165];
    const tpl = wallConsoleTemplate({ rail: 2185, arm: 470, drop: 120, braceInset: 70, brackets: 5, edgeInset: 20, positions: at });
    const def = { width: tpl.baseLength, metalProfileId: 'pr40x20', metalSegments: tpl.segments } as never;
    const pieces = metalChainPieces(def);
    expect(pieces.length).toBe(16);
    const braces = pieces.filter((p) => Math.round(p.lengthMm) === 418);
    expect(braces.length).toBe(5);             // √(400² + 120²) = 417.6
    expect(metalChainWeightKg(def)).toBeCloseTo(12.7, 0);
    const ends = pieces.map(endOf);
    for (const x of at) expect(ends).toContainEqual([x, 0, 470]);
  });

  it('один кронштейн — посередині', () => {
    const tpl = wallConsoleTemplate({ rail: 1000, arm: 300, drop: 100, braceInset: 50, brackets: 1, edgeInset: 20 });
    const ends = metalChainPieces({ width: tpl.baseLength, metalProfileId: 'kv40', metalSegments: tpl.segments } as never).map(endOf);
    expect(ends).toContainEqual([500, 0, 300]);
  });

  it('зареєстрований у реєстрі і будується з дефолтів', () => {
    const t = METAL_TEMPLATES.find((x) => x.id === 'wall_console')!;
    expect(t).toBeDefined();
    const res = t.generate(templateDefaults(t));
    expect(res.baseLength).toBe(2000);
    expect(res.segments.filter((s) => !s.gap).length).toBe(5 * 3);
  });
});
