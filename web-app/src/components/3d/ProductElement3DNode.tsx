import  { useMemo } from 'react';
import * as THREE from 'three';
import type { ProductElement } from '../../domain/types';
import { Detail3DNode } from '../ui/Detail3DPreview';
import { buildDetailShape, getDetailPointsAndBounds, sampleContourPoints } from '../../engines/shapeBuilder';
import { parseAdditionSlot } from '../../domain/ids';
import { getEdgeTransform } from '../../engines/transform3d';
import { getSinkPartTransform } from '../../engines/sinkAssembly';
import { sinkCenter } from '../../domain/productSink';
import { pointInPolygonStrict } from '../../engines/geometryUtils';
import { buildGrateCutters } from '../../engines/drainGrate';
import { buildEdgeCutters, subtractEdgeCutters } from '../../engines/edgeCutters';
import { buildAssemblyMiterPlan } from '../../engines/miterAssembly';
import type { RadiusElementMark } from '../../domain/types';

/**
 * Куди «росте» доповнення від ребра батька. Тип беремо з розбору слота, а не
 * з `includes('leg_')`: у слоті `leg_C_fold_B` обидва слова присутні, і
 * підворот на нозі раніше міг прочитатися як нога.
 */
function attachmentDirection(slot: string): 'up' | 'down' | 'fold' {
  const kind = parseAdditionSlot(slot).kind;
  if (kind === 'fold') return 'fold';
  /*
   * Ремонт 19.08: `thickening` (у інтерфейсі — «Підворот», підклейка під
   * плитою) падав у гілку «все інше — вгору» і стирчав над стільницею, як
   * стінова панель. Редактор (Detail3DPreview) завжди вів його вниз —
   * Підбір тепер згоден із ним.
   */
  if (kind === 'leg' || kind === 'thickening') return 'down';
  return 'up';
}

/**
 * Гнутий бандаж у 3D Підборі (FG-27) — З ТЕКСТУРОЮ СЛЯБУ.
 *
 * Чесність тут буквальна: у розкрої під цей бандаж лежить прямокутник
 * («Потовщення (B_radius)» на карті крою), і саме ЙОГО шматок слябу
 * натягується на дугу. Розгортка проста, як у цеху: довжина по дузі →
 * довжина прямокутника, висота смуги → його висота. Тобто на екрані
 * видно рівно той камінь, який відріжуть і зігнуть.
 *
 * Геометрія будується вручну (стінки, торці, кільця), бо ExtrudeGeometry
 * дає UV у координатах перерізу — текстура на дузі виходила б плямою.
 */
function buildArcBandGeometry(
  rInnerM: number,
  rOuterM: number,
  a0: number,
  a1: number,
  clockwise: boolean,
  heightM: number,
  /** Розгортка: скільки нормованого U припадає на 1 метр дуги (по зовнішньому радіусу) */
  uPerMeter: number,
  /** Скільки нормованого V припадає на 1 метр висоти */
  vPerMeter: number,
): THREE.BufferGeometry {
  let d = a1 - a0;
  if (clockwise && d > 0) d -= Math.PI * 2;
  if (!clockwise && d < 0) d += Math.PI * 2;

  const SEGMENTS = 24;
  const positions: number[] = [];
  const uvs: number[] = [];

  const quad = (
    p1: [number, number, number], p2: [number, number, number],
    p3: [number, number, number], p4: [number, number, number],
    uv1: [number, number], uv2: [number, number],
    uv3: [number, number], uv4: [number, number],
  ) => {
    positions.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
    uvs.push(...uv1, ...uv2, ...uv3, ...uv1, ...uv3, ...uv4);
  };

  const at = (f: number, r: number): [number, number] => {
    const a = a0 + d * f;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };

  for (let i = 0; i < SEGMENTS; i++) {
    const f0 = i / SEGMENTS;
    const f1 = (i + 1) / SEGMENTS;
    const u0 = rOuterM * Math.abs(d) * f0 * uPerMeter;
    const u1 = rOuterM * Math.abs(d) * f1 * uPerMeter;
    const vBot = heightM * vPerMeter;

    const [ox0, oz0] = at(f0, rOuterM);
    const [ox1, oz1] = at(f1, rOuterM);
    const [ix0, iz0] = at(f0, rInnerM);
    const [ix1, iz1] = at(f1, rInnerM);

    // Зовнішня стінка (лицьова — та, що видно з кімнати)
    quad(
      [ox0, 0, oz0], [ox1, 0, oz1], [ox1, -heightM, oz1], [ox0, -heightM, oz0],
      [u0, 0], [u1, 0], [u1, vBot], [u0, vBot],
    );
    // Внутрішня стінка
    quad(
      [ix1, 0, iz1], [ix0, 0, iz0], [ix0, -heightM, iz0], [ix1, -heightM, iz1],
      [u1, 0], [u0, 0], [u0, vBot], [u1, vBot],
    );
    // Верхнє кільце (торець товщини)
    quad(
      [ix0, 0, iz0], [ix1, 0, iz1], [ox1, 0, oz1], [ox0, 0, oz0],
      [u0, 0], [u1, 0], [u1, 0.02], [u0, 0.02],
    );
    // Нижнє кільце
    quad(
      [ox0, -heightM, oz0], [ox1, -heightM, oz1], [ix1, -heightM, iz1], [ix0, -heightM, iz0],
      [u0, vBot], [u1, vBot], [u1, vBot - 0.02], [u0, vBot - 0.02],
    );
  }

  // Торці на початку і в кінці дуги
  const capAt = (f: number, u: number) => {
    const [ox, oz] = at(f, rOuterM);
    const [ix, iz] = at(f, rInnerM);
    quad(
      [ix, 0, iz], [ox, 0, oz], [ox, -heightM, oz], [ix, -heightM, iz],
      [u, 0], [u, 0], [u, heightM * vPerMeter], [u, heightM * vPerMeter],
    );
  };
  capAt(0, 0);
  capAt(1, rOuterM * Math.abs(d) * uPerMeter);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function AssemblyArcBand({ curve, bounds, slabThicknessMm, draft, direction, outward, isActive, texture, rectWmm, rectHmm }: {
  curve: THREE.EllipseCurve;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  slabThicknessMm: number;
  draft: { thickness?: number; height?: number; attachGap?: number };
  direction: 'up' | 'down' | 'fold';
  outward: boolean;
  isActive: boolean;
  /** Текстура парта з UV-матрицею його місця на слябі (та сама, що у плоских) */
  texture?: THREE.Texture | null;
  /** Прямокутник цього бандажа в розкрої, мм — база розгортки */
  rectWmm: number;
  rectHmm: number;
}) {
  const s = 0.001;
  const w = bounds.maxX - bounds.minX || 1;
  const h = bounds.maxY - bounds.minY || 1;
  const cx = (curve.aX - 0.5) * w * s;
  const cy = (curve.aY - 0.5) * h * s;
  const rArc = Math.max(curve.xRadius * w, curve.yRadius * h) * s;
  const t = Math.max(8, draft.thickness || slabThicknessMm || 20) * s;
  const rOuter = outward ? rArc + t : rArc;
  const rInner = Math.max(0.0005, outward ? rArc : rArc - t);
  const height = Math.max(1, draft.height || (direction === 'down' ? 900 : direction === 'fold' ? 100 : 600)) * s;
  const gap = (draft.attachGap ?? 0) * s;

  const geometry = useMemo(() => buildArcBandGeometry(
    rInner, rOuter,
    curve.aStartAngle, curve.aEndAngle, curve.aClockwise,
    height,
    // 1 метр дуги = 1000/rectW нормованого U: дуга розгортається вздовж
    // прямокутника розкрою. Так на бандажі видно саме той шматок слябу.
    1000 / Math.max(1, rectWmm),
    1000 / Math.max(1, rectHmm),
  ), [rInner, rOuter, curve, height, rectWmm, rectHmm]);

  const zTop = (slabThicknessMm || 20) * s / 2;
  const goesDown = direction !== 'up';
  const y = goesDown ? zTop - gap : zTop + height + gap;

  return (
    <mesh geometry={geometry} position={[cx, y, cy]}>
      <meshPhysicalMaterial
        color={isActive ? '#bfdcff' : '#ffffff'}
        map={texture || undefined}
        roughness={0.4}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function ProductElement3DNode({
  element,
  activeDetailId = "main",
  onCornerClick,
  onPlaneClick,
  onEdgeClick,
  onJointClick,
  onLegDoubleClick,
  onWallPanelDoubleClick,
  onDetailDoubleClick,
  onDetailClick,
  onDetailContextMenu,
  mode = "view",
  editMode = "none",
  theme = "light",
  textureMode = false,
  customTextureMapFactory,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  segmentPartsFor,
  textureForPart,
  material,
  extraCutters,
}: {
  element: ProductElement;
  activeDetailId?: string;
  onCornerClick?: (id: string, x: number, y: number) => void;
  onPlaneClick?: () => void;
  onEdgeClick?: (edgeId: string, x: number, y: number) => void;
  onJointClick?: (id: string, x: number, y: number) => void;
  onLegDoubleClick?: (edgeId: string) => void;
  onWallPanelDoubleClick?: (edgeId: string) => void;
  onDetailDoubleClick?: (id: string) => void;
  onDetailClick?: (id: string) => void;
  onDetailContextMenu?: (id: string, x: number, y: number) => void;
  mode?: "view" | "edit" | "dimensions";
  editMode?: "corners" | "planes" | "edges" | "joints";
  theme?: "light" | "dark";
  textureMode?: boolean;
  customTextureMapFactory?: (detailId: string) => any; // THREE.Texture | null
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Повертає парти, що належать елементу. Для розрізаної форми їх кілька. */
  segmentPartsFor?: (elementId: string) => any[];
  /** Текстура для конкретного парта (свій шматок слябу на кожен сегмент). */
  textureForPart?: (part: any) => any;
  /** Матеріал виробу — керамограніт мітрує підворот 45° автоматично (як у редакторі). */
  material?: string | null;
  /** Різаки в просторі меша ЦІЄЇ деталі (клин 45° від батька) — прокидаються в Detail3DNode. */
  extraCutters?: THREE.BufferGeometry[];
}) {
  const detail = element.baseDefinition;
  
  // To place children, we need this element's bounds and shape curves.
  const { points, bounds } = useMemo(() => getDetailPointsAndBounds(detail), [detail]);
  
  const { curves, edgeMap } = useMemo(() => {
    return buildDetailShape(detail, points, bounds);
  }, [detail, points, bounds]);
  
  const lineSegments = useMemo(() => {
    return (curves ?? [])
      .map((curve, index) => ({ curve, id: edgeMap?.[index] }))
      .filter((item) => item.curve.type === "LineCurve" && item.id) as Array<{
      curve: any; // THREE.LineCurve
      id: string;
    }>;
  }, [curves, edgeMap]);

  /** Дуги скруглень — для гнутих доповнень (FG-27). */
  const arcSegments = useMemo(() => {
    return (curves ?? [])
      .map((curve, index) => ({ curve, id: edgeMap?.[index] }))
      .filter((item) => item.curve.type === "EllipseCurve" && item.id && /_radius$/.test(item.id)) as Array<{
      curve: THREE.EllipseCurve;
      id: string;
    }>;
  }, [curves, edgeMap]);

  /** Спільна гілка обох циклів кріплень: доповнення з позначкою дуги. */
  const renderArcAddition = (addition: ProductElement) => {
    const mark = (addition.baseDefinition as { radiusElement?: RadiusElementMark }).radiusElement;
    if (!mark) return undefined;
    const arc = arcSegments.find((item) => item.id === `${mark.cornerId}_radius`);
    if (!arc) return null;

    // Увігнутий кут чи опуклий — питаємо в геометрії: точка трохи ЗЗОВНІ
    // дуги в матеріалі ⇒ кут увігнутий, бандаж обіймає дугу ззовні.
    // Перевірка МУСИТЬ іти по щільному контуру з дугами: у списку вершин
    // кут гострий, і на опуклому куті проба падала в зрізаний ріг —
    // бандаж вважав кут увігнутим і вилазив за стільницю.
    const wMm = (bounds.maxX - bounds.minX) || 1;
    const hMm = (bounds.maxY - bounds.minY) || 1;
    const toMm = (p: { x: number; y: number }) => ({
      x: bounds.minX + p.x * wMm,
      y: bounds.minY + p.y * hMm,
    });
    const densePoly = sampleContourPoints(curves as never).map(toMm);
    const mid = toMm(arc.curve.getPoint(0.5));
    const center = toMm({ x: arc.curve.aX, y: arc.curve.aY });
    const dx = mid.x - center.x;
    const dy = mid.y - center.y;
    const len = Math.hypot(dx, dy) || 1;
    const step = Math.max(4, len * 0.08);
    const probe = { x: mid.x + (dx / len) * step, y: mid.y + (dy / len) * step };
    const outward = densePoly.length >= 3 && pointInPolygonStrict(probe, densePoly);

    const slot = addition.id.split(':').pop() || '';
    // Текстура і прямокутник — того САМОГО парта, що лежить на карті крою:
    // бандаж показує шматок слябу, який реально відріжуть під цю дугу.
    const bandPart = segmentPartsFor ? segmentPartsFor(addition.id)[0] : undefined;
    const bandTexture = customTextureMapFactory ? customTextureMapFactory(addition.id) : null;
    return (
      <AssemblyArcBand
        key={addition.id}
        curve={arc.curve}
        bounds={bounds}
        slabThicknessMm={detail.thickness || 20}
        draft={addition.baseDefinition}
        direction={attachmentDirection(slot)}
        outward={outward}
        isActive={activeDetailId === addition.id}
        texture={bandTexture}
        rectWmm={Math.max(bandPart?.width ?? 0, bandPart?.height ?? 0) || Math.max(addition.baseDefinition.width || 1, addition.baseDefinition.height || 1)}
        rectHmm={Math.min(bandPart?.width ?? Infinity, bandPart?.height ?? Infinity) || Math.min(addition.baseDefinition.width || 1, addition.baseDefinition.height || 1)}
      />
    );
  };

  // У дереві Виробу підворот/потовщення — це окремі Елементи (element.additions),
  // і вони малюються нижче. Detail3DNode уміє малювати їх ще й зі старої властивості
  // detail.fold/thickening — тому тут її глушимо, інакше отримаємо подвоєння зі зміщенням.
  // (У 3D Редакторі legacy-шлях лишається робочим — там свій компонент.)
  const detailForNode = useMemo(() => ({
    ...detail,
    fold: detail?.fold ? { ...detail.fold, enabled: false } : detail?.fold,
    thickening: detail?.thickening ? { ...detail.thickening, enabled: false } : detail?.thickening,
  }), [detail]);

  /*
   * СТИКИ 45° У ПІДБОРІ (02.09, власник: «в 3D Підборі обробка кромок і
   * зрізи по 45 не відображаються»). Той самий план, що ріже редактор
   * виробу (engines/miterAssembly): клин у плити — в її меш, клин у
   * ноги/потовщення/підворота — вниз по рекурсії через extraCutters.
   */
  const additionEntries = useMemo(() => (element.additions ?? []).map((a) => {
    const slot = a.id.split(':').pop() || '';
    return { slot, parsed: parseAdditionSlot(slot), draft: a.baseDefinition };
  }), [element.additions]);
  const miterPlan = useMemo(() => buildAssemblyMiterPlan({
    segments: lineSegments.map((item) => ({ id: item.id, v1: item.curve.v1, v2: item.curve.v2 })),
    curves: curves as never,
    edgeMap,
    bounds,
    thicknessMm: detail?.thickness || 20,
    material,
    attachmentsOn: (pId) => additionEntries
      .filter((e) => e.parsed.sideId === pId && !e.parsed.ownerSlot)
      .map((e) => ({ slot: e.slot, kind: e.parsed.kind, draft: e.draft as never })),
  }), [lineSegments, curves, edgeMap, bounds, detail?.thickness, material, additionEntries]);

  // Розрізана форма: якщо елемент дав кілька партів, малюємо КОЖЕН сегмент окремим
  // мешем із власною текстурою. Один меш не може мати три різні UV зі слябу.
  const segParts = segmentPartsFor ? segmentPartsFor(element.id) : [];
  const isSplit = segParts.length > 1;

  // Мийка — НЕ «розрізана форма»: її деталі (стінки, трикутники дна, злив)
  // складаються в чашу трансформаціями зі sinkAssembly, спільними з прев'ю
  // редактора виробу. Без цієї гілки всі 14 партів падали в isSplit і лягали
  // плоско за координатами розкрою — «розкиданий» вигляд у 3D Підборі.
  const isSinkElement = detail?.kind === 'sink_rect' || detail?.kind === 'sink_slot';

  // Мийка, ВСТАНОВЛЕНА в цю деталь (нижній монтаж): доповнення зі слотом
  // sink_<id>. Ребра в неї немає — чаша підвішується під плитою в центрі
  // вирізу, координати беруться з detail.sinks (те саме джерело, що й
  // у похідного вирізу). Рекурсія нижче потрапляє в гілку isSinkElement.
  const renderInstalledSink = (addition: ProductElement) => {
    const slot = addition.id.split(':').pop() || '';
    const sinkDef = (detail as unknown as { sinks?: Record<string, import('../../domain/types').ProductSinkDef> })?.sinks?.[slot.slice('sink_'.length)];
    if (!sinkDef) return null;
    const s = 0.001;
    const w = (bounds.maxX - bounds.minX) || 1;
    const h = (bounds.maxY - bounds.minY) || 1;
    const thick = (detail.thickness || 20) * s;
    // Центр чаші рахує спільний sinkCenter — та сама формула, що в отвору.
    // sink.x/y — це відступ від кута до КУТА чаші, а не центр; читати їх
    // напряму тут не можна (чаша повисне зі зсувом від власного вирізу).
    const { cx, cy } = sinkCenter(detail as never, sinkDef);
    return (
      <group key={addition.id} position={[(cx - w / 2) * s, -thick / 2, (cy - h / 2) * s]}>
        <ProductElement3DNode
          element={addition}
          activeDetailId={activeDetailId}
          customTextureMapFactory={customTextureMapFactory}
          segmentPartsFor={segmentPartsFor}
          textureForPart={textureForPart}
          mode={mode}
          theme={theme}
          textureMode={textureMode}
        />
      </group>
    );
  };

  if (isSinkElement && segParts.length > 1) {
    const s = 0.001;
    const thick = (detail.thickness || 20) * s;
    const sinkDetail = {
      geometry: {
        width: detail.width,
        height: detail.height,
        innerVertical: (detail as { innerVertical?: number }).innerVertical,
        sinkKind: detail.kind === 'sink_slot' ? 'slot' : 'rect',
      },
    } as never;

    return (
      <group position={position} rotation={rotation}>
        {segParts.map((p: any) => {
          const transform = getSinkPartTransform(p, sinkDetail, thick);
          // Підклейки — службові, у збірці не показуються (у розкрої лишаються).
          if (!transform || transform.hidden || !transform.pos) return null;

          const pts: any[] = p.points || [];
          if (pts.length < 3) return null;
          const xs = pts.map((pt: any) => pt.x);
          const ys = pts.map((pt: any) => pt.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const pw = (p.width || (Math.max(...xs) - minX)) || 1;
          const ph = (p.height || (Math.max(...ys) - minY)) || 1;

          // Контур у нормалізованих координатах (0..1) — та сама угода, що в
          // isSplit: UV з ExtrudeGeometry мають збігатися з матрицею текстури
          // розкрою, розрахованою на part.width/height. Реальний розмір — scale.
          const shape = new THREE.Shape(
            pts.map((pt: any) => new THREE.Vector2((pt.x - minX) / pw, (pt.y - minY) / ph))
          );
          const holes: any[] = p.holes || [];
          holes.forEach((hole: any[]) => {
            if (!Array.isArray(hole) || hole.length < 3) return;
            const path = new THREE.Path();
            [...hole].reverse().forEach((pt: any, i: number) => {
              const nx = (pt.x - minX) / pw;
              const ny = (pt.y - minY) / ph;
              if (i === 0) path.moveTo(nx, ny);
              else path.lineTo(nx, ny);
            });
            path.closePath();
            shape.holes.push(path);
          });

          let geom = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 24 });
          geom.scale(pw * s, ph * s, 1);
          geom.translate((-pw * s) / 2, (-ph * s) / 2, -thick / 2);
          // rotateX(-π/2): «низ» деталі в 2D → -Z сцени — рівно та сама
          // орієнтація, що в SinkAssemblyPreview, під яку виміряні пози/кути.
          geom.rotateX(-Math.PI / 2);
          geom.computeVertexNormals();

          /*
           * РЕШІТКА ЗЛИВУ (28.08): водоструменевий різ наскрізь.
           *
           * ⚠️ Ріже САМЕ «круглу деталь дна» (Ø114 з geometry.ts, №14 у
           * розкладці мийки) — не трикутники дна і не підклейки. Це та
           * сама деталь, у якій злив живе на реальному виробі: на карті
           * крою вона окремим кружком, і різ має піти в неї.
           *
           * Різаки будуються в координатах ЦІЄЇ деталі (її центр = центр
           * решітки), тому матриця сцени не потрібна: деталь кругла й
           * лежить площиною, як і різ.
           */
          const isDrainDisc = /кругла деталь дна/i.test(p.name ?? '');
          if (detail.drainGrate && isDrainDisc) {
            try {
              const discDiameter = p.width || pw;
              const cutters = buildGrateCutters(
                detail.drainGrate,
                discDiameter,
                discDiameter,
                (detail.thickness || 20),
              );
              if (cutters.length) geom = subtractEdgeCutters(geom, cutters) as THREE.ExtrudeGeometry;
            } catch (e) {
              console.error('drain grate error', e);
            }
          }

          const tex = textureForPart ? textureForPart(p) : null;

          return (
            <mesh
              key={p.id}
              geometry={geom}
              position={transform.pos}
              quaternion={transform.quat}
              castShadow
              receiveShadow
            >
              <meshPhysicalMaterial
                color="#ffffff"
                map={tex || undefined}
                roughness={0.4}
                metalness={0.05}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        })}
      </group>
    );
  }

  if (isSplit) {
    const s = 0.001;
    const elW = (bounds.maxX - bounds.minX) || 1;
    const elH = (bounds.maxY - bounds.minY) || 1;
    const thick = (detail.thickness || 20) * s;

    return (
      <group position={position} rotation={rotation}>
        {segParts.map((p: any) => {
          const pts: any[] = p.points || [];
          if (pts.length < 3) return null;

          // ВАЖЛИВО: контур будуємо в НОРМАЛІЗОВАНИХ координатах (0..1), як це робить
          // Detail3DNode. ExtrudeGeometry генерує UV із координат форми, тому в мм
          // вони вийшли б 0..1800 — матриця текстури розрахована на 0..1, і замість
          // малюнка виходить однотонна пляма. Реальний розмір даємо потім через scale.
          const xs = pts.map((pt: any) => pt.x);
          const ys = pts.map((pt: any) => pt.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          // Нормалізуємо по ОГОЛОШЕНОМУ розміру парта, а не по габариту точок.
          // Матриця текстури з розкрою розрахована саме на part.width/height; якщо
          // контур виходить за прямокутник (округлий виступ на увігнутому куті),
          // нормалізація по точках дала б інший масштаб — і текстуру розтягувало.
          const pw = (p.width || (Math.max(...xs) - minX)) || 1;
          const ph = (p.height || (Math.max(...ys) - minY)) || 1;

          const shape = new THREE.Shape(
            pts.map((pt: any) => new THREE.Vector2((pt.x - minX) / pw, (pt.y - minY) / ph))
          );

          // Вирізи сегмента. Нормалізуємо тим самим масштабом, що й зовнішній контур,
          // інакше отвір поїде відносно деталі. Обхід у зворотному напрямку і явне
          // замикання — та сама угода, що й у робочій гілці нерозрізаних деталей
          // (`Viewer3D`), щоб дві реалізації не розійшлися.
          const holes: any[] = p.holes || [];
          holes.forEach((hole: any[]) => {
            if (!Array.isArray(hole) || hole.length < 3) return;
            const path = new THREE.Path();
            [...hole].reverse().forEach((pt: any, i: number) => {
              const nx = (pt.x - minX) / pw;
              const ny = (pt.y - minY) / ph;
              if (i === 0) path.moveTo(nx, ny);
              else path.lineTo(nx, ny);
            });
            path.closePath();
            shape.holes.push(path);
          });

          let geom: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 32 });
          geom.scale(pw * s, ph * s, 1);
          geom.translate((-pw * s) / 2, (-ph * s) / 2, -thick / 2);
          // Поворот — у ГЕОМЕТРІЮ (а не в меш, як було): різаки торців і
          // клини 45° живуть у повернутому просторі, як у Viewer3D/DetailMesh.
          geom.rotateX(Math.PI / 2);

          // Центр сегмента в системі елемента (мм → одиниці сцени).
          const cx = ((p.textureOffsetX ?? 0) + minX + pw / 2) * s - (elW * s) / 2;
          const cz = ((p.textureOffsetY ?? 0) + minY + ph / 2) * s - (elH * s) / 2;
          const tex = textureForPart ? textureForPart(p) : null;

          /*
           * ОБРОБКА КРОМОК НА РОЗРІЗАНІЙ ПЛИТІ (02.09). Досі профілі різались
           * лише в нерозрізаній гілці (Detail3DNode) — щойно деталь ділилась
           * стиком на сегменти, торці ставали сирими. Різаки — ті самі
           * (buildEdgeCutters по партy: сторони бере з p.sideSegments), плюс
           * клини 45° плити з плану мітр, переведені в простір сегмента.
           */
          const segCutters: THREE.BufferGeometry[] = [];
          const millingOn = (v?: string) => Boolean(v) && v !== 'Без фрезерування';
          const wantsCutters = Boolean(detail?.edgeProfiles && Object.values(detail.edgeProfiles).some(Boolean))
            || Object.values((detail?.corners ?? {}) as Record<string, { edgeProcessing?: string }>).some((c) => millingOn(c?.edgeProcessing))
            || Object.values((detail?.cutouts ?? {}) as Record<string, { edgeProcessing?: string }>).some((c) => millingOn(c?.edgeProcessing));
          if (wantsCutters) {
            try {
              segCutters.push(...buildEdgeCutters(p, detail?.edgeProfiles, (detail?.thickness || 20), {
                corners: detail?.corners as never,
                cutouts: detail?.cutouts as never,
              }));
            } catch (e) { console.error('edge cutters error (split)', e); }
          }
          for (const mc of miterPlan.mainCutters) {
            const c = mc.clone();
            c.translate(-cx, 0, -cz);
            segCutters.push(c);
          }
          if (segCutters.length) {
            try { geom = subtractEdgeCutters(geom, segCutters); } catch (e) { console.error('CSG error (split)', e); }
          }

          return (
            <mesh
              key={p.id}
              geometry={geom}
              castShadow
              receiveShadow
              position={[cx, 0, cz]}
            >
              {/* Режим «Підсвітка» — це ЧИСТА підміна текстури на фото зі світлом.
                  Emissive і притемнення сцени свідомо не використовуємо: світле фото
                  перетримувало й вигорало в білий. Ефект дає саме друге фото. */}
              <meshPhysicalMaterial
                color="#ffffff"
                map={tex || undefined}
                roughness={0.4}
                metalness={0.05}
              />
            </mesh>
          );
        })}

        {/* Доповнення позиціонуються ТАК САМО, як у нерозрізаному випадку —
            через getEdgeTransform по ребру батька. Раніше тут був спрощений цикл
            без трансформів, тому панель і ноги падали плоско в нуль. */}
        {element.additions?.map((addition) => {
          const additionSlot = addition.id.split(':').pop() || '';
          if (additionSlot.startsWith('sink_')) return renderInstalledSink(addition);
          const arcBand = renderArcAddition(addition);
          if (arcBand !== undefined) return arcBand;
          const edgeId = parseAdditionSlot(additionSlot).sideId || undefined;
          if (!edgeId) return null;

          const segment = lineSegments.find((seg) => seg.id === edgeId);
          if (!segment) return null;

          const attachmentKind = attachmentDirection(additionSlot);

          const transform = getEdgeTransform(
            segment.curve.v1,
            segment.curve.v2,
            bounds,
            detail.thickness || 20,
            addition.baseDefinition.width,
            addition.baseDefinition.height || 600,
            addition.baseDefinition.attachOffset ?? 0,
            attachmentKind,
            addition.baseDefinition.attachInset ?? 0,
            addition.baseDefinition.attachGap ?? 0,
          );

          const miter = miterPlan.bySlot.get(additionSlot);
          return (
            <group key={addition.id} position={transform.groupPosition} rotation={transform.groupRotation}>
              <group position={transform.childPosition} rotation={transform.childRotation}>
                <ProductElement3DNode
                  element={addition}
                  activeDetailId={activeDetailId}
                  customTextureMapFactory={customTextureMapFactory}
                  segmentPartsFor={segmentPartsFor}
                  textureForPart={textureForPart}
                  mode={mode}
                  theme={theme}
                  textureMode={textureMode}
                  material={material}
                  extraCutters={miter?.cutters.length ? miter.cutters : undefined}
                />
              </group>
            </group>
          );
        })}
      </group>
    );
  }

  return (
    <group position={position} rotation={rotation}>
      <Detail3DNode
        id={element.id}
        detail={detailForNode}
        extraCutters={(extraCutters?.length || miterPlan.mainCutters.length)
          ? [...(extraCutters ?? []), ...miterPlan.mainCutters]
          : undefined}
        isActive={activeDetailId === element.id}
        mode={mode}
        editMode={editMode}
        onCornerClick={onCornerClick}
        onEdgeClick={onEdgeClick}
        onPlaneClick={onPlaneClick}
        onJointClick={onJointClick}
        onDetailDoubleClick={onDetailDoubleClick}
        onDetailClick={onDetailClick}
        onDetailContextMenu={onDetailContextMenu}
        theme={theme}
        textureMode={textureMode}
        customTextureMap={customTextureMapFactory ? customTextureMapFactory(element.id) : undefined}
      />
      
      {element.additions?.map((addition) => {
        // Find which edge this addition attaches to
        // Ребро = те, що йде після ОСТАННЬОГО префікса типу в слоті:
        //   'leg_BC_lcut1'          → 'BC_lcut1'  (нога на ребрі Г-зарізу)
        //   'leg_BC_lcut2_fold_B'   → 'B'         (підворот на самій нозі)
        //   'fold_C'                → 'C'
        // Брати перший префікс не можна (загубиться вкладеність), останню частину
        // після '_' теж (для Г-зарізу вийде 'lcut1' і ребро не знайдеться).
        const additionSlot = addition.id.split(':').pop() || '';
        if (additionSlot.startsWith('sink_')) return renderInstalledSink(addition);
        const arcBand = renderArcAddition(addition);
        if (arcBand !== undefined) return arcBand;
        const edgeId = parseAdditionSlot(additionSlot).sideId || undefined;
        
        if (!edgeId) {
          // If no edge matched, just render it at 0,0,0
          return <ProductElement3DNode
            key={addition.id}
            element={addition}
            activeDetailId={activeDetailId}
            onCornerClick={onCornerClick}
            onPlaneClick={onPlaneClick}
            onEdgeClick={onEdgeClick}
            onJointClick={onJointClick}
            onLegDoubleClick={onLegDoubleClick}
            onWallPanelDoubleClick={onWallPanelDoubleClick}
            onDetailDoubleClick={onDetailDoubleClick}
            onDetailClick={onDetailClick}
            onDetailContextMenu={onDetailContextMenu}
            mode={mode}
            editMode={editMode}
            theme={theme}
            textureMode={textureMode}
            customTextureMapFactory={customTextureMapFactory}
          />;
        }

        // Find the specific edge segment
        const segment = lineSegments.find((seg) => seg.id === edgeId);
        if (!segment) return null;
        
        const attachWidth = addition.baseDefinition.width;
        const attachHeight = addition.baseDefinition.height || 600;
        
        // Зсув доповнення на батьківській деталі: уздовж ребра і вглиб від
        // нього. Раніше тут стояв жорсткий нуль із запискою «may be we can
        // pass an offset?» — тепер значення живе в самому доповненні.
        const attachOffset = addition.baseDefinition.attachOffset ?? 0;
        const attachInset = addition.baseDefinition.attachInset ?? 0;

        // Тип прив'язки визначає напрямок: нога і підворот звисають вниз,
        // панель і бортик стоять угору. Формули — ті самі, що в 3D Редакторі.
        const attachmentKind = attachmentDirection(additionSlot);

        const transform = getEdgeTransform(
          segment.curve.v1,
          segment.curve.v2,
          bounds,
          detail.thickness || 20,
          attachWidth,
          attachHeight,
          attachOffset,
          attachmentKind,
          attachInset,
          addition.baseDefinition.attachGap ?? 0,
        );

        const miter = miterPlan.bySlot.get(additionSlot);
        return (
          <group key={addition.id} position={transform.groupPosition} rotation={transform.groupRotation}>
             <group position={transform.childPosition} rotation={transform.childRotation}>
                <ProductElement3DNode
                  element={addition}
                  activeDetailId={activeDetailId}
                  onCornerClick={onCornerClick}
                  onPlaneClick={onPlaneClick}
                  onEdgeClick={onEdgeClick}
                  onJointClick={onJointClick}
                  onLegDoubleClick={onLegDoubleClick}
                  onWallPanelDoubleClick={onWallPanelDoubleClick}
                  onDetailDoubleClick={onDetailDoubleClick}
                  onDetailClick={onDetailClick}
                  onDetailContextMenu={onDetailContextMenu}
                  mode={mode}
                  editMode={editMode}
                  theme={theme}
                  textureMode={textureMode}
                  customTextureMapFactory={customTextureMapFactory}
                  material={material}
                  extraCutters={miter?.cutters.length ? miter.cutters : undefined}
                />
             </group>
          </group>
        );
      })}
    </group>
  );
}
