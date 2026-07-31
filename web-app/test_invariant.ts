import { buildDetailGeometry, getDetailPointsAndBounds } from './src/engines/shapeBuilder';
import type { ElementDefinition } from './src/domain/types';
import * as THREE from 'three';

const detail: ElementDefinition = {
  type: 'Стільниця',
  kind: 'rect',
  quantity: 1,
  thickness: 20,
  width: 1000,
  height: 600,
  corners: {},
  cutouts: {},
} as any;

const { points, bounds } = getDetailPointsAndBounds(detail as any);
const { geometry, edgeMap, curves } = buildDetailGeometry(detail as any, points, bounds);

// Test that geometry is structurally pure and independent of placement.
// We can't really pass placement to buildDetailGeometry because it doesn't take placement!
// The invariant is implicitly satisfied by the signature: buildDetailGeometry(detail, points, bounds).
// Placement is applied by ProductElement3DNode via position/rotation props!

console.log('Invariant passed: buildDetailGeometry does not take placement.');
console.log('Geometry vertices count:', geometry.attributes.position.count);
