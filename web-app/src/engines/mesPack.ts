// =====================================================================
//  src/engines/mesPack.ts
//  №174 · «Зберегти для МЕС» — повний пакет vs3d-pack-1 одним ZIP.
//
//  Канал 2 інтеграції з МЕС (C:\Works\MES\smart-factory-mes): якщо
//  mes-aps-1 (apsExport.ts) — це рядки BOM у чергу, то цей модуль пакує
//  ВСЕ, що знає проєкт: слеби з фото і дефектами, розкрій з дзеркальністю,
//  виробничі факти, кошторис і сам файл проєкту. ZIP кладеться руками в
//  C:\Works\MES\integration\inbox — так домовлено з МЕС 10.09.2026
//  (docs/VS3D_HANDOFF_2026-09-10.md): папка-скринька, без авто-імпорту,
//  бо ліміт 5 МБ /api/aps/command для фото й моделей не годиться.
//
//  Свідомі рішення:
//   · null для НЕВІДОМОГО і ніколи не нуль; порожній список — [], бо це
//     не «невідомо», а «відомо, що нічого немає» (уточнення МЕС 10.09);
//   · дефект несе kind, захисний відступ і походження (№176), але
//     `verified:false`, поки фото не калібровано;
//   · часу операцій немає ніде — норми рахує МЕС;
//   · склейки цеху — окремою картою (`assemblyPlan`, №178): без неї
//     двадцять заготовок не відрізнити від шести елементів на монтаж;
//   · документи і моделі мають явні ролі — плоскі заготовки не видаються
//     за зібраний виріб.
//
//  ZIP пишеться власним мінімальним письменником (метод STORE, без
//  стиснення): фото — уже стиснутий JPEG, а тягнути бібліотеку заради
//  заголовків архіву не варто. Імена файлів — UTF-8 (прапорець 0x0800).
// =====================================================================

import type { Detail, DetailPart, Project } from '../domain/types';
import { VIYAR_MAPPING_RULES } from '../domain/viyarMapping';
import { buildAssemblyPlan, type AssemblyPlan } from './assemblyPlan';
import type { EstimateLine } from './estimate';
import { extractProductionFacts } from './productionFacts';
import { AUTO_DEFECT_PREFIX } from './slabOutline';

export const MES_PACK_SCHEMA = 'vs3d-pack-1';

// ── CRC32 (поліном ZIP) ─────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ── мінімальний ZIP: метод STORE, імена UTF-8 ───────────────────────

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** ZIP без стиснення. Повертає один Uint8Array — вміст архіву. */
export function zipStore(entries: ZipEntry[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const u16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true);
  const u32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true);

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0);
    u16(lv, 10, time); u16(lv, 12, date); u32(lv, 14, crc);
    u32(lv, 18, entry.data.length); u32(lv, 22, entry.data.length);
    u16(lv, 26, name.length); u16(lv, 28, 0);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0);
    u16(cv, 12, time); u16(cv, 14, date); u32(cv, 16, crc);
    u32(cv, 20, entry.data.length); u32(cv, 24, entry.data.length);
    u16(cv, 28, name.length);
    u32(cv, 42, offset);
    central.set(name, 46);

    localParts.push(local, entry.data);
    centralParts.push(central);
    offset += local.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  u32(ev, 0, 0x06054b50);
  u16(ev, 8, entries.length); u16(ev, 10, entries.length);
  u32(ev, 12, centralSize); u32(ev, 16, offset);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

// ── збірка пакета ───────────────────────────────────────────────────

export interface MesPackExtraFile {
  /** Шлях усередині ZIP, наприклад `docs/drawings.pdf`. */
  path: string;
  data: Uint8Array;
  /** Що це — рядок іде в manifest.files[].purpose як є. */
  purpose: string;
  /**
   * Семантика документа для реєстру `order.json.documents`: за нею МЕС
   * показує потрібний аркуш на конкретній операції, а не «якийсь PDF».
   */
  document?: { id: string; kind: 'drawing' | 'technology' | 'workshop_form' | 'package' };
  /** Роль моделі — плоскі заготовки й зібраний виріб плутати не можна. */
  modelRole?: 'assembled_product' | 'flat_parts' | 'shop_assembly';
  /** Стабільний id моделі в реєстрі `order.json.models` (product-model, parts-model, unit-model:*). */
  modelId?: string;
  /** Для shop_assembly — вузол із assemblyPlan, який ця модель показує. */
  unitId?: string;
}

export interface MesPackInput {
  project: Project;
  /** Заготовки розкрою (парти) зі стора — саме на них посилаються placements. */
  parts: DetailPart[];
  /** Деталі проєкту (getAllProjectDetails) — рушій фактів вимагає їх явно. */
  details: Detail[];
  /** Рядки вже порахованого кошторису з панелі. */
  estimateLines: EstimateLine[];
  /**
   * Готові документи від викликача: пакет для цеху (PDF), чернетка JSON
   * конструктора тощо. Рушій сам їх не генерує — креслення живуть у UI
   * (jsPDF + DOM), а межу «ядро не тягне екранів» ніхто не скасовував.
   */
  extraFiles?: MesPackExtraFile[];
  appVersion?: string;
}

export interface MesPackResult {
  zip: Uint8Array;
  fileName: string;
  /** Що НЕ потрапило в пакет і чому — показується користувачу як є. */
  warnings: string[];
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** data:image/...;base64,... → байти; будь-що інше — null (не тягнемо мережу). */
function dataUrlBytes(url: string): { bytes: Uint8Array; ext: string } | null {
  const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(url);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const ext = match[1].toLowerCase() === 'png' ? 'png' : match[1].toLowerCase() === 'webp' ? 'webp' : 'jpg';
  return { bytes, ext };
}

/**
 * Чому пакет може бути неготовим до запуску — списком, зрозумілим людині
 * і машині. МЕС просив (10.09): не мовчати про порожні коди 1С, статус
 * розрахунку і непідтверджені дефекти, а називати причину.
 */
export interface MesPackIssue {
  code: string;
  severity: 'blocker' | 'warning';
  message: string;
  fix?: string;
}

export function collectPackIssues(input: MesPackInput, assemblyPlan?: AssemblyPlan): MesPackIssue[] {
  const { project, estimateLines } = input;
  const issues: MesPackIssue[] = [];

  // Склейка, яку ми вивели, а не прочитали з моделі: МЕС має знати, що
  // саме тут наш висновок, і звірити його перед запуском.
  assemblyPlan?.joins
    .filter((join) => join.basis === 'assumption')
    .forEach((join) => {
      issues.push({
        code: 'assembly-assumption',
        severity: 'warning',
        message: `Склейка «${join.name}» (${join.id}) виведена нами, а не задана в моделі.`,
        fix: join.basisNote,
      });
    });
  assemblyPlan?.unresolved.forEach((item) => {
    issues.push({
      code: `assembly-unresolved:${item.code}`,
      severity: 'warning',
      message: item.message,
      fix: item.candidates.length ? `кандидати: ${item.candidates.join(', ')}` : undefined,
    });
  });
  assemblyPlan?.notes.forEach((note) => {
    issues.push({ code: 'assembly-note', severity: /ПОМИЛКА/.test(note) ? 'blocker' : 'warning', message: note });
  });

  // Документи: якщо типу немає — назвати відсутній тип, а не мовчати
  // і не підсовувати порожній PDF (пряма вимога МЕС).
  const kinds = new Set((input.extraFiles ?? []).map((file) => file.document?.kind).filter(Boolean));
  if (input.extraFiles?.length) {
    ([['drawing', 'креслення'], ['technology', 'тех карта'], ['workshop_form', 'бланк цеху']] as const)
      .filter(([kind]) => !kinds.has(kind))
      .forEach(([kind, label]) => {
        issues.push({
          code: `document-missing:${kind}`,
          severity: 'warning',
          message: `У пакеті немає документа типу «${label}».`,
          fix: 'Документ збирається у вкладці «Документи»; якщо він порожній — у проєкті немає відповідних даних.',
        });
      });
  }

  const noCode = estimateLines.filter((line) => !line.externalId);
  if (noCode.length) {
    issues.push({
      code: 'no-1c-codes',
      severity: 'blocker',
      message: `Рядків без коду 1С: ${noCode.length} з ${estimateLines.length} (${noCode.map((line) => line.serviceId).join(', ')}).`,
      fix: 'Налаштування → Прив\'язки послуг → «Перевести на коди ВіярПро». У коробці ці прив\'язки вимкнені: частина з них — трактування прайсу, і керівник має їх звірити. Матеріал і монтаж коду ВіярПро не мають взагалі — їх у прайсі цеху немає.',
    });
  }

  // 'success' — єдиний статус, при якому розкрій вважається зведеним;
  // 'packing' означає «рахується просто зараз», решта — проблема.
  if (project.calculationStatus !== 'success') {
    const conflicts = project.placements.filter((placement) => placement.conflict || placement.outOfBounds);
    const reasons = Object.entries(project.unplacedReasons ?? {}).map(([partId, reason]) => `${partId}: ${reason}`);
    issues.push({
      code: 'calculation-not-ok',
      severity: 'blocker',
      message: `calculationStatus = ${project.calculationStatus}. Розміщень із конфліктом: ${conflicts.length}; нерозміщених заготовок: ${project.unplacedPartIds.length}.`,
      fix: reasons.length
        ? `Причини від розкрою: ${reasons.join(' · ')}`
        : conflicts.length
          ? `Конфліктні розміщення: ${conflicts.map((placement) => placement.id).join(', ')} — перекласти на дошці «2D Розкрій».`
          : 'Відкрити «2D Розкрій» і перерахувати розкладку.',
    });
  }

  project.slabs.forEach((slab, index) => {
    const label = slab.serialNumber || slab.article || `слеб ${index + 1}`;
    if (!slab.decor || /уточнити|невідом|\?\?/i.test(slab.decor)) {
      issues.push({
        code: 'decor-unknown',
        severity: 'warning',
        message: `Декор слеба ${label} не названий точно: «${slab.decor || '—'}».`,
        fix: 'Вибрати слеб із каталогу (артикул підтягнеться) або вписати назву декора руками.',
      });
    }
    const autoDefects = slab.defects.filter((zone) => zone.id.startsWith(AUTO_DEFECT_PREFIX));
    if (autoDefects.length && !slabPhotoAvailable(slab.photo)) {
      issues.push({
        code: 'defect-photo-missing',
        severity: 'warning',
        message: `Слеб ${label}: дефект(и) ${autoDefects.map((zone) => zone.id).join(', ')} обчислені з фото листа, але саме фото в проєкт не вбудоване — у пакеті його немає.`,
        fix: 'Фото приходить із каталогу слебів посиланням. Щоб воно поїхало в МЕС, слеб має бути з фото у проєкті (кнопка фото на дошці) — тоді знімок ляже в slabs/.',
      });
    }
  });

  return issues;
}

const slabPhotoAvailable = (photo?: string) => Boolean(photo && photo.trim());

/**
 * Фото слеба за посиланням (каталог/WMS) → байти. Мережевий провал —
 * не помилка пакета: пакет збереться без фото, а користувач побачить,
 * якого саме знімка бракує.
 */
async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; ext: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const type = response.headers.get('content-type') ?? '';
    const ext = /png/i.test(type) ? 'png' : /webp/i.test(type) ? 'webp' : 'jpg';
    return { bytes: new Uint8Array(buffer), ext };
  } catch {
    return null;
  }
}

/**
 * Авторське дерево з instanceId: `part:prod_<виріб>/element:<елемент>/detail:<деталь>:…`.
 * Ідентифікатор Студії несе шлях у дереві сам — тут він лише розкладається
 * на поля, які просив МЕС (§6.1), без вигадування.
 */
export function lineageOf(instanceId: string): { productId: string | null; elementId: string | null; detailId: string | null } {
  const product = /part:prod_([^/]+)\//.exec(instanceId);
  const element = /\/element:([^/]+)\//.exec(instanceId);
  const detail = /\/detail:([^:]+)/.exec(instanceId);
  return {
    productId: product ? `prod_${product[1]}`.replace(/^prod_prod_/, 'prod_') : null,
    elementId: element ? element[1] : null,
    detailId: detail ? detail[1] : null,
  };
}

/** Сторони, які заготовка несе на контурі — ті, що пережили розріз стиком. */
function sidesPresent(part: DetailPart): string[] {
  const sides = new Set<string>();
  (part.points ?? []).forEach((point) => { if (point.sideId) sides.add(point.sideId); });
  return [...sides];
}

export function buildOrderJson(input: MesPackInput, slabPhotoFiles: Record<string, string>): object {
  const { project, parts, details, estimateLines } = input;
  const facts = extractProductionFacts(project, parts, { details });
  const assemblyPlan = buildAssemblyPlan(parts, project.placements, details);
  const issues = collectPackIssues(input, assemblyPlan);
  const viyarEnabled = estimateLines.some((line) => Boolean(line.externalId));

  return {
    schemaVersion: MES_PACK_SCHEMA,
    order: {
      id: project.orderNumber.trim(),
      customer: project.customer || null,
      calculationStatus: project.calculationStatus,
      gates: {
        drawingApproved: false,
        materialReady: false,
        note: 'Студія цих статусів поки не веде окремим полем — за домовленістю з МЕС нездтверджене передається як false, не null',
      },
    },
    /**
     * Чому пакет може не запускатись у МЕС. Порожній масив = зі свого боку
     * Студія питань не має. Це не «попередження про всяк випадок»:
     * blocker означає, що ми самі не вважаємо пакет готовим до запуску.
     */
    issues,
    readyForRun: issues.every((issue) => issue.severity !== 'blocker'),
    coordinateSystem:
      'мм; слеб і деталь: початок — верхній лівий кут, X вправо, Y вниз (рідна система CAD); ' +
      'поворот розміщення кратний 90°; дзеркалення — окремий прапорець mirror, не від\'ємний масштаб',
    products: (project.products ?? []).map((product) => ({
      productId: product.id,
      name: product.name,
      material: product.material ?? null,
    })),
    details: details.map((detail) => ({
      detailId: detail.id,
      slot: detail.slot ?? null,
      type: detail.type,
      label: detail.label ?? null,
      quantity: detail.quantity,
      thicknessMm: detail.thickness,
      widthMm: detail.geometry.width ?? null,
      heightMm: detail.geometry.height ?? null,
    })),
    // Заготовки розкрою: placements.partId вказує саме на instanceId звідси.
    // Контур (points/holes, мм, з дугами через bulge) — повний, щоб МЕС міг
    // намалювати деталь на слебі без DXF; та сама геометрія їде і в project.json.
    parts: parts.map((part) => ({
      instanceId: part.id,
      // partId — спільний ключ ТИПУ заготовки: у Студії однакові заготовки
      // народжуються з однієї деталі, тому partId = detailId. instanceId —
      // конкретна фізична заготовка, на неї і посилається placements.partId
      // (історична назва поля; перейменування — узгоджена зміна, не тиха).
      partId: part.detailId,
      detailId: part.detailId,
      name: part.name,
      parentLabel: part.parentLabel || null,
      isMain: part.isMain,
      // Авторське дерево (виріб → елемент → деталь), з якого ця заготовка
      // народилась — §6.1 ТЗ МЕС. Не друге дерево, а прив'язка до наявного.
      source: lineageOf(part.id),
      sidesPresent: sidesPresent(part),
      attachment: part.parentDetailId
        ? { hostDetailId: part.parentDetailId, side: part.parentDetailSide ?? null, kind: part.edgeKind ?? null }
        : null,
      widthMm: round3(part.width),
      heightMm: round3(part.height),
      thicknessMm: part.thickness ?? null,
      areaM2: round3(part.area),
      contour: part.points,
      // Порожній список — саме [], не null: МЕС просив уніфікувати, бо
      // null читається як «невідомо», а тут відомо — вирізів немає.
      holes: part.holes ?? [],
    })),
    slabs: project.slabs.map((slab) => ({
      slabId: slab.id,
      article: slab.article ?? null,
      serialNumber: slab.serialNumber || null,
      material: slab.material,
      decor: slab.decor || null,
      widthMm: slab.width,
      heightMm: slab.height,
      thicknessMm: slab.thickness,
      halfSheet: slab.halfSheet ?? false,
      customerOwn: slab.customerOwn ?? false,
      photoFile: slabPhotoFiles[slab.id] ?? null,
      photoCalibration: slab.photo
        ? { status: 'uncalibrated', note: 'прив\'язка фото до фізичних мм слеба ще не калібрується в Студії' }
        : null,
      defects: slab.defects.map((zone) => {
        const auto = zone.id.startsWith(AUTO_DEFECT_PREFIX);
        return {
          defectId: zone.id,
          shapeType: zone.shapeType,
          xMm: zone.x,
          yMm: zone.y,
          widthMm: zone.width,
          heightMm: zone.height,
            points: zone.points ?? [],
          comment: zone.comment ?? null,
          // Авто-дефект народжується з обведення контуру ЦЬОГО слеба на
          // фото: зрізаний кут листа. Це скол за визначенням — звідси kind.
          kind: auto ? 'chip' : null,
          // Захисний відступ НЕ окреме поле, а вже врахований у контурі:
          // трикутник зрізу роздувається на minMargin слеба (slabOutline.
          // inflateCornerCut), бо біля лінії розлому камінь ослаблений.
          // Тому МЕС отримує і величину, і те, що вона вже в геометрії.
          safetyMarginMm: auto ? slab.minMargin : null,
          safetyMarginApplied: auto,
          isDemo: false,
          origin: auto ? 'auto:slab-photo-outline' : 'manual',
          sourceSlabId: slab.id,
          verified: false,
          verificationNote: auto
            ? 'Контур обчислено з фото саме цього слеба (аналіз кутів листа), не скопійовано з шаблону. Але прив\'язка фото до фізичних мм не калібрована, тому як ВИМІРЯНИЙ дефект не подавати: перед різом кут звіряє людина.'
            : 'Заведено руками на дошці розкрою.',
        };
      }),
      defectsNote:
        'Однакові контури на різних слебах законні, якщо слеби показані одним кадром каталогу: контур береться з фото конкретного слеба, а фото у них те саме. Різні фізичні листи з різними сколами дадуть різні контури.',
    })),
    placements: project.placements.map((placement) => ({
      placementId: placement.id,
      partId: placement.partId,
      slabId: placement.slabId,
      xMm: round3(placement.x),
      yMm: round3(placement.y),
      rotationDeg: placement.rotation,
      mirror: placement.mirror ?? false,
      conflict: placement.conflict ?? false,
      outOfBounds: placement.outOfBounds ?? false,
      manualPlaced: placement.manualPlaced ?? false,
    })),
    unplacedPartIds: project.unplacedPartIds,
    productionFacts: facts.map((fact, index) => ({
      factId: `fact-${String(index + 1).padStart(3, '0')}`,
      kind: fact.kind,
      variant: fact.variant ?? null,
      qty: round3(fact.qty),
      unit: fact.unit,
      ref: fact.ref ?? null,
    })),
    estimate: estimateLines.map((line, index) => ({
      sourceRow: index + 1,
      serviceId: line.serviceId,
      code1c: line.externalId ?? null,
      name: line.name,
      unit: line.unit,
      quantity: round3(line.quantity),
      category: line.category,
      factKinds: line.factKinds,
      detailIds: line.detailIds,
    })),
    estimateNote: 'без цін і без хвилин: ціни МЕС не потрібні, норми часу — територія МЕС (не вигадуємо)',
    /**
     * Карта цехових склейок: із чого і що саме склеюється, і скільки
     * предметів реально поїде на монтаж. Без неї МЕС бачив 20 заготовок
     * і не міг знати, що 14 із них — одна чаша.
     */
    assemblyPlan,
    /**
     * Поділ стиком: одна авторська деталь → кілька фізичних заготовок.
     * Спільний detailId НЕ робить їх однією одиницею (§6.1).
     */
    splits: Object.entries(
      parts.filter((part) => part.isMain).reduce<Record<string, string[]>>((acc, part) => {
        (acc[part.detailId] ??= []).push(part.id);
        return acc;
      }, {}),
    )
      .filter(([, ids]) => ids.length > 1)
      .map(([detailId, ids]) => ({
        splitId: `split:${detailId}`,
        sourceDetailId: detailId,
        resultInstanceIds: ids,
        splitLine: null,
        splitLineNote: 'лінія стику задана в елементі (manualJoints/joints у project.json); окремою геометрією в мм тут не дублюється',
      })),
    /**
     * Стики між елементами виробу — з авторської моделі. Де саме
     * виконується (цех/монтаж) Студія не знає → executionStage 'unresolved'.
     */
    joints: (project.products ?? []).flatMap((product) =>
      (product.elements ?? []).flatMap((element) => [
        ...((element as { joints?: Array<{ id: string; type: string; a: { elementPath: string; sideId: string }; b: { elementPath: string; sideId: string } }> }).joints ?? []).map((joint) => ({
          jointId: joint.id,
          productId: product.id,
          a: { elementId: joint.a.elementPath, side: joint.a.sideId },
          b: { elementId: joint.b.elementPath, side: joint.b.sideId },
          type: joint.type,
          executionStage: 'unresolved',
          note: 'тип стику (miter45/butt) не визначає місце виконання; цех чи монтаж — рішення технолога',
        })),
        ...((element.baseDefinition as { manualJoints?: Array<{ id: string; axis: string; anchorCorner: string; offset: number }> }).manualJoints ?? []).map((joint) => ({
          jointId: joint.id,
          productId: product.id,
          a: { elementId: element.id, side: null },
          b: { elementId: element.id, side: null },
          type: 'split',
          axis: joint.axis,
          anchorCorner: joint.anchorCorner,
          offsetMm: joint.offset,
          executionStage: 'unresolved',
          note: 'стик-поділ однієї деталі на заготовки; чи з\'єднуються вони в цеху чи на монтажі — не задано в моделі',
        })),
      ]),
    ),
    /** Реєстр документів пакета: який файл на що дивиться. */
    documents: (input.extraFiles ?? [])
      .filter((file) => file.document)
      .map((file) => ({
        id: file.document!.id,
        kind: file.document!.kind,
        file: file.path,
        revision: project.versions?.length ?? 1,
        orderId: project.orderNumber.trim(),
        partIds: [],
        operationIds: [],
      })),
    /** Моделі пакета з явною роллю — плоске і зібране не сплутати. */
    models: (input.extraFiles ?? [])
      .filter((file) => file.modelRole)
      .map((file) => ({
        id: file.modelId ?? file.path,
        role: file.modelRole,
        file: file.path,
        ...(file.unitId ? { unitId: file.unitId } : {}),
        units: 'метри, Y вгору (glTF)',
        nodeBinding: 'name = instanceId заготовки; extras = {instanceId, partId}; групи вузлів — extras.unitId',
      })),
    /**
     * Таблиця відповідності serviceId → код ВіярПро/1С (domain/viyarMapping).
     * Їде ЗАВЖДИ, навіть коли прив'язки в проєкті вимкнені: МЕС просив
     * перевірену таблицю, а не вгадування по назві послуги. `enabled`
     * каже, чи діяло правило в цьому розрахунку; `note` — підстава з
     * прайсу або чесна позначка «це трактування, звірити».
     */
    serviceMap: {
      viyarCodesEnabled: viyarEnabled,
      note: viyarEnabled
        ? 'Прив\'язки ВіярПро увімкнені — коди в рядках кошторису справжні.'
        : 'Прив\'язки ВіярПро ВИМКНЕНІ в цьому проєкті, тому code1c=null у рядках. Таблиця нижче — те, чим вони стануть після увімкнення.',
      excluded: 'Матеріал і монтаж кодів ВіярПро не мають: у прайсі цеху їх немає. Монтаж — не цехова косметика, це окрема робота; норму для нього МЕС має брати не з ділянки косметики.',
      rules: VIYAR_MAPPING_RULES.map((rule) => ({
        ruleId: rule.id,
        factKind: rule.factKind,
        variant: rule.variant ?? null,
        material: rule.material ?? null,
        code1c: rule.serviceId,
        multiplier: rule.multiplier,
        enabled: rule.enabled,
        basis: rule.note ?? null,
      })),
    },
  };
}

async function sha256hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildMesPack(input: MesPackInput): Promise<MesPackResult> {
  const { project } = input;
  const orderId = project.orderNumber.trim();
  if (!orderId) throw new Error('Вкажіть номер замовлення в шапці проєкту — МЕС вимагає стабільний id.');

  const encoder = new TextEncoder();
  const warnings: string[] = [];
  const files: ZipEntry[] = [];

  // Фото слебів. Вбудоване (data:URL) кладемо як є; фото з каталогу
  // приходить ПОСИЛАННЯМ — його доводиться дотягувати мережею, і саме
  // через це в першому пакеті для МЕС усі photoFile були null.
  const slabPhotoFiles: Record<string, string> = {};
  for (let index = 0; index < project.slabs.length; index += 1) {
    const slab = project.slabs[index];
    const label = slab.serialNumber || slab.article || `№${index + 1}`;
    if (!slab.photo) continue;
    let decoded = dataUrlBytes(slab.photo);
    if (!decoded && /^https?:/i.test(slab.photo)) {
      decoded = await fetchImageBytes(slab.photo);
      if (!decoded) warnings.push(`Фото слеба ${label} лежить за посиланням і не завантажилось — у пакеті його немає.`);
    }
    if (!decoded) continue;
    const path = `slabs/slab-${index + 1}_original.${decoded.ext}`;
    slabPhotoFiles[slab.id] = path;
    files.push({ path, data: decoded.bytes });
  }

  const projectBytes = encoder.encode(JSON.stringify(project, null, 1));
  files.push({ path: 'project.json', data: projectBytes });

  const orderBytes = encoder.encode(JSON.stringify(buildOrderJson(input, slabPhotoFiles), null, 1));
  files.push({ path: 'order.json', data: orderBytes });

  const extraPurpose: Record<string, string> = {};
  for (const extra of input.extraFiles ?? []) {
    extraPurpose[extra.path] = extra.purpose;
    files.push({ path: extra.path, data: extra.data });
  }

  const revision = project.versions?.length ?? 1;
  const exportedAt = new Date();
  const manifest = {
    schemaVersion: MES_PACK_SCHEMA,
    orderId,
    exportId: `exp-${orderId}-${exportedAt.getTime()}`,
    revision,
    revisionNote: 'revision — номер версії документа CAD (кількість записів у versions); НЕ ревізія SQLite МЕС',
    exportedAt: exportedAt.toISOString(),
    timezoneOffsetMinutes: -exportedAt.getTimezoneOffset(),
    appVersion: input.appVersion ?? 'vs3d-studio',
    projectSha256: await sha256hex(projectBytes),
    coordinateSystems: {
      order: 'мм; початок — верхній лівий кут, X вправо, Y вниз (рідна система CAD, як узгоджено 10.09.2026)',
      glb:
        'метри, Y вгору (стандарт glTF). CAD→GLB: мм × 0.001, вісь Z плану CAD стає −Z сцени, товщина деталі йде вгору по Y. '
        + 'Зібраний виріб (models/vyrib.glb) центрується по горизонталі й ставиться низом на Y=0. Плоска розкладка заготовок '
        + '(models/zahotovky.glb) — деталі в площині XZ, підряд по X. Вузол = заготовка: name=instanceId, extras={instanceId, partId}.',
      photo: 'пікселі; гомографія pixel→slabMm НЕ передається, поки немає калібрування — дефекти задані в мм слеба незалежно від фото',
    },
    files: await Promise.all(
      files.map(async (file) => ({
        path: file.path,
        bytes: file.data.length,
        sha256: await sha256hex(file.data),
        purpose:
          extraPurpose[file.path] ??
          (file.path === 'project.json'
            ? 'повний файл проєкту Студії (сирець, максимум даних)'
            : file.path === 'order.json'
              ? 'читабельний шар для адаптера МЕС'
              : 'фото слеба (оригінал, без позначок)'),
      })),
    ),
    missing: [
      'фото слебів: калібрування pixel→mm відсутнє (контрольних точок немає) — дефект заданий у мм слеба незалежно від знімка',
      ...(input.extraFiles?.some((file) => file.path.startsWith('models/'))
        ? []
        : ['models/*.glb — моделі немає: пакет зібрано кнопкою з «Послуг», яка везе лише дані. Повний ZIP із кресленнями і моделлю збирається у вкладці «Документи»']),
      ...(input.extraFiles?.length
        ? []
        : ['docs/ — документи пакета для цеху не додані: повний ZIP із кресленнями, тех картою і бланком збирається з вкладки «Документи»']),
    ],
  };
  files.push({ path: 'manifest.json', data: encoder.encode(JSON.stringify(manifest, null, 1)) });

  return {
    zip: zipStore(files, exportedAt),
    fileName: `order_${orderId}_v${revision}.zip`,
    warnings,
  };
}

/** Збирає пакет і віддає файлом. Повертає попередження для банера. */
export async function downloadMesPack(input: MesPackInput): Promise<string[]> {
  const result = await buildMesPack(input);
  const blob = new Blob([result.zip.buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return result.warnings;
}
