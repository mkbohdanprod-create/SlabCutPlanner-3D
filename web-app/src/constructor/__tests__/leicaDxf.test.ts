/**
 * Парсер заміру Leica — синтетичний DXF за правилами файлів заміру
 * (ЗМ-Т1, ЗМ-Т3, ЗМ-Т8, ЗМ-Т9, РМ-1, МТ-1). Живі файли з кейсів у
 * репозиторій не кладемо (персональні дані замовників).
 */
import { describe, expect, it } from 'vitest';
import { buildChains, cornerAngles, parseLeicaDxf, roomContourOf } from '../measure/leicaDxf';

function dxf(entities: string): string {
  return ['0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', entities.trim(), '0', 'ENDSEC', '0', 'EOF'].join('\n');
}
function lw(layer: string, pts: Array<[number, number]>, closed = false): string {
  const body = pts.map(([x, y]) => `10\n${x}\n20\n${y}`).join('\n');
  return `0\nLWPOLYLINE\n8\n${layer}\n90\n${pts.length}\n70\n${closed ? 1 : 0}\n${body}\n`;
}
function line(layer: string, a: [number, number, number], b: [number, number, number]): string {
  return `0\nLINE\n8\n${layer}\n10\n${a[0]}\n20\n${a[1]}\n30\n${a[2]}\n11\n${b[0]}\n21\n${b[1]}\n31\n${b[2]}\n`;
}
function text(layer: string, t: string, x: number, y: number): string {
  return `0\nTEXT\n8\n${layer}\n10\n${x}\n20\n${y}\n1\n${t}\n`;
}

describe('parseLeicaDxf', () => {
  it('ВК-1/ЗМ-Т1: відкриті полілінії стін стають відрізками, ланцюг зшивається', () => {
    const src = dxf(lw('External', [[0, 0], [3000, 0], [3000, 2000]]) + lw('External', [[3000, 2000], [0, 2000], [0, 0]]));
    const m = parseLeicaDxf(src, 't.dxf');
    expect(m.variant).toBe('external-internal');
    expect(m.segments).toHaveLength(4);
    expect(m.chains).toHaveLength(1);
    expect(m.chains[0].closed).toBe(true);
    expect(m.chains[0].lengthMm).toBeCloseTo(10000, 3);
    expect(roomContourOf(m)?.points).toHaveLength(4);
  });

  it('РМ-1/ЗМ-Т8: рамка «Фреймы», Level, MchOrg відкидаються і потрапляють у dropped', () => {
    const src = dxf(
      lw('Фреймы', [[-100, -100], [4000, -100], [4000, 3000], [-100, 3000]], true)
      + lw('Level', [[0, 0], [50, 0], [0, 50]], true)
      + line('MchOrg', [1500, 1000, 0], [1510, 1000, 0])
      + lw('External', [[0, 0], [3000, 0]]),
    );
    const m = parseLeicaDxf(src);
    expect(m.segments).toHaveLength(1);
    expect(m.frames).toBe(1);
    expect(m.dropped.map((d) => d.layer).sort()).toEqual(['Level', 'MchOrg', 'Фреймы']);
  });

  it('ЗМ-Т3: геометрія, продубльована в другій рамці (інша площина), прибирається', () => {
    const src = dxf(
      lw('Фреймы', [[-100, -100], [4000, -100], [4000, 3000], [-100, 3000]], true)
      + lw('Фреймы', [[-100, 5000], [4000, 5000], [4000, 8000], [-100, 8000]], true)
      + lw('External', [[0, 0], [3000, 0]])
      + lw('External', [[0, 5100], [3000, 5100]]),
    );
    const m = parseLeicaDxf(src);
    expect(m.segments).toHaveLength(1);
    expect(m.dedupedSegments).toBe(1);
  });

  it('ЗМ-Т9: вертикальні відрізки ZLines — карта висот, не геометрія', () => {
    const src = dxf(line('ZLines', [100, 200, 0], [100, 200, -7]) + line('0', [0, 0, 0], [1000, 0, 0]));
    const m = parseLeicaDxf(src);
    expect(m.heights).toEqual([{ x: 100, y: 200, z: 7 }]);
    expect(m.segments).toHaveLength(1);
    expect(m.variant).toBe('zlines');
  });

  it('МТ-1: мітки лишаються як є, без розшифровки', () => {
    const m = parseLeicaDxf(dxf(text('0', 'М', 10, 10) + text('0', 'В', 20, 20) + lw('0', [[0, 0], [100, 0]])));
    expect(m.marks.map((x) => x.text)).toEqual(['М', 'В']);
  });

  it('кути ланцюга: 90° у прямокутнику, не-90° видно', () => {
    const angles = cornerAngles([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }], true);
    expect(angles.every((a) => a !== undefined && Math.abs(a - 90) < 1e-9)).toBe(true);
    const skew = cornerAngles([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 990, y: 1000 }], false);
    expect(skew[1]).toBeCloseTo(89.43, 1);
  });

  it('buildChains: шар не змішується з іншим шаром, допуск 1,5 мм', () => {
    const chains = buildChains([
      { id: 'a', layer: 'External', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
      { id: 'b', layer: 'External', a: { x: 101, y: 0 }, b: { x: 101, y: 100 } },
      { id: 'c', layer: 'Internal', a: { x: 101.2, y: 100 }, b: { x: 0, y: 100 } },
    ]);
    expect(chains).toHaveLength(2);
    expect(chains.find((c) => c.layer === 'External')?.points).toHaveLength(3);
  });
});
