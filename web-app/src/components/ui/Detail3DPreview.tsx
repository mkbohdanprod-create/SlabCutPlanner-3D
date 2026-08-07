import  { Suspense, useMemo, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  Center,
  Grid,
  Line,
  Text,
  Edges,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { Eye, Edit2, Ruler, Moon, Sun, Image as ImageIcon } from "lucide-react";
import * as THREE from "three";
import type { DetailDraft } from "../forms/utils/draftHelpers";
import { buildDetailShape, buildDetailGeometry } from '../../engines/shapeBuilder';
import { explodeDetails } from '../../engines/geometry';
import { getSinkPartTransform } from '../../engines/sinkAssembly';
import type { Detail } from '../../domain/types';
import { ProductElement3DNode } from '../3d/ProductElement3DNode';
import {
  jointAnchorPoints,
  jointAxisForSide,
  manualJointPosition,
  nearestAnchorId,
  oppositeSideId,
  referenceSideForJoint,
  reflexCornerIds,
  reflexJointShift,
  type JointShapeFields,
  type JointSideSegment,
  type JointSideSelection,
} from '../../domain/joints';
import { toDetailShape } from '../../domain/elementToDetail';
import { withSinkCutouts, sinkCenter } from '../../domain/productSink';
import { metalProfileById, METAL_PROFILES } from '../../domain/metalProfiles';
import { metalChainPieces } from '../../domain/metalChain';
import { pointInPolygonStrict } from '../../engines/geometryUtils';

function ProfileMesh({ length, height, depth }: { length: number; height: number; depth: number; }) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    const r = Math.min(3 * 0.001, height, depth);
    shape.moveTo(-depth, 0);
    shape.lineTo(0, 0);
    shape.lineTo(0, height);
    shape.lineTo(-depth + r, height);
    shape.quadraticCurveTo(-depth, height, -depth, height - r);
    shape.lineTo(-depth, 0);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: length,
      bevelEnabled: false,
    });
    geometry.translate(0, 0, -length / 2);
    geometry.rotateY(Math.PI / 2);
    return geometry;
  }, [length, height, depth]);

  return <primitive object={geom} attach="geometry" />;
}

export function useStoneTexture(textureMode: boolean = false) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      if (textureMode) {
        // Realistic Marble Procedural Texture
        ctx.fillStyle = "#f8f9fa";
        ctx.fillRect(0, 0, 1024, 1024);

        // Cloudy noise base
        for (let i = 0; i < 40000; i++) {
          ctx.fillStyle =
            Math.random() > 0.5
              ? "rgba(210, 215, 220, 0.15)"
              : "rgba(255, 255, 255, 0.2)";
          const size = 5 + Math.random() * 15;
          ctx.fillRect(Math.random() * 1024, Math.random() * 1024, size, size);
        }

        // Deep veins
        for (let i = 0; i < 60; i++) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(160, 165, 175, ${0.3 + Math.random() * 0.4})`;
          ctx.lineWidth = 1 + Math.random() * 4;
          let x = Math.random() * 1024;
          let y = Math.random() * 1024;
          ctx.moveTo(x, y);
          for (let j = 0; j < 15; j++) {
            x += (Math.random() - 0.2) * 150;
            y += (Math.random() - 0.5) * 150;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else {
        // Plain solid mode with very subtle noise (original)
        ctx.fillStyle = "#f8f9fa";
        ctx.fillRect(0, 0, 1024, 1024);
        for (let i = 0; i < 10000; i++) {
          ctx.fillStyle = "rgba(200, 205, 210, 0.1)";
          ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
        }
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (textureMode) {
      texture.repeat.set(1.5, 1.5);
    }
    return texture;
  }, [textureMode]);
}

export function useDetailShape(
  detail: DetailDraft,
  points: any[],
  bounds: any,
) {
  return useMemo(() => {
    return buildDetailShape(detail, points, bounds);
  }, [detail, points, bounds]);
}

function DetailMesh({
  detail,
  shape,
  bounds,
  onClick,
  onDoubleClick,
  onContextMenu,
  highlight,
  textureMode,
  flat,
  customTextureMap,
  depthBias = 0,
}: {
  detail: DetailDraft;
  shape: THREE.Shape;
  bounds: any;
  onClick?: () => void;
  onDoubleClick?: (e: any) => void;
  onContextMenu?: (e: any) => void;
  highlight?: boolean;
  textureMode?: boolean;
  flat?: boolean;
  customTextureMap?: THREE.Texture | null;
  /**
   * Зсув глибини при растеризації (polygon offset), а НЕ зсув геометрії.
   * Потрібен там, де дві поверхні збігаються (підворот/бортик впритул до торця
   * стільниці) і відеокарта не може вирішити, яка ближча — виникає мерехтіння
   * (z-fighting). Геометрія й розміри лишаються точними.
   */
  depthBias?: number;
}) {
  const { geometry } = useMemo(() => {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;

    const s = 0.001;
    const thickness = (detail.thickness || 20) * s;

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
      curveSegments: 32,
    });

    geom.scale(w * s, h * s, 1);
    geom.translate((-w * s) / 2, (-h * s) / 2, -thickness / 2);
    geom.rotateX(Math.PI / 2);
    geom.computeVertexNormals();

    return { geometry: geom };
  }, [detail, shape, bounds]);

  const stoneTexture = useStoneTexture(textureMode);

  return (
    <mesh
      geometry={geometry}
      castShadow
      receiveShadow
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
      onDoubleClick={(e) => {
        if (onDoubleClick) {
          e.stopPropagation();
          onDoubleClick(e);
        }
      }}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.stopPropagation();
          onContextMenu(e);
        }
      }}
    >
      <Edges
        geometry={geometry}
        color={highlight ? "#38bdf8" : "#94a3b8"}
        threshold={15}
      />
      {flat ? (
        <meshBasicMaterial color={highlight ? "#e0f2fe" : "#f1f5f9"} />
      ) : (
        <meshPhysicalMaterial
          color={highlight ? "#e0f2fe" : "#ffffff"}
          emissive={highlight ? "#38bdf8" : "#000000"}
          emissiveIntensity={highlight ? 0.2 : 0}
          map={customTextureMap || stoneTexture}
          roughness={0.4}
          metalness={0.05}
          polygonOffset={depthBias !== 0}
          polygonOffsetFactor={-depthBias}
          polygonOffsetUnits={-depthBias}
        />
      )}
    </mesh>
  );
}

function DimensionLines({
  shape,
  bounds,
  thickness,
  lineSegments,
  theme = "light",
  uShapeProps,
}: {
  shape: THREE.Shape;
  bounds: any;
  thickness: number;
  lineSegments?: Array<{ curve: THREE.LineCurve; id: string }>;
  theme?: "light" | "dark";
  uShapeProps?: { topBarHeight: number; cutOff: number; cutW: number } | null;
}) {
  const w = bounds.maxX - bounds.minX || 1;
  const h = bounds.maxY - bounds.minY || 1;
  const s = 0.001;
  const yPos = (thickness * s) / 2 + 0.005;

  const allCurves = [...shape.curves];
  shape.holes.forEach((hole) => allCurves.push(...hole.curves));

  const localLineSegments = lineSegments || allCurves
    .filter((c) => c.type === "LineCurve")
    .map((c) => ({ curve: c as THREE.LineCurve, id: "" }));
  
  const ellipseSegments = allCurves
    .filter((c) => c.type === "EllipseCurve")
    .map((c) => c as any);

  return (
    <group>
      {ellipseSegments.map((curve, i) => {
        const radiusMm = Math.round(curve.xRadius * w);
        if (radiusMm < 10) return null;

        const midAngle = (curve.aStartAngle + curve.aEndAngle) / 2;
        const arcNx = curve.aX + Math.cos(midAngle) * curve.xRadius;
        const arcNy = curve.aY + Math.sin(midAngle) * curve.yRadius;
        const textNx = curve.aX + Math.cos(midAngle) * curve.xRadius * 1.5;
        const textNy = curve.aY + Math.sin(midAngle) * curve.yRadius * 1.5;

        const wx1 = (curve.aX - 0.5) * w * s;
        const wy1 = (curve.aY - 0.5) * h * s;
        const wx2 = (arcNx - 0.5) * w * s;
        const wy2 = (arcNy - 0.5) * h * s;
        const wTextX = (textNx - 0.5) * w * s;
        const wTextY = (textNy - 0.5) * h * s;

        return (
          <group key={`rad-${i}`}>
            <Line
              points={[
                [wx1, yPos, wy1],
                [wx2, yPos, wy2],
              ]}
              color="#64748b"
              lineWidth={1}
            />
            <mesh position={[wx1, yPos, wy1]}>
              <sphereGeometry args={[0.01, 8, 8]} />
              <meshBasicMaterial color="#64748b" />
            </mesh>
            <Text
              position={[wTextX, yPos, wTextY]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.05}
              color="#334155"
              anchorX="center"
              anchorY="middle"
              renderOrder={1}
              depthTest={false}
            >
              R{radiusMm}
            </Text>
          </group>
        );
      })}

      {localLineSegments.map(({ curve, id }, i) => {
        const nx1 = (curve.v1.x - 0.5) * w * s;
        const ny1 = (curve.v1.y - 0.5) * h * s;
        const nx2 = (curve.v2.x - 0.5) * w * s;
        const ny2 = (curve.v2.y - 0.5) * h * s;

        const midX = (nx1 + nx2) / 2;
        const midY = (ny1 + ny2) / 2;

        const dx_world = nx2 - nx1;
        const dy_world = ny2 - ny1;
        const length = Math.round(
          Math.sqrt(dx_world * dx_world + dy_world * dy_world) / s,
        );

        if (length < 20) return null;

        const len_world = Math.sqrt(dx_world * dx_world + dy_world * dy_world);
        const normalX = dy_world / len_world;
        const normalY = -dx_world / len_world;

        let textAngle = Math.atan2(dy_world, dx_world);
        if (textAngle > Math.PI / 2 + 0.01 || textAngle < -Math.PI / 2 - 0.01) {
          textAngle += Math.PI;
        }

        const offsetDist = 0.04;
        const textDist = 0.07;

        const textX = midX + normalX * textDist;
        const textY = midY + normalY * textDist;

        const lx1 = nx1 + normalX * offsetDist;
        const ly1 = ny1 + normalY * offsetDist;
        const lx2 = nx2 + normalX * offsetDist;
        const ly2 = ny2 + normalY * offsetDist;

        return (
          <group key={`dim-${i}`}>
            <Line
              points={[
                [nx1, yPos, ny1],
                [lx1, yPos, ly1],
              ]}
              color="#cbd5e1"
              lineWidth={1}
            />
            <Line
              points={[
                [nx2, yPos, ny2],
                [lx2, yPos, ly2],
              ]}
              color="#cbd5e1"
              lineWidth={1}
            />
            <Line
              points={[
                [lx1, yPos, ly1],
                [lx2, yPos, ly2],
              ]}
              color="#64748b"
              lineWidth={2}
            />
            <Text
              position={[textX, yPos, textY]}
              rotation={[-Math.PI / 2, 0, textAngle]}
              fontSize={0.045}
              color="#334155"
              anchorX="center"
              anchorY="middle"
              renderOrder={1}
              depthTest={false}
            >
              {id ? `${id} = ${length} mm` : `${length} mm`}
            </Text>
            {id && (
              <group position={[midX - normalX * 0.05, yPos + 0.01, midY - normalY * 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
                <mesh>
                  <planeGeometry args={[0.08, 0.08]} />
                  <meshBasicMaterial color="#1f93ef" />
                </mesh>
                <Text
                  fontSize={0.05}
                  color="#ffffff"
                  anchorX="center"
                  anchorY="middle"
                  renderOrder={2}
                  depthTest={false}
                  position={[0, 0, 0.001]}
                >
                  {id === 'start' ? (id.closeId || 'H') : id}
                </Text>
              </group>
            )}
          </group>
        );
      })}
      
      {uShapeProps && (
        <group key="u-shape-width-marker">
          <Line
            points={[
              [(uShapeProps.cutOff + uShapeProps.cutW / 2 - 0.5) * w * s, yPos + 0.01, (0 - 0.5) * h * s],
              [(uShapeProps.cutOff + uShapeProps.cutW / 2 - 0.5) * w * s, yPos + 0.01, (uShapeProps.topBarHeight - 0.5) * h * s]
            ]}
            color="#ef4444"
            lineWidth={3}
          />
          {/* Arrow heads */}
          <group position={[(uShapeProps.cutOff + uShapeProps.cutW / 2 - 0.5) * w * s, yPos + 0.01, (0 - 0.5) * h * s]} rotation={[-Math.PI / 2, 0, 0]}>
             <mesh position={[0, -0.02, 0]}>
                <coneGeometry args={[0.02, 0.04, 3]} />
                <meshBasicMaterial color="#ef4444" />
             </mesh>
          </group>
          <group position={[(uShapeProps.cutOff + uShapeProps.cutW / 2 - 0.5) * w * s, yPos + 0.01, (uShapeProps.topBarHeight - 0.5) * h * s]} rotation={[Math.PI / 2, 0, 0]}>
             <mesh position={[0, -0.02, 0]}>
                <coneGeometry args={[0.02, 0.04, 3]} />
                <meshBasicMaterial color="#ef4444" />
             </mesh>
          </group>
          <Text
            position={[
              (uShapeProps.cutOff + uShapeProps.cutW / 2 - 0.5) * w * s + 0.05,
              yPos + 0.02,
              (uShapeProps.topBarHeight / 2 - 0.5) * h * s
            ]}
            rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
            fontSize={0.045}
            color="#ef4444"
            anchorX="center"
            anchorY="middle"
            renderOrder={3}
            depthTest={false}
          >
            Ширина = {Math.round(uShapeProps.topBarHeight / s)} mm
          </Text>
        </group>
      )}
    </group>
  );
}

export function Detail3DNode({
  id,
  detail,
  isActive,
  mode,
  editMode,
  onCornerClick,
  onEdgeClick,
  onPlaneClick,
  onJointClick,
  onJointSideClick,
  onDoubleClick,
  onDetailDoubleClick,
  onDetailClick,
  onDetailContextMenu,
  theme,
  textureMode,
  customTextureMap,
}: {
  id: string;
  detail: DetailDraft;
  isActive: boolean;
  mode: "view" | "edit" | "dimensions";
  editMode: "corners" | "planes" | "edges" | "joints" | "cutouts";
  /* Усі три віддають ще й координати курсора: віконечка й контекстні меню
     позиціонуються по clientX/clientY. Раніше були оголошені з одним аргументом,
     а викликались із трьома — 14 помилок гейта саме звідси. */
  onCornerClick?: (cornerId: string, x: number, y: number) => void;
  onEdgeClick?: (edgeId: string, x: number, y: number) => void;
  /** Передає id деталі, по площині якої клікнули — щоб виріз ліг саме на неї. */
  onPlaneClick?: (detailId?: string) => void;
  onJointClick?: (jointTargetId: string, x: number, y: number) => void;
  /** Клік по маркеру СТОРОНИ в режимі «Стики» — з уже зібраним описом різу. */
  onJointSideClick?: (joint: JointSideSelection, x: number, y: number) => void;
  onDoubleClick?: (e: any) => void;
  onDetailDoubleClick?: (type: 'main' | 'sub', id?: string) => void;
  onDetailClick?: (id: string) => void;
  onDetailContextMenu?: (id: string, x: number, y: number) => void;
  theme?: "light" | "dark";
  textureMode?: boolean;
  customTextureMap?: THREE.Texture | null;
}) {
  // Мийки, встановлені в деталь, домішують отвір під чашу до вирізів —
  // плита в 3D одразу з вирізом, хоча в draft.cutouts його не зберігаємо.
  detail = useMemo(() => withSinkCutouts(detail), [detail]);
  const stoneTexture = useStoneTexture(textureMode);
  const points = useMemo(() => {
    let pts = detail.geometry?.customPoints || [];
    if (pts.length > 0) return pts;

    let width = detail.width || 1000;
    let height = detail.height || 600;

    if (detail.kind === "l") {
      width = detail.outerWidth || 1200;
      height = detail.outerHeight || 1200;
      const iw = detail.innerHorizontal || 600;
      const ih = detail.innerVertical || 600;
      return [
        { id: "start", closeId: "F", x: 0, y: 0 },
        { id: "A", x: width, y: 0 },
        { id: "B", x: width, y: height - ih },
        { id: "C", x: iw, y: height - ih },
        { id: "D", x: iw, y: height },
        { id: "E", x: 0, y: height },
      ];
    }

    if (detail.kind === "u") {
      width = detail.width || 1200;
      height = detail.height || 600; // max leg height
      const leftH = detail.leftLegHeight ?? height;
      const rightH = detail.rightLegHeight ?? height;
      const cutW = detail.innerCutWidth || 600;
      const cutD = detail.innerCutDepth || 300; 
      const cutOff = detail.innerCutOffset || 300;
      
      const topBarHeight = Math.max(0, height - cutD);
      
      return [
        { id: "start", closeId: "H", x: 0, y: 0 },
        { id: "A", x: width, y: 0 },
        { id: "B", x: width, y: rightH },
        { id: "C", x: cutOff + cutW, y: rightH },
        { id: "D", x: cutOff + cutW, y: topBarHeight },
        { id: "E", x: cutOff, y: topBarHeight },
        { id: "F", x: cutOff, y: leftH },
        { id: "G", x: 0, y: leftH },
      ];
    }

    return [
      { id: "DA", x: 0, y: 0 },
      { id: "AB", x: width, y: 0 },
      { id: "BC", x: width, y: height },
      { id: "CD", x: 0, y: height },
    ];
  }, [detail]);

  const bounds = useMemo(
    () => ({
      minX: Math.min(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxX: Math.max(...points.map((p) => p.x)),
      maxY: Math.max(...points.map((p) => p.y)),
    }),
    [points],
  );

  const { shape, edgeMap } = useDetailShape(detail, points, bounds);

  const lineSegments = useMemo(() => {
    return shape.curves
      .map((curve, index) => ({ curve, id: edgeMap[index] }))
      .filter((item) => item.curve.type === "LineCurve" && item.id) as Array<{
      curve: THREE.LineCurve;
      id: string;
    }>;
  }, [shape, edgeMap]);

  /**
   * Лінія стику на поверхні деталі — пунктиром, як на кресленні.
   *
   * Раніше це був суцільний червоний брусок 10×10 мм, піднятий над площиною:
   * він читався як стороння деталь, що висить над виробом, а не як лінія різу.
   * Тепер це тонкий пунктир, покладений майже впритул до поверхні
   * (`+2 мм` — рівно щоб не мерехтіло від z-fighting).
   *
   * Координати на вході — у МІЛІМЕТРАХ, як і решта математики стиків.
   */
  const drawSplitLine = (x1: number, y1: number, x2: number, y2: number, key: string, color = "#334155") => {
    const w = bounds.maxX - bounds.minX || 1;
    const h = bounds.maxY - bounds.minY || 1;
    const s = 0.001;
    const thickness = (detail.thickness || 20) * s;
    const surface = thickness / 2 + 0.002;

    const toLocal = (xMm: number, yMm: number): [number, number, number] => [
      ((xMm - bounds.minX) / w - 0.5) * w * s,
      surface,
      ((yMm - bounds.minY) / h - 0.5) * h * s,
    ];

    return (
      <Line
        key={key}
        points={[toLocal(x1, y1), toLocal(x2, y2)]}
        color={color}
        lineWidth={1.5}
        dashed
        dashSize={0.02}
        gapSize={0.012}
        renderOrder={2}
      />
    );
  };

  /**
   * Сторони контуру в МІЛІМЕТРАХ.
   *
   * `lineSegments` живуть у нормалізованих 0…1 — такими їх будує
   * `buildDetailShape` (`getCoords` ділить на габарит). Уся математика стиків
   * рахує в міліметрах, бо в них же приходять опорні кути з `jointAnchorPoints`.
   * Переводимо один раз, тут, і далі ніде не змішуємо простори.
   */
  const sidesMm = useMemo<JointSideSegment[]>(() => {
    const w = bounds.maxX - bounds.minX || 1;
    const h = bounds.maxY - bounds.minY || 1;
    const toMm = (p: { x: number; y: number }) => ({
      x: bounds.minX + p.x * w,
      y: bounds.minY + p.y * h,
    });
    // Відкидаємо тільки контури вирізів (`inner*`). Сторону `start` відкидати
    // НЕ можна: у Г- і П-форми це замикаюче ЛІВЕ ребро контуру. Без нього
    // протилежною до правої сторони знайшлася б внутрішня стінка вирізу,
    // і різ пішов би не туди.
    return lineSegments
      .filter((item) => !item.id.startsWith("inner"))
      .map((item) => ({ id: item.id, v1: toMm(item.curve.v1), v2: toMm(item.curve.v2) }));
  }, [lineSegments, bounds]);

  const jointAnchors = useMemo(
    () => jointAnchorPoints(toDetailShape(detail.kind), detail as JointShapeFields),
    [detail],
  );

  const [hoveredJointSide, setHoveredJointSide] = useState<string | null>(null);
  const hoveredOppositeSide = useMemo(
    () => (hoveredJointSide ? oppositeSideId(sidesMm, hoveredJointSide) : undefined),
    [hoveredJointSide, sidesMm],
  );

  /**
   * Ділянки лінії різу, що реально лежать на матеріалі.
   *
   * Стик — це хорда, а не нескінченна пряма (маніфест §2.15). На Г- і П-формі
   * лінія на всю ширину габариту перетнула б виріз і повисла б у повітрі.
   * Тому шукаємо перетини з контуром і лишаємо тільки ті проміжки, чия
   * середина всередині деталі. Контур беремо номінальний (`points`) — він
   * завжди замкнений, на відміну від `sidesMm`, де дуги скруглень випадають.
   */
  const jointSpansOnShape = (axis: "vertical" | "horizontal", position: number): Array<[number, number]> => {
    const poly = points.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }));
    if (poly.length < 3) return [];

    const crossings: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const av = axis === "vertical" ? a.x : a.y;
      const bv = axis === "vertical" ? b.x : b.y;
      if (Math.abs(bv - av) < 1e-6) continue; // сторона йде вздовж лінії — перетину немає
      const t = (position - av) / (bv - av);
      if (t < 0 || t > 1) continue;
      crossings.push(axis === "vertical" ? a.y + t * (b.y - a.y) : a.x + t * (b.x - a.x));
    }

    crossings.sort((p, q) => p - q);

    const spans: Array<[number, number]> = [];
    for (let i = 0; i + 1 < crossings.length; i++) {
      const lo = crossings[i];
      const hi = crossings[i + 1];
      if (hi - lo < 1) continue; // збіг у вершині
      const mid = (lo + hi) / 2;
      const probe = axis === "vertical" ? { x: position, y: mid } : { x: mid, y: position };
      if (pointInPolygonStrict(probe, poly)) spans.push([lo, hi]);
    }
    return spans;
  };

  /** Лінія стику, обрізана по контуру деталі. */
  const drawJointLine = (
    axis: "vertical" | "horizontal",
    position: number,
    key: string,
    color?: string,
  ) =>
    jointSpansOnShape(axis, position).map(([from, to], index) =>
      axis === "vertical"
        ? drawSplitLine(position, from, position, to, `${key}-${index}`, color)
        : drawSplitLine(from, position, to, position, `${key}-${index}`, color),
    );

  /** Опис стику зі сторони: напрямок і опорний кут виводяться, не вводяться. */
  const jointSelectionFor = (sideId: string): JointSideSelection | undefined => {
    const side = sidesMm.find((item) => item.id === sideId);
    if (!side) return undefined;
    const opposite = oppositeSideId(sidesMm, sideId);
    if (!opposite) return undefined; // немає протилежної — стик між цими сторонами не має сенсу
    const axis = jointAxisForSide(side);
    const anchorCorner = nearestAnchorId(jointAnchors, side.v1);
    return {
      sideId,
      oppositeSideId: opposite,
      axis,
      anchorCorner,
      // Рушій рахує від кута, користувач міряє від сторони — див. referenceSideForJoint
      referenceSideId: referenceSideForJoint(
        sidesMm,
        axis,
        anchorCorner ? jointAnchors?.[anchorCorner] : undefined,
      ),
    };
  };

  /** Прев'ю різу під курсором: через середину наведеної сторони, по контуру. */
  const jointPreviewLine = (() => {
    if (!hoveredJointSide || !hoveredOppositeSide) return null;
    const side = sidesMm.find((item) => item.id === hoveredJointSide);
    if (!side) return null;
    const axis = jointAxisForSide(side);
    const position = axis === "vertical"
      ? (side.v1.x + side.v2.x) / 2
      : (side.v1.y + side.v2.y) / 2;
    return drawJointLine(axis, position, "joint-preview", "#f59e0b");
  })();

  // Металопрокат — не плоска кам'яна деталь: свій вузол із перерізом
  // профілю. Гілка стоїть ПІСЛЯ всіх хуків, щоб не ламати їх порядок.
  if (detail.kind === 'metal_profile') {
    return (
      <MetalProfileNode
        detail={detail}
        highlight={isActive && mode === 'view'}
        onClick={() => onDetailClick?.(id)}
        onContextMenu={(e) => {
          if (mode === 'view' && onDetailContextMenu) onDetailContextMenu(id, e.clientX, e.clientY);
        }}
      />
    );
  }

  return (
    <group>
      <DetailMesh
        detail={detail}
        shape={shape}
        bounds={bounds}
        onClick={() => {
          if (isActive && mode === "edit" && editMode === "planes") {
            onPlaneClick?.(id);
          } else {
            onDetailClick?.(id);
          }
        }}
        onDoubleClick={(e) => {
          if (isActive) {
            onDetailDoubleClick?.('main');
          }
          onDoubleClick?.(e);
        }}
        onContextMenu={(e) => {
          if (mode === 'view' && onDetailContextMenu) {
            onDetailContextMenu(id, e.clientX, e.clientY);
          }
        }}
        highlight={isActive && mode === "view"}
        textureMode={textureMode}
        flat={mode === "dimensions"}
        customTextureMap={customTextureMap}
        /* Мерехтіння на стику підвороту зі стільницею (z-fighting) свідомо НЕ чіпаємо:
           це косметика. Справжнє рішення — зріз 45° по стику (§7.2), окрема задача. */
        depthBias={0}
      />

      {mode === "dimensions" && isActive && (
        <DimensionLines
          shape={shape}
          bounds={bounds}
          thickness={detail.thickness || 20}
          lineSegments={lineSegments}
          theme={theme}
          uShapeProps={
            detail.kind === "u"
              ? {
                  topBarHeight: Math.max(0, Math.max(detail.leftLegHeight ?? (detail.height || 1200), detail.rightLegHeight ?? (detail.height || 1200)) - (detail.innerCutDepth || 600)),
                  cutOff: detail.innerCutOffset || 600,
                  cutW: detail.innerCutWidth || 1200,
                }
              : null
          }
        />
      )}

      {/* Стик Г-форми. Гілка Г в `explodeDetails` ріже рівно по `innerHorizontal`
          / `outerHeight − innerVertical` і на радіус увігнутого кута НЕ зсуває
          (на відміну від П-форми). Тому тут зсуву теж немає — модель показує
          саме те, що зробить рушій. */}
      {detail.kind === "l" && (() => {
          const height = detail.outerHeight || 1200;
          const iw = detail.innerHorizontal || 600;
          const ih = detail.innerVertical || 600;
          if (!detail.jointDirection) return null;
          return detail.jointDirection === 'vertical'
            ? drawJointLine('vertical', iw, "l-joint")
            : drawJointLine('horizontal', height - ih, "l-joint");
      })()}

      {/* Довільні стики — на самій моделі, рівно в тій позиції, яку застосує
          рушій розкрою. Позицію рахує `manualJointPosition` — та сама функція,
          що і в панелі, і в `manualJointCuts`: якщо стик відсунуто з дуги,
          лінія на моделі має стояти там, де реально піде різ, а не там, де
          користувач ввів число. */}
      {(detail.manualJoints ?? []).map((joint) => {
        const { snapped } = manualJointPosition(jointAnchors, detail.corners, joint);
        return drawJointLine(joint.axis, snapped, `manual-joint-${joint.id}`);
      })}

      {/* Стики П-форми (омега в куті E, лямбда в куті D).
          Рушій відсуває лінію з дуги увігнутого кута — і рівно на ту саму
          величину її треба намалювати, інакше модель показує стик у куті,
          а різ іде на радіус убік. Зсув рахує спільна `reflexJointShift`. */}
      {detail.kind === "u" && (() => {
          const h = detail.height || 600;
          const cutW = detail.innerCutWidth || 600;
          const cutD = detail.innerCutDepth || 300;
          const cutOff = detail.innerCutOffset || 300;
          const topBarHeight = Math.max(0, h - cutD);
          const corners = detail.corners;

          const omegaShift = reflexJointShift(corners, 'E', [cutW, cutD], detail.jointOmegaRadiusSide);
          const lambdaShift = reflexJointShift(corners, 'D', [cutW, cutD], detail.jointLambdaRadiusSide);

          return (
            <>
              {detail.jointOmegaDirection && drawJointLine(
                detail.jointOmegaDirection,
                detail.jointOmegaDirection === 'vertical' ? cutOff + omegaShift : topBarHeight + omegaShift,
                "u-omega",
              )}
              {detail.jointLambdaDirection && drawJointLine(
                detail.jointLambdaDirection,
                detail.jointLambdaDirection === 'vertical' ? cutOff + cutW + lambdaShift : topBarHeight + lambdaShift,
                "u-lambda",
              )}
            </>
          );
      })()}

      {mode === "edit" &&
        isActive &&
        (editMode === "corners" || editMode === "planes" || editMode === "joints") &&
        points.map((p, i) => {
          if (!p.id || p.id.startsWith("inner"))
            return null;

          // У режимі стиків кути показуємо ТІЛЬКИ там, де вони справді щось
          // задають — на увігнутих кутах Г- і П-форми (омега/лямбда, права
          // кнопка). На прямокутнику таких кутів немає, а вісім однакових
          // жовтих кульок (чотири кути + чотири середини сторін) читались як
          // однорідна розмітка і збивали з пантелику: стик задається СТОРОНОЮ.
          const isReflexCorner = reflexCornerIds(toDetailShape(detail.kind)).includes(
            p.id === 'start' ? (p.closeId || 'H') : p.id,
          );
          if (editMode === "joints" && !isReflexCorner) return null;

          const w = bounds.maxX - bounds.minX || 1;
          const h = bounds.maxY - bounds.minY || 1;
          const s = 0.001;
          const thickness = (detail.thickness || 20) * s;

          const nx = ((p.x - bounds.minX) / w - 0.5) * w * s;
          const ny = ((p.y - bounds.minY) / h - 0.5) * h * s;

          const z = thickness / 2 + 0.01;

          return (
            <group key={`corner-${i}`} position={[nx, z, ny]}>
              {(editMode === "corners" || editMode === "joints") && (
                <mesh
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    if (editMode === "joints" && onJointClick) {
                      onJointClick(p.id, e.clientX, e.clientY);
                    } else if (editMode === "corners" && onCornerClick) {
                      onCornerClick(p.id, e.clientX, e.clientY);
                    }
                  }}
                >
                  <sphereGeometry args={[0.04, 16, 16]} />
                  <meshBasicMaterial
                    color={editMode === "joints" ? "#eab308" : "#f97316"}
                    opacity={0.8}
                    transparent
                  />
                </mesh>
              )}
              <Text
                position={[0, editMode === "planes" ? 0.02 : 0.085, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.07}
                color="#c2410c"
                outlineWidth={0.006}
                outlineColor="#ffffff"
                anchorX="center"
                anchorY="middle"
                renderOrder={2}
              >
                {p.id === 'start' ? (p.closeId || 'H') : p.id}
              </Text>
            </group>
          );
        })}

      {mode === "edit" &&
        isActive &&
        editMode === "edges" &&
        lineSegments.map((item, i) => {
          if (item.id.startsWith("inner"))
            return null;

          const w = bounds.maxX - bounds.minX || 1;
          const h = bounds.maxY - bounds.minY || 1;
          const s = 0.001;

          const nx1 = (item.curve.v1.x - 0.5) * w * s;
          const ny1 = (item.curve.v1.y - 0.5) * h * s;
          const nx2 = (item.curve.v2.x - 0.5) * w * s;
          const ny2 = (item.curve.v2.y - 0.5) * h * s;

          const midX = (nx1 + nx2) / 2;
          const midY = (ny1 + ny2) / 2;

          const thickness = (detail.thickness || 20) * s;
          const z = thickness / 2 + 0.01;

          return (
            <group key={`edge-${i}`} position={[midX, z, midY]}>
              <mesh
                onContextMenu={(e) => {
                  e.stopPropagation();
                  if (onEdgeClick)
                    onEdgeClick(`${item.id}`, e.clientX, e.clientY);
                }}
              >
                <sphereGeometry args={[0.04, 16, 16]} />
                <meshBasicMaterial color="#22c55e" opacity={0.8} transparent />
              </mesh>
              <Text
                position={[0, 0.02, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.06}
                color="#15803d"
                anchorX="center"
                anchorY="middle"
                renderOrder={1}
              >
                {item.id}
              </Text>
            </group>
          );
        })}

      {/* СТИКИ задаються СТОРОНАМИ — це єдиний спосіб для простих форм.
          Наводиш на сторону — підсвічується протилежна і видно лінію майбутнього
          різу; лівий клік відкриває віконечко відступу. Тому підписані саме
          сторони (A, B, C, D), а кутові маркери в цьому режимі показуються лише
          на увігнутих кутах Г- і П-форми, де через них правою кнопкою досі
          задаються стики омега/лямбда. */}
      {mode === "edit" &&
        isActive &&
        editMode === "joints" &&
        sidesMm.map((side, i) => {
          const w = bounds.maxX - bounds.minX || 1;
          const h = bounds.maxY - bounds.minY || 1;
          const s = 0.001;

          const midXmm = (side.v1.x + side.v2.x) / 2;
          const midYmm = (side.v1.y + side.v2.y) / 2;
          const nx = ((midXmm - bounds.minX) / w - 0.5) * w * s;
          const ny = ((midYmm - bounds.minY) / h - 0.5) * h * s;

          const thickness = (detail.thickness || 20) * s;
          const z = thickness / 2 + 0.01;

          const isHighlighted = side.id === hoveredJointSide || side.id === hoveredOppositeSide;

          return (
            <group key={`joint-side-${i}`} position={[nx, z, ny]}>
              <mesh
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHoveredJointSide(side.id);
                }}
                onPointerOut={() => setHoveredJointSide(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  const selection = jointSelectionFor(side.id);
                  if (selection && onJointSideClick) {
                    onJointSideClick(selection, e.clientX, e.clientY);
                  }
                }}
              >
                <sphereGeometry args={[isHighlighted ? 0.055 : 0.04, 16, 16]} />
                <meshBasicMaterial
                  color={isHighlighted ? "#f59e0b" : "#eab308"}
                  opacity={0.85}
                  transparent
                />
              </mesh>
              {/* Підпис сторони мусить бути НАД кулькою. Раніше він стояв на
                  висоті 0.02 при радіусі кульки 0.04 — тобто всередині неї, і
                  на екрані було видно самі жовті кружечки без жодної літери. */}
              <Text
                position={[0, isHighlighted ? 0.10 : 0.085, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={isHighlighted ? 0.085 : 0.07}
                color={isHighlighted ? "#b45309" : "#78350f"}
                outlineWidth={0.006}
                outlineColor="#ffffff"
                anchorX="center"
                anchorY="middle"
                renderOrder={2}
              >
                {side.id}
              </Text>
            </group>
          );
        })}

      {mode === "edit" && isActive && editMode === "joints" && jointPreviewLine}

      {/* LOCAL ATTACHMENTS (Skirtings, Thickenings, Folds) */}
      {lineSegments.map((item) => {
        const pId = item.id;
        if (pId.startsWith("start") || pId.startsWith("inner")) return null;

        const skirting = null;
        const isThickened =
          detail.thickening?.enabled && detail.thickening.sides.includes(pId);
        const isFold = detail.fold?.enabled && detail.fold.sides.includes(pId);

        if (!skirting && !isThickened && !isFold) return null;

        const w = bounds.maxX - bounds.minX || 1;
        const h = bounds.maxY - bounds.minY || 1;
        const s = 0.001;

        const nx1 = (item.curve.v1.x - 0.5) * w * s;
        const ny1 = (item.curve.v1.y - 0.5) * h * s;
        const nx2 = (item.curve.v2.x - 0.5) * w * s;
        const ny2 = (item.curve.v2.y - 0.5) * h * s;

        const midX = (nx1 + nx2) / 2;
        const midY = (ny1 + ny2) / 2;

        const dx = nx2 - nx1;
        const dy = ny2 - ny1;
        const angle = Math.atan2(dy, dx);
        const edgeLength = Math.sqrt(dx * dx + dy * dy);

        const thickness = (detail.thickness || 20) * s;
        const zSurface = thickness / 2;

        return (
          <group
            key={`local-attachments-${pId}`}
            position={[midX, zSurface, midY]}
            rotation={[0, -angle, 0]}
          >
            {isThickened &&
              !isFold &&
              (() => {
                const extraHeight = Math.max(
                  0,
                  detail.thickening!.size * s - thickness,
                );
                if (extraHeight === 0) return null;
                const stripDepth = 50 * s;
                return (
                  <mesh
                    position={[0, -thickness - extraHeight / 2, stripDepth / 2]}
                  >
                    <boxGeometry args={[edgeLength, extraHeight, stripDepth]} />
                    <meshStandardMaterial
                      map={stoneTexture}
                      color="#ffffff"
                      roughness={0.4}
                      metalness={0.05}
                    />
                  </mesh>
                );
              })()}

            {isFold &&
              (() => {
                const extraHeight = Math.max(
                  0,
                  detail.fold!.size * s - thickness,
                );
                if (extraHeight === 0) return null;
                const foldDepth = thickness;
                return (
                  <mesh
                    position={[0, -thickness - extraHeight / 2, foldDepth / 2]}
                  >
                    <boxGeometry args={[edgeLength, extraHeight, foldDepth]} />
                    <meshStandardMaterial
                      map={stoneTexture}
                      color="#ffffff"
                      roughness={0.4}
                      metalness={0.05}
                    />
                  </mesh>
                );
              })()}

            {skirting &&
              (() => {
                const skWidth = skirting.width
                  ? skirting.width * s
                  : edgeLength;
                const skHeight = (skirting.height || 50) * s;
                const skDepth = thickness;
                const skOffset = (skirting.offset || 0) * s;
                const isR3 = skirting.type?.includes("R3");
                return (
                  <mesh
                    position={[
                      skOffset,
                      isR3 ? 0 : skHeight / 2,
                      isR3 ? 0 : skDepth / 2,
                    ]}
                  >
                    {isR3 ? (
                      <R3SkirtingGeometry
                        length={skWidth}
                        height={skHeight}
                        depth={skDepth}
                      />
                    ) : (
                      <boxGeometry args={[skWidth, skHeight, skDepth]} />
                    )}
                    <meshStandardMaterial
                      map={stoneTexture}
                      color="#ffffff"
                      roughness={0.4}
                      metalness={0.05}
                    />
                  </mesh>
                );
              })()}
          </group>
        );
      })}
    </group>
  );
}

function DetailAssemblyGroup({ detail, subDetails, activeDetailId, onCornerClick, onPlaneClick, onEdgeClick, onJointClick, onJointSideClick, onLegDoubleClick, onWallPanelDoubleClick, onDetailDoubleClick, onDetailClick, onDetailContextMenu, mode, editMode, theme, textureMode, customTextureMapFactory, position, rotation }: { detail: DetailDraft; subDetails?: Record<string, DetailDraft>;
  activeDetailId?: string;
  onCornerClick?: (id: string, x: number, y: number) => void;
  /** Передає id деталі, по площині якої клікнули — щоб виріз ліг саме на неї. */
  onPlaneClick?: (detailId?: string) => void;
  onEdgeClick?: (edgeId: string, x: number, y: number) => void;
  onJointClick?: (id: string, x: number, y: number) => void;
  onJointSideClick?: (joint: JointSideSelection, x: number, y: number) => void;
  onLegDoubleClick?: (edgeId: string) => void;
  onWallPanelDoubleClick?: (edgeId: string) => void;
  onDetailDoubleClick?: (id: string) => void;
  onDetailClick?: (id: string) => void;
  onDetailContextMenu?: (id: string, x: number, y: number) => void;
  mode?: "view" | "edit" | "dimensions";
  editMode?: "corners" | "planes" | "edges" | "joints";
  theme?: "light" | "dark";
  textureMode?: boolean;
  customTextureMapFactory?: (detailId: string) => THREE.Texture | null;
  position?: [number, number, number];
}) {
  const mainPoints = useMemo(() => {
    let pts = detail.geometry?.customPoints || [];
    if (pts.length > 0) return pts;

    let width = detail.width || 1000;
    let height = detail.height || 600;

    if (detail.kind === "l") {
      width = detail.outerWidth || 1200;
      height = detail.outerHeight || 1200;
      const iw = detail.innerHorizontal || 600;
      const ih = detail.innerVertical || 600;
      return [
        // Сторони Г-подібної названі буквами A..F — так само, як у
        // редакторі, у списку сторін і в ключах доповнень (`leg_A`,
        // `wall_panel_F`). Доти тут жила стара нотація AB/inner/CD/DA,
        // і жодне доповнення на Г-подібній не знаходило свого ребра.
        { id: "start", closeId: "F", x: 0, y: 0 },
        { id: "A", x: width, y: 0 },
        { id: "B", x: width, y: height - ih },
        { id: "C", x: iw, y: height - ih },
        { id: "D", x: iw, y: height },
        { id: "E", x: 0, y: height },
      ];
    }

    if (detail.kind === "u") {
      width = detail.width || 2400;
      height = detail.height || 1200;
      const leftH = detail.leftLegHeight ?? height;
      const rightH = detail.rightLegHeight ?? height;
      const cutW = detail.innerCutWidth || 1200;
      const cutD = detail.innerCutDepth || 600;
      const cutOff = detail.innerCutOffset || 600;

      const topBarHeight = Math.max(0, height - cutD);

      return [
        { id: "start", closeId: "H", x: 0, y: 0 },
        { id: "A", x: width, y: 0 },
        { id: "B", x: width, y: rightH },
        { id: "C", x: cutOff + cutW, y: rightH },
        { id: "D", x: cutOff + cutW, y: topBarHeight },
        { id: "E", x: cutOff, y: topBarHeight },
        { id: "F", x: cutOff, y: leftH },
        { id: "G", x: 0, y: leftH },
      ];
    }

    return [
      { id: "DA", x: 0, y: 0 },
      { id: "AB", x: width, y: 0 },
      { id: "BC", x: width, y: height },
      { id: "CD", x: 0, y: height },
    ];
  }, [detail]);

  const mainBounds = useMemo(() => {
    if (mainPoints.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return {
      minX: Math.min(...mainPoints.map((p) => p.x)),
      minY: Math.min(...mainPoints.map((p) => p.y)),
      maxX: Math.max(...mainPoints.map((p) => p.x)),
      maxY: Math.max(...mainPoints.map((p) => p.y)),
    };
  }, [mainPoints]);

  const { shape: mainShape, edgeMap: mainEdgeMap } = useDetailShape(detail || { kind: 'rect' } as any, mainPoints, mainBounds);

  const mainLineSegments = useMemo(() => {
    return mainShape.curves
      .map((curve, index) => ({ curve, id: mainEdgeMap[index] }))
      .filter((item) => item.curve.type === "LineCurve" && item.id) as Array<{
      curve: THREE.LineCurve;
      id: string;
    }>;
  }, [mainShape, mainEdgeMap]);

  // Висота встановлення від підлоги (мм → одиниці сцени). Дефолт 900.
  // Піднімає всю збірку разом з доповненнями, бо вони — діти цієї групи.
  const elevationY = (detail.elevation ?? 900) * 0.001;
  const basePos = position ?? [0, 0, 0];

  /**
   * Стінова панель і фасад висять на стіні — у сцені вони СТОЯТЬ, а не
   * лежать. Як доповнення стільниці панель уже піднімалась вертикально
   * (див. ATTACHMENTS нижче), а окремою деталлю лежала площиною —
   * той самий поворот, лише навколо власного центру.
   */
  const standsVertical = detail.type === 'Стінова панель' || detail.type === 'Фасад';
  const verticalHeight = ((mainBounds.maxY - mainBounds.minY) || 1) * 0.001;
  const isSink = detail.kind === 'sink_rect' || detail.kind === 'sink_slot';

  const mainNode = isSink ? (
    <SinkAssemblyPreview detail={detail} textureMode={textureMode} />
  ) : (
    <Detail3DNode
      id="main"
      detail={detail}
      isActive={activeDetailId === "main"}
      mode={mode}
      editMode={editMode}
      onCornerClick={onCornerClick}
      onEdgeClick={onEdgeClick}
      onPlaneClick={onPlaneClick}
      onJointClick={onJointClick}
      onJointSideClick={onJointSideClick}
      onDetailDoubleClick={onDetailDoubleClick}
      onDetailClick={onDetailClick}
      onDetailContextMenu={onDetailContextMenu}
      theme={theme}
      textureMode={textureMode}
      customTextureMap={customTextureMapFactory ? customTextureMapFactory('main') : undefined}
    />
  );

  return (
    <group position={[basePos[0], basePos[1] + elevationY, basePos[2]]}>
      {/* У режимі розмірів креслення лишається площинним — інакше
          розмірні лінії читалися б збоку */}
      {standsVertical && mode !== 'dimensions' ? (
        <group position={[0, verticalHeight / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          {mainNode}
        </group>
      ) : mainNode}

      {/* Мийки, ВСТАНОВЛЕНІ в деталь (нижній монтаж): чаша висить під
          плитою на місці вирізу. Виріз у самій плиті домішує Detail3DNode
          через withSinkCutouts — тут лише сама чаша. */}
      {!standsVertical && !isSink && mode !== 'dimensions' &&
        Object.values(detail.sinks ?? {}).map((sink) => {
          const s = 0.001;
          const w = (mainBounds.maxX - mainBounds.minX) || 1;
          const h = (mainBounds.maxY - mainBounds.minY) || 1;
          const thick = (detail.thickness || 20) * s;
          const bowlDraft = {
            kind: sink.kind === 'slot' ? 'sink_slot' : 'sink_rect',
            width: sink.width,
            height: sink.height,
            innerVertical: sink.depth,
            thickness: detail.thickness || 20,
          } as unknown as DetailDraft;
          // Центр чаші — через спільний sinkCenter (та сама формула, що в
          // отвору): sink.x/y тепер відступ від кута до кута чаші, не центр.
          const { cx, cy } = sinkCenter(detail as never, sink);
          return (
            <group key={sink.id} position={[(cx - w / 2) * s, -thick / 2, (cy - h / 2) * s]}>
              <SinkAssemblyPreview detail={bowlDraft} textureMode={textureMode} />
            </group>
          );
        })}

      {/* ATTACHMENTS (Wall Panels, Legs) */}
      {mainLineSegments.map((item, i) => {
        const pId = item.id;
        // Раніше тут відсіювались "start" і "inner*" — релікт старої
        // нотації Г-подібної. Після переходу на букви таких сторін немає,
        // а фільтр глушив два реальні ребра.

        const wallPanelId = `wall_panel_${pId}`;
        const legId = `leg_${pId}`;
        const skirtingId = `skirting_${pId}`;
        const wallPanel = subDetails?.[wallPanelId];
        const leg = subDetails?.[legId];
        const skirting = subDetails?.[skirtingId];

        if (!wallPanel && !leg && !skirting) return null;

        const w = mainBounds.maxX - mainBounds.minX || 1;
        const h = mainBounds.maxY - mainBounds.minY || 1;
        const s = 0.001;

        const nx1 = (item.curve.v1.x - 0.5) * w * s;
        const ny1 = (item.curve.v1.y - 0.5) * h * s;
        const nx2 = (item.curve.v2.x - 0.5) * w * s;
        const ny2 = (item.curve.v2.y - 0.5) * h * s;

        const midX = (nx1 + nx2) / 2;
        const midY = (ny1 + ny2) / 2;

        const dx = nx2 - nx1;
        const dy = ny2 - ny1;
        const angle = Math.atan2(dy, dx);
        const edgeLength = Math.sqrt(dx * dx + dy * dy);

        const thickness = (detail.thickness || 20) * s;
        const zSurface = thickness / 2;

        return (
          <group
            key={`attachments-${pId}`}
            position={[midX, zSurface, midY]}
            rotation={[0, -angle, 0]}
          >
            {wallPanel &&
              (() => {
                const wpWidth = wallPanel.width
                  ? wallPanel.width * s
                  : edgeLength;
                const wpHeight = (wallPanel.height || 600) * s;
                const wpDepth = thickness;
                const wpOffset = (wallPanel.offset || 0) * s;
                const posX = -edgeLength / 2 + wpOffset + wpWidth / 2;
                return (
                  <group
                    position={[posX, wpHeight / 2, -wpDepth / 2]}
                    rotation={[Math.PI / 2, 0, 0]}
                  >
                    <Detail3DNode
                      id={wallPanelId}
                      detail={wallPanel}
                      isActive={activeDetailId === wallPanelId}
                      mode={mode}
                      editMode={editMode}
                      onCornerClick={onCornerClick}
                      onEdgeClick={onEdgeClick}
                      onPlaneClick={onPlaneClick}
                      onJointClick={onJointClick}
                      onJointSideClick={onJointSideClick}
                      onDetailClick={onDetailClick}
                      onDoubleClick={() =>
                        onWallPanelDoubleClick &&
                        onWallPanelDoubleClick(pId)
                      }
                      onDetailContextMenu={onDetailContextMenu}
                      theme={theme}
                      textureMode={textureMode}
                      customTextureMap={customTextureMapFactory ? customTextureMapFactory(wallPanelId) : undefined}
                    />
                  </group>
                );
              })()}

            {skirting &&
              (() => {
                const skWidth = skirting.width ? skirting.width * s : edgeLength;
                const skHeight = (skirting.height || 50) * s;
                const skDepth = thickness;
                const posX = -edgeLength / 2 + skWidth / 2;
                return (
                  <group
                    position={[posX, skHeight / 2, -skDepth / 2]}
                    rotation={[Math.PI / 2, 0, 0]}
                  >
                    <Detail3DNode
                      id={skirtingId}
                      detail={skirting}
                      isActive={activeDetailId === skirtingId}
                      mode={mode}
                      editMode={editMode}
                      onCornerClick={onCornerClick}
                      onEdgeClick={onEdgeClick}
                      onPlaneClick={onPlaneClick}
                      onJointClick={onJointClick}
                      onJointSideClick={onJointSideClick}
                      onDetailClick={onDetailClick}
                      onDetailContextMenu={onDetailContextMenu}
                      theme={theme}
                      textureMode={textureMode}
                      customTextureMap={customTextureMapFactory ? customTextureMapFactory(skirtingId) : undefined}
                    />
                  </group>
                );
              })()}

            {leg &&
              (() => {
                const legWidth = leg.width ? leg.width * s : edgeLength;
                const legHeight = (leg.height || 900) * s;
                const legDepth = thickness;
                const legOffset = (leg.offset || 0) * s;
                const posX = -edgeLength / 2 + legOffset + legWidth / 2;
                return (
                  <group
                    position={[posX, -legHeight / 2, legDepth / 2]}
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    <Detail3DNode
                      id={legId}
                      detail={leg}
                      isActive={activeDetailId === legId}
                      mode={mode}
                      editMode={editMode}
                      onCornerClick={onCornerClick}
                      onEdgeClick={onEdgeClick}
                      onPlaneClick={onPlaneClick}
                      onDetailClick={onDetailClick}
                      onDoubleClick={() =>
                        onLegDoubleClick && onLegDoubleClick(pId)
                      }
                      onDetailContextMenu={onDetailContextMenu}
                      theme={theme}
                      textureMode={textureMode}
                      customTextureMap={customTextureMapFactory ? customTextureMapFactory(legId) : undefined}
                    />
                  </group>
                );
              })()}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Мийка в редакторі виробу — РЕАЛЬНА збірка з деталей розкрою.
 *
 * Мийка не суцільна: рушій розкладає її на стінки, трикутники дна,
 * підклейки й злив. Тут ті самі деталі (`explodeDetails`) ставляться
 * тими самими трансформаціями, що й у 3D Підборі
 * (`engines/sinkAssembly`) — щоб редактор показував не «щось схоже»,
 * а те, що поїде в цех. Кожна деталь — власний меш зі своїм контуром,
 * тому трикутні скоси дна й отвір зливу видно як є.
 */
/** Переріз профілю в площині XY (метри) — спільний для всіх сегментів ланцюга */
function metalSectionShape(profileId: string | undefined): THREE.Shape {
  const s = 0.001;
  const profile = metalProfileById(profileId) ?? METAL_PROFILES[0];
  const w = profile.w * s;
  const h = profile.h * s;
  const t = Math.max(0.5, profile.t) * s;

  const shape = new THREE.Shape();
  if (profile.section === 'tube_round') {
    shape.absarc(0, 0, w / 2, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, Math.max(0.0005, w / 2 - t), 0, Math.PI * 2, true);
    shape.holes.push(hole);
  } else if (profile.section === 'bar') {
    shape.absarc(0, 0, w / 2, 0, Math.PI * 2, false);
  } else if (profile.section === 'angle') {
    // Г-подібний переріз: дві полиці товщиною t
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2 + t);
    shape.lineTo(-w / 2 + t, -h / 2 + t);
    shape.lineTo(-w / 2 + t, h / 2);
    shape.lineTo(-w / 2, h / 2);
    shape.closePath();
  } else {
    // tube_rect і штаба — прямокутник; у труби всередині отвір
    shape.moveTo(-w / 2, -h / 2);
    shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, h / 2);
    shape.lineTo(-w / 2, h / 2);
    shape.closePath();
    if (profile.section === 'tube_rect' && w - 2 * t > 0.001 && h - 2 * t > 0.001) {
      const hole = new THREE.Path();
      hole.moveTo(-w / 2 + t, -h / 2 + t);
      hole.lineTo(-w / 2 + t, h / 2 - t);
      hole.lineTo(w / 2 - t, h / 2 - t);
      hole.lineTo(w / 2 - t, -h / 2 + t);
      hole.closePath();
      shape.holes.push(hole);
    }
  }
  return shape;
}

/**
 * Металопрокат (MVP Viyar Metal): ланцюг профілів у 3D.
 * Базовий відрізок + сегменти «від торця» (metalSegments), кожен зі своїм
 * перерізом із сортаменту. Один вузол на обидва в'ювери: редактор виробу
 * і 3D Підбір рендерять через Detail3DNode.
 */
function MetalProfileNode({
  detail,
  onClick,
  onContextMenu,
  highlight,
}: {
  detail: DetailDraft;
  onClick?: () => void;
  onContextMenu?: (e: { clientX: number; clientY: number; stopPropagation: () => void }) => void;
  highlight?: boolean;
}) {
  // Ланцюг «черепашкою» з metalSegments: та сама математика, що дає деталі
  // в розкрій (domain/metalChain) — 3D і відомість металу не розходяться.
  const pieces = useMemo(() => {
    const s = 0.001;
    return metalChainPieces(detail as never).map((piece) => {
      const geom = new THREE.ExtrudeGeometry(metalSectionShape(piece.profileId), {
        depth: piece.lengthMm * s, bevelEnabled: false, curveSegments: 24,
      });
      geom.translate(0, 0, -(piece.lengthMm * s) / 2);
      geom.rotateY(Math.PI / 2); // довжина вздовж X, переріз у площині YZ
      geom.computeVertexNormals();

      const dir = new THREE.Vector3(piece.dir[0], piece.dir[1], piece.dir[2]);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      const center = new THREE.Vector3(piece.start[0], piece.start[1], piece.start[2])
        .addScaledVector(dir, piece.lengthMm / 2)
        .multiplyScalar(s);
      return { geom, quat, center, key: `${piece.start.join(',')}|${piece.lengthMm}|${piece.profileId}` };
    });
  }, [detail]);

  return (
    <group>
      {pieces.map(({ geom, quat, center, key }) => (
        <mesh
          key={key}
          geometry={geom}
          position={center}
          quaternion={quat}
          castShadow
          receiveShadow
          onClick={(e) => { if (onClick) { e.stopPropagation(); onClick(); } }}
          onContextMenu={(e) => { if (onContextMenu) { e.stopPropagation(); onContextMenu(e as never); } }}
        >
          <meshStandardMaterial color={highlight ? '#7fb4e8' : '#9aa5ad'} metalness={0.75} roughness={0.35} />
          <Edges geometry={geom} color={highlight ? '#38bdf8' : '#5b6770'} threshold={20} />
        </mesh>
      ))}
    </group>
  );
}

function SinkAssemblyPreview({ detail, textureMode }: { detail: DetailDraft; textureMode?: boolean }) {
  const stoneTexture = useStoneTexture(textureMode);
  const s = 0.001;
  const thickness = Math.max(1, detail.thickness ?? 20) * s;

  const pieces = useMemo(() => {
    // Драфт редактора → Деталь → деталі розкрою. Припуски нульові:
    // у прев'ю показуємо чисту геометрію виробу, без запасу на різ.
    const asDetail = {
      id: 'preview-sink',
      type: 'Мийка',
      shape: 'Прямокутна',
      quantity: 1,
      thickness: detail.thickness ?? 20,
      geometry: {
        width: detail.width,
        height: detail.height,
        innerVertical: (detail as { innerVertical?: number }).innerVertical,
        sinkKind: detail.kind === 'sink_slot' ? 'slot' : 'rect',
      },
    } as unknown as Detail;

    const parts = explodeDetails([asDetail], {
      detailLength: 0, detailWidth: 0, elementLength: 0, elementWidth: 0,
      interPartSpacing: 0, detailSmallCutout: 0, detailLargeCutout: 0,
      elementSmallCutout: 0, elementLargeCutout: 0, show: false, applyToImports: false,
    } as never);

    return parts
      .map((part) => ({ part, transform: getSinkPartTransform(part, asDetail, thickness) }))
      .filter((item) => item.transform && !item.transform.hidden && item.transform.pos);
  }, [detail, thickness]);

  return (
    <group>
      {pieces.map(({ part, transform }) => {
        const width = part.width * s;
        const height = part.height * s;
        const shape = new THREE.Shape();
        const points = part.points ?? [];
        if (points.length >= 3) {
          shape.moveTo(points[0].x * s - width / 2, -(points[0].y * s) + height / 2);
          points.slice(1).forEach((point) => {
            shape.lineTo(point.x * s - width / 2, -(point.y * s) + height / 2);
          });
          shape.closePath();
        } else {
          shape.moveTo(-width / 2, -height / 2);
          shape.lineTo(width / 2, -height / 2);
          shape.lineTo(width / 2, height / 2);
          shape.lineTo(-width / 2, height / 2);
          shape.closePath();
        }
        // Отвір зливу — своїм контуром, а не «десь по центру»
        (part.holes ?? []).forEach((hole) => {
          if (hole.length < 3) return;
          const path = new THREE.Path();
          path.moveTo(hole[0].x * s - width / 2, -(hole[0].y * s) + height / 2);
          hole.slice(1).forEach((point) => path.lineTo(point.x * s - width / 2, -(point.y * s) + height / 2));
          path.closePath();
          shape.holes.push(path);
        });

        const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 24 });
        geometry.translate(0, 0, -thickness / 2);
        geometry.rotateX(Math.PI / 2);
        geometry.computeVertexNormals();

        return (
          <mesh
            key={part.id}
            geometry={geometry}
            position={transform!.pos}
            quaternion={transform!.quat}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial map={stoneTexture} color="#ffffff" roughness={0.35} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

export function Detail3DPreview({
  detail,
  subDetails,
  activeDetailId = "main",
  onCornerClick,
  onPlaneClick,
  onEdgeClick,
  onJointClick,
  onJointSideClick,
  onLegDoubleClick,
  onWallPanelDoubleClick,
  onDetailDoubleClick,
  onDetailClick,
  onDetailContextMenu,
  forceMode,
}: {
  detail?: DetailDraft;
  subDetails?: Record<string, DetailDraft>;
  activeDetailId?: string;
  onCornerClick?: (id: string, x: number, y: number) => void;
  /** Передає id деталі, по площині якої клікнули — щоб виріз ліг саме на неї. */
  onPlaneClick?: (detailId?: string) => void;
  onEdgeClick?: (edgeId: string, x: number, y: number) => void;
  onJointClick?: (id: string, x: number, y: number) => void;
  onJointSideClick?: (joint: JointSideSelection, x: number, y: number) => void;
  onLegDoubleClick?: (edgeId: string) => void;
  onWallPanelDoubleClick?: (edgeId: string) => void;
  onDetailDoubleClick?: (id: string) => void;
  onDetailClick?: (id: string) => void;
  onDetailContextMenu?: (id: string, x: number, y: number) => void;
  forceMode?: "view" | "edit" | "dimensions";
}) {
  const [mode, setMode] = useState<"view" | "edit" | "dimensions">(forceMode || "view");
  const [editMode, setEditMode] = useState<"corners" | "planes" | "edges" | "joints">(
    "corners",
  );
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [textureMode, setTextureMode] = useState(false);

  useEffect(() => {
    if (forceMode) {
      setMode(forceMode);
    }
  }, [forceMode]);

  const mainPoints = useMemo(() => {
    if (!detail) return [];
    let pts = detail.geometry?.customPoints || [];
    if (pts.length > 0) return pts;

    let width = detail.width || 1000;
    let height = detail.height || 600;

    if (detail.kind === "l") {
      width = detail.outerWidth || 1200;
      height = detail.outerHeight || 1200;
      const iw = detail.innerHorizontal || 600;
      const ih = detail.innerVertical || 600;
      return [
        // Сторони Г-подібної названі буквами A..F — так само, як у
        // редакторі, у списку сторін і в ключах доповнень (`leg_A`,
        // `wall_panel_F`). Доти тут жила стара нотація AB/inner/CD/DA,
        // і жодне доповнення на Г-подібній не знаходило свого ребра.
        { id: "start", closeId: "F", x: 0, y: 0 },
        { id: "A", x: width, y: 0 },
        { id: "B", x: width, y: height - ih },
        { id: "C", x: iw, y: height - ih },
        { id: "D", x: iw, y: height },
        { id: "E", x: 0, y: height },
      ];
    }

    if (detail.kind === "u") {
      width = detail.width || 2400;
      height = detail.height || 1200;
      const leftH = detail.leftLegHeight ?? height;
      const rightH = detail.rightLegHeight ?? height;
      const cutW = detail.innerCutWidth || 1200;
      const cutD = detail.innerCutDepth || 600;
      const cutOff = detail.innerCutOffset || 600;

      const topBarHeight = Math.max(0, height - cutD);

      return [
        { id: "start", closeId: "H", x: 0, y: 0 },
        { id: "A", x: width, y: 0 },
        { id: "B", x: width, y: rightH },
        { id: "C", x: cutOff + cutW, y: rightH },
        { id: "D", x: cutOff + cutW, y: topBarHeight },
        { id: "E", x: cutOff, y: topBarHeight },
        { id: "F", x: cutOff, y: leftH },
        { id: "G", x: 0, y: leftH },
      ];
    }

    return [
      { id: "DA", x: 0, y: 0 },
      { id: "AB", x: width, y: 0 },
      { id: "BC", x: width, y: height },
      { id: "CD", x: 0, y: height },
    ];
  }, [detail]);

  const mainBounds = useMemo(() => {
    if (mainPoints.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return {
      minX: Math.min(...mainPoints.map((p) => p.x)),
      minY: Math.min(...mainPoints.map((p) => p.y)),
      maxX: Math.max(...mainPoints.map((p) => p.x)),
      maxY: Math.max(...mainPoints.map((p) => p.y)),
    };
  }, [mainPoints]);

  const { shape: mainShape, edgeMap: mainEdgeMap } = useDetailShape(
    detail || { kind: 'rect' } as any,
    mainPoints,
    mainBounds,
  );

  const mainLineSegments = useMemo(() => {
    return mainShape.curves
      .map((curve, index) => ({ curve, id: mainEdgeMap[index] }))
      .filter((item) => item.curve.type === "LineCurve" && item.id) as Array<{
      curve: THREE.LineCurve;
      id: string;
    }>;
  }, [mainShape, mainEdgeMap]);

  const stoneTexture = useStoneTexture();

  return (
    <div
      className={`w-full h-full relative overflow-hidden flex flex-col ${theme === "dark" ? "bg-slate-900" : "bg-[#f0f4f8]"}`}
    >
      {!forceMode && (
        <div className="absolute top-4 right-4 z-10 flex flex-row gap-2 items-start">
        <div
          className={`flex rounded-md shadow-sm border p-1 gap-1 ${theme === "dark" ? "bg-slate-800 border-slate-700" : "bg-white border-[#c6d3dd]"}`}
        >
          <button
            onClick={() => setMode("view")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-colors ${mode === "view" ? (theme === "dark" ? "bg-slate-700 text-slate-200" : "bg-[#f0f4f8] text-slate-800") : theme === "dark" ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
            title="Перегляд"
          >
            <Eye className="w-4 h-4" /> Перегляд
          </button>
          <button
            onClick={() => {
              setMode("edit");
              setEditMode("corners");
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-colors ${mode === "edit" ? (theme === "dark" ? "bg-blue-900/50 text-blue-400" : "bg-[#e0f0ff] text-[#0084ff]") : theme === "dark" ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
            title="Редагування"
          >
            <Edit2 className="w-4 h-4" /> Редагування
          </button>
          <button
            onClick={() => setMode("dimensions")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-colors ${mode === "dimensions" ? (theme === "dark" ? "bg-slate-700 text-slate-200" : "bg-[#f0f4f8] text-slate-800") : theme === "dark" ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
            title="Розміри"
          >
            <Ruler className="w-4 h-4" /> Розміри
          </button>
          <button
            onClick={() => setTextureMode(!textureMode)}
            className={`flex items-center justify-center p-1.5 rounded-sm transition-colors ${textureMode ? "bg-[#0084ff] text-white" : theme === "light" ? "text-slate-500 hover:text-slate-800 hover:bg-slate-50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"}`}
            title="Текстурний режим"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className={`flex items-center justify-center p-1.5 rounded-sm transition-colors ${theme === "light" ? "text-slate-500 hover:text-slate-800 hover:bg-slate-50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"}`}
            title={theme === "light" ? "Темна тема" : "Світла тема"}
          >
            {theme === "light" ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Sun className="w-4 h-4" />
            )}
          </button>
        </div>

        {mode === "edit" && (
          <div
            className={`flex rounded-md shadow-sm border p-1 gap-1 ${theme === "dark" ? "bg-slate-800 border-slate-700" : "bg-white border-[#c6d3dd]"}`}
          >
            <button
              onClick={() => setEditMode("corners")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${editMode === "corners" ? "bg-orange-100 text-orange-700" : theme === "dark" ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              Кути
            </button>
            <button
              onClick={() => setEditMode("planes")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${editMode === "planes" ? "bg-blue-100 text-blue-700" : theme === "dark" ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              Площини
            </button>
            <button
              onClick={() => setEditMode("edges")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${editMode === "edges" ? "bg-green-100 text-green-700" : theme === "dark" ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              Сторони
            </button>
            <button
              onClick={() => setEditMode("joints")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${editMode === "joints" ? "bg-yellow-100 text-yellow-700" : theme === "dark" ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              Стики
            </button>
          </div>
        )}
      </div>
      )}

      <Suspense
        fallback={
          <div
            className={`absolute inset-0 flex items-center justify-center ${theme === "dark" ? "text-slate-500" : "text-slate-400"}`}
          >
            Завантаження 3D...
          </div>
        }
      >
        <Canvas camera={{ position: [2, 2, 2], fov: 45 }}>
          <color
            attach="background"
            args={[mode === "dimensions" ? "#ffffff" : theme === "dark" ? "#0f172a" : "#f0f4f8"]}
          />
          <ambientLight intensity={mode === "dimensions" ? 1.0 : 0.6} />
          <directionalLight position={[10, 10, 5]} intensity={mode === "dimensions" ? 0.5 : 1.2} castShadow={mode !== "dimensions"} />
          <Environment preset="city" />

          {mode !== "dimensions" && (
            <>
              <Grid
                position={[0, 0, 0]}
                infiniteGrid
                fadeDistance={10}
                cellColor={theme === "dark" ? "#334155" : "#d1d5db"}
                sectionColor={theme === "dark" ? "#475569" : "#9ca3af"}
                cellThickness={0.5}
                sectionThickness={1}
              />
              <axesHelper args={[5]} />
            </>
          )}

          {detail && (
            <DetailAssemblyGroup
              detail={detail}
              subDetails={subDetails}
              activeDetailId={activeDetailId}
              mode={mode}
              editMode={editMode}
              theme={theme}
              textureMode={textureMode}
              onCornerClick={onCornerClick}
              onPlaneClick={onPlaneClick}
              onEdgeClick={onEdgeClick}
              onJointClick={onJointClick}
              onJointSideClick={onJointSideClick}
              onLegDoubleClick={onLegDoubleClick}
              onWallPanelDoubleClick={onWallPanelDoubleClick}
              onDetailDoubleClick={onDetailDoubleClick}
              onDetailClick={onDetailClick}
              onDetailContextMenu={onDetailContextMenu}
            />
          )}

          {mode !== "dimensions" && (
            <ContactShadows
              position={[0, 0.01, 0]}
              opacity={0.4}
              scale={10}
              blur={2.5}
              far={2}
            />
          )}
            <OrbitControls
              makeDefault
              minPolarAngle={0}
              maxPolarAngle={Math.PI / 2 + 0.1}
            />
        </Canvas>
      </Suspense>
    </div>
  );
}

export function useDetailGeometry(detail: any, points: any[], bounds: any) {
  return useMemo(() => {
    return buildDetailGeometry(detail, points, bounds);
  }, [detail, points, bounds]);
}
