/**
 * ХВИЛЯ 3 · крок 3.4 — дзеркалення в розкрої.
 *
 * Пакер умів чотири повороти. Для несиметричних форм (Г, П, довільний
 * контур) дзеркальний варіант часто лягає щільніше — але дзеркало розвертає
 * малюнок каменю, тому воно НІКОЛИ не вмикається саме.
 *
 * Дві умови, обидві обов'язкові: проєкт дозволив (рішення про декор) і
 * деталь не бере участі в підборі текстури.
 *
 * Позначки обробки при цьому не потребували жодної правки — крок 3.3
 * зробив їх залежними від індексів вершин, а дзеркалення нумерацію не
 * міняє. Це тут теж перевірено.
 */
import { describe, expect, it } from 'vitest';
import { mirroredLocalPoints, placementPolygon, polygonBounds } from '../../lib/project';
import { logicalSegmentForSide } from '../../utils/edgeProfiles';
import type { DetailPart, Placement, Project } from '../../domain/types';
import { autoPack, detectConflicts } from '../packing';
import { mockParts, mockProject } from './mockData';

/** Несиметрична Г-подібна деталь — саме на таких дзеркало щось дає. */
const lShape: DetailPart = {
  id: 'p1', detailId: 'd1', name: 'Г', type: 'Стільниця', shape: 'Г-подібна',
  width: 1000, height: 600, rotation: 0, area: 0.5, isMain: true,
  parentLabel: 'Виріб', dimsLabel: '1000×600',
  points: [
    { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 200 },
    { x: 400, y: 200 }, { x: 400, y: 600 }, { x: 0, y: 600 },
  ],
} as unknown as DetailPart;

const placement = (mirror: boolean): Placement => ({
  id: 'pl', slabId: 's1', partId: 'p1', x: 0, y: 0, rotation: 0,
  manualLocked: false, ...(mirror ? { mirror: true } : {}),
});

describe('геометрія дзеркальної деталі', () => {
  it('габарит не змінюється — дзеркало це не поворот', () => {
    const direct = polygonBounds(placementPolygon(lShape, placement(false)));
    const flipped = polygonBounds(placementPolygon(lShape, placement(true)));
    expect(flipped.maxX - flipped.minX).toBeCloseTo(direct.maxX - direct.minX, 6);
    expect(flipped.maxY - flipped.minY).toBeCloseTo(direct.maxY - direct.minY, 6);
  });

  it('форма справді інша — виступ переїхав на другий бік', () => {
    const direct = placementPolygon(lShape, placement(false));
    const flipped = placementPolygon(lShape, placement(true));
    expect(flipped).not.toEqual(direct);
    // Вузька частина була праворуч, стала ліворуч.
    expect(direct.some((p) => p.x === 400 && p.y === 600)).toBe(true);
    expect(flipped.some((p) => p.x === 600 && p.y === 600)).toBe(true);
  });

  it('подвійне дзеркалення повертає контур на місце', () => {
    const once = mirroredLocalPoints(lShape.points, lShape.width);
    const twice = mirroredLocalPoints(once, lShape.width);
    expect(twice).toEqual(lShape.points);
  });

  it('площа зберігається', () => {
    const area = (pts: Array<{ x: number; y: number }>) => Math.abs(pts.reduce(
      (sum, p, i) => sum + (p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y), 0,
    ) / 2);
    expect(area(placementPolygon(lShape, placement(true))))
      .toBeCloseTo(area(placementPolygon(lShape, placement(false))), 6);
  });
});

describe('позначки обробки переживають дзеркало без окремої математики', () => {
  type Seg = { start: { x: number; y: number }; end: { x: number; y: number } };
  const len = (s: Seg) => Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y);

  it('усі сторони зберігають свої довжини', () => {
    for (const side of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const straight = logicalSegmentForSide(lShape, side, 0);
      const flipped = logicalSegmentForSide(lShape, side, 0, true);
      if (!straight || !flipped) continue;
      expect(len(flipped), `сторона ${side}`).toBeCloseTo(len(straight), 6);
    }
  });

  /**
   * Головна умова кроку 3.4 з плану: «маркер на дзеркальному контурі має
   * лишитись на своєму ФІЗИЧНОМУ ребрі». Перевіряємо буквально: сегмент
   * сторони на дзеркальній деталі мусить збігатися з дзеркальним відбитком
   * сегмента на прямій. Якщо позначка десь відв'яжеться від вершин
   * контуру — цей тест впаде, і в цех не поїде фрезерування не того торця.
   */
  it('сегмент сторони — це дзеркальне відображення прямого, а не інше ребро', () => {
    for (const rotation of [0, 90, 180, 270]) {
      for (const side of ['A', 'B', 'C', 'D', 'E', 'F']) {
        const straight = logicalSegmentForSide(lShape, side, rotation);
        const flipped = logicalSegmentForSide(lShape, side, rotation, true);
        if (!straight || !flipped) continue;

        // Дзеркалимо контур вручну і рахуємо ту саму сторону на ньому:
        // це незалежний спосіб отримати очікуваний результат.
        const manual = logicalSegmentForSide(
          { ...lShape, points: mirroredLocalPoints(lShape.points, lShape.width) } as DetailPart,
          side,
          rotation,
        )!;
        expect(flipped.start.x, `${side} @ ${rotation}°`).toBeCloseTo(manual.start.x, 6);
        expect(flipped.start.y, `${side} @ ${rotation}°`).toBeCloseTo(manual.start.y, 6);
        expect(flipped.end.x, `${side} @ ${rotation}°`).toBeCloseTo(manual.end.x, 6);
        expect(flipped.end.y, `${side} @ ${rotation}°`).toBeCloseTo(manual.end.y, 6);
      }
    }
  });

  it('позначка лежить на контурі дзеркальної деталі, а не поруч із ним', () => {
    const polygon = placementPolygon(lShape, placement(true));
    const onContour = (p: { x: number; y: number }) => polygon.some(
      (v) => Math.hypot(v.x - p.x, v.y - p.y) < 0.001,
    );
    for (const side of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const seg = logicalSegmentForSide(lShape, side, 0, true);
      if (!seg) continue;
      expect(onContour(seg.start), `початок ${side}`).toBe(true);
      expect(onContour(seg.end), `кінець ${side}`).toBe(true);
    }
  });
});

/**
 * Рівень пакера: дзеркало не має псувати розкладку і не має вмикатися саме.
 * Тести ганяють реальний autoPack на тому ж макеті, що й packing.test.ts.
 */
describe('autoPack і дзеркалення', () => {
  it('за замовчуванням жодна деталь не дзеркальна', () => {
    const result = autoPack(mockProject, mockParts);
    expect(result.placements.some((placement) => placement.mirror)).toBe(false);
  });

  it('увімкнене дзеркало не робить розкладку гіршою', () => {
    const direct = autoPack(mockProject, mockParts);
    const mirrored = autoPack({ ...mockProject, allowMirroring: true }, mockParts);

    // Не з'явилось нових нерозміщених деталей.
    expect(mirrored.unplacedPartIds.length).toBeLessThanOrEqual(direct.unplacedPartIds.length);
    // Розкладка лишається валідною: без накладань і виходів за слеб.
    const conflicts = detectConflicts(
      { ...mockProject, allowMirroring: true },
      mockParts,
      mirrored.placements,
    );
    expect(conflicts.filter((placement) => placement.conflict || placement.outOfBounds)).toEqual([]);
  });

  it('підбір текстури забороняє дзеркало навіть при увімкненому прапорці', () => {
    const result = autoPack(
      { ...mockProject, allowMirroring: true, textureSelectionEnabled: true },
      mockParts,
    );
    expect(result.placements.some((placement) => placement.mirror)).toBe(false);
  });

  it('деталь із групою текстури не дзеркалиться ніколи', () => {
    const grouped = mockParts.map((part) => ({ ...part, textureGroupLabel: 'Виріб 1' }));
    const result = autoPack({ ...mockProject, allowMirroring: true }, grouped);
    expect(result.placements.some((placement) => placement.mirror)).toBe(false);
  });
});

/**
 * Доказ, що функція не мертва: слеб, на якому деталь НЕ вміщається прямо
 * (дефект потрапляє в її суцільну частину), але вміщається дзеркально —
 * виріз у дзеркальної деталі якраз накриває дефект.
 */
describe('дзеркало рятує деталь, яка інакше не лягає', () => {
  const tightSlab = {
    id: 'slab-tight', width: 1030, height: 620, thickness: 20,
    material: 'Керамограніт', decor: 'White', comment: '', minMargin: 10,
    textureTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 1 },
    // Дефект лежить у суцільній частині прямої деталі й у вирізі дзеркальної.
    defects: [{ id: 'defect-1', shapeType: 'rect', x: 110, y: 360, width: 200, height: 140 }],
    serialNumber: 'SN-TIGHT',
  };
  const base = { ...mockProject, slabs: [tightSlab], details: [] } as unknown as Project;

  it('без дзеркала — не лягає', () => {
    expect(autoPack(base, [lShape]).placements).toHaveLength(0);
  });

  it('з дзеркалом — лягає, і саме дзеркально', () => {
    const result = autoPack({ ...base, allowMirroring: true }, [lShape]);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].mirror).toBe(true);
  });
});
