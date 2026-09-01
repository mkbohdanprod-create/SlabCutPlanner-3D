import type { Point, SurfaceCutout } from './types';
import { jointAnchorPoints } from './joints';
import { contourVertexOrder, cornerIdForSides } from './sideNaming';
import { pointInPolygonOrOn, pointInPolygonStrict } from '../engines/geometryUtils';

/**
 * ПРИВ'ЯЗКА ВИРІЗУ ДО КУТА ДЕТАЛІ — єдине джерело істини.
 *
 * Правило власника (07.08.2026), і воно різне для двох форм:
 *
 *   · ПРЯМОКУТНИЙ виріз міряється від кута деталі до найближчого КУТА ВИРІЗУ —
 *     рулеткою, як у цеху.
 *   · КРУГЛИЙ отвір (розетка, змішувач) міряється до ЦЕНТРУ. У кола кута немає,
 *     а «кут описаного квадрата» технологу нічого не каже: на кресленнях отвір
 *     завжди задають координатою центру.
 *
 * Рушій розкрою, 3D і креслення оперують ЦЕНТРОМ — так простіше будувати отвір
 * і перевіряти, у який сегмент він потрапив. Переведення «прив'язка → центр»
 * робить рівно ця функція, і кликати її мусять ВСІ споживачі. Інакше
 * повториться головна хвороба проєкту: користувач бачить одне число, а в
 * розкрій іде інше.
 */

/** Габарит вирізу (описаний прямокутник). Для кола — діаметр. */
export function cutoutBox(cutout: Pick<SurfaceCutout, 'shape' | 'width' | 'height' | 'radius'>): { w: number; h: number } {
  if (cutout.shape === 'circle') {
    const d = (cutout.radius || 0) * 2;
    return { w: d, h: d };
  }
  return { w: cutout.width || 0, h: cutout.height || 0 };
}

/**
 * Наскільки глибше центр лежить за точкою, яку задає користувач.
 * Прямокутник — пів габариту (бо задано кут), коло — нуль (бо задано центр).
 */
function anchorHalfOffset(cutout: Pick<SurfaceCutout, 'shape' | 'width' | 'height' | 'radius'>): { hx: number; hy: number } {
  if (cutout.shape === 'circle') return { hx: 0, hy: 0 };
  const { w, h } = cutoutBox(cutout);
  return { hx: w / 2, hy: h / 2 };
}

/** Чи задає користувач центр (коло), а не кут (прямокутник) */
export function isCenterAnchored(shape: SurfaceCutout['shape']): boolean {
  return shape === 'circle';
}

export interface CutoutAnchor {
  /** Точка кута деталі, від якої міряємо */
  x: number;
  y: number;
  /** Напрямок «всередину деталі»: +1 або −1 по кожній осі */
  dirX: number;
  dirY: number;
}

export interface AnchorShapeContext {
  /** Форма деталі: 'Прямокутна' | 'Г-подібна' | 'П-подібна' | … */
  shape?: string;
  /** Геометрія деталі — те саме, що читає jointAnchorPoints */
  geometry?: Parameters<typeof jointAnchorPoints>[1];
  /** Габарит деталі, мм */
  width: number;
  height: number;
}

/**
 * Точка іменованого кута деталі і напрямок усередину.
 *
 * Імена кутів беремо з `jointAnchorPoints` — того самого джерела, яким
 * користується панель стиків. Другої таблиці імен кутів у проєкті бути не
 * повинно. Для прямокутника є запасний шлях: чотири кути рахуються з габариту,
 * бо `jointAnchorPoints` може не знати деталь без стиків.
 */
export function cornerAnchor(ctx: AnchorShapeContext, bindCorner: string | undefined): CutoutAnchor | undefined {
  if (!bindCorner) return undefined;

  const w = Math.max(1, ctx.width);
  const h = Math.max(1, ctx.height);

  const anchors = jointAnchorPoints(ctx.shape, ctx.geometry);

  /*
   * FG-18, причина перша: РІЗНІ ІМЕНА В ІНТЕРФЕЙСІ Й У ДАНИХ.
   *
   * Вікно вирізу пропонує кути парами літер (`DE`), а у складних форм
   * ключ у даних — ім'я вершини (`D`). Пряме читання `anchors['DE']`
   * давало undefined, функція поверталась ні з чим, і `cutoutCenter`
   * чесно міряв «від початку координат» — тобто від лівого верхнього
   * кута. Виріз опинявся за кілометр від того місця, яке задав менеджер.
   */
  const vertexId = anchors?.[bindCorner]
    ? bindCorner
    : cornerIdForSides(bindCorner, ctx.shape) ?? bindCorner;

  let pt = anchors?.[vertexId];

  if (!pt) {
    const rectCorners: Record<string, { x: number; y: number }> = {
      DA: { x: 0, y: 0 },
      AB: { x: w, y: 0 },
      BC: { x: w, y: h },
      CD: { x: 0, y: h },
    };
    pt = rectCorners[bindCorner];
  }
  if (!pt) return undefined;

  /*
   * FG-18, причина друга: НАПРЯМОК «ВСЕРЕДИНУ» БРАВСЯ З ГАБАРИТУ.
   *
   * Було `pt.x <= w / 2 ? 1 : -1` — тобто «якщо кут у лівій половині
   * габаритного прямокутника, міряємо вправо». На прямокутнику це завжди
   * правда, на Г- і П-подібній — ні: там кут може стояти посеред
   * габариту, і відступ ішов у бік, де матеріалу немає.
   *
   * Тепер напрямок читається з САМОГО КОНТУРУ — по двох ребрах, що
   * сходяться в цьому куті. Для увігнутого кута (їх на Г одна, на П дві)
   * ребра дають напрямок у виїмку, тому результат перевіряється пробною
   * точкою і за потреби перебираються решта чвертей.
   */
  const contour = contourOf(ctx, anchors);
  const fromContour = contour ? inwardFromContour(contour, vertexId, ctx, anchors) : undefined;

  return {
    x: pt.x,
    y: pt.y,
    dirX: fromContour?.dirX ?? (pt.x <= w / 2 ? 1 : -1),
    dirY: fromContour?.dirY ?? (pt.y <= h / 2 ? 1 : -1),
  };
}

/** Контур деталі в тому самому порядку, у якому його будує рушій. */
function contourOf(
  ctx: AnchorShapeContext,
  anchors: Record<string, { x: number; y: number }> | undefined,
): Array<{ x: number; y: number }> | undefined {
  const order = contourVertexOrder(ctx.shape);
  if (!order || !anchors) return undefined;
  const points = order.map((id) => anchors[id]).filter(Boolean);
  return points.length === order.length ? points : undefined;
}

/**
 * Напрямок «усередину деталі» від вершини контуру.
 *
 * Перше наближення — сума двох ребер, що сходяться у вершині: для
 * опуклого кута воно одразу правильне. Далі пробна точка на 1 мм
 * перевіряє, що там справді матеріал; якщо ні (увігнутий кут) —
 * перебираються решта чвертей.
 */
function inwardFromContour(
  contour: Array<{ x: number; y: number }>,
  vertexId: string,
  ctx: AnchorShapeContext,
  anchors: Record<string, { x: number; y: number }> | undefined,
): { dirX: number; dirY: number } | undefined {
  const order = contourVertexOrder(ctx.shape);
  if (!order || !anchors) return undefined;
  const index = order.indexOf(vertexId);
  if (index < 0) return undefined;

  const here = contour[index];
  const prev = contour[(index - 1 + contour.length) % contour.length];
  const next = contour[(index + 1) % contour.length];

  const sign = (value: number) => (value < 0 ? -1 : 1);
  const first = {
    dirX: sign((prev.x - here.x) + (next.x - here.x)),
    dirY: sign((prev.y - here.y) + (next.y - here.y)),
  };

  // Пробна точка свідомо крихітна: вона перевіряє бік, а не вміщення
  // вирізу. За вміщення відповідає перевірка у вікні вирізу.
  const PROBE_MM = 1;
  const hasMaterial = (dirX: number, dirY: number) => pointInPolygonStrict(
    { x: here.x + dirX * PROBE_MM, y: here.y + dirY * PROBE_MM },
    contour as Point[],
  );

  if (hasMaterial(first.dirX, first.dirY)) return first;
  const candidates = [
    { dirX: first.dirX, dirY: -first.dirY },
    { dirX: -first.dirX, dirY: first.dirY },
    { dirX: -first.dirX, dirY: -first.dirY },
  ];
  return candidates.find((c) => hasMaterial(c.dirX, c.dirY)) ?? first;
}

/**
 * Центр вирізу в координатах деталі:
 *
 *     центр = кут_деталі + напрямок × (відступ + півгабариту)
 *
 * Приклад із практики: прямокутна стільниця, прив'язка AB (правий верхній кут),
 * відступ 100/100, виріз 100×100. Кут вирізу опиниться рівно за 100 мм від
 * кута AB по обох осях — саме те, що менеджер намалював на ескізі.
 * Для кола ті самі 100/100 дадуть центр за 100 мм від кута.
 *
 * Без прив'язки міряємо від початку координат деталі (лівий верхній кут).
 */
export function cutoutCenter(
  cutout: Pick<SurfaceCutout, 'shape' | 'width' | 'height' | 'radius' | 'x' | 'y' | 'bindCorner'>,
  ctx: AnchorShapeContext,
): { cx: number; cy: number } {
  const { hx, hy } = anchorHalfOffset(cutout);
  const anchor = cornerAnchor(ctx, cutout.bindCorner);

  if (!anchor) {
    return { cx: cutout.x + hx, cy: cutout.y + hy };
  }

  return {
    cx: anchor.x + anchor.dirX * (cutout.x + hx),
    cy: anchor.y + anchor.dirY * (cutout.y + hy),
  };
}

/**
 * ЧИ ВМІЩАЄТЬСЯ ВИРІЗ У РЕАЛЬНИЙ КОНТУР (друга половина FG-18).
 *
 * FG-16 навчив вікно вирізу відмовляти, коли відступ виводить виріз за
 * ГАБАРИТ. Але на Г- і П-подібній габарит бреше: у виїмці матеріалу
 * немає, а прямокутник каже, що є. Тому тут перевірка йде по самому
 * контуру.
 *
 * Повертає `undefined`, коли судити нема з чого (форма без відомого
 * контуру — коло, імпорт, довільний елемент). Це важливо: «не знаю» і
 * «все добре» — різні відповіді, і мовчазна згода тут коштувала б
 * зламаної деталі.
 */
export function cutoutOutsideContour(
  cutout: Pick<SurfaceCutout, 'shape' | 'width' | 'height' | 'radius' | 'x' | 'y' | 'bindCorner'>,
  ctx: AnchorShapeContext,
): boolean | undefined {
  const anchors = jointAnchorPoints(ctx.shape, ctx.geometry);
  const contour = contourOf(ctx, anchors);
  if (!contour) return undefined;

  const { cx, cy } = cutoutCenter(cutout, ctx);
  const { w, h } = cutoutBox(cutout);
  if (w <= 0 || h <= 0) return undefined;

  const probes: Point[] = [{ x: cx, y: cy }];
  if (cutout.shape === 'circle') {
    const r = (cutout.radius || 0);
    // Вісім точок по колу: чотирьох мало — виріз може вилізти «кутом».
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      probes.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  } else {
    probes.push(
      { x: cx - w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy + h / 2 },
      { x: cx - w / 2, y: cy + h / 2 },
    );
  }

  // `OrOn`, а не `Strict`: виріз, що впритул торкається краю, — це паз,
  // цілком законна річ, і відмовляти в ньому не можна.
  return probes.some((point) => !pointInPolygonOrOn(point, contour as Point[]));
}

/**
 * Виріз із координатами, переведеними в АБСОЛЮТНИЙ ЦЕНТР деталі.
 *
 * Це «шлюз» для споживачів, які чекають центр: рушій розкрою, 3D, креслення,
 * перевірка виробничості. Вони лишаються без змін, а математика прив'язки
 * живе тільки тут.
 */
export function toCenterCutout(cutout: SurfaceCutout, ctx: AnchorShapeContext): SurfaceCutout {
  const { cx, cy } = cutoutCenter(cutout, ctx);
  return cx === cutout.x && cy === cutout.y ? cutout : { ...cutout, x: cx, y: cy };
}

/** Те саме для всієї довідки вирізів. Повертає ТУ САМУ довідку, якщо міняти нічого. */
export function toCenterCutouts(
  cutouts: Record<string, SurfaceCutout> | undefined,
  ctx: AnchorShapeContext,
): Record<string, SurfaceCutout> | undefined {
  if (!cutouts) return cutouts;
  let changed = false;
  const out: Record<string, SurfaceCutout> = {};
  for (const [id, c] of Object.entries(cutouts)) {
    const next = toCenterCutout(c, ctx);
    if (next !== c) changed = true;
    out[id] = next;
  }
  return changed ? out : cutouts;
}
