/**
 * Підпис маркера сторони в 3D (FG-29).
 *
 * `buildDetailShape` роздає ребрам контуру технічні id: прості сторони — це
 * `A`/`B`/`C`/`D` (або літера вершини для складних форм), а відрізки, що
 * з'явились через обробку кута, отримують суфікс: `AB_chamfer`, `A_lcut1`,
 * `A_lcut2`, `B_radius`. Показувати ці id людині як є не можна — на кульці
 * висів би напис «AB_chamfer», якого немає ні на кресленні, ні в 2D-таблиці.
 *
 * Тому:
 *   - сторона   → її літера, великим шрифтом;
 *   - відрізок обробки кута → та сама літера кута, дрібним і приглушеним,
 *     щоб було видно: це не сторона, а зріз/фаска на її кінці;
 *   - службове замикаюче ребро без імені (`close`, `edge-2`) → без підпису,
 *     бо вигаданий підпис гірший за його відсутність.
 */
export type EdgeMarkerLabel = {
  /** Що написати над кулькою. Порожній рядок — не підписувати. */
  text: string;
  /** true — це відрізок обробки кута, а не самостійна сторона. */
  isCornerSegment: boolean;
};

const CORNER_SEGMENT = /^(.+?)_(chamfer|lcut1|lcut2|radius)$/;
const UNNAMED = /^(close|start|edge-\d+)$/;

export function edgeMarkerLabel(id: string): EdgeMarkerLabel {
  const segment = CORNER_SEGMENT.exec(id);
  if (segment) {
    const base = segment[1];
    return { text: UNNAMED.test(base) ? '' : base, isCornerSegment: true };
  }
  if (UNNAMED.test(id)) return { text: '', isCornerSegment: false };
  return { text: id, isCornerSegment: false };
}
