import type { Point } from '../domain/types';

/**
 * КОНТУР НАТУРАЛЬНОГО СЛЕБА З ФОТО (27.08, задача власника).
 *
 * Натуральний камінь приїжджає нерівним: сколи, «відкушені» кути, крива
 * кромка. На фото ця частина знята на чорному тлі — тобто чорне поле
 * навколо каменю це НЕ камінь, а порожнеча. Досі програма вважала слеб
 * ідеальним прямокутником і спокійно клала деталь у той скол.
 *
 * Тут ми читаємо фото і відповідаємо на два питання:
 *   1. Де межа каменю — щоб у фоторежимі показати лист як він є, а не
 *      прямокутником із чорними кутами.
 *   2. Який шматок кута непридатний — щоб у технічному провести пряму
 *      «попри крайню допустиму точку» і поставити там дефект.
 *
 * ЧОМУ ЗАЛИВКА ВІД КРАЮ, А НЕ ПРОСТО «ТЕМНІ ПІКСЕЛІ». У камені повно
 * темних прожилок і майже чорних вкраплень. Якщо рахувати фоном усе
 * темне, зріз кута роздувається в кілька разів (перевірено на реальному
 * фото: 6% втрати перетворювались на 29%). Тому фон — це тільки те
 * темне, що ЗВ'ЯЗНЕ З КРАЄМ кадру: порожнеча приходить іззовні, а
 * прожилка всередині каменю нікуди не веде.
 *
 * Працює і з PNG із прозорістю (прозоре = фон), і з JPG на чорному тлі —
 * другий формат легший, тому саме його вантажать із фотобоксу.
 */

export type SlabCorner = 'TL' | 'TR' | 'BL' | 'BR';

export interface CornerCut {
  corner: SlabCorner;
  /** Довжина зрізу вздовж горизонтальної сторони, частка ширини слеба (0..1) */
  along: number;
  /** Довжина зрізу вздовж вертикальної сторони, частка висоти слеба (0..1) */
  down: number;
}

export interface SlabOutline {
  /** Межа каменю в частках слеба (0..1), за годинниковою стрілкою */
  polygon: Point[];
  /** Зрізані кути — з них народжуються дефекти */
  corners: CornerCut[];
  /** Частка кадру, яка не є каменем */
  lossShare: number;
}

/** Нижче цієї частки фону вважаємо лист рівним і нічого не обрізаємо */
const NOISE_SHARE = 0.004;
/** Поріг темного: усе, що темніше, — кандидат у фон */
const DARK_LEVEL = 38;
/** Ширина зменшеного кадру для аналізу: точності вистачає, рахується миттєво */
const SAMPLE_WIDTH = 360;

/**
 * Маска фону: прозоре або темне, зв'язне з краєм кадру.
 * Заливка ітеративна (стек), а не рекурсивна — рекурсія на кадрі
 * 360×220 переповнює стек браузера на суцільному чорному тлі.
 */
function backgroundMask(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const isDark = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < w * h; i += 1, p += 4) {
    const alpha = data[p + 3];
    const luma = (data[p] + data[p + 1] + data[p + 2]) / 3;
    isDark[i] = alpha < 32 || luma <= DARK_LEVEL ? 1 : 0;
  }

  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (isDark[i] && !bg[i]) { bg[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x += 1) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y += 1) { push(0, y); push(w - 1, y); }

  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return bg;
}

/**
 * Зріз одного кута.
 *
 * Беремо найдальші точки фону вздовж обох сторін і проводимо між ними
 * пряму. Далі розсуваємо її назовні рівно настільки, щоб ЖОДНА точка
 * фону цього кута не лишилась зовні трикутника, — це і є «попри крайню
 * допустиму точку»: усе, що всередині, гарантовано непридатне, і різати
 * там не можна.
 */
function cornerCut(bg: Uint8Array, w: number, h: number, corner: SlabCorner): CornerCut | null {
  const cx = corner === 'TL' || corner === 'BL' ? 0 : w - 1;
  const cy = corner === 'TL' || corner === 'TR' ? 0 : h - 1;

  let maxAlong = 0;
  let maxDown = 0;
  const near: Array<[number, number]> = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!bg[y * w + x]) continue;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      // Точка «належить» куту, якщо вона ближча до нього, ніж до протилежних
      if (dx / w + dy / h >= 0.5) continue;
      near.push([dx, dy]);
      if (dx > maxAlong) maxAlong = dx;
      if (dy > maxDown) maxDown = dy;
    }
  }
  if (near.length < 12 || !maxAlong || !maxDown) return null;

  let spread = 1;
  for (const [dx, dy] of near) {
    const need = dx / maxAlong + dy / maxDown;
    if (need > spread) spread = need;
  }
  const along = Math.min(maxAlong * spread, w - 1);
  const down = Math.min(maxDown * spread, h - 1);
  return { corner, along: along / w, down: down / h };
}

/** Межа каменю: по кожному стовпцю — верхня і нижня точка, далі обхід контуру */
function tracePolygon(bg: Uint8Array, w: number, h: number): Point[] {
  const step = Math.max(2, Math.round(w / 90));
  const top: Point[] = [];
  const bottom: Point[] = [];
  for (let x = 0; x < w; x += step) {
    let first = -1;
    let last = -1;
    for (let y = 0; y < h; y += 1) {
      if (!bg[y * w + x]) { if (first < 0) first = y; last = y; }
    }
    if (first < 0) continue;
    top.push({ x: x / (w - 1), y: first / (h - 1) });
    bottom.push({ x: x / (w - 1), y: last / (h - 1) });
  }
  if (top.length < 3) return [];
  return [...top, ...bottom.reverse()];
}

/** Аналіз готового кадру. Повертає null, якщо лист рівний і різати нічого. */
export function analyseSlabPixels(data: Uint8ClampedArray, w: number, h: number): SlabOutline | null {
  const bg = backgroundMask(data, w, h);
  let background = 0;
  for (let i = 0; i < bg.length; i += 1) background += bg[i];
  const lossShare = background / (w * h);
  if (lossShare < NOISE_SHARE) return null;

  const corners = (['TL', 'TR', 'BL', 'BR'] as SlabCorner[])
    .map((corner) => cornerCut(bg, w, h, corner))
    .filter(Boolean) as CornerCut[];

  return { polygon: tracePolygon(bg, w, h), corners, lossShare };
}

/**
 * Кеш за адресою фото. Фото слеба — це base64 або URL, який не міняється
 * без заміни знімка, тому один аналіз на фото за весь сеанс.
 */
const cache = new Map<string, Promise<SlabOutline | null>>();

export function slabOutlineFor(src: string): Promise<SlabOutline | null> {
  const hit = cache.get(src);
  if (hit) return hit;

  const task = new Promise<SlabOutline | null>((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const w = SAMPLE_WIDTH;
        const h = Math.max(8, Math.round((image.naturalHeight / image.naturalWidth) * SAMPLE_WIDTH));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(image, 0, 0, w, h);
        resolve(analyseSlabPixels(ctx.getImageData(0, 0, w, h).data, w, h));
      } catch {
        // Фото з чужого домену без CORS — читати пікселі не дадуть.
        // Це не помилка: просто лишаємось із прямокутним листом.
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });

  cache.set(src, task);
  return task;
}

/** Трикутник зрізу в міліметрах слеба — для дефекту і для креслення */
export function cornerTriangle(cut: CornerCut, width: number, height: number): Point[] {
  const along = cut.along * width;
  const down = cut.down * height;
  switch (cut.corner) {
    case 'TL': return [{ x: 0, y: 0 }, { x: along, y: 0 }, { x: 0, y: down }];
    case 'TR': return [{ x: width, y: 0 }, { x: width, y: down }, { x: width - along, y: 0 }];
    case 'BL': return [{ x: 0, y: height }, { x: 0, y: height - down }, { x: along, y: height }];
    default: return [{ x: width, y: height }, { x: width - along, y: height }, { x: width, y: height - down }];
  }
}

/** Ознака автоматичного дефекту: за нею його впізнають і не плодять удруге */
export const AUTO_DEFECT_PREFIX = 'auto_cut_';

/**
 * Той самий трикутник, але роздутий назовні на `margin` міліметрів.
 *
 * Скол — це не тільки порожнеча: біля самої лінії розлому камінь
 * ослаблений, і ставити деталь упритул до неї не можна так само, як не
 * можна різати впритул до кромки листа. Тому дефект від фото завжди
 * роздувається на мінімальний відступ слеба — той самий, яким живе
 * пунктир припуску.
 *
 * Роздуваємо подібністю: відстань від кута до гіпотенузи `d = a·b/√(a²+b²)`,
 * потрібна `d + margin`, отже обидві сторони множимо на `(d + margin)/d`.
 * Пряма лишається паралельною сама собі — саме це й означає «відступ».
 */
export function inflateCornerCut(cut: CornerCut, width: number, height: number, margin: number): CornerCut {
  const a = cut.along * width;
  const b = cut.down * height;
  if (a <= 0 || b <= 0 || margin <= 0) return cut;
  const d = (a * b) / Math.hypot(a, b);
  const k = (d + margin) / d;
  return {
    corner: cut.corner,
    along: Math.min((a * k) / width, 1),
    down: Math.min((b * k) / height, 1),
  };
}

/** Півплощина «залишити» для одного зрізаного кута: ax + by <= c */
function cutHalfPlane(cut: CornerCut, width: number, height: number) {
  const a = cut.along * width;
  const b = cut.down * height;
  switch (cut.corner) {
    // Лишаємо те, що ДАЛІ від кута: x/a + y/b >= 1  →  -x/a - y/b <= -1
    case 'TL': return { ax: -1 / a, by: -1 / b, c: -1, ox: 0, oy: 0 };
    case 'TR': return { ax: 1 / a, by: -1 / b, c: (width / a) - 1, ox: 0, oy: 0 };
    case 'BL': return { ax: -1 / a, by: 1 / b, c: (height / b) - 1, ox: 0, oy: 0 };
    default: return { ax: 1 / a, by: 1 / b, c: (width / a) + (height / b) - 1, ox: 0, oy: 0 };
  }
}

/**
 * Контур припуску з урахуванням сколів (Сазерленд–Ходжман).
 *
 * Було: пунктир припуску завжди прямокутний, і в куті зі сколом він
 * спокійно проходив по порожнечі — «корисна зона» брехала рівно там, де
 * менеджер найуважніше дивиться. Тепер прямокутник послідовно зрізається
 * півплощиною кожного скола.
 */
export function usableAreaPolygon(
  width: number,
  height: number,
  margin: number,
  corners: CornerCut[],
): Point[] {
  let polygon: Point[] = [
    { x: margin, y: margin },
    { x: width - margin, y: margin },
    { x: width - margin, y: height - margin },
    { x: margin, y: height - margin },
  ];

  for (const cut of corners) {
    const { ax, by, c } = cutHalfPlane(inflateCornerCut(cut, width, height, margin), width, height);
    const inside = (p: Point) => ax * p.x + by * p.y <= c + 1e-9;
    const cross = (p: Point, q: Point) => {
      const dp = ax * p.x + by * p.y - c;
      const dq = ax * q.x + by * q.y - c;
      const t = dp / (dp - dq);
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    };

    const next: Point[] = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const current = polygon[i];
      const following = polygon[(i + 1) % polygon.length];
      const currentIn = inside(current);
      const followingIn = inside(following);
      if (currentIn) next.push(current);
      if (currentIn !== followingIn) next.push(cross(current, following));
    }
    polygon = next;
    if (polygon.length < 3) return [];
  }
  return polygon;
}
