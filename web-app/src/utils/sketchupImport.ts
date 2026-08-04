import type { Product, ProductElement, ElementDefinition, DetailType, Point } from '../domain/types';
import { buildElementPath } from '../domain/ids';
import { createDraft } from '../components/forms/utils/draftHelpers';

/**
 * Імпорт виробу, експортованого плагіном SketchUp
 * (tools/sketchup/slabcut_export.rb, формат "slabcut-sketchup" v1).
 *
 * Принцип: приймальник НІЧОГО не домислює. Усе, що не проходить перевірку,
 * відкидається з поясненням і показується користувачу у звіті — щоб проблема
 * була видна тут, а не в цеху.
 */

export interface SketchupImportReport {
  ok: boolean;
  error?: string;
  productName?: string;
  accepted: Array<{ name: string; type: string; slot: string; width: number; height: number; thickness: number }>;
  skipped: Array<{ name: string; reason: string }>;
}

const KNOWN_TYPES: DetailType[] = [
  'Стільниця', 'Стінова панель', 'Мийка', 'Фасад', 'Опора', 'Довільний елемент', 'Потовщення', 'Підворот',
];

/** Мінімальна сторона деталі, мм. Менше — це майже завжди артефакт моделі. */
const MIN_SIDE_MM = 20;

function bounds(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    minX, minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

/** Чи контур замкнений і не самоперетинається грубо (перевірка мінімальна, без повної геометрії). */
function contourLooksValid(points: Point[]): string | null {
  if (!Array.isArray(points) || points.length < 3) return 'контур має менше 3 точок';
  if (points.some((p) => typeof p?.x !== 'number' || typeof p?.y !== 'number' || !isFinite(p.x) || !isFinite(p.y))) {
    return 'у контурі є некоректні координати';
  }
  const b = bounds(points);
  if (b.width < MIN_SIDE_MM || b.height < MIN_SIDE_MM) {
    return `габарит замалий (${Math.round(b.width)}×${Math.round(b.height)} мм)`;
  }
  return null;
}

/**
 * Розбирає JSON плагіна і будує Product.
 * productId передається зовні (щоб функція лишалась чистою й тестовною).
 */
export function parseSketchupProduct(raw: unknown, productId: string): { product?: Product; report: SketchupImportReport } {
  const report: SketchupImportReport = { ok: false, accepted: [], skipped: [] };

  const data = raw as any;
  if (!data || typeof data !== 'object') {
    report.error = 'Файл не є коректним JSON.';
    return { report };
  }
  if (data.format !== 'slabcut-sketchup') {
    report.error = `Невідомий формат файлу: ${String(data.format ?? '—')}. Очікується "slabcut-sketchup".`;
    return { report };
  }
  if (Number(data.version) !== 1) {
    report.error = `Непідтримувана версія формату: ${String(data.version)}. Очікується 1.`;
    return { report };
  }
  if (data.units && String(data.units).toLowerCase() !== 'mm') {
    report.error = `Очікуються міліметри, а у файлі: ${String(data.units)}.`;
    return { report };
  }
  const srcElements = data?.product?.elements;
  if (!Array.isArray(srcElements) || srcElements.length === 0) {
    report.error = 'У файлі немає жодного елемента.';
    return { report };
  }

  report.productName = String(data.product?.name || 'Виріб зі SketchUp');

  const mainElementId = buildElementPath(productId, 'main');
  let rootElement: ProductElement | undefined;
  const others: ProductElement[] = [];
  const usedSlots = new Set<string>();

  srcElements.forEach((el: any, index: number) => {
    const name = String(el?.sourceName || el?.slot || `Елемент ${index + 1}`);

    const contour: Point[] = Array.isArray(el?.contour)
      ? el.contour.map((p: any) => ({ x: Number(p?.x), y: Number(p?.y) }))
      : [];

    const problem = contourLooksValid(contour);
    if (problem) {
      report.skipped.push({ name, reason: problem });
      return;
    }

    const type: DetailType = KNOWN_TYPES.includes(el?.type) ? el.type : 'Довільний елемент';

    // Слот має бути унікальним — інакше два елементи перезапишуть один одного.
    let slot = String(el?.slot || `custom_${index + 1}`);
    if (usedSlots.has(slot)) {
      const uniq = `${slot}_${index + 1}`;
      report.skipped.push({ name, reason: `слот "${slot}" уже зайнятий, перейменовано на "${uniq}"` });
      slot = uniq;
    }
    usedSlots.add(slot);

    const b = bounds(contour);
    const thickness = Number(el?.thickness) > 0 ? Number(el.thickness) : 20;

    // Нормалізуємо контур у нуль — розкрій очікує 0,0 у лівому нижньому куті.
    const normalized: Point[] = contour.map((p) => ({
      x: Math.round((p.x - b.minX) * 100) / 100,
      y: Math.round((p.y - b.minY) * 100) / 100,
    }));

    const baseDefinition: ElementDefinition = {
      ...createDraft(),
      type,
      // 'rect' лишаємо як kind: форма береться з customPoints, а kind впливає
      // лише на набір параметрів у редакторі.
      kind: 'rect',
      label: name,
      thickness,
      width: Math.round(b.width),
      height: Math.round(b.height),
      outerWidth: Math.round(b.width),
      outerHeight: Math.round(b.height),
      quantity: 1,
      customPoints: normalized,
    } as ElementDefinition;

    const element: ProductElement = {
      id: buildElementPath(productId, slot),
      type,
      baseDefinition,
      additions: [],
      joints: [],
      position3D: el?.position3D && typeof el.position3D === 'object'
        ? {
            x: Number(el.position3D.x) || 0,
            y: Number(el.position3D.y) || 0,
            z: Number(el.position3D.z) || 0,
            rx: 0, ry: 0, rz: 0,
          }
        : undefined,
    };

    report.accepted.push({
      name, type, slot,
      width: Math.round(b.width),
      height: Math.round(b.height),
      thickness,
    });

    if (slot === 'main' && !rootElement) {
      element.id = mainElementId;
      rootElement = element;
    } else {
      others.push(element);
    }
  });

  if (!rootElement && others.length === 0) {
    report.error = 'Жоден елемент не пройшов перевірку.';
    return { report };
  }

  // Якщо в моделі не було групи "Стільниця" — головним стає перший придатний елемент,
  // бо Виріб без кореневого Елемента не має сенсу.
  if (!rootElement) {
    rootElement = others.shift()!;
    rootElement.id = mainElementId;
    report.skipped.push({
      name: rootElement.baseDefinition.label || 'перший елемент',
      reason: 'групи «Стільниця» не знайдено — цей елемент став головним',
    });
  }

  const product: Product = {
    id: productId,
    name: report.productName!,
    elements: [rootElement, ...others],
  };

  report.ok = true;
  return { product, report };
}

/** Читабельний текст звіту для показу користувачу. */
export function formatSketchupReport(r: SketchupImportReport): string {
  if (!r.ok) return `Імпорт не виконано.\n\n${r.error ?? 'Невідома помилка.'}`;
  const lines: string[] = [];
  lines.push(`Виріб: ${r.productName}`);
  lines.push(`Прийнято деталей: ${r.accepted.length}`);
  r.accepted.forEach((a) => {
    lines.push(`  • ${a.name} → ${a.type} (${a.slot}), ${a.width}×${a.height}, товщина ${a.thickness} мм`);
  });
  if (r.skipped.length) {
    lines.push('');
    lines.push(`Увага (${r.skipped.length}):`);
    r.skipped.forEach((s) => lines.push(`  • ${s.name}: ${s.reason}`));
  }
  return lines.join('\n');
}
