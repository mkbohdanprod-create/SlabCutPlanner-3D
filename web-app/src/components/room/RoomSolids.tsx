import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import type { RoomModel, RoomSolid } from '../../domain/room';
import { ROOM_DEFAULTS, solidAabb } from '../../domain/room';
import { carvedGeometry, solidGeometry, solidSignature } from './roomGeometry';

/**
 * РЕНДЕР ПРИМІЩЕННЯ — спільний для редактора бази і шару в 3D Підборі.
 *
 * Тіло (`add`) — призма з контуру на плані: ExtrudeGeometry у мм → м,
 * план x → X сцени, план y → Z сцени, висота → Y (ті самі осі, що у
 * виробів). Вибірка (`cut`) сама не малюється: її віднімає CSG від кожного
 * тіла, з яким вона перетинається за габаритом (three-bvh-csg — той самий
 * рушій, що ріже торці й загини). Плоска грань (heightMm 0) — тонкий
 * напівпрозорий полігон, який ще не витягнули.
 */

export type RoomSolidPointerHandler = (solidId: string, event: ThreeEvent<PointerEvent>) => void;

/**
 * Ляльковий будинок (01.09, друге наближення). BackSide на стіні-призмі не
 * рятує: внутрішня площина ближньої стіни дивиться від камери, тобто
 * малюється — і закриває кімнату великим сірим полотном (так було в
 * редакторі виробу, щойно камера опинялась поза кімнатою). Правильно —
 * ховати ЦІЛУ стіну, яка стоїть між камерою і центром кімнати: її
 * зовнішня нормаль дивиться на камеру. Перевірка покадрова — камера
 * рухається, стіни перемикаються самі.
 */
function DollhouseWall({ solid, roomCenter, children }: { solid: RoomSolid; roomCenter: THREE.Vector3; children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const center = useMemo(() => {
    const { min, max } = solidAabb(solid);
    return new THREE.Vector3((min.x + max.x) / 2 * 0.001, (min.y + max.y) / 2 * 0.001, (min.z + max.z) / 2 * 0.001);
  }, [solid]);
  const outward = useMemo(() => {
    const v = new THREE.Vector3(center.x - roomCenter.x, 0, center.z - roomCenter.z);
    return v.lengthSq() > 1e-9 ? v.normalize() : new THREE.Vector3(0, 0, 1);
  }, [center, roomCenter]);
  useFrame(({ camera }) => {
    if (!group.current) return;
    const toCamera = new THREE.Vector3(camera.position.x - center.x, 0, camera.position.z - center.z);
    group.current.visible = toCamera.dot(outward) <= 0;
  });
  return <group ref={group}>{children}</group>;
}

export function RoomSolids({
  room,
  selectedId,
  hoverId,
  ghost = false,
  pickable = false,
  showCuts = false,
  onSolidPointerDown,
  onSolidPointerMove,
  onSolidPointerOver,
  onSolidPointerOut,
}: {
  room: RoomModel;
  selectedId?: string | null;
  hoverId?: string | null;
  /**
   * Шар у 3D Підборі («ляльковий будинок»): без взаємодії; стіни, що
   * дивляться на камеру, не малюються (BackSide) — видно всередину кімнати
   * з будь-якого боку, дальні стіни лишаються. Підлога й решта — як є.
   */
  ghost?: boolean;
  /** Ловити кліки й у ghost-режимі — редактор виробу обирає площину бази (01.09). */
  pickable?: boolean;
  /** Показувати контури вибірок (редактор) — щоб їх можна було обрати. */
  showCuts?: boolean;
  onSolidPointerDown?: RoomSolidPointerHandler;
  /** Рух над тілом — редактор бере з події грань (нормаль) під курсором. */
  onSolidPointerMove?: RoomSolidPointerHandler;
  onSolidPointerOver?: (solidId: string) => void;
  onSolidPointerOut?: (solidId: string) => void;
}) {
  const solids = room.solids;
  const solidsSig = useMemo(() => solids.map(solidSignature).join('#'), [solids]);
  // Центр кімнати для лялькового будинку: по підлозі, інакше по всіх тілах
  const roomCenter = useMemo(() => {
    const floors = solids.filter((s) => s.kind === 'add' && s.role === 'floor');
    const src = floors.length ? floors : solids.filter((s) => s.kind === 'add' && s.role !== 'wall');
    const base = src.length ? src : solids;
    const acc = new THREE.Vector3(); let n = 0;
    for (const s of base) {
      const { min, max } = solidAabb(s);
      acc.x += (min.x + max.x) / 2; acc.z += (min.z + max.z) / 2; n += 1;
    }
    return n ? acc.multiplyScalar(0.001 / n) : acc;
  }, [solids]);

  // Геометрії кешуються за підписом усіх тіл: перерахунок CSG лише коли
  // реально щось змінилось, а не на кожен рух миші чи підсвітку.
  const geometries = useMemo(() => {
    const cuts = solids.filter((s) => s.kind === 'cut');
    const map = new Map<string, THREE.BufferGeometry>();
    for (const solid of solids) {
      if (solid.kind === 'add' && solid.heightMm > 0) map.set(solid.id, carvedGeometry(solid, cuts));
      else map.set(solid.id, solidGeometry(solid)); // вибірки й плоскі грані — як є
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solidsSig]);

  return (
    <group>
      {room.solids.map((solid) => {
        const isCut = solid.kind === 'cut';
        if (isCut && !showCuts) return null;
        const selected = selectedId === solid.id;
        const hovered = hoverId === solid.id;
        const baseColor = isCut ? '#f59e0b' : (solid.color ?? (solid.role === 'floor' ? ROOM_DEFAULTS.floorColor : ROOM_DEFAULTS.wallColor));
        const color = selected ? '#3b7dd8' : hovered ? '#7fb4e8' : baseColor;
        // Схована стіна лялькового будинку (visible=false на групі) для
        // рейкаста three не існує лише візуально — кліки вона ловить. Тому
        // подію від невидимого предка ігноруємо, інакше «поставити на
        // площину» чіпляло б стіну, що стоїть між камерою і кімнатою.
        const hiddenAncestor = (e: ThreeEvent<PointerEvent>) => {
          let o: THREE.Object3D | null = e.object;
          while (o) { if (!o.visible) return true; o = o.parent; }
          return false;
        };
        const handlers = ghost && !pickable ? {} : {
          onPointerDown: (e: ThreeEvent<PointerEvent>) => { if (!hiddenAncestor(e)) onSolidPointerDown?.(solid.id, e); },
          onPointerMove: (e: ThreeEvent<PointerEvent>) => { if (!hiddenAncestor(e)) onSolidPointerMove?.(solid.id, e); },
          onPointerOver: (e: ThreeEvent<PointerEvent>) => { if (hiddenAncestor(e)) return; e.stopPropagation(); onSolidPointerOver?.(solid.id); },
          onPointerOut: () => onSolidPointerOut?.(solid.id),
        };

        const geometry = geometries.get(solid.id);
        if (!geometry) return null;
        const dollhouseWall = ghost && solid.role === 'wall';
        // Плоска грань — контур, що чекає на push/pull: тонкий напівпрозорий листок.
        if (solid.heightMm <= 0) {
          return (
            <mesh key={solid.id} geometry={geometry} {...handlers}>
              <meshBasicMaterial
                color={selected ? '#3b7dd8' : hovered ? '#7fb4e8' : isCut ? '#f59e0b' : ROOM_DEFAULTS.faceColor}
                transparent opacity={ghost ? 0.15 : 0.6} side={THREE.DoubleSide} depthWrite={false}
              />
              {!ghost && <Edges geometry={geometry} threshold={20} color={selected ? '#1d4ed8' : '#3b7dd8'} />}
            </mesh>
          );
        }
        const mesh = (
          <mesh key={solid.id} geometry={geometry} castShadow={!ghost} receiveShadow {...handlers}>
            <meshStandardMaterial
              key={`${ghost}-${isCut}`}
              color={color}
              roughness={0.92}
              metalness={0}
              transparent={isCut}
              opacity={isCut ? 0.12 : 1}
              depthWrite={!isCut}
              side={THREE.DoubleSide}
            />
            <Edges geometry={geometry} threshold={20} color={selected ? '#1d4ed8' : isCut ? '#d97706' : ghost ? '#9aa3ad' : '#6b7280'} />
          </mesh>
        );
        // Стіна між камерою і кімнатою ховається цілком (ляльковий будинок)
        return dollhouseWall ? <DollhouseWall key={solid.id} solid={solid} roomCenter={roomCenter}>{mesh}</DollhouseWall> : mesh;
      })}
    </group>
  );
}
