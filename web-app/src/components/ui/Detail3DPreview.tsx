import  { Suspense, useMemo, useState, useEffect, useRef, createContext, useContext } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { SafeEnvironment } from "../3d/SafeEnvironment";
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
  Html,
} from "@react-three/drei";
import { Eye, Edit2, Ruler, Moon, Sun, Image as ImageIcon, Info, Focus, Home, ArrowDownToLine } from "lucide-react";
import * as THREE from "three";
import type { DetailDraft } from "../forms/utils/draftHelpers";
import { buildDetailShape, buildDetailGeometry, getDetailPointsAndBounds, contourPointsFor, contourForCutters } from '../../engines/shapeBuilder';
import { buildEdgeCutters, subtractEdgeCutters } from '../../engines/edgeCutters';
import { buildGrooveCutters } from '../../engines/surfaceGrooves';
import { explodeDetails } from '../../engines/geometry';
import { getSinkPartTransform } from '../../engines/sinkAssembly';
import { sampleContourPoints } from '../../engines/shapeBuilder';
import { attachmentPlacement } from '../../engines/transform3d';
import { parseAdditionSlot } from '../../domain/ids';
import { hasEdgeTreatment } from '../../domain/edgeTreatment';
import { useEdgeSourceSide } from '../../store/useEdgeSourceSide';
import '../../styles/bottega.css';
import { cutoutCenter } from '../../domain/cutoutAnchor';
import type { Detail } from '../../domain/types';
import { ProductElement3DNode } from '../3d/ProductElement3DNode';
import { attachContextLossRecovery } from '../../utils/webglContextRecovery';
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
import { anchorContextFor, toDetailShape } from '../../domain/elementToDetail';
import { withSinkCutouts, sinkCenter } from '../../domain/productSink';
import { metalProfileById, METAL_PROFILES } from '../../domain/metalProfiles';
import { metalChainPieces } from '../../domain/metalChain';
import { pointInPolygonStrict } from '../../engines/geometryUtils';
import { useUIStore } from '../../store/useStore';
import { useProjectStore } from '../../store/useProjectStore';
import { RoomSolids } from '../room/RoomSolids';
import { solidAabb } from '../../domain/room';
import type { RoomModel } from '../../domain/room';
import { placeOnRoomFace, roomFaceLabel, type RoomFaceHit, type ScenePlacementMm } from '../../domain/roomPlacement';
import { edgeMarkerLabel } from '../../utils/edgeMarkerLabel';
import { radiusElementSpecs, cornerAdjacentSides } from '../../domain/radiusElement';

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

/**
 * Видимість чорних контурів (Edges) на деталях.
 *
 * У редакторі виробу контури — основна графіка (без них білі деталі
 * зливаються), тому дефолт true і редактор нічого не передає. У 3D Підборі
 * є кнопка «Показувати контури» — там Viewer3D обгортає збірку провайдером
 * зі значенням із стора. Раніше кнопка глушила лише власні меші Підбору,
 * а деталі, намальовані через Detail3DNode (режим збірки), її ігнорували.
 */
export const EdgesVisibility = createContext(true);

/**
 * ВИБІР ДЕТАЛІ В РЕДАКТОРІ (рішення власника 01.09).
 *   hasSelection — якась деталь обрана: решта стають прозорими на 40 %;
 *   isolate      — режим «лише обрана»: решта не малюються взагалі.
 * Скидання вибору — клік у пусте поле сцени (Canvas.onPointerMissed).
 */
export const SelectionView = createContext<{ hasSelection: boolean; isolate: boolean }>({
  hasSelection: false,
  isolate: false,
});

/** Прозорість неактивних деталей при вибраній — 40 % (тобто opacity 0.4). */
const DIMMED_OPACITY = 0.4;

/*
 * Маркери обраної деталі (сторони, кути, стики) з 01.09 — HTML-квадратики
 * SideChip3D над полотном: вони самі ловлять клік, і трюк із raycast
 * «маркер завжди перший у черзі» (markerRaycast) більше не потрібен.
 */

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
  edgeMap,
  bounds,
  isActive = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  highlight,
  textureMode,
  flat,
  customTextureMap,
  depthBias = 0,
  extraCutters,
}: {
  detail: DetailDraft;
  shape: THREE.Shape;
  /**
   * Додаткові різаки в просторі ЦЬОГО меша (01.09): площини стику 45°
   * з ногою/підворотом/потовщенням (miterCutters). Віднімаються разом із
   * різаками торців.
   */
  extraCutters?: THREE.BufferGeometry[];
  /** Крива контуру → ім'я сторони (з buildDetailShape) — для різаків торців */
  edgeMap?: Record<number, string>;
  bounds: any;
  /** Ця деталь обрана (для прозорості/ізоляції решти — SelectionView). */
  isActive?: boolean;
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

    /*
     * ТОРЦІ (28.08, рішення власника): профілі крайок ріжуться як
     * інструмент — перетин фрези протягнутий уздовж сторони і відніматий
     * CSG (engines/edgeCutters). Різаки будуються в мм-контурі деталі й
     * приходять уже в просторі цього меша (та сама послідовність
     * scale/translate/rotateX). Кеш — цей useMemo: перерахунок лише коли
     * людина реально міняє деталь чи її обробки.
     */
    const cutters: THREE.BufferGeometry[] = [];

    /*
     * РАДІУСИ (01.09): різакам віддається контур З ДУГАМИ — рівно ті
     * вершини, що лежать у цьому ж меші (contourForCutters повторює
     * правило поділу кривих ExtrudeGeometry), плюс sideSegments за
     * edgeMap, щоб дуги ділились між сторонами так само, як у збірці.
     * Раніше сюди йшов contourPointsFor без дуг — профіль обривався
     * перед радіусом, а сам радіус лишався сирим.
     */
    const hasEdgeProfiles = Boolean(detail.edgeProfiles && Object.values(detail.edgeProfiles).some(Boolean));
    const hasCornerMilling = Object.values(detail.corners ?? {}).some(
      (c) => c?.edgeProcessing && c.edgeProcessing !== 'Без фрезерування',
    );
    const hasCutoutMilling = Object.values(detail.cutouts ?? {}).some(
      (c) => c?.edgeProcessing && c.edgeProcessing !== 'Без фрезерування',
    );
    if (hasEdgeProfiles || hasCornerMilling || hasCutoutMilling) {
      try {
        const contour = edgeMap
          ? contourForCutters(shape, edgeMap, w, h, 32)
          : { points: getDetailPointsAndBounds(detail).points, sideSegments: undefined, holes: undefined };
        const partLike = {
          isMain: true,
          width: w,
          height: h,
          points: contour.points,
          sideSegments: contour.sideSegments,
          holes: contour.holes,
        } as unknown as import('../../domain/types').DetailPart;
        cutters.push(...buildEdgeCutters(partLike, detail.edgeProfiles, detail.thickness || 20, {
          corners: detail.corners as Record<string, import('../../domain/types').CornerProcessing> | undefined,
          cutouts: detail.cutouts as Record<string, import('../../domain/types').SurfaceCutout> | undefined,
        }));
      } catch (e) {
        console.error('edge cutters error', e);
      }
    }

    /*
     * ФРЕЗЕРУВАННЯ ПЛОЩИНИ (28.08): проточки для води, декор фасадів.
     * Той самий підхід — симуляція фрези, те саме CSG-віднімання.
     * Нездійсненні групи `buildGrooveCutters` відсіює сам (див.
     * validateGrooveGroup): краще порожньо, ніж картинка того, чого цех
     * не зробить.
     */
    if (detail.surfaceGrooves?.length) {
      try {
        cutters.push(...buildGrooveCutters(detail.surfaceGrooves, w, h, detail.thickness || 20));
      } catch (e) {
        console.error('groove cutters error', e);
      }
    }

    if (extraCutters?.length) cutters.push(...extraCutters);
    if (cutters.length) return { geometry: subtractEdgeCutters(geom, cutters) };
    return { geometry: geom };
  }, [detail, shape, edgeMap, bounds, extraCutters]);

  const stoneTexture = useStoneTexture(textureMode);
  const edgesVisible = useContext(EdgesVisibility);
  const selection = useContext(SelectionView);
  // Обрана інша деталь: ця — прозора на 40 %, а в режимі «лише обрана» — не малюється.
  const dimmed = selection.hasSelection && !isActive;
  if (dimmed && selection.isolate) return null;

  return (
    <mesh
      geometry={geometry}
      castShadow={!dimmed}
      // Примарна деталь не приймає тіней: тінь стінової панелі на 40 %-й
      // стільниці робила її на вигляд суцільно сірою, а не прозорою.
      receiveShadow={!dimmed}
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
      {edgesVisible && !dimmed && (
        <Edges
          geometry={geometry}
          color={highlight ? "#38bdf8" : "#94a3b8"}
          threshold={15}
        />
      )}
      {/* key: three.js компілює шейдер з #define OPAQUE для непрозорого
          матеріалу і примусово ставить alpha = 1; зміна `transparent` на
          живому матеріалі шейдер не перекомпільовує (needsUpdate не
          виставляється) — деталь лишалась суцільною. Новий матеріал на
          кожен перехід примарна ↔ суцільна. */}
      {flat ? (
        <meshBasicMaterial
          key={dimmed ? 'ghost' : 'solid'}
          color={highlight ? "#e0f2fe" : "#f1f5f9"}
          transparent={dimmed}
          opacity={dimmed ? DIMMED_OPACITY : 1}
          depthWrite={!dimmed}
        />
      ) : (
        <meshPhysicalMaterial
          key={dimmed ? 'ghost' : 'solid'}
          color={highlight ? "#e0f2fe" : "#ffffff"}
          emissive={highlight ? "#38bdf8" : "#000000"}
          emissiveIntensity={highlight ? 0.2 : 0}
          map={customTextureMap || stoneTexture}
          roughness={0.4}
          metalness={0.05}
          transparent={dimmed}
          opacity={dimmed ? DIMMED_OPACITY : 1}
          depthWrite={!dimmed}
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

/**
 * ПОЗНАЧКА СТОРОНИ/КУТА В 3D (01.09, власник: «сторони позначались такими
 * гарними квадратами Bottega, і буква дивиться на мене незалежно від того,
 * як крутити камеру»). HTML-накладка (drei Html) у точці сцени — завжди в
 * площині екрана, сталого розміру, тим самим оформленням, що й літери в
 * панелі кромок (bt-chip3d у styles/bottega.css). Кулі з плоскими літерами
 * (FG-29) при повороті камери читались боком або догори ногами.
 *
 * zIndexRange низький: накладка має лежати над полотном, але під модалками
 * (каталог кромок, довідник) і спливаючою карткою розрізу (z 200).
 * Лівий клік і права кнопка — ті самі дії, що були на кулях.
 */
function SideChip3D({ text, tone, on, src, hot, locked, small, title, onClick, onContextMenu, onPointerOver, onPointerOut }: {
  text: string;
  tone?: 'amber' | 'orange' | 'teal';
  /** Синій — на стороні є обробка (як у панелі кромок). */
  on?: boolean;
  /** Зелений — взірець для копіювання обробки. */
  src?: boolean;
  /** Підсвічена (наведення в режимі стиків). */
  hot?: boolean;
  /** Бліда пунктирна — сторона закрита доповненням. */
  locked?: boolean;
  small?: boolean;
  title?: string;
  onClick?: (x: number, y: number) => void;
  onContextMenu?: (x: number, y: number) => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
}) {
  const cls = ['bt-chip3d', tone ?? '', on ? 'on' : '', src ? 'src' : '', hot ? 'hot' : '', locked ? 'locked' : '', small ? 'small' : '']
    .filter(Boolean).join(' ');
  return (
    <Html center zIndexRange={[30, 0]} pointerEvents="none">
      <button
        type="button"
        className={cls}
        title={title}
        style={{ pointerEvents: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClick?.(e.clientX, e.clientY); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e.clientX, e.clientY); }}
        onPointerEnter={onPointerOver}
        onPointerLeave={onPointerOut}
      >
        {text}
      </button>
    </Html>
  );
}

export function Detail3DNode({
  id,
  detail,
  isActive,
  mode,
  editMode,
  onCornerClick,
  onCutoutDoubleClick,
  onEdgeClick,
  onEdgeSelect,
  occupiedSides,
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
  extraCutters,
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
  /** FG-31 — подвійний клік по вирізу веде до його запису в панелі. */
  onCutoutDoubleClick?: (cutoutId: string) => void;
  onEdgeClick?: (edgeId: string, x: number, y: number) => void;
  /** Лівий клік по літері сторони в 3D (01.09): взірець / копіювання обробки — як у панелі кромок. */
  onEdgeSelect?: (edgeId: string) => void;
  /** Сторони активної деталі, закриті доповненням (domain/edgeOccupancy) — літера бліда, клік не діє. */
  occupiedSides?: Record<string, string>;
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
  /** Різаки стику 45° у просторі меша цієї деталі (miterCutters). */
  extraCutters?: THREE.BufferGeometry[];
}) {
  // Мийки, встановлені в деталь, домішують отвір під чашу до вирізів —
  // плита в 3D одразу з вирізом, хоча в draft.cutouts його не зберігаємо.
  detail = useMemo(() => withSinkCutouts(detail), [detail]);
  const stoneTexture = useStoneTexture(textureMode);
  // Взірець обробки торця цієї деталі (спільне сховище з панеллю кромок)
  const sourceSide = useEdgeSourceSide((st) => (st.side && st.scope === id ? st.side : null));
  const points = useMemo(() => {
    // Крок 4.4: контур може бути виведений із ніші (`uCutout`), а не
    // заданий точками. Спільний хелпер — інакше ніша була б у розкрої,
    // але не в 3D: рендер бачив чернетку й малював прямокутник.
    let pts = contourPointsFor(detail as never) || detail.geometry?.customPoints || [];
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
   * Дуги скруглень — на прохання Богдана (19.08) вони теж «сторони»:
   * зі своїм маркером у режимі «Сторони», щоб дугу було видно і зрозуміло,
   * що з неї росте гнутий елемент. Маркер стоїть на середині дуги.
   */
  const arcSegments = useMemo(() => {
    return shape.curves
      .map((curve, index) => ({ curve, id: edgeMap[index] }))
      .filter((item) => item.curve.type === "EllipseCurve" && item.id && /_radius$/.test(item.id))
      .map((item) => ({ id: item.id as string, mid: (item.curve as THREE.EllipseCurve).getPoint(0.5) }));
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
        edgeMap={edgeMap}
        bounds={bounds}
        extraCutters={extraCutters}
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
        isActive={isActive}
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

          const cornerActive = editMode === "corners" || editMode === "joints";
          const cornerText = p.id === 'start' ? (p.closeId || 'H') : p.id;
          return (
            <group key={`corner-${i}`} position={[nx, z, ny]}>
              {/* Квадратик Bottega (01.09): у режимах кутів/стиків — помаранчевий і
                  клікабельний правою кнопкою; в інших — блідий орієнтир */}
              <SideChip3D
                text={editMode === "joints" ? `кут ${cornerText}` : cornerText}
                tone={cornerActive ? 'orange' : undefined}
                small
                title={editMode === "joints" ? `Кут ${cornerText}: права кнопка — стик омега/лямбда` : editMode === "corners" ? `Кут ${cornerText}: права кнопка — радіус, фаска, Г-виріз` : `Кут ${cornerText}`}
                onContextMenu={(x, y) => {
                  if (editMode === "joints" && onJointClick) onJointClick(p.id, x, y);
                  else if (editMode === "corners" && onCornerClick) onCornerClick(p.id, x, y);
                }}
              />
            </group>
          );
        })}

      {/*
        FG-31. ЛОВЦІ КЛІКУ ПО ВИРІЗАХ.

        Виріз у 3D — це ДІРКА в меші плити, а не об'єкт: промінь миші крізь
        неї просто пролітає, тож клікати не було по чому, і потрібний виріз
        доводилось шукати перебором у панелі. Тому на місце кожного вирізу
        кладемо власну пласку мішень: подвійний клік по ній відкриває саме
        цей запис.

        Центр рахує той самий `cutoutCenter`, що будує й саму дірку — двох
        математик прив'язки в проєкті бути не повинно (див. cutoutAnchor).
      */}
      {mode === "edit" && isActive && onCutoutDoubleClick &&
        Object.entries(detail.cutouts ?? {}).map(([cutoutId, cutout]) => {
          const w = bounds.maxX - bounds.minX || 1;
          const h = bounds.maxY - bounds.minY || 1;
          const s = 0.001;
          const thickness = (detail.thickness || 20) * s;

          const { cx: absX, cy: absY } = cutoutCenter(cutout, anchorContextFor(detail as never));
          const nx = ((absX - bounds.minX) / w - 0.5) * w * s;
          const ny = ((absY - bounds.minY) / h - 0.5) * h * s;

          const isCircle = cutout.shape === 'circle';
          const sizeX = (isCircle ? (cutout.radius || 0) * 2 : (cutout.width || 0)) * s;
          const sizeY = (isCircle ? (cutout.radius || 0) * 2 : (cutout.height || 0)) * s;
          // Дрібна розетка інакше нерозклікувана: мішень не менша за 30 мм.
          const MIN_TARGET = 30 * s;
          const tx = Math.max(sizeX, MIN_TARGET);
          const ty = Math.max(sizeY, MIN_TARGET);

          return (
            <mesh
              key={`cutout-target-${cutoutId}`}
              position={[nx, thickness / 2 + 0.004, ny]}
              rotation={[-Math.PI / 2, 0, 0]}
              onDoubleClick={(e) => { e.stopPropagation(); onCutoutDoubleClick(cutoutId); }}
            >
              <planeGeometry args={[tx, ty]} />
              {/* У режимі вирізів мішень ледь помітна — щоб про неї знали.
                  У решті режимів вона прозора, але клік однаково ловить:
                  прозорість не знімає об'єкт із променя, на відміну від
                  visible={false}. */}
              <meshBasicMaterial
                color="#1f93ef"
                transparent
                opacity={editMode === "cutouts" ? 0.18 : 0}
                depthWrite={false}
              />
            </mesh>
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

          /* FG-29: у 3D сторони були безіменними зеленими кружечками, і людина
             не могла зіставити їх із A/B/C/D на 2D-кресленні. Літера НЕ була
             забута — вона малювалась на висоті 0.02 при радіусі кульки 0.04,
             тобто всередині неї. Той самий недогляд уже виправляли для стиків
             нижче. Піднімаємо підпис над кулькою і даємо білу обводку, щоб
             читався на будь-якому камені. */
          const label = edgeMarkerLabel(item.id);
          // Квадратик Bottega (01.09): синій — є обробка, зелений — взірець,
          // блідий пунктир — торець закриває доповнення. Лівий клік — взірець /
          // копіювання (як літера в панелі), права кнопка — меню обробки торця.
          const on = hasEdgeTreatment(detail.edgeProfiles?.[item.id]);
          const occupiedBy = occupiedSides?.[item.id];
          const isSrc = sourceSide === item.id;
          const chipTitle = occupiedBy
            ? `Торець закриває ${occupiedBy}`
            : isSrc ? 'Взірець — клік знімає (Esc)'
              : sourceSide ? `Скопіювати обробку зі сторони ${sourceSide}`
                : `Сторона ${label.text}: клік — взірець для копіювання обробки, права кнопка — обробка торця`;

          return (
            <group key={`edge-${i}`} position={[midX, z, midY]}>
              <SideChip3D
                text={label.text}
                on={on}
                src={isSrc}
                locked={Boolean(occupiedBy)}
                small={label.isCornerSegment}
                title={chipTitle}
                onClick={() => { if (!occupiedBy) onEdgeSelect?.(item.id); }}
                onContextMenu={(x, y) => { if (onEdgeClick) onEdgeClick(`${item.id}`, x, y); }}
              />
            </group>
          );
        })}

      {/* Дуги скруглень як «сторони» (FG-27): бірюзовий маркер на середині
          дуги. Правий клік — те саме меню обробки торця, що і в прямих
          сторін. Якщо на обох сторонах кута стоїть смуга — з цієї дуги
          в розкрої виросте гнутий елемент. */}
      {mode === "edit" &&
        isActive &&
        editMode === "edges" &&
        arcSegments.map((arc, i) => {
          const w = bounds.maxX - bounds.minX || 1;
          const h = bounds.maxY - bounds.minY || 1;
          const s = 0.001;
          const midX = (arc.mid.x - 0.5) * w * s;
          const midY = (arc.mid.y - 0.5) * h * s;
          const thickness = (detail.thickness || 20) * s;
          const z = thickness / 2 + 0.01;
          const label = edgeMarkerLabel(arc.id);
          // Кут `start` (початок обходу Г/П-форми) — службове ім'я, яке
          // edgeMarkerLabel чесно ховає. Але користувачу дуга без підпису
          // читається як «без сторони» — підписуємо суміжними сторонами.
          const arcText = label.text
            || cornerAdjacentSides(arc.id.replace(/_radius$/, ''), detail.kind)?.join('–')
            || '';

          return (
            <group key={`arc-${i}`} position={[midX, z, midY]}>
              <SideChip3D
                text={arcText ? `дуга ${arcText}` : 'дуга'}
                tone="teal"
                small
                on={hasEdgeTreatment(detail.edgeProfiles?.[arc.id])}
                title="Дуга скруглення: права кнопка — обробка торця"
                onContextMenu={(x, y) => { if (onEdgeClick) onEdgeClick(`${arc.id}`, x, y); }}
              />
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
              {/* Бурштиновий квадратик: наведення підсвічує цю й протилежну сторону
                  (лінія майбутнього різу), клік — віконце відступу стику */}
              <SideChip3D
                text={side.id}
                tone="amber"
                hot={isHighlighted}
                title={`Сторона ${side.id}: клік — стик (відступ різу)`}
                onPointerOver={() => setHoveredJointSide(side.id)}
                onPointerOut={() => setHoveredJointSide(null)}
                onClick={(x, y) => {
                  const selection = jointSelectionFor(side.id);
                  if (selection && onJointSideClick) onJointSideClick(selection, x, y);
                }}
              />
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

/**
 * Гнутий бандаж (FG-27): смуга, що обходить скруглений кут по дузі.
 *
 * Раніше доповнення на дузі не малювалось ВЗАГАЛІ: блок кріплень ітерує
 * лише прямі ребра, і шматок «Потовщення (B_radius)» існував у дереві,
 * а в сцені — ні. Геометрія — сектор кільця: зовнішній радіус = радіус
 * кута, товщина кільця = товщина каменю, висота = виліт смуги.
 */
function ArcBand({ curve, bounds, slabThicknessMm, bandThicknessMm, heightMm, goesDown, gapMm, isActive, theme, outward, onPick, onMenu }: {
  curve: THREE.EllipseCurve;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  slabThicknessMm: number;
  bandThicknessMm: number;
  heightMm: number;
  goesDown: boolean;
  gapMm: number;
  isActive: boolean;
  theme: string;
  /**
   * true — кут УВІГНУТИЙ (внутрішній радіус): камінь лежить ЗЗОВНІ дуги,
   * і смуга обіймає її з зовнішнього боку (rАрки … rАрки + товщина).
   * false — опуклий кут: смуга сідає всередину (rАрки − товщина … rАрки).
   * Без цього бандаж внутрішнього радіуса залазив у тіло плити.
   */
  outward: boolean;
  onPick?: () => void;
  onMenu?: (x: number, y: number) => void;
}) {
  const s = 0.001;
  const w = bounds.maxX - bounds.minX || 1;
  const h = bounds.maxY - bounds.minY || 1;
  const cx = (curve.aX - 0.5) * w * s;
  const cy = (curve.aY - 0.5) * h * s;
  // Радіуси в контурі нормовані по осях (r/w і r/h) — повертаємо в мм.
  const rArc = Math.max(curve.xRadius * w, curve.yRadius * h) * s;
  const t = Math.max(8, bandThicknessMm) * s;
  const rOuter = outward ? rArc + t : rArc;
  const rInner = Math.max(0.0005, outward ? rArc : rArc - t);
  const height = Math.max(1, heightMm) * s;

  const geometry = useMemo(() => {
    const ring = new THREE.Shape();
    ring.absarc(0, 0, rOuter, curve.aStartAngle, curve.aEndAngle, curve.aClockwise);
    ring.absarc(0, 0, rInner, curve.aEndAngle, curve.aStartAngle, !curve.aClockwise);
    ring.closePath();
    return new THREE.ExtrudeGeometry(ring, { depth: height, bevelEnabled: false, curveSegments: 24 });
  }, [rOuter, rInner, height, curve]);

  const zTop = (slabThicknessMm || 20) * s / 2;
  // Поворот +90° по X: глибина екструзії йде В НИЗ від позиції. Тому
  // «вниз» стоїть на верхній площині, «вгору» — на висоту вище неї.
  const y = goesDown ? zTop - gapMm * s : zTop + height + gapMm * s;

  const selection = useContext(SelectionView);
  const dimmed = selection.hasSelection && !isActive;
  if (dimmed && selection.isolate) return null;

  return (
    <mesh
      geometry={geometry}
      position={[cx, y, cy]}
      rotation={[Math.PI / 2, 0, 0]}
      onClick={(e) => { e.stopPropagation(); onPick?.(); }}
      onContextMenu={(e) => { e.stopPropagation(); onMenu?.(e.clientX, e.clientY); }}
    >
      <meshStandardMaterial
        key={dimmed ? 'ghost' : 'solid'}
        color={isActive ? '#bfdcff' : theme === 'dark' ? '#94a3b8' : '#ededed'}
        roughness={0.45}
        metalness={0.05}
        side={THREE.DoubleSide}
        transparent={dimmed}
        opacity={dimmed ? DIMMED_OPACITY : 1}
        depthWrite={!dimmed}
      />
    </mesh>
  );
}

/**
 * ХВИЛЯ 4 · крок 4.2 (FG-14) — доповнення НА ДОПОВНЕННІ у 3D Редакторі.
 *
 * Головний цикл нижче ходить по ребрах СТІЛЬНИЦІ. Поки панель могла
 * стояти тільки на ній, цього вистачало; щойно з'явився слот з адресою
 * власника (`wall_panel_B_wall_panel_C`), таку деталь треба ставити на
 * ребро власника — інакше вона приїде на стільницю, що й бачила фокус-
 * група: «панель до стільниці, хоча вибирав торець іншої панелі».
 *
 * Компонент рекурсивний: усередині кожної прикріпленої деталі він шукає
 * ЇЇ доповнення. Глибина не обмежена — панель на панелі на панелі просто
 * працює, без окремої гілки на кожен рівень.
 */
function NestedAttachments({
  ownerSlot,
  ownerDraft,
  subDetails,
  activeDetailId,
  mode,
  editMode,
  onCornerClick,
  onCutoutDoubleClick,
  onEdgeClick,
  onEdgeSelect,
  occupiedSides,
  onPlaneClick,
  onJointClick,
  onJointSideClick,
  onDetailClick,
  onDetailContextMenu,
  theme,
  textureMode,
  customTextureMapFactory,
}: {
  ownerSlot: string;
  ownerDraft: DetailDraft;
  subDetails?: Record<string, DetailDraft>;
  activeDetailId?: string | null;
  mode: "view" | "edit" | "dimensions";
  editMode: "corners" | "planes" | "edges" | "joints" | "cutouts";
  onCornerClick?: (cornerId: string, x: number, y: number) => void;
  onCutoutDoubleClick?: (cutoutId: string) => void;
  onEdgeClick?: (edgeId: string, x: number, y: number) => void;
  /** Лівий клік по літері сторони в 3D (01.09): взірець / копіювання обробки — як у панелі кромок. */
  onEdgeSelect?: (edgeId: string) => void;
  /** Сторони активної деталі, закриті доповненням (domain/edgeOccupancy) — літера бліда, клік не діє. */
  occupiedSides?: Record<string, string>;
  onPlaneClick?: (detailId?: string) => void;
  onJointClick?: (jointTargetId: string, x: number, y: number) => void;
  onJointSideClick?: (joint: JointSideSelection, x: number, y: number) => void;
  onDetailClick?: (id: string) => void;
  onDetailContextMenu?: (id: string, x: number, y: number) => void;
  theme?: "light" | "dark";
  textureMode?: boolean;
  customTextureMapFactory?: (detailId: string) => THREE.Texture | null;
}) {
  const children = Object.entries(subDetails ?? {})
    .map(([slot, draft]) => ({ slot, draft, parsed: parseAdditionSlot(slot) }))
    .filter((entry) => entry.parsed.ownerSlot === ownerSlot
      && ['wall_panel', 'leg', 'skirting'].includes(entry.parsed.kind ?? ''));

  const { points, bounds } = useMemo(() => getDetailPointsAndBounds(ownerDraft as never), [ownerDraft]);
  const { curves, edgeMap } = useMemo(
    () => buildDetailShape(ownerDraft as never, points, bounds),
    [ownerDraft, points, bounds],
  );

  if (children.length === 0) return null;

  const s = 0.001;
  const thickness = (ownerDraft.thickness || 20) * s;

  return (
    <>
      {children.map(({ slot, draft, parsed }) => {
        // edgeMap — це Record<індекс кривої, ім'я ребра>, а не масив.
        const index = Object.entries(edgeMap ?? {})
          .find(([, name]) => name === parsed.sideId)?.[0];
        const curve = index !== undefined ? (curves ?? [])[Number(index)] : undefined;
        if (!curve || curve.type !== 'LineCurve') return null;

        // Та сама математика розміщення, що й у Підборі та в головному
        // циклі — не третя копія формул.
        const { midX, midY, angle, posX, insetZ } = attachmentPlacement(
          (curve as THREE.LineCurve).v1, (curve as THREE.LineCurve).v2, bounds,
          draft.width, draft.attachOffset ?? 0, draft.attachInset ?? 0,
        );
        const goesDown = parsed.kind === 'leg';
        const height = (draft.height || (parsed.kind === 'leg' ? 900 : parsed.kind === 'skirting' ? 50 : 600)) * s;
        const gapY = (draft.attachGap ?? 0) * s;

        return (
          <group key={slot} position={[midX, thickness / 2, midY]} rotation={[0, -angle, 0]}>
            <group
              position={goesDown
                ? [posX, -(height / 2 + gapY), thickness / 2 + insetZ]
                : [posX, height / 2 + gapY, -thickness / 2 + insetZ]}
              rotation={goesDown ? [-Math.PI / 2, 0, 0] : [Math.PI / 2, 0, 0]}
            >
              <Detail3DNode
                id={slot}
                detail={draft}
                isActive={activeDetailId === slot}
                mode={mode}
                editMode={editMode}
                onCornerClick={onCornerClick}
                onCutoutDoubleClick={onCutoutDoubleClick}
                onEdgeClick={onEdgeClick}
                onEdgeSelect={onEdgeSelect}
                occupiedSides={occupiedSides}
                onPlaneClick={onPlaneClick}
                onJointClick={onJointClick}
                onJointSideClick={onJointSideClick}
                onDetailClick={onDetailClick}
                onDetailContextMenu={onDetailContextMenu}
                theme={theme}
                textureMode={textureMode}
                customTextureMap={customTextureMapFactory ? customTextureMapFactory(slot) : undefined}
              />
              <NestedAttachments
                ownerSlot={slot}
                ownerDraft={draft}
                subDetails={subDetails}
                activeDetailId={activeDetailId}
                mode={mode}
                editMode={editMode}
                onCornerClick={onCornerClick}
                onCutoutDoubleClick={onCutoutDoubleClick}
                onEdgeClick={onEdgeClick}
                onEdgeSelect={onEdgeSelect}
                occupiedSides={occupiedSides}
                onPlaneClick={onPlaneClick}
                onJointClick={onJointClick}
                onJointSideClick={onJointSideClick}
                onDetailClick={onDetailClick}
                onDetailContextMenu={onDetailContextMenu}
                theme={theme}
                textureMode={textureMode}
                customTextureMapFactory={customTextureMapFactory}
              />
            </group>
          </group>
        );
      })}
    </>
  );
}

/**
 * СТИК 45° З ДОПОВНЕННЯМ (01.09, власник по керамограніту: «деталі
 * накладаються — нога, потовщення — і автоматично отримують зріз під 45»).
 * Назви — як у цеху (domain/ids EDGE_KIND_LABEL): код `fold` — це
 * ПОТОВЩЕННЯ (заусовка 45°, текстура йде через ребро) — завжди мітра, як і
 * нога (їх стик у кошторисі вже miter45); код `thickening` — це ПІДВОРОТ
 * (пряма підклейка знизу) — мітра лише на керамограніті (каталог цеху:
 * стик 45° опуску), на кварциті лишається прямим стиком без скосу.
 */
function miterJointFor(kind: string | undefined, material?: string | null): boolean {
  if (kind === 'fold' || kind === 'leg') return true;
  if (kind === 'thickening') return material === 'Керамограніт';
  return false;
}

const MITER_BIG = 10;

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
function miterCutters(args: { posX: number; spanLen: number; childPos: [number, number, number]; childRot: [number, number, number] }) {
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

function DetailAssemblyGroup({ detail, subDetails, activeDetailId, onCornerClick, onCutoutDoubleClick, onPlaneClick, onEdgeClick, onEdgeSelect, occupiedSides, onJointClick, onJointSideClick, onLegDoubleClick, onWallPanelDoubleClick, onDetailDoubleClick, onDetailClick, onDetailContextMenu, mode, editMode, theme, textureMode, customTextureMapFactory, position, rotation, material }: { detail: DetailDraft; subDetails?: Record<string, DetailDraft>;
  /** Матеріал виробу — керамограніт мітрує стики 45° автоматично (01.09). */
  material?: string | null;
  activeDetailId?: string | null;
  onCornerClick?: (id: string, x: number, y: number) => void;
  onCutoutDoubleClick?: (cutoutId: string) => void;
  /** Передає id деталі, по площині якої клікнули — щоб виріз ліг саме на неї. */
  onPlaneClick?: (detailId?: string) => void;
  onEdgeClick?: (edgeId: string, x: number, y: number) => void;
  /** Лівий клік по літері сторони в 3D (01.09): взірець / копіювання обробки — як у панелі кромок. */
  onEdgeSelect?: (edgeId: string) => void;
  /** Сторони активної деталі, закриті доповненням (domain/edgeOccupancy) — літера бліда, клік не діє. */
  occupiedSides?: Record<string, string>;
  onJointClick?: (id: string, x: number, y: number) => void;
  onJointSideClick?: (joint: JointSideSelection, x: number, y: number) => void;
  onLegDoubleClick?: (slot: string) => void;
  onWallPanelDoubleClick?: (slot: string) => void;
  onDetailDoubleClick?: (id: string) => void;
  onDetailClick?: (id: string) => void;
  onDetailContextMenu?: (id: string, x: number, y: number) => void;
  mode?: "view" | "edit" | "dimensions";
  editMode?: "corners" | "planes" | "edges" | "joints";
  theme?: "light" | "dark";
  textureMode?: boolean;
  customTextureMapFactory?: (detailId: string) => THREE.Texture | null;
  position?: [number, number, number];
  /** Поворот навколо вертикалі (радіани) — місце виробу в приміщенні. */
  rotation?: [number, number, number];
}) {
  const mainPoints = useMemo(() => {
    // Крок 4.4: контур може бути виведений із ніші (`uCutout`), а не
    // заданий точками. Спільний хелпер — інакше ніша була б у розкрої,
    // але не в 3D: рендер бачив чернетку й малював прямокутник.
    let pts = contourPointsFor(detail as never) || detail.geometry?.customPoints || [];
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

  /** Дуги скруглень — для гнутих доповнень (FG-27). */
  const mainArcSegments = useMemo(() => {
    return mainShape.curves
      .map((curve, index) => ({ curve, id: mainEdgeMap[index] }))
      .filter((item) => item.curve.type === "EllipseCurve" && item.id && /_radius$/.test(item.id)) as Array<{
      curve: THREE.EllipseCurve;
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

  /** Доповнення верхнього рівня на ребрі pId — спільний відбір для мітри і для рендера. */
  const attachmentsOn = (pId: string) => Object.entries(subDetails ?? {})
    .map(([slot, draft]) => ({ slot, draft, parsed: parseAdditionSlot(slot) }))
    .filter((entry) => {
      if (entry.parsed.sideId !== pId) return false;
      // Крок 4.2: слот з адресою власника (`wall_panel_B_leg_C`) —
      // не наш: його малює NestedAttachments всередині власника.
      if (entry.parsed.ownerSlot) return false;
      const kind = entry.parsed.kind;
      if (kind === 'wall_panel' || kind === 'leg' || kind === 'skirting') return true;
      if (kind !== 'fold' && kind !== 'thickening') return false;
      // Підворот/потовщення з модалки (слот верхнього рівня). Базовий
      // слот при живій легасі-галочці — це драфт легасі-доповнення:
      // його малює блок LOCAL ATTACHMENTS, тут був би дубль.
      if (!entry.slot.startsWith(`${kind}_`)) return false;
      const legacyFeature = kind === 'fold' ? detail.fold : detail.thickening;
      return !(entry.parsed.index === 1 && legacyFeature?.enabled && legacyFeature.sides.includes(pId));
    });

  /*
   * План стиків 45° (01.09). Для кожного доповнення, що звисає з ребра
   * (нога, потовщення `fold`, підворот `thickening`): де воно стоїть
   * (врівень під ребром) і його різаки. Два види різаків:
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
   *    ГІПОТЕЗА: кут підворота на кварциті — теж на ус, а не встик.
   */
  const miterPlan = useMemo(() => {
    type Placed = {
      childPos: [number, number, number]; childRot: [number, number, number];
      cutters: THREE.BufferGeometry[];
      /** Межі смуги в рамці ребра: x уздовж ребра від середини, y ≤ 0 під верхньою площиною. */
      xMin: number; xMax: number; yMin: number; yMax: number;
      /** Рамка ребра → рамка збірки. */
      edgeMatrix: THREE.Matrix4;
    };
    const mainCutters: THREE.BufferGeometry[] = [];
    const bySlot = new Map<string, Placed>();
    const byEdge = new Map<string, Placed[]>();
    const w = mainBounds.maxX - mainBounds.minX || 1;
    const h = mainBounds.maxY - mainBounds.minY || 1;
    const s = 0.001;
    const thickness = (detail.thickness || 20) * s;
    const sceneXZ = (p: THREE.Vector2) => ({ x: (p.x - 0.5) * w * s, z: (p.y - 0.5) * h * s });
    for (const item of mainLineSegments) {
      const pId = item.id;
      const here = attachmentsOn(pId);
      if (!here.length) continue;
      const p1 = sceneXZ(item.curve.v1); const p2 = sceneXZ(item.curve.v2);
      const midX = (p1.x + p2.x) / 2; const midY = (p1.z + p2.z) / 2;
      const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x);
      const edgeLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const edgeMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(midX, thickness / 2, midY),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -angle, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      for (const { slot, draft, parsed } of here) {
        const goesDown = parsed.kind === 'leg' || parsed.kind === 'fold' || parsed.kind === 'thickening';
        if (!goesDown) continue;
        const defaultHeight = parsed.kind === 'leg' ? 900 : parsed.kind === 'fold' ? 100 : 40;
        const height = (draft.height || defaultHeight) * s;
        const gapY = (draft.attachGap ?? 0) * s;
        const { posX, insetZ } = attachmentPlacement(item.curve.v1, item.curve.v2, mainBounds, draft.width, draft.attachOffset ?? 0, draft.attachInset ?? 0);
        const childThickness = (draft.thickness || detail.thickness || 20) * s;
        // Врівень із торцем плити: зовнішня площина доповнення на лінії ребра (+z — усередину)
        const childPos: [number, number, number] = [posX, -(height / 2 + gapY), childThickness / 2 + insetZ];
        const childRot: [number, number, number] = [-Math.PI / 2, 0, 0];
        const spanLen = Math.min(edgeLen, ((draft.width || 0) * s) || edgeLen);
        const placed: Placed = {
          childPos, childRot, cutters: [], edgeMatrix,
          xMin: posX - spanLen / 2, xMax: posX + spanLen / 2, yMin: -(height + gapY), yMax: -gapY,
        };
        if (miterJointFor(parsed.kind, material)) {
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
    if (byEdge.size >= 2) {
      const curves = mainShape.curves;
      // Орієнтація обходу контуру (за самими кривими, бо форма могла бути дзеркальна)
      let area2 = 0;
      for (let i = 0; i < curves.length; i += 1) {
        const a = sceneXZ(curves[i].getPoint(0) as THREE.Vector2);
        const b = sceneXZ(curves[(i + 1) % curves.length].getPoint(0) as THREE.Vector2);
        area2 += a.x * b.z - b.x * a.z;
      }
      const orientation = Math.sign(area2) || 1;
      const EPS_Y = 0.0005; // 0,5 мм понад висоту сусіда — щоб грані різака не збігались із гранями смуги
      const childMatrixOf = (pl: Placed) => new THREE.Matrix4().compose(
        new THREE.Vector3(...pl.childPos),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...pl.childRot)),
        new THREE.Vector3(1, 1, 1),
      );
      const cornerCutter = (V: { x: number; z: number }, n: { x: number; z: number }, sign: 1 | -1, neighbour: Placed, target: Placed) => {
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
        const id1 = mainEdgeMap[i]; const id2 = mainEdgeMap[(i + 1) % curves.length];
        if (!id1 || !id2 || id1 === id2) continue;
        const on1 = byEdge.get(id1); const on2 = byEdge.get(id2);
        if (!on1?.length || !on2?.length) continue;
        const l1 = c1 as THREE.LineCurve; const l2 = c2 as THREE.LineCurve;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainLineSegments, mainShape, mainEdgeMap, subDetails, mainBounds, detail.thickness, detail.fold, detail.thickening, material]);

  const mainNode = isSink ? (
    <SinkAssemblyPreview detail={detail} textureMode={textureMode} />
  ) : (
    <Detail3DNode
      id="main"
      detail={detail}
      extraCutters={miterPlan.mainCutters.length ? miterPlan.mainCutters : undefined}
      isActive={activeDetailId === "main"}
      mode={mode}
      editMode={editMode}
      onCornerClick={onCornerClick}
      onCutoutDoubleClick={onCutoutDoubleClick}
      onEdgeClick={onEdgeClick}
      onEdgeSelect={onEdgeSelect}
      occupiedSides={occupiedSides}
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
    <group position={[basePos[0], basePos[1] + elevationY, basePos[2]]} rotation={rotation ?? [0, 0, 0]}>
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

      {/* ATTACHMENTS (панелі, ноги, бортики) */}
      {mainLineSegments.map((item) => {
        const pId = item.id;
        // Раніше тут бралося рівно по одному доповненню на ребро за жорстким
        // ключем `wall_panel_<ребро>`. Тепер збираємо ВСІ доповнення цього
        // ребра (слот може мати суфікс `#2`) — інакше ніша в подіумі
        // неможлива: її стінки живуть на тих самих ребрах, що й обшивка.
        const here = attachmentsOn(pId);
        if (here.length === 0) return null;

        const w = mainBounds.maxX - mainBounds.minX || 1;
        const h = mainBounds.maxY - mainBounds.minY || 1;
        const s = 0.001;

        const nx1 = (item.curve.v1.x - 0.5) * w * s;
        const ny1 = (item.curve.v1.y - 0.5) * h * s;
        const nx2 = (item.curve.v2.x - 0.5) * w * s;
        const ny2 = (item.curve.v2.y - 0.5) * h * s;

        const midX = (nx1 + nx2) / 2;
        const midY = (ny1 + ny2) / 2;
        const angle = Math.atan2(ny2 - ny1, nx2 - nx1);
        const thickness = (detail.thickness || 20) * s;
        const zSurface = thickness / 2;

        return (
          <group
            key={`attachments-${pId}`}
            position={[midX, zSurface, midY]}
            rotation={[0, -angle, 0]}
          >
            {here.map(({ slot, draft, parsed }) => {
              // Вниз від ребра йдуть нога, потовщення (підклейка під плитою)
              // і підворот (фартух-водоспад); бортик і панель ростуть угору.
              const goesDown = parsed.kind === 'leg' || parsed.kind === 'fold' || parsed.kind === 'thickening';
              // Стик 45° (01.09): план уже порахований у miterPlan — доповнення,
              // що звисає, стає врівень під ребро й отримує свої різаки
              // (зі стільницею і/або з сусідом на куті).
              const miter = miterPlan.bySlot.get(slot);
              const defaultHeight = parsed.kind === 'leg' ? 900
                : parsed.kind === 'skirting' ? 50
                  : parsed.kind === 'fold' ? 100
                    : parsed.kind === 'thickening' ? 40 : 600;
              const height = (draft.height || defaultHeight) * s;
              // Відступ від ребра в напрямку росту: стінки ніші стоять на
              // підлозі і не торкаються плити подіуму.
              const gapY = (draft.attachGap ?? 0) * s;
              // Позиція вздовж ребра і вглиб плити — спільна математика
              // з Підбором (attachmentPlacement), не друга копія формул.
              const { posX, insetZ } = attachmentPlacement(
                item.curve.v1, item.curve.v2, mainBounds,
                draft.width, draft.attachOffset ?? 0, draft.attachInset ?? 0,
              );
              const childPos: [number, number, number] = miter
                ? miter.childPos
                : goesDown
                  ? [posX, -(height / 2 + gapY), thickness / 2 + insetZ]
                  : [posX, height / 2 + gapY, -thickness / 2 + insetZ];
              const childRot: [number, number, number] = miter ? miter.childRot : goesDown ? [-Math.PI / 2, 0, 0] : [Math.PI / 2, 0, 0];
              return (
                <group
                  key={slot}
                  position={childPos}
                  rotation={childRot}
                >
                  <Detail3DNode
                    id={slot}
                    detail={draft}
                    extraCutters={miter?.cutters.length ? miter.cutters : undefined}
                    isActive={activeDetailId === slot}
                    mode={mode}
                    editMode={editMode}
                    onCornerClick={onCornerClick}
                    onCutoutDoubleClick={onCutoutDoubleClick}
                    onEdgeClick={onEdgeClick}
                    onEdgeSelect={onEdgeSelect}
                    occupiedSides={occupiedSides}
                    onPlaneClick={onPlaneClick}
                    onJointClick={onJointClick}
                    onJointSideClick={onJointSideClick}
                    onDetailClick={onDetailClick}
                    onDoubleClick={() => {
                      // Крок 4.3: віддаємо СЛОТ, а не сторону. На одному
                      // ребрі панелей може бути кілька (`#2`), і по самій
                      // стороні неможливо сказати, яку саме відкривати.
                      if (parsed.kind === 'leg') onLegDoubleClick?.(slot);
                      else if (parsed.kind === 'wall_panel') onWallPanelDoubleClick?.(slot);
                    }}
                    onDetailContextMenu={onDetailContextMenu}
                    theme={theme}
                    textureMode={textureMode}
                    customTextureMap={customTextureMapFactory ? customTextureMapFactory(slot) : undefined}
                  />
                  {/* Крок 4.2: панель на торці цієї панелі, нога під нею тощо. */}
                  <NestedAttachments
                    ownerSlot={slot}
                    ownerDraft={draft}
                    subDetails={subDetails}
                    activeDetailId={activeDetailId}
                    mode={mode ?? 'view'}
                    editMode={editMode ?? 'corners'}
                    onCornerClick={onCornerClick}
                    onCutoutDoubleClick={onCutoutDoubleClick}
                    onEdgeClick={onEdgeClick}
                    onEdgeSelect={onEdgeSelect}
                    occupiedSides={occupiedSides}
                    onPlaneClick={onPlaneClick}
                    onJointClick={onJointClick}
                    onJointSideClick={onJointSideClick}
                    onDetailClick={onDetailClick}
                    onDetailContextMenu={onDetailContextMenu}
                    theme={theme}
                    textureMode={textureMode}
                    customTextureMapFactory={customTextureMapFactory}
                  />
                </group>
              );
            })}
          </group>
        );
      })}

      {/* ГНУТІ ДОПОВНЕННЯ ПО ДУГАХ (FG-27). Два джерела, як і в розкрої:
          явні слоти на стороні-дузі (wall_panel_B_radius…) і автоматика —
          потовщення/підворот, який покриває обидві сторони кута. Правило
          «де є дуга» — спільне з рушієм (domain/radiusElement). */}
      {mainArcSegments.map((arc) => {
        const cornerId = arc.id.replace(/_radius$/, '');

        /**
         * Увігнутий кут чи опуклий — питаємо в самої геометрії: точка трохи
         * ЗЗОВНІ дуги (далі від центру) в матеріалі ⇒ кут увігнутий.
         *
         * КРИТИЧНО: перевіряти треба по ЩІЛЬНОМУ контуру з дугами, а не по
         * списку вершин. У вершинах кут лишається гострим, і на опуклому
         * куті проба падала в зрізаний ріг — «матеріал» — тож бандаж
         * вважав кут увігнутим і вилазив назовні стільниці.
         */
        const isReflex = (() => {
          const wMm = mainBounds.maxX - mainBounds.minX || 1;
          const hMm = mainBounds.maxY - mainBounds.minY || 1;
          const toMm = (p: { x: number; y: number }) => ({
            x: mainBounds.minX + p.x * wMm,
            y: mainBounds.minY + p.y * hMm,
          });
          const densePoly = sampleContourPoints(mainShape.curves as never).map(toMm);
          if (densePoly.length < 3) return false;

          const mid = toMm(arc.curve.getPoint(0.5));
          const center = toMm({ x: arc.curve.aX, y: arc.curve.aY });
          const dx = mid.x - center.x;
          const dy = mid.y - center.y;
          const len = Math.hypot(dx, dy) || 1;
          // Зсув у мм і пропорційний радіусу: більший за крок дискретизації
          // дуги, менший за половину радіуса.
          const step = Math.max(4, len * 0.08);
          const probe = { x: mid.x + (dx / len) * step, y: mid.y + (dy / len) * step };
          return pointInPolygonStrict(probe, densePoly);
        })();

        const explicit = Object.entries(subDetails ?? {})
          .map(([slot, draft]) => ({ slot, draft, parsed: parseAdditionSlot(slot) }))
          .filter((entry) => entry.parsed.sideId === arc.id
            && ['wall_panel', 'leg', 'skirting', 'fold', 'thickening'].includes(entry.parsed.kind ?? ''));

        const explicitKinds = new Set(explicit.map((entry) => entry.parsed.kind));
        /*
         * РЕМОНТ 19.08: покриття сторін — з ОБОХ джерел, як у розкрої.
         * Модалка (4.1) пише потовщення слотами, а автоматика дуг бачила
         * лише легасі-галочки — тож смуга стояла на обох сторонах кута,
         * а сама дуга лишалась голою.
         */
        const mergedArcFeature = (kindKey: 'fold' | 'thickening') => {
          const legacy = detail[kindKey];
          const slotSides: string[] = [];
          const slotSizes: Record<string, number> = {};
          Object.entries(subDetails ?? {}).forEach(([slot, slotDraft]) => {
            const parsedSlot = parseAdditionSlot(slot);
            if (parsedSlot.kind !== kindKey || parsedSlot.ownerSlot) return;
            if (/_radius$/.test(parsedSlot.sideId ?? '')) return;
            slotSides.push(parsedSlot.sideId);
            if (slotDraft?.height) slotSizes[parsedSlot.sideId] = slotDraft.height;
          });
          const sides = [...new Set([...(legacy?.sides ?? []), ...slotSides])];
          if (!sides.length) return undefined;
          const sideSizes = { ...(legacy?.sideSizes ?? {}), ...slotSizes };
          return {
            enabled: true,
            sides,
            size: legacy?.size ?? Object.values(sideSizes)[0] ?? (kindKey === 'fold' ? 100 : 40),
            sideSizes,
          } as typeof detail.fold;
        };
        const auto = (['fold', 'thickening'] as const)
          .filter((kindKey) => !explicitKinds.has(kindKey))
          .flatMap((kindKey) => radiusElementSpecs(mergedArcFeature(kindKey), detail.corners, detail.kind)
            .filter((spec) => spec.cornerId === cornerId)
            .map((spec) => ({ kindKey, spec })));

        if (!explicit.length && !auto.length) return null;

        return (
          <group key={`arc-band-${arc.id}`}>
            {explicit.map(({ slot, draft, parsed }) => (
              <ArcBand
                key={slot}
                curve={arc.curve}
                bounds={mainBounds}
                slabThicknessMm={detail.thickness || 20}
                bandThicknessMm={draft.thickness || detail.thickness || 20}
                heightMm={draft.height || (parsed.kind === 'leg' ? 900 : parsed.kind === 'skirting' ? 50 : parsed.kind === 'fold' ? 100 : parsed.kind === 'thickening' ? 40 : 600)}
                goesDown={parsed.kind === 'leg' || parsed.kind === 'fold' || parsed.kind === 'thickening'}
                gapMm={draft.attachGap ?? 0}
                isActive={activeDetailId === slot}
                theme={theme ?? 'light'}
                outward={isReflex}
                onPick={() => onDetailClick?.(slot)}
                onMenu={(x, y) => onDetailContextMenu?.(slot, x, y)}
              />
            ))}
            {auto.map(({ kindKey, spec }) => (
              <ArcBand
                key={`auto-${kindKey}`}
                curve={arc.curve}
                bounds={mainBounds}
                slabThicknessMm={detail.thickness || 20}
                bandThicknessMm={detail.thickness || 20}
                heightMm={spec.bandSizeMm}
                goesDown
                gapMm={0}
                isActive={false}
                theme={theme ?? 'light'}
                outward={isReflex}
              />
            ))}
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
  const edgesVisible = useContext(EdgesVisibility);
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
          {edgesVisible && (
            <Edges geometry={geom} color={highlight ? '#38bdf8' : '#5b6770'} threshold={20} />
          )}
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
  onCutoutDoubleClick,
  onPlaneClick,
  onEdgeClick,
  onEdgeSelect,
  occupiedSides,
  onJointClick,
  onJointSideClick,
  onLegDoubleClick,
  onWallPanelDoubleClick,
  onDetailDoubleClick,
  onDetailClick,
  onDetailContextMenu,
  onSelectionClear,
  forceMode,
  scenePlacement,
  onPlaceInRoom,
  material,
}: {
  detail?: DetailDraft;
  subDetails?: Record<string, DetailDraft>;
  /**
   * Де виріб стоїть у приміщенні (мм по підлозі + поворот) — з
   * `product.scenePlacement`. Береться до уваги лише з увімкненою базою
   * (01.09, власник: «хочу виріб в приміщенні малювати»); без неї виріб,
   * як і досі, стоїть у нулі сцени.
   */
  scenePlacement?: { x: number; z: number; rotationYDeg: number } | null;
  /** Матеріал виробу — керамограніт мітрує стики з ногою/потовщенням автоматично. */
  material?: string | null;
  /**
   * «Поставити на площину» (01.09): виріб прив'язано до обраної грані бази —
   * нове місце по підлозі й висота (центр плити, мм). Редактор кладе це в
   * сесію (scenePlacement + mainDetail.elevation).
   */
  onPlaceInRoom?: (placement: ScenePlacementMm, elevationMm: number) => void;
  /** null — жодна деталь не обрана (клік у пусте поле); undefined — за замовчуванням main. */
  activeDetailId?: string | null;
  onCornerClick?: (id: string, x: number, y: number) => void;
  onCutoutDoubleClick?: (cutoutId: string) => void;
  /** Передає id деталі, по площині якої клікнули — щоб виріз ліг саме на неї. */
  onPlaneClick?: (detailId?: string) => void;
  onEdgeClick?: (edgeId: string, x: number, y: number) => void;
  /** Лівий клік по літері сторони в 3D (01.09): взірець / копіювання обробки — як у панелі кромок. */
  onEdgeSelect?: (edgeId: string) => void;
  /** Сторони активної деталі, закриті доповненням (domain/edgeOccupancy) — літера бліда, клік не діє. */
  occupiedSides?: Record<string, string>;
  onJointClick?: (id: string, x: number, y: number) => void;
  onJointSideClick?: (joint: JointSideSelection, x: number, y: number) => void;
  onLegDoubleClick?: (slot: string) => void;
  onWallPanelDoubleClick?: (slot: string) => void;
  onDetailDoubleClick?: (id: string) => void;
  onDetailClick?: (id: string) => void;
  onDetailContextMenu?: (id: string, x: number, y: number) => void;
  /** Клік у пусте поле сцени — скинути вибір (01.09). */
  onSelectionClear?: () => void;
  forceMode?: "view" | "edit" | "dimensions";
}) {
  const [mode, setMode] = useState<"view" | "edit" | "dimensions">(forceMode || "view");
  /*
   * ПРИМІЩЕННЯ В РЕДАКТОРІ (01.09). База з вкладки «Приміщення» малюється
   * ляльковим будинком навколо виробу, а виріб стає на своє місце в кімнаті
   * (scenePlacement; новий виріб без місця — у центр підлоги). Кнопка та
   * сама, що в 3D Підборі; стартовий стан — як там (visibleInAssembly).
   */
  const room = useProjectStore((state) => state.project.room);
  const hasRoom = Boolean(room?.solids.length);
  const [roomOn, setRoomOn] = useState<boolean>(Boolean(room?.visibleInAssembly && room?.solids.length));
  const roomPlacement = useMemo(() => {
    if (!roomOn || !hasRoom || !room) return null;
    if (scenePlacement) return scenePlacement;
    return defaultRoomPlacement(room);
  }, [roomOn, hasRoom, room, scenePlacement]);
  /*
   * Обрана грань бази (клік по тілу приміщення) і кнопка/Enter «Поставити
   * на площину»: виріб лягає на верх блока, підвішується під навісний,
   * притуляється до стіни з зазором 2 мм (domain/roomPlacement.ts).
   */
  const [targetFace, setTargetFace] = useState<RoomFaceHit | null>(null);
  const [roomHoverId, setRoomHoverId] = useState<string | null>(null);
  const targetLabel = targetFace && room ? roomFaceLabel(room, targetFace) : null;
  const placeOnFace = () => {
    if (!targetFace || !room || !detail || !onPlaceInRoom) return;
    const fp = detailFootprintMm(detail);
    const result = placeOnRoomFace(room, targetFace, fp, { placement: scenePlacement ?? roomPlacement, elevationMm: detail.elevation });
    if (result) { onPlaceInRoom(result.placement, result.elevationMm); setTargetFace(null); }
  };
  useEffect(() => {
    if (!roomOn || !targetFace) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      placeOnFace();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomOn, targetFace, room, detail, scenePlacement, roomPlacement, onPlaceInRoom]);
  /* Режим «лише обрана деталь» (01.09): решта не малюється взагалі. */
  const [isolate, setIsolate] = useState(false);
  const selectionView = useMemo(
    () => ({ hasSelection: activeDetailId != null, isolate }),
    [activeDetailId, isolate],
  );
  /* Скидання вибору: лише «чистий» клік (без протягування камери) і лише лівою. */
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);
  const openHelp = useUIStore((state) => state.openHelp);
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
    // Крок 4.4: контур може бути виведений із ніші (`uCutout`), а не
    // заданий точками. Спільний хелпер — інакше ніша була б у розкрої,
    // але не в 3D: рендер бачив чернетку й малював прямокутник.
    let pts = contourPointsFor(detail as never) || detail.geometry?.customPoints || [];
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
      {/* Тулбар стоїть у верхньому рядку, праворуч від вкладок «2D Креслення /
          3D Модель». Спроба опустити його на другий рядок (top-16) була
          помилковою — FG-25 стосувався прокрутки правої панелі властивостей,
          а не цієї панелі. Повернуто на місце.

          left-[264px] — це резерв під вкладки: контейнер не має права дотягтись
          до них і перехопити клік (у вікні 1600×900 з відкритим режимом
          «Редагування» рівно це і ставалось). Коли місця мало, панель
          переноситься на другий рядок, а не лягає зверху.

          pointer-events-none на контейнері + auto на групах: сам контейнер тепер
          розтягнутий на всю ширину, і без цього він з'їдав би кліки по 3D-сцені
          у порожньому просторі між вкладками і кнопками. */}
      {!forceMode && (
        <div className="absolute top-4 left-[264px] right-4 z-10 flex flex-row flex-wrap justify-end gap-2 items-start pointer-events-none">
        <div
          className={`pointer-events-auto flex rounded-md shadow-sm border p-1 gap-1 ${theme === "dark" ? "bg-slate-800 border-slate-700" : "bg-white border-[#c6d3dd]"}`}
        >
          <button
            onClick={() => setMode("view")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-colors ${mode === "view" ? "bg-[#0084ff] text-white" : theme === "dark" ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
            title="Перегляд"
          >
            <Eye className="w-4 h-4" /> Перегляд
          </button>
          <button
            onClick={() => {
              setMode("edit");
              setEditMode("corners");
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-colors ${mode === "edit" ? "bg-[#0084ff] text-white" : theme === "dark" ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
            title="Редагування"
          >
            <Edit2 className="w-4 h-4" /> Редагування
          </button>
          <button
            onClick={() => setMode("dimensions")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm font-medium transition-colors ${mode === "dimensions" ? "bg-[#0084ff] text-white" : theme === "dark" ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}
            title="Розміри"
          >
            <Ruler className="w-4 h-4" /> Розміри
          </button>
          <button
            onClick={() => setRoomOn((v) => !v)}
            disabled={!hasRoom}
            className={`flex items-center justify-center p-1.5 rounded-sm transition-colors disabled:opacity-40 ${roomOn && hasRoom ? "bg-[#0084ff] text-white" : theme === "light" ? "text-slate-500 hover:text-slate-800 hover:bg-slate-50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"}`}
            title={hasRoom ? (roomOn ? "Сховати приміщення" : "Показати приміщення (базу) навколо виробу") : "Спершу намалюй приміщення у вкладці «Приміщення»"}
          >
            <Home className="w-4 h-4" />
          </button>
          {roomOn && hasRoom && onPlaceInRoom && (
            <button
              onClick={placeOnFace}
              disabled={!targetFace}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-sm text-xs font-medium transition-colors disabled:opacity-40 ${targetFace ? "bg-[#0084ff] text-white" : theme === "light" ? "text-slate-500 hover:text-slate-800 hover:bg-slate-50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"}`}
              title={targetFace ? `Поставити виріб на площину: ${targetLabel} (Enter)` : "Клікни по площині бази (верх блока, стіна) — потім ця кнопка або Enter"}
            >
              <ArrowDownToLine className="w-4 h-4" />
              {targetFace ? 'Поставити' : 'Площина?'}
            </button>
          )}
          <button
            onClick={() => setTextureMode(!textureMode)}
            className={`flex items-center justify-center p-1.5 rounded-sm transition-colors ${textureMode ? "bg-[#0084ff] text-white" : theme === "light" ? "text-slate-500 hover:text-slate-800 hover:bg-slate-50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"}`}
            title="Текстурний режим"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsolate((v) => !v)}
            className={`flex items-center justify-center p-1.5 rounded-sm transition-colors ${isolate ? "bg-[#0084ff] text-white" : theme === "light" ? "text-slate-500 hover:text-slate-800 hover:bg-slate-50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"}`}
            title={isolate ? "Показувати всі деталі" : "Лише обрана деталь (решту сховати)"}
          >
            <Focus className="w-4 h-4" />
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
          {/* Довідка по редактору. Стоїть у ПОСТІЙНІЙ панелі, а не поруч із
              «Стиками»: та група видима лише в режимі «Редагування», а
              питання «як тут працювати» виникає найчастіше до нього. */}
          <button
            onClick={() => openHelp('product_editor')}
            className={`flex items-center justify-center p-1.5 rounded-sm transition-colors ${theme === "light" ? "text-slate-500 hover:text-slate-800 hover:bg-slate-50" : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"}`}
            title="Інструкція: як редагується деталь"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        {mode === "edit" && (
          <div
            className={`pointer-events-auto flex rounded-md shadow-sm border p-1 gap-1 ${theme === "dark" ? "bg-slate-800 border-slate-700" : "bg-white border-[#c6d3dd]"}`}
          >
            <button
              onClick={() => setEditMode("corners")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${editMode === "corners" ? "bg-[#0084ff] text-white" : theme === "dark" ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              Кути
            </button>
            <button
              onClick={() => setEditMode("planes")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${editMode === "planes" ? "bg-[#0084ff] text-white" : theme === "dark" ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              Площини
            </button>
            <button
              onClick={() => setEditMode("edges")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${editMode === "edges" ? "bg-[#0084ff] text-white" : theme === "dark" ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              Сторони
            </button>
            <button
              onClick={() => setEditMode("joints")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${editMode === "joints" ? "bg-[#0084ff] text-white" : theme === "dark" ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              Стики
            </button>
          </div>
        )}
      </div>
      )}

      {roomOn && hasRoom && onPlaceInRoom && mode !== "dimensions" && (
        <div className={`absolute left-3 bottom-3 z-10 text-[11px] px-2.5 py-1.5 rounded-md shadow-sm border pointer-events-none ${theme === "dark" ? "bg-slate-800/90 border-slate-700 text-slate-200" : "bg-white/90 border-slate-200 text-slate-600"}`}>
          {targetFace
            ? <>Площина: <b>{targetLabel}</b> · Enter або «Поставити» — виріб стане на неї</>
            : <>Клікни по площині бази (верх блока, стіна, підлога) — потім Enter або «Поставити»</>}
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
        <Canvas
          camera={{ position: [2, 2, 2], fov: 45 }}
          onCreated={(state) => {
            attachContextLossRecovery(state.gl.domElement);
            // Автотести/скріншоти (Playwright): доступ до камери й контролера
            // прев'ю, щоб навести на кут без імітації миші. У продукті не заважає.
            (window as unknown as { __vs3dPreview?: unknown }).__vs3dPreview = state;
          }}
          onPointerDown={(e) => { pointerDownAt.current = { x: e.clientX, y: e.clientY }; }}
          onPointerMissed={(e) => {
            // Клік повз усі деталі → вибір скидається. Протягування камери
            // (OrbitControls) теж закінчується click-ом — відсіюємо за зсувом.
            if (e.type !== 'click' || e.button !== 0) return;
            const down = pointerDownAt.current;
            if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
            onSelectionClear?.();
          }}
        >
          <SelectionView.Provider value={selectionView}>
          <color
            attach="background"
            args={[mode === "dimensions" ? "#ffffff" : theme === "dark" ? "#0f172a" : "#f0f4f8"]}
          />
          <ambientLight intensity={mode === "dimensions" ? 1.0 : 0.6} />
          <directionalLight position={[10, 10, 5]} intensity={mode === "dimensions" ? 0.5 : 1.2} castShadow={mode !== "dimensions"} />
          <SafeEnvironment />

          {mode !== "dimensions" && (
            <>
              <Grid
                position={[0, 0, 0]}
                raycast={() => null}
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

          {roomPlacement && room && mode !== "dimensions" && (
            <RoomSolids
              room={room}
              ghost
              pickable={Boolean(onPlaceInRoom)}
              selectedId={targetFace?.solidId ?? null}
              hoverId={roomHoverId}
              onSolidPointerOver={(id) => setRoomHoverId(id)}
              onSolidPointerOut={() => setRoomHoverId(null)}
              onSolidPointerDown={(id, e) => {
                if (e.nativeEvent.button !== 0 || !e.face) return;
                e.stopPropagation();
                const n = e.face.normal.clone().round(); // геометрія бази без трансформацій → світ
                setTargetFace({
                  solidId: id,
                  normal: { x: n.x, y: n.y, z: n.z },
                  pointMm: { x: e.point.x * 1000, y: e.point.y * 1000, z: e.point.z * 1000 },
                });
              }}
            />
          )}
          {roomPlacement && (
            <CameraFocus target={[roomPlacement.x * 0.001, (detail?.elevation ?? 900) * 0.001, roomPlacement.z * 0.001]} />
          )}
          {detail && (
            <DetailAssemblyGroup
              detail={detail}
              subDetails={subDetails}
              activeDetailId={activeDetailId}
              material={material}
              position={roomPlacement ? [roomPlacement.x * 0.001, 0, roomPlacement.z * 0.001] : undefined}
              rotation={roomPlacement ? [0, THREE.MathUtils.degToRad(roomPlacement.rotationYDeg), 0] : undefined}
              mode={mode}
              editMode={editMode}
              theme={theme}
              textureMode={textureMode}
              onCornerClick={onCornerClick}
              onCutoutDoubleClick={onCutoutDoubleClick}
              onPlaneClick={onPlaneClick}
              onEdgeClick={onEdgeClick}
              onEdgeSelect={onEdgeSelect}
              occupiedSides={occupiedSides}
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
          </SelectionView.Provider>
        </Canvas>
      </Suspense>
    </div>
  );
}

/**
 * Місце для нового виробу без scenePlacement, коли увімкнена база: центр
 * підлоги (тіло з роллю floor або перше тіло-план), а не нуль сцени — у нулі
 * зазвичай кут кімнати, і виріб наполовину стояв би в стіні.
 */
/** Габарит виробу по плану (мм) для прив'язки до бази: контур або ширина/висота чернетки. */
function detailFootprintMm(detail: DetailDraft): { widthMm: number; depthMm: number; thicknessMm: number } {
  const pts = contourPointsFor(detail as never) as Array<{ x: number; y: number }> | undefined;
  let widthMm = detail.width || detail.outerWidth || 1000;
  let depthMm = detail.height || detail.outerHeight || 600;
  if (pts && pts.length >= 3) {
    const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
    widthMm = Math.max(...xs) - Math.min(...xs) || widthMm;
    depthMm = Math.max(...ys) - Math.min(...ys) || depthMm;
  }
  return { widthMm, depthMm, thicknessMm: detail.thickness || 20 };
}

function defaultRoomPlacement(room: RoomModel): { x: number; z: number; rotationYDeg: number } {
  const floor = room.solids.find((s) => s.role === 'floor' && s.kind === 'add')
    ?? room.solids.find((s) => s.kind === 'add' && (s.axis ?? 'up') === 'up');
  if (!floor) return { x: 0, z: 0, rotationYDeg: 0 };
  const { min, max } = solidAabb(floor);
  return { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2, rotationYDeg: 0 };
}

/**
 * Камера дивиться на виріб там, де він стоїть у кімнаті: при зміні цілі
 * (увімкнули базу, інше місце) контролер і камера переїжджають разом, з
 * тим самим кутом огляду, що й стартовий [2,2,2] від нуля.
 */
function CameraFocus({ target }: { target: [number, number, number] }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { target?: THREE.Vector3; update?: () => void } | null;
  const key = target.join('|');
  useEffect(() => {
    // Згори і збоку, вище за стіни (2.7 м): знизу камера впирається у
    // ближню стіну — ляльковий будинок працює лише з висоти.
    camera.position.set(target[0] + 2.6, target[1] + 3.0, target[2] + 2.6);
    if (controls?.target) {
      controls.target.set(target[0], target[1], target[2]);
      controls.update?.();
    } else {
      camera.lookAt(target[0], target[1], target[2]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controls]);
  return null;
}

export function useDetailGeometry(detail: any, points: any[], bounds: any) {
  return useMemo(() => {
    return buildDetailGeometry(detail, points, bounds);
  }, [detail, points, bounds]);
}
