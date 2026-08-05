import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAPPING_RULES,
  MAPPING_REQUIRED_SERVICE_IDS,
  allBuiltinRules,
  effectiveRules,
  resolveMapping,
  validateMapping,
  factUnit,
  FACT_KIND_LABELS,
  type MappingRule,
} from '../serviceMapping';
import { DEFAULT_SERVICE_CATALOG } from '../services';
import { VIYAR_MAPPING_RULES, INTERNAL_RULES_REPLACED_BY_VIYAR } from '../viyarMapping';
import { viyarCatalog } from '../viyarServiceCatalog';
import type { ProductionFact, ProductionFactKind } from '../../engines/productionFacts';

const fact = (
  kind: ProductionFactKind,
  qty: number,
  variant?: string,
  unit: 'm' | 'm2' | 'pcs' = 'm',
): ProductionFact => ({ kind, qty, unit, variant });

// ── Цілісність вбудованої таблиці ────────────────────────────────────

describe('вбудована таблиця відповідності', () => {
  it('усі послуги, на які вона посилається, є в каталозі', () => {
    const problems = validateMapping(DEFAULT_MAPPING_RULES, DEFAULT_SERVICE_CATALOG);
    const unknown = problems.filter((p) => p.kind === 'unknown_service');
    expect(unknown).toEqual([]);
  });

  it('одиниці виміру фактів і послуг збігаються', () => {
    const problems = validateMapping(DEFAULT_MAPPING_RULES, DEFAULT_SERVICE_CATALOG);
    expect(problems.filter((p) => p.kind === 'unit_mismatch')).toEqual([]);
  });

  it('немає дублів і кривих множників', () => {
    const problems = validateMapping(DEFAULT_MAPPING_RULES, DEFAULT_SERVICE_CATALOG);
    expect(problems.filter((p) => p.kind === 'duplicate_rule')).toEqual([]);
    expect(problems.filter((p) => p.kind === 'bad_multiplier')).toEqual([]);
  });

  it('id правил унікальні', () => {
    const ids = DEFAULT_MAPPING_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('послуги, дописані під таблицю, справді додані в каталог', () => {
    MAPPING_REQUIRED_SERVICE_IDS.forEach((id) => {
      expect(DEFAULT_SERVICE_CATALOG[id], `немає послуги ${id}`).toBeDefined();
    });
  });

  it('кожен вид факту має людську назву для налаштувань', () => {
    const kinds = new Set(DEFAULT_MAPPING_RULES.map((rule) => rule.factKind));
    kinds.forEach((kind) => {
      expect(FACT_KIND_LABELS[kind], `немає підпису для ${kind}`).toBeTruthy();
      expect(factUnit(kind)).toBeTruthy();
    });
  });
});

// ── Розв'язання ──────────────────────────────────────────────────────

describe('resolveMapping', () => {
  it('переносить кількість факту в послугу', () => {
    const lines = resolveMapping([fact('saw_cut', 3.2)], DEFAULT_MAPPING_RULES);
    const cut = lines.find((l) => l.serviceId === 'CUT_STRAIGHT');
    expect(cut?.quantity).toBe(3.2);
  });

  it('множник застосовується: пропил для стику ×2', () => {
    const lines = resolveMapping([fact('joint_count', 1, 'gt500', 'pcs')], DEFAULT_MAPPING_RULES);
    expect(lines.find((l) => l.serviceId === 'JOINT_SAWCUT')?.quantity).toBe(2);
  });

  it('одна обробка може дати кілька послуг', () => {
    // Стик під 45°: склейка ×1 і різ ×2
    const lines = resolveMapping([fact('joint_length', 1.5, 'miter45')], DEFAULT_MAPPING_RULES);
    expect(lines.find((l) => l.serviceId === 'GLUING_45')?.quantity).toBe(1.5);
    expect(lines.find((l) => l.serviceId === 'CUT_45')?.quantity).toBe(3);
  });

  it('однакові послуги з різних фактів складаються', () => {
    const lines = resolveMapping([
      fact('waterjet_cut', 0.5),
      fact('cutout_perimeter', 1.8),
    ], DEFAULT_MAPPING_RULES);
    // обидва факти чіпляються до CUT_WATERJET
    expect(lines.find((l) => l.serviceId === 'CUT_WATERJET')?.quantity).toBe(2.3);
    expect(lines.find((l) => l.serviceId === 'CUT_WATERJET')?.factKinds).toEqual(['waterjet_cut', 'cutout_perimeter']);
  });

  it('variant розрізняє профілі торця', () => {
    const lines = resolveMapping([
      fact('edge', 1.2, 'd_12'),
      fact('edge', 0.8, 'r2_top'),
    ], DEFAULT_MAPPING_RULES);
    expect(lines.find((l) => l.serviceId === 'EDGE_D12')?.quantity).toBe(1.2);
    expect(lines.find((l) => l.serviceId === 'EDGE_ROUND')?.quantity).toBe(0.8);
  });

  it('матеріал розводить однаковий факт по різних послугах', () => {
    const area = [fact('detail_area', 2.4, undefined, 'm2')];
    const ceramic = resolveMapping(area, DEFAULT_MAPPING_RULES, 'Керамограніт');
    const quartz = resolveMapping(area, DEFAULT_MAPPING_RULES, 'Кварцит');
    expect(ceramic.find((l) => l.serviceId === 'MATERIAL_CERAMIC')?.quantity).toBe(2.4);
    expect(ceramic.find((l) => l.serviceId === 'MATERIAL_QUARTZ')).toBeUndefined();
    expect(quartz.find((l) => l.serviceId === 'MATERIAL_QUARTZ')?.quantity).toBe(2.4);
  });

  it('без матеріалу правила з матеріальною групою не спрацьовують', () => {
    const lines = resolveMapping([fact('detail_area', 2.4, undefined, 'm2')], DEFAULT_MAPPING_RULES);
    expect(lines.find((l) => l.serviceId?.startsWith('MATERIAL_'))).toBeUndefined();
    // а монтаж без матеріальної групи — спрацьовує
    expect(lines.find((l) => l.serviceId === 'INSTALLATION')?.quantity).toBe(2.4);
  });

  it('вимкнене правило не рахується', () => {
    const lines = resolveMapping([fact('slabs_used', 3, undefined, 'pcs')], DEFAULT_MAPPING_RULES);
    // material:slabs у коробці вимкнене — матеріал за м², а не за лист
    expect(lines.find((l) => l.serviceId === 'MATERIAL_SLAB')).toBeUndefined();
  });

  it('факт без жодного правила просто зникає, а не ламає розрахунок', () => {
    const lines = resolveMapping([fact('waste_area', 4.5, undefined, 'm2')], DEFAULT_MAPPING_RULES);
    expect(lines.find((l) => l.factKinds.includes('waste_area'))).toBeUndefined();
  });

  it('зберігає, які правила спрацювали — щоб кошторис можна було пояснити', () => {
    const lines = resolveMapping([fact('joint_length', 1, 'miter45')], DEFAULT_MAPPING_RULES);
    expect(lines.find((l) => l.serviceId === 'CUT_45')?.ruleIds).toEqual(['joint:miter45→CUT_45']);
  });
});

// ── Правки керівника ─────────────────────────────────────────────────

describe('правки без коду', () => {
  it('керівник вмикає матеріал за лист замість за м²', () => {
    const rules = effectiveRules({
      overrides: {
        'material:slabs→MATERIAL_SLAB': { enabled: true },
        'material:ceramic': { enabled: false },
      },
    });
    const lines = resolveMapping([
      fact('slabs_used', 3, undefined, 'pcs'),
      fact('detail_area', 2.4, undefined, 'm2'),
    ], rules, 'Керамограніт');
    expect(lines.find((l) => l.serviceId === 'MATERIAL_SLAB')?.quantity).toBe(3);
    expect(lines.find((l) => l.serviceId === 'MATERIAL_CERAMIC')).toBeUndefined();
  });

  it('керівник міняє множник вбудованого правила', () => {
    const rules = effectiveRules({ overrides: { 'joint_count:gt500→JOINT_SAWCUT': { multiplier: 1 } } });
    const lines = resolveMapping([fact('joint_count', 1, 'gt500', 'pcs')], rules);
    expect(lines.find((l) => l.serviceId === 'JOINT_SAWCUT')?.quantity).toBe(1);
  });

  it('керівник переводить обробку на іншу послугу', () => {
    const rules = effectiveRules({ overrides: { 'edge:d_12→EDGE_D12': { serviceId: 'EDGE_POLISH' } } });
    const lines = resolveMapping([fact('edge', 1.2, 'd_12')], rules);
    expect(lines.find((l) => l.serviceId === 'EDGE_POLISH')?.quantity).toBe(1.2);
    expect(lines.find((l) => l.serviceId === 'EDGE_D12')).toBeUndefined();
  });

  it('керівник ДОДАЄ послугу до наявної обробки, нічого не прибираючи', () => {
    const extra: MappingRule = {
      id: 'custom_1',
      factKind: 'edge', variant: 'd_12',
      serviceId: 'POLISH_INNER', multiplier: 1,
      enabled: true, source: 'custom',
      note: 'Ручна доводка торця D-12',
    };
    const rules = effectiveRules({ customRules: [extra] });
    const lines = resolveMapping([fact('edge', 2, 'd_12')], rules);
    expect(lines.find((l) => l.serviceId === 'EDGE_D12')?.quantity).toBe(2);
    expect(lines.find((l) => l.serviceId === 'POLISH_INNER')?.quantity).toBe(2);
  });

  it('додане правило під новий профіль торця працює без правки коду', () => {
    const rules = effectiveRules({
      customRules: [{
        id: 'custom_ar12',
        factKind: 'edge', variant: 'ar_12',
        serviceId: 'EDGE_BEVEL', multiplier: 1,
        enabled: true, source: 'custom',
      }],
    });
    const lines = resolveMapping([fact('edge', 3.4, 'ar_12')], rules);
    expect(lines.find((l) => l.serviceId === 'EDGE_BEVEL')?.quantity).toBe(3.4);
  });

  it('правки не змінюють вбудовану таблицю', () => {
    const before = JSON.stringify(DEFAULT_MAPPING_RULES);
    effectiveRules({ overrides: { 'material:ceramic': { enabled: false } } });
    expect(JSON.stringify(DEFAULT_MAPPING_RULES)).toBe(before);
  });

  it('порожня конфігурація дає вбудовану таблицю разом із набором кодів ВіярПро', () => {
    expect(effectiveRules()).toEqual(allBuiltinRules());
    expect(effectiveRules({})).toEqual(allBuiltinRules());
    // правила на коди 1С у коробці вимкнені — їх вмикає керівник
    effectiveRules().filter((rule) => rule.id.startsWith('viyar:'))
      .forEach((rule) => expect(rule.enabled, rule.id).toBe(false));
  });
});

// ── Перевірка того, що керівник міг зламати ──────────────────────────

describe('validateMapping ловить помилки налаштування', () => {
  const base: MappingRule = {
    id: 'r1', factKind: 'edge', serviceId: 'EDGE_POLISH',
    multiplier: 1, enabled: true, source: 'custom',
  };

  it('послуга, якої немає в каталозі', () => {
    const problems = validateMapping([{ ...base, serviceId: 'НЕМАЄ_ТАКОЇ' }], DEFAULT_SERVICE_CATALOG);
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe('unknown_service');
  });

  it('метри, підчеплені до послуги в штуках', () => {
    const problems = validateMapping([{ ...base, serviceId: 'CUTOUT_HOLE' }], DEFAULT_SERVICE_CATALOG);
    expect(problems[0].kind).toBe('unit_mismatch');
    expect(problems[0].message).toContain('м');
  });

  it('два однакові правила — послуга нарахується двічі', () => {
    const problems = validateMapping([base, { ...base, id: 'r2' }], DEFAULT_SERVICE_CATALOG);
    expect(problems.some((p) => p.kind === 'duplicate_rule')).toBe(true);
  });

  it('нульовий і від’ємний множник', () => {
    expect(validateMapping([{ ...base, multiplier: 0 }], DEFAULT_SERVICE_CATALOG)[0].kind).toBe('bad_multiplier');
    expect(validateMapping([{ ...base, multiplier: -2 }], DEFAULT_SERVICE_CATALOG)[0].kind).toBe('bad_multiplier');
  });

  it('послуга в «комплектах» чіпляється до будь-якого факту', () => {
    const problems = validateMapping([{ ...base, serviceId: 'MEASUREMENT' }], DEFAULT_SERVICE_CATALOG);
    expect(problems).toEqual([]);
  });
});

// ── Прив'язки до кодів ВіярПро ───────────────────────────────────────

describe('набір прив’язок до облікових кодів', () => {
  const viyar = VIYAR_MAPPING_RULES;

  it('у коробці вимкнений — щоб не змінити суму без відома керівника', () => {
    viyar.forEach((rule) => expect(rule.enabled, rule.id).toBe(false));
  });

  it('усі вказують на послуги, які є в довіднику', () => {
    const catalog = viyarCatalog();
    viyar.forEach((rule) => {
      expect(catalog[rule.serviceId], `${rule.id} → ${rule.serviceId}`).toBeDefined();
    });
  });

  it('одиниці фактів і послуг збігаються', () => {
    const problems = validateMapping(viyar, viyarCatalog());
    expect(problems.filter((p) => p.kind === 'unit_mismatch')).toEqual([]);
  });

  it('кожне правило прив’язане до матеріальної групи — номенклатура подвоєна', () => {
    viyar.forEach((rule) => expect(rule.material, rule.id).toBeTruthy());
  });

  it('дублів немає', () => {
    const problems = validateMapping(viyar, viyarCatalog());
    expect(problems.filter((p) => p.kind === 'duplicate_rule')).toEqual([]);
  });

  it('увімкнені правила дають у кошторисі саме облікові коди', () => {
    const enabled = viyar.map((rule) => ({ ...rule, enabled: true }));
    const lines = resolveMapping(
      [{ kind: 'saw_cut', qty: 3.2, unit: 'm' }, { kind: 'hole_small', qty: 2, unit: 'pcs' }],
      enabled,
      'Керамограніт',
    );
    expect(lines.find((l) => l.serviceId === '195300')?.quantity).toBe(3.2);
    expect(lines.find((l) => l.serviceId === '195310')?.quantity).toBe(2);
  });

  it('матеріал розводить коди: кварцит дає інші номери', () => {
    const enabled = viyar.map((rule) => ({ ...rule, enabled: true }));
    const lines = resolveMapping([{ kind: 'saw_cut', qty: 1, unit: 'm' }], enabled, 'Кварцит');
    expect(lines.find((l) => l.serviceId === '219977')).toBeDefined();
    expect(lines.find((l) => l.serviceId === '195300')).toBeUndefined();
  });

  it('внутрішні правила, які треба вимкнути, справді існують', () => {
    const ids = new Set(DEFAULT_MAPPING_RULES.map((rule) => rule.id));
    INTERNAL_RULES_REPLACED_BY_VIYAR.forEach((id) => {
      expect(ids.has(id), `немає внутрішнього правила ${id}`).toBe(true);
    });
  });
});

// ── Різ під 45° на стику — облікові коди, не внутрішній CUT_45 ──────

describe('різ під 45° на стику', () => {
  const enabled = VIYAR_MAPPING_RULES.map((rule) => ({ ...rule, enabled: true }));

  it('на керамограніті стик 1.1 м дає 195303 з подвоєнням', () => {
    const lines = resolveMapping([fact('joint_length', 1.1, 'miter45')], enabled, 'Керамограніт');
    expect(lines.find((l) => l.serviceId === '195303')?.quantity).toBeCloseTo(2.2, 4);
  });

  it('на кварциті той самий стик дає 195665', () => {
    const lines = resolveMapping([fact('joint_length', 1.1, 'miter45')], enabled, 'Кварцит');
    expect(lines.find((l) => l.serviceId === '195665')?.quantity).toBeCloseTo(2.2, 4);
    expect(lines.find((l) => l.serviceId === '195303')).toBeUndefined();
  });

  it('внутрішній CUT_45 стику вимикається при переході — інакше подвійне нарахування', () => {
    expect(INTERNAL_RULES_REPLACED_BY_VIYAR).toContain('joint:miter45→CUT_45');
  });

  it('кути в штуках вимикаються: їхні метри вже входять у криволінійну порізку', () => {
    expect(INTERNAL_RULES_REPLACED_BY_VIYAR).toContain('corner:radius→CORNER_RADIUS');
    expect(INTERNAL_RULES_REPLACED_BY_VIYAR).toContain('corner:chamfer→CORNER_CHAMFER');
  });
});
