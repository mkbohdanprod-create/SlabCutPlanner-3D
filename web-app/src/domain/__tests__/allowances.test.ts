import { describe, it, expect } from 'vitest';
import {
  KERF_MM,
  EDGE_ALLOWANCE_MM,
  JOINT_ALLOWANCE_MM,
  SINK_CUTOUT_ALLOWANCE_MM,
  STONE_TOOL_OUT_MM,
  SHORT_EDGE_MAX_MM,
  COMPACT_ALLOWANCE_MM,
  ACRYLIC_ALLOWANCE_MM,
  isSoftMaterial,
  isShortEdge,
  edgeToolOutMm,
  edgeAllowanceMm,
  sinkCutoutAllowanceMm,
} from '../allowances';

// Ці тести навмисно перевіряють конкретні числа, а не «логіку».
// Константи підтверджені замовником 31.07.2026; якщо хтось змінить їх
// не спитавши, тест має впасти й показати, що саме поїхало.

describe('фізичні константи', () => {
  it('пропил інструменту', () => {
    expect(KERF_MM.saw).toBe(4.0);
    expect(KERF_MM.waterjet).toBe(1.5);
  });

  it('припуски на торець', () => {
    expect(EDGE_ALLOWANCE_MM.default).toBe(2.5);
    expect(EDGE_ALLOWANCE_MM.d12).toBe(4.5);
    expect(JOINT_ALLOWANCE_MM).toBe(1.5);
  });

  it('припуск під мийку залежить від матеріалу', () => {
    expect(SINK_CUTOUT_ALLOWANCE_MM['Керамограніт']).toBe(2.0);
    expect(SINK_CUTOUT_ALLOWANCE_MM['Кварцит']).toBe(4.0);
    expect(sinkCutoutAllowanceMm('Кварцит')).toBe(4.0);
    expect(sinkCutoutAllowanceMm('Керамограніт')).toBe(2.0);
    // невідомий матеріал не повинен давати 0 — це був би виріз без припуску
    expect(sinkCutoutAllowanceMm('Натуральний камінь')).toBe(2.0);
    expect(sinkCutoutAllowanceMm(undefined)).toBe(2.0);
  });
});

describe('isSoftMaterial', () => {
  it('акрил і компакт-плита — м’які', () => {
    expect(isSoftMaterial('Акрил')).toBe(true);
    expect(isSoftMaterial('Компакт-плита')).toBe(true);
  });

  it('камінь — ні', () => {
    expect(isSoftMaterial('Керамограніт')).toBe(false);
    expect(isSoftMaterial('Кварцит')).toBe(false);
    expect(isSoftMaterial('Натуральний камінь')).toBe(false);
    expect(isSoftMaterial(undefined)).toBe(false);
    expect(isSoftMaterial(null)).toBe(false);
    expect(isSoftMaterial('')).toBe(false);
  });
});

describe('isShortEdge', () => {
  it('коротка тільки якщо не на всю сторону І ≤ 30 мм', () => {
    expect(isShortEdge({ isFullLength: false, size: 30 })).toBe(true);
    expect(isShortEdge({ isFullLength: false, size: 10 })).toBe(true);
  });

  it('31 мм — уже не коротка', () => {
    expect(isShortEdge({ isFullLength: false, size: SHORT_EDGE_MAX_MM + 1 })).toBe(false);
  });

  it('на всю сторону — не коротка, який би не був size', () => {
    expect(isShortEdge({ isFullLength: true, size: 10 })).toBe(false);
    expect(isShortEdge({ size: 10 })).toBe(false);
  });

  it('без size — не коротка', () => {
    expect(isShortEdge({ isFullLength: false })).toBe(false);
    expect(isShortEdge({ isFullLength: false, size: 0 })).toBe(false);
    expect(isShortEdge(undefined)).toBe(false);
  });
});

describe('edgeToolOutMm', () => {
  it('камінь — завжди 30 мм, незалежно від профілю', () => {
    expect(edgeToolOutMm('Керамограніт', 2.5)).toBe(STONE_TOOL_OUT_MM);
    expect(edgeToolOutMm('Кварцит', 0)).toBe(30);
    expect(edgeToolOutMm('Натуральний камінь', undefined)).toBe(30);
    expect(edgeToolOutMm(undefined, 4)).toBe(30);
  });

  it('м’які матеріали — рівно припуск профілю', () => {
    expect(edgeToolOutMm('Акрил', 3)).toBe(3);
    expect(edgeToolOutMm('Компакт-плита', 2.5)).toBe(2.5);
  });

  it('м’які з нульовим профілем: 0 за замовчуванням, 2 для прев’ю', () => {
    // рушій кошторису
    expect(edgeToolOutMm('Акрил', 0)).toBe(0);
    expect(edgeToolOutMm('Акрил', undefined)).toBe(0);
    // панель властивостей
    expect(edgeToolOutMm('Акрил', 0, { softFallbackMm: 2 })).toBe(2);
    expect(edgeToolOutMm('Компакт-плита', undefined, { softFallbackMm: 2 })).toBe(2);
    // ненульовий профіль fallback не чіпає
    expect(edgeToolOutMm('Акрил', 3, { softFallbackMm: 2 })).toBe(3);
  });
});

describe('edgeAllowanceMm', () => {
  it('компакт-плита — 1 мм, акрил — 3 мм, профіль не впливає', () => {
    expect(edgeAllowanceMm({ material: 'Компакт-плита', profileAllowanceMm: 4 })).toBe(COMPACT_ALLOWANCE_MM);
    expect(edgeAllowanceMm({ material: 'Акрил', profileAllowanceMm: 4 })).toBe(ACRYLIC_ALLOWANCE_MM);
    // навіть коротка кромка не змінює фіксований припуск
    expect(edgeAllowanceMm({
      material: 'Акрил',
      profileAllowanceMm: 4,
      treatment: { isFullLength: false, size: 20 },
    })).toBe(3);
  });

  it('камінь — припуск профілю', () => {
    expect(edgeAllowanceMm({ material: 'Керамограніт', profileAllowanceMm: 2.5 })).toBe(2.5);
    expect(edgeAllowanceMm({ material: 'Кварцит', profileAllowanceMm: 4.0 })).toBe(4.0);
  });

  it('камінь без припуску в профілі — падає на 2.5', () => {
    expect(edgeAllowanceMm({ material: 'Керамограніт', profileAllowanceMm: 0 })).toBe(EDGE_ALLOWANCE_MM.default);
    expect(edgeAllowanceMm({ material: 'Керамограніт' })).toBe(2.5);
    expect(edgeAllowanceMm({})).toBe(2.5);
  });

  it('коротка кромка на камені припуску не дає', () => {
    expect(edgeAllowanceMm({
      material: 'Керамограніт',
      profileAllowanceMm: 2.5,
      treatment: { isFullLength: false, size: 30 },
    })).toBe(0);
  });

  it('кромка 31 мм припуск дає', () => {
    expect(edgeAllowanceMm({
      material: 'Керамограніт',
      profileAllowanceMm: 2.5,
      treatment: { isFullLength: false, size: 31 },
    })).toBe(2.5);
  });

  it('кромка на всю сторону припуск дає', () => {
    expect(edgeAllowanceMm({
      material: 'Керамограніт',
      profileAllowanceMm: 2.5,
      treatment: { isFullLength: true, size: 10 },
    })).toBe(2.5);
  });
});

describe('поведінка збігається зі старими трьома копіями', () => {
  // Дослівне відтворення коду, який лежав у projectSlice.ts до рефактора.
  const legacyProjectSlice = (
    material: string | undefined,
    allowanceSetting: number,
    treatment: { isFullLength?: boolean; size?: number },
  ) => {
    let allowance = 0;
    if (material === 'Компакт-плита') {
      allowance = 1;
    } else if (material === 'Акрил') {
      allowance = 3;
    } else {
      const isShort = treatment.isFullLength === false && treatment.size && treatment.size <= 30;
      if (!isShort) {
        allowance = allowanceSetting > 0 ? allowanceSetting : 2.5;
      }
    }
    return allowance;
  };

  // Дослівне відтворення коду з servicesExtractor.ts.
  const legacyExtractorToolOut = (material: string | undefined, allowance: number) => {
    let toolOut = 30;
    if (material === 'Акрил' || material === 'Компакт-плита') toolOut = allowance;
    return toolOut;
  };

  // Дослівне відтворення коду з PlacementPropertiesPanel.tsx.
  const legacyPanelToolOut = (material: string | undefined, allowance: number) => {
    let toolOut = 30;
    if (material === 'Акрил' || material === 'Компакт-плита') toolOut = allowance || 2;
    return toolOut;
  };

  const materials = ['Керамограніт', 'Кварцит', 'Натуральний камінь', 'Акрил', 'Компакт-плита', undefined];
  const allowances = [0, 2.5, 3, 4, 4.5];
  const treatments = [
    {},
    { isFullLength: true },
    { isFullLength: false, size: 10 },
    { isFullLength: false, size: 30 },
    { isFullLength: false, size: 31 },
    { isFullLength: false, size: 0 },
  ];

  it('edgeAllowanceMm — 180 комбінацій сходяться зі старим кодом', () => {
    let checked = 0;
    for (const material of materials) {
      for (const a of allowances) {
        for (const t of treatments) {
          expect(edgeAllowanceMm({ material, profileAllowanceMm: a, treatment: t }))
            .toBe(legacyProjectSlice(material, a, t));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(materials.length * allowances.length * treatments.length);
  });

  it('edgeToolOutMm — сходиться з обома старими варіантами', () => {
    for (const material of materials) {
      for (const a of allowances) {
        expect(edgeToolOutMm(material, a)).toBe(legacyExtractorToolOut(material, a));
        expect(edgeToolOutMm(material, a, { softFallbackMm: 2 })).toBe(legacyPanelToolOut(material, a));
      }
    }
  });
});
