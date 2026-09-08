/**
 * №142 — поля стиків. Одна математика на креслення (2D) і на модель (3D).
 *
 * П-подібна 2400×1200, виріз 1200×600 знизу по центру. Власник обвів червоним
 * три поля: верхня смуга (H↔B) і дві ноги (H↔F, D↔B) — саме їх і має дати
 * функція, а не «перекриття проекцій на всю висоту».
 */
import { describe, it, expect } from 'vitest';
import { jointFieldPairs, referenceSideInField, type JointSideSegment } from '../joints';

/** Обхід контуру П-подібної, як його будує редактор. */
const outline = [
  { x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 1200 }, { x: 1800, y: 1200 },
  { x: 1800, y: 600 }, { x: 600, y: 600 }, { x: 600, y: 1200 }, { x: 0, y: 1200 },
];
const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const sides: JointSideSegment[] = outline.map((p, i) => ({
  id: ids[i], v1: p, v2: outline[(i + 1) % outline.length],
}));

const pairs = jointFieldPairs(sides, outline);
const pairKeys = new Set(pairs.map((p) => [p.sideId, p.otherId].sort().join('-')));
const find = (a: string, b: string) => pairs.find((p) => p.sideId === a && p.otherId === b);

describe('поля стиків П-подібної', () => {
  it('знаходить рівно ті пари, що бачить конструктор', () => {
    expect([...pairKeys].sort()).toEqual(['A-C', 'A-E', 'A-G', 'B-D', 'B-H', 'F-H']);
  });

  it('пара H↔B — це ВЕРХНЯ СМУГА, а не вся деталь', () => {
    const hb = find('H', 'B');
    expect(hb).toBeDefined();
    // Сторона H іде знизу вгору (від G до старту), тому поле лягає в її кінці.
    const lo = Math.min(hb!.from, hb!.to);
    const hi = Math.max(hb!.from, hb!.to);
    expect(hi - lo).toBeCloseTo(600, 0);
    expect(hb!.depth).toBeCloseTo(2400, 0);
  });

  it('пара H↔F — ліва нога: глибина 600', () => {
    const hf = find('H', 'F');
    expect(hf).toBeDefined();
    expect(hf!.depth).toBeCloseTo(600, 0);
    expect(Math.abs(hf!.to - hf!.from)).toBeCloseTo(600, 0);
  });

  it('на стороні A три поля — по одному на G, E і C', () => {
    expect(pairs.filter((p) => p.sideId === 'A')).toHaveLength(3);
  });

  it('пари віддаються в обидва боки — бейдж потрібен на кожній стороні', () => {
    expect(find('A', 'G')).toBeDefined();
    expect(find('G', 'A')).toBeDefined();
  });

  it('прямокутник дає рівно дві пари', () => {
    const rect = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }];
    const rectIds = ['A', 'B', 'C', 'D'];
    const rectSides: JointSideSegment[] = rect.map((p, i) => ({
      id: rectIds[i], v1: p, v2: rect[(i + 1) % rect.length],
    }));
    const got = jointFieldPairs(rectSides, rect);
    expect(new Set(got.map((p) => [p.sideId, p.otherId].sort().join('-'))).size).toBe(2);
  });
});

describe('сторона-лінійка береться з поля, а не з усієї деталі (№143)', () => {
  it('для стику в ЛІВІЙ нозі лінійка — G, а не однойменна по висоті C', () => {
    const hf = pairs.find((p) => p.sideId === 'H' && p.otherId === 'F')!;
    // Опорний кут для сторони H — G (0, 1200): низ лівої ноги.
    const ref = referenceSideInField(sides, 'horizontal', { x: 0, y: 1200 }, hf.box);
    expect(ref?.id).toBe('G');
    expect(ref?.position).toBeCloseTo(1200, 0);
  });

  it('для стику в ПРАВІЙ нозі лінійка — C', () => {
    const db = pairs.find((p) => p.sideId === 'D' && p.otherId === 'B')!;
    const ref = referenceSideInField(sides, 'horizontal', { x: 2400, y: 1200 }, db.box);
    expect(ref?.id).toBe('C');
  });

  it('для стику у верхній смузі лінійка — A', () => {
    const hb = pairs.find((p) => p.sideId === 'H' && p.otherId === 'B')!;
    const ref = referenceSideInField(sides, 'horizontal', { x: 0, y: 0 }, hb.box);
    expect(ref?.id).toBe('A');
  });
});
