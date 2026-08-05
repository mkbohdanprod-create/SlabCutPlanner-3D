import { describe, it, expect } from 'vitest';
import { referenceData, mergeBuiltinEdgeProfiles } from '../defaults';
import { DEFAULT_MAPPING_RULES } from '../serviceMapping';
import { VIYAR_MAPPING_RULES } from '../viyarMapping';
import { DEFAULT_SERVICE_CATALOG } from '../services';
import { viyarCatalog } from '../viyarServiceCatalog';
import { edgeProfilesForMaterial } from '../../utils/edgeProfiles';

// Виробничі профілі торців мусять існувати в чотирьох місцях одразу:
// у довіднику профілів, у внутрішніх прив'язках, у прив'язках до кодів
// і в каталозі послуг. Розсинхрон будь-яких двох означає крайку, яка
// або не показується, або не тарифікується. Ці тести тримають усі
// чотири разом.

const profiles = referenceData.edgeProfiles ?? [];
const byId = (id: string) => profiles.find((profile) => profile.id === id);

const CERAMIC_12 = ['ar_12', 'd_12', 't_12', 'z_12', 'zs_12', 'zs_4', 'zs_6_15', 'zs_6_3'];
const QUARTZ_20 = ['d_20', 'h_40', 'r_10', 'r_3', 'r_5', 't_20', 'xd_20', 'z_20', 'antik'];
const BOTH = ['ar_20', 'zs_20', 'edge_45'];

describe('довідник профілів', () => {
  it('уся серія 12 присутня і закріплена за керамогранітом', () => {
    CERAMIC_12.forEach((id) => {
      expect(byId(id), `немає профілю ${id}`).toBeDefined();
      expect(byId(id)?.materialGroup, id).toBe('Керамограніт');
    });
  });

  it('уся серія 20 присутня і закріплена за кварцитом', () => {
    QUARTZ_20.forEach((id) => {
      expect(byId(id), `немає профілю ${id}`).toBeDefined();
      expect(byId(id)?.materialGroup, id).toBe('Кварцит');
    });
  });

  it('AR20, ZS20 і 45° доступні на обох матеріалах', () => {
    BOTH.forEach((id) => {
      expect(byId(id), `немає профілю ${id}`).toBeDefined();
      expect(byId(id)?.materialGroup, id).toBeUndefined();
    });
  });

  it('припуски з CUTTING_RULES: D12 — 4.5, стик Z — 1.5, решта — 2.5', () => {
    expect(byId('d_12')?.allowance).toBe(4.5);
    expect(byId('z_12')?.allowance).toBe(1.5);
    expect(byId('ar_12')?.allowance).toBe(2.5);
    expect(byId('t_20')?.allowance).toBe(2.5);
  });

  it('кожен виробничий профіль має операцію — інакше КП не тарифікує', () => {
    [...CERAMIC_12, ...QUARTZ_20, ...BOTH].forEach((id) => {
      expect(byId(id)?.operations?.length, id).toBeGreaterThan(0);
    });
  });
});

describe('прив’язки профілів', () => {
  const internalIds = new Set(DEFAULT_MAPPING_RULES.map((rule) => `${rule.factKind}|${rule.variant ?? ''}`));
  const viyarByVariant = (variant: string) => VIYAR_MAPPING_RULES.filter(
    (rule) => rule.factKind === 'edge' && rule.variant === variant,
  );

  it('кожен профіль має внутрішню прив’язку — ціна є ДО переходу на коди', () => {
    [...CERAMIC_12, ...QUARTZ_20, ...BOTH].forEach((id) => {
      expect(internalIds.has(`edge|${id}`), `профіль ${id} без внутрішньої прив'язки`).toBe(true);
    });
  });

  it('кожен профіль має прив’язку до облікового коду', () => {
    [...CERAMIC_12, ...QUARTZ_20, ...BOTH].forEach((id) => {
      expect(viyarByVariant(id).length, `профіль ${id} без коду ВіярПро`).toBeGreaterThan(0);
    });
  });

  it('AR20 і ZS20 мають ПО ДВА коди — керамограніт і кварцит окремо', () => {
    ['ar_20', 'zs_20'].forEach((id) => {
      const rules = viyarByVariant(id);
      expect(rules.map((rule) => rule.material).sort()).toEqual(['Кварцит', 'Керамограніт'].sort());
      // і коди різні — це різні позиції прайсу
      expect(new Set(rules.map((rule) => rule.serviceId)).size).toBe(2);
    });
  });

  it('усі коди профілів існують у довіднику послуг', () => {
    const catalog = viyarCatalog();
    VIYAR_MAPPING_RULES.filter((rule) => rule.factKind === 'edge').forEach((rule) => {
      expect(catalog[rule.serviceId], `${rule.id} → ${rule.serviceId}`).toBeDefined();
    });
  });

  it('внутрішня послуга профілів існує в каталозі', () => {
    expect(DEFAULT_SERVICE_CATALOG.EDGE_PROFILE_MILL).toBeDefined();
    expect(DEFAULT_SERVICE_CATALOG.EDGE_PROFILE_MILL.unit).toBe('m');
  });
});

describe('фільтр за матеріалом', () => {
  it('на керамограніті немає кварцитної серії 20', () => {
    const ids = edgeProfilesForMaterial(profiles, 'Керамограніт').map((profile) => profile.id);
    expect(ids).toContain('ar_12');
    expect(ids).toContain('ar_20'); // спільний
    expect(ids).not.toContain('h_40');
    expect(ids).not.toContain('antik');
  });

  it('на кварциті немає серії 12', () => {
    const ids = edgeProfilesForMaterial(profiles, 'Кварцит').map((profile) => profile.id);
    expect(ids).toContain('h_40');
    expect(ids).toContain('zs_20');
    expect(ids).not.toContain('ar_12');
    expect(ids).not.toContain('zs_4');
  });

  it('без матеріалу показуємо все', () => {
    expect(edgeProfilesForMaterial(profiles, undefined)).toHaveLength(profiles.length);
  });
});

describe('злиття у збережені проєкти', () => {
  it('старий проєкт отримує нові профілі', () => {
    const old = [{ id: 'polished_straight', label: 'Стара', shortLabel: 'Ст', description: '', allowance: 0 }];
    const merged = mergeBuiltinEdgeProfiles(old as never);
    expect(merged.map((profile) => profile.id)).toContain('ar_12');
    expect(merged.map((profile) => profile.id)).toContain('zs_20');
  });

  it('відредаговані користувачем профілі не перетираються', () => {
    const edited = [{ id: 'd_12', label: 'Мій D12', shortLabel: 'D12', description: '', allowance: 7 }];
    const merged = mergeBuiltinEdgeProfiles(edited as never);
    const d12 = merged.find((profile) => profile.id === 'd_12');
    expect(d12?.label).toBe('Мій D12');
    expect(d12?.allowance).toBe(7);
    // і дубля немає
    expect(merged.filter((profile) => profile.id === 'd_12')).toHaveLength(1);
  });

  it('порожній довідник дає повний вбудований набір', () => {
    expect(mergeBuiltinEdgeProfiles(undefined)).toHaveLength(profiles.length);
  });
});
