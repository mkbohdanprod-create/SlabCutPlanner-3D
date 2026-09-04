/**
 * ТЕХ КАРТА ДЛЯ ЦЕХУ — 04.09.2026.
 *
 * Бере рядки кошторису (`computeEstimate` — ті самі, що у вкладці
 * «Послуги для виробництва») і розкладає їх по ділянках у порядку
 * проходження цеху (ВЦ-1 / Р1С-5) і згортає в «вид робіт × одиниця»
 * бланка цеху (МЕС-1). Нічого не рахує заново: кількості — з кошторису.
 *
 * Мапа «послуга → ділянка, вид робіт» нижче — перша версія за таблицею
 * МЕС-1 з обучалочки. Де правило ГІПОТЕЗА — так і написано в полі
 * `rule`, щоб конструктор бачив, чому рядок став туди, куди став.
 */
import type { EstimateLine, EstimateResult } from '../../engines/estimate';
import type { Project } from '../../domain/types';

/** Ділянки у порядку потоку (ВЦ-1, Р1С-5). */
export const SHOP_AREAS = [
  'Пильний центр',
  'Порізка водою',
  'ЧПК',
  'Мийки',
  'Поклейка крайки',
  'Шліфування',
  'Полірування',
  'Косметика',
] as const;
export type ShopArea = typeof SHOP_AREAS[number];

/** Види робіт бланка цеху (МЕС-1). */
export type WorkKind =
  | 'Порізка твердих матеріалів пилою'
  | 'Порізка твердих матеріалів водою'
  | 'Фрезування твердих матеріалів'
  | 'Шліфування / полірування водою'
  | 'Полірування'
  | 'Виготовлення мийки'
  | 'Поклейка деталей'
  | 'Косметичні роботи';

export type MesUnit = 'м.п.' | 'м²' | 'шт' | 'лист';

interface RouteEntry { area: ShopArea; kind: WorkKind; unit: MesUnit; rule: string }

/**
 * Внутрішній id послуги → (ділянка, вид робіт, одиниця). Порядок
 * важливий лише для читання; сортування — за SHOP_AREAS.
 */
export const SERVICE_ROUTE: Record<string, RouteEntry> = {
  CUT_STRAIGHT: { area: 'Пильний центр', kind: 'Порізка твердих матеріалів пилою', unit: 'м.п.', rule: 'МЕС-1' },
  CUT_45: { area: 'Пильний центр', kind: 'Порізка твердих матеріалів пилою', unit: 'м.п.', rule: 'МЕС-1 (пилою під кутом)' },
  CUT_WATERJET: { area: 'Порізка водою', kind: 'Порізка твердих матеріалів водою', unit: 'м.п.', rule: 'МЕС-1' },
  HOLE_LARGE: { area: 'Порізка водою', kind: 'Порізка твердих матеріалів водою', unit: 'м.п.', rule: 'МЕС-1' },
  CUTOUT_HOLE: { area: 'Порізка водою', kind: 'Порізка твердих матеріалів водою', unit: 'шт', rule: 'МЕС-1 (отвори Ø<100)' },
  CUTOUT_ROUGH: { area: 'Порізка водою', kind: 'Порізка твердих матеріалів водою', unit: 'м.п.', rule: 'ГІПОТЕЗА: виріз ріже вода' },
  CUTOUT_CLEAN: { area: 'Порізка водою', kind: 'Порізка твердих матеріалів водою', unit: 'м.п.', rule: 'ГІПОТЕЗА: виріз ріже вода; кромка мийки — окремо (ПС-19)' },
  POLISH_INNER: { area: 'ЧПК', kind: 'Фрезування твердих матеріалів', unit: 'м.п.', rule: 'МЕС-1 (полірування мийки → Фрезування)' },
  EDGE_POLISH: { area: 'ЧПК', kind: 'Фрезування твердих матеріалів', unit: 'м.п.', rule: 'МЕС-1 (полірування крайки → Фрезування)' },
  EDGE_BEVEL: { area: 'ЧПК', kind: 'Фрезування твердих матеріалів', unit: 'м.п.', rule: 'МЕС-1' },
  EDGE_ROUND: { area: 'ЧПК', kind: 'Фрезування твердих матеріалів', unit: 'м.п.', rule: 'МЕС-1' },
  EDGE_D12: { area: 'ЧПК', kind: 'Фрезування твердих матеріалів', unit: 'м.п.', rule: 'МЕС-1' },
  EDGE_PROFILE_MILL: { area: 'ЧПК', kind: 'Фрезування твердих матеріалів', unit: 'м.п.', rule: 'МЕС-1' },
  EDGE_MANUAL_FINISH: { area: 'Шліфування', kind: 'Шліфування / полірування водою', unit: 'м.п.', rule: 'МЕС-1 (ручна фаска, R2)' },
  GLUING_STRAIGHT: { area: 'ЧПК', kind: 'Фрезування твердих матеріалів', unit: 'м.п.', rule: 'МЕС-1 (фрезування стика); Р1С-14: стик = 4 рядки — борг' },
  JOINT_SAWCUT: { area: 'Шліфування', kind: 'Шліфування / полірування водою', unit: 'шт', rule: 'МЕС-1 (пропили для стику)' },
  GLUING_45: { area: 'Поклейка крайки', kind: 'Поклейка деталей', unit: 'м.п.', rule: 'МЕС-1 (опуск/підворот)' },
  CORNER_RADIUS: { area: 'ЧПК', kind: 'Фрезування твердих матеріалів', unit: 'шт', rule: 'ГІПОТЕЗА: кут — ЧПК' },
  CORNER_CHAMFER: { area: 'Порізка водою', kind: 'Порізка твердих матеріалів водою', unit: 'шт', rule: 'кейс 81-1430086: виріз кута під цоколь — водою; для фаски кута — ГІПОТЕЗА' },
};

const RADIUS_ROUTE: RouteEntry = { area: 'ЧПК', kind: 'Фрезування твердих матеріалів', unit: 'шт', rule: 'ГІПОТЕЗА: радіусний елемент — ЧПК' };

function routeOf(serviceId: string): RouteEntry | undefined {
  if (SERVICE_ROUTE[serviceId]) return SERVICE_ROUTE[serviceId];
  if (serviceId.startsWith('RADIUS_')) return RADIUS_ROUTE;
  return undefined;
}

export interface TechOperation {
  serviceId: string;
  code?: string;
  name: string;
  qty: number;
  unit: MesUnit;
  kind: WorkKind;
  rule: string;
  detailIds: string[];
}

export interface TechSection { area: ShopArea; ops: TechOperation[] }

export interface MesRow { kind: WorkKind; unit: MesUnit; qty: number; sources: string[] }

export interface TechCard {
  header: {
    orderNumber: string;
    customer: string;
    material: string;
    thickness: number | undefined;
    areaM2: number;
    slabs: number;
    productNames: string[];
    date: string;
  };
  sections: TechSection[];
  mes: MesRow[];
  /** Послуги, для яких у мапі немає ділянки — показуємо, а не ховаємо. */
  unrouted: EstimateLine[];
  /** Матеріали (МЕС-4) — вхід складу, не операція. */
  materials: EstimateLine[];
  notes: string[];
}

const unitLabel = (u: EstimateLine['unit']): MesUnit => (u === 'm' ? 'м.п.' : u === 'm2' ? 'м²' : u === 'pcs' ? 'шт' : 'шт');

export function buildTechCard(project: Project, estimate: EstimateResult): TechCard {
  const byArea = new Map<ShopArea, TechOperation[]>();
  const unrouted: EstimateLine[] = [];
  const materials: EstimateLine[] = [];
  const notes: string[] = [];

  for (const line of estimate.lines) {
    if (line.category === 'material' || line.serviceId.startsWith('MATERIAL_')) { materials.push(line); continue; }
    if (line.category === 'engineering') continue; // замір, креслення, монтаж — не цех
    const route = routeOf(line.serviceId);
    if (!route) { unrouted.push(line); continue; }
    const op: TechOperation = {
      serviceId: line.serviceId,
      code: line.externalId,
      name: line.name,
      qty: round3(line.quantity),
      unit: route.unit === 'шт' && line.unit !== 'pcs' ? unitLabel(line.unit) : route.unit,
      kind: route.kind,
      rule: route.rule,
      detailIds: line.detailIds,
    };
    if (!byArea.has(route.area)) byArea.set(route.area, []);
    byArea.get(route.area)!.push(op);
  }

  // Р1С-3 / ПС-1: косметика і пакування — завжди, база = Σ площ деталей
  const areaFact = estimate.factTotals.find((f) => f.kind === 'detail_area');
  const areaM2 = round3(areaFact?.qty ?? 0);
  const slabs = estimate.factTotals.find((f) => f.kind === 'slabs_used')?.qty ?? 0;
  const cosmetics: TechOperation = {
    serviceId: 'COSMETICS', name: 'Косметичні роботи', qty: areaM2, unit: 'м²',
    kind: 'Косметичні роботи', rule: 'Р1С-3 завжди; база Σ площ деталей (ПС-1)', detailIds: [],
  };
  const packing: TechOperation = {
    serviceId: 'PACKING', name: 'Пакування виробу на монтаж', qty: areaM2, unit: 'м²',
    kind: 'Косметичні роботи', rule: 'Р1С-3 (тип «Монтаж»); ПК-1 плівка м²', detailIds: [],
  };
  byArea.set('Косметика', [...(byArea.get('Косметика') ?? []), cosmetics, packing]);

  // ВЦ-16: обпил листа 9,6 м.п. на лист — з розкрою, не з геометрії
  if (slabs > 0) {
    const trim: TechOperation = {
      serviceId: 'SLAB_TRIM', name: 'Обпил листа', qty: round3(9.6 * slabs), unit: 'м.п.',
      kind: 'Порізка твердих матеріалів пилою', rule: 'ВЦ-16: 9,6 м.п. × листів (Р1С-15)', detailIds: [],
    };
    byArea.set('Пильний центр', [trim, ...(byArea.get('Пильний центр') ?? [])]);
  }

  if (unrouted.length) notes.push(`${unrouted.length} послуг без ділянки — див. «Без ділянки»`);
  if (estimate.missingServiceIds.length) notes.push(`послуг поза каталогом: ${estimate.missingServiceIds.join(', ')}`);

  const sections: TechSection[] = SHOP_AREAS
    .filter((a) => (byArea.get(a) ?? []).length > 0)
    .map((area) => ({ area, ops: byArea.get(area)! }));

  // МЕС-1: згортка (вид робіт, одиниця)
  const mesMap = new Map<string, MesRow>();
  for (const s of sections) {
    for (const op of s.ops) {
      const key = `${op.kind}|${op.unit}`;
      const row = mesMap.get(key) ?? { kind: op.kind, unit: op.unit, qty: 0, sources: [] };
      row.qty = round3(row.qty + op.qty);
      row.sources.push(op.code ?? op.serviceId);
      mesMap.set(key, row);
    }
  }

  return {
    header: {
      orderNumber: project.orderNumber || '—',
      customer: project.customer || '—',
      material: project.projectMaterial ?? '—',
      thickness: project.projectThickness,
      areaM2,
      slabs,
      productNames: (project.products ?? []).map((p) => p.name),
      date: new Date().toISOString().slice(0, 10),
    },
    sections,
    mes: [...mesMap.values()],
    unrouted,
    materials,
    notes,
  };
}

export function round3(v: number) { return Math.round(v * 1000) / 1000; }
