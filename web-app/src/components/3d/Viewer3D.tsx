import React, { Suspense, useMemo, useState, useEffect, useLayoutEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, Center, ContactShadows, TransformControls , useTexture } from '@react-three/drei';
import type { Placement, DetailPart, SlabInstance, Detail } from '../../domain/types';
import * as THREE from 'three';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';

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

function TexturedPart({ placement, part, slab, parts, isSelected, onSelect, originOffset = [0, 0, 0], localTransform }: { placement: Placement; part: DetailPart; slab: SlabInstance; parts: DetailPart[]; isSelected?: boolean; onSelect?: () => void; originOffset?: [number, number, number]; localTransform?: { pos: [number, number, number], quat: THREE.Quaternion, hidden?: boolean } | null }) {
  if (localTransform?.hidden) return null;

  const s = 0.001;
  const thickness = slab?.thickness ? slab.thickness * s : 0.02;

  const textureLayouts = useProjectStore((state) => state.project.textureLayouts);
  const layout = textureLayouts.find((l) => l.partId === part.id);
  const sourceX = layout?.sourceX ?? layout?.x ?? 0;
  const sourceY = layout?.sourceY ?? layout?.y ?? 0;

  let posX = ((layout?.x ?? placement.x) + part.width / 2) * s;
  let posZ = ((layout?.y ?? placement.y) + part.height / 2) * s;
  let posY = thickness / 2;
  let quaternion = new THREE.Quaternion();

  if (!localTransform && !part.isMain && (part.edgeKind === 'fold' || part.edgeKind === 'thickening')) {
    const mainPart = parts.find((p) => p.parentLabel === part.parentLabel && p.isMain);
    const mainLayout = mainPart ? textureLayouts.find((l) => l.partId === mainPart.id) : null;
    
    if (mainPart && mainLayout && part.edgeSide) {
      let start = { x: 0, y: 0 };
      let end = { x: 0, y: 0 };
      
      const segmentIndexes: Record<string, Record<string, number>> = {
        'Прямокутна': { B: 0, C: 1, D: 2, A: 3 },
        'Г-подібна': { B: 0, C: 1, D: 2, E: 3, F: 4, A: 5 },
        'П-подібна': { B: 0, C: 1, D: 2, E: 3, F: 4, G: 5, H: 6, A: 7 },
      };
      
      const index = segmentIndexes[mainPart.shape]?.[part.edgeSide];
      if (index !== undefined && mainPart.points && mainPart.points.length > index) {
        start = mainPart.points[index];
        end = mainPart.points[(index + 1) % mainPart.points.length];
      } else {
        const w = mainPart.width;
        const h = mainPart.height;
        if (part.edgeSide === 'A') { start = { x: 0, y: h }; end = { x: 0, y: 0 }; }
        else if (part.edgeSide === 'B') { start = { x: 0, y: 0 }; end = { x: w, y: 0 }; }
        else if (part.edgeSide === 'C') { start = { x: w, y: 0 }; end = { x: w, y: h }; }
        else if (part.edgeSide === 'D') { start = { x: w, y: h }; end = { x: 0, y: h }; }
      }

      const P1x = (mainLayout.x + start.x) * s;
      const P1z = (mainLayout.y + start.y) * s;
      const P2x = (mainLayout.x + end.x) * s;
      const P2z = (mainLayout.y + end.y) * s;

      const edgeCenter = { x: (P1x + P2x) / 2, z: (P1z + P2z) / 2 };
      const dx = P2x - P1x;
      const dz = P2z - P1z;
      const len = Math.hypot(dx, dz);
      const dirX = len > 0 ? dx / len : 0;
      const dirZ = len > 0 ? dz / len : 0;

      const inward = { x: -dirZ, z: dirX };
      const outward = { x: dirZ, z: -dirX };
      const W = Math.min(part.width, part.height) * s;
      const epsilon = 0.001; // 1mm offset to prevent Z-fighting and hide extruded sides

      if (part.edgeKind === 'fold') {
        posX = edgeCenter.x + inward.x * (thickness / 2 - epsilon);
        posZ = edgeCenter.z + inward.z * (thickness / 2 - epsilon);
        posY = thickness - W / 2 - epsilon;
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(outward.x, 0, outward.z));
      } else if (part.edgeKind === 'thickening') {
        posX = edgeCenter.x + inward.x * (W / 2);
        posZ = edgeCenter.z + inward.z * (W / 2);
        posY = 0;
      }
    }
  }

  const photoUrl = slab?.photo;
  const fallbackUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  const texture = useTexture(photoUrl || fallbackUrl);
  
  const { clone: clonedTexture, sideClone } = useMemo(() => {
    if (!texture || !photoUrl || !slab) return { clone: null, sideClone: null };
    
    const clone = texture.clone();
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

  const { geometry, baseQuaternion } = useMemo(() => {
    const shape = new THREE.Shape();
    const points = part.points || [
      { x: 0, y: 0 },
      { x: part.width, y: 0 },
      { x: part.width, y: part.height },
      { x: 0, y: part.height }
    ];
    
    points.forEach((p: any, i: number) => {
      const nx = p.x / part.width;
      const ny = p.y / part.height;
      if (i === 0) shape.moveTo(nx, ny);
      else shape.lineTo(nx, ny);
    });

    if (part.holes) {
      part.holes.forEach((hole: any) => {
        if (!hole || !Array.isArray(hole)) return;
        const holePath = new THREE.Path();
        hole.forEach((p: any, i: number) => {
          const nx = p.x / part.width;
          const ny = p.y / part.height;
          if (i === 0) holePath.moveTo(nx, ny);
          else holePath.lineTo(nx, ny);
        });
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
  }, [part, thickness, s, layout, sourceX, sourceY, slab]);

  const localPosOffset = localTransform?.pos;
  const localQuaternion = localTransform?.quat;
  
  if (localTransform?.hidden) return null;
  
  // Combine base layout rotation with any edge-specific rotation
  const finalQuaternion = quaternion.clone().multiply(baseQuaternion);
  
  const meshPos: [number, number, number] = localPosOffset ? [localPosOffset[0], localPosOffset[1], localPosOffset[2]] : [posX - 1.5 - originOffset[0], posY - originOffset[1], posZ - 0.8 - originOffset[2]];
  

  return (
    <mesh
      castShadow
      receiveShadow
      geometry={geometry}
      position={meshPos}
      quaternion={localQuaternion || finalQuaternion}
      onClick={(e) => {
        if (onSelect) {
          e.stopPropagation();
          onSelect();
        }
      }}
    >
      {clonedTexture ? (
        <>
          <meshStandardMaterial 
            attach="material-0"
            map={clonedTexture} 
            roughness={0.1} 
            emissive={isSelected ? new THREE.Color(0x3b82f6) : new THREE.Color(0x000000)}
            emissiveIntensity={isSelected ? 0.3 : 0}
          />
          <meshStandardMaterial 
            attach="material-1"
            map={sideClone || clonedTexture} 
            roughness={0.1} 
            emissive={isSelected ? new THREE.Color(0x3b82f6) : new THREE.Color(0x000000)}
            emissiveIntensity={isSelected ? 0.3 : 0}
          />
        </>
      ) : (
        <>
          <meshStandardMaterial attach="material-0" color="#f8fafc" roughness={0.1} />
          <meshStandardMaterial attach="material-1" color="#e2e8f0" roughness={0.1} />
        </>
      )}
    </mesh>
  );
}

function getSinkPartTransform(part: DetailPart, detail: Detail | undefined, thickness: number) {
  if (!detail) return null;
  const s = 0.001;
  const g = detail.geometry || {};
  const isSlot = g.sinkKind === 'slot';
  
  const L = (g.width ?? (isSlot ? 550 : 500)) * s;
  const W = (g.height ?? 400) * s;
  const D = (g.innerVertical ?? (isSlot ? 100 : 200)) * s;
  const T = thickness;
  
  const name = part.name.toLowerCase();
  
  if (part.textureIrrelevant) return { hidden: true };
  
  let pos: [number, number, number] | undefined;
  let quat: THREE.Quaternion | undefined;
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');

  if (isSlot) {
      const slope = 0.006; // 6mm slope
      
      if (name.includes('нахилене дно')) {
          const angle = Math.atan2(slope, W - 0.072);
          euler.set(-angle, 0, 0);
          pos = [0, -D + T/2 - slope/2, 0.036];
      } else if (name.includes('трап')) {
          pos = [0, -D + T/2 - slope, -W/2 + 0.039];
      } else if (name.includes('стінка біля трапа')) {
          euler.set(-Math.PI/2, 0, 0);
          pos = [0, -D + T/2 - slope/2, -W/2 + 0.072];
      } else if (name.includes('ліва боковина')) {
          euler.set(0, 0, Math.PI/2);
          pos = [-L/2 - T/2, -D/2, 0];
      } else if (name.includes('права боковина')) {
          euler.set(0, 0, -Math.PI/2);
          pos = [L/2 + T/2, -D/2, 0];
      } else if (name.includes(' 3. боковина') || (name.includes('боковина') && !name.includes(' 7.') && !name.includes('ліва') && !name.includes('права'))) {
          // back wall
          euler.set(-Math.PI/2, 0, 0);
          pos = [0, -D/2, -W/2 - T/2];
      } else if (name.includes(' 7. боковина') || name.includes('передня')) {
          // front wall
          euler.set(Math.PI/2, 0, 0);
          pos = [0, -D/2, W/2 + T/2];
      }
  } else {
      if (name.includes('задня стінка')) {
          euler.set(-Math.PI/2, 0, 0);
          pos = [0, -D/2, -W/2 - T/2];
      } else if (name.includes('передня стінка')) {
          euler.set(Math.PI/2, 0, 0);
          pos = [0, -D/2, W/2 + T/2];
      } else if (name.includes('ліва бокова')) {
          euler.set(0, 0, Math.PI/2);
          pos = [-L/2 - T/2, -D/2, 0];
      } else if (name.includes('права бокова')) {
          euler.set(0, 0, -Math.PI/2);
          pos = [L/2 + T/2, -D/2, 0];
      } else if (name.includes('трикутник')) {
          if (name.includes('задній')) { euler.set(0, Math.PI, 0); pos = [0, -D + T/2, -W/4]; }
          else if (name.includes('передній')) { euler.set(0, Math.PI, 0); pos = [0, -D + T/2, W/4]; }
          else if (name.includes('лівий')) { euler.set(0, 0, 0); pos = [-L/4, -D + T/2, 0]; }
          else if (name.includes('правий')) { euler.set(0, 0, 0); pos = [L/4, -D + T/2, 0]; }
      } else if (name.includes('кругла')) {
          pos = [0, -D + T/2 + 0.001, 0];
      }
  }

  if (pos) {
      quat = new THREE.Quaternion().setFromEuler(euler);
      return { pos, quat };
  }
  
  return null;
}

function AssemblyGroup({ mainPlacement, mainPart, foldPlacements, parts, slabs, selectedId, onSelect, isSink }: any) {
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const is3dAssemblyMode = useUIStore(s => s.is3dAssemblyMode);
  const transformMode = useUIStore(s => s.transformMode);
  const updatePlacement3dTransform = useProjectStore(s => s.updatePlacement3dTransform);
  
  const textureLayouts = useProjectStore(s => s.project.textureLayouts);
  const details = useProjectStore(s => s.project.details);
  const detail = isSink ? details.find((d: Detail) => d.id === mainPart.detailId) : null;
  
  const layout = textureLayouts.find((l) => l.partId === mainPart.id);
  const s = 0.001;
  const mainSlab = slabs.find((s: SlabInstance) => s.id === mainPlacement.slabId);
  const thickness = mainSlab?.thickness ? mainSlab.thickness * s : 0.02;
  
  const initialX = ((layout?.x ?? mainPlacement.x) + mainPart.width / 2) * s - 1.5;
  const initialY = thickness / 2;
  const initialZ = ((layout?.y ?? mainPlacement.y) + mainPart.height / 2) * s - 0.8;

  const transform = mainPlacement.transform3d;
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

  const content = (
    <group position={position} rotation={rotation} ref={setGroup}>
      <Suspense fallback={null}>
        <TexturedPart 
          placement={mainPlacement} 
          part={mainPart} 
          slab={mainSlab} 
          parts={parts} 
          isSelected={isSelected}
          onSelect={select}
          originOffset={originOffset}
          localTransform={isSink ? getSinkPartTransform(mainPart, detail, thickness) : null}
        />
      </Suspense>
      {foldPlacements.map((fp: Placement) => {
         const fPart = parts.find((p: DetailPart) => p.id === fp.partId);
         const fSlab = slabs.find((s: SlabInstance) => s.id === fp.slabId);
         return fPart && fSlab && (
           <Suspense key={fp.id} fallback={null}>
             <TexturedPart 
               placement={fp} 
               part={fPart} 
               slab={fSlab} 
               parts={parts} 
               isSelected={isSelected}
               onSelect={select}
               originOffset={originOffset}
               localTransform={isSink ? getSinkPartTransform(fPart, detail, thickness) : null}
             />
           </Suspense>
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

function CaptureController({ onCaptureReady, contentRef }: { onCaptureReady?: (snaps: string[]) => void, contentRef: any }) {
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    if (!onCaptureReady || !contentRef.current) return;
    
    let mounted = true;
    const timeout = setTimeout(() => {
      if (!mounted) return;
      try {
        const captures: string[] = [];
        const originalPos = camera.position.clone();
        const originalQuat = camera.quaternion.clone();
        const cam = camera as THREE.PerspectiveCamera;

        let distance = 8;
        if (contentRef.current) {
          const box = new THREE.Box3().setFromObject(contentRef.current);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 0.5);
          distance = (maxDim / 2) / Math.tan(25 * Math.PI / 180) * 1.1; // Zoomed in!
        }

        const takeSnapshot = (pos: [number, number, number]) => {
          cam.position.set(...pos);
          cam.lookAt(0, 0, 0);
          gl.render(scene, cam);
          captures.push(gl.domElement.toDataURL('image/jpeg', 1.0));
        };

        const distIso = distance * 0.65;
        takeSnapshot([distIso, distIso, distIso]); // 1 single visual!

        cam.position.copy(originalPos);
        cam.quaternion.copy(originalQuat);
        gl.render(scene, cam);

        onCaptureReady(captures);
      } catch (e) {
        console.error('Capture failed:', e);
        onCaptureReady([]);
      }
    }, 1000);
    return () => { mounted = false; clearTimeout(timeout); };
  }, [gl, camera, scene, contentRef, onCaptureReady]); 
  return null;
}

export function Viewer3D({ className = "w-full h-full min-h-[500px] bg-slate-900 rounded-lg overflow-hidden relative", onCaptureReady, isCaptureMode }: { className?: string, onCaptureReady?: (snaps: string[]) => void, isCaptureMode?: boolean } = {}) {
  const project = useProjectStore((state) => state.project);
  const parts = useProjectStore((state) => state.parts);
  const is3dGroupingEnabled = useUIStore(s => s.is3dGroupingEnabled);
  const selectedId = useUIStore(s => s.selectedId3d);
  const setSelectedId = useUIStore(s => s.setSelectedId3d);
  const contentRef = React.useRef(null);

  const groups = useMemo(() => {
     const handledPlacementIds = new Set<string>();
     const grouped: any[] = [];
     
     // 1. Handle Sinks
     const sinkDetailIds = new Set(parts.filter(p => p.type?.includes('Мийка') || p.name?.includes('мийки')).map(p => p.detailId));
     
     sinkDetailIds.forEach(id => {
         const sinkParts = parts.filter(p => p.detailId === id);
         const sinkPlacements = project.placements.filter(pl => sinkParts.some(p => p.id === pl.partId));
         
         if (sinkPlacements.length > 0) {
             const anchorPart = sinkParts.find(p => p.textureGroupAnchor) || sinkParts.find(p => p.name.includes('дно')) || sinkParts[0];
             const anchorPlacement = sinkPlacements.find(pl => pl.partId === anchorPart.id) || sinkPlacements[0];
             
             const folds = sinkPlacements.filter(pl => pl.id !== anchorPlacement.id);
             
             grouped.push({
                 mainPlacement: anchorPlacement,
                 mainPart: anchorPart,
                 foldPlacements: folds,
                 isSink: true
             });
             
             sinkPlacements.forEach(pl => handledPlacementIds.add(pl.id));
         }
     });

     // 2. Handle standard parts
     const mainPlacements = project.placements.filter(p => {
         if (handledPlacementIds.has(p.id)) return false;
         return parts.find(part => part.id === p.partId)?.isMain;
     });
     
     mainPlacements.forEach(mainP => {
        const mainPart = parts.find(part => part.id === mainP.partId);
        
        let folds: Placement[] = [];
        if (is3dGroupingEnabled) {
            folds = project.placements.filter(p => {
               if (handledPlacementIds.has(p.id)) return false;
               const pPart = parts.find(part => part.id === p.partId);
               return pPart && !pPart.isMain && mainPart && pPart.parentLabel === mainPart.parentLabel;
            });
        }
        
        handledPlacementIds.add(mainP.id);
        folds.forEach(f => handledPlacementIds.add(f.id));
        grouped.push({ mainPlacement: mainP, mainPart, foldPlacements: folds, isSink: false });
     });

     // 3. Unhandled placements
     const unhandled = project.placements.filter(p => !handledPlacementIds.has(p.id));
     unhandled.forEach(p => {
        grouped.push({
           mainPlacement: p,
           mainPart: parts.find(part => part.id === p.partId),
           foldPlacements: [],
           isSink: false
        });
     });

     return grouped;
  }, [project.placements, parts, is3dGroupingEnabled]);

  return (
    <div className={className}>
      <Canvas camera={{ position: [0, 5, 8], fov: 50 }} shadows onPointerMissed={() => setSelectedId(null)}>
        <color attach="background" args={['#0f172a']} />
        
        <ambientLight intensity={0.5} />
          <directionalLight 
            position={[10, 10, 5]} 
            intensity={1.5} 
            castShadow 
            shadow-mapSize-width={1024} 
            shadow-mapSize-height={1024} 
          />

          <Center>
            <group ref={contentRef}>
              {groups.map((group) => {
                if (!group.mainPart) return null;
                return (
                  <AssemblyGroup 
                    key={group.mainPlacement.id} 
                    mainPlacement={group.mainPlacement}
                    mainPart={group.mainPart}
                    foldPlacements={group.foldPlacements}
                    parts={parts}
                    slabs={project.slabs}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    isSink={group.isSink}
                  />
                );
              })}
            </group>
          </Center>

          <ContactShadows 
            position={[0, -0.5, 0]} 
            opacity={0.4} 
            scale={10} 
            blur={2} 
            far={4} 
          />
          
          <Grid 
            infiniteGrid 
            fadeDistance={20} 
            sectionColor="#475569" 
            cellColor="#334155" 
            position={[0, -0.5, 0]} 
          />
          <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2.1} />
          {isCaptureMode && <CaptureController onCaptureReady={onCaptureReady} contentRef={contentRef} />}
      </Canvas>
      <div className="absolute top-4 left-4 text-white text-sm bg-black/50 px-3 py-1 rounded">
        3D Перегляд (Drag to rotate, Scroll to zoom)
      </div>
    </div>
  );
}
