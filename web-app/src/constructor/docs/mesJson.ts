/**
 * JSON ДЛЯ MES — 04.09.2026.
 *
 * Чернетка контракту (ТЗ §7.2; формат приймача невідомий — Р1С-8:
 * ділянки й маршрут живуть ТУТ, а не в заявці 1С). Правила:
 *   МЕС-2  шапка несе логістику монтажу;
 *   МЕС-3  масив номерів із джерелом кожного (МЕС-8: одному не вірити);
 *   МЕС-1  завдання цеху = (вид робіт, одиниця, кількість) + розгортка;
 *   МЕС-4  матеріали — вхід операції, з зоною складу;
 *   МЕС-9  маршрут — граф, ділянка може зустрітись двічі;
 *   МЕС-6  суміжні замовлення (металокаркас) з точкою зустрічі «Монтаж»;
 *   ОФ-ЧВ  червоний текст креслення → інструкція виконавцю verbatim.
 */
import type { TechCard } from './techCard';
import type { Decision } from '../store';

export interface MesJson {
  contract: 'mes-draft-1';
  generatedAt: string;
  order: {
    numbers: Array<{ kind: 'order' | 'request1c' | 'quote' | 'act'; value: string; source: string }>;
    customer: string;
    material: string;
    thickness?: number;
    areaM2: number;
    products: string[];
    montage: { address: string | null; floor: number | null; lift: string | null; phone: string | null };
  };
  tasks: Array<{
    area: string;
    operations: Array<{ code?: string; serviceId: string; name: string; qty: number; unit: string; details: string[]; rule: string }>;
  }>;
  shopSheet: Array<{ kind: string; unit: string; qty: number; sources: string[] }>;
  materials: Array<{ serviceId: string; name: string; qty: number; unit: string; warehouse: string }>;
  route: { nodes: string[]; edges: Array<{ from: string; to: string; note?: string }> };
  related: Array<{ kind: 'metal_frame' | 'plywood'; meetAt: 'Монтаж' | 'Поклейка крайки'; note: string }>;
  instructions: string[];
  decisions: Array<{ at: string; tab: string; what: string; why: string; rule?: string }>;
}

export function buildMesJson(card: TechCard, opts: {
  decisions: Decision[];
  hasMetal: boolean;
  hasPlywood: boolean;
  instructions?: string[];
  /** Повернення на ділянку з маршруту по деталях (ВЦ-7, ВЦ-18) — лише виявлені за ознаками. */
  loops?: Array<{ from: string; to: string; label: string; rule: string }>;
}): MesJson {
  const nodes = card.sections.map((s) => s.area);
  const edges: MesJson['route']['edges'] = nodes.slice(1).map((to, i) => ({ from: nodes[i], to }));
  // МЕС-9: повернення — тільки виявлені за ознаками правил, не «про всяк випадок»
  const AREA_OF: Record<string, string> = { saw: 'Пильний центр', water: 'Порізка водою', chpk: 'ЧПК', sinks: 'Мийки', glue: 'Поклейка крайки', grind: 'Шліфування', cosm: 'Косметика' };
  for (const l of opts.loops ?? []) edges.push({ from: AREA_OF[l.from] ?? l.from, to: AREA_OF[l.to] ?? l.to, note: `${l.rule}: ${l.label}` });

  const related: MesJson['related'] = [];
  if (opts.hasMetal) related.push({ kind: 'metal_frame', meetAt: 'Монтаж', note: 'МК-1/МЕС-6: окреме замовлення, власний маршрут' });
  if (opts.hasPlywood) related.push({ kind: 'plywood', meetAt: 'Поклейка крайки', note: 'КП-4: підклад клеїться до поклейки борту' });

  return {
    contract: 'mes-draft-1',
    generatedAt: new Date().toISOString(),
    order: {
      numbers: [{ kind: 'order', value: card.header.orderNumber, source: 'VS3D project.orderNumber' }],
      customer: card.header.customer,
      material: card.header.material,
      thickness: card.header.thickness,
      areaM2: card.header.areaM2,
      products: card.header.productNames,
      montage: { address: null, floor: null, lift: null, phone: null },
    },
    tasks: card.sections.map((s) => ({
      area: s.area,
      operations: s.ops.map((o) => ({ code: o.code, serviceId: o.serviceId, name: o.name, qty: o.qty, unit: o.unit, details: o.detailIds, rule: o.rule })),
    })),
    shopSheet: card.mes.map((r) => ({ kind: r.kind, unit: r.unit, qty: r.qty, sources: r.sources })),
    materials: card.materials.map((m) => ({
      serviceId: m.serviceId, name: m.name, qty: m.quantity, unit: m.unit,
      warehouse: 'Склад каменю ViyarStone',
    })),
    route: { nodes, edges },
    related,
    instructions: opts.instructions ?? [],
    decisions: opts.decisions.map((d) => ({ at: d.at, tab: d.tab, what: d.what, why: d.why, rule: d.rule })),
  };
}
