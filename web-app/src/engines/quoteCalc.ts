import {
  DEFAULT_QUOTE_PRICE_BOOK,
  PYRAMID_LENGTHS,
  QUOTE_MONTAGE_LABELS,
  QUOTE_SERVICES,
  RADIUS_QUOTE_SERVICE_ID,
  QUOTE_UNIT_LABELS,
  quoteProductType,
  type MontageCategory,
  type QuoteCalcDoc,
  type QuoteItem,
  type QuotePriceBook,
  type QuoteShape,
  type QuoteUnit,
  ACRYLIC_BASE_SURFACE,
} from '../domain/quoteCalc';
import type { Detail, DetailPart, Project } from '../domain/types';
import { fabrication1cCode } from '../domain/quote1cCatalog';
import { jointLengthMm } from './productionFacts';
import { parseAdditionSlot } from '../domain/ids';
import {
  classifyRadiusService,
  radiusMatrixKey,
  radiusMethodFor,
  radiusRoleForType,
} from '../domain/radiusElement';
import { edgeKindByLabel } from '../domain/ids';

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
 * Кожен рядок має стабільний id — по ньому бланк погодження знайде свої
 * дані.
 *
 * Ціни рахує 1С (метод getDiscountPrice) за кодом номенклатури 1С —
 * саме він знає прайс-категорію контрагента, знижки й акції. Локальний
 * прайс лишається фолбеком: для рядків без коду (власні послуги філії) і
 * на випадок, коли сервіс недоступний. Руками ціну не вписують: сума в
 * рядку рахується сама.
 */

/**
 * Звідки взялась ціна рядка:
 *   cost   — порахував 1С за кодом номенклатури;
 *   manual — керівник перекрив ціну руками в режимі калібрування;
 *   none   — ціни немає: або в номенклатури не заданий код 1С, або
 *            сервіс за цим кодом нічого не повернув.
 *
 * Тихого фолбеку на локальний прайс більше немає (рішення 25.08.2026).
 * Раніше було 'book': коли сервіс мовчав, у КП мовчки підставлялась
 * ручна ціна з налаштувань — і рядок виглядав порахованим, хоча сервіс
 * не відповів. Саме на цьому ми один раз помилково вирішили, що інтеграція
 * працює. Тепер ручна ціна застосовується тільки при свідомо
 * ввімкненому режимі калібрування і завжди позначена як ручна.
 */
export type QuotePriceSource = 'erp' | 'manual' | 'none';

export interface QuoteCalcLine {
  id: string;
  group: 'fabrication' | 'material' | 'montage' | 'services' | 'packaging';
  label: string;
  qty: number;
  unit: QuoteUnit;
  unitPrice: number;
  /** Джерело ціни — показується в інтерфейсі й пояснює, чому ціна така */
  source: QuotePriceSource;
  /**
   * Ціна, яку дав 1С, коли рядок перекритий руками.
   * Без неї калібрування безглузде: щоб звести аналітику по 10–20
   * проектах, треба бачити обидва числа, а не тільки виправлене.
   */
  erpUnitPrice?: number;
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
  /**
   * Ціни від 1С: код номенклатури 1С → грн за одиницю.
   * Порожньо — рахуємо за локальним прайсом, як і до підключення API.
   */
  erpPrices: Record<string, number> = {},
  /**
   * Режим калібрування цін. Вимкнено — ручні ціни з прайсу рушій НЕ
   * бачить узагалі: ціна або від сервісу, або її немає. Це навмисно:
   * стара ціна, що лежить у localStorage конкретного браузера, не
   * повинна мати жодного шансу підмінити ціну інтеграції.
   */
  manualPricing = false,
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
    const erpPrice = code ? erpPrices[code] : undefined;
    // Ручна ціна перемагає — але тільки при ввімкненому калібруванні і
    // тільки якщо її справді ввели. Нуль означає «не задано», а не
    // «безкоштовно»: інакше порожній прайс обнуляв би ціни сервісу.
    const manualPrice = manualPricing && bookPrice > 0 ? bookPrice : undefined;
    const unitPrice = manualPrice ?? erpPrice ?? 0;
    const source: QuotePriceSource = manualPrice !== undefined ? 'manual'
      : erpPrice !== undefined ? 'erp' : 'none';
    lines.push({
      id, group, label,
      qty: round3(qty), unit,
      unitPrice: round2(unitPrice),
      source,
      // Ціну сервісу тягнемо поряд саме тоді, коли її перекрили —
      // це і є матеріал для аналітики розходжень.
      ...(source === 'manual' && erpPrice !== undefined ? { erpUnitPrice: round2(erpPrice) } : {}),
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
  //  Скільки з площі номенклатури — влиті ноги/опуски. Це показується в
  //  назві рядка, інакше нога «зникає» і виглядає непорахованою.
  const foldedQty = new Map<string, number>();
  let hasLeg = false;

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
      hasLeg = true;
      const target = type.foldInto.find((candidate) =>
        doc.items.some((other) => other.productTypeId === candidate));
      const into = target ?? type.foldInto[0];
      add(into, qty);
      foldedQty.set(into, (foldedQty.get(into) ?? 0) + qty);
      if (!target) {
        // Стільниці в замовленні немає — тарифікуємо за першою
        // номенклатурою зі списку, але чесно попереджаємо.
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
    // Влита площа ноги показується в назві рядка — щоб було видно,
    // що нога порахована, хоч і не окремою номенклатурою (Логіка §3)
    const folded = foldedQty.get(typeId) ?? 0;
    const foldedSuffix = folded > 0 ? ` (з ногою ${round3(folded)} м²)` : '';
    // Код: ручне налаштування (від точного ключа до загального), а коли
    // його немає — вбудований довідник 1С («Виготовлення … Laminam»;
    // невідомий виробник лягає на «Під проект» свого матеріалу).
    const builtinCode = fabrication1cCode(typeId, doc.materialType, doc.manufacturer)?.code;
    push(
      `fab:${typeId}`, 'fabrication',
      `Виготовлення: ${type.label}${manufacturerSuffix}${foldedSuffix}`,
      qty, type.unit,
      fabricationPrice(book, typeId, doc.materialType, doc.manufacturer),
      code1c(`fab:${typeId}:${doc.materialType}:${doc.manufacturer}`)
        ?? code1c(`fab:${typeId}:${doc.manufacturer}`, `fab:${typeId}`)
        ?? builtinCode,
    );
  });

  // Нога є, а послуги стикування немає — швидше за все, забули (Логіка §2)
  if (hasLeg && !(doc.services.joint_leg > 0)) {
    warnings.push('У замовленні є нога — додайте послугу «Стикування “Ноги” з виробом» (м.п. з\'єднання) в додаткових послугах');
  }

  // ── 2. Матеріал ────────────────────────────────────────────────────
  //  Джерело — слеби проєкту: по рядку на артикул, кількість = скільки
  //  листів цього артикулу додано. Ціну за артикулом дає 1С,
  //  точно як за послуги. Немає слебів (старий проєкт, або рахують без
  //  розкрою) — лишається ручне поле «Листів на замовлення», як було.
  if (doc.materials?.length) {
    doc.materials.forEach((line) => {
      if (line.qty <= 0) return;
      const decor = line.decor ? `, декор ${line.decor}` : '';
      const thickness = line.thickness ? `, ${line.thickness} мм` : '';
      push(
        `material:${line.key}`,
        'material',
        `Матеріал: ${line.material}${decor}${thickness}`,
        line.qty,
        'sheet',
        0,
        // Артикул слебу і є код номенклатури, за яким питається ціна.
        // Немає — рядок лишається без ціни, і це видно в попередженнях.
        line.article || undefined,
      );
    });
  } else if (doc.materialSheets > 0) {
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

  // ── 4b. Обробка поверхні — лише акриловий камінь (FG-33) ───────────
  //  Акрил приходить у напівглянці; мат або глянець — реальна робота цеху,
  //  яка досі йшла коментарем і в рахунок не потрапляла ніколи. Площа —
  //  сума площ виробів з розкрою: вона вже містить підвороти, ноги і
  //  панелі, тобто всі зовнішні поверхні (рішення Богдана, 19.08).
  if (
    doc.materialType === 'Акриловий камінь'
    && doc.method !== 'sink_only'
    && doc.surfaceType
    && doc.surfaceType !== ACRYLIC_BASE_SURFACE
  ) {
    const surfaceAreaM2 = doc.items.reduce((sum, item) => sum + itemAreaM2(item), 0);
    push(
      'surface:processing',
      'fabrication',
      `Обробка поверхні: ${doc.surfaceType.toLowerCase()}`,
      round3(surfaceAreaM2),
      'm2',
      book.services['surface_processing'] ?? 0,
      code1c('svc:surface_processing'),
    );
  }

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

  const noCode = lines.filter((line) => !line.code);
  if (lines.length && noCode.length) {
    warnings.push(`Без коду 1С: ${noCode.length} з ${lines.length} рядків — ціну за ними спитати нема за чим`);
  }
  const zeroPriced = lines.filter((line) => line.unitPrice === 0 && line.code);
  if (lines.length && zeroPriced.length) {
    warnings.push(`Без ціни: ${zeroPriced.length} з ${lines.length} рядків — код є, але 1С ціну не повернула`);
  }
  // Ручні ціни мають бути видимі в кожному місці, де їх видно: у списку
  // попереджень теж. «Тихого» калібрування не буває — саме тиша й була
  // проблемою старого фолбеку.
  const manualLines = lines.filter((line) => line.source === 'manual');
  if (manualLines.length) {
    warnings.push(`Режим калібрування: ${manualLines.length} ${manualLines.length === 1 ? 'рядок іде' : 'рядків ідуть'} за ручною ціною, а не за ціною компанії`);
  }

  return {
    lines,
    total: round2(lines.reduce((sum, line) => sum + line.sum, 0)),
    warnings,
  };
}

export const quoteUnitLabel = (unit: QuoteUnit) => QUOTE_UNIT_LABELS[unit];

// ── Авто-заповнення додаткових послуг ────────────────────────────────

/**
 * Кількості послуг, які виробнича логіка вже знає з проєкту — щоб
 * менеджер не вписував руками те, що застосунок порахував сам:
 *
 *   · joint_leg — «Стикування ноги»: довжина стиків joint_leg_* у
 *     виробах, м.п. (та сама довжина, за якою рахується різ під 45)
 *   · joint_flat — «Стикування деталей в площині»: розрізана стиками
 *     Г-подібна дає 1 стик, П-подібна — 2 (ТЗ: 1 шт на 1 стик)
 *   · texture_match — «Підбір текстури»: якщо в проєкті ввімкнено
 *
 * Це ЗАМОВЧУВАННЯ: ручне значення в документі (навіть 0) перемагає.
 */
/**
 * Ефективні кількості послуг: авто з проєкту + ручні поверх.
 *
 * Нуль у документі трактується як «не задано», а не як свідоме «нуль»:
 * порожнє поле в панелі колись зберігало 0, і такий залишок мовчки
 * блокував авто-заповнення. Прибрати послугу, яку геометрія бачить
 * (стик ноги є в виробі), — це не сценарій: тоді треба прибирати ногу.
 */
export function mergeQuoteServices(
  auto: Record<string, number>,
  manual: Record<string, number> | undefined,
): Record<string, number> {
  const merged: Record<string, number> = { ...auto };
  Object.entries(manual ?? {}).forEach(([id, qty]) => {
    if (qty > 0) merged[id] = qty;
    else if (!(merged[id] > 0)) merged[id] = qty;
  });
  return merged;
}

export function autoQuoteServices(
  project: Project,
  details: Detail[],
  /**
   * Деталі розкрою. Позначки радіусних елементів живуть на партах —
   * це єдине джерело, спільне для виробів і легасі-галочок. Без партів
   * радіусні послуги в авто-кількості не потраплять.
   */
  parts?: DetailPart[],
): Record<string, number> {
  const auto: Record<string, number> = {};

  /*
   * Радіусні (гнуті) елементи — ТЗ 19.08. Послуга за ШТУКУ на кожен
   * елемент; для акрилу додатково матриця — за кількістю УНІКАЛЬНИХ
   * геометрій (радіус × виліт × кут дуги), а не за кількістю радіусів:
   * чотири однакові R500 гнуть на одній матриці.
   */
  const matrixKeys = new Set<string>();
  (parts ?? []).forEach((part) => {
    const mark = part.radiusElement;
    if (!mark) return;
    const method = mark.method ?? radiusMethodFor(project.projectMaterial);
    const kind = classifyRadiusService({
      method,
      role: mark.role ?? radiusRoleForType(part.type),
      bandSizeMm: mark.bandSizeMm ?? Math.min(part.width, part.height),
      radiusMm: mark.radiusMm,
      complex: mark.complex,
    });
    const serviceId = RADIUS_QUOTE_SERVICE_ID[kind];
    if (serviceId) auto[serviceId] = (auto[serviceId] ?? 0) + 1;

    if (method === 'bending') {
      matrixKeys.add(radiusMatrixKey({
        radiusMm: mark.radiusMm,
        bandSizeMm: mark.bandSizeMm ?? Math.min(part.width, part.height),
        arcAngleDeg: mark.arcAngleDeg ?? 90,
        complex: mark.complex,
      }));
    }
  });
  if (matrixKeys.size > 0) auto.radius_matrix = matrixKeys.size;

  let legMm = 0;
  const walkElements = (elements: Array<{ joints?: unknown[]; additions?: unknown[] }> | undefined) => {
    (elements ?? []).forEach((element) => {
      (element.joints ?? []).forEach((joint) => {
        const j = joint as { id?: string };
        /*
         * Стик ноги впізнається РОЗБОРОМ слота, а не префіксом (виправлено
         * 26.08 за зауваженням продажів: кількість завищувалась).
         *
         * Id стику — `joint_` + слот доповнення. Префіксний матч
         * `joint_leg_` загрібав і СКЛЕЙКИ ПІДВОРОТІВ САМОЇ НОГИ: опуск на
         * нозі живе в слоті `leg_B_fold_C`, і його стик `joint_leg_B_fold_C`
         * теж починається з `joint_leg_`. Так «стикування ноги з виробом»
         * росло на кожен опуск.
         *
         * І дзеркальна вада: нога, приклеєна до СТІНОВОЇ ПАНЕЛІ, живе в
         * слоті `wall_panel_B_leg_C` — її стик префікс не ловив узагалі.
         *
         * parseAdditionSlot бере ОСТАННІЙ префікс слота: для
         * `leg_B_fold_C` це fold (не рахуємо), для `wall_panel_B_leg_C` —
         * leg (рахуємо). Рівно та семантика, що потрібна.
         */
        const slot = String(j.id ?? '').replace(/^joint_/, '');
        if (parseAdditionSlot(slot).kind === 'leg') {
          legMm += jointLengthMm(joint as Parameters<typeof jointLengthMm>[0]);
        }
      });
      walkElements(element.additions as never);
    });
  };
  (project.products ?? []).forEach((product) => walkElements(product.elements as never));
  if (legMm > 0) auto.joint_leg = Math.round(legMm) / 1000;

  let flatJoints = 0;
  details.forEach((detail) => {
    if (detail.geometry?.wholeDetail) return;
    if (detail.shape === 'Г-подібна') flatJoints += 1;
    if (detail.shape === 'П-подібна') flatJoints += 2;
  });
  if (flatJoints > 0) auto.joint_flat = flatJoints;

  if (project.textureSelectionEnabled) auto.texture_match = 1;

  // Мийки, ВСТАНОВЛЕНІ в стільниці (нижній монтаж): кожна вимагає виріз
  // під чашу. Рахуємо з sinks на драфтах елементів — того самого джерела,
  // з якого народжуються і виріз, і деталі чаші.
  let sinkCuts = 0;
  const walkSinks = (elements: Array<{ baseDefinition?: { sinks?: Record<string, unknown>; quantity?: number }; additions?: unknown[] }> | undefined) => {
    (elements ?? []).forEach((element) => {
      const def = element.baseDefinition;
      const count = Object.keys(def?.sinks ?? {}).length;
      if (count > 0) sinkCuts += count * Math.max(1, def?.quantity ?? 1);
      walkSinks(element.additions as never);
    });
  };
  (project.products ?? []).forEach((product) => walkSinks(product.elements as never));
  if (sinkCuts > 0) auto.sink_cutout = sinkCuts;

  return auto;
}

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
    // Обидва крайові доповнення тарифікуються однаково — вливаються в стільницю.
    const folds = group.filter((detail) => Boolean(edgeKindByLabel(detail.type as string)));
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
      } else if ((detail.type as string) === 'Бортик' && area > 0) {
        /*
         * Бортик у прорахунку — СТІНОВА ПАНЕЛЬ (рішення продажів 26.08).
         * Раніше гілки не було взагалі, і бортик мовчки випадав із КП:
         * деталь різалась, а виробу за неї не нараховувалось. Категорія
         * панелі та сама вилка за товщиною, що й у стінової панелі.
         */
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
