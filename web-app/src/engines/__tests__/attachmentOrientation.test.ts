/**
 * ХВИЛЯ 3 · крок 3.5 (SC-06) — одна угода про орієнтацію доповнення.
 *
 * У коді жили дві відповіді на питання «яким ребром доповнення приклеєне
 * до батька»:
 *   · `buildProductFromSession` писав у стик `b.sideId: 'A'`;
 *   · 3D (`getEdgeTransform` + меш деталі) фізично ставило біля батька
 *     ребро y = H, тобто сторону C.
 *
 * Цей тест НЕ повторює жодну з двох відповідей на віру. Він бере реальну
 * математику розміщення, проганяє через неї кути контуру як через
 * three.js-ієрархію, і дивиться, яке ребро опинилось у площині стику.
 * Отриману правду звіряє з експортованою константою.
 *
 * Тому в кого б не змінилась поведінка — у 3D чи в константі — тест впаде
 * і змусить привести їх до згоди. Саме цього бракувало: обидві сторони
 * тихо жили кожна зі своєю угодою.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATTACHMENT_CONTACT_SIDE, attachmentContactSide, getEdgeTransform } from '../transform3d';

const SCALE = 0.001;

/** Батько: стільниця 2000×600×20. Ребро A — від points[0] до points[1]. */
const PARENT = { bounds: { minX: 0, minY: 0, maxX: 2000, maxY: 600 }, thickness: 20 };
const EDGE_A = { v1: { x: 0, y: 0 }, v2: { x: 1, y: 0 } };

/** Дитина: панель/нога 2000×600×20. */
const CHILD = { width: 2000, height: 600 };

/**
 * Куди фізично потрапляє точка контуру дитини (мм у її власних координатах).
 * Відтворює рівно ту ієрархію, яку будує рендер:
 *   group(groupPosition, groupRotation)
 *     └ group(childPosition, childRotation)
 *         └ mesh(rotation = [π/2, 0, 0])   ← меш деталі кладеться плазом
 * Геометрія меша відцентрована по габариту (ExtrudeGeometry + translate).
 */
function worldPoint(kind: 'up' | 'down' | 'fold', contourX: number, contourY: number) {
  const transform = getEdgeTransform(
    EDGE_A.v1, EDGE_A.v2, PARENT.bounds, PARENT.thickness,
    CHILD.width, CHILD.height, 0, kind,
  );

  const edgeGroup = new THREE.Object3D();
  edgeGroup.position.fromArray(transform.groupPosition);
  edgeGroup.rotation.fromArray(transform.groupRotation);

  const childGroup = new THREE.Object3D();
  childGroup.position.fromArray(transform.childPosition);
  childGroup.rotation.fromArray(transform.childRotation);
  edgeGroup.add(childGroup);

  const mesh = new THREE.Object3D();
  mesh.rotation.set(Math.PI / 2, 0, 0);
  childGroup.add(mesh);

  edgeGroup.updateMatrixWorld(true);
  return mesh.localToWorld(new THREE.Vector3(
    (contourX - CHILD.width / 2) * SCALE,
    (contourY - CHILD.height / 2) * SCALE,
    0,
  ));
}

/** Площина, у якій лежить поверхня батька — саме там проходить шов. */
const SEAM_Y = (PARENT.thickness * SCALE) / 2;

/** Яке ребро контуру дитини лягло у площину шва: A (y = 0) чи C (y = H). */
function contactSideOf(kind: 'up' | 'down' | 'fold') {
  const sideA = worldPoint(kind, CHILD.width / 2, 0);
  const sideC = worldPoint(kind, CHILD.width / 2, CHILD.height);
  return Math.abs(sideA.y - SEAM_Y) < Math.abs(sideC.y - SEAM_Y) ? 'A' : 'C';
}

describe('SC-06: контракт стику збігається з фізикою 3D', () => {
  it.each(['up', 'down', 'fold'] as const)(
    'кріплення «%s» контактує з батьком стороною з константи',
    (kind) => {
      expect(contactSideOf(kind)).toBe(ATTACHMENT_CONTACT_SIDE);
      expect(attachmentContactSide(kind)).toBe(ATTACHMENT_CONTACT_SIDE);
    },
  );

  it('панель угору і нога вниз користуються ОДНІЄЮ стороною', () => {
    // Знаки повороту в getEdgeTransform різні саме заради цього: інакше
    // панель клеїлась би одним ребром, а нога протилежним, і жодна єдина
    // угода була б неможлива.
    expect(contactSideOf('down')).toBe(contactSideOf('up'));
    expect(contactSideOf('fold')).toBe(contactSideOf('up'));
  });

  it('вільне ребро — протилежне до шва, і воно справді далеко', () => {
    const free = ATTACHMENT_CONTACT_SIDE === 'A' ? CHILD.height : 0;
    const point = worldPoint('up', CHILD.width / 2, free);
    // Панель заввишки 600 мм: вільний край має бути на 0.6 одиниці вище шва.
    expect(Math.abs(point.y - SEAM_Y)).toBeCloseTo(CHILD.height * SCALE, 4);
  });

  it('нога звисає ВНИЗ, панель стоїть УГОРУ — напрямок не переплутано', () => {
    const freeY = ATTACHMENT_CONTACT_SIDE === 'A' ? CHILD.height : 0;
    expect(worldPoint('up', CHILD.width / 2, freeY).y).toBeGreaterThan(SEAM_Y);
    expect(worldPoint('down', CHILD.width / 2, freeY).y).toBeLessThan(SEAM_Y);
  });

  it('уздовж ребра деталь не дзеркалиться: x росте разом із контуром', () => {
    for (const kind of ['up', 'down', 'fold'] as const) {
      const left = worldPoint(kind, 0, CHILD.height / 2);
      const right = worldPoint(kind, CHILD.width, CHILD.height / 2);
      expect(right.x, kind).toBeGreaterThan(left.x);
    }
  });
});
