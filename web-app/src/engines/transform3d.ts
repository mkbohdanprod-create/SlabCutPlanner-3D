import type { Point } from '../domain/types';

export function getEdgeTransform(
  v1: Point,
  v2: Point,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  parentThickness: number = 20,
  attachmentWidth?: number,
  attachmentHeight: number = 600,
  attachmentOffset: number = 0,
  /**
   * Куди «росте» доповнення від ребра батька:
   *  'up'   — стінова панель, бортик (стоять на площині вгору)
   *  'down' — опора/нога (звисає вниз)
   *  'fold' — підворот (звисає вниз, стик 45° по торцю)
   * Формули збігаються з 3D Редактором (Detail3DPreview), щоб обидва види були однакові.
   */
  attachmentKind: 'up' | 'down' | 'fold' = 'up'
) {
  const w = bounds.maxX - bounds.minX || 1;
  const h = bounds.maxY - bounds.minY || 1;
  const s = 0.001; // scale factor used in Viewer

  const nx1 = (v1.x - 0.5) * w * s;
  const ny1 = (v1.y - 0.5) * h * s;
  const nx2 = (v2.x - 0.5) * w * s;
  const ny2 = (v2.y - 0.5) * h * s;

  const midX = (nx1 + nx2) / 2;
  const midY = (ny1 + ny2) / 2;

  const dx = nx2 - nx1;
  const dy = ny2 - ny1;
  const angle = Math.atan2(dy, dx);
  const edgeLength = Math.sqrt(dx * dx + dy * dy);

  const zSurface = (parentThickness * s) / 2;

  // The base transform points to the center of the edge on the top surface.
  // We return the base edge transform and the specific child offset transform.

  const wpWidth = attachmentWidth !== undefined ? (attachmentWidth * s) : edgeLength;
  const wpHeight = attachmentHeight * s;
  const wpDepth = parentThickness * s; // By default attachments inherit thickness depth? Wait, wpDepth was parentThickness in the old code.
  const wpOffset = attachmentOffset * s;
  
  // The local position inside the group
  const posX = -edgeLength / 2 + wpOffset + wpWidth / 2;

  // Нога/підворот звисають вниз і мають дзеркальні знаки по Y/Z та зворотний поворот.
  const goesDown = attachmentKind === 'down' || attachmentKind === 'fold';

  const childPosition: [number, number, number] = goesDown
    ? [posX, -wpHeight / 2, wpDepth / 2]
    : [posX, wpHeight / 2, -wpDepth / 2];

  const childRotation: [number, number, number] = goesDown
    ? [-Math.PI / 2, 0, 0]
    : [Math.PI / 2, 0, 0];

  return {
    groupPosition: [midX, zSurface, midY] as [number, number, number],
    groupRotation: [0, -angle, 0] as [number, number, number],
    childPosition,
    childRotation,
    edgeLength,
    scale: s
  };
}
