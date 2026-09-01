import type { EdgeTreatment, EdgeProfileType, EdgeProfileSelection, Point } from './types';

/**
 * ОБРОБКА ТОРЦЯ — ОДНЕ ЧИТАННЯ НА ВЕСЬ ЗАСТОСУНОК.
 *
 * Крайка живе у двох виглядах, і це не тимчасово:
 *  · рядок `'r2_top'` — старий формат, ним досі пишуть імпорт бланка, DXF
 *    і швидкий вибір у контекстному меню ребра;
 *  · `EdgeTreatment` — повний: лицьове й тильне ребро окремо, довжина не
 *    на всю сторону, прив'язка з відступом, ручна доводка.
 *
 * До 10.08 кожен споживач розбирав це сам: рушій фактів, маркери на карті
 * крою, бланк погодження — три копії з різними уявленнями. Тому все
 * читання зведено сюди, а `EdgeProfileSelection` тепер офіційно union.
 *
 * Головне правило: ДОВЖИНА. Раніше будь-яка крайка нараховувалась цеху на
 * всю сторону, навіть якщо менеджер задав «Довільна, 300 мм». Тепер
 * `edgeTreatmentSpan` — єдине джерело і для метрів у кошторисі, і для
 * позначки на кресленні: цифра в КП і лінія на карті не розходяться.
 */

export function normalizeEdgeTreatment(
  raw: EdgeProfileType | EdgeTreatment | undefined | null,
): EdgeTreatment | undefined {
  if (!raw) return undefined;
  // Рядок — це ОДНЕ лицьове ребро. `linked` тут не ставимо: інакше кожна
  // стара крайка раптом почала б рахуватись цеху двома проходами.
  if (typeof raw === 'string') return { top: { profileId: raw }, isFullLength: true };
  return raw;
}

/** Профіль лицьового ребра — те, що показує компактний UI і старі списки. */
export function topProfileId(
  raw: EdgeProfileType | EdgeTreatment | undefined | null,
): EdgeProfileType | undefined {
  const treatment = normalizeEdgeTreatment(raw);
  return treatment?.top?.profileId as EdgeProfileType | undefined;
}

/** Чи задана на стороні хоч якась обробка (лицьове або тильне ребро). */
export function hasEdgeTreatment(raw: EdgeProfileType | EdgeTreatment | undefined | null) {
  return edgeTreatmentProfiles(raw).length > 0;
}

/**
 * Профілі, які цех реально фрезерує на цій стороні. Лицьове і тильне —
 * ДВА проходи, тому однакові профілі не схлопуються: `[r2_top, r2_top]`
 * означає два рази по довжині сторони.
 *
 * Читаємо `bottom` буквально, а не «якщо linked, то як top»: `linked` —
 * зручність редактора, який тримає тильне ребро в синхроні з лицьовим і
 * ЗАПИСУЄ його. Виводити тильне ребро з прапорця тут означало б, що те
 * саме поле рахується двома способами.
 */
export function edgeTreatmentProfiles(
  raw: EdgeProfileType | EdgeTreatment | undefined | null,
): string[] {
  const treatment = normalizeEdgeTreatment(raw);
  if (!treatment) return [];
  const out: string[] = [];
  if (treatment.top?.profileId) out.push(treatment.top.profileId);
  if (treatment.bottom?.profileId) out.push(treatment.bottom.profileId);
  return out;
}

/** Унікальні профілі — для позначок на кресленні, де важливий вид, а не кількість проходів. */
export function edgeTreatmentProfileKinds(
  raw: EdgeProfileType | EdgeTreatment | undefined | null,
): string[] {
  return Array.from(new Set(edgeTreatmentProfiles(raw)));
}

/**
 * Ділянка обробки вздовж сторони, мм від початку сторони.
 *
 * «На всю довжину» — [0, L]. «Довільна» — відрізок `size` з відступом
 * `offset` від краю за прив'язкою. Усе затискається в межі сторони: 300 мм
 * обробки на стороні 200 мм — це 200, а не 300 (інакше цех отримав би
 * метраж, якого на деталі фізично немає).
 */
export function edgeTreatmentSpan(
  raw: EdgeProfileType | EdgeTreatment | undefined | null,
  sideLengthMm: number,
): { from: number; to: number } {
  const treatment = normalizeEdgeTreatment(raw);
  const full = { from: 0, to: Math.max(0, sideLengthMm) };
  if (!treatment || treatment.isFullLength !== false) return full;

  const size = Math.max(0, Math.min(treatment.size ?? 0, sideLengthMm));
  if (size <= 0) return { from: 0, to: 0 };
  const offset = Math.max(0, treatment.offset ?? 0);

  let from: number;
  if (treatment.align === 'right') from = sideLengthMm - size - offset;
  else if (treatment.align === 'center') from = (sideLengthMm - size) / 2 + offset;
  else from = offset;

  from = Math.max(0, Math.min(from, sideLengthMm - size));
  return { from, to: from + size };
}

/** Довжина обробки на стороні, мм — саме вона йде в метри послуги. */
export function edgeTreatmentLengthMm(
  raw: EdgeProfileType | EdgeTreatment | undefined | null,
  sideLengthMm: number,
): number {
  const span = edgeTreatmentSpan(raw, sideLengthMm);
  return Math.max(0, span.to - span.from);
}

/**
 * Частина ламаної, що відповідає ділянці обробки.
 *
 * Позначка на кресленні йде по тому самому контуру сторони (пряма ділянка
 * плюс половини кутових дуг), тому різати треба по довжині дуги, а не по
 * прямій між кінцями.
 */
export function slicePolylineByLength(points: Point[], fromMm: number, toMm: number): Point[] {
  if (points.length < 2) return points;
  const total = points.slice(1).reduce(
    (sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y),
    0,
  );
  if (total <= 0) return points;
  const from = Math.max(0, Math.min(fromMm, total));
  const to = Math.max(from, Math.min(toMm, total));
  if (from <= 0 && to >= total) return points;

  const pointAt = (distance: number): Point => {
    let walked = 0;
    for (let i = 1; i < points.length; i += 1) {
      const step = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      if (walked + step >= distance || i === points.length - 1) {
        const t = step > 0 ? Math.max(0, Math.min(1, (distance - walked) / step)) : 0;
        return {
          x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
        };
      }
      walked += step;
    }
    return points[points.length - 1];
  };

  const out: Point[] = [pointAt(from)];
  let walked = 0;
  for (let i = 1; i < points.length; i += 1) {
    const step = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const at = walked + step;
    if (at > from && at < to) out.push(points[i]);
    walked = at;
  }
  out.push(pointAt(to));
  return out;
}

/**
 * ВЗІРЕЦЬ (01.09, власник): «клік по літері сторони — вона стає основною,
 * клік по інших літерах ставить їм ідентичні налаштування обробки торця».
 *
 * Копіюється ВСЕ: лицьове й тильне ребро, зв'язка, ділянка з прив'язкою,
 * ручне доопрацювання — саме «ідентичні», а не лише форма. Порожній
 * взірець (без кромки) так само переноситься: ціль стає без кромки.
 * Рядковий старий формат нормалізується у повний запис.
 */
export function copyEdgeTreatment(
  profiles: EdgeProfileSelection | undefined,
  from: string,
  to: string,
): EdgeProfileSelection {
  const next: EdgeProfileSelection = { ...(profiles ?? {}) };
  if (from === to) return next;
  const source = normalizeEdgeTreatment(profiles?.[from]);
  if (!source || !hasEdgeTreatment(source)) {
    delete next[to];
    return next;
  }
  next[to] = {
    ...source,
    top: source.top ? { ...source.top } : undefined,
    bottom: source.bottom ? { ...source.bottom } : undefined,
  };
  return next;
}
