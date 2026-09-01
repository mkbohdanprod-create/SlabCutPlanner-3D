/**
 * Полярність бандажа на дузі (FG-27, зауваження Богдана 19.08).
 *
 * Правило: на ОПУКЛОМУ куті зовнішні кола збігаються — бандаж втоплений у
 * стільницю (r−t … r); на УВІГНУТОМУ збігаються внутрішні — бандаж обіймає
 * дугу ззовні (r … r+t).
 *
 * Кут визначається пробою: точка трохи далі від центру дуги в матеріалі ⇒
 * кут увігнутий. Тест тримає головну пастку: проба МУСИТЬ іти по щільному
 * контуру з дугами. По списку вершин кут лишається гострим, і на опуклому
 * куті проба падала в зрізаний ріг («матеріал») — бандаж вилазив назовні.
 */
import { describe, it, expect } from 'vitest';
import { buildDetailShape, getDetailPointsAndBounds, sampleContourPoints } from '../shapeBuilder';
import { pointInPolygonStrict } from '../geometryUtils';
import { createDraft } from '../../components/forms/utils/draftHelpers';

/** Та сама проба, що в Detail3DPreview / ProductElement3DNode. */
function probeIsReflex(draft: ReturnType<typeof createDraft>, cornerArcId: string) {
  const { points, bounds } = getDetailPointsAndBounds(draft);
  const { curves, edgeMap } = buildDetailShape(draft, points, bounds);

  const index = Object.entries(edgeMap).find(([, id]) => id === cornerArcId)?.[0];
  expect(index, `дуга ${cornerArcId} не знайдена в контурі`).toBeDefined();
  const arc = curves[Number(index)] as unknown as { getPoint: (t: number) => { x: number; y: number }; aX: number; aY: number };

  const wMm = (bounds.maxX - bounds.minX) || 1;
  const hMm = (bounds.maxY - bounds.minY) || 1;
  const toMm = (p: { x: number; y: number }) => ({
    x: bounds.minX + p.x * wMm,
    y: bounds.minY + p.y * hMm,
  });

  const densePoly = sampleContourPoints(curves as never).map(toMm);
  const mid = toMm(arc.getPoint(0.5));
  const center = toMm({ x: arc.aX, y: arc.aY });
  const dx = mid.x - center.x;
  const dy = mid.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  const step = Math.max(4, len * 0.08);
  const probe = { x: mid.x + (dx / len) * step, y: mid.y + (dy / len) * step };
  return pointInPolygonStrict(probe, densePoly);
}

describe('опуклий чи увігнутий — проба по щільному контуру', () => {
  it('опуклий кут прямокутника: точка за дугою — повітря, кут НЕ увігнутий', () => {
    const draft = {
      ...createDraft(),
      kind: 'rect' as const,
      width: 2000,
      height: 600,
      corners: { AB: { type: 'radius' as const, radius: 150 } },
    };
    expect(probeIsReflex(draft, 'AB_radius')).toBe(false);
  });

  it('внутрішній кут Г-форми: точка за дугою — матеріал, кут увігнутий', () => {
    const draft = {
      ...createDraft(),
      kind: 'l' as const,
      outerWidth: 2000,
      outerHeight: 1200,
      innerHorizontal: 900,
      innerVertical: 500,
      corners: { C: { type: 'radius' as const, radius: 150 } },
    };
    expect(probeIsReflex(draft, 'C_radius')).toBe(true);
  });

  it('малий радіус на великій деталі не плутає пробу кроком дискретизації', () => {
    const draft = {
      ...createDraft(),
      kind: 'rect' as const,
      width: 3200,
      height: 1400,
      corners: { BC: { type: 'radius' as const, radius: 30 } },
    };
    expect(probeIsReflex(draft, 'BC_radius')).toBe(false);
  });
});
