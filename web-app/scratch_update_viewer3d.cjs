const fs = require('fs');
let content = fs.readFileSync('src/components/3d/Viewer3D.tsx', 'utf8');

// 1. Imports
content = content.replace(
  "import { useDetailShape, ProductAssemblyNode } from '../ui/Detail3DPreview';",
  "import { ProductElement3DNode } from './ProductElement3DNode';"
);
content = content.replace("import { draftFromDetail } from '../forms/utils/draftHelpers';\n", "");
content = content.replace("import type { DetailDraft } from '../forms/utils/draftHelpers';\n", "");

// 2. Replace the whole wrapper
const startStr = 'function DetailAssemblyWrapper(';
const endStr = 'function MachineAnimationPrototype(';
const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

const newWrapperCode = `function ProductAssemblyWrapper({ 
  product, 
  parts, 
  placements, 
  slabs, 
  textureLayouts, 
  selectedId, 
  onSelect, 
  setIsDragging 
}: any) {
  const [group, setGroup] = React.useState<THREE.Group | null>(null);
  const transformMode = useUIStore(s => s.transformMode);
  const is3dAssemblyMode = useUIStore(s => s.is3dAssemblyMode);
  const updatePlacement3dTransform = useProjectStore(s => s.updatePlacement3dTransform);

  const uniqueUrls = React.useMemo(() => {
    const urls = new Set<string>();
    const productParts = parts.filter((p: any) => p.detailId.startsWith(product.id) && p.isMain);
    productParts.forEach((part: any) => {
      const placement = placements.find((pl: any) => pl.partId === part.id);
      if (placement) {
        const slab = slabs.find((s: any) => s.id === placement.slabId);
        if (slab?.photo) urls.add(slab.photo);
      }
    });
    return Array.from(urls);
  }, [product, parts, placements, slabs]);

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

  const textureFactory = (dId: string) => {
    const part = parts.find((p: any) => p.detailId === dId && p.isMain);
    if (!part) return null;
    
    const layout = textureLayouts.find((l: any) => l.partId === part.id);
    const placement = placements.find((pl: any) => pl.partId === part.id);
    if (!placement) return null;
    
    const slab = slabs.find((s: any) => s.id === placement.slabId);
    if (!slab) return null;

    const baseTex = textureMap.get(slab.photo || fallbackUrl);
    if (!baseTex) return null;

    const clone = baseTex.clone();
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    
    const sourceRot = layout?.sourceRotation ?? layout?.rotation ?? 0;
    const sourceX = layout?.sourceX ?? layout?.x ?? 0;
    const sourceY = layout?.sourceY ?? layout?.y ?? 0;
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
    clone.needsUpdate = true;
    return clone;
  };

  const mainElement = product.elements[0];
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

  const savedTransform = mainPlacement?.transform3d ?? mainPlacement?.assemblyTransform;
  const position = savedTransform ? [savedTransform.x, savedTransform.y, savedTransform.z] : [initialX, initialY, initialZ];
  const rotation = savedTransform ? [savedTransform.rx, savedTransform.ry, savedTransform.rz] : [0, 0, 0];
  
  const isSelected = mainPlacement && selectedId === mainPlacement.id;
  
  const handleDragEnd = () => {
    if (!group || !mainPlacement) return;
    const pos = group.position;
    const rot = group.rotation;
    updatePlacement3dTransform(mainPlacement.id, { x: pos.x, y: pos.y, z: pos.z, rx: rot.x, ry: rot.y, rz: rot.z });
  };

  return (
    <>
      {group && mainPlacement && (
        <TransformControls 
          object={group}
          mode={transformMode as any}
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
      <group 
        position={position as any} 
        rotation={rotation as any} 
        ref={setGroup as any}
        onClick={(e) => {
          if (is3dAssemblyMode && mainPlacement) {
            e.stopPropagation();
            onSelect(mainPlacement.id);
          }
        }}
      >
        <ProductElement3DNode 
          element={mainElement}
          customTextureMapFactory={textureFactory}
          position={[0, 0, 0]}
        />
      </group>
    </>
  );
}

`;

content = content.substring(0, startIndex) + newWrapperCode + content.substring(endIndex);

// 3. Replace usage map
content = content.replace(
  "{project.details.filter(d => !d.parentDetailId).map((detail) => (",
  "{project.products.map((product) => ("
);
content = content.replace(
  /<DetailAssemblyWrapper[\s\S]*?parts=\{parts\}[\s\S]*?placements=\{project\.placements\}[\s\S]*?slabs=\{project\.slabs\}[\s\S]*?\/>/,
  `<ProductAssemblyWrapper 
                      product={product}
                      parts={parts}
                      placements={project.placements}
                      slabs={project.slabs}
                      textureLayouts={project.textureLayouts}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      setIsDragging={setIsDragging}
                    />`
);
content = content.replace(/key=\{detail\.id\}/, "key={product.id}");

fs.writeFileSync('src/components/3d/Viewer3D.tsx', content);
console.log('Viewer3D updated flawlessly');
