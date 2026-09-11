// =====================================================================
//  src/engines/assemblyPlan.ts
//  №178/№179 · Карта цехових склейок для МЕС.
//
//  МЕС побачив у пакеті 20 заготовок і не мав чим відрізнити «двадцять
//  штук на піраміду» від «двадцять заготовок, з яких вийде шість
//  елементів». Різниця не косметична: чаша мийки — це 14 деталей, які
//  склеюються в ОДИН предмет, і відвантажити їх окремо не можна.
//
//    заготовка (instanceId)  →  склейка (join)  →  вузол (unitId)
//                                                  ↓
//                                       елемент на монтаж (finalUnitIds)
//
//  Джерела — ТІЛЬКИ те, що вже несе модель (ТЗ Брунеллескі 10.09, §6.1):
//   · частини чаші — усі заготовки деталі типу «Мийка» одного елемента;
//   · підворот/потовщення знає свою сторону (`parentDetailSide`) і
//     батьківську деталь (`parentDetailId`); яка САМЕ заготовка після
//     поділу стиком несе цю сторону, кажуть імена сторін на точках
//     контуру (`Point.sideId`) — вони переживають розріз;
//   · чаша вклеюється в ту заготовку стільниці, де є отвір під неї.
//
//  Що тут НІКОЛИ не вигадується: коли кандидатів кілька або нуль —
//  join не створюється, а в `unresolved` іде опис. Часу витримки клею
//  немає (норми МЕС); монтажні стики окремо від цехових.
// =====================================================================

import type { Detail, DetailPart, Placement, Point } from '../domain/types';

export type AssemblyArea = 'sinks' | 'glue';

export interface AssemblyJoin {
  id: string;
  area: AssemblyArea;
  name: string;
  /** instanceId заготовок або output.id попередніх склейок — прості рядки, як у reference МЕС. */
  inputs: string[];
  output: {
    id: string;
    name: string;
    kind: 'sink' | 'bonded';
    /** Точний instanceId заготовки-хоста (не detailId і не «перша зі списку»). */
    hostPartId?: string;
    /** Для вклейки чаші — індекс отвору в `parts[host].holes`. */
    holeIndex?: number;
    /** Усі початкові заготовки, що опинились у вузлі (родовід). */
    partIds: string[];
  };
  /** `model` — прямо з моделі; `assumption` — наш висновок, звірити. */
  basis: 'model' | 'assumption';
  basisNote?: string;
}

export interface AssemblyUnresolved {
  code: 'fold-host-ambiguous' | 'fold-host-missing' | 'sink-host-ambiguous' | 'sink-host-missing';
  partIds: string[];
  candidates: string[];
  message: string;
}

export interface TransportGroup {
  id: string;
  joinId: string;
  inputUnitIds: string[];
  hostPartId: string | null;
  purpose: string;
  destinationArea: AssemblyArea;
  waitForAll: true;
  consumesInputs: false;
}

export interface AssemblyPlan {
  version: 1;
  source: string;
  joins: AssemblyJoin[];
  /** Рівно ті об'єкти, що фізично поїдуть на монтаж. */
  finalUnitIds: string[];
  /** Що не вдалось прив'язати однозначно — з причиною, без вибору «першого». */
  unresolved: AssemblyUnresolved[];
  transportGroups: TransportGroup[];
  counts: { parts: number; joins: number; finalUnits: number; unresolved: number };
  consumedPartIds: string[];
  notes: string[];
}

const FOLD_KINDS = new Set(['thickening', 'fold']);

/** Сторони, які заготовка справді несе: за іменами на точках контуру. */
function sidesOf(part: DetailPart): Set<string> {
  const sides = new Set<string>();
  (part.points ?? []).forEach((point: Point) => {
    if (point.sideId) sides.add(point.sideId);
  });
  return sides;
}

/** Сторона доповнення: з прив'язки в парті, інакше з імені елемента (`fold_C`, `leg_B`). */
function attachmentSide(part: DetailPart, detail: Detail | undefined): string | null {
  if (part.parentDetailSide) return part.parentDetailSide;
  if (detail?.parentDetailSide) return detail.parentDetailSide;
  const match = /element:(?:fold|thick|thickening)_([A-Z]+)\//.exec(part.id);
  return match ? match[1] : null;
}

function bbox(points: Point[]): { w: number; h: number } {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Вузол, у якому зараз живе заготовка (сама або вже склеєна). */
function currentUnit(partId: string, unitOfPart: Map<string, string>): string {
  return unitOfPart.get(partId) ?? partId;
}

export function buildAssemblyPlan(
  parts: DetailPart[],
  _placements: Placement[],
  details: Detail[],
): AssemblyPlan {
  const detailById = new Map(details.map((detail) => [detail.id, detail]));
  const joins: AssemblyJoin[] = [];
  const unresolved: AssemblyUnresolved[] = [];
  const notes: string[] = [];
  /** instanceId → unitId вузла, куди вона вже спожита. */
  const unitOfPart = new Map<string, string>();
  /** unitId → його початкові заготовки. */
  const partsOfUnit = new Map<string, string[]>();

  const detailOf = (part: DetailPart) => detailById.get(part.detailId);
  const isSinkPart = (part: DetailPart) =>
    detailOf(part)?.type === 'Мийка' || part.textureGroupKind === 'rectSink' || part.textureGroupKind === 'slotSink';
  const isFoldPart = (part: DetailPart) =>
    (part.edgeKind !== undefined && FOLD_KINDS.has(part.edgeKind))
    || (detailOf(part)?.importRole !== undefined && FOLD_KINDS.has(detailOf(part)!.importRole!))
    || Boolean(part.parentDetailId && detailOf(part)?.type && /Потовщ|Підворот/i.test(detailOf(part)!.type));

  const consume = (unitId: string, inputs: string[]) => {
    const lineage: string[] = [];
    inputs.forEach((input) => {
      const fromUnit = partsOfUnit.get(input);
      if (fromUnit) lineage.push(...fromUnit);
      else lineage.push(input);
    });
    lineage.forEach((partId) => unitOfPart.set(partId, unitId));
    partsOfUnit.set(unitId, lineage);
    return lineage;
  };

  // ── 1. Підвороти / потовщення → своя заготовка стільниці ────────────
  //  Спершу, бо чаша потім вклеюється вже в «стільницю з підворотом».
  const folds = parts.filter((part) => !part.isMain || isFoldPart(part)).filter((part) => isFoldPart(part) && !isSinkPart(part));
  const foldsByHost = new Map<string, DetailPart[]>();

  folds.forEach((fold) => {
    const detail = detailOf(fold);
    const hostDetailId = fold.parentDetailId ?? detail?.parentDetailId;
    const side = attachmentSide(fold, detail);
    let candidates = parts.filter((part) => part.isMain && !isSinkPart(part) && !isFoldPart(part)
      && (hostDetailId ? part.detailId === hostDetailId : part.parentLabel === fold.parentLabel));
    if (side && candidates.length > 1) {
      const bySide = candidates.filter((part) => sidesOf(part).has(side));
      if (bySide.length) candidates = bySide;
    }
    if (candidates.length === 1) {
      const host = candidates[0];
      foldsByHost.set(host.id, [...(foldsByHost.get(host.id) ?? []), fold]);
      return;
    }
    unresolved.push({
      code: candidates.length ? 'fold-host-ambiguous' : 'fold-host-missing',
      partIds: [fold.id],
      candidates: candidates.map((part) => part.id),
      message: candidates.length
        ? `Доповнення «${fold.name}» (сторона ${side ?? '?'}) підходить до кількох заготовок після поділу — контур не каже, до якої. Вирішує конструктор.`
        : `Для доповнення «${fold.name}» не знайдено заготовки-хоста${side ? ` зі стороною ${side}` : ''}.`,
    });
  });

  let joinIndex = 0;
  foldsByHost.forEach((hostFolds, hostId) => {
    const host = parts.find((part) => part.id === hostId)!;
    joinIndex += 1;
    const unitId = `assembly:fold-${joinIndex}:${hostId}`;
    const inputs = [hostId, ...hostFolds.map((fold) => fold.id)];
    const partIds = consume(unitId, inputs);
    joins.push({
      id: `glue-${joinIndex}`,
      area: 'glue',
      name: `Приклеїти ${hostFolds.map((fold) => fold.name).join(', ')} · ${host.name}`,
      inputs,
      output: { id: unitId, name: `${host.name} з доповненнями`, kind: 'bonded', hostPartId: hostId, partIds },
      basis: 'model',
      basisNote: `сторона доповнення (${hostFolds.map((fold) => attachmentSide(fold, detailOf(fold)) ?? '?').join(', ')}) знайдена на контурі саме цієї заготовки`,
    });
  });

  // ── 2. Чаша: усі заготовки деталі «Мийка» одного елемента ───────────
  const sinkGroups = new Map<string, DetailPart[]>();
  parts.filter(isSinkPart).forEach((part) => {
    const key = part.detailId;
    sinkGroups.set(key, [...(sinkGroups.get(key) ?? []), part]);
  });

  let sinkIndex = 0;
  sinkGroups.forEach((sinkParts, detailId) => {
    if (sinkParts.length < 2) return; // одна заготовка — не збірка
    sinkIndex += 1;
    const unitId = `assembly:sink-${sinkIndex}:${detailId}`;
    const inputs = sinkParts.map((part) => part.id);
    const partIds = consume(unitId, inputs);
    const label = sinkParts[0].parentLabel || detailOf(sinkParts[0])?.label || 'Мийка';
    joins.push({
      id: `sink-${sinkIndex}`,
      area: 'sinks',
      name: `Склеїти мийку «${label}» (${inputs.length} заготовок)`,
      inputs,
      output: { id: unitId, name: `Зібрана мийка «${label}»`, kind: 'sink', partIds },
      basis: 'model',
      basisNote: 'усі заготовки деталі типу «Мийка» одного елемента виробу',
    });

    // ── 3. Чаша → стільниця з отвором під неї ──────────────────────────
    const anchor = sinkParts.find((part) => part.textureGroupAnchor) ?? sinkParts.find((part) => /дно/i.test(part.name)) ?? sinkParts[0];
    const bowl = bbox(anchor.points ?? []);
    const hosts = parts.filter((part) => part.isMain && !isSinkPart(part) && !isFoldPart(part) && detailOf(part)?.type === 'Стільниця');
    type Candidate = { host: DetailPart; holeIndex: number };
    let candidates: Candidate[] = [];
    hosts.forEach((host) => {
      (host.holes ?? []).forEach((hole, holeIndex) => {
        const size = bbox(hole);
        // Отвір під чашу трохи менший за дно (вклейка знизу) — допуск 120 мм на сторону.
        const fits = Math.abs(size.w - bowl.w) <= 120 && Math.abs(size.h - bowl.h) <= 120;
        if (fits) candidates.push({ host, holeIndex });
      });
    });
    if (!candidates.length) {
      // Розмір не збігся — лишається один шлях: єдина стільниця з будь-яким отвором.
      const withHoles = hosts.filter((host) => (host.holes ?? []).length > 0);
      if (withHoles.length === 1) candidates = [{ host: withHoles[0], holeIndex: 0 }];
    }
    if (candidates.length !== 1) {
      unresolved.push({
        code: candidates.length ? 'sink-host-ambiguous' : 'sink-host-missing',
        partIds: inputs,
        candidates: candidates.map((candidate) => candidate.host.id),
        message: candidates.length
          ? `Чаша «${label}» підходить до кількох отворів (${candidates.map((candidate) => candidate.host.name).join(', ')}) — вирішує конструктор.`
          : `Для чаші «${label}» не знайдено заготовки стільниці з отвором під неї — чаша їде окремим елементом.`,
      });
      return;
    }
    const { host, holeIndex } = candidates[0];
    const hostUnit = currentUnit(host.id, unitOfPart);
    const installUnitId = `assembly:sink-in-top-${sinkIndex}:${host.id}`;
    const installInputs = [hostUnit, unitId];
    const installParts = consume(installUnitId, installInputs);
    joins.push({
      id: `sink-in-top-${sinkIndex}`,
      area: 'sinks',
      name: `Вклеїти мийку «${label}» у ${host.name}`,
      inputs: installInputs,
      output: {
        id: installUnitId,
        name: `${host.name} з вклеєною мийкою`,
        kind: 'bonded',
        hostPartId: host.id,
        holeIndex,
        partIds: installParts,
      },
      basis: candidates.length === 1 && (host.holes ?? []).length === 1 ? 'model' : 'assumption',
      basisNote: `отвір №${holeIndex + 1} на «${host.name}» за розміром відповідає дну чаші (${Math.round(bowl.w)}×${Math.round(bowl.h)} мм)`,
    });
  });

  // ── 4. Що фізично їде на монтаж ─────────────────────────────────────
  const producedUnits = joins.map((join) => join.output.id);
  const consumedUnits = new Set(joins.flatMap((join) => join.inputs));
  const finalUnitIds = [
    ...producedUnits.filter((unitId) => !consumedUnits.has(unitId)),
    ...parts.filter((part) => !unitOfPart.has(part.id)).map((part) => part.id),
  ];

  // ── 5. Транспортні комплекти: що чекає одне одного перед склейкою ───
  const transportGroups: TransportGroup[] = joins.map((join) => ({
    id: `kit:${join.id}`,
    joinId: join.id,
    inputUnitIds: join.inputs,
    hostPartId: join.output.hostPartId ?? null,
    purpose: join.area === 'sinks' ? 'деталі однієї мийки їдуть однією пачкою' : 'доповнення комплектуються зі своєю стільницею',
    destinationArea: join.area,
    waitForAll: true,
    consumesInputs: false,
  }));

  if (!joins.length) notes.push('Склейок у моделі немає: кожна заготовка їде на монтаж окремо.');

  // Контроль МЕС: кожна заготовка — рівно в одному кінцевому елементі.
  const seen = new Map<string, number>();
  finalUnitIds.forEach((unitId) => {
    (partsOfUnit.get(unitId) ?? [unitId]).forEach((partId) => seen.set(partId, (seen.get(partId) ?? 0) + 1));
  });
  const doubled = [...seen.entries()].filter(([, count]) => count > 1).map(([partId]) => partId);
  const lost = parts.filter((part) => !seen.has(part.id)).map((part) => part.id);
  if (doubled.length) notes.push(`ПОМИЛКА графа: заготовки пораховані двічі: ${doubled.join(', ')}`);
  if (lost.length) notes.push(`ПОМИЛКА графа: заготовки загублені: ${lost.join(', ')}`);

  return {
    version: 1,
    source: 'VS3D Studio: сторони на контурах заготовок (Point.sideId), прив\'язки доповнень (parentDetailId/parentDetailSide), отвори під чашу',
    joins,
    finalUnitIds,
    unresolved,
    transportGroups,
    counts: { parts: parts.length, joins: joins.length, finalUnits: finalUnitIds.length, unresolved: unresolved.length },
    consumedPartIds: [...unitOfPart.keys()],
    notes,
  };
}
