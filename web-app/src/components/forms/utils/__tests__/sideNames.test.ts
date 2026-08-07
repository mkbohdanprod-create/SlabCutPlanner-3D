import { describe, it, expect } from 'vitest';
import { getSideSize } from '../draftHelpers';
import { jointAnchorPoints } from '../../../../domain/joints';
import type { DetailDraft } from '../draftHelpers';

/**
 * СТОРОЖ ВІДПОВІДНОСТІ ІМЕН СТОРІН: UI проти контуру рушія.
 *
 * Довжина сторони X у таблиці редактора мусить дорівнювати довжині ребра X
 * на контурі, який іде в розкрій. Джерело імен — кути з jointAnchorPoints
 * (ними ж користується рушій різу): сторона L_SIDE_IDS[i] з'єднує кут
 * L_CORNER_IDS[i] з наступним.
 *
 * Цей тест існує, бо відповідність УЖЕ ламалась: у getSideSize для Г-форми
 * сторони B і D були переплутані місцями. Таблиця показувала B=400/D=500,
 * а креслення, 3D і розкрій — B=500/D=400. Менеджер правив «сторону B»,
 * а мінявся виріз. Копія цього ж мапінгу жила ще й у DimensionsTable і
 * була переплутана так само — виправлення одного файлу не помітило б другого,
 * тому копію видалено, а сюди поставлено сторожа.
 */

function contourLengths(shape: string, geometry: never, cornerOrder: string[], sideOrder: string[]): Record<string, number> {
  const pts = jointAnchorPoints(shape, geometry)!;
  const out: Record<string, number> = {};
  for (let i = 0; i < cornerOrder.length; i++) {
    const a = pts[cornerOrder[i]];
    const b = pts[cornerOrder[(i + 1) % cornerOrder.length]];
    out[sideOrder[i]] = Math.hypot(b.x - a.x, b.y - a.y);
  }
  return out;
}

describe('імена сторін: таблиця редактора = контур рушія', () => {
  it('Г-подібна: усі шість сторін збігаються (кейс із бага: 1200×900, виріз 500/400)', () => {
    const draft = {
      kind: 'l', outerWidth: 1200, outerHeight: 900, innerHorizontal: 500, innerVertical: 400,
    } as DetailDraft;
    const engine = contourLengths(
      'Г-подібна', draft as never,
      ['start', 'A', 'B', 'C', 'D', 'E'],
      ['A', 'B', 'C', 'D', 'E', 'F'],
    );
    for (const side of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(getSideSize(draft, side), `сторона ${side}`).toBe(engine[side]);
    }
    // Явно значення з бага: B — коротка права (500), D — внутрішня вертикаль (400)
    expect(getSideSize(draft, 'B')).toBe(500);
    expect(getSideSize(draft, 'D')).toBe(400);
  });

  it('П-подібна: усі вісім сторін збігаються', () => {
    const draft = {
      kind: 'u', width: 2400, height: 600,
      innerCutWidth: 1200, innerCutDepth: 300, innerCutOffset: 600,
      leftLegHeight: 600, rightLegHeight: 600,
    } as DetailDraft;
    const engine = contourLengths(
      'П-подібна', draft as never,
      ['start', 'A', 'B', 'C', 'D', 'E', 'F', 'G'],
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    );
    for (const side of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      expect(getSideSize(draft, side), `сторона ${side}`).toBe(engine[side]);
    }
  });

  it('Прямокутна: A/C — ширина, B/D — висота', () => {
    const draft = { kind: 'rect', width: 2000, height: 600 } as DetailDraft;
    expect(getSideSize(draft, 'A')).toBe(2000);
    expect(getSideSize(draft, 'B')).toBe(600);
    expect(getSideSize(draft, 'C')).toBe(2000);
    expect(getSideSize(draft, 'D')).toBe(600);
  });
});
