import {
  DEFAULT_QUOTE_PRICE_BOOK,
  PYRAMID_LENGTHS,
  QUOTE_MONTAGE_LABELS,
  QUOTE_SERVICES,
  QUOTE_UNIT_LABELS,
  quoteProductType,
  type MontageCategory,
  type QuoteCalcDoc,
  type QuoteItem,
  type QuotePriceBook,
  type QuoteShape,
  type QuoteUnit,
} from '../domain/quoteCalc';
import type { Detail, DetailPart } from '../domain/types';
import { fabrication1cCode } from '../domain/quote1cCatalog';

/**
 * Движок прорахунку для клієнта.
 *
 * Чиста функція: документ + прайс → рядки розрахунку. Правила з ТЗ
 * «Логіка калькуляції»:
 *
 *   · виготовлення — фактична площа (м²) чи довжина (м.п.) за
 *     номенклатурою «Виготовлення {тип} — {виробник}»
 *   · нога й опуски власної номенклатури не мають — площа вливається
 *     у стільницю (з потовщенням у пріоритеті)
 *   · мийка — шт, у площу монтажу не йде; фасади не монтуємо
 *   · замір — 1 на замовлення, своя номенклатура на тип матеріалу
 *   · виїзд — зона 0 без доплати, далі 1–5 за відстанню
 *   · пакування: піраміда (шт, розмір за найдовшою деталлю) чи короб (м²)
 *     — лише для способу «за кресленням»; на монтаж везуть без піраміди
 *   · модель обробки торця на вартість НЕ впливає (§11)
 *
 * Кожен рядок має стабільний id — на нього чіпляється ручна ціна
 * (priceOverrides) і по ньому бланк погодження знайде свої дані.
 */

export interface QuoteCalcLine {
  id: string;
  group: 'fabrication' | 'material' | 'montage' | 'services' | 'packaging';
  label: string;
  qty: number;
  unit: QuoteUnit;
  unitPrice: number;
  /** Ціна взята з ручного поля, а не з прайсу */
  overridden: boolean;
  sum: number;
  /** Код номенклатури 1С з налаштувань прорахунку (codes1c) */
  code?: string;
}

export interface QuoteCalcResult {
  lines: QuoteCalcLine[];
  total: number;
  warnings: string[];
}

export const QUOTE_GROUP_LABELS: Record<QuoteCalcLine['group'], string> = {
  fabrication: 'Виготовлення',
  material: 'Матеріал',
  montage: 'Замір і монтаж',
  services: 'Додаткові послуги',
  packaging: 'Пакування',
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Площа виробу, м² × кількість. Фактична площа з розкрою (areaM2) має
 * пріоритет; інакше — сума плечей (Пряма — одне, Г — два, П — три).
 */
export function itemAreaM2(item: QuoteItem): number {
  if (item.areaM2 !== undefined) return round3(item.areaM2 * Math.max(1, item.count));
  const d = item.dims;
  const arm = (w?: number, h?: number) => ((w ?? 0) * (h ?? 0)) / 1e6;
  let area = arm(d.w, d.h);
  if (item.shape === 'Г-подібна' || item.shape === 'П-подібна') area += arm(d.w2, d.h2);
  if (item.shape === 'П-подібна') area += arm(d.w3, d.h3);
  return round3(area * Math.max(1, item.count));
}

/** Довжина виробу, м.п. × кількість. Фактична довжина з розкрою — в пріоритеті */
export function itemLengthM(item: QuoteItem): number {
  if (item.lengthM !== undefined) return round3(item.lengthM * Math.max(1, item.count));
  const base = (item.dims.l ?? item.dims.w ?? 0) / 1000;
  return round3(base * Math.max(1, item.count));
}

/** Найдовший габарит серед виробів, мм — для підбору піраміди */
export function longestDimensionMm(items: QuoteItem[]): number {
  return items.reduce((best, item) => {
    const candidates = [item.dims.w, item.dims.h, item.dims.w2, item.dims.h2, item.dims.w3, item.dims.h3, item.dims.l];
    return Math.max(best, ...candidates.map((value) => value ?? 0));
  }, 0);
}

/** Стандартна довжина піраміди, у яку влазить найдовша деталь */
export function suggestPyramidLength(items: QuoteItem[]): number {
  const longest = longestDimensionMm(items);
  return PYRAMID_LENGTHS.find((length) => length >= longest) ?? PYRAMID_LENGTHS[PYRAMID_LENGTHS.length - 1];
}

/**
 * Ціна виготовлення: точна пара «матеріал:виробник» → просто виробник →
 * базова ціна типу. Ключ із матеріалом потрібен, бо «Під проект» існує
 * в кожному матеріалі з різними цінами.
 */
function fabricationPrice(book: QuotePriceBook, productTypeId: string, material: string, manufacturer: string): number {
  const byManufacturer = book.fabricationByManufacturer[productTypeId];
  return byManufacturer?.[`${material}:${manufacturer}`]
    ?? byManufacturer?.[manufacturer]
    ?? book.fabrication[productTypeId]
    ?? 0;
}

export function computeQuoteCalc(
  doc: QuoteCalcDoc,
  book: QuotePriceBook = DEFAULT_QUOTE_PRICE_BOOK,
): QuoteCalcResult {
  const lines: QuoteCalcLine[] = [];
  const warnings: string[] = [];

  const push = (
    id: string,
    group: QuoteCalcLine['group'],
    label: string,
    qty: number,
    unit: QuoteUnit,
    bookPrice: number,
    code?: string,
  ) => {
    if (qty <= 0) return;
    const override = doc.priceOverrides[id];
    const unitPrice = override !== undefined ? override : bookPrice;
    lines.push({
      id, group, label,
      qty: round3(qty), unit,
      unitPrice: round2(unitPrice),
      overridden: override !== undefined,
      sum: round2(qty * unitPrice),
      ...(code ? { code } : {}),
    });
  };
  const code1c = (key: string, fallbackKey?: string) =>
    book.codes1c?.[key] || (fallbackKey ? book.codes1c?.[fallbackKey] : undefined) || undefined;

  // ── 1. Виготовлення ────────────────────────────────────────────────
  //  Групуємо кількості за номенклатурами (типами виробів): «2 стільниці
  //  по 1.2 м²» — це один рядок 2.4 м², бо номенклатура одна.
  const fabQty = new Map<string, number>();
  const add = (typeId: string, qty: number) => fabQty.set(typeId, (fabQty.get(typeId) ?? 0) + qty);

  doc.items.forEach((item) => {
    const type = quoteProductType(item.productTypeId);
    if (!type) {
      warnings.push(`Невідомий тип виробу: ${item.productTypeId}`);
      return;
    }
    const qty = type.unit === 'm2' ? itemAreaM2(item)
      : type.unit === 'mp' ? itemLengthM(item)
      : Math.max(1, item.count);
    if (qty <= 0) {
      warnings.push(`«${type.label}» без розмірів — не потрапляє в розрахунок`);
      return;
    }

    // Нога/опуск: площа вливається у стільницю (Логіка §3–4)
    if (type.foldInto?.length) {
      const target = type.foldInto.find((candidate) =>
        doc.items.some((other) => other.productTypeId === candidate));
      if (target) {
        add(target, qty);
      } else {
        // Стільниці в замовленні немає — тарифікуємо за першою
        // номенклатурою зі списку, але чесно попереджаємо.
        add(type.foldInto[0], qty);
        warnings.push(`«${type.label}» без стільниці в замовленні — площу враховано за номенклатурою стільниці`);
      }
      return;
    }
    add(type.id, qty);
  });

  fabQty.forEach((qty, typeId) => {
    const type = quoteProductType(typeId);
    if (!type) return;
    const manufacturerSuffix = doc.manufacturer ? ` — ${doc.manufacturer}` : '';
    // Код: ручне налаштування (від точного ключа до загального), а коли
    // його немає — вбудований довідник 1С («Виготовлення … Laminam»;
    // невідомий виробник лягає на «Під проект» свого матеріалу).
    const builtinCode = fabrication1cCode(typeId, doc.materialType, doc.manufacturer)?.code;
    push(
      `fab:${typeId}`, 'fabrication',
      `Виготовлення: ${type.label}${manufacturerSuffix}`,
      qty, type.unit,
      fabricationPrice(book, typeId, doc.materialType, doc.manufacturer),
      code1c(`fab:${typeId}:${doc.materialType}:${doc.manufacturer}`)
        ?? code1c(`fab:${typeId}:${doc.manufacturer}`, `fab:${typeId}`)
        ?? builtinCode,
    );
  });

  // ── 2. Матеріал: лист/півлиста ─────────────────────────────────────
  if (doc.materialSheets > 0) {
    const decor = doc.decorCode ? `, декор ${doc.decorCode}` : '';
    push('material:sheets', 'material', `Матеріал: ${doc.materialType}${decor}`, doc.materialSheets, 'sheet', book.sheet, code1c('sheet'));
  }

  // ── 3. Замір, монтаж, виїзд — лише «з заміром та монтажем» ────────
  if (doc.method === 'measure_install') {
    push('measure', 'montage', `Замір (${doc.materialType})`, 1, 'service', book.measure[doc.materialType] ?? 0, code1c(`measure:${doc.materialType}`));

    // Монтаж рахує ПЛОЩУ ВИГОТОВЛЕННЯ (з ногами й опусками всередині),
    // тому кількості беремо з уже згрупованих fabQty, а не з items.
    const montageQty = new Map<MontageCategory, { qty: number; unit: QuoteUnit }>();
    fabQty.forEach((qty, typeId) => {
      const type = quoteProductType(typeId);
      if (!type?.montage) return; // мийки не в площі монтажу, фасади не монтуємо
      const bucket = montageQty.get(type.montage) ?? { qty: 0, unit: type.unit };
      bucket.qty += qty;
      montageQty.set(type.montage, bucket);
    });
    montageQty.forEach((bucket, category) => {
      push(`montage:${category}`, 'montage', QUOTE_MONTAGE_LABELS[category], bucket.qty, bucket.unit, book.montage[category] ?? 0, code1c(`montage:${category}`));
    });

    if (doc.deliveryZone > 0) {
      push('delivery', 'montage', `Виїзд на адресу (зона ${doc.deliveryZone})`, 1, 'service', book.deliveryZones[doc.deliveryZone] ?? 0, code1c(`delivery:${doc.deliveryZone}`, 'delivery'));
    }
    if (!doc.address) warnings.push('Спосіб «з заміром та монтажем», а адресу не вказано');
  }

  // ── 4. Додаткові послуги ───────────────────────────────────────────
  QUOTE_SERVICES.forEach((service) => {
    const qty = doc.services[service.id] ?? 0;
    if (qty > 0) push(`svc:${service.id}`, 'services', service.label, qty, service.unit, book.services[service.id] ?? 0, code1c(`svc:${service.id}`));
  });

  // ── 5. Пакування — лише «за кресленням» (Логіка §1) ───────────────
  if (doc.method === 'drawing') {
    if (doc.packaging.pyramidQty > 0) {
      const length = doc.packaging.pyramidLength || suggestPyramidLength(doc.items);
      push('pack:pyramid', 'packaging', `Дерев'яна піраміда ${length} мм`, doc.packaging.pyramidQty, 'pcs', book.pyramid[length] ?? 0, code1c(`pyramid:${length}`));
      if (longestDimensionMm(doc.items) > length) {
        warnings.push(`Найдовша деталь ${longestDimensionMm(doc.items)} мм не влазить у піраміду ${length} мм`);
      }
    }
    if (doc.packaging.boxM2 > 0) {
      push('pack:box', 'packaging', 'Пакування в короб', doc.packaging.boxM2, 'm2', book.boxPerM2, code1c('box'));
    }
  }

  // ── Перевірки документа ────────────────────────────────────────────
  if (doc.materialType === 'Акриловий камінь' && doc.method !== 'sink_only' && !doc.surfaceType) {
    warnings.push('Для акрилового каменю не вказано тип поверхні');
  }
  if (doc.method === 'sink_only') {
    const stray = doc.items.find((item) => !quoteProductType(item.productTypeId)?.sinkFlow);
    if (stray) warnings.push('У способі «Окрема мийка» доступні лише мийка та раковина');
  }

  const zeroPriced = lines.filter((line) => line.unitPrice === 0);
  if (lines.length && zeroPriced.length) {
    warnings.push(`Без ціни: ${zeroPriced.length} з ${lines.length} рядків — впишіть ціни в рядках або наповніть прайс`);
  }

  return {
    lines,
    total: round2(lines.reduce((sum, line) => sum + line.sum, 0)),
    warnings,
  };
}

export const quoteUnitLabel = (unit: QuoteUnit) => QUOTE_UNIT_LABELS[unit];

// ── Імпорт виробів із розкрою ────────────────────────────────────────

/**
 * Перетворює намальовані в проєкті вироби на позиції прорахунку.
 *
 * Вироби не вводяться двічі: менеджер малює їх у редакторі, а прорахунок
 * підтягує ФАКТИЧНІ площі з розкрою (з радіусами, вирізами й Г-формами) —
 * рівно те, що ТЗ називає «фактична площа деталі».
 *
 * Правила відповідності:
 *   · Стільниця → «без потовщень», а якщо у виробі є Підворот/Потовщення
 *     (окремими деталями чи смугами на самій стільниці) — «з потовщенням»,
 *     і площа опусків вливається в площу стільниці (Логіка §3–4)
 *   · Опора → «Нога» (движок сам віллє її в стільницю)
 *   · Стінова панель → від/до 12 мм за товщиною
 *   · Мийка → шт · Фасад → м²
 *   · «Довільний елемент» не вгадуємо — його менеджер додає вручну
 */
export function quoteItemsFromProject(
  details: Detail[],
  parts: DetailPart[],
  defaultThicknessMm?: number,
): QuoteItem[] {
  const partsOf = (detailId: string) => parts.filter((part) => part.detailId === detailId);
  /** Площа деталі З опусками: сума всіх її частин (смуги підвороту — не-main частини) */
  const areaOf = (detailId: string) => partsOf(detailId).reduce((sum, part) => sum + (part.area || 0), 0);
  const longestOf = (detailId: string) => partsOf(detailId).reduce(
    (best, part) => Math.max(best, part.width || 0, part.height || 0), 0);

  const mapShape = (shape?: string): QuoteShape =>
    shape === 'Г-подібна' ? 'Г-подібна' : shape === 'П-подібна' ? 'П-подібна' : 'Пряма';

  // Деталі одного виробу впізнаються за префіксом шляху (prod_1/element:…);
  // сирітські деталі (DXF, ручні) — кожна сама собі виріб.
  const groups = new Map<string, Detail[]>();
  details.forEach((detail) => {
    const key = detail.id.includes('/') ? detail.id.split('/')[0] : detail.id;
    groups.set(key, [...(groups.get(key) ?? []), detail]);
  });

  const items: QuoteItem[] = [];

  groups.forEach((group) => {
    const folds = group.filter((detail) => detail.type === 'Підворот' || detail.type === 'Потовщення');
    const foldsArea = folds.reduce((sum, detail) => sum + areaOf(detail.id), 0);
    const countertops = group.filter((detail) => detail.type === 'Стільниця');
    const hasThickening = folds.length > 0 || countertops.some((detail) =>
      partsOf(detail.id).some((part) => !part.isMain && (part.edgeKind === 'fold' || part.edgeKind === 'thickening')));

    countertops.forEach((detail, index) => {
      // Опуски виробу вливаються в його першу стільницю — двічі не рахуємо
      const area = areaOf(detail.id) + (index === 0 ? foldsArea : 0);
      if (area <= 0) return;
      items.push({
        id: `qi_src_${detail.id}`,
        productTypeId: hasThickening ? 'countertop_thick' : 'countertop_plain',
        count: 1,
        shape: mapShape(detail.shape),
        thicknessMm: detail.thickness ?? defaultThicknessMm,
        dims: { w: longestOf(detail.id) },
        areaM2: Math.round(area * 1000) / 1000,
        sourceRef: detail.id,
        sourceLabel: detail.label || detail.type,
      });
    });

    group.forEach((detail) => {
      const base = {
        id: `qi_src_${detail.id}`,
        count: 1,
        shape: mapShape(detail.shape),
        thicknessMm: detail.thickness ?? defaultThicknessMm,
        dims: { w: longestOf(detail.id) },
        sourceRef: detail.id,
        sourceLabel: detail.label || detail.type,
      };
      const area = Math.round(areaOf(detail.id) * 1000) / 1000;
      if (detail.type === 'Опора' && area > 0) {
        items.push({ ...base, productTypeId: 'leg', areaM2: area });
      } else if (detail.type === 'Стінова панель' && area > 0) {
        const thickness = detail.thickness ?? defaultThicknessMm ?? 0;
        items.push({ ...base, productTypeId: thickness >= 12 ? 'wall_panel_ge12' : 'wall_panel_lt12', areaM2: area });
      } else if (detail.type === 'Мийка') {
        items.push({ ...base, productTypeId: 'sink' });
      } else if (detail.type === 'Фасад' && area > 0) {
        items.push({ ...base, productTypeId: 'facade', areaM2: area });
      }
    });
  });

  return items;
}
