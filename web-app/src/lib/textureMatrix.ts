import type { DetailPart, Rotation } from '../domain/types';
import { rotatePoint } from './project';

export function textureCoordinateMatrix(part: DetailPart, sourceRotation: Rotation, layoutRotation: Rotation, scale: number) {
  const normalizedPoint = (point: { x: number; y: number }, rotation: Rotation) => {
    const rotatedReference = part.points.map((item) => rotatePoint(item, rotation, part.width, part.height));
    const minX = Math.min(...rotatedReference.map((item) => item.x));
    const minY = Math.min(...rotatedReference.map((item) => item.y));
    const rotated = rotatePoint(point, rotation, part.width, part.height);
    return { x: rotated.x - minX, y: rotated.y - minY };
  };
  const src0 = normalizedPoint({ x: 0, y: 0 }, sourceRotation);
  const srcX = normalizedPoint({ x: 1, y: 0 }, sourceRotation);
  const srcY = normalizedPoint({ x: 0, y: 1 }, sourceRotation);
  const dst0 = normalizedPoint({ x: 0, y: 0 }, layoutRotation);
  const dstX = normalizedPoint({ x: 1, y: 0 }, layoutRotation);
  const dstY = normalizedPoint({ x: 0, y: 1 }, layoutRotation);

  const sx1 = srcX.x - src0.x;
  const sy1 = srcX.y - src0.y;
  const sx2 = srcY.x - src0.x;
  const sy2 = srcY.y - src0.y;
  const dx1 = dstX.x - dst0.x;
  const dy1 = dstX.y - dst0.y;
  const dx2 = dstY.x - dst0.x;
  const dy2 = dstY.y - dst0.y;
  const determinant = sx1 * sy2 - sx2 * sy1 || 1;
  const a = (dx1 * sy2 - dx2 * sy1) / determinant;
  const b = (dy1 * sy2 - dy2 * sy1) / determinant;
  const c = (dx2 * sx1 - dx1 * sx2) / determinant;
  const d = (dy2 * sx1 - dy1 * sx2) / determinant;
  const e = (dst0.x - a * src0.x - c * src0.y) * scale;
  const f = (dst0.y - b * src0.x - d * src0.y) * scale;
  return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
}
