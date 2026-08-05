import  { useMemo } from 'react';
import * as THREE from 'three';
import type { ProductElement } from '../../domain/types';
import { Detail3DNode } from '../ui/Detail3DPreview';
import { buildDetailShape, getDetailPointsAndBounds } from '../../engines/shapeBuilder';
import { getEdgeTransform } from '../../engines/transform3d';
import { getSinkPartTransform } from '../../engines/sinkAssembly';

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

  // У дереві Виробу підворот/потовщення — це окремі Елементи (element.additions),
  // і вони малюються нижче. Detail3DNode уміє малювати їх ще й зі старої властивості
  // detail.fold/thickening — тому тут її глушимо, інакше отримаємо подвоєння зі зміщенням.
  // (У 3D Редакторі legacy-шлях лишається робочим — там свій компонент.)
  const detailForNode = useMemo(() => ({
    ...detail,
    fold: detail?.fold ? { ...detail.fold, enabled: false } : detail?.fold,
    thickening: detail?.thickening ? { ...detail.thickening, enabled: false } : detail?.thickening,
  }), [detail]);

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
    const sinkDef = (detail as { sinks?: Record<string, { x: number; y: number }> })?.sinks?.[slot.slice('sink_'.length)];
    if (!sinkDef) return null;
    const s = 0.001;
    const w = (bounds.maxX - bounds.minX) || 1;
    const h = (bounds.maxY - bounds.minY) || 1;
    const thick = (detail.thickness || 20) * s;
    return (
      <group key={addition.id} position={[(sinkDef.x - w / 2) * s, -thick / 2, (sinkDef.y - h / 2) * s]}>
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

          const geom = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 24 });
          geom.scale(pw * s, ph * s, 1);
          geom.translate((-pw * s) / 2, (-ph * s) / 2, -thick / 2);
          // rotateX(-π/2): «низ» деталі в 2D → -Z сцени — рівно та сама
          // орієнтація, що в SinkAssemblyPreview, під яку виміряні пози/кути.
          geom.rotateX(-Math.PI / 2);
          geom.computeVertexNormals();

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

          const geom = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 32 });
          geom.scale(pw * s, ph * s, 1);
          geom.translate((-pw * s) / 2, (-ph * s) / 2, -thick / 2);

          // Центр сегмента в системі елемента (мм → одиниці сцени).
          const cx = ((p.textureOffsetX ?? 0) + minX + pw / 2) * s - (elW * s) / 2;
          const cz = ((p.textureOffsetY ?? 0) + minY + ph / 2) * s - (elH * s) / 2;
          const tex = textureForPart ? textureForPart(p) : null;

          return (
            <mesh
              key={p.id}
              geometry={geom}
              castShadow
              receiveShadow
              position={[cx, 0, cz]}
              rotation={[Math.PI / 2, 0, 0]}
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
          const edgeId = (() => {
            let best = -1;
            let res = additionSlot;
            for (const t of ['wall_panel', 'skirting', 'fold', 'thickening', 'leg']) {
              const i = additionSlot.lastIndexOf(t + '_');
              if (i > best) { best = i; res = additionSlot.slice(i + t.length + 1); }
            }
            return res || undefined;
          })();
          if (!edgeId) return null;

          const segment = lineSegments.find((seg) => seg.id === edgeId);
          if (!segment) return null;

          const attachmentKind: 'up' | 'down' | 'fold' =
            additionSlot.includes('leg_') ? 'down'
            : additionSlot.includes('fold_') ? 'fold'
            : 'up';

          const transform = getEdgeTransform(
            segment.curve.v1,
            segment.curve.v2,
            bounds,
            detail.thickness || 20,
            addition.baseDefinition.width,
            addition.baseDefinition.height || 600,
            0,
            attachmentKind
          );

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
        const edgeId = (() => {
          let best = -1;
          let res = additionSlot;
          for (const t of ['wall_panel', 'skirting', 'fold', 'thickening', 'leg']) {
            const i = additionSlot.lastIndexOf(t + '_');
            if (i > best) { best = i; res = additionSlot.slice(i + t.length + 1); }
          }
          return res || undefined;
        })();
        
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
        
        let attachOffset = 0;
        // In the old implementation, Wall panels and legs had explicit 'offset' or 'importOffsetX'.
        // For ProductElement, maybe we can pass an offset? Or default to 0.
        
        // Тип прив'язки визначає напрямок: нога і підворот звисають вниз,
        // панель і бортик стоять угору. Формули — ті самі, що в 3D Редакторі.
        const slot = addition.id.split(':').pop() || '';
        const attachmentKind: 'up' | 'down' | 'fold' =
          slot.includes('leg_') ? 'down'
          : slot.includes('fold_') ? 'fold'
          : 'up';

        const transform = getEdgeTransform(
          segment.curve.v1,
          segment.curve.v2,
          bounds,
          detail.thickness || 20,
          attachWidth,
          attachHeight,
          attachOffset,
          attachmentKind
        );

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
                />
             </group>
          </group>
        );
      })}
    </group>
  );
}
