import type { SurfaceCutout } from './types';
import { jointAnchorPoints } from './joints';

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

  let pt = jointAnchorPoints(ctx.shape, ctx.geometry)?.[bindCorner];

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

  return {
    x: pt.x,
    y: pt.y,
    dirX: pt.x <= w / 2 ? 1 : -1,
    dirY: pt.y <= h / 2 ? 1 : -1,
  };
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
