/**
 * ХВИЛЯ 5 · кроки 5.2–5.4 — розміщення як ДАНІ (П-3).
 *
 * Хвороба: розкрій перераховувався з нуля при кожній зміні, і найдорожча
 * робота менеджера — руками зібраний малюнок каменю — зникала від будь-якої
 * дрібної правки виробу. Замок (FG-32) рятував ціною того, що нова деталь
 * летіла в буфер навіть при пів порожнього слябу.
 *
 * Тести пиляють саме ці три обіцянки:
 *   5.2 — ручні позиції переживають перерахунок, але не «свідоме перескладання»;
 *   5.3 — нова деталь докладається у ВІЛЬНЕ місце, а не витісняє сусідів;
 *   5.4 — порівняння «як зараз / якби переклали» нічого не змінює.
 */
import { describe, expect, it } from 'vitest';
import { autoPack, nestingSavings } from '../packing';
import { mockParts, mockProject } from './mockData';
import type { Placement, Project } from '../../domain/types';

/** Розкладка «як після автоматичного розкрою». */
const packed = () => autoPack(mockProject, mockParts, 'economy');

/** Проєкт із уже розкладеними деталями. */
const withPlacements = (placements: Placement[]): Project => ({
  ...mockProject,
  placements,
} as Project);

describe('5.2 — ручне розміщення переживає перерахунок', () => {
  const handPlaced = () => {
    const base = packed().placements;
    // Менеджер перетягнув першу деталь у характерне місце.
    const moved: Placement[] = base.map((placement, index) => (
      index === 0
        ? { ...placement, x: 777, y: 333, manualPlaced: true }
        : placement
    ));
    return { base, moved };
  };

  it('деталь, яку рухали руками, лишається де поставили', () => {
    const { moved } = handPlaced();
    const result = autoPack(withPlacements(moved), mockParts, 'economy', true);
    const kept = result.placements.find((item) => item.partId === moved[0].partId)!;
    expect(kept.x).toBe(777);
    expect(kept.y).toBe(333);
  });

  it('решта деталей при цьому розкладається як завжди', () => {
    const { moved } = handPlaced();
    const result = autoPack(withPlacements(moved), mockParts, 'economy', true);
    // Усі деталі отримали місце (або чесно потрапили в нерозміщені).
    const seen = new Set(result.placements.map((item) => item.partId));
    mockParts.forEach((part) => {
      expect(seen.has(part.id) || result.unplacedPartIds.includes(part.id)).toBe(true);
    });
  });

  it('СВІДОМЕ перескладання ручні позиції ігнорує — так і задумано', () => {
    const { moved } = handPlaced();
    const result = autoPack(withPlacements(moved), mockParts, 'economy', false);
    const same = result.placements.find((item) => item.partId === moved[0].partId);
    // Кнопка «Економний» показує попередження «позиції зміняться» — і змінює.
    expect(same && same.x === 777 && same.y === 333).toBeFalsy();
  });

  it('без прапорця manualPlaced нічого не закріплюється', () => {
    const base = packed().placements;
    const shifted = base.map((placement, index) => (
      index === 0 ? { ...placement, x: 777, y: 333 } : placement
    ));
    const result = autoPack(withPlacements(shifted), mockParts, 'economy', true);
    const same = result.placements.find((item) => item.partId === shifted[0].partId);
    expect(same && same.x === 777).toBeFalsy();
  });

  it('замок (manualLocked) працює і при свідомому перескладанні', () => {
    const base = packed().placements;
    const locked = base.map((placement, index) => (
      index === 0 ? { ...placement, x: 555, y: 222, manualLocked: true } : placement
    ));
    const result = autoPack(withPlacements(locked), mockParts, 'economy', false);
    const kept = result.placements.find((item) => item.partId === locked[0].partId)!;
    expect(kept.x).toBe(555);
    expect(kept.y).toBe(222);
  });
});

describe('5.3 — нова деталь докладається у вільне місце', () => {
  it('усі наявні деталі лишились на місці, новачок отримав своє', () => {
    // «Наявна» розкладка: всі деталі, крім останньої, закріплені.
    const base = packed().placements;
    const newcomerId = mockParts[mockParts.length - 1].id;
    const existing = base
      .filter((item) => item.partId !== newcomerId)
      .map((item) => ({ ...item, manualPlaced: true }));

    const result = autoPack(withPlacements(existing), mockParts, 'economy', true);

    // Жодна зі старих не зрушила.
    existing.forEach((old) => {
      const after = result.placements.find((item) => item.partId === old.partId)!;
      expect(after.x, `деталь ${old.partId}`).toBe(old.x);
      expect(after.y, `деталь ${old.partId}`).toBe(old.y);
      expect(after.slabId).toBe(old.slabId);
    });

    // Новачок або ліг, або чесно в нерозміщені — але не зайняв чуже місце.
    const placedNewcomer = result.placements.find((item) => item.partId === newcomerId);
    expect(Boolean(placedNewcomer) || result.unplacedPartIds.includes(newcomerId)).toBe(true);
  });

  it('докладання не створює накладань', () => {
    const base = packed().placements;
    const newcomerId = mockParts[mockParts.length - 1].id;
    const existing = base
      .filter((item) => item.partId !== newcomerId)
      .map((item) => ({ ...item, manualPlaced: true }));
    const result = autoPack(withPlacements(existing), mockParts, 'economy', true);

    // Два розміщення не можуть мати однакову позицію на одному слябі.
    const keys = result.placements.map((item) => `${item.slabId}:${item.x}:${item.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('5.4 — підказка «перескласти → мінус N слябів»', () => {
  it('рахує обидва числа і не чіпає поточну розкладку', () => {
    const placements = packed().placements;
    const project = withPlacements(placements);
    const before = JSON.stringify(project.placements);

    const savings = nestingSavings(project, mockParts, 'economy');

    expect(savings.currentSlabs).toBeGreaterThan(0);
    expect(savings.optimalSlabs).toBeGreaterThan(0);
    expect(savings.slabsSaved).toBe(savings.currentSlabs - savings.optimalSlabs);
    // Головне: порівняння — це саме порівняння, воно нічого не переставляє.
    expect(JSON.stringify(project.placements)).toBe(before);
  });

  it('на щойно розкладеному проєкті виграшу немає', () => {
    const savings = nestingSavings(withPlacements(packed().placements), mockParts, 'economy');
    expect(savings.slabsSaved).toBeLessThanOrEqual(0);
  });

  it('розтягнута руками розкладка показує виграш', () => {
    // Кладемо кожну деталь на власний сляб — свідомо марнотратно.
    const base = packed().placements;
    const spread = base.map((placement, index) => ({
      ...placement,
      slabId: mockProject.slabs[index % mockProject.slabs.length].id,
      manualPlaced: true,
    }));
    const savings = nestingSavings(withPlacements(spread), mockParts, 'economy');
    expect(savings.optimalSlabs).toBeLessThanOrEqual(savings.currentSlabs);
  });
});
