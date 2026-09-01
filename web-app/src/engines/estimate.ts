// =====================================================================
//  src/engines/estimate.ts
//  Один розрахунок вартості на весь застосунок.
//
//  До цього модуля кошторис і комерційна пропозиція були двома різними
//  математиками. Кошторис рахував із номінальних width/height елемента
//  (тобто з прямокутника — для Г-подібної стільниці це неправда за
//  побудовою), брав периметр вирізу із заглушки 500×400 і множив площу
//  на 1.2 «на відходи». КП рахувало з реальних полігонів, але двічі
//  рахувало непрямі різи: пила брала весь периметр, вода — ще раз ті
//  самі дуги. На одному проєкті вони давали різні суми і ніде не
//  звірялись.
//
//  Тепер ланцюг один:
//     геометрія → productionFacts → serviceMapping → ціни
//  Два подання над ним: повний перелік (кошторис, для виробництва) і
//  згорнутий по групах (КП, для клієнта).
// =====================================================================

import type { Detail, DetailPart, MaterialType, Project } from '../domain/types';
import { toSlot } from '../domain/ids';
import type { ServiceCategory, ServiceDefinition, ServiceUnit } from '../domain/services';
import { DEFAULT_SERVICE_CATALOG } from '../domain/services';
import {
  DEFAULT_MAPPING_RULES,
  resolveMapping,
  type MappingRule,
} from '../domain/serviceMapping';
import {
  extractProductionFacts,
  summarizeFacts,
  type FactRef,
  type FactTotal,
  type ProductionFact,
  type ProductionFactKind,
} from './productionFacts';

/**
 * Звідки взялась ціна рядка кошторису:
 *   erp    — порахувала 1С за кодом номенклатури (externalId);
 *   manual — ціна з каталогу налаштувань: так живуть послуги, які
 *            керівник завів руками і яких в обліку ще немає;
 *   none   — ціни немає: або в операції не заповнений код 1С, або 1С за
 *            цим кодом нічого не повернула.
 *
 * Вбудований каталог увесь нульовий (domain/services.ts), тому 'manual'
 * тут — це завжди свідомо вписана людиною ціна, а не забутий хардкод.
 */
export type EstimatePriceSource = 'erp' | 'manual' | 'none';

export interface EstimateLine {
  serviceId: string;
  name: string;
  unit: ServiceUnit;
  quantity: number;
  unitPrice: number;
  /** Звідки взялась ціна рядка — див. EstimatePriceSource */
  priceSource: EstimatePriceSource;
  total: number;
  category: ServiceCategory;
  /** Код в обліковій системі, якщо керівник його заповнив */
  externalId?: string;
  /** Які правила дали цей рядок — щоб кошторис можна було пояснити */
  ruleIds: string[];
  /** З яких фактів він зібрався */
  factKinds: ProductionFactKind[];
  /** До яких деталей стосується — потрібно паспорту деталі */
  detailIds: string[];
  /** Звідки саме взялась кількість: деталь, сторона, виріз */
  refs: FactRef[];
}

export interface EstimateGroup {
  category: ServiceCategory;
  label: string;
  lines: EstimateLine[];
  total: number;
}

export interface EstimateResult {
  facts: ProductionFact[];
  factTotals: FactTotal[];
  /** Повний перелік — для виробництва */
  lines: EstimateLine[];
  /** Згорнутий по групах — для клієнта */
  groups: EstimateGroup[];
  total: number;
  /** Рядки, які нікуди не потрапили: послуги немає в каталозі */
  missingServiceIds: string[];
}

export interface EstimateOptions {
  /** Деталі проєкту. Для виробів — результат getAllProjectDetails(project). */
  details?: Detail[];
  /** Ефективні правила прив'язки. За замовчуванням — вбудовані. */
  rules?: MappingRule[];
  /** Каталог послуг. За замовчуванням — вбудований (увесь без цін). */
  catalog?: Record<string, ServiceDefinition>;
  /**
   * Ціни від 1С: код номенклатури (externalId) → грн за одиницю.
   * Порожньо — кошторис рахує кількості, а гроші лишаються нульові й
   * позначені як 'none'. Джерело те саме, що й у «Прорахунку»
   * (components/ui/usePrices1c.ts), тому за один код обидва документи
   * показують одне число.
   */
  erpPrices?: Record<string, number>;
}

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  material: 'Матеріал',
  machine: 'Верстатна обробка',
  manual: 'Ручні роботи',
  engineering: 'Інженерні послуги та монтаж',
};

const CATEGORY_ORDER: ServiceCategory[] = ['material', 'machine', 'manual', 'engineering'];

function round2(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/**
 * Що спитати в 1С під цей кошторис: код номенклатури і сумарна кількість.
 *
 * Кількості за однаковим кодом складаються: 195304 приходить і з
 * криволінійної порізки, і з периметра вирізів — для 1С це одна позиція,
 * і питати її двічі різними числами означало б отримати дві різні знижки.
 * Рядки без коду сюди не потрапляють: питати за ними нема за чим.
 */
export function estimatePriceRequests(lines: EstimateLine[]): Array<{ code: string; qty: number }> {
  const byCode = new Map<string, number>();
  lines.forEach((line) => {
    if (!line.externalId) return;
    byCode.set(line.externalId, (byCode.get(line.externalId) ?? 0) + line.quantity);
  });
  return [...byCode].map(([code, qty]) => ({ code, qty: Math.round(qty * 1000) / 1000 }));
}

/**
 * Один рядок кошторису. Гроші тут і тільки тут: обидва подання
 * (проєкт і деталь) мають рахувати ціну однаково, інакше паспорт деталі
 * і кошторис проєкту розійдуться на тому самому коді.
 */
function buildLine(
  service: ServiceDefinition,
  entry: { quantity: number; ruleIds: string[]; factKinds: ProductionFactKind[]; refs: FactRef[] },
  erpPrices: Record<string, number>,
): EstimateLine {
  const quantity = Math.round(entry.quantity * 1000) / 1000;
  const erpPrice = service.externalId ? erpPrices[service.externalId] : undefined;
  // Ціна з каталогу підхоплюється тільки там, де 1С мовчить, і тільки
  // якщо її справді вписали: нуль означає «не задано», а не «безкоштовно».
  const manualPrice = service.price > 0 ? service.price : undefined;
  const unitPrice = erpPrice ?? manualPrice ?? 0;
  const priceSource: EstimatePriceSource = erpPrice !== undefined ? 'erp'
    : manualPrice !== undefined ? 'manual' : 'none';
  return {
    serviceId: service.id,
    name: service.name,
    unit: service.unit,
    quantity,
    unitPrice,
    priceSource,
    total: round2(quantity * unitPrice),
    category: service.category,
    externalId: service.externalId,
    ruleIds: entry.ruleIds,
    factKinds: entry.factKinds,
    detailIds: [...new Set(entry.refs.map((ref) => ref.detailId).filter(Boolean) as string[])],
    refs: entry.refs,
  };
}

export function computeEstimate(
  project: Project,
  parts: DetailPart[],
  options: EstimateOptions = {},
): EstimateResult {
  const catalog = options.catalog ?? DEFAULT_SERVICE_CATALOG;
  const rules = options.rules ?? DEFAULT_MAPPING_RULES;
  const erpPrices = options.erpPrices ?? {};
  const material = project.projectMaterial as MaterialType | undefined;

  const facts = extractProductionFacts(project, parts, { details: options.details });
  const mapped = resolveMapping(facts, rules, material);

  const missingServiceIds: string[] = [];
  const lines: EstimateLine[] = [];

  mapped.forEach((entry) => {
    const service = catalog[entry.serviceId];
    if (!service) {
      // Не вигадуємо ціну й не мовчимо: рядок їде окремим списком,
      // щоб було видно, що прив'язка вказує в нікуди.
      missingServiceIds.push(entry.serviceId);
      return;
    }
    lines.push(buildLine(service, entry, erpPrices));
  });

  lines.sort((a, b) => {
    const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (byCategory !== 0) return byCategory;
    return a.name.localeCompare(b.name, 'uk');
  });

  const groups: EstimateGroup[] = CATEGORY_ORDER
    .map((category) => {
      const groupLines = lines.filter((line) => line.category === category);
      return {
        category,
        label: CATEGORY_LABELS[category],
        lines: groupLines,
        total: round2(groupLines.reduce((sum, line) => sum + line.total, 0)),
      };
    })
    .filter((group) => group.lines.length > 0);

  return {
    facts,
    factTotals: summarizeFacts(facts),
    lines,
    groups,
    total: round2(lines.reduce((sum, line) => sum + line.total, 0)),
    missingServiceIds: [...new Set(missingServiceIds)],
  };
}

// ── Розріз по одній деталі ───────────────────────────────────────────

/**
 * Чи стосується факт саме цієї деталі.
 *
 * Ідентифікатори в застосунку існують у двох формах: повний шлях
 * `prod_1/element:skirting_A/detail:main` і короткий слот `skirting_A`.
 * У 3D-редакторі меню віддає слот, у розкрої парти несуть повний шлях —
 * тому порівнюємо через `toSlot`, як і решта коду. Кути й стики
 * приходять із прив'язкою до Елемента, а не до Деталі, тож перевіряємо
 * і `elementPath` — інакше радіуси й стики в паспорті не показались би.
 */
export function factBelongsToDetail(fact: ProductionFact, detailId: string): boolean {
  const ref = fact.ref;
  if (!ref) return false;
  const target = toSlot(detailId);
  if (ref.detailId && (ref.detailId === detailId || toSlot(ref.detailId) === target)) return true;
  if (ref.elementPath && toSlot(ref.elementPath) === target) return true;
  // Стик належить обом деталям — друга прив'язка теж рахується.
  if (ref.elementPathB && toSlot(ref.elementPathB) === target) return true;
  return false;
}

export interface DetailEstimate {
  /** Обробки, які підтягуються на цю деталь */
  facts: ProductionFact[];
  factTotals: FactTotal[];
  /** Послуги, що з них нараховуються */
  lines: EstimateLine[];
  total: number;
  missingServiceIds: string[];
}

/**
 * Те саме, що computeEstimate, але тільки для однієї деталі: спершу
 * відсіюємо факти, і вже їх перекладаємо в послуги. Саме такий порядок,
 * а не фільтрація готових рядків — інакше в кошторис деталі потрапила б
 * кількість, зібрана з усього проєкту.
 */
export function computeDetailEstimate(
  project: Project,
  parts: DetailPart[],
  detailId: string,
  options: EstimateOptions = {},
): DetailEstimate {
  const catalog = options.catalog ?? DEFAULT_SERVICE_CATALOG;
  const rules = options.rules ?? DEFAULT_MAPPING_RULES;
  const erpPrices = options.erpPrices ?? {};
  const material = project.projectMaterial as MaterialType | undefined;

  const allFacts = extractProductionFacts(project, parts, { details: options.details });
  const facts = allFacts.filter((fact) => factBelongsToDetail(fact, detailId));
  const mapped = resolveMapping(facts, rules, material);

  const missingServiceIds: string[] = [];
  const lines: EstimateLine[] = [];

  mapped.forEach((entry) => {
    const service = catalog[entry.serviceId];
    if (!service) {
      missingServiceIds.push(entry.serviceId);
      return;
    }
    lines.push(buildLine(service, entry, erpPrices));
  });

  lines.sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  return {
    facts,
    factTotals: summarizeFacts(facts),
    lines,
    total: round2(lines.reduce((sum, line) => sum + line.total, 0)),
    missingServiceIds: [...new Set(missingServiceIds)],
  };
}
