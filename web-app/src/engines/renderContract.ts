// =====================================================================
//  src/engines/renderContract.ts
//  №179 · render-contract.json — карта 3D для адаптера МЕС.
//
//  Брунеллескі (ТЗ 10.09, §4 шлях B і §10): якщо трансформації запечені
//  в GLB — сказати прямо, щоб МЕС не застосував їх удруге; дати вузли з
//  точним glTF node index у межах ЦЬОГО SHA; осі, одиниці, bounds.
//
//  Наш експортер (arExport.prepare) саме так і робить: matrixWorld
//  кожного меша ЗАПІКАЄТЬСЯ в геометрію, виріб центрується і ставиться
//  низом на Y = 0. Тому контракт чесний і короткий: «нічого не крутити,
//  усе вже стоїть де треба».
// =====================================================================

import type { AssemblyPlan } from './assemblyPlan';

export interface GlbNodeRef {
  /** Порядковий індекс у `nodes[]` glTF — стабільний лише для цього SHA. */
  nodeIndex: number;
  name: string;
  extras: Record<string, unknown> | null;
}

/**
 * Читає JSON-чанк GLB і віддає вузли з індексами. Без бібліотек: GLB —
 * це заголовок 12 байт + чанк JSON (довжина, тип 'JSON', тіло).
 */
export function glbNodeIndex(bytes: Uint8Array): GlbNodeRef[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67) return [];
  const chunkLength = view.getUint32(12, true);
  const json = new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength));
  const gltf = JSON.parse(json) as { nodes?: Array<{ name?: string; extras?: Record<string, unknown> }> };
  return (gltf.nodes ?? []).map((node, nodeIndex) => ({
    nodeIndex,
    name: node.name ?? '',
    extras: node.extras ?? null,
  }));
}

export interface RenderContractInput {
  orderId: string;
  cadRevision: number;
  productFile: string;
  productNodes: GlbNodeRef[];
  sizeMm: { x: number; y: number; z: number };
  plan: AssemblyPlan;
  unitFiles: Array<{ unitId: string; file: string }>;
}

export function buildRenderContract(input: RenderContractInput) {
  const { orderId, cadRevision, productFile, productNodes, sizeMm, plan, unitFiles } = input;

  const partNodes = productNodes
    .filter((node) => node.extras && typeof node.extras.instanceId === 'string')
    .map((node) => ({
      nodeIndex: node.nodeIndex,
      nodeName: node.name,
      instanceId: node.extras!.instanceId as string,
      partId: (node.extras!.partId as string | undefined) ?? null,
      elementId: (node.extras!.elementId as string | undefined) ?? null,
      unitId: null as string | null,
    }));
  const unitNodes = productNodes
    .filter((node) => node.extras && typeof node.extras.unitId === 'string')
    .map((node) => ({ nodeIndex: node.nodeIndex, nodeName: node.name, unitId: node.extras!.unitId as string }));

  // Заготовка → її вузол: із графа склейок (останній join, що її спожив).
  const unitOfPart = new Map<string, string>();
  plan.joins.forEach((join) => join.output.partIds.forEach((partId) => unitOfPart.set(partId, join.output.id)));
  partNodes.forEach((node) => { node.unitId = unitOfPart.get(node.instanceId) ?? null; });

  return {
    contractVersion: 'vs3d-render-1',
    orderId,
    cadRevision,
    transformsBaked: true,
    transformsNote:
      'Усі пози ЗАПЕЧЕНІ в геометрію при експорті: matrixWorld кожної заготовки застосовано до вершин, '
      + 'виріб центровано по XZ і поставлено низом на Y=0. У GLB немає жодних node.matrix/translation, які треба застосовувати. '
      + 'MES не має нічого обертати, масштабувати чи зсувати.',
    units: 'm',
    axes: { up: '+Y', handedness: 'right', note: 'glTF 2.0 стандарт; план CAD (мм, Y вниз) → сцена: X той самий, Y плану → −Z сцени, товщина → +Y; масштаб 0.001' },
    boundsMm: sizeMm,
    camera: null,
    cameraNote: 'рекомендації немає — камера на стороні MES; bounds достатньо для масштабу',
    models: [
      { id: 'product-model', role: 'assembled_product', file: productFile, geometryState: 'final' },
      ...unitFiles.map((unit) => ({ id: `unit-model:${unit.unitId}`, role: 'shop_assembly', file: unit.file, unitId: unit.unitId, geometryState: 'final' })),
    ],
    productNodeTree: {
      note: 'root → група вузла (name = unitId, extras.unitId) → меші заготовок (name = instanceId, extras.instanceId). Заготовки поза склейками — меші прямо під root.',
      units: unitNodes,
      parts: partNodes,
    },
    unitModels: unitFiles.map((unit) => {
      const join = plan.joins.find((item) => item.output.id === unit.unitId);
      return {
        unitId: unit.unitId,
        file: unit.file,
        joinId: join?.id ?? null,
        partIds: join?.output.partIds ?? [],
        note: 'та сама геометрія, що в product.glb, лише відфільтрована по заготовках вузла і центрована окремо',
      };
    }),
    notProvided: [
      'пози входів усередині склейки (positionMm/rotationRad відносно вихідного вузла) — у GLB вони вже запечені, окремо не виводяться',
      'exploded-view вектори',
      'явні edgeId/faceId стикуваних поверхонь',
    ],
  };
}
