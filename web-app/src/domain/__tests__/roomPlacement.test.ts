import { describe, expect, it } from 'vitest';
import { addSolid, emptyRoom, wallsFromContour } from '../room';
import { WALL_GAP_MM, placeOnRoomFace, roomFaceLabel } from '../roomPlacement';

/**
 * «Поставити на площину» (01.09): виріб лягає на верх блока, підвішується
 * під навісний, притуляється до стіни з зазором 2 мм.
 */
function kitchen() {
  const contour = [{ x: 0, y: 0 }, { x: 3600, y: 0 }, { x: 3600, y: 2800 }, { x: 0, y: 2800 }];
  let room = emptyRoom();
  for (const wall of wallsFromContour(contour, 100, 2700)) room = addSolid(room, wall);
  room = addSolid(room, { id: 'floor', kind: 'add', role: 'floor', label: 'Підлога', points: contour, baseMm: -20, heightMm: 20 });
  room = addSolid(room, { id: 'blk', kind: 'add', role: 'custom', label: 'Блок', points: [{ x: 300, y: 2200 }, { x: 2700, y: 2200 }, { x: 2700, y: 2800 }, { x: 300, y: 2800 }], baseMm: 0, heightMm: 880 });
  room = addSolid(room, { id: 'upper', kind: 'add', role: 'custom', label: 'Навісний', points: [{ x: 300, y: 2450 }, { x: 2700, y: 2450 }, { x: 2700, y: 2800 }, { x: 300, y: 2800 }], baseMm: 1500, heightMm: 700 });
  return room;
}
const top = { widthMm: 2400, depthMm: 600, thicknessMm: 20 };

describe('placeOnRoomFace', () => {
  it('верх блока: центр блока, низ плити на 880, довга сторона вздовж блока', () => {
    const room = kitchen();
    const hit = { solidId: 'blk', normal: { x: 0, y: 1, z: 0 }, pointMm: { x: 1000, y: 880.3, z: 2500 } };
    const r = placeOnRoomFace(room, hit, top)!;
    expect(r.placement).toEqual({ x: 1500, z: 2500, rotationYDeg: 0 });
    expect(r.elevationMm).toBe(880 + 10); // центр плити 20 мм
    expect(roomFaceLabel(room, hit)).toBe('верх «Блок» на 880 мм');
  });

  it('вузький блок уздовж Z повертає довгу стільницю на 90°', () => {
    let room = kitchen();
    room = addSolid(room, { id: 'tall', kind: 'add', role: 'custom', label: 'Пенал', points: [{ x: 3000, y: 300 }, { x: 3600, y: 300 }, { x: 3600, y: 2700 }, { x: 3000, y: 2700 }], baseMm: 0, heightMm: 880 });
    const r = placeOnRoomFace(room, { solidId: 'tall', normal: { x: 0, y: 1, z: 0 }, pointMm: { x: 3300, y: 880, z: 1500 } }, top)!;
    expect(r.placement.rotationYDeg).toBe(90);
    expect(r.placement).toMatchObject({ x: 3300, z: 1500 });
  });

  it('низ навісного блока: верх плити на 1500', () => {
    const r = placeOnRoomFace(kitchen(), { solidId: 'upper', normal: { x: 0, y: -1, z: 0 }, pointMm: { x: 1500, y: 1500, z: 2600 } }, top)!;
    expect(r.elevationMm).toBe(1500 - 10);
    expect(r.placement.rotationYDeg).toBe(0);
  });

  it('стіна Z = 2800 (нормаль −Z): задня сторона до стіни із зазором 2, поворот 180°, висота не змінюється', () => {
    const room = kitchen();
    const wall = room.solids.find((s) => s.role === 'wall' && s.points.every((p) => p.y >= 2800))!;
    const r = placeOnRoomFace(room, { solidId: wall.id, normal: { x: 0, y: 0, z: -1 }, pointMm: { x: 1200, y: 900, z: 2800 } }, top,
      { placement: { x: 1500, z: 1400, rotationYDeg: 0 }, elevationMm: 910 })!;
    expect(r.placement.rotationYDeg).toBe(180);
    expect(r.placement.z).toBe(2800 - WALL_GAP_MM - 300);
    expect(r.placement.x).toBe(1500); // лишається на своєму місці вздовж стіни, у межах стіни
    expect(r.elevationMm).toBe(910);
    expect(roomFaceLabel(room, { solidId: wall.id, normal: { x: 0, y: 0, z: -1 }, pointMm: { x: 1200, y: 900, z: 2800 } })).toContain('Z = 2800');
  });

  it('стіна X = 0 (нормаль +X): поворот 90°, зсув по X на зазор + пів глибини', () => {
    const room = kitchen();
    const wall = room.solids.find((s) => s.role === 'wall' && s.points.every((p) => p.x <= 0))!;
    const r = placeOnRoomFace(room, { solidId: wall.id, normal: { x: 1, y: 0, z: 0 }, pointMm: { x: 0, y: 900, z: 1400 } }, top)!;
    expect(r.placement.rotationYDeg).toBe(90);
    expect(r.placement.x).toBe(WALL_GAP_MM + 300);
    expect(r.placement.z).toBe(1400); // середина стіни, бо попереднього місця нема
  });

  it('невідоме тіло — undefined', () => {
    expect(placeOnRoomFace(kitchen(), { solidId: 'nope', normal: { x: 0, y: 1, z: 0 }, pointMm: { x: 0, y: 0, z: 0 } }, top)).toBeUndefined();
  });
});
