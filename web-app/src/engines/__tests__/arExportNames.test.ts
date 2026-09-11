import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

/**
 * №176 — GLB має нести ID заготовок.
 *
 * МЕС перевірив перший пакет і сказав прямо: вузли моделі анонімні, тому
 * деталь у 3D не зіставити з деталлю в розкрої. Корінь був не в тому, що
 * меші не підписані, а в тому, що експортер БУДУВАВ НОВІ меші й лишав
 * `name`/`userData` позаду. Тест стереже саме це перенесення.
 */

vi.mock('three/examples/jsm/exporters/GLTFExporter.js', () => ({ GLTFExporter: class {} }));
vi.mock('three/examples/jsm/exporters/USDZExporter.js', () => ({ USDZExporter: class {} }));

describe('№176 · імена вузлів переживають експорт', () => {
  it('name та userData копіюються на експортований меш', async () => {
    const { exportForAr } = await import('../arExport');

    const source = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.02, 0.6),
      new THREE.MeshStandardMaterial({ color: '#fff' }),
    );
    mesh.name = 'part_top_1';
    mesh.userData = { instanceId: 'part_top_1', partId: 'det-1', elementId: 'element:main' };
    source.add(mesh);

    // Експортери замокані — з exportForAr нас цікавить лише сцена, тому
    // ловимо її через підміну GLTFExporter у момент виклику.
    let captured: THREE.Object3D | null = null;
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    (GLTFExporter as unknown as { prototype: Record<string, unknown> }).prototype.parse = function parse(
      scene: THREE.Object3D,
      onDone: (result: ArrayBuffer) => void,
    ) {
      captured = scene;
      onDone(new ArrayBuffer(8));
    };
    const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js');
    (USDZExporter as unknown as { prototype: Record<string, unknown> }).prototype.parseAsync = async () => new Uint8Array(4);

    await exportForAr(source);

    expect(captured).not.toBeNull();
    const names: string[] = [];
    const extras: Record<string, unknown>[] = [];
    (captured as unknown as THREE.Object3D).traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        names.push(node.name);
        extras.push(node.userData);
      }
    });
    expect(names).toContain('part_top_1');
    expect(extras[0]).toMatchObject({ instanceId: 'part_top_1', partId: 'det-1' });
  });
});
