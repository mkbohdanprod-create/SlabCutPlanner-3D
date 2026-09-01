/**
 * РОЗСТАНОВКА ВИРОБІВ НА 3D-СЦЕНІ — хвиля 5, крок 5.1 (П-3).
 *
 * Скарга фокус-групи: «кілька виробів злипаються в центрі сцени, їх не
 * розставити». Причин було дві:
 *
 *   · дефолтна позиція виробу виводилась із його координат НА СЛЯБІ —
 *     випадкове число, яке до кімнати клієнта не має стосунку, а зверху
 *     все ще й центрувалось у нуль;
 *   · пересунуте руками зберігалось на РОЗКЛАДЦІ (placement.transform3d),
 *     яку автоматичний розкрій перебудовує з нуля — розставлене губилось
 *     після першої ж правки виробу.
 *
 * Тепер розміщення — ДАНІ ВИРОБУ (`Product.scenePlacement`): міліметри по
 * підлозі і поворот навколо вертикалі. Виріб переживає будь-які перерахунки
 * розкрою, бо самі вироби розкрій не чіпає.
 *
 * Цей модуль — чиста математика без three.js: дефолтна розстановка і
 * перевірка перетинів. Все детерміноване: той самий проєкт — та сама
 * картинка при кожному відкритті.
 */

export interface SceneFootprintMm {
  productId: string;
  /** Габарит головної деталі виробу, мм. */
  widthMm: number;
  depthMm: number;
}

export interface ScenePlacementMm {
  x: number;
  z: number;
  rotationYDeg: number;
}

/** Зазор між виробами в дефолтній розстановці, мм. */
export const SCENE_GAP_MM = 400;

/**
 * Дефолтна розстановка: вироби шикуються рядком уздовж X у порядку проєкту,
 * із зазором між габаритами; увесь ряд центрується навколо нуля сцени.
 * Жодного рандому — той самий склад проєкту дає ті самі місця.
 */
export function defaultSceneLayout(
  items: SceneFootprintMm[],
  gapMm: number = SCENE_GAP_MM,
): Record<string, ScenePlacementMm> {
  const out: Record<string, ScenePlacementMm> = {};
  if (!items.length) return out;

  const totalWidth = items.reduce((sum, item) => sum + Math.max(1, item.widthMm), 0)
    + gapMm * (items.length - 1);
  let cursor = -totalWidth / 2;
  items.forEach((item) => {
    const width = Math.max(1, item.widthMm);
    out[item.productId] = { x: cursor + width / 2, z: 0, rotationYDeg: 0 };
    cursor += width + gapMm;
  });
  return out;
}

/** Габарит прямокутника після повороту навколо вертикалі (описаний бокс). */
export function rotatedFootprintMm(widthMm: number, depthMm: number, rotationYDeg: number) {
  const angle = (rotationYDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return {
    widthMm: widthMm * cos + depthMm * sin,
    depthMm: widthMm * sin + depthMm * cos,
  };
}

/**
 * Які вироби ПЕРЕТИНАЮТЬСЯ габаритами на підлозі.
 *
 * Перевірка м'яка і чесна: вона нічого не рухає. Менеджер має право
 * поставити острів впритул до кухні — система лише підсвічує факт
 * перетину, рішення за людиною.
 */
export function collidingSceneProducts(
  items: Array<SceneFootprintMm & { placement: ScenePlacementMm }>,
): Set<string> {
  const boxes = items.map((item) => {
    const foot = rotatedFootprintMm(item.widthMm, item.depthMm, item.placement.rotationYDeg);
    return {
      id: item.productId,
      minX: item.placement.x - foot.widthMm / 2,
      maxX: item.placement.x + foot.widthMm / 2,
      minZ: item.placement.z - foot.depthMm / 2,
      maxZ: item.placement.z + foot.depthMm / 2,
    };
  });

  const out = new Set<string>();
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
      if (overlap) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  return out;
}
