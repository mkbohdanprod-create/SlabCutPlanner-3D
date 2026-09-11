// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { exportForAr } from '../arExport';
import { glbNodeIndex, buildRenderContract } from '../renderContract';
import { lineageOf } from '../mesPack';
import type { AssemblyPlan } from '../assemblyPlan';

/**
 * №179 — контракт 3D для МЕС: вузли GLB ↔ instanceId/unitId з точним
 * node index у межах цього файлу; групування по вузлах склейок; окремий
 * GLB вузла через фільтр. Перевіряється на справжньому GLB, не на моку.
 */

function mesh(id: string, x: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.6), new THREE.MeshStandardMaterial());
  m.name = id;
  m.userData = { instanceId: id, partId: `det-${id}` };
  m.position.set(x, 0.9, 0);
  return m;
}

describe('№179 · product.glb з деревом вузлів і render-contract', () => {
  it('groupBy кладе заготовки під групу unitId, filter вирізає вузол окремо', async () => {
    const scene = new THREE.Group();
    scene.add(mesh('top-2', 0), mesh('fold-C', 0.7), mesh('leg-B', 2));
    const unitOf: Record<string, string> = { 'top-2': 'assembly:u1', 'fold-C': 'assembly:u1' };

    const product = await exportForAr(scene, undefined, {
      groupBy: (m) => unitOf[m.userData.instanceId as string] ?? null,
    });
    const nodes = glbNodeIndex(new Uint8Array(await product.glb.arrayBuffer()));
    const unitNode = nodes.find((n) => n.name === 'assembly:u1');
    expect(unitNode?.extras).toMatchObject({ unitId: 'assembly:u1' });
    expect(nodes.filter((n) => n.extras?.instanceId).map((n) => n.name).sort()).toEqual(['fold-C', 'leg-B', 'top-2']);

    const unit = await exportForAr(scene, undefined, {
      filter: (m) => ['top-2', 'fold-C'].includes(m.userData.instanceId as string),
      rootName: 'assembly:u1',
      rootExtras: { unitId: 'assembly:u1' },
    });
    const unitNodes = glbNodeIndex(new Uint8Array(await unit.glb.arrayBuffer()));
    expect(unitNodes.some((n) => n.name === 'leg-B')).toBe(false);
    expect(unitNodes.find((n) => n.name === 'assembly:u1')?.extras).toMatchObject({ unitId: 'assembly:u1' });
  });

  it('контракт каже прямо: пози запечені, і зв\'язує node index з instanceId/unitId', () => {
    const plan = {
      version: 1, source: '', joins: [{ id: 'glue-1', area: 'glue', name: '', inputs: ['top-2', 'fold-C'],
        output: { id: 'assembly:u1', name: '', kind: 'bonded', partIds: ['top-2', 'fold-C'] }, basis: 'model' }],
      finalUnitIds: [], unresolved: [], transportGroups: [], counts: { parts: 3, joins: 1, finalUnits: 2, unresolved: 0 }, consumedPartIds: [], notes: [],
    } as unknown as AssemblyPlan;
    const contract = buildRenderContract({
      orderId: '81-000002', cadRevision: 3, productFile: 'models/product.glb',
      productNodes: [
        { nodeIndex: 0, name: '', extras: null },
        { nodeIndex: 1, name: 'assembly:u1', extras: { unitId: 'assembly:u1' } },
        { nodeIndex: 2, name: 'top-2', extras: { instanceId: 'top-2', partId: 'det-top' } },
      ],
      sizeMm: { x: 1200, y: 920, z: 600 }, plan,
      unitFiles: [{ unitId: 'assembly:u1', file: 'models/units/assembly_u1.glb' }],
    });
    expect(contract.transformsBaked).toBe(true);
    expect(contract.productNodeTree.parts[0]).toMatchObject({ nodeIndex: 2, instanceId: 'top-2', unitId: 'assembly:u1' });
    expect(contract.unitModels[0]).toMatchObject({ unitId: 'assembly:u1', joinId: 'glue-1' });
  });

  it('lineage читається з instanceId Студії без вигадок', () => {
    expect(lineageOf('part:prod_prod_vqvfrbz3/element:fold_C/detail:main:main:body:Потовщення (C):0:0'))
      .toEqual({ productId: 'prod_vqvfrbz3', elementId: 'fold_C', detailId: 'main' });
    expect(lineageOf('part-x')).toEqual({ productId: null, elementId: null, detailId: null });
  });
});
