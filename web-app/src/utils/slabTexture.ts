/**
 * Процедурна текстура слябу для демонстрації каталогу.
 *
 * ⚠ ЦЕ ЗАГЛУШКА ДЛЯ ПОКАЗУ МЕХАНІКИ. У бойовій версії фото слябу приходить
 * із довідника номенклатур (керамограніт, кварцит) або завантажується
 * менеджером вручну (натуральний камінь — кожен лист унікальний).
 *
 * Малюємо на canvas і віддаємо data-URL, щоб картинка пішла тим самим
 * шляхом, що й справжнє фото: список слябів, шапка розкрою, підбір
 * текстури, 3D. Тоді при підключенні довідника міняється лише джерело
 * рядка — решта коду не чіпається.
 */

export type TextureKind =
  | 'MARBLE' | 'CONCRETE' | 'UNICOLOR' | 'SANDSTONE'
  | 'TRAVERTINE' | 'STONE' | 'STONE CRUMB' | 'GRANITE'
  | 'QUARTZITE' | 'WOOD';

/** Три тони декору: фон, світлий, темний */
export type Tone = [string, string, string];

const hexToRgb = (hex: string): [number, number, number] => {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
};

const mix = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`;
};

/** Детермінований псевдовипадковий: та сама текстура на той самий артикул */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const seedOf = (key: string) => {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** CSS-градієнт для картки каталогу — дешевий прев'ю без canvas */
export const toneToCss = (tone: Tone) =>
  `linear-gradient(135deg, ${tone[1]}, ${tone[0]} 45%, ${tone[2]})`;

/**
 * Текстура слябу → data-URL (JPEG).
 * `key` (артикул) робить малюнок стабільним між перезапусками.
 */
export function makeSlabTexture(
  tone: Tone,
  kind: TextureKind,
  key: string,
  width = 1024,
  height = 512,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const rnd = seeded(seedOf(key));

  // ── підкладка: діагональний градієнт трьох тонів ──────────────────
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, tone[1]);
  base.addColorStop(0.45, tone[0]);
  base.addColorStop(1, tone[2]);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // ── великі м'які плями — глибина каменю ───────────────────────────
  const blotches = kind === 'UNICOLOR' ? 5 : 16;
  for (let i = 0; i < blotches; i++) {
    const x = rnd() * width;
    const y = rnd() * height;
    const r = (0.08 + rnd() * 0.22) * width;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() > 0.5;
    g.addColorStop(0, mix(tone[0], light ? tone[1] : tone[2], 0.5));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── прожилки: мармур і кварцит ────────────────────────────────────
  if (kind === 'MARBLE' || kind === 'QUARTZITE' || kind === 'TRAVERTINE') {
    const veins = kind === 'TRAVERTINE' ? 14 : 9;
    for (let v = 0; v < veins; v++) {
      const thick = kind === 'TRAVERTINE' ? 1 + rnd() * 2 : 1 + rnd() * 6;
      ctx.strokeStyle = mix(tone[2], tone[1], rnd() * 0.5);
      ctx.globalAlpha = 0.18 + rnd() * 0.32;
      ctx.lineWidth = thick;
      ctx.beginPath();
      // травертин — горизонтальна шаровість, мармур — діагональні жили
      let x = kind === 'TRAVERTINE' ? 0 : -width * 0.1 + rnd() * width;
      let y = kind === 'TRAVERTINE' ? rnd() * height : -20;
      ctx.moveTo(x, y);
      const steps = 22;
      for (let s = 0; s < steps; s++) {
        if (kind === 'TRAVERTINE') {
          x += width / steps;
          y += (rnd() - 0.5) * 6;
        } else {
          x += (rnd() - 0.35) * (width / steps) * 1.6;
          y += height / steps;
        }
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      // тонка супутня жилка — так мармур виглядає живішим
      if (kind === 'MARBLE' && rnd() > 0.45) {
        ctx.globalAlpha *= 0.5;
        ctx.lineWidth = Math.max(0.6, thick * 0.3);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── крихта / зерно: бетон, пісковик, граніт, камінь ───────────────
  if (kind !== 'MARBLE' && kind !== 'UNICOLOR' && kind !== 'WOOD') {
    const grains = kind === 'STONE CRUMB' || kind === 'GRANITE' ? 5200 : 2200;
    for (let i = 0; i < grains; i++) {
      const x = rnd() * width;
      const y = rnd() * height;
      const r = kind === 'STONE CRUMB' ? 0.6 + rnd() * 2.6 : 0.4 + rnd() * 1.2;
      ctx.globalAlpha = 0.05 + rnd() * 0.22;
      ctx.fillStyle = rnd() > 0.5 ? tone[1] : tone[2];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── дерево: поздовжні волокна ─────────────────────────────────────
  if (kind === 'WOOD') {
    for (let i = 0; i < 90; i++) {
      const y = rnd() * height;
      ctx.strokeStyle = rnd() > 0.5 ? tone[1] : tone[2];
      ctx.globalAlpha = 0.06 + rnd() * 0.14;
      ctx.lineWidth = 0.6 + rnd() * 2.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= width; x += width / 16) ctx.lineTo(x, y + (rnd() - 0.5) * 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ── легка віньєтка, щоб лист не виглядав пласким ──────────────────
  const vig = ctx.createRadialGradient(width / 2, height / 2, height * 0.25, width / 2, height / 2, width * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  return canvas.toDataURL('image/jpeg', 0.82);
}
