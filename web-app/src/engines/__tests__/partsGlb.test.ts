// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildPartsGlb } from '../partsGlb';
import type { DetailPart } from '../../domain/types';

/**
 * №177 — модель у пакеті для МЕС має бути ЗАВЖДИ, навіть коли 3D
 * закрите. Плоскі заготовки — чесний запасний варіант; головне, щоб
 * кожен вузол ніс ID, за яким МЕС зіставляє деталь із розкроєм.
 */

const part = (over: Partial<DetailPart>): DetailPart => ({
  id: 'inst-1',
  detailId: 'det-1',
  name: 'Стільниця.1',
  type: 'Стільниця',
  shape: 'Прямокутна',
  width: 1200,
  height: 600,
  rotation: 0,
  area: 0.72,
  points: [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 600 }, { x: 0, y: 600 }],
  isMain: true,
  thickness: 20,
  parentLabel: 'Виріб',
  dimsLabel: '1200×600',
  ...over,
} as unknown as DetailPart);

/** Розбір GLB: заголовок + JSON-чанк. */
function gltfJson(bytes: Uint8Array): { nodes?: Array<{ name?: string; extras?: Record<string, unknown> }> } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67); // 'glTF'
  const chunkLength = view.getUint32(12, true);
  const json = new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength));
  return JSON.parse(json);
}

describe('№177 · GLB заготовок', () => {
  it('кожна заготовка — вузол з іменем instanceId і extras', async () => {
    const result = await buildPartsGlb([
      part({}),
      part({ id: 'inst-2', detailId: 'det-2', name: 'Опора', width: 900, height: 900 }),
    ]);
    expect(result).not.toBeNull();
    expect(result?.nodes).toBe(2);
    expect(result?.geometryState).toBe('parts-flat');

    const gltf = gltfJson(result!.bytes);
    const named = (gltf.nodes ?? []).filter((node) => node.name === 'inst-1' || node.name === 'inst-2');
    expect(named).toHaveLength(2);
    // extras — те, за чим МЕС зіставляє вузол із розкроєм.
    expect(named[0].extras).toMatchObject({ instanceId: 'inst-1', partId: 'det-1' });
  });

  it('вирізи переносяться в модель, а не втрачаються', async () => {
    const withHole = part({
      holes: [[{ x: 400, y: 200 }, { x: 800, y: 200 }, { x: 800, y: 400 }, { x: 400, y: 400 }]],
    });
    const plain = await buildPartsGlb([part({})]);
    const holed = await buildPartsGlb([withHole]);
    // Деталь із вирізом має більше трикутників по контуру отвору.
    expect(holed!.bytes.length).toBeGreaterThan(plain!.bytes.length);
  });

  it('без придатних контурів моделі немає — порожній GLB не вигадуємо', async () => {
    const broken = await buildPartsGlb([part({ points: [{ x: 0, y: 0 }] })]);
    expect(broken).toBeNull();
  });
});
