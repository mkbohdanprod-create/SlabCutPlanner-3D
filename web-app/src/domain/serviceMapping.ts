// =====================================================================
//  src/domain/serviceMapping.ts
//  Таблиця відповідності «виробничий факт → послуга прайсу».
//
//  Це ДАНІ, а не логіка. Додати послугу до обробки, вимкнути зайву,
//  змінити множник — усе це рядок у таблиці, який керівник міняє в
//  налаштуваннях, без правки коду й без релізу.
//
//  Чому саме так. Номенклатура ВіярПро/1С прив'язана до верстатів і
//  подвоєна за матеріалом: «Калібрування» має ID 242499 на керамограніт
//  і 242504 на кварцит. Якби рушій геометрії знав ці ID, кожна зміна
//  прайсу означала б правку коду. Тут рушій рахує факти, а таблиця
//  каже, як вони називаються в обліку.
//
//  ПРАВИЛО РОЗВ'ЯЗАННЯ: спрацьовують УСІ правила, що підійшли, а не
//  «найточніше». Одна обробка законно породжує кілька послуг — торець
//  D12 це і фрезерування крайки, і зведення складної фаски на стику.
//  Саме тому «додати послугу до обробки» = додати ще один рядок.
// =====================================================================

import type { MaterialType } from './types';
import type { ProductionFact, ProductionFactKind, FactRef, FactUnit } from '../engines/productionFacts';
import type { ServiceDefinition, ServiceUnit } from './services';
import { VIYAR_MAPPING_RULES } from './viyarMapping';

// ── Модель правила ───────────────────────────────────────────────────

export interface MappingRule {
  /** Стабільний ключ. Для вбудованих — людиночитний, для доданих — uid. */
  id: string;
  /** Який факт ловимо */
  factKind: ProductionFactKind;
  /**
   * Уточнення факту: id профілю крайки, тип стику, тип кута.
   * Порожньо = будь-який.
   */
  variant?: string;
  /** Матеріальна група. Порожньо = будь-який матеріал. */
  material?: MaterialType;
  /** ID послуги в каталозі (той самий ключ, що в serviceCatalog) */
  serviceId: string;
  /** Множник кількості. Пропил для стику виписується ×2. */
  multiplier: number;
  enabled: boolean;
  /** builtin — з коробки; custom — додав керівник у налаштуваннях */
  source: 'builtin' | 'custom';
  /** Підказка, яку видно в налаштуваннях */
  note?: string;
}

/** Правка вбудованого правила. Зберігається окремо, щоб оновлення
 *  застосунку не затирало налаштування і навпаки. */
export interface MappingOverride {
  enabled?: boolean;
  multiplier?: number;
  serviceId?: string;
  note?: string;
}

export interface MappedServiceLine {
  serviceId: string;
  unit: FactUnit;
  quantity: number;
  /** Які правила спрацювали — видно в налаштуваннях і в поясненні кошторису */
  ruleIds: string[];
  factKinds: ProductionFactKind[];
  refs: FactRef[];
}

// ── Вбудована таблиця ────────────────────────────────────────────────
//  Прив'язана до наявного каталогу застосунку. Коди 1С керівник додає
//  сам: створює послугу з полем «Код в обліку» і чіпляє до потрібного
//  факту. Тому тут навмисно немає жодного числового ID ВіярПро.

export const DEFAULT_MAPPING_RULES: MappingRule[] = [
  // ── Різ ────────────────────────────────────────────────────────────
  {
    id: 'saw_cut→CUT_STRAIGHT',
    factKind: 'saw_cut', serviceId: 'CUT_STRAIGHT', multiplier: 1,
    enabled: true, source: 'builtin',
    note: 'Прямолінійна порізка пилою під 90°',
  },
  {
    id: 'waterjet_cut→CUT_WATERJET',
    factKind: 'waterjet_cut', serviceId: 'CUT_WATERJET', multiplier: 1,
    enabled: true, source: 'builtin',
    note: 'Криволінійна порізка водою: радіуси, зрізи, дуги контуру',
  },

  // ── Вирізи й отвори ────────────────────────────────────────────────
  {
    id: 'cutout_perimeter→CUT_WATERJET',
    factKind: 'cutout_perimeter', serviceId: 'CUT_WATERJET', multiplier: 1,
    enabled: true, source: 'builtin',
    note: 'Периметр внутрішнього вирізу ріже той самий гідроабразив',
  },
  {
    id: 'hole_small→CUTOUT_HOLE',
    factKind: 'hole_small', serviceId: 'CUTOUT_HOLE', multiplier: 1,
    enabled: true, source: 'builtin',
    note: 'Отвір до 100 мм — рахується штуками',
  },
  {
    id: 'hole_large→HOLE_LARGE',
    factKind: 'hole_large', serviceId: 'HOLE_LARGE', multiplier: 1,
    enabled: true, source: 'builtin',
    note: 'Отвір понад 100 мм — рахується метрами периметра',
  },

  // ── Торець ─────────────────────────────────────────────────────────
  //  Один рядок на профіль. Саме сюди керівник дописує послуги, коли
  //  з'являється новий торець або коли до наявного треба додати ще
  //  одну операцію.
  { id: 'edge:polished_straight→EDGE_POLISH', factKind: 'edge', variant: 'polished_straight', serviceId: 'EDGE_POLISH', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'edge:chamfer_2x2→EDGE_BEVEL', factKind: 'edge', variant: 'chamfer_2x2', serviceId: 'EDGE_BEVEL', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'edge:chamfer_2x2_top_bottom→EDGE_BEVEL', factKind: 'edge', variant: 'chamfer_2x2_top_bottom', serviceId: 'EDGE_BEVEL', multiplier: 1, enabled: true, source: 'builtin', note: 'Верх і низ приходять окремими фактами, множник тут 1' },
  { id: 'edge:r2_top→EDGE_ROUND', factKind: 'edge', variant: 'r2_top', serviceId: 'EDGE_ROUND', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'edge:r2_top_bottom→EDGE_ROUND', factKind: 'edge', variant: 'r2_top_bottom', serviceId: 'EDGE_ROUND', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'edge:chamfer_45_r2→CUT_45', factKind: 'edge', variant: 'chamfer_45_r2', serviceId: 'CUT_45', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'edge:chamfer_45_r2→EDGE_ROUND', factKind: 'edge', variant: 'chamfer_45_r2', serviceId: 'EDGE_ROUND', multiplier: 1, enabled: true, source: 'builtin', note: 'Приклад двох послуг на одну обробку' },
  { id: 'edge:chamfered_edge→EDGE_BEVEL', factKind: 'edge', variant: 'chamfered_edge', serviceId: 'EDGE_BEVEL', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'edge:half_bullnose→EDGE_ROUND', factKind: 'edge', variant: 'half_bullnose', serviceId: 'EDGE_ROUND', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'edge:full_bullnose→EDGE_ROUND', factKind: 'edge', variant: 'full_bullnose', serviceId: 'EDGE_ROUND', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'edge:sharknose→CUT_45', factKind: 'edge', variant: 'sharknose', serviceId: 'CUT_45', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'edge:sharknose→EDGE_POLISH', factKind: 'edge', variant: 'sharknose', serviceId: 'EDGE_POLISH', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'edge:straight_edge→CUT_STRAIGHT', factKind: 'edge', variant: 'straight_edge', serviceId: 'CUT_STRAIGHT', multiplier: 1, enabled: true, source: 'builtin' },
  {
    id: 'edge:d_12→EDGE_D12',
    factKind: 'edge', variant: 'd_12', serviceId: 'EDGE_D12', multiplier: 1,
    enabled: true, source: 'builtin',
    note: 'До цього профілю в довіднику не було жодної послуги — торець рахувався безкоштовно',
  },

  {
    id: 'edge_manual_finish→EDGE_MANUAL_FINISH',
    factKind: 'edge_manual_finish', serviceId: 'EDGE_MANUAL_FINISH', multiplier: 1,
    enabled: true, source: 'builtin',
    note: 'Галочка «ручна доводка» на стороні деталі',
  },

  // ── Стики ──────────────────────────────────────────────────────────
  { id: 'joint:butt→GLUING_STRAIGHT', factKind: 'joint_length', variant: 'butt', serviceId: 'GLUING_STRAIGHT', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'joint:glued→GLUING_STRAIGHT', factKind: 'joint_length', variant: 'glued', serviceId: 'GLUING_STRAIGHT', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'joint:miter45→GLUING_45', factKind: 'joint_length', variant: 'miter45', serviceId: 'GLUING_45', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'joint:miter45→CUT_45', factKind: 'joint_length', variant: 'miter45', serviceId: 'CUT_45', multiplier: 2, enabled: true, source: 'builtin', note: 'Різ під 45° робиться на обох деталях стику — звідси ×2' },
  {
    id: 'joint_count:lt500→JOINT_SAWCUT',
    factKind: 'joint_count', variant: 'lt500', serviceId: 'JOINT_SAWCUT', multiplier: 2,
    enabled: true, source: 'builtin',
    note: 'Пропил для стику до 500 мм, ×2 на стик',
  },
  {
    id: 'joint_count:gt500→JOINT_SAWCUT',
    factKind: 'joint_count', variant: 'gt500', serviceId: 'JOINT_SAWCUT', multiplier: 2,
    enabled: true, source: 'builtin',
    note: 'Пропил для стику від 500 мм, ×2 на стик',
  },

  // ── Кути ───────────────────────────────────────────────────────────
  { id: 'corner:radius→CORNER_RADIUS', factKind: 'corner', variant: 'radius', serviceId: 'CORNER_RADIUS', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'corner:chamfer→CORNER_CHAMFER', factKind: 'corner', variant: 'chamfer', serviceId: 'CORNER_CHAMFER', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'corner:l-cut→CORNER_CHAMFER', factKind: 'corner', variant: 'l-cut', serviceId: 'CORNER_CHAMFER', multiplier: 1, enabled: true, source: 'builtin' },

  // ── Матеріал ───────────────────────────────────────────────────────
  //  Роздвоєно за матеріалом — так, як вирішив замовник.
  { id: 'material:ceramic', factKind: 'detail_area', material: 'Керамограніт', serviceId: 'MATERIAL_CERAMIC', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'material:quartz', factKind: 'detail_area', material: 'Кварцит', serviceId: 'MATERIAL_QUARTZ', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'material:natural', factKind: 'detail_area', material: 'Натуральний камінь', serviceId: 'MATERIAL_NATURAL', multiplier: 1, enabled: true, source: 'builtin' },
  { id: 'material:acrylic', factKind: 'detail_area', material: 'Акрил', serviceId: 'MATERIAL_ACRYLIC', multiplier: 1, enabled: true, source: 'builtin' },
  {
    id: 'material:slabs→MATERIAL_SLAB',
    factKind: 'slabs_used', serviceId: 'MATERIAL_SLAB', multiplier: 1,
    enabled: false, source: 'builtin',
    note: 'Матеріал за лист. Увімкніть замість «за м²», якщо клієнт платить за сляби',
  },

  // ── Монтаж ─────────────────────────────────────────────────────────
  { id: 'install→INSTALLATION', factKind: 'detail_area', serviceId: 'INSTALLATION', multiplier: 1, enabled: true, source: 'builtin' },
];

// ── Послуги, яких бракувало в каталозі під ці правила ─────────────────
//  Додаються до DEFAULT_SERVICE_CATALOG у services.ts; тут лишається
//  список їхніх ID, щоб перевірка цілісності бачила, що саме треба.
export const MAPPING_REQUIRED_SERVICE_IDS = [
  'CUT_WATERJET',
  'EDGE_MANUAL_FINISH',
  'HOLE_LARGE',
  'EDGE_D12',
  'JOINT_SAWCUT',
  'MATERIAL_SLAB',
] as const;

// ── Злиття вбудованих правил із правками керівника ────────────────────

export interface MappingConfig {
  /** Правки вбудованих правил за їхнім id */
  overrides?: Record<string, MappingOverride>;
  /** Правила, додані керівником */
  customRules?: MappingRule[];
}

/**
 * Ефективний набір правил: вбудовані з накладеними правками + додані.
 * Порядок стабільний — спершу вбудовані у порядку оголошення, потім
 * додані у порядку створення. Від порядку результат не залежить, але
 * стабільність потрібна тестам і UI.
 */
export function allBuiltinRules(): MappingRule[] {
  return [...DEFAULT_MAPPING_RULES, ...VIYAR_MAPPING_RULES];
}

export function effectiveRules(config: MappingConfig = {}): MappingRule[] {
  const overrides = config.overrides ?? {};
  const builtin = allBuiltinRules().map((rule) => {
    const patch = overrides[rule.id];
    return patch ? { ...rule, ...patch } : rule;
  });
  const custom = (config.customRules ?? []).map((rule) => ({ ...rule, source: 'custom' as const }));
  return [...builtin, ...custom];
}

// ── Розв'язання ──────────────────────────────────────────────────────

function matches(rule: MappingRule, fact: ProductionFact, material?: MaterialType): boolean {
  if (!rule.enabled) return false;
  if (rule.factKind !== fact.kind) return false;
  if (rule.variant !== undefined && rule.variant !== '' && rule.variant !== fact.variant) return false;
  if (rule.material !== undefined && rule.material !== material) return false;
  return true;
}

/**
 * Перекладає факти в позиції прайсу.
 *
 * Ціни тут не застосовуються навмисно: кількість — це виробнича правда,
 * а ціна залежить від того, кому ми показуємо документ.
 */
export function resolveMapping(
  facts: ProductionFact[],
  rules: MappingRule[],
  material?: MaterialType,
): MappedServiceLine[] {
  const byService = new Map<string, MappedServiceLine>();

  facts.forEach((fact) => {
    rules.forEach((rule) => {
      if (!matches(rule, fact, material)) return;
      const quantity = fact.qty * (Number.isFinite(rule.multiplier) ? rule.multiplier : 1);
      if (quantity <= 0) return;

      const existing = byService.get(rule.serviceId);
      if (existing) {
        existing.quantity += quantity;
        if (!existing.ruleIds.includes(rule.id)) existing.ruleIds.push(rule.id);
        if (!existing.factKinds.includes(fact.kind)) existing.factKinds.push(fact.kind);
        if (fact.ref) existing.refs.push(fact.ref);
      } else {
        byService.set(rule.serviceId, {
          serviceId: rule.serviceId,
          unit: fact.unit,
          quantity,
          ruleIds: [rule.id],
          factKinds: [fact.kind],
          refs: fact.ref ? [fact.ref] : [],
        });
      }
    });
  });

  return [...byService.values()].map((line) => ({
    ...line,
    quantity: Math.round(line.quantity * 10000) / 10000,
  }));
}

// ── Перевірка цілісності для екрана налаштувань ───────────────────────

export type MappingProblemKind = 'unknown_service' | 'unit_mismatch' | 'duplicate_rule' | 'bad_multiplier';

export interface MappingProblem {
  kind: MappingProblemKind;
  ruleId: string;
  message: string;
}

const FACT_UNIT_BY_KIND: Record<ProductionFactKind, FactUnit> = {
  saw_cut: 'm',
  waterjet_cut: 'm',
  cutout_perimeter: 'm',
  hole_small: 'pcs',
  hole_large: 'm',
  edge: 'm',
  edge_manual_finish: 'm',
  joint_length: 'm',
  joint_count: 'pcs',
  corner: 'pcs',
  detail_area: 'm2',
  slabs_used: 'pcs',
  slab_area: 'm2',
  waste_area: 'm2',
};

/** Чи сумісна одиниця факту з одиницею послуги */
function unitCompatible(factUnit: FactUnit, serviceUnit: ServiceUnit): boolean {
  if (serviceUnit === 'комплект') return true; // комплект чіпляється до чого завгодно
  return factUnit === serviceUnit;
}

/**
 * Знаходить те, що керівник міг зламати руками: послугу, якої немає в
 * каталозі; метри, підчеплені до штучної послуги; два однакові правила;
 * від'ємний множник. Повертає перелік для показу в налаштуваннях —
 * не кидає винятків, бо екран має лишатись робочим.
 */
export function validateMapping(
  rules: MappingRule[],
  catalog: Record<string, ServiceDefinition>,
): MappingProblem[] {
  const problems: MappingProblem[] = [];
  const seen = new Set<string>();

  rules.forEach((rule) => {
    const signature = `${rule.factKind}|${rule.variant ?? ''}|${rule.material ?? ''}|${rule.serviceId}`;
    if (seen.has(signature)) {
      problems.push({
        kind: 'duplicate_rule',
        ruleId: rule.id,
        message: `Таке саме правило вже є — послуга нарахується двічі`,
      });
    }
    seen.add(signature);

    if (!Number.isFinite(rule.multiplier) || rule.multiplier <= 0) {
      problems.push({ kind: 'bad_multiplier', ruleId: rule.id, message: 'Множник має бути більшим за нуль' });
    }

    const service = catalog[rule.serviceId];
    if (!service) {
      problems.push({
        kind: 'unknown_service',
        ruleId: rule.id,
        message: `Послуги «${rule.serviceId}» немає в каталозі`,
      });
      return;
    }

    const factUnit = FACT_UNIT_BY_KIND[rule.factKind];
    if (factUnit && !unitCompatible(factUnit, service.unit)) {
      problems.push({
        kind: 'unit_mismatch',
        ruleId: rule.id,
        message: `Факт міряється в «${factUnit}», а послуга «${service.name}» — в «${service.unit}»`,
      });
    }
  });

  return problems;
}

/** Одиниця виміру факту — потрібна екрану налаштувань для підказок */
export function factUnit(kind: ProductionFactKind): FactUnit {
  return FACT_UNIT_BY_KIND[kind];
}

/** Людські назви видів фактів для екрана налаштувань */
export const FACT_KIND_LABELS: Record<ProductionFactKind, string> = {
  saw_cut: 'Різ пилою',
  waterjet_cut: 'Різ водою (контур)',
  cutout_perimeter: 'Периметр вирізу',
  hole_small: 'Отвір до 100 мм',
  hole_large: 'Отвір понад 100 мм',
  edge: 'Обробка торця',
  edge_manual_finish: 'Ручна доводка торця',
  joint_length: 'Довжина стику',
  joint_count: 'Стик (штука)',
  corner: 'Оброблений кут',
  detail_area: 'Площа деталей',
  slabs_used: 'Задіяні сляби',
  slab_area: 'Площа слябів',
  waste_area: 'Відхід',
};
