import * as THREE from 'three';
import { attachmentPlacement } from './transform3d';

/**
 * СТИКИ 45° У ЗБІРЦІ ВИРОБУ — спільна математика для обох 3D (02.09.2026).
 *
 * До сьогодні план мітр (стик доповнення зі стільницею + зрізи сусідніх
 * смуг на опуклому куті) жив ЛИШЕ в редакторі виробу
 * (Detail3DPreview.DetailAssemblyGroup) — тому в «3D Підборі» нога і
 * потовщення стояли встик без 45°, хоча гроші за miter45 уже рахувались.
 * Власник 02.09: «в 3D Підборі обробка кромок і зрізи по 45 не
 * відображаються». Тепер план будується тут і викликається з обох
 * рендерів; формули — ті самі, що були в редакторі (звірені з
 * engines/transform3d: attachmentPlacement / getEdgeTransform).
 */

/**
 * Назви — як у цеху (domain/ids EDGE_KIND_LABEL): код `fold` — це
 * ПОТОВЩЕННЯ (заусовка 45°, текстура йде через ребро) — завжди мітра, як і
 * нога (їх стик у кошторисі вже miter45); код `thickening` — це ПІДВОРОТ
 * (пряма підклейка знизу) — мітра лише на керамограніті (каталог цеху:
 * стик 45° опуску), на кварциті лишається прямим стиком без скосу.
 */
export function miterJointFor(kind: string | undefined, material?: string | null): boolean {
  if (kind === 'fold' || kind === 'leg') return true;
  if (kind === 'thickening') return material === 'Керамограніт';
  return false;
}

export const MITER_BIG = 10;

/**
 * Дві половини простору по одній площині 45° через верхнє ребро плити.
 * Система групи ребра (як у блоці ATTACHMENTS): x — уздовж ребра, y —
 * вгору, 0 — верхня площина на лінії ребра, +z — УСЕРЕДИНУ плити (нога й
 * потовщення стоять під ребром: z ∈ [0, t], верх на y = 0 — і накладаються
 * на плиту, звідси й потреба у зрізі). `main` забирає у плити клин
 * знизу-зовні (переріз: (0,0)–(0,−t)–(t,−t)), `child` — у доповнення
 * дзеркальний клин зверху-зсередини; разом — чистий кут зі швом на ребрі.
 * Обидва обмежені по x зоною контакту (spanLen навколо posX). `child`
 * переведено в простір меша доповнення (T(childPos)·R(childRot))⁻¹; `main`
 * лишається в системі групи ребра — його переводить викликач.
 */
export function miterCutters(args: { posX: number; spanLen: number; childPos: [number, number, number]; childRot: [number, number, number] }) {
  const { posX, spanLen, childPos, childRot } = args;
  const main = new THREE.BoxGeometry(spanLen, MITER_BIG, MITER_BIG);
  main.translate(0, 0, MITER_BIG / 2);     // півпростір z > 0 …
  main.rotateX((3 * Math.PI) / 4);         // … повернутий у (0, −1, −1)/√2: знизу-зовні від ребра
  main.translate(posX, 0, 0);
  const child = new THREE.BoxGeometry(spanLen, MITER_BIG, MITER_BIG);
  child.translate(0, 0, -MITER_BIG / 2);   // протилежний півпростір: зверху-зсередини
  child.rotateX((3 * Math.PI) / 4);
  child.translate(posX, 0, 0);
  const childMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...childPos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...childRot)),
    new THREE.Vector3(1, 1, 1),
  );
  child.applyMatrix4(childMatrix.invert());
  return { main, child };
}

/** Доповнення на ребрі — рівно ті поля, що потрібні для плану мітр. */
export interface MiterAttachment {
  slot: string;
  /** Вид доповнення з parseAdditionSlot: leg / fold / thickening / wall_panel / skirting … */
  kind: string | undefined;
  draft: {
    width?: number;
    height?: number;
    thickness?: number;
    attachOffset?: number;
    attachInset?: number;
    attachGap?: number;
  };
}

export interface PlacedMiter {
  childPos: [number, number, number];
  childRot: [number, number, number];
  cutters: THREE.BufferGeometry[];
  /** Межі смуги в рамці ребра: x уздовж ребра від середини, y ≤ 0 під верхньою площиною. */
  xMin: number; xMax: number; yMin: number; yMax: number;
  /** Рамка ребра → рамка збірки. */
  edgeMatrix: THREE.Matrix4;
}

/**
 * План стиків 45° (01.09, перенесено в рушій 02.09). Для кожного
 * доповнення, що звисає з ребра (нога, потовщення `fold`, підворот
 * `thickening`): де воно стоїть (врівень під ребром) і його різаки.
 * Два види різаків:
 *
 *  · зі СТІЛЬНИЦЕЮ (miterCutters, коли miterJointFor): клин у плити
 *    йде в меш стільниці як extraCutters, клин у доповнення — в його меш;
 *  · між СУСІДНІМИ доповненнями на опуклому куті (власник 01.09:
 *    «потовщення перетинаються між собою, але обробку 45 не отримали»):
 *    обидва зрізаються вертикальною площиною через вершину кута з
 *    нормаллю d₁+d₂ — 45° у плані для прямого кута, бісектриса для
 *    будь-якого іншого. Кожне зрізається в межах ВИСОТИ сусіда: дві
 *    однакові смуги — повний ус; нога з потовщенням — нога отримує лише
 *    виїмку зверху під смугу, нижче лишається цілою, смуга закінчується
 *    45°. Увігнуті кути не чіпаємо (там смуги не перетинаються).
 */
export function buildAssemblyMiterPlan(args: {
  /** Прямі сегменти контуру з іменами сторін (нормалізовані 0..1 координати). */
  segments: Array<{ id: string; v1: { x: number; y: number }; v2: { x: number; y: number } }>;
  /** Повний список кривих контуру (для проходу по кутах); можна не давати — кути пропустяться. */
  curves?: Array<{ type: string; getPoint: (t: number) => { x: number; y: number } }>;
  /** Індекс кривої → ім'я сторони (той самий, що buildDetailShape.edgeMap). */
  edgeMap?: Record<number, string>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  thicknessMm: number;
  material?: string | null;
  /** Доповнення верхнього рівня на ребрі — викликач сам фільтрує легасі-дублі. */
  attachmentsOn: (sideId: string) => MiterAttachment[];
}) {
  const { segments, curves, edgeMap, bounds, thicknessMm, material, attachmentsOn } = args;
  const mainCutters: THREE.BufferGeometry[] = [];
  const bySlot = new Map<string, PlacedMiter>();
  const byEdge = new Map<string, PlacedMiter[]>();
  const w = bounds.maxX - bounds.minX || 1;
  const h = bounds.maxY - bounds.minY || 1;
  const s = 0.001;
  const thickness = thicknessMm * s;
  const sceneXZ = (p: { x: number; y: number }) => ({ x: (p.x - 0.5) * w * s, z: (p.y - 0.5) * h * s });
  for (const item of segments) {
    const pId = item.id;
    const here = attachmentsOn(pId);
    if (!here.length) continue;
    const p1 = sceneXZ(item.v1); const p2 = sceneXZ(item.v2);
    const midX = (p1.x + p2.x) / 2; const midY = (p1.z + p2.z) / 2;
    const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x);
    const edgeLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const edgeMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(midX, thickness / 2, midY),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -angle, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    for (const { slot, draft, kind } of here) {
      const goesDown = kind === 'leg' || kind === 'fold' || kind === 'thickening';
      if (!goesDown) continue;
      const defaultHeight = kind === 'leg' ? 900 : kind === 'fold' ? 100 : 40;
      const height = (draft.height || defaultHeight) * s;
      const gapY = (draft.attachGap ?? 0) * s;
      const { posX, insetZ } = attachmentPlacementNorm(item.v1, item.v2, bounds, draft.width, draft.attachOffset ?? 0, draft.attachInset ?? 0);
      const childThickness = (draft.thickness || thicknessMm) * s;
      // Врівень із торцем плити: зовнішня площина доповнення на лінії ребра (+z — усередину)
      const childPos: [number, number, number] = [posX, -(height / 2 + gapY), childThickness / 2 + insetZ];
      const childRot: [number, number, number] = [-Math.PI / 2, 0, 0];
      const spanLen = Math.min(edgeLen, ((draft.width || 0) * s) || edgeLen);
      const placed: PlacedMiter = {
        childPos, childRot, cutters: [], edgeMatrix,
        xMin: posX - spanLen / 2, xMax: posX + spanLen / 2, yMin: -(height + gapY), yMax: -gapY,
      };
      if (miterJointFor(kind, material)) {
        const cut = miterCutters({ posX, spanLen, childPos, childRot });
        cut.main.rotateY(-angle);
        cut.main.translate(midX, thickness / 2, midY);
        mainCutters.push(cut.main);
        placed.cutters.push(cut.child);
      }
      bySlot.set(slot, placed);
      if (!byEdge.has(pId)) byEdge.set(pId, []);
      byEdge.get(pId)!.push(placed);
    }
  }

  // КУТИ: сусідні смуги на опуклому куті — зріз по бісектрисі
  if (byEdge.size >= 2 && curves && edgeMap) {
    // Орієнтація обходу контуру (за самими кривими, бо форма могла бути дзеркальна)
    let area2 = 0;
    for (let i = 0; i < curves.length; i += 1) {
      const a = sceneXZ(curves[i].getPoint(0));
      const b = sceneXZ(curves[(i + 1) % curves.length].getPoint(0));
      area2 += a.x * b.z - b.x * a.z;
    }
    const orientation = Math.sign(area2) || 1;
    const EPS_Y = 0.0005; // 0,5 мм понад висоту сусіда — щоб грані різака не збігались із гранями смуги
    const childMatrixOf = (pl: PlacedMiter) => new THREE.Matrix4().compose(
      new THREE.Vector3(...pl.childPos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...pl.childRot)),
      new THREE.Vector3(1, 1, 1),
    );
    const cornerCutter = (V: { x: number; z: number }, n: { x: number; z: number }, sign: 1 | -1, neighbour: PlacedMiter, target: PlacedMiter) => {
      const yMin = thickness / 2 + neighbour.yMin - EPS_Y;
      const yMax = thickness / 2 + neighbour.yMax + EPS_Y;
      const geo = new THREE.BoxGeometry(MITER_BIG, yMax - yMin, MITER_BIG);
      geo.translate(sign * MITER_BIG / 2, (yMin + yMax) / 2, 0); // півпростір попереду (+) або позаду (−) вершини вздовж n
      geo.rotateY(Math.atan2(-n.z, n.x));                        // +x → n
      geo.translate(V.x, 0, V.z);
      const full = target.edgeMatrix.clone().multiply(childMatrixOf(target));
      geo.applyMatrix4(full.invert());
      return geo;
    };
    for (let i = 0; i < curves.length; i += 1) {
      const c1 = curves[i]; const c2 = curves[(i + 1) % curves.length];
      if (c1.type !== 'LineCurve' || c2.type !== 'LineCurve') continue;
      const id1 = edgeMap[i]; const id2 = edgeMap[(i + 1) % curves.length];
      if (!id1 || !id2 || id1 === id2) continue;
      const on1 = byEdge.get(id1); const on2 = byEdge.get(id2);
      if (!on1?.length || !on2?.length) continue;
      const l1 = c1 as unknown as { v1: { x: number; y: number }; v2: { x: number; y: number } };
      const l2 = c2 as unknown as { v1: { x: number; y: number }; v2: { x: number; y: number } };
      if (Math.hypot(l1.v2.x - l2.v1.x, l1.v2.y - l2.v1.y) > 1e-6) continue; // не спільна вершина
      const a1 = sceneXZ(l1.v1); const V = sceneXZ(l1.v2); const b2 = sceneXZ(l2.v2);
      const L1 = Math.hypot(V.x - a1.x, V.z - a1.z); const L2 = Math.hypot(b2.x - V.x, b2.z - V.z);
      if (L1 < 1e-9 || L2 < 1e-9) continue;
      const d1 = { x: (V.x - a1.x) / L1, z: (V.z - a1.z) / L1 };
      const d2 = { x: (b2.x - V.x) / L2, z: (b2.z - V.z) / L2 };
      const cross = d1.x * d2.z - d1.z * d2.x;
      if (cross * orientation <= 1e-9) continue; // лише опуклий кут
      const nLen = Math.hypot(d1.x + d2.x, d1.z + d2.z) || 1;
      const n = { x: (d1.x + d2.x) / nLen, z: (d1.z + d2.z) / nLen };
      for (const a of on1) {
        if (a.xMax < L1 / 2 - 1e-6) continue; // смуга не доходить до кута
        for (const b of on2) {
          if (b.xMin > -L2 / 2 + 1e-6) continue;
          a.cutters.push(cornerCutter(V, n, 1, b, a));   // a лишає те, що позаду вершини
          b.cutters.push(cornerCutter(V, n, -1, a, b));  // b — те, що попереду
        }
      }
    }
  }
  return { mainCutters, bySlot };
}

/**
 * Позиція доповнення вздовж ребра — та сама формула, що
 * engines/transform3d.attachmentPlacement (яка приймає Point у
 * нормалізованих координатах). Тонка обгортка заради типів.
 */
function attachmentPlacementNorm(
  v1: { x: number; y: number },
  v2: { x: number; y: number },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  widthMm: number | undefined,
  offsetMm: number,
  insetMm: number,
) {
  return attachmentPlacement(v1 as never, v2 as never, bounds, widthMm, offsetMm, insetMm);
}
