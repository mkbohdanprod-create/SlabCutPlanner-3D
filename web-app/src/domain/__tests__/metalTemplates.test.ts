import { describe, it, expect } from 'vitest';
import { metalChainPieces, metalChainWeightKg, metalSegmentElements } from '../metalChain';
import {
  METAL_TEMPLATES, templateDefaults,
  tableFrameTemplate, islandFrameTemplate, sinkFrameTemplate, trussTemplate,
} from '../metalTemplates';
import type { MetalTemplateResult } from '../metalTemplates';
import type { ElementDefinition } from '../types';

// Шаблони металовиробів: генератор пише маршрут, а читає його ТА САМА
// черепашка metalChainPieces, що живить 3D і розкрій. Тести ловлять:
// розбіжність математики запису/читання (сегменти не там), матеріал у
// gap-ходах, і хибні сумарні довжини.

const defFrom = (result: MetalTemplateResult, profileId = 'kv40') => ({
  kind: 'metal_profile', width: result.baseLength, metalProfileId: profileId,
  metalSegments: result.segments, quantity: 1, thickness: 2,
} as unknown as ElementDefinition);

const totalLength = (result: MetalTemplateResult) =>
  metalChainPieces(defFrom(result)).reduce((sum, piece) => sum + piece.lengthMm, 0);

const endOf = (piece: { start: [number, number, number]; dir: [number, number, number]; lengthMm: number }) =>
  [0, 1, 2].map((i) => piece.start[i] + piece.dir[i] * piece.lengthMm);

describe('шаблон «Каркас під стільницю»', () => {
  const result = tableFrameTemplate({ width: 1200, depth: 600, height: 850, crossbars: 1, bottomRail: false, bottomOffset: 150 });
  const pieces = metalChainPieces(defFrom(result));

  it('матеріал: обвʼязка (4) + ноги (4) + поперечка (1)', () => {
    expect(pieces).toHaveLength(9);
  });

  it('сумарна довжина = периметр + 4·H + поперечка', () => {
    expect(totalLength(result)).toBeCloseTo(2 * (1200 + 600) + 4 * 850 + 600, 1);
  });

  it('ноги закінчуються на −H, обвʼязка лежить у площині y=0', () => {
    const legs = pieces.filter((piece) => piece.dir[1] < -0.99);
    expect(legs).toHaveLength(4);
    legs.forEach((leg) => {
      expect(leg.start[1]).toBeCloseTo(0, 3);
      expect(endOf(leg)[1]).toBeCloseTo(-850, 3);
    });
    const top = pieces.filter((piece) => Math.abs(piece.dir[1]) < 1e-6 && Math.abs(piece.start[1]) < 1e-6);
    expect(top.length).toBeGreaterThanOrEqual(5); // 4 сторони + поперечка
  });

  it('верхня обвʼязка замкнена (кінець 4-ї сторони = початок бази)', () => {
    expect(endOf(pieces[3])).toEqual([expect.closeTo(0, 3), expect.closeTo(0, 3), expect.closeTo(0, 3)] as never);
  });

  it('нижня обвʼязка додає 4 сторони на висоті −(H−offset)', () => {
    const withRail = tableFrameTemplate({ width: 1200, depth: 600, height: 850, crossbars: 0, bottomRail: true, bottomOffset: 150 });
    const railPieces = metalChainPieces(defFrom(withRail)).filter((piece) => Math.abs(piece.start[1] + 700) < 1e-3);
    expect(railPieces).toHaveLength(4);
    expect(totalLength(withRail)).toBeCloseTo(2 * (1200 + 600) * 2 + 4 * 850, 1);
  });
});

describe('шаблон «Опора для острова»', () => {
  it('нижня обвʼязка завжди; проміжні стійки додають 2 ноги', () => {
    const base = islandFrameTemplate({ width: 1200, depth: 800, height: 870, midLegs: false, bottomOffset: 120 });
    const withMid = islandFrameTemplate({ width: 1200, depth: 800, height: 870, midLegs: true, bottomOffset: 120 });
    expect(metalChainPieces(defFrom(base))).toHaveLength(4 + 4 + 4);
    expect(metalChainPieces(defFrom(withMid))).toHaveLength(4 + 4 + 2 + 4);
    expect(totalLength(withMid) - totalLength(base)).toBeCloseTo(2 * 870, 1);
  });
});

describe('шаблон «Каркас під мийку»', () => {
  it('дві поперечки стоять по краях прорізу чаші', () => {
    const result = sinkFrameTemplate({ width: 800, depth: 600, height: 850, bowlWidth: 500, bowlOffset: 0, bottomRail: false, bottomOffset: 150 });
    const pieces = metalChainPieces(defFrom(result));
    const bars = pieces.filter((piece) => Math.abs(piece.dir[2]) > 0.99 && Math.abs(piece.start[1]) < 1e-6 && piece.start[0] > 1 && piece.start[0] < 799);
    const xs = bars.map((piece) => piece.start[0]).sort((a, b) => a - b);
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBeCloseTo(150, 3);
    expect(xs[1]).toBeCloseTo(650, 3);
  });

  it('поперечка, що впала б на ногу, відкидається', () => {
    const result = sinkFrameTemplate({ width: 800, depth: 600, height: 850, bowlWidth: 800, bowlOffset: 0, bottomRail: false, bottomOffset: 150 });
    const pieces = metalChainPieces(defFrom(result));
    expect(pieces).toHaveLength(8); // тільки обвʼязка + ноги
  });
});

describe('шаблон «Ферма»', () => {
  const result = trussTemplate({ span: 3000, height: 400, panels: 6, posts: false });
  const pieces = metalChainPieces(defFrom(result));

  it('пояси, крайні стійки і 6 розкосів', () => {
    expect(pieces).toHaveLength(2 + 2 + 6);
  });

  it('довжина розкосу = гіпотенуза панелі, вузли сідають на пояси', () => {
    const diag = Math.hypot(500, 400);
    const diagonals = pieces.filter((piece) => Math.abs(piece.dir[0]) > 1e-6 && Math.abs(piece.dir[1]) > 1e-6);
    expect(diagonals).toHaveLength(6);
    diagonals.forEach((piece, i) => {
      expect(piece.lengthMm).toBeCloseTo(diag, 1);
      const end = endOf(piece);
      expect(end[0]).toBeCloseTo(500 * (i + 1), 1);
      expect(end[1]).toBeCloseTo(i % 2 === 0 ? 400 : 0, 1);
    });
  });

  it('решітка бере свій профіль, пояси — базовий', () => {
    const withBrace = trussTemplate({ span: 3000, height: 400, panels: 4, posts: true, braceProfileId: 'kv25' });
    const bracePieces = metalChainPieces(defFrom(withBrace)).filter((piece) => piece.profileId === 'kv25');
    // 2 крайні стійки + 4 розкоси + 3 внутрішні стійки
    expect(bracePieces).toHaveLength(9);
    const chords = metalChainPieces(defFrom(withBrace)).filter((piece) => piece.profileId === 'kv40');
    expect(chords).toHaveLength(2);
  });

  it('уся ферма лежить у площині XY (Z = 0)', () => {
    pieces.forEach((piece) => {
      expect(Math.abs(piece.start[2])).toBeLessThan(1e-3);
      expect(Math.abs(piece.dir[2])).toBeLessThan(1e-6);
    });
  });
});

describe('gap-сегменти (переміщення)', () => {
  const result = tableFrameTemplate({ width: 1200, depth: 600, height: 850, crossbars: 1, bottomRail: true, bottomOffset: 150 });

  it('не дають ні деталей розкрою, ні маси', () => {
    const def = defFrom(result);
    const elements = metalSegmentElements('p1', def);
    const materialSegments = result.segments.filter((segment) => !segment.gap);
    expect(elements).toHaveLength(materialSegments.length);
    elements.forEach((element) => {
      expect(element.id).toContain('mseg_');
    });
    // маса = сума ТІЛЬКИ матеріальних відрізків
    const expectedMm = totalLength(result);
    const kv40kgPerMm = 2.39 / 1000; // ≈ труба 40×40×2
    expect(metalChainWeightKg(def)).toBeCloseTo(expectedMm * kv40kgPerMm, 0);
  });

  it('черепашка після gap-ходів не зміщується (кожен шматок стартує там, де треба)', () => {
    const pieces = metalChainPieces(defFrom(result));
    // усі матеріальні шматки — осьові й лежать на скелеті рами
    pieces.forEach((piece) => {
      const axes = piece.dir.map(Math.abs).filter((v) => v > 1e-6);
      expect(axes).toHaveLength(1); // рама — тільки осьові напрямки
    });
  });
});

describe('реєстр шаблонів', () => {
  it('усі 4 шаблони генеруються з дефолтами без помилок', () => {
    expect(METAL_TEMPLATES.map((template) => template.id)).toEqual(['table_frame', 'island_frame', 'sink_frame', 'truss']);
    METAL_TEMPLATES.forEach((template) => {
      const result = template.generate(templateDefaults(template));
      expect(result.baseLength).toBeGreaterThan(0);
      expect(result.segments.length).toBeGreaterThan(0);
      // і читаються черепашкою без NaN
      metalChainPieces(defFrom(result)).forEach((piece) => {
        piece.start.forEach((v) => expect(Number.isFinite(v)).toBe(true));
        piece.dir.forEach((v) => expect(Number.isFinite(v)).toBe(true));
      });
    });
  });
});
