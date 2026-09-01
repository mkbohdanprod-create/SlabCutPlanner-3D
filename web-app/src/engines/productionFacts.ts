// =====================================================================
//  src/engines/productionFacts.ts
//  Рушій виробничих фактів.
//
//  Факт — це величина, яку можна перевірити лінійкою: метри різу, штуки
//  отворів, метри крайки, площа, кількість слябів. Факт НЕ знає ані про
//  ціни, ані про номенклатуру 1С. Саме тому він тут окремо: перелік
//  послуг ВіярПро прив'язаний до конкретних верстатів і подвоєний за
//  матеріалом, і якби геометрія знала про ID 219964, обміняти облікову
//  систему означало б переписати рушій.
//
//  Шар над цим модулем (domain/serviceMapping.ts, крок 3) перекладає
//  факти в позиції прайсу. Шар над ним — кошторис і КП.
//
//  Модуль чистий: domain/types + engines/geometryUtils, жодного store,
//  React чи налаштувань користувача.
// =====================================================================

import type {
  CornerProcessing,
  Detail,
  DetailPart,
  Joint,
  MaterialType,
  Point,
  Product,
  ProductElement,
  Project,
} from '../domain/types';
import { edgeTreatmentLengthMm, edgeTreatmentProfiles } from '../domain/edgeTreatment';
import {
  classifyRadiusMatrix,
  classifyRadiusService,
  cornerArcLengthMm,
  radiusMatrixKey,
  radiusMethodFor,
  radiusRoleForType,
  type RadiusMatrixKind,
} from '../domain/radiusElement';
import {
  edgeLengthForSide,
  pointsBounds,
  polygonAxisLength,
  polygonNonAxisLength,
  polygonPerimeter,
} from './geometryUtils';

// ── Типи ─────────────────────────────────────────────────────────────

export type FactUnit = 'm' | 'm2' | 'pcs';

export type ProductionFactKind =
  /** Прямолінійний різ диском, м.п. */
  | 'saw_cut'
  /** Криволінійний різ водою по зовнішньому контуру, м.п. */
  | 'waterjet_cut'
  /** Периметр внутрішнього прямокутного вирізу, м.п. */
  | 'cutout_perimeter'
  /** Круглий отвір діаметром до 100 мм, шт */
  | 'hole_small'
  /** Круглий отвір діаметром понад 100 мм, м.п. периметра */
  | 'hole_large'
  /** Фрезерування торця, м.п. Variant — id профілю крайки */
  | 'edge'
  /** Ручна доводка торця, м.п. Позначається галочкою на стороні */
  | 'edge_manual_finish'
  /** Довжина стику, м.п. Variant — тип стику */
  | 'joint_length'
  /** Стик як штука. Variant — 'lt500' | 'gt500' */
  | 'joint_count'
  /** Оброблений кут, шт. Variant — 'radius' | 'chamfer' | 'l-cut' */
  | 'corner'
  /** Чиста площа деталей, м² */
  | 'detail_area'
  /** Кількість задіяних слябів, шт */
  | 'slabs_used'
  /** Площа задіяних слябів, м² */
  | 'slab_area'
  /** Відхід: площа слябів мінус площа деталей, м² */
  | 'waste_area'
  /** Радіусний елемент як штука. Variant — категорія з domain/radiusElement */
  | 'radius_element'
  /** Матриця для гнуття, штука. Variant — категорія матриці */
  | 'radius_matrix';

export interface FactRef {
  /**
   * Вид факту. Сам рушій його не заповнює — це робить шар прив'язок,
   * щоб підсвітка на карті крою знала, ЩО малювати: різ пилою — це
   * осьові ділянки контуру, різ водою — навпаки, тільки криві.
   */
  factKind?: ProductionFactKind;
  detailId?: string;
  partId?: string;
  productId?: string;
  elementPath?: string;
  side?: string;
  cornerId?: string;
  /**
   * Друга прив'язка стику. Стик живе на ДВОХ деталях одночасно, і
   * підсвітка має показати лінію на обох — а не обводити цілі контури.
   */
  elementPathB?: string;
  sideB?: string;
  /** Ділянка стику вздовж сторони, мм від початку сторони */
  fromMm?: number;
  toMm?: number;
  fromMmB?: number;
  toMmB?: number;
  cutoutIndex?: number;
  slabId?: string;
}

export interface ProductionFact {
  kind: ProductionFactKind;
  qty: number;
  unit: FactUnit;
  /** Уточнення в межах виду: id профілю крайки, тип стику, тип кута */
  variant?: string;
  ref?: FactRef;
}

export interface ProductionFactsOptions {
  /**
   * Деталі проєкту. За замовчуванням `project.details`, але у виробах
   * деталі живуть у дереві `project.products`, і викликач має передати
   * сюди результат `getAllProjectDetails(project)` — інакше крайки
   * виробів у факти не потраплять.
   */
  details?: Detail[];
}

// ── Дрібна математика ────────────────────────────────────────────────

/** мм → м, з округленням до 0.1 мм. Менше — це шум після поворотів. */
function mm2m(valueMm: number) {
  return Math.round((Number.isFinite(valueMm) ? valueMm : 0) * 10) / 10 / 1000;
}

/** мм² → м², до 4 знаків */
function mm2ToM2(valueMm2: number) {
  return Math.round((Number.isFinite(valueMm2) ? valueMm2 : 0) / 100) / 10000;
}

/** Округлення до 0.0001 — спільне для всіх площ і сум */
function round4(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 10000) / 10000;
}

/** Поріг, за яким круглий отвір переходить з «шт» у «м.п.» (SERVICES_LIST 195310/195311) */
export const HOLE_SIZE_THRESHOLD_MM = 100;

/** Поріг довжини стику для послуг «пропил для стику» (195361 / 195362) */
export const JOINT_LENGTH_THRESHOLD_MM = 500;

/**
 * Чи схожий полігон на коло.
 *
 * Круглі отвори і прямокутні вирізи оплачуються по-різному: коло до
 * 100 мм — штука, прямокутний виріз — периметр. У полігоні різниця
 * видна: у кола всі вершини рівновіддалені від центра.
 */
export function isCircleLike(points: Point[], tolerance = 0.08): boolean {
  if (points.length < 8) return false;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  let min = Infinity;
  let max = 0;
  for (const p of points) {
    const r = Math.hypot(p.x - cx, p.y - cy);
    if (r < min) min = r;
    if (r > max) max = r;
  }
  if (max <= 0) return false;
  return (max - min) / max <= tolerance;
}

/** Діаметр описаного габариту отвору, мм */
function holeSizeMm(points: Point[]) {
  const b = pointsBounds(points);
  return Math.max(b.width, b.height);
}

// ── Обхід дерева виробу ──────────────────────────────────────────────

type ElementVisit = {
  productId: string;
  path: string;
  element: ProductElement;
};

function walkElements(products: Product[] | undefined): ElementVisit[] {
  const out: ElementVisit[] = [];
  const visit = (productId: string, element: ProductElement, path: string) => {
    out.push({ productId, path, element });
    (element.additions ?? []).forEach((child, index) => {
      visit(productId, child, `${path}/${child.id ?? index}`);
    });
  };
  (products ?? []).forEach((product) => {
    (product.elements ?? []).forEach((element, index) => {
      visit(product.id, element, `${product.id}/${element.id ?? index}`);
    });
  });
  return out;
}

/** Довжина стику з прив'язок, мм. `from`/`to` — координати вздовж сторони. */
export function jointLengthMm(joint: Joint): number {
  const a = joint.a;
  const b = joint.b;
  const lenA = a && a.from !== undefined && a.to !== undefined ? Math.abs(a.to - a.from) : 0;
  const lenB = b && b.from !== undefined && b.to !== undefined ? Math.abs(b.to - b.from) : 0;
  // Стик — це спільна ділянка двох сторін. Беремо меншу з двох: довший
  // бік може виступати за межі стику (Г-подібне з'єднання).
  if (lenA > 0 && lenB > 0) return Math.min(lenA, lenB);
  return Math.max(lenA, lenB);
}

// ── Головна функція ──────────────────────────────────────────────────

export function extractProductionFacts(
  project: Project,
  parts: DetailPart[],
  options: ProductionFactsOptions = {},
): ProductionFact[] {
  const facts: ProductionFact[] = [];
  const push = (fact: ProductionFact) => {
    if (!Number.isFinite(fact.qty) || fact.qty <= 0) return;
    facts.push(fact);
  };

  const details = options.details ?? project.details ?? [];
  const detailsById = new Map(details.map((detail) => [detail.id, detail]));

  const mainParts = (parts ?? []).filter((part) => part.isMain);
  // Доповнення (підворот, потовщення) ріжуться так само, як деталі:
  // їхній контур теж проходить пилою і водою.
  const allParts = (parts ?? []).filter((part) => part.points?.length >= 3);

  // ── 1. Різ по зовнішньому контуру ──────────────────────────────────
  allParts.forEach((part) => {
    const ref: FactRef = { partId: part.id, detailId: part.detailId };
    push({ kind: 'saw_cut', qty: mm2m(polygonAxisLength(part.points)), unit: 'm', ref });
    push({ kind: 'waterjet_cut', qty: mm2m(polygonNonAxisLength(part.points)), unit: 'm', ref });
  });

  // ── 2. Внутрішні вирізи й отвори ───────────────────────────────────
  allParts.forEach((part) => {
    (part.holes ?? []).forEach((hole, cutoutIndex) => {
      if (!hole || hole.length < 3) return;
      const ref: FactRef = { partId: part.id, detailId: part.detailId, cutoutIndex };
      const perimeterMm = polygonPerimeter(hole);

      if (isCircleLike(hole)) {
        const sizeMm = holeSizeMm(hole);
        if (sizeMm < HOLE_SIZE_THRESHOLD_MM) {
          push({ kind: 'hole_small', qty: 1, unit: 'pcs', ref });
        } else {
          push({ kind: 'hole_large', qty: mm2m(perimeterMm), unit: 'm', ref });
        }
      } else {
        push({ kind: 'cutout_perimeter', qty: mm2m(perimeterMm), unit: 'm', ref });
      }
    });
  });

  // ── 3. Обробка торця ───────────────────────────────────────────────
  //  Пріоритет у розміщення: користувач міг перевизначити крайку прямо
  //  на карті крою. Якщо там нічого — беремо з деталі.
  const treatmentsByPartId = new Map<string, Record<string, unknown>>();
  (project.placements ?? []).forEach((placement) => {
    if (placement.edgeProfiles && Object.keys(placement.edgeProfiles).length > 0) {
      treatmentsByPartId.set(placement.partId, placement.edgeProfiles as Record<string, unknown>);
    }
  });

  mainParts.forEach((part) => {
    const fromPlacement = treatmentsByPartId.get(part.id);
    const fromDetail = detailsById.get(part.detailId)?.edgeProfiles as Record<string, unknown> | undefined;
    const source = fromPlacement ?? fromDetail;
    if (!source) return;

    Object.entries(source).forEach(([side, raw]) => {
      if (!raw) return;
      // Крайка задається або рядком (старий формат), або EdgeTreatment
      // з лицьовим і тильним ребром — обидва ребра фрезеруються окремо.
      // Розбір — спільним нормалізатором, щоб кошторис і позначка на
      // кресленні рахували ту саму ділянку.
      const profileIds = edgeTreatmentProfiles(raw as Parameters<typeof edgeTreatmentProfiles>[0]);
      if (!profileIds.length) return;

      // Довжина — РЕАЛЬНА ділянка обробки, а не вся сторона. «Довільна,
      // 300 мм» раніше все одно нараховувалась цеху на повне ребро.
      const sideLengthMm = edgeLengthForSide(part, side);
      const lengthMm = edgeTreatmentLengthMm(raw as Parameters<typeof edgeTreatmentLengthMm>[0], sideLengthMm);
      if (lengthMm <= 0) return;
      profileIds.forEach((profileId) => {
        push({
          kind: 'edge',
          qty: mm2m(lengthMm),
          unit: 'm',
          variant: profileId,
          ref: { partId: part.id, detailId: part.detailId, side },
        });
      });

      // Галочка «ручна доводка» на стороні. До цього вона не давала нічого:
      // гілка в старому рушії зверталась до послуги MANUAL_FINISH, якої в
      // каталозі не існувало, тому робота не нараховувалась узагалі.
      if (typeof raw === 'object' && (raw as { manualFinish?: boolean }).manualFinish) {
        push({
          kind: 'edge_manual_finish',
          qty: mm2m(lengthMm),
          unit: 'm',
          ref: { partId: part.id, detailId: part.detailId, side },
        });
      }
    });
  });

  // ── 4. Стики ───────────────────────────────────────────────────────
  //  Джерело — дерево виробу, а не контури: стик існує між двома
  //  сторонами й у геометрії парта вже «зашитий» у різ.
  const seenJoints = new Set<string>();
  walkElements(project.products).forEach(({ productId, path, element }) => {
    (element.joints ?? []).forEach((joint, index) => {
      const key = joint.id ?? `${path}#${index}`;
      if (seenJoints.has(key)) return;
      seenJoints.add(key);

      const lengthMm = jointLengthMm(joint);
      if (lengthMm <= 0) return;
      // Прив'язки СТОРІН, а не елемент-власник стику: підсвітці на карті
      // крою потрібно знати, де саме на кожній із двох деталей він проходить.
      const ref: FactRef = {
        productId,
        elementPath: joint.a?.elementPath ?? path,
        side: joint.a?.sideId,
        fromMm: joint.a ? Math.min(joint.a.from, joint.a.to) : undefined,
        toMm: joint.a ? Math.max(joint.a.from, joint.a.to) : undefined,
        elementPathB: joint.b?.elementPath,
        sideB: joint.b?.sideId,
        fromMmB: joint.b ? Math.min(joint.b.from, joint.b.to) : undefined,
        toMmB: joint.b ? Math.max(joint.b.from, joint.b.to) : undefined,
      };

      push({ kind: 'joint_length', qty: mm2m(lengthMm), unit: 'm', variant: joint.type, ref });
      push({
        kind: 'joint_count',
        qty: 1,
        unit: 'pcs',
        variant: lengthMm < JOINT_LENGTH_THRESHOLD_MM ? 'lt500' : 'gt500',
        ref,
      });
    });
  });

  // ── 4b. Шви ВСЕРЕДИНІ деталі (SC-02) ───────────────────────────────
  //  Стик, яким деталь розрізали навпіл, — це теж шов: цех його пиляє і
  //  клеїть. Але в дереві виробу його немає (там живуть лише стики МІЖ
  //  елементами), тому раніше кутовий стик Г-форми і будь-який довільний
  //  стик не давали ані склейки, ані пропилу — цех робив, компанія не
  //  виставляла. Джерело правди тут — сам різ: довжину шва рушій кладе на
  //  парт у `jointSeams`, по одному носію на шов, щоб не порахувати двічі.
  mainParts.forEach((part) => {
    (part.jointSeams ?? []).forEach((seam) => {
      const lengthMm = seam.lengthMm;
      if (!(lengthMm > 0)) return;
      const ref: FactRef = { partId: part.id, detailId: part.detailId };
      push({
        kind: 'joint_length',
        qty: mm2m(lengthMm),
        unit: 'm',
        variant: seam.jointType ?? 'butt',
        ref,
      });
      push({
        kind: 'joint_count',
        qty: 1,
        unit: 'pcs',
        variant: lengthMm < JOINT_LENGTH_THRESHOLD_MM ? 'lt500' : 'gt500',
        ref,
      });
    });
  });

  // ── 5. Оброблені кути ──────────────────────────────────────────────
  walkElements(project.products).forEach(({ productId, path, element }) => {
    const corners = element.baseDefinition?.corners as Record<string, CornerProcessing> | undefined;
    Object.entries(corners ?? {}).forEach(([cornerId, corner]) => {
      if (!corner?.type) return;
      push({
        kind: 'corner',
        qty: 1,
        unit: 'pcs',
        variant: corner.type,
        ref: { productId, elementPath: path, cornerId },
      });
    });
  });

  details.forEach((detail) => {
    const corners = detail.geometry?.corners as Record<string, CornerProcessing> | undefined;
    if (!corners) return;
    // У деталей із виробу кути вже пораховані вище через дерево елементів.
    if (detail.isProduct) return;
    Object.entries(corners).forEach(([cornerId, corner]) => {
      if (!corner?.type) return;
      push({
        kind: 'corner',
        qty: 1,
        unit: 'pcs',
        variant: corner.type,
        ref: { detailId: detail.id, cornerId },
      });
    });
  });

  // ── 5a. Торець на дугах, фасках і вирізах (FG-22) ──────────────────
  //  Галочка «Обробка торців» у вікні кута і вікні вирізу існувала давно,
  //  але не давала НІЧОГО: метри дуг, фасок і периметрів вирізів не
  //  потрапляли ані в кошторис, ані в завдання цеху — клієнту виставлялось
  //  менше, ніж робилось. Тепер кожна така галочка дає факт `edge` зі
  //  своєю довжиною: дуга — по зовнішньому радіусу, фаска — гіпотенузою,
  //  Г-заріз — двома полицями, виріз — периметром.
  details.forEach((detail) => {
    const detailRef = { detailId: detail.id };

    Object.entries(detail.geometry?.corners ?? {}).forEach(([cornerId, corner]) => {
      if (!corner?.edgeProcessing || corner.edgeProcessing === 'Без фрезерування') return;
      let lengthMm = 0;
      if (corner.type === 'radius') lengthMm = cornerArcLengthMm(corner.radius ?? 0);
      else if (corner.type === 'chamfer') lengthMm = Math.hypot(corner.sizeB ?? 0, corner.sizeC ?? 0);
      else if (corner.type === 'l-cut') lengthMm = (corner.sizeB ?? 0) + (corner.sizeC ?? 0);
      if (lengthMm <= 0) return;
      push({
        kind: 'edge',
        qty: mm2m(lengthMm),
        unit: 'm',
        variant: corner.edgeProcessing,
        ref: { ...detailRef, cornerId },
      });
    });

    Object.entries(detail.geometry?.cutouts ?? {}).forEach(([cutoutId, cutout], index) => {
      if (!cutout?.edgeProcessing || cutout.edgeProcessing === 'Без фрезерування') return;
      const lengthMm = cutout.shape === 'circle'
        ? 2 * Math.PI * (cutout.radius ?? 0)
        : 2 * ((cutout.width ?? 0) + (cutout.height ?? 0));
      if (lengthMm <= 0) return;
      void cutoutId;
      push({
        kind: 'edge',
        qty: mm2m(lengthMm),
        unit: 'm',
        variant: cutout.edgeProcessing,
        ref: { ...detailRef, cutoutIndex: index },
      });
    });
  });

  // ── 5b. Радіусні (гнуті) елементи ──────────────────────────────────
  //  ТЗ від 19.08.2026. Послуга — ЗА ШТУКУ на кожен елемент; категорію
  //  визначає матеріал (камінь ріжуть сегментами, акрил гнуть), роль
  //  (край стільниці чи опора) і розмір. Матеріал самої деталі сюди не
  //  входить — він уже порахований по прямокутнику в розкрої.
  //
  //  Матриця для гнуття рахується ОКРЕМО і не за кількістю радіусів, а за
  //  кількістю унікальних геометрій: чотири однакові R500 гнуть на одній
  //  матриці. Тому дедуплікація тут, на рівні всього проєкту, а не парта.
  const projectMaterial = project.projectMaterial as MaterialType | undefined;
  const matrixSeen = new Map<string, RadiusMatrixKind>();

  allParts.forEach((part) => {
    const mark = part.radiusElement;
    if (!mark) return;

    const method = mark.method ?? radiusMethodFor(projectMaterial);
    const role = mark.role ?? radiusRoleForType(part.type);
    const bandSizeMm = mark.bandSizeMm ?? Math.min(part.width, part.height);
    const classifyInput = {
      method,
      role,
      bandSizeMm,
      radiusMm: mark.radiusMm,
      complex: mark.complex,
    };

    const ref: FactRef = { partId: part.id, detailId: part.detailId, cornerId: mark.cornerId };
    push({
      kind: 'radius_element',
      qty: 1,
      unit: 'pcs',
      variant: classifyRadiusService(classifyInput),
      ref,
    });

    if (method !== 'bending') return;
    const key = radiusMatrixKey({
      radiusMm: mark.radiusMm,
      bandSizeMm,
      arcAngleDeg: mark.arcAngleDeg ?? 90,
      complex: mark.complex,
    });
    if (!matrixSeen.has(key)) matrixSeen.set(key, classifyRadiusMatrix(classifyInput));
  });

  // Одна матриця на кожну унікальну геометрію (ТЗ, п. 3.4).
  const matrixByKind = new Map<RadiusMatrixKind, number>();
  matrixSeen.forEach((kind) => matrixByKind.set(kind, (matrixByKind.get(kind) ?? 0) + 1));
  matrixByKind.forEach((qty, kind) => {
    push({ kind: 'radius_matrix', qty, unit: 'pcs', variant: kind });
  });

  // ── 6. Площі й матеріал ────────────────────────────────────────────
  // DetailPart.area рушій геометрії віддає вже в м² (geometry.ts:454),
  // тому перерахунок тут не потрібен — і не повинен з'явитися.
  const detailAreaM2 = round4(mainParts.reduce((sum, part) => sum + (part.area ?? 0), 0));
  push({ kind: 'detail_area', qty: detailAreaM2, unit: 'm2' });

  const usedSlabIds = new Set((project.placements ?? []).map((placement) => placement.slabId).filter(Boolean));
  const usedSlabs = (project.slabs ?? []).filter((slab) => usedSlabIds.has(slab.id));
  const effectiveSlabs = usedSlabs.length ? usedSlabs : (project.slabs ?? []);

  push({ kind: 'slabs_used', qty: effectiveSlabs.length, unit: 'pcs' });

  const slabAreaM2 = round4(effectiveSlabs.reduce((sum, slab) => sum + mm2ToM2(slab.width * slab.height), 0));
  push({ kind: 'slab_area', qty: slabAreaM2, unit: 'm2' });

  // Відхід — не «коефіцієнт 1.2», а різниця між закупленим і використаним.
  push({ kind: 'waste_area', qty: round4(slabAreaM2 - detailAreaM2), unit: 'm2' });

  return facts;
}

// ── Зведення ─────────────────────────────────────────────────────────

export interface FactTotal {
  kind: ProductionFactKind;
  variant?: string;
  unit: FactUnit;
  qty: number;
  count: number;
}

/** Згортає факти по (kind, variant). Порядок стабільний — зручно для тестів. */
export function summarizeFacts(facts: ProductionFact[]): FactTotal[] {
  const byKey = new Map<string, FactTotal>();
  facts.forEach((fact) => {
    const key = `${fact.kind}|${fact.variant ?? ''}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += fact.qty;
      existing.count += 1;
    } else {
      byKey.set(key, { kind: fact.kind, variant: fact.variant, unit: fact.unit, qty: fact.qty, count: 1 });
    }
  });
  return [...byKey.values()].map((total) => ({
    ...total,
    qty: Math.round(total.qty * 10000) / 10000,
  }));
}

/** Сума кількості за видом факту (і, за потреби, конкретним variant). */
export function sumFacts(facts: ProductionFact[], kind: ProductionFactKind, variant?: string): number {
  const sum = facts
    .filter((fact) => fact.kind === kind && (variant === undefined || fact.variant === variant))
    .reduce((acc, fact) => acc + fact.qty, 0);
  return Math.round(sum * 10000) / 10000;
}

/** Матеріал проєкту — потрібен шару відповідності, щоб обрати ID послуги. */
export function projectMaterial(project: Project): MaterialType | undefined {
  return project.projectMaterial as MaterialType | undefined;
}
