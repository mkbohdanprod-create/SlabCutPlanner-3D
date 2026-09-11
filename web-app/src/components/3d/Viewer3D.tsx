import React, { Suspense, useMemo, useState, useEffect,  useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls,   Center,  TransformControls , useTexture, Edges, Line,  Html, Grid } from '@react-three/drei';
import { SceneLighting } from './SceneLighting';
import { Blocks, Group, Frame, Lightbulb, BookOpen, Clapperboard, RotateCcw, Smartphone, DraftingCompass, Loader2 as ArSpinner, Home } from 'lucide-react';
import { exportForAr, arFileName } from '../../engines/arExport';
import { registerArScene, unregisterArScene } from '../../engines/arSceneRegistry';
import { collidingSceneProducts, defaultSceneLayout } from '../../engines/sceneLayout';
import type { Placement, DetailPart, SlabInstance, Detail } from '../../domain/types';
import * as THREE from 'three';
import { Evaluator, Brush, SUBTRACTION } from 'three-bvh-csg';
import {  Vector3 } from 'three';
import { SIDE_SEGMENT_INDEXES } from '../../domain/constants';
import { buildAssemblyGroups } from '../../engines/grouping3d';
import { getSinkPartTransform } from '../../engines/sinkAssembly';
import { buildEdgeCutters } from '../../engines/edgeCutters';
import { buildGrooveCutters } from '../../engines/surfaceGrooves';
import { RoomSolids } from '../room/RoomSolids';
import { useProjectStore } from '../../store/useProjectStore';
import { getAllProjectDetails } from '../../store/projectHelpers';
import { useUIStore } from '../../store/useStore';
import { ProductElement3DNode } from './ProductElement3DNode';
import { EdgesVisibility } from '../ui/Detail3DPreview';
import { attachContextLossRecovery, waitForLiveContext } from '../../utils/webglContextRecovery';
import { BacklightRig } from './BacklightRig';


/** <Center> за умовою: для одного виробу — як завжди, для кількох — вимкнено. */
function MaybeCenter({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return enabled ? <Center disableY>{children}</Center> : <>{children}</>;
}

function ProductAssemblyWrapper({ 
  product, 
  parts, 
  placements, 
  slabs, 
  textureLayouts, 
  selectedId, 
  onSelect, 
  setIsDragging,
  /* Крок 5.1: дефолтне місце в ряду (мм), перетин габаритів, Shift-вільно. */
  defaultSlot,
  colliding,
  snapFree,
}: any) {
  const assemblyShowEdges = useUIStore((st) => st.showEdges);
  const [group, setGroup] = React.useState<THREE.Group | null>(null);
  const transformMode = useUIStore(s => s.transformMode);
  const is3dAssemblyMode = useUIStore(s => s.is3dAssemblyMode);
  const isBacklightMode = useUIStore(s => s.isBacklightMode);
  // Усі шляхи елементів цього виробу (включно з доповненнями, рекурсивно).
  // Порівнювати з product.id напряму НЕ можна: buildElementPath додає власний префікс
  // 'prod_', тому detailId має вигляд 'prod_<productId>/element:...' і startsWith(product.id)
  // не спрацьовує — через це фото слябів не завантажувались і текстури не було.
  const productElementIds = React.useMemo(() => {
    const ids = new Set<string>();
    const collect = (el: any) => {
      if (!el) return;
      ids.add(el.id);
      (el.additions || []).forEach(collect);
    };
    (product.elements || []).forEach(collect);
    return ids;
  }, [product]);

  const belongsToProduct = React.useCallback((detailId: string) => {
    if (typeof detailId !== 'string') return false;
    for (const eid of productElementIds) {
      if (detailId === eid || detailId.startsWith(eid + '/detail:')) return true;
    }
    return false;
  }, [productElementIds]);

  const uniqueUrls = React.useMemo(() => {
    const urls = new Set<string>();
    const productParts = parts.filter((p: any) => belongsToProduct(p.detailId) && p.isMain);
    productParts.forEach((part: any) => {
      const placement = placements.find((pl: any) => pl.partId === part.id);
      if (placement) {
        const slab = slabs.find((s: any) => s.id === placement.slabId);
        // Вантажимо ОБА фото одразу (звичайне і з підсвіткою), щоб перемикання
        // режиму «Підсвітка» було миттєвим, без блимання й підвантаження.
        if (slab?.photo) urls.add(slab.photo);
        if (slab?.photoBacklit) urls.add(slab.photoBacklit);
      }
    });
    return Array.from(urls);
  }, [product, parts, placements, slabs, belongsToProduct]);

  const fallbackUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  const urlsToLoad = uniqueUrls.length > 0 ? uniqueUrls : [fallbackUrl];
  const texturesArray = useTexture(urlsToLoad);
  
  const textureMap = React.useMemo(() => {
    const map = new Map<string, THREE.Texture>();
    urlsToLoad.forEach((url, i) => {
      map.set(url, Array.isArray(texturesArray) ? texturesArray[i] : texturesArray);
    });
    return map;
  }, [urlsToLoad, texturesArray]);

  // Усі парти, що належать одному елементу (для розрізаних форм їх кілька).
  const partsOfElement = React.useCallback((dId: string) => {
    return parts.filter((p: any) =>
      (p.detailId === dId || (typeof p.detailId === 'string' && p.detailId.startsWith(dId + '/detail:'))) && p.isMain
    );
  }, [parts]);

  /** Текстура для КОНКРЕТНОГО парта. Для розрізаної форми кожен сегмент має свій шматок слябу. */
  const textureForPart = (part: any) => {
    if (!part) return null;
    return buildTextureForPart(part);
  };

  /**
   * КЕШ КЛОНІВ ТЕКСТУР — критично для пам'яті.
   * Раніше `baseTex.clone()` виконувався на КОЖЕН перемальов кожної деталі.
   * У Three.js клон — це новий об'єкт із власним завантаженням у відеопам'ять,
   * а dispose() ніде не викликався. Під час перетягування деталі це десятки
   * клонів на секунду → пам'ять росла до сотень мегабайт.
   * Тепер клон створюється ОДИН раз на пару (деталь + фото), а при русі
   * оновлюється лише матриця UV — зображення не перезавантажується.
   */
  const texCacheRef = React.useRef<Map<string, THREE.Texture>>(new Map());
  React.useEffect(() => {
    const cache = texCacheRef.current;
    return () => {
      cache.forEach((t) => t.dispose());
      cache.clear();
    };
  }, []);

  const textureFactory = (dId: string) => {
    const part = partsOfElement(dId)[0];
    if (!part) return null;
    return buildTextureForPart(part);
  };

  function buildTextureForPart(part: any) {

    const layout = textureLayouts.find((l: any) => l.partId === part.id);
    const placement = placements.find((pl: any) => pl.partId === part.id);
    if (!placement) return null;
    
    const slab = slabs.find((s: any) => s.id === placement.slabId);
    if (!slab) return null;

    // Режим «Підсвітка»: беремо друге фото того самого слябу. UV-матриця НЕ змінюється,
    // тому малюнок лишається на місці — виглядає так, ніби камінь засвітився.
    const photoUrl = (isBacklightMode && slab.photoBacklit) ? slab.photoBacklit : slab.photo;
    let baseTex = textureMap.get(photoUrl || fallbackUrl);
    // Якщо підсвічене фото ще не прогрілось — не показуємо порожнечу,
    // а падаємо на основне фото (краще звичайний камінь, ніж біла пляма).
    if (!baseTex && photoUrl !== slab.photo) {
      baseTex = textureMap.get(slab.photo || fallbackUrl);
    }
    if (!baseTex) return null;

    // Клон беремо з кешу (ключ: деталь + конкретне фото). Створюється один раз.
    const cacheKey = `${part.id}|${photoUrl || 'fallback'}`;
    let clone = texCacheRef.current.get(cacheKey);
    if (!clone) {
      clone = baseTex.clone();
      /*
       * №164 (власник 08.09: «ти підкрутив яскравість і втратив глибину
       * матеріалу»). Нічого я не крутив свідомо — але фото і справді
       * показувалось не своїм. Фотографія слябу — це sRGB-зображення, а
       * three.js без явного `colorSpace` вважає її ЛІНІЙНИМИ даними і не
       * розкодовує: середні тони підскакують, контраст сідає, камінь
       * виглядає вибіленим і пласким. Ставимо sRGB — і текстура стає рівно
       * тим файлом, який приніс менеджер.
       */
      clone.colorSpace = THREE.SRGBColorSpace;
      clone.wrapS = THREE.RepeatWrapping;
      clone.wrapT = THREE.RepeatWrapping;
      clone.matrixAutoUpdate = false;
      // needsUpdate перезавантажує ЗОБРАЖЕННЯ у відеопам'ять — тільки при створенні.
      clone.needsUpdate = true;
      texCacheRef.current.set(cacheKey, clone);
    }

    // ВАЖЛИВО: джерело істини для UV — layout.sourceX/sourceY/sourceRotation.
    // Саме їх оновлює previewTextureSource() під час ПЕРЕТЯГУВАННЯ деталі в розкрої,
    // тому вони живі в реальному часі. placement.x/y оновлюється лише на відпускання,
    // тож ставити його попереду НЕ можна — текстура завмирала б до кінця тягнення.
    const sourceRot = layout?.sourceRotation ?? layout?.rotation ?? placement.rotation ?? 0;
    const sourceX = layout?.sourceX ?? layout?.x ?? placement.x ?? 0;
    const sourceY = layout?.sourceY ?? layout?.y ?? placement.y ?? 0;
    const transform = slab.textureTransform || { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
    
    // We assume calculateCustomTextureMatrix exists in scope
    // It's defined somewhere else in Viewer3D.tsx or imported?
    if (typeof (window as any).calculateCustomTextureMatrix === 'undefined' && typeof require !== 'undefined') {
       // just checking
    }
    
    const matrixArray = calculateCustomTextureMatrix(
      part, sourceRot, sourceX, sourceY, transform, slab.width || 1, slab.height || 1
    );
    
    clone.matrixAutoUpdate = false;
    clone.matrix.set(...matrixArray);

    // КОРЕКЦІЯ ГРАНІ ДЛЯ ДОПОВНЕНЬ.
    // Геометрія — ExtrudeGeometry у площині XY. Стільниця не повертається, тому назовні
    // дивиться та сама грань, що лежала на слябі, і малюнок збігається.
    // Бортик/підворот/нога ставляться поворотом ±90° навколо X, тож назовні дивиться
    // ЗВОРОТНА грань — малюнок виглядає дзеркальним. UV з розкрою при цьому правильні,
    // тому корегуємо не розкрій, а дзеркалимо U для доповнень.
    // Нога і Стінова панель відображаються правильно без корекції — їх НЕ чіпаємо.
    // Корекція потрібна лише вузьким смужкам: бортик, підворот, потовщення.
    // Слот беремо з detailId самого парта (dId тут уже недоступний — функція
    // працює з конкретним партом, щоб розрізані форми могли мати різні UV).
    const partDetailId: string = typeof part.detailId === 'string' ? part.detailId : '';
    const slot = (partDetailId.split('/element:').pop() || '').split('/')[0];
    const needsFlip = /(^|_)(skirting|fold|thickening)_/.test(slot);
    if (needsFlip) {
      // Дзеркало по V у ЛОКАЛЬНИХ координатах деталі (multiply = до матриці розкрою).
      // premultiply дзеркалив у координатах СЛЯБУ: для деталей без повороту це збігалось,
      // а для повернутих на 90° (бортик) віддзеркалювало не ту вісь. Дані [UV-DEBUG]:
      // fold rot=0 + premultiply V → ок; skirting rot=90 + premultiply V → зламано.
      // Поворот малюнка на 180° у локальних координатах деталі:
      // u' = 1 - u, v' = 1 - v. Це і є «перегортання» смужки по лінії стику
      // при монтажі (§7.2): вирізали пласкою, підняли на 90° — назовні
      // дивиться протилежна грань, тож малюнок читається перевернутим.
      const rot180 = new THREE.Matrix3().set(-1, 0, 1, 0, -1, 1, 0, 0, 1);
      clone.matrix.multiply(rot180);
    }

    // needsUpdate тут НЕ ставимо: він перезавантажує зображення у відеопам'ять.
    // Матриця UV — це uniform, вона застосовується без повторного завантаження.
    return clone;
  };

  // Нога і Стінова панель — самостійні Елементи Виробу (§3), але в 3D вони позиціонуються
  // відносно ребер Стільниці через стики, які зберігаються на ній. Тому для РЕНДЕРУ
  // склеюємо сусідні елементи в additions головного — дерево і модель даних не міняються.
  const rootElement = product.elements[0];
  const mainElement = rootElement
    ? { ...rootElement, additions: [...(rootElement.additions || []), ...product.elements.slice(1)] }
    : rootElement;
  const mainPart = parts.find((p: any) => p.detailId === mainElement.id && p.isMain);
  const mainPlacement = mainPart ? placements.find((pl: any) => pl.partId === mainPart.id) : null;
  const s = 0.001;
  const thickness = 20 * s; 
  
  const placementX = mainPlacement?.x ?? 0;
  const placementY = mainPlacement?.y ?? 0;
  const baseX = placementX; 
  const baseY = placementY; 

  const initialX = (baseX + (mainPart?.width || 1000) / 2) * s - 1.5;
  const initialY = thickness / 2;
  const initialZ = (baseY + (mainPart?.height || 600) / 2) * s - 0.8;

  /*
   * КРОК 5.1 — джерело правди про місце виробу, за пріоритетом:
   *   1. `product.scenePlacement` — мм по підлозі + поворот; живе на виробі,
   *      переживає будь-які перерахунки розкрою;
   *   2. легасі `placement.transform3d` — стара збірка цієї сесії; читаємо,
   *      щоб не смикнути картинку, але перше ж переміщення переписує все
   *      в scenePlacement;
   *   3. детермінований дефолтний ряд (`engines/sceneLayout`) — раніше тут
   *      були координати деталі НА СЛЯБІ, і вироби злипались у центрі.
   */
  const scenePlacement = product.scenePlacement;
  const savedTransform = mainPlacement?.transform3d ?? mainPlacement?.assemblyTransform;
  const position = scenePlacement
    ? [scenePlacement.x * s, initialY, scenePlacement.z * s]
    : savedTransform
      ? [savedTransform.x, savedTransform.y, savedTransform.z]
      : defaultSlot
        ? [defaultSlot.x * s, initialY, defaultSlot.z * s]
        : [initialX, initialY, initialZ];
  const rotation = scenePlacement
    ? [0, THREE.MathUtils.degToRad(scenePlacement.rotationYDeg), 0]
    : savedTransform ? [savedTransform.rx, savedTransform.ry, savedTransform.rz] : [0, 0, 0];
  
  /*
   * Виділення — по ВИРОБУ, а не по його розміщенню на слябі. Раніше
   * без mainPlacement (деталь не розмістилась — конфлікт розкрою) виріб
   * неможливо було ні виділити, ні посунути: гізмо просто не з'являлось.
   */
  const selectedProductId = useUIStore(st => st.selectedProductId3d);
  const setSelectedProductId = useUIStore(st => st.setSelectedProductId3d);
  const isSelected = selectedProductId === product.id
    || (mainPlacement && selectedId === mainPlacement.id);
  
  const updateProductScenePlacement = useProjectStore(st => st.updateProductScenePlacement);
  /* Стики 45° (02.09): план мітр у ProductElement3DNode залежить від
     матеріалу (підворот мітрується лише на керамограніті) — той самий
     фолбек, що всюди: матеріал виробу, інакше матеріал проєкту. */
  const productMaterial = useProjectStore(st => (st.project?.products?.find(pr => pr.id === product.id)?.material) ?? st.project?.projectMaterial ?? null);
  const handleDragEnd = () => {
    if (!group) return;
    // Пишемо У ВИРІБ: висота лишається на підлозі, поворот — лише навколо
    // вертикалі. Це і є «розміщення зберігається разом із проєктом».
    updateProductScenePlacement(product.id, {
      x: Math.round(group.position.x / s),
      z: Math.round(group.position.z / s),
      rotationYDeg: Math.round(THREE.MathUtils.radToDeg(group.rotation.y)) % 360,
    });
  };

  /* Червона рамка перетину: слідує за виробом (лежить у його групі). */
  const footW = ((mainPart?.width || 1000) / 2 + 30) * s;
  const footD = ((mainPart?.height || 600) / 2 + 30) * s;

  return (
    <>
      {group && (
        <TransformControls 
          object={group}
          mode={transformMode as any}
          onDraggingChanged={(e) => setIsDragging(!!e?.value)} 
          onMouseUp={handleDragEnd} 
          size={0.6}
          /* Крок 5.1: рух — тільки по підлозі (без вертикальної стрілки),
             поворот — тільки кільце навколо вертикалі. Прив'язки 50 мм і
             15°; затиснутий Shift вимикає їх для точного доведення. */
          translationSnap={snapFree ? null : 0.05}
          rotationSnap={snapFree ? null : Math.PI / 12}
          enabled={is3dAssemblyMode && isSelected}
          visible={is3dAssemblyMode && isSelected}
          showX={is3dAssemblyMode && isSelected && transformMode === 'translate'}
          showY={is3dAssemblyMode && isSelected && transformMode === 'rotate'}
          showZ={is3dAssemblyMode && isSelected && transformMode === 'translate'}
        />
      )}
      <group 
        name={`product:${product.id}`}
        position={position as any} 
        rotation={rotation as any} 
        ref={setGroup as any}
        onClick={(e) => {
          if (is3dAssemblyMode) {
            e.stopPropagation();
            setSelectedProductId(product.id);
            if (mainPlacement) onSelect(mainPlacement.id);
          }
        }}
      >
        {/* Перетин габаритів двох виробів: тільки показуємо, нічого не
            рухаємо — острів впритул до кухні ставлять свідомо. */}
        {colliding && (
          <Line
            points={[
              [-footW, 0.002, -footD], [footW, 0.002, -footD],
              [footW, 0.002, footD], [-footW, 0.002, footD],
              [-footW, 0.002, -footD],
            ] as any}
            color="#dc2626"
            lineWidth={2.5}
          />
        )}
        {/* «Показувати контури» мусить діяти і на деталі, намальовані через
            Detail3DNode: раніше кнопка глушила лише власні меші Підбору,
            а режим збірки контури ігнорував. */}
        <EdgesVisibility.Provider value={assemblyShowEdges}>
          <ProductElement3DNode
            element={mainElement}
            material={productMaterial}
            customTextureMapFactory={textureFactory}
            /* Для розрізаної складної форми (Г/П зі стиками) один меш не може мати
               три різні UV зі слябу. Тому передаємо сегменти окремо — вузол малює
               кожен своїм мешем із власною текстурою. */
            segmentPartsFor={partsOfElement}
            textureForPart={textureForPart}
            position={[0, ((mainElement?.baseDefinition?.elevation ?? 900) * 0.001), 0]}
          />
        </EdgesVisibility.Provider>
      </group>
    </>
  );
}

function MachineAnimationPrototype({ detailPart }: { detailPart?: DetailPart }) {
  const cutterRef = useRef<THREE.Group>(null);
  const sparkRef = useRef<THREE.Mesh>(null);
  const [points, setPoints] = useState<Vector3[]>([]);
  const [phase, setPhase] = useState('perimeter');
  
  // Path for perimeter
  const path1 = useMemo(() => {
    if (detailPart && detailPart.points && detailPart.points.length > 0) {
      const p = detailPart.points.map(pt => new Vector3(pt.x/1000 - detailPart.width/2000, 0.05, -(pt.y/1000 - detailPart.height/2000)));
      p.push(p[0].clone()); // close
      return p;
    }
    return [
      new Vector3(-2, 0.05, -1),
      new Vector3(2, 0.05, -1),
      new Vector3(2, 0.05, 1),
      new Vector3(-2, 0.05, 1),
      new Vector3(-2, 0.05, -1)
    ];
  }, [detailPart]);
  
  // Path for inner cutout
  const path2 = useMemo(() => {
    if (detailPart && detailPart.surfaceCutouts && detailPart.surfaceCutouts.length > 0) {
      const c = detailPart.surfaceCutouts[0];
      const cx = c.x/1000 - detailPart.width/2000;
      const cy = -(c.y/1000 - detailPart.height/2000);
      const pts = [];
      if (c.shape === 'rect') {
         const w = (c.width || 300) / 1000;
         const h = (c.height || 300) / 1000;
         pts.push(new Vector3(cx - w/2, 0.05, cy - h/2));
         pts.push(new Vector3(cx + w/2, 0.05, cy - h/2));
         pts.push(new Vector3(cx + w/2, 0.05, cy + h/2));
         pts.push(new Vector3(cx - w/2, 0.05, cy + h/2));
         pts.push(new Vector3(cx - w/2, 0.05, cy - h/2));
      } else {
         const r = (c.radius || 150)/1000;
         for(let i=0; i<=20; i++){
            const a = (i/20) * Math.PI * 2;
            pts.push(new Vector3(cx + Math.cos(a)*r, 0.05, cy + Math.sin(a)*r));
         }
      }
      return pts;
    }
    return [
      new Vector3(-0.5, 0.05, -0.3),
      new Vector3(0.5, 0.05, -0.3),
      new Vector3(0.5, 0.05, 0.3),
      new Vector3(-0.5, 0.05, 0.3),
      new Vector3(-0.5, 0.05, -0.3)
    ];
  }, [detailPart]);

  const detailShape = useMemo(() => {
    const shape = new THREE.Shape();
    if (detailPart && detailPart.points.length > 0) {
      detailPart.points.forEach((pt, i) => {
        const x = pt.x/1000 - detailPart.width/2000;
        const y = pt.y/1000 - detailPart.height/2000;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      if (detailPart.surfaceCutouts) {
        detailPart.surfaceCutouts.forEach(c => {
           const hole = new THREE.Path();
           const cx = c.x/1000 - detailPart.width/2000;
           const cy = c.y/1000 - detailPart.height/2000;
           if (c.shape === 'rect') {
             const w = (c.width || 300) / 1000;
             const h = (c.height || 300) / 1000;
             hole.moveTo(cx - w/2, cy - h/2);
             hole.lineTo(cx + w/2, cy - h/2);
             hole.lineTo(cx + w/2, cy + h/2);
             hole.lineTo(cx - w/2, cy + h/2);
             hole.lineTo(cx - w/2, cy - h/2);
           } else {
             const r = (c.radius || 150)/1000;
             hole.absarc(cx, cy, r, 0, Math.PI * 2, false);
           }
           shape.holes.push(hole);
        });
      }
    } else {
      shape.moveTo(-2, -1);
      shape.lineTo(2, -1);
      shape.lineTo(2, 1);
      shape.lineTo(-2, 1);
      shape.lineTo(-2, -1);
      const hole = new THREE.Path();
      hole.moveTo(-0.5, -0.3);
      hole.lineTo(0.5, -0.3);
      hole.lineTo(0.5, 0.3);
      hole.lineTo(-0.5, 0.3);
      hole.lineTo(-0.5, -0.3);
      shape.holes.push(hole);
    }
    return shape;
  }, [detailPart]);

  const t = useRef(0);
  const pIndex = useRef(0);

  useFrame((state, delta) => {
    t.current += delta * 0.5; // speed
    if (t.current > 1) {
      t.current = 0;
      pIndex.current++;
    }

    let currentPath = phase === 'perimeter' ? path1 : path2;
    if (pIndex.current >= currentPath.length - 1) {
      if (phase === 'perimeter') {
        setPhase('cutout');
        pIndex.current = 0;
        setPoints([]);
      } else {
        // restart
        setPhase('perimeter');
        pIndex.current = 0;
        setPoints([]);
      }
      return;
    }

    const start = currentPath[pIndex.current];
    const end = currentPath[pIndex.current + 1];
    const pos = new Vector3().lerpVectors(start, end, t.current);
    
    if (cutterRef.current) {
      cutterRef.current.position.copy(pos);
    }
    if (sparkRef.current) {
      sparkRef.current.rotation.y += delta * 10;
      sparkRef.current.rotation.z += delta * 15;
      const s = 0.5 + Math.random() * 0.5;
      sparkRef.current.scale.set(s,s,s);
    }

    setPoints(prev => {
      const np = [...prev];
      if (np.length === 0 || np[np.length-1].distanceTo(pos) > 0.05) {
        np.push(pos.clone());
      }
      return np;
    });
  });

  return (
    <group>
      {/* Slab */}
      <mesh position={[0, -0.02, 0]} receiveShadow>
        <boxGeometry args={[5, 0.04, 3]} />
        <meshBasicMaterial color="#e2e8f0" />
        <Edges color="#94a3b8" />
      </mesh>
      
      {/* The Detail itself */}
      <mesh position={[0, 0.021, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[detailShape]} />
        <meshBasicMaterial color="#3b82f6" side={THREE.DoubleSide} />
        <Edges color="#1d4ed8" threshold={15} />
      </mesh>
      
      {/* Target piece outline lines */}
      <Line points={path1} color="#0f172a" lineWidth={2} />
      <Line points={path2} color="#0f172a" lineWidth={2} />

      {/* Cut trail */}
      {points.length > 1 && (
        <Line points={points} color="#ff3300" lineWidth={4} />
      )}

      {/* Cutter Head */}
      <group ref={cutterRef}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.6]} />
          <meshBasicMaterial color="#333" />
        </mesh>
        <mesh ref={sparkRef} position={[0, 0, 0]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color="#ffcc00" transparent opacity={0.8} />
        </mesh>
        <Html position={[0, 0.7, 0]} center>
          <div className="bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
            {phase === 'perimeter' ? 'Різ по периметру (Пила/Фреза)' : 'Внутрішній виріз (Waterjet)'}
          </div>
        </Html>
      </group>
    </group>
  );
}

function calculateCustomTextureMatrix(
  part: DetailPart,
  sourceRot: number,
  sourceX: number,
  sourceY: number,
  transform: { scale?: number, offsetX?: number, offsetY?: number, rotation?: number },
  slabWidth: number,
  slabHeight: number
) {
  const imageWidth = (slabWidth || 1) * (transform.scale ?? 1);
  const imageHeight = (slabHeight || 1) * (transform.scale ?? 1);
  const tOffsetX = transform.offsetX ?? 0;
  const tOffsetY = transform.offsetY ?? 0;
  const tRotation = transform.rotation ?? 0;

  const rotatePoint = (p: { x: number; y: number }, angleDeg: number) => {
    const cx = part.width / 2;
    const cy = part.height / 2;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const a = angleDeg * (Math.PI / 180);
    return {
      x: cx + dx * Math.cos(a) - dy * Math.sin(a),
      y: cy + dx * Math.sin(a) + dy * Math.cos(a)
    };
  };

  const rotatedReference = part.points.map((item) => rotatePoint(item, sourceRot));
  const minX = Math.min(...rotatedReference.map((item) => item.x));
  const minY = Math.min(...rotatedReference.map((item) => item.y));

  const calcUV = (U: number, V: number) => {
    const x = U * part.width;
    const y = V * part.height;
    
    const rp = rotatePoint({ x, y }, sourceRot);

    const slabX = sourceX + (rp.x - minX);
    const slabY = sourceY + (rp.y - minY);

    let rotX = slabX;
    let rotY = slabY;
    if (tRotation) {
      const scx = (slabWidth || 0) / 2;
      const scy = (slabHeight || 0) / 2;
      const ta = -tRotation * (Math.PI / 180);
      const sdx = slabX - scx;
      const sdy = slabY - scy;
      rotX = scx + sdx * Math.cos(ta) - sdy * Math.sin(ta);
      rotY = scy + sdx * Math.sin(ta) + sdy * Math.cos(ta);
    }

    const u = (rotX - tOffsetX) / imageWidth;
    const v = 1 - (rotY - tOffsetY) / imageHeight;
    return { u, v };
  };

  const p00 = calcUV(0, 0);
  const p10 = calcUV(1, 0);
  const p01 = calcUV(0, 1);

  return [
    p10.u - p00.u, p01.u - p00.u, p00.u,
    p10.v - p00.v, p01.v - p00.v, p00.v,
    0, 0, 1
  ];
}

function TexturedPart({ 
  placement, part, slab, parts, isSelected, isHovered, onSelect, 
  originOffset = [0,0,0], localTransform, baseX, baseY, parentBaseX, parentBaseY, detail, csgCutters
}: any) {
  const s = 0.001;
  const thickness = slab?.thickness ? slab.thickness * s : 0.02;

  const layout = useProjectStore(state => 
    state.project.textureLayouts.find((l: any) => l.partId === part.id)
  );
  const showEdges = useUIStore((state) => state.showEdges);
  const sourceX = layout?.sourceX ?? layout?.x ?? 0;
  const sourceY = layout?.sourceY ?? layout?.y ?? 0;

  const photoUrl = slab?.photo;
  const fallbackUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  const texture = useTexture(photoUrl || fallbackUrl);
  
  const { clone: clonedTexture, sideClone } = useMemo(() => {
    if (!texture || !photoUrl || !slab) return { clone: null, sideClone: null };
    
    const clone = texture.clone();
    // №164: те саме sRGB, що й у кеші клонів вище — фото має лишатись собою.
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;

    const sourceRot = layout?.sourceRotation ?? layout?.rotation ?? 0;
    const transform = slab.textureTransform || { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
    
    const matrixArray = calculateCustomTextureMatrix(
      part, sourceRot, sourceX, sourceY, transform, slab.width || 1, slab.height || 1
    );
    
    clone.matrixAutoUpdate = false;
    clone.matrix.set(...matrixArray);
    clone.needsUpdate = true;
    
    const sideClone = texture.clone();
    sideClone.colorSpace = THREE.SRGBColorSpace;
    sideClone.wrapS = THREE.RepeatWrapping;
    sideClone.wrapT = THREE.RepeatWrapping;
    
    const isRotated = sourceRot === 90 || sourceRot === 270;
    const rotatedWidth = isRotated ? part.height : part.width;
    const imageWidth = (slab.width || 1) * (transform.scale ?? 1);
    const imageHeight = (slab.height || 1) * (transform.scale ?? 1);
    const sx = rotatedWidth / imageWidth;
    const sideSy = (slab.thickness || 20) / imageHeight;
    
    sideClone.repeat.set(sx, sideSy);
    const totalRot = transform.rotation - sourceRot;
    if (totalRot !== 0) {
      sideClone.center.set(0.5, 0.5);
      sideClone.rotation = -totalRot * (Math.PI / 180);
    }
    sideClone.needsUpdate = true;

    return { clone, sideClone };
  }, [texture, photoUrl, slab, part, sourceX, sourceY, layout]);

  const bounds = { minX: 0, minY: 0, maxX: part.width, maxY: part.height };
  const { shape: detailShape } = useDetailShape(detail || { kind: 'rect' }, part.points || [
    { x: 0, y: 0 },
    { x: part.width, y: 0 },
    { x: part.width, y: part.height },
    { x: 0, y: part.height }
  ], bounds);

  const { geometry, baseQuaternion } = useMemo(() => {
    const shape = new THREE.Shape().copy(detailShape);
    
    if (part.holes) {
      part.holes.forEach((hole: {x: number, y: number}[]) => {
        if (!hole || !Array.isArray(hole)) return;
        const holePath = new THREE.Path();
        const reversedHole = [...hole].reverse();
        reversedHole.forEach((p: {x: number, y: number}, i: number) => {
          const nx = p.x / part.width;
          const ny = p.y / part.height;
          if (i === 0) holePath.moveTo(nx, ny);
          else holePath.lineTo(nx, ny);
        });
        holePath.closePath();
        shape.holes.push(holePath);
      });
    }

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
    });

    geom.scale(part.width * s, part.height * s, 1);
    geom.translate(-part.width * s / 2, -part.height * s / 2, -thickness / 2);
    geom.rotateX(Math.PI / 2);

    const uvs = geom.attributes.uv;
    if (uvs) {
      uvs.needsUpdate = true;
    }
    
    geom.computeVertexNormals();

    const baseQuat = new THREE.Quaternion();
    if (layout?.rotated) {
      baseQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    }
    
    return { geometry: geom, baseQuaternion: baseQuat };
  }, [part, thickness, s, layout, detailShape]);

  const localPosOffset = localTransform?.pos;
  const localQuaternion = localTransform?.quat;
  
  if (localTransform?.hidden) return null;
  
  const finalQuaternion = localTransform ? (localQuaternion || new THREE.Quaternion()) : new THREE.Quaternion().multiply(baseQuaternion);
  
  const meshPos: [number, number, number] = localPosOffset 
    ? [localPosOffset[0], localPosOffset[1], localPosOffset[2]] 
    : [
        baseX * s - 1.5 - originOffset[0], 
        thickness / 2 - originOffset[1], 
        baseY * s - 0.8 - originOffset[2]
      ];

  /*
   * ТОРЦІ (28.08): різаки профілів крайок. Симуляція інструмента —
   * перетин фрези протягнутий уздовж сторін з edgeProfiles і відніматий
   * CSG, тим самим механізмом, що ріже 45° на загинах. Геометрії вже в
   * локальному просторі меша (див. engines/edgeCutters), тому без
   * матриць. Кеш по (part, профілі, товщина) — перерахунок лише коли
   * людина реально міняє обробку.
   */
  const edgeCutterGeoms = useMemo(() => {
    const out: THREE.BufferGeometry[] = [];
    // РАДІУСИ (01.09): крім профілів сторін — галочка «Обробка торців» на
    // куті (профіль сусідньої сторони йде через усю дугу) і на периметрі
    // вирізу. Кути й вирізи передаються з деталі; отвори бере з part.holes.
    const millingOn = (v?: string) => Boolean(v) && v !== 'Без фрезерування';
    type Milled = { edgeProcessing?: string } | undefined;
    const wantsCutters = Boolean(detail?.edgeProfiles)
      || Object.values((detail?.corners ?? {}) as Record<string, Milled>).some((c) => millingOn(c?.edgeProcessing))
      || Object.values((detail?.cutouts ?? {}) as Record<string, Milled>).some((c) => millingOn(c?.edgeProcessing));
    if (wantsCutters) {
      try {
        out.push(...buildEdgeCutters(part, detail?.edgeProfiles, thickness * 1000, {
          corners: detail?.corners,
          cutouts: detail?.cutouts,
        }));
      } catch (e) {
        console.error('edge cutters error', e);
      }
    }
    /* Фрезерування площини (проточки для води, декор) — той самий
       CSG-конвеєр, що й торці. Без цього канавки жили б лише в
       прев'ю редактора, а в режимі збірки зникали. */
    const grooves = detail?.surfaceGrooves;
    if (grooves?.length) {
      try {
        out.push(...buildGrooveCutters(grooves, part.width, part.height, thickness * 1000));
      } catch (e) {
        console.error('groove cutters error', e);
      }
    }
    return out;
  }, [part, detail?.edgeProfiles, detail?.corners, detail?.cutouts, detail?.surfaceGrooves, thickness]);

  const finalGeometry = useMemo(() => {
    let currentGeom = geometry;
    if ((csgCutters && csgCutters.length > 0) || edgeCutterGeoms.length > 0) {
      try {
        const meshMatrix = new THREE.Matrix4().compose(
          new THREE.Vector3(...meshPos),
          finalQuaternion,
          new THREE.Vector3(1, 1, 1)
        );
        const invMatrix = meshMatrix.clone().invert();

        let brush = new Brush(currentGeom, new THREE.Material());
        brush.updateMatrixWorld();

        const evaluator = new Evaluator();
        evaluator.useGroups = false;

        for (const c of csgCutters ?? []) {
          const point = new THREE.Vector3(...c.point);
          const normal = new THREE.Vector3(...c.normal);

          const cutterBox = new THREE.BoxGeometry(10, 10, 10);
          cutterBox.translate(0, 0, 5);
          const cutterMesh = new THREE.Mesh(cutterBox);

          cutterMesh.position.copy(point);
          cutterMesh.lookAt(point.clone().add(normal));
          cutterMesh.updateMatrix();

          cutterMesh.applyMatrix4(invMatrix);
          cutterMesh.updateMatrixWorld();

          const cutterBrush = new Brush(cutterMesh.geometry, new THREE.Material());
          cutterBrush.matrix.copy(cutterMesh.matrix);
          cutterBrush.updateMatrixWorld();

          brush = evaluator.evaluate(brush, cutterBrush, SUBTRACTION);
        }

        for (const cutterGeom of edgeCutterGeoms) {
          const cutterBrush = new Brush(cutterGeom, new THREE.Material());
          cutterBrush.updateMatrixWorld();
          brush = evaluator.evaluate(brush, cutterBrush, SUBTRACTION);
        }

        currentGeom = brush.geometry;
      } catch (e) {
        console.error("CSG error", e);
      }
    }
    return currentGeom;
  }, [geometry, csgCutters, edgeCutterGeoms, meshPos, finalQuaternion]);

  return (
    <mesh
      castShadow
      receiveShadow
      geometry={finalGeometry}
      position={meshPos}
      quaternion={finalQuaternion}
      onClick={(e) => {
        if (onSelect) {
          e.stopPropagation();
          onSelect();
        }
      }}
    >
      {showEdges && <Edges color="black" threshold={15} />}
      {clonedTexture ? (
        <>
          <meshStandardMaterial 
            attach="material-0"
            map={clonedTexture} 
            roughness={0.1} 
            emissive={isSelected ? new THREE.Color(0x3b82f6) : (isHovered ? new THREE.Color(0x60a5fa) : new THREE.Color(0x000000))}
            emissiveIntensity={isSelected ? 0.3 : (isHovered ? 0.15 : 0)}
          />
          <meshStandardMaterial 
            attach="material-1"
            map={sideClone || clonedTexture} 
            roughness={0.1} 
            emissive={isSelected ? new THREE.Color(0x3b82f6) : (isHovered ? new THREE.Color(0x60a5fa) : new THREE.Color(0x000000))}
            emissiveIntensity={isSelected ? 0.3 : (isHovered ? 0.15 : 0)}
          />
        </>
      ) : (
        <>
          <meshStandardMaterial attach="material-0" color="#f8fafc" roughness={0.1} emissive={isSelected ? new THREE.Color(0x3b82f6) : (isHovered ? new THREE.Color(0x60a5fa) : new THREE.Color(0x000000))} emissiveIntensity={isSelected ? 0.3 : (isHovered ? 0.15 : 0)} />
          <meshStandardMaterial attach="material-1" color="#e2e8f0" roughness={0.1} emissive={isSelected ? new THREE.Color(0x3b82f6) : (isHovered ? new THREE.Color(0x60a5fa) : new THREE.Color(0x000000))} emissiveIntensity={isSelected ? 0.3 : (isHovered ? 0.15 : 0)} />
        </>
      )}
    </mesh>
  );
}

function EdgePartWrapper({ placement, part, slab, parts, mainPart, isSelected, isHovered, onSelect, textureLayouts, originOffset, baseX, baseY, parentBaseX, parentBaseY, foldSides, mainPartWidth, mainPartHeight, mainPosOffset }: any) {
  const s = 0.001;
  const thickness = slab?.thickness ? slab.thickness * s : 0.02;

  let start = { x: 0, y: 0 };
  let end = { x: 0, y: 0 };
  
  const side = part.edgeSide;
  const explicitSegment = mainPart.sideSegments?.[side as any];
  const index = side ? SIDE_SEGMENT_INDEXES[mainPart.shape]?.[side] : undefined;
  
  if (explicitSegment) {
    start = explicitSegment.start;
    end = explicitSegment.end;
  } else if (index !== undefined && mainPart.points && mainPart.points.length > index) {
    start = mainPart.points[index];
    end = mainPart.points[(index + 1) % mainPart.points.length];
  } else {
    const w = mainPart.width;
    const h = mainPart.height;
    if (side === 'A') { start = { x: 0, y: h }; end = { x: 0, y: 0 }; }
    else if (side === 'B') { start = { x: 0, y: 0 }; end = { x: w, y: 0 }; }
    else if (side === 'C') { start = { x: w, y: 0 }; end = { x: w, y: h }; }
    else if (side === 'D') { start = { x: w, y: h }; end = { x: 0, y: h }; }
  }

  // We DO NOT rotate `start` and `end` here anymore because in Assembly mode, 
  // the main part geometry is not rotated by mainRot, so the fold must attach 
  // to the original unrotated coordinates of the edge!

  const cx = mainPart.width / 2;
  const cy = mainPart.height / 2;
  
  const P1x = (start.x - cx) * s;
  const P1z = (start.y - cy) * s;
  const P2x = (end.x - cx) * s;
  const P2z = (end.y - cy) * s;

  const midX = (P1x + P2x) / 2;
  const midZ = (P1z + P2z) / 2;
  
  const dx = P2x - P1x;
  const dz = P2z - P1z;
  const angle = Math.atan2(dz, dx);

  const zSurface = thickness / 2;
  const isVerticalPart = part.width < part.height;
  const edgeLength = Math.max(part.width, part.height) * s;
  const edgeSize = Math.min(part.width, part.height) * s;

  // We want the part's length (edgeLength) to align with local X,
  // and its width (edgeSize) to align with local Y (pointing down from the top surface).
  // The TexturedPart starts with X = part.width, Z = -part.height (due to rotateX(pi/2) internally).
  const localQuat = new THREE.Quaternion();
  
  if (isVerticalPart) {
    // Create a rotation matrix that maps the original axes (after geom.rotateX) to the correct local axes.
    // For isVerticalPart (e.g. 50x900 Fold):
    // Original 900-length (-Z) must go to -X so that Leg Group (which maps -X to Y) makes it Vertical.
    // Original Face (-Y) must go to +Z so it points outwards.
    // Original 50-width (X) must go to -Y so it points down.
    localQuat.multiply(new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(1, 0, 0)
      )
    ));
  } else {
    // For horizontal part (e.g. 900x50 Fold):
    // Original 900-length (X) must go to X.
    // Original Face (-Y) must go to +Z.
    // Original 50-width (-Z) must go to -Y.
    localQuat.multiply(new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 1, 0)
      )
    ));
  }

  let localY = 0;
  let localZ = 0;
  
  if (part.edgeKind === 'fold') {
    // Align top of the fold with the top surface. 
    // The fold's Y axis now spans from -edgeSize/2 to edgeSize/2.
    // We want it to go from 0 to -edgeSize, so we shift it by -edgeSize/2.
    // BUT wait, in Detail3DPreview, fold is at Y = -thickness - extraHeight/2.
    // If extraHeight = edgeSize - thickness, then Y = -thickness - (edgeSize - thickness)/2 = -thickness/2 - edgeSize/2.
    // Let's just place it so its top is flush with the top of the main part.
    // Top of main part is zSurface (thickness/2 in parent space).
    // So local Y=0 is the top surface. The fold should hang down from Y=0 to Y=-edgeSize.
    localY = -edgeSize / 2;
    localZ = thickness / 2; // Move it out by half thickness so it sits on the edge
  } else if (part.edgeKind === 'thickening') {
    localY = -thickness - thickness / 2;
    localZ = edgeSize / 2;
  }

  const foldCutters = useMemo(() => {
    let cutters: { point: [number, number, number], normal: [number, number, number] }[] = [];
    if (part.edgeKind === 'fold' && side) {
      const w = mainPartWidth || 0;
      const h = mainPartHeight || 0;
      
      // 1. Longitudinal miter against Tabletop (Reverse of Tabletop's discard normal)
      // Note: EdgePartWrapper's group is placed exactly at the edge's center. 
      // So the Fold's local space has its origin [0,0,0] at the edge center.
      if (side === 'A') cutters.push({ point: [0, thickness/2, 0], normal: [0, 1, 1] });
      if (side === 'B') cutters.push({ point: [0, thickness/2, 0], normal: [-1, 1, 0] });
      if (side === 'C') cutters.push({ point: [0, thickness/2, 0], normal: [0, 1, -1] });
      if (side === 'D') cutters.push({ point: [0, thickness/2, 0], normal: [1, 1, 0] });
      
      // 2. Corner miters against adjacent folds
      if (foldSides) {
        if (side === 'A') {
          if (foldSides.has('D')) cutters.push({ point: [-w/2, 0, 0], normal: [-1, 0, 1] });
          if (foldSides.has('B')) cutters.push({ point: [w/2, 0, 0], normal: [1, 0, 1] });
        }
        if (side === 'B') {
          if (foldSides.has('A')) cutters.push({ point: [0, 0, -h/2], normal: [-1, 0, -1] });
          if (foldSides.has('C')) cutters.push({ point: [0, 0, h/2], normal: [-1, 0, 1] });
        }
        if (side === 'C') {
          if (foldSides.has('B')) cutters.push({ point: [w/2, 0, 0], normal: [1, 0, -1] });
          if (foldSides.has('D')) cutters.push({ point: [-w/2, 0, 0], normal: [-1, 0, -1] });
        }
        if (side === 'D') {
          if (foldSides.has('C')) cutters.push({ point: [0, 0, h/2], normal: [1, 0, 1] });
          if (foldSides.has('A')) cutters.push({ point: [0, 0, -h/2], normal: [1, 0, -1] });
        }
      }
    }
    return cutters;
  }, [part.edgeKind, side, mainPartWidth, mainPartHeight, thickness, foldSides]);

  const groupPosX = midX + (mainPosOffset?.[0] || 0);
  const groupPosY = zSurface + (mainPosOffset?.[1] || 0);
  const groupPosZ = midZ + (mainPosOffset?.[2] || 0);

  return (
    <group position={[groupPosX, groupPosY, groupPosZ]} rotation={[0, -angle, 0]}>
      <Suspense fallback={null}>
        <TexturedPart 
          placement={placement} 
          part={part} 
          slab={slab} 
          parts={parts} 
          isSelected={isSelected}
          isHovered={isHovered}
          onSelect={onSelect}
          originOffset={originOffset}
          localTransform={{ pos: [0, localY, localZ], quat: localQuat }}
          baseX={baseX}
          baseY={baseY}
          parentBaseX={parentBaseX}
          parentBaseY={parentBaseY}
          csgCutters={foldCutters}
        />
      </Suspense>
    </group>
  );
}

function AssemblyGroup({ mainPlacement, mainPart, foldPlacements, childPlacements, parts, slabs, selectedId, onSelect, setIsDragging, isSink }: { mainPlacement: Placement, mainPart: DetailPart, foldPlacements: Placement[], childPlacements: Placement[], parts: DetailPart[], slabs: SlabInstance[], selectedId: string | null, onSelect: (id: string) => void, setIsDragging: (d: boolean) => void, isSink?: boolean }) {
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const [hovered, setHovered] = useState(false);
  const is3dAssemblyMode = useUIStore(s => s.is3dAssemblyMode);
  const transformMode = useUIStore(s => s.transformMode);
  const updatePlacement3dTransform = useProjectStore(s => s.updatePlacement3dTransform);
  
  const textureLayouts = useProjectStore(s => s.project.textureLayouts);
  const project = useProjectStore(s => s.project);
  const details = getAllProjectDetails(project);
  const detail = isSink ? details.find((d: Detail) => d.id === mainPart.detailId) : null;
  
  const layout = textureLayouts.find((l) => l.partId === mainPart.id);
  const s = 0.001;
  const mainSlab = slabs.find((s: SlabInstance) => s.id === mainPlacement.slabId);
  const thickness = mainSlab?.thickness ? mainSlab.thickness * s : 0.02;
  const mainPartDetail = details.find((d: Detail) => d.id === mainPart.detailId);
  
  const placementX = layout?.x ?? mainPlacement.x;
  const placementY = layout?.y ?? mainPlacement.y;
  const baseX = (mainPartDetail?.importOffsetX ?? 0) + placementX;
  const baseY = (mainPartDetail?.importOffsetY ?? 0) + placementY;

  const initialX = (baseX + mainPart.width / 2) * s - 1.5;
  const initialY = thickness / 2;
  const initialZ = (baseY + mainPart.height / 2) * s - 0.8;

  const transform = mainPlacement.transform3d ?? (mainPlacement as any).assemblyTransform;
  const position: [number, number, number] = transform ? [transform.x, transform.y, transform.z] : [initialX, initialY, initialZ];
  const rotation: [number, number, number] = transform ? [transform.rx, transform.ry, transform.rz] : [0, 0, 0];
  const originOffset: [number, number, number] = [initialX, initialY, initialZ];
  
  const isSelected = selectedId === mainPlacement.id;
  
  const handleDragEnd = () => {
    if (!group) return;
    const pos = group.position;
    const rot = group.rotation;
    updatePlacement3dTransform(mainPlacement.id, { x: pos.x, y: pos.y, z: pos.z, rx: rot.x, ry: rot.y, rz: rot.z });
  };

  const select = () => {
    if (is3dAssemblyMode) onSelect(mainPlacement.id);
  };

  const mw = mainPart.width * s;
  const mh = mainPart.height * s;

  const { foldSides, tabletopCutters } = useMemo(() => {
    const sides = new Set<string>();
    const cutters: { point: [number, number, number], normal: [number, number, number] }[] = [];
    foldPlacements.forEach((fp: Placement) => {
      const fPart = parts.find((p: DetailPart) => p.id === fp.partId);
      if (fPart && fPart.edgeKind === 'fold') {
        const side = fPart.parentDetailSide;
        if (side) {
          sides.add(side);
          if (side === 'A') cutters.push({ point: [-mw/2, thickness/2, -mh], normal: [0, -1, -1] });
          if (side === 'B') cutters.push({ point: [0, thickness/2, -mh/2], normal: [1, -1, 0] });
          if (side === 'C') cutters.push({ point: [-mw/2, thickness/2, 0], normal: [0, -1, 1] });
          if (side === 'D') cutters.push({ point: [-mw, thickness/2, -mh/2], normal: [-1, -1, 0] });
        }
      }
    });
    return { foldSides: sides, tabletopCutters: cutters };
  }, [foldPlacements, parts, thickness, mw, mh]);

  const content = (
    <group position={position} rotation={rotation} ref={setGroup} onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>
      <Suspense fallback={null}>
        <TexturedPart 
          placement={mainPlacement} 
          part={mainPart} 
          slab={mainSlab} 
          parts={parts}
          detail={mainPartDetail}
          isSelected={isSelected}
          isHovered={hovered && !isSelected}
          onSelect={select}
          originOffset={originOffset}
          localTransform={(isSink && getSinkPartTransform(mainPart, detail, thickness)) || { pos: [0, 0, 0] }}
          baseX={baseX}
          baseY={baseY}
          csgCutters={tabletopCutters}
        />
      </Suspense>
      {foldPlacements.map((fp: Placement) => {
         const fPart = parts.find((p: DetailPart) => p.id === fp.partId);
         const fSlab = slabs.find((s: SlabInstance) => s.id === fp.slabId);
         if (!fPart || !fSlab) return null;
         const fLayout = textureLayouts.find((l) => l.partId === fPart.id);
         const fPlacementX = fLayout?.x ?? fp.x;
         const fPlacementY = fLayout?.y ?? fp.y;
         const fBaseX = (fPart.importOffsetX ?? 0) + fPlacementX;
         const fBaseY = (fPart.importOffsetY ?? 0) + fPlacementY;

         // Мийка — не стільниця з підворотами: її стінки й трикутники дна
         // ставляться власними трансформаціями чаші, а не логікою кромки.
         // Через EdgePartWrapper вони лягали площиною і давали «хрест».
         if (isSink) {
           const sinkTransform = getSinkPartTransform(fPart, detail, thickness);
           if (!sinkTransform) return null;
           return (
             <Suspense key={fp.id} fallback={null}>
               <TexturedPart
                 placement={fp}
                 part={fPart}
                 slab={fSlab}
                 parts={parts}
                 detail={detail ?? undefined}
                 isSelected={isSelected}
                 isHovered={hovered && !isSelected}
                 onSelect={select}
                 originOffset={originOffset}
                 localTransform={sinkTransform}
                 baseX={fBaseX}
                 baseY={fBaseY}
               />
             </Suspense>
           );
         }

         return (
           <Suspense key={fp.id} fallback={null}>
             <EdgePartWrapper 
               placement={fp} 
               part={fPart} 
               slab={fSlab} 
               parts={parts} 
               mainPart={mainPart}
               isSelected={isSelected}
               isHovered={hovered && !isSelected}
               onSelect={select}
               textureLayouts={textureLayouts}
               originOffset={originOffset}
               baseX={fBaseX}
               baseY={fBaseY}
               parentBaseX={baseX}
               parentBaseY={baseY}
               foldSides={foldSides}
               mainPartWidth={mw}
               mainPartHeight={mh}
               mainPosOffset={[-mw/2, 0, -mh/2]}
             />
           </Suspense>
         );
      })}
      {childPlacements.filter((cp: Placement) => {
         const p = parts.find((pt: DetailPart) => pt.id === cp.partId);
         return p && p.isMain;
      }).map((cp: Placement) => {
         const cPart = parts.find((p: DetailPart) => p.id === cp.partId);
         const cSlab = slabs.find((s: SlabInstance) => s.id === cp.slabId);
         const cDetail = details.find(d => d.id === cPart.detailId);
         if (!cDetail) return null;

         const cLayout = textureLayouts.find((l) => l.partId === cPart.id);
         const cPlacementX = cLayout?.x ?? cp.x;
         const cPlacementY = cLayout?.y ?? cp.y;
         const cBaseX = (cPart.importOffsetX ?? 0) + cPlacementX;
         const cBaseY = (cPart.importOffsetY ?? 0) + cPlacementY;
         const cThick = cSlab?.thickness ? cSlab.thickness * s : 0.02;
          
         let localPos: [number, number, number] = [0, 0, 0];
         let localRot: [number, number, number] = [0, 0, 0];
          
         const side = cDetail.parentDetailSide;
         let midX = 0, midZ = 0, angle = 0;
          
         const w = mainPart.width * s;
         const h = mainPart.height * s;

         if (side && mainPart.sideSegments && mainPart.sideSegments[side]) {
           const seg = mainPart.sideSegments[side];
           const nx1 = seg.start.x * s - w/2;
           const nz1 = seg.start.y * s - h/2;
           const nx2 = seg.end.x * s - w/2;
           const nz2 = seg.end.y * s - h/2;
            
           midX = (nx1 + nx2) / 2;
           midZ = (nz1 + nz2) / 2;
           const dx = nx2 - nx1;
           const dz = nz2 - nz1;
           angle = Math.atan2(dz, dx);
         } else if (side) {
           if (side === 'A') { midX = 0; midZ = -h/2; angle = 0; }
           else if (side === 'B') { midX = w/2; midZ = 0; angle = Math.PI/2; }
           else if (side === 'C') { midX = 0; midZ = h/2; angle = Math.PI; }
           else if (side === 'D') { midX = -w/2; midZ = 0; angle = -Math.PI/2; }
         }
          
         const edgePos = new THREE.Vector3(midX, thickness / 2, midZ);
         const edgeQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -angle, 0));
         const partQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
         
         const partPos = new THREE.Vector3();
         const sideLen = (side === 'A' || side === 'C') ? w : h;
         const partWidth = cPart.width * s;
         const partHeight = cPart.height * s;
         const offsetFromEdge = (cDetail.importOffsetX ?? 0) * s;
         // Pos X: Start from left edge (-sideLen / 2), add offset, add half width so left edge of part aligns with offset.
         const posX = -sideLen / 2 + offsetFromEdge + partWidth / 2;
         
         if (cDetail.type === 'Опора') {
           partPos.set(posX, -partHeight / 2, thickness / 2);
         } else if (cDetail.type === 'Стінова панель') {
           partPos.set(posX, partHeight / 2, -thickness / 2);
         }
         
         partPos.applyQuaternion(edgeQuat).add(edgePos);
         partQuat.premultiply(edgeQuat);
         
         localPos = [partPos.x, partPos.y, partPos.z];
         const euler = new THREE.Euler().setFromQuaternion(partQuat, 'XYZ');
         localRot = [euler.x, euler.y, euler.z];

         return (
           <group key={cp.id} position={localPos} rotation={localRot}>
             <Suspense fallback={null}>
               <TexturedPart 
                 placement={cp} 
                 part={cPart} 
                 slab={cSlab} 
                 parts={parts} 
                 detail={cDetail}
                 isSelected={selectedId === cp.id}
                 isHovered={hovered && selectedId !== cp.id}
                 onSelect={() => { if (is3dAssemblyMode) onSelect(cp.id); }}
                 originOffset={[0, 0, 0]}
                 localTransform={{ pos: [0, 0, 0] }}
                 baseX={cBaseX}
                 baseY={cBaseY}
                 parentBaseX={cBaseX}
                 parentBaseY={cBaseY}
               />
             </Suspense>
             {childPlacements.filter((cfp: Placement) => {
               const p = parts.find((pt: DetailPart) => pt.id === cfp.partId);
               return p && !p.isMain && p.parentLabel === cPart?.parentLabel;
             }).map((cfp: Placement) => {
               const cfPart = parts.find((p: DetailPart) => p.id === cfp.partId);
               const cfSlab = slabs.find((s: SlabInstance) => s.id === cfp.slabId);
               if (!cfPart || !cfSlab) return null;
               const cfLayout = textureLayouts.find((l) => l.partId === cfPart.id);
               const cfPlacementX = cfLayout?.x ?? cfp.x;
               const cfPlacementY = cfLayout?.y ?? cfp.y;
               const cfBaseX = (cfPart.importOffsetX ?? 0) + cfPlacementX;
               const cfBaseY = (cfPart.importOffsetY ?? 0) + cfPlacementY;
               return (
                 <Suspense key={cfp.id} fallback={null}>
                   <EdgePartWrapper 
                     placement={cfp} 
                     part={cfPart} 
                     slab={cfSlab} 
                     parts={parts} 
                     mainPart={cPart}
                     isSelected={selectedId === cfp.id}
                     isHovered={hovered && selectedId !== cfp.id}
                     onSelect={() => { if (is3dAssemblyMode) onSelect(cfp.id); }}
                     textureLayouts={textureLayouts}
                     originOffset={[0, 0, 0]}
                     baseX={cfBaseX}
                     baseY={cfBaseY}
                     parentBaseX={cBaseX}
                     parentBaseY={cfBaseY}
                     foldSides={new Set()}
                     mainPartWidth={cPart.width * s}
                     mainPartHeight={cPart.height * s}
                     mainPosOffset={[0, 0, 0]}
                   />
                 </Suspense>
               );
             })}
           </group>
         );
      })}
    </group>
  );

  return (
    <>
      {group && (
        <TransformControls 
          object={group}
          mode={transformMode}
          onDraggingChanged={(e) => setIsDragging(!!e?.value)} 
          onMouseUp={handleDragEnd} 
          size={0.6}
          enabled={is3dAssemblyMode && isSelected}
          visible={is3dAssemblyMode && isSelected}
          showX={is3dAssemblyMode && isSelected}
          showY={is3dAssemblyMode && isSelected}
          showZ={is3dAssemblyMode && isSelected}
        />
      )}
      {content}
    </>
  );
}

/** Знімки одного виробу — один бланк візуалізації в PDF. */
export interface ProductSnapshots {
  productId: string;
  name: string;
  snapshots: string[];
}

function CaptureController({ onCaptureReady, onSceneReady, contentRef, preset = 'default', products = [] }: {
  onCaptureReady?: (snaps: string[], perProduct?: ProductSnapshots[]) => void,
  /** №179 — сцена зібрана (усі вироби змонтовані, текстури залиті): віддати її для GLB у пакет МЕС. */
  onSceneReady?: (content: THREE.Object3D) => void,
  contentRef: React.RefObject<THREE.Group | null>,
  /** Вироби проєкту — для посторінкової візуалізації (по одному бланку на виріб). */
  products?: Array<{ id: string; name: string }>,
  /**
   * 'default' — один ізометричний знімок для PDF розкрою (як було).
   * 'showcase' — три ракурси на БІЛОМУ фоні без осей і сірої підлоги:
   * клієнтська візуалізація для PDF прорахунку.
   */
  preset?: 'default' | 'showcase',
}) {
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    if (!onCaptureReady || !contentRef.current) return;

    let mounted = true;
    const timeout = setTimeout(() => { void captureNow(); }, 1000);

    /**
     * FG-08/SC-36, 24.08: якщо в момент знімка WebGL-контекст мертвий,
     * gl.render()/toDataURL() не кидають помилку — вони мовчки дають
     * порожній/чорний кадр, і PDF отримує порожню рамку без жодного
     * сліду в консолі. Тому чекаємо на живий контекст ПЕРЕД тим, як
     * щось знімати, а не рятуємось постфактум.
     */
    async function captureNow() {
      if (!mounted) return;
      const live = await waitForLiveContext(gl);
      if (!mounted) return;
      if (!live) {
        console.error('[WebGL] Контекст лишається втраченим — знімок для PDF пропущено (FG-08/SC-36).');
        onCaptureReady!([]);
        return;
      }

      /*
       * SC-36, СПРАВЖНЯ ПРИЧИНА (знайдена відтворенням 24.08): фіксована
       * пауза перед знімком знімала ПОРОЖНЮ сцену. Кожен виріб загорнутий
       * у <Suspense> і не з'являється в contentRef, поки його текстура
       * (фото слябу — data-URL на сотні КБ) не декодується і не заллється
       * в GPU. На проєктах зі слябом-фото це довше за секунду — і PDF
       * отримував три білі кадри. Старі проєкти без фото монтуються
       * миттєво, тому «на старому все ок».
       *
       * Тому чекаємо не час, а ФАКТ: у contentRef з'явились усі вироби
       * (children.length ≥ кількості виробів). Стеля 20с — далі знімаємо
       * що є, а якщо не з'явилось нічого — чесно повертаємо [] (QuotePanel
       * покаже попередження замість тихого порожнього PDF).
       */
      const expected = Math.max(products.length, 1);
      const CONTENT_TIMEOUT_MS = 20000;
      const POLL_MS = 150;
      let waited = 0;
      while (
        mounted &&
        (contentRef.current?.children.length ?? 0) < expected &&
        waited < CONTENT_TIMEOUT_MS
      ) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        waited += POLL_MS;
      }
      if (!mounted) return;
      const mountedChildren = contentRef.current?.children.length ?? 0;
      if (mountedChildren === 0) {
        console.error(`[CaptureController] Сцена порожня і через ${CONTENT_TIMEOUT_MS} мс — знімок пропущено (SC-36).`);
        onCaptureReady!([]);
        return;
      }
      if (mountedChildren < expected) {
        console.warn(`[CaptureController] Змонтовано ${mountedChildren} з ${expected} виробів за ${CONTENT_TIMEOUT_MS} мс — знімаю що є (SC-36).`);
      }
      // Два кадри очікування: перший рендер після монтажу + залиття текстур.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!mounted) return;

      // №179 — той самий момент «сцена готова», яким користуються знімки
      // для PDF; пакет МЕС бере звідси зібраний виріб для product.glb.
      if (onSceneReady && contentRef.current) onSceneReady(contentRef.current);

      const restore: Array<() => void> = [];
      try {
        const captures: string[] = [];
        const originalPos = camera.position.clone();
        const originalQuat = camera.quaternion.clone();
        const cam = camera as THREE.PerspectiveCamera;

        if (preset === 'showcase') {
          // Чистий білий фон: підлогу й осі ховаємо ЗОВСІМ — інакше сіра
          // площина 500×500 заповнює кадр із будь-якого ракурсу.
          const originalBackground = scene.background;
          scene.background = new THREE.Color('#ffffff');
          restore.push(() => { scene.background = originalBackground; });
          scene.traverse((object) => {
            if ((object.type === 'AxesHelper' || object.name === 'floor-plane') && object.visible) {
              object.visible = false;
              restore.push(() => { object.visible = true; });
            }
          });
        }

        /*
         * SC-36, друга половина причини: `Box3.setFromObject(група виробу)`
         * захоплював і TransformControls (гізмо «Рухати/Обертати» живе
         * всередині групи): його осьові лінії — геометрія на ~999 000
         * юнітів, навіть НЕВИДИМІ (setFromObject не пропускає visible=false).
         * Бокс роздувався до мільйона, камера відлітала — і кадр був чисто
         * білий. Тому бокс рахуємо САМІ: тільки видимі меші деталей,
         * пропускаючи піддерева хелперів.
         */
        const HELPER_TYPES = new Set([
          'TransformControls', 'TransformControlsRoot', 'TransformControlsGizmo',
          'TransformControlsPlane', 'AxesHelper', 'GridHelper',
        ]);
        const robustBoxOf = (root: THREE.Object3D) => {
          const box = new THREE.Box3();
          root.updateWorldMatrix(true, true);
          const visit = (object: THREE.Object3D) => {
            if (!object.visible || HELPER_TYPES.has(object.type)) return;
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry) {
              mesh.geometry.computeBoundingBox();
              const gb = mesh.geometry.boundingBox;
              if (gb && !gb.isEmpty()) box.union(gb.clone().applyMatrix4(mesh.matrixWorld));
            }
            object.children.forEach(visit);
          };
          visit(root);
          return box;
        };

        /** Кадр і центр за габаритами конкретного об'єкта сцени. */
        const frameOf = (target: THREE.Object3D | null) => {
          const center = new THREE.Vector3(0, 0, 0);
          let distance = 8;
          if (target) {
            const box = robustBoxOf(target);
            if (!box.isEmpty()) {
              box.getCenter(center);
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z, 0.5);
              distance = (maxDim / 2) / Math.tan(25 * Math.PI / 180) * 1.1;
            }
          }
          return { center, distance };
        };

        const shoot = (center: THREE.Vector3, distance: number, direction: [number, number, number]) => {
          const offset = new THREE.Vector3(...direction).normalize().multiplyScalar(distance * 1.15);
          cam.position.copy(center).add(offset);
          cam.lookAt(center);
          gl.render(scene, cam);
          return gl.domElement.toDataURL('image/jpeg', 1.0);
        };

        /** Три клієнтські ракурси одного об'єкта. */
        const showcaseAngles: Array<[number, number, number]> = [
          [1, 0.62, 1],      // ізометрія справа
          [-1, 0.55, 1],     // ізометрія зліва
          [0.08, 0.4, 1.3],  // фронт із легким підйомом
        ];

        const perProduct: ProductSnapshots[] = [];

        if (preset === 'showcase') {
          /*
           * ПОСТОРІНКОВА ВІЗУАЛІЗАЦІЯ (19.08, на прохання Богдана).
           *
           * Раніше знімався ВЕСЬ проєкт одним кадром: два вироби на одному
           * аркуші, кожен завбільшки з ніготь, а після кроку 5.1 (вироби
           * стоять рядком) — і поготів. Тепер кожен виріб знімається
           * ОКРЕМО: решта ховається, кадр будується по його власних
           * габаритах. У PDF на кожен виріб іде свій бланк.
           *
           * Групи виробів знайдені за іменем `product:<id>` — його ставить
           * ProductAssemblyWrapper.
           */
          const productGroups = new Map<string, THREE.Object3D>();
          scene.traverse((object) => {
            if (typeof object.name === 'string' && object.name.startsWith('product:')) {
              productGroups.set(object.name.slice('product:'.length), object);
            }
          });

          if (productGroups.size > 1) {
            const known = products.length
              ? products.filter((item) => productGroups.has(item.id))
              : Array.from(productGroups.keys()).map((id) => ({ id, name: '' }));

            known.forEach((item) => {
              const target = productGroups.get(item.id)!;
              // Ховаємо всі інші вироби — на кадрі рівно цей.
              const hidden: THREE.Object3D[] = [];
              productGroups.forEach((group, id) => {
                if (id !== item.id && group.visible) { group.visible = false; hidden.push(group); }
              });
              const { center, distance } = frameOf(target);
              const shots = showcaseAngles.map((angle) => shoot(center, distance, angle));
              hidden.forEach((group) => { group.visible = true; });
              perProduct.push({ productId: item.id, name: item.name, snapshots: shots });
            });
            // Перший виріб лишається у «плоскому» списку — сумісність зі
            // старим викликом, який чекає просто масив знімків.
            captures.push(...(perProduct[0]?.snapshots ?? []));
          } else {
            const { center, distance } = frameOf(contentRef.current);
            showcaseAngles.forEach((angle) => captures.push(shoot(center, distance, angle)));
            const only = products[0];
            perProduct.push({ productId: only?.id ?? 'single', name: only?.name ?? '', snapshots: [...captures] });
          }
        } else {
          const { center, distance } = frameOf(contentRef.current);
          const distIso = distance * 0.65;
          cam.position.set(distIso, distIso, distIso);
          cam.lookAt(0, 0, 0);
          gl.render(scene, cam);
          captures.push(gl.domElement.toDataURL('image/jpeg', 1.0));
        }

        restore.reverse().forEach((fn) => fn());
        cam.position.copy(originalPos);
        cam.quaternion.copy(originalQuat);
        gl.render(scene, cam);

        onCaptureReady!(captures, perProduct);
      } catch (e) {
        console.error('Capture failed:', e);
        restore.reverse().forEach((fn) => { try { fn(); } catch { /* вже відновлено */ } });
        onCaptureReady!([]);
      }
    }

    return () => { mounted = false; clearTimeout(timeout); };
  }, [gl, camera, scene, contentRef, onCaptureReady, preset, products]);
  return null;
}
/**
 * compact — значки замість підписів у панелі сцени. Вмикається просунутим
 * режимом (шапка) або «Сплітом», де панель удвічі вужча. Кнопки ті самі,
 * повна назва — у підказці; та сама мова, що на дошці 2D розкрою.
 */
export function Viewer3D({ className = "w-full h-full min-h-[500px] bg-[#f0f4f8] rounded-lg overflow-hidden relative", onCaptureReady, onSceneReady, isCaptureMode, hideToolbar = false, capturePreset = 'default', compact = false }: { className?: string, onCaptureReady?: (snaps: string[], perProduct?: ProductSnapshots[]) => void, onSceneReady?: (content: THREE.Object3D) => void, isCaptureMode?: boolean, hideToolbar?: boolean, capturePreset?: 'default' | 'showcase', compact?: boolean } = {}) {
  const project = useProjectStore((state) => state.project);
  // ПРИМІЩЕННЯ (01.09): опційний шар бази. Коли він увімкнений, один
  // виріб більше не центрується автоматично — рамку задає кімната.
  const room = project.room;
  const roomOn = Boolean(room?.visibleInAssembly && room?.solids.length);
  const parts = useProjectStore((state) => state.parts);
  const is3dGroupingEnabled = useUIStore(s => s.is3dGroupingEnabled);
  const selectedId = useUIStore(s => s.selectedId3d);
  const setSelectedId = useUIStore(s => s.setSelectedId3d);
  const contentRef = React.useRef<THREE.Group | null>(null);
  // №177 — поки 3D відкрите, збирач пакета для МЕС може взяти цю сцену
  // (кнопка «Зберегти для МЕС» живе у вкладці «Документи», не тут).
  useEffect(() => {
    const own = contentRef.current;
    registerArScene(own, project.orderNumber || '');
    return () => unregisterArScene(own);
  });
  const [isDragging, setIsDragging] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAnimationPrototype, setShowAnimationPrototype] = useState(false);
  
  const showEdges = useUIStore(s => s.showEdges);
  const isAdminUnlocked = useUIStore(s => s.isAdminUnlocked);
  const setShowEdges = useUIStore(s => s.setShowEdges);
  const is3dAssemblyMode = useUIStore(s => s.is3dAssemblyMode);
  const isBacklightMode = useUIStore(s => s.isBacklightMode);
  /*
   * №160: кнопка перемикає НАМІР, а сам режим у сторі (тобто підміну фото)
   * вмикає риґ у найтемнішій точці переходу — інакше фото стрибало б на
   * повному світлі. Кнопка підсвічується одразу, від наміру.
   */
  const [backlightIntent, setBacklightIntent] = useState(isBacklightMode);
  useEffect(() => { setBacklightIntent(isBacklightMode); }, [isBacklightMode]);
  const set3dAssemblyMode = useUIStore(s => s.set3dAssemblyMode);
  const set3dGroupingEnabled = useUIStore(s => s.set3dGroupingEnabled);
  const reset3dAssembly = useProjectStore(s => s.reset3dAssembly);

  /**
   * ЕКСПОРТ У ДОПОВНЕНУ РЕАЛЬНІСТЬ (27.08).
   *
   * Бере ту саму збірку, яку менеджер щойно склав, і кладе на диск два
   * файли: `.usdz` для айфона і `.glb` для Android. Далі їх можна просто
   * надіслати клієнту — він поставить виріб у себе на кухні в натуральну
   * величину.
   *
   * Поки що це саме ФАЙЛИ: посилання, яке клієнт відкриє одним дотиком,
   * потребує публічної сторінки повз наш вхід — питання до ІТ. Файли
   * працюють уже сьогодні й нічого не чекають.
   */
  const [arBusy, setArBusy] = useState(false);
  const [arNote, setArNote] = useState<string | null>(null);

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    // Звільняємо не одразу: Safari встигає почати завантаження не миттєво
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  /**
   * ЕКСПОРТ У SKETCHUP = ТОЙ САМИЙ GLB, ЩО ЇДЕ В AR.
   *
   * SketchUp з версії 2023 імпортує glTF/GLB нативно (File → Import →
   * .glb), з текстурами і матеріалами. Перша версія цієї кнопки віддавала
   * самописний COLLADA (.dae) — SketchUp 2025 з нього взяв одну плиту без
   * текстур. Самописку викинуто того ж дня: навіщо міст, коли є двері.
   * Шильдик «VIYAR STONE 3D» лишається і тут — файл гулятиме по
   * конструкторах і дизайнерах так само, як AR-модель по клієнтах.
   */
  const [skpBusy, setSkpBusy] = useState(false);

  const handleSketchupExport = async () => {
    if (!contentRef.current) return;
    setSkpBusy(true);
    setArNote(null);
    try {
      const name = project.products?.[0]?.name ?? 'Виріб';
      const result = await exportForAr(contentRef.current, {
        caption: 'VIYAR STONE 3D',
        subline: `AR · ${project.orderNumber || 'демо'}`,
      });
      downloadBlob(result.glb, arFileName(project.orderNumber, `${name}_sketchup`, 'glb'));
      setArNote(`SketchUp: ${result.sizeMm.x}×${result.sizeMm.z} мм, висота ${result.sizeMm.y} · у SketchUp: File → Import → тип файлу GLTF (.glb)`);
    } catch (error) {
      setArNote(`Не вийшло зібрати модель: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSkpBusy(false);
    }
  };

  const handleArExport = async () => {
    if (!contentRef.current) return;
    setArBusy(true);
    setArNote(null);
    try {
      const result = await exportForAr(contentRef.current, {
        caption: 'VIYAR STONE 3D',
        subline: `AR · ${project.orderNumber || 'демо'}`,
      });
      const productName = project.products?.[0]?.name ?? 'Виріб';
      downloadBlob(result.usdz, arFileName(project.orderNumber, productName, 'usdz'));
      downloadBlob(result.glb, arFileName(project.orderNumber, productName, 'glb'));
      setArNote(`Готово: ${result.sizeMm.x}×${result.sizeMm.z} мм, висота ${result.sizeMm.y} мм · usdz для iPhone, glb для Android`);
    } catch (error) {
      setArNote(`Не вийшло зібрати модель: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setArBusy(false);
    }
  };

  const groups = useMemo(() => {
     return buildAssemblyGroups(parts, project.placements, is3dGroupingEnabled, getAllProjectDetails(project));
  }, [project.placements, parts, is3dGroupingEnabled, project.details, project.products]);

  /*
   * КРОК 5.1 — розстановка виробів.
   *
   * Габарити головних деталей → детермінований дефолтний ряд і перевірка
   * перетинів. Все в мм; той самий проєкт дає ту саму картинку.
   */
  const sceneItems = useMemo(() => (project.products ?? []).map((product) => {
    const rootId = product.elements?.[0]?.id;
    const mainPart = rootId ? parts.find((part) => part.detailId === rootId && part.isMain) : undefined;
    return {
      productId: product.id,
      widthMm: mainPart?.width ?? 1000,
      depthMm: mainPart?.height ?? 600,
    };
  }), [project.products, parts]);

  const defaultSlots = useMemo(() => defaultSceneLayout(sceneItems), [sceneItems]);

  const collidingIds = useMemo(() => collidingSceneProducts(
    sceneItems.map((item) => {
      const product = (project.products ?? []).find((candidate) => candidate.id === item.productId);
      const placement = product?.scenePlacement
        ?? defaultSlots[item.productId]
        ?? { x: 0, z: 0, rotationYDeg: 0 };
      return { ...item, placement };
    }),
  ), [sceneItems, project.products, defaultSlots]);

  /* Shift = точне доведення без прив'язки 50 мм / 15°. */
  const [snapFree, setSnapFree] = useState(false);
  React.useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.key === 'Shift') setSnapFree(true); };
    const up = (event: KeyboardEvent) => { if (event.key === 'Shift') setSnapFree(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  /*
   * <Center> лишається ЛИШЕ для сцени з одним виробом (звична картинка).
   * Для кількох — позиція тільки з даних: центрування пересувало б вироби
   * під час перетягування, і розставлене «пливло» б само собою.
   */
  const multiProduct = (project.products ?? []).length > 1;

  return (
    <div className={`${className} flex flex-col`}>
      {!isCaptureMode && !hideToolbar && (
        <div className="toolbar shrink-0 bg-white border-b border-slate-300 p-2 z-10 shadow-sm relative">
          <div className="segmented">
            <button
              className={is3dAssemblyMode ? 'active' : ''}
              title="Режим збірки: виріб можна рухати й обертати на сцені"
              onClick={() => set3dAssemblyMode(!is3dAssemblyMode)}
            >
              {compact ? <Blocks className="w-4 h-4" /> : 'Режим збірки'}
            </button>
            <button
              className={is3dGroupingEnabled ? 'active' : ''}
              disabled={!is3dAssemblyMode}
              title="Групувати деталі: виріб рухається цілком, а не по одній деталі"
              onClick={() => set3dGroupingEnabled(!is3dGroupingEnabled)}
            >
              {compact ? <Group className="w-4 h-4" /> : 'Групувати деталі'}
            </button>
            <button
              className={showEdges ? 'active' : ''}
              title="Показувати контури деталей на сцені"
              onClick={() => setShowEdges(!showEdges)}
            >
              {compact ? <Frame className="w-4 h-4" /> : 'Показувати контури'}
            </button>
            {/* Кнопка з'являється лише якщо в проєкті є сляб із фото підсвітки —
                щоб не плутати там, де просвітного каменю немає. */}
            {project.slabs.some((s: any) => !!s.photoBacklit) && (
              <button
                className={backlightIntent ? 'active !bg-amber-500 !text-white' : ''}
                onClick={() => setBacklightIntent((prev) => !prev)}
                title="Підсвітка: показати камінь із підсвіткою (просвітний камінь)"
              >
                {compact
                  ? <Lightbulb className="w-4 h-4" />
                  : <><Lightbulb className="w-3.5 h-3.5 inline-block mr-1.5 align-middle" />Підсвітка</>}
              </button>
            )}
            {/* Анімація і скидання збірки — інструменти супер-адміна
                (щит у шапці, PIN): прототип не для менеджерів, а скидання
                руйнівне для розставленої збірки */}
            {isAdminUnlocked && (
              <button
                className={showAnimationPrototype ? 'active !bg-purple-600 !text-white' : ''}
                title="Анімація обробки (прототип)"
                onClick={() => setShowAnimationPrototype(!showAnimationPrototype)}
              >
                {compact ? <Clapperboard className="w-4 h-4" /> : '🎬 Анімація (Прототип)'}
              </button>
            )}
            <button
              className={roomOn ? 'active !bg-[#0084ff] !text-white' : ''}
              title={room?.solids.length
                ? (roomOn ? 'Сховати приміщення' : 'Показати приміщення (базу) на сцені')
                : 'Спершу намалюй приміщення у вкладці «Приміщення»'}
              disabled={!room?.solids.length}
              onClick={() => room && useProjectStore.getState().updateProject({ room: { ...room, visibleInAssembly: !room.visibleInAssembly } })}
            >
              {compact ? <Home className="w-4 h-4" /> : '🏠 Приміщення'}
            </button>
            <button
              title="Зібрати модель для телефона: виріб у натуральну величину на кухні клієнта (usdz для iPhone, glb для Android)"
              disabled={arBusy}
              onClick={handleArExport}
            >
              {arBusy
                ? <ArSpinner className={`w-4 h-4 animate-spin inline-block${compact ? '' : ' mr-1.5'}`} />
                : compact && <Smartphone className="w-4 h-4" />}
              {!compact && (arBusy ? 'Збираю…' : 'AR для телефона')}
            </button>
            <button
              title="Експорт у SketchUp: файл .glb, який SketchUp відкриває сам — File → Import, тип GLTF (.glb). Текстури всередині"
              disabled={skpBusy}
              onClick={handleSketchupExport}
            >
              {skpBusy
                ? <ArSpinner className={`w-4 h-4 animate-spin inline-block${compact ? '' : ' mr-1.5'}`} />
                : compact && <DraftingCompass className="w-4 h-4" />}
              {!compact && (skpBusy ? 'Збираю…' : 'SketchUp')}
            </button>
            <button title="Інструкція: як рухати виріб і збирати сцену" onClick={() => setShowHelp(true)}>
              {compact ? <BookOpen className="w-4 h-4" /> : 'Інструкція'}
            </button>
            {isAdminUnlocked && (
              <button title="Скинути збірку: повернути всі деталі на площину" onClick={() => {
                useUIStore.getState().showConfirm({
                  title: 'Скинути збірку',
                  message: 'Ви впевнені, що хочете скинути всі 3D координати і повернути деталі на площину?',
                  confirmText: 'Скинути',
                  isDestructive: true,
                  onConfirm: () => reset3dAssembly()
                });
              }}>{compact ? <RotateCcw className="w-4 h-4" /> : 'Скинути збірку'}</button>
            )}
          </div>
          {arNote && (
            <div className="mt-2 text-[12px] px-2.5 py-1.5 rounded bg-slate-100 text-slate-700 flex items-center gap-2">
              <span className="flex-1">{arNote}</span>
              <button type="button" className="opacity-60 hover:opacity-100" onClick={() => setArNote(null)}>✕</button>
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        {/* ОДНЕ СЕРЕДОВИЩЕ НА ВСЮ ПРОГРАМУ (26.08, зауваження власника:
            «в одному середовищі 2 різні кіна»). Сцена збірки тепер живе в
            тих самих умовах, що 3D у редакторі деталі (Detail3DPreview):
            світлий фон #f0f4f8, спільне світло `SceneLighting`, нескінченна
            сітка замість сірої підлоги, осі 5. Виняток — режим підсвітки:
            підсвічений камінь дивляться на темному тлі.
            №166: тіні повернулись, але не ті жорсткі чорні, через які їх
            свого часу вимкнули: приймач — прозора площина з м'якою тінню
            (opacity 0.26, PCFSoft), а не сіра підлога. */}
        <Canvas
          camera={{ position: [0, 5, 8], fov: 50 }}
          shadows
          onPointerMissed={() => { setSelectedId(null); useUIStore.getState().setSelectedProductId3d(null); }}
          onCreated={(state) => {
            /*
             * №166: тонмапінг Neutral замість ACES — ACES тисне світле і зводить
             * колір каменю. Ставимо ОДИН раз тут, а не пропом `gl={{…}}`: проп
             * React вписує назад при кожному перемальовуванні, і BacklightRig не
             * може зняти тонмапінг на піку підсвітки (№164). Перевірено виміром
             * 09.09: з пропом на піку в сцені лишався Neutral замість «без
             * обробки», і риґ на це ніяк не впливав.
             */
            state.gl.toneMapping = THREE.NeutralToneMapping;
            state.gl.toneMappingExposure = 0.9;
            attachContextLossRecovery(state.gl.domElement);
            // Дев-ручка камери Підбору — та сама угода, що __vs3dPreview у
            // редакторі: автотести ставлять камеру точно, без сліпих драгів.
            (window as unknown as { __vs3dAssembly?: unknown }).__vs3dAssembly = state;
          }}
        >
          {/* №160: колір фону веде BacklightRig (плавно). Тут — базовий світлий,
              від якого риґ і рахує затемнення. */}
          <color attach="background" args={['#f0f4f8']} />
          <BacklightRig
            on={backlightIntent}
            onSwap={(next) => useUIStore.getState().setBacklightMode(next)}
          />

          {/* №166: одне світло на всю програму — див. SceneLighting.tsx.
              ТІНЬ ПОКИ ВИМКНЕНА (groundY не задано), і це виміряний висновок,
              а не забудькуватість: стільниця в сцені стоїть на висоті 900 мм
              (bbox 0.90…0.92), підлога — нуль, сітка намальована на -0.5.
              Проміжку нічим заповнити: тумб і ніг сцена не малює. Тінь від
              спрямованого світла на такій відстані виходить різкою і читається
              як окремий сірий прямокутник, а не як тінь. Вмикається одним
              `groundY={0}`, щойно під виробом з'явиться на що її класти. */}
          <SceneLighting preset="assembly" />

          {/* disableY: центруємо лише по X/Z. Інакше <Center> скидає висоту встановлення
              (elevation) і виріб завжди лягає в нуль. Для КІЛЬКОХ виробів
              центрування вимкнене повністю (крок 5.1) — позиція з даних. */}
          {roomOn && room && <RoomSolids room={room} ghost />}
          <MaybeCenter enabled={!multiProduct && !roomOn}>
            {showAnimationPrototype ? (
              <MachineAnimationPrototype detailPart={parts[0]} />
            ) : (
              <group ref={contentRef}>
                {project.products.map((product) => (
                  <Suspense key={product.id} fallback={null}>
                    <ProductAssemblyWrapper 
                      product={product}
                      parts={parts}
                      placements={project.placements}
                      slabs={project.slabs}
                      textureLayouts={project.textureLayouts}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      setIsDragging={setIsDragging}
                      defaultSlot={defaultSlots[product.id]}
                      colliding={collidingIds.has(product.id)}
                      snapFree={snapFree}
                    />
                  </Suspense>
                ))}
              </group>
            )}
          </MaybeCenter>


          {/* Сітка та сама, що в редакторі деталі. name="floor-plane"
              збережено: захоплення знімків для PDF ховає об'єкт саме за
              цим іменем, як ховало сіру підлогу. */}
          <Grid
            name="floor-plane"
            position={[0, -0.5, 0]}
            infiniteGrid
            fadeDistance={30}
            cellColor="#d1d5db"
            sectionColor="#9ca3af"
            cellThickness={0.5}
            sectionThickness={1}
            raycast={() => null}
          />
          <axesHelper args={[5]} position={[0, -0.49, 0]} />
          <OrbitControls 
            makeDefault 
            minPolarAngle={0} 
            maxPolarAngle={Math.PI / 2.1} 
            enabled={!isDragging}
            mouseButtons={{ LEFT: THREE.MOUSE.NONE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }}
            // Дотик — як заведено в мобільних 3D: один палець крутить сцену,
            // щипок наближає, два пальці тягнуть. Раніше один палець не робив
            // нічого, і на телефоні сцену неможливо було покрутити. Перетягування
            // виробу за стрілки не конфліктує: на час drag камера вимкнена
            // (enabled={!isDragging}), а сам тап без руху обертання не запускає.
            touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
          />
          {isCaptureMode && (
            <CaptureController
              onCaptureReady={onCaptureReady}
              onSceneReady={onSceneReady}
              contentRef={contentRef}
              preset={capturePreset}
              products={(project.products ?? []).map((item) => ({ id: item.id, name: item.name }))}
            />
          )}
        </Canvas>
      </div>

      {showHelp && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-6 max-w-md w-full text-slate-200">
            <h3 className="text-xl font-bold text-white mb-4">Управління 3D збіркою</h3>
            <ul className="space-y-3 mb-6 text-sm">
              <li><strong className="text-blue-400">Ліва кнопка миші:</strong> Виділення та перетягування деталей. Камера при цьому <b>не обертається</b>.</li>
              <li><strong className="text-blue-400">Середня кнопка (коліщатко):</strong> Обертання камери (Orbit).</li>
              <li><strong className="text-blue-400">Права кнопка миші:</strong> Переміщення камери (Pan).</li>
              <li><strong className="text-blue-400">Скролл коліщатка:</strong> Наближення / віддалення (Zoom).</li>
              <li className="pt-2 border-t border-slate-700 mt-2"><strong className="text-slate-300">Тачпад (Ноутбук):</strong></li>
              <li>Два пальці: Обертання камери.</li>
              <li>Щипок двома пальцями: Наближення (Zoom).</li>
            </ul>
            <div className="flex justify-end">
              <button 
                onClick={() => setShowHelp(false)} 
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded font-medium text-white transition-colors"
              >
                Зрозуміло
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
