/**
 * РЕНДЕР КАРТИ ЦЕХУ — ізометрія в SVG-рядок (06.09.2026).
 * Рішень «що» тут немає — лише «як намалювати» дані з data/shopMap.ts.
 * Диметрія: x (потік) під 14°, y (глиб) під 44°; 1 м = S px.
 * Кольори — CSS-змінні `--machine-top` тощо (MesTab дає їх у <style>).
 */
import { HALL, STAGES, FLOW, BRANCH, REVERSE, AREAS, type ShopArea, type AreaModel } from './data/shopMap';

type Pt = [number, number];
const S = 15, AX = 14 * Math.PI / 180, AY = 44 * Math.PI / 180;
const OX = HALL.d * Math.cos(AY) * S + 30, OY = 40;
/** Проєкція точки цеху (м) у координати SVG. */
export const P = (x: number, y: number, z = 0): Pt => [OX + x * Math.cos(AX) * S - y * Math.cos(AY) * S, OY + x * Math.sin(AX) * S + y * Math.sin(AY) * S - z * S * 0.9];
const pt = (a: Pt) => a.map((n) => n.toFixed(1)).join(',');
const poly = (pts: Pt[], fill: string, stroke: string, extra = '') => `<polygon points="${pts.map(pt).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="0.8" stroke-linejoin="round" ${extra}/>`;
const box = (x: number, y: number, w: number, d: number, z0: number, h: number, c: string) => {
  const T = c + '-top', L = c + '-l', R = c + '-r', E = c + '-edge';
  return poly([P(x, y + d, z0), P(x + w, y + d, z0), P(x + w, y + d, z0 + h), P(x, y + d, z0 + h)], `var(--${L})`, `var(--${E})`)
    + poly([P(x + w, y + d, z0), P(x + w, y, z0), P(x + w, y, z0 + h), P(x + w, y + d, z0 + h)], `var(--${R})`, `var(--${E})`)
    + poly([P(x, y, z0 + h), P(x + w, y, z0 + h), P(x + w, y + d, z0 + h), P(x, y + d, z0 + h)], `var(--${T})`, `var(--${E})`);
};
const line = (a: Pt, b: Pt, stroke: string, extra = '') => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${stroke}" stroke-width="0.8" ${extra}/>`;
const slab = (x: number, y: number, z: number, w: number, h: number, lean: number, c: string) => poly([P(x, y, z), P(x + w, y, z), P(x + w, y + lean, z + h), P(x, y + lean, z + h)], `var(--${c})`, `var(--${c}-edge)`);

// моделі
export const MODELS: Record<AreaModel, (a: ShopArea) => string> = {
  combicut(a: ShopArea): string {
    let s = box(a.x, a.y, a.w, a.d, 0, 0.9, 'machine');
    for (let i = 0; i < 4; i++) s += line(P(a.x + 0.4, a.y + 0.4 + i * (a.d - 0.8) / 3, 0.9), P(a.x + a.w - 0.4, a.y + 0.4 + i * (a.d - 0.8) / 3, 0.9), 'var(--machine-edge)');
    const bx = a.x + a.w * 0.45;
    s += box(bx, a.y - 0.4, 0.6, 0.6, 0, 3.2, 'machine') + box(bx, a.y + a.d - 0.2, 0.6, 0.6, 0, 3.2, 'machine');
    s += box(bx - 0.1, a.y - 0.4, 0.8, a.d + 0.8, 2.6, 0.6, 'machine');
    s += box(bx + 0.05, a.y + a.d * 0.35, 0.5, 1.2, 1.5, 1.1, 'machine');
    s += poly([P(bx + 0.3, a.y + a.d * 0.35 + 0.3, 0.9), P(bx + 0.3, a.y + a.d * 0.35 + 1.5, 0.9), P(bx + 0.3, a.y + a.d * 0.35 + 1.5, 1.6), P(bx + 0.3, a.y + a.d * 0.35 + 0.3, 1.6)], 'var(--slab)', 'var(--slab-edge)');
    s += box(a.x + a.w - 1.2, a.y + a.d + 0.3, 1.2, 0.8, 0, 1.6, 'machine');
    return s;
  },
  nc300(a: ShopArea): string {
    let s = box(a.x, a.y, a.w, a.d, 0, 0.9, 'machine');
    for (let i = 1; i < 5; i++) s += line(P(a.x + 0.3, a.y + i * a.d / 5, 0.9), P(a.x + a.w - 0.3, a.y + i * a.d / 5, 0.9), 'var(--machine-edge)');
    for (let i = 1; i < 7; i++) s += line(P(a.x + i * a.w / 7, a.y + 0.3, 0.9), P(a.x + i * a.w / 7, a.y + a.d - 0.3, 0.9), 'var(--machine-edge)');
    s += box(a.x, a.y - 0.5, a.w, 0.5, 0, 2.4, 'machine') + box(a.x, a.y + a.d, a.w, 0.5, 0, 2.4, 'machine');
    const gx = a.x + a.w * 0.6;
    s += box(gx, a.y - 0.5, 0.7, a.d + 1, 2.0, 0.6, 'machine');
    s += box(gx + 0.1, a.y + a.d * 0.4, 0.5, 0.7, 1.2, 0.9, 'machine');
    s += box(a.x + a.w + 0.2, a.y + 0.3, 0.7, 1.6, 0, 1.4, 'machine');
    return s;
  },
  waterjet(a: ShopArea): string {
    let s = box(a.x, a.y, a.w, a.d, 0, 1.1, 'machine');
    s += poly([P(a.x + 0.3, a.y + 0.3, 1.1), P(a.x + a.w - 0.3, a.y + 0.3, 1.1), P(a.x + a.w - 0.3, a.y + a.d - 0.3, 1.1), P(a.x + 0.3, a.y + a.d - 0.3, 1.1)], 'var(--water)', 'var(--machine-edge)');
    s += box(a.x, a.y - 0.4, 0.5, 0.4, 0, 2.2, 'machine') + box(a.x, a.y + a.d, 0.5, 0.4, 0, 2.2, 'machine');
    s += box(a.x - 0.1, a.y - 0.4, 0.7, a.d + 0.8, 1.8, 0.4, 'machine');
    s += box(a.x + 0.05, a.y + a.d * 0.5, 0.5, 0.5, 1.1, 0.7, 'machine');
    s += box(a.x + a.w + 0.3, a.y + 1, 1.2, 1.2, 0, 1.4, 'machine');
    return s;
  },
  saw2(a: ShopArea): string {
    let s = box(a.x, a.y, a.w, a.d, 0, 0.9, 'machine');
    s += box(a.x + a.w * 0.5, a.y - 0.3, 0.4, a.d + 0.6, 0, 2.2, 'machine');
    s += box(a.x + a.w * 0.5, a.y + a.d * 0.4, 0.5, 0.6, 1.2, 0.8, 'machine');
    return s;
  },
  panda(a: ShopArea): string {
    let s = box(a.x, a.y, a.w, a.d, 0, 0.9, 'machine');
    for (let i = 1; i < Math.floor(a.w / 0.5); i++) s += line(P(a.x + i * 0.5, a.y + 0.2, 0.9), P(a.x + i * 0.5, a.y + a.d - 0.2, 0.9), 'var(--machine-edge)');
    for (let i = 0; i < 4; i++) s += box(a.x + 1 + i * (a.w - 2) / 3.2, a.y + a.d - 0.9, 0.7, 0.7, 0.9, 0.9, 'machine');
    s += box(a.x + 0.8, a.y + a.d - 1.0, a.w - 1.6, 0.4, 1.5, 0.3, 'machine');
    return s;
  },
  wanlong(a: ShopArea): string {
    let s = box(a.x, a.y, a.w, a.d, 0, 0.9, 'machine');
    for (let i = 1; i < Math.floor(a.w / 0.6); i++) s += line(P(a.x + i * 0.6, a.y + 0.2, 0.9), P(a.x + i * 0.6, a.y + a.d - 0.2, 0.9), 'var(--machine-edge)');
    s += box(a.x + 1.2, a.y - 0.3, a.w - 2.4, 0.5, 0, 2.0, 'machine') + box(a.x + 1.2, a.y + a.d - 0.2, a.w - 2.4, 0.5, 0, 2.0, 'machine');
    for (let i = 0; i < 7; i++) s += box(a.x + 1.6 + i * (a.w - 3.6) / 6, a.y + a.d * 0.5 - 0.3, 0.6, 0.6, 1.0, 0.7, 'machine');
    s += box(a.x + 1.2, a.y - 0.3, a.w - 2.4, a.d + 0.6, 1.9, 0.25, 'machine');
    s += slab(a.x + 0.2, a.y + 0.5, 0.9, 0.9, 0, 1.4, 'slab');
    return s;
  },
  table(a: ShopArea): string {
    let s = '';
    const n = a.n || 1, gap = 0.5, tw = (a.w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const x = a.x + i * (tw + gap);
      s += box(x, a.y, tw, a.d, 0.75, 0.15, 'manual');
      for (const [lx, ly] of [[x + 0.1, a.y + 0.1], [x + tw - 0.2, a.y + 0.1], [x + 0.1, a.y + a.d - 0.2], [x + tw - 0.2, a.y + a.d - 0.2]]) s += box(lx, ly, 0.1, 0.1, 0, 0.75, 'manual');
      s += slab(x + 0.3, a.y + 0.25, 0.9, tw - 0.6, 0.06, a.d - 0.5, 'slab');
    }
    return s;
  },
  wet(a: ShopArea): string {
    let s = '';
    const n = a.n || 1, gap = 0.5, tw = (a.w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const x = a.x + i * (tw + gap);
      s += box(x, a.y, tw, a.d, 0, 0.85, 'manual');
      s += poly([P(x + 0.15, a.y + 0.15, 0.85), P(x + tw - 0.15, a.y + 0.15, 0.85), P(x + tw - 0.15, a.y + a.d - 0.15, 0.85), P(x + 0.15, a.y + a.d - 0.15, 0.85)], 'var(--water)', 'var(--manual-edge)');
      s += slab(x + 0.4, a.y + 0.3, 0.9, tw - 0.8, 0.06, a.d - 0.6, 'slab');
    }
    return s;
  },
  frames(a: ShopArea): string {
    let s = '';
    const n = a.n || 1, gap = 0.4, fw = (a.w - gap * (n - 1)) / n, h = 1.9;
    for (let i = 0; i < n; i++) {
      const x = a.x + i * (fw + gap);
      s += box(x, a.y, fw, a.d, 0, 0.12, 'buffer');
      s += poly([P(x, a.y, 0.12), P(x, a.y + a.d, 0.12), P(x, a.y + a.d / 2, h)], 'var(--buffer-l)', 'var(--buffer-edge)');
      s += poly([P(x + fw, a.y, 0.12), P(x + fw, a.y + a.d, 0.12), P(x + fw, a.y + a.d / 2, h)], 'var(--buffer-r)', 'var(--buffer-edge)');
      s += line(P(x, a.y + a.d / 2, h), P(x + fw, a.y + a.d / 2, h), 'var(--buffer-edge)', 'stroke-width="1.6"');
      for (let k = 0; k < 3; k++) {
        const off = 0.25 + k * 0.28;
        s += poly([P(x + 0.2, a.y + a.d - off, 0.12), P(x + fw - 0.2, a.y + a.d - off, 0.12), P(x + fw - 0.2, a.y + a.d / 2 + 0.15, h - 0.25), P(x + 0.2, a.y + a.d / 2 + 0.15, h - 0.25)], 'var(--slab)', 'var(--slab-edge)');
      }
    }
    return s;
  },
  pyramid(a: ShopArea): string { return MODELS.frames({ ...a, n: 1 }); },
  trolleys(a: ShopArea): string {
    let s = '';
    const n = a.n || 1, gap = 0.6, tw = (a.w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const x = a.x + i * (tw + gap);
      s += box(x, a.y, tw, a.d, 0.3, 0.12, 'buffer');
      for (const [lx, ly] of [[x + 0.1, a.y + 0.1], [x + tw - 0.25, a.y + 0.1], [x + 0.1, a.y + a.d - 0.25], [x + tw - 0.25, a.y + a.d - 0.25]]) s += box(lx, ly, 0.15, 0.15, 0, 0.3, 'buffer');
      s += box(x + 0.2, a.y + a.d * 0.5 - 0.05, tw - 0.4, 0.1, 0.42, 1.3, 'buffer');
      for (let k = 0; k < 3; k++) s += poly([P(x + 0.3, a.y + a.d * 0.5 + 0.2 + k * 0.22, 0.42), P(x + tw - 0.3, a.y + a.d * 0.5 + 0.2 + k * 0.22, 0.42), P(x + tw - 0.3, a.y + a.d * 0.5 + 0.1 + k * 0.22, 1.5), P(x + 0.3, a.y + a.d * 0.5 + 0.1 + k * 0.22, 1.5)], 'var(--slab)', 'var(--slab-edge)');
    }
    return s;
  },
  cassette(a: ShopArea): string {
    let s = box(a.x, a.y, a.w, a.d, 0, 2.6, 'store');
    for (let i = 1; i < Math.floor(a.w / 0.5); i++) s += line(P(a.x + i * 0.5, a.y + a.d, 0), P(a.x + i * 0.5, a.y + a.d, 2.6), 'var(--store-edge)');
    for (let i = 1; i < Math.floor(a.w / 0.5); i++) s += line(P(a.x + i * 0.5, a.y, 2.6), P(a.x + i * 0.5, a.y + a.d, 2.6), 'var(--store-edge)');
    return s;
  },
  floor(a: ShopArea): string {
    let s = poly([P(a.x, a.y), P(a.x + a.w, a.y), P(a.x + a.w, a.y + a.d), P(a.x, a.y + a.d)], 'var(--control-top)', 'var(--control-edge)', 'stroke-dasharray="4 3" fill-opacity="0.45"');
    for (let i = 0; i < 4; i++) s += slab(a.x + 0.6 + i * 1.3, a.y + 0.8 + (i % 2) * 1.6, 0, 1.0, 0.06, 1.2, 'slab');
    return s;
  },
};

export const KIND: Record<ShopArea['type'], string> = { machine: 'верстат', manual: 'ручна ділянка', buffer: 'буфер', control: 'контроль / логістика', store: 'склад', zone: 'зона' };

const byId = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<string, ShopArea>;
const centre = (a: ShopArea): Pt => P(a.x + a.w / 2, a.y + a.d / 2, 0.2);

function arrow(a: string, b: string, cls: 'flow' | 'rev', label?: string): string {
  const A = centre(byId[a]), B = centre(byId[b]);
  const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, cut = 26;
  const A2: Pt = [A[0] + ux * cut, A[1] + uy * cut], B2: Pt = [B[0] - ux * cut, B[1] - uy * cut];
  const mid: Pt = [(A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2];
  const bend: Pt = cls === 'rev' ? [mid[0] - uy * 46, mid[1] + ux * 46] : mid;
  const d = `M${pt(A2)} Q${pt(bend)} ${pt(B2)}`;
  const t = label ? `<text x="${bend[0].toFixed(1)}" y="${(bend[1] - 6).toFixed(1)}" font-size="9.5" text-anchor="middle" fill="var(--reverse)" paint-order="stroke" stroke="var(--paper)" stroke-width="3">${label}</text>` : '';
  return `<path d="${d}" fill="none" stroke="var(--${cls === 'rev' ? 'reverse' : 'flow'})" stroke-width="${cls === 'rev' ? 1.6 : 2}" ${cls === 'rev' ? 'stroke-dasharray="6 4"' : ''} marker-end="url(#${cls === 'rev' ? 'arrRev' : 'arr'})"/>${t}`;
}

export interface ShopSvg { inner: string; viewBox: string }

/** Уся карта як innerHTML для <svg>. Тепло і бейджі — порожні, їх заповнює вкладка після симуляції. */
export function renderShopSvg(): ShopSvg {
  const corners = [P(0, 0), P(HALL.w, 0), P(HALL.w, HALL.d), P(0, HALL.d)];
  const W = Math.ceil(Math.max(...corners.map((c) => c[0])) + 150), H = Math.ceil(Math.max(...corners.map((c) => c[1])) + 44);
  let s = `<defs>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--flow)"/></marker>
    <marker id="arrRev" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--reverse)"/></marker>
  </defs>`;
  s += poly([P(0, 0), P(HALL.w, 0), P(HALL.w, HALL.d), P(0, HALL.d)], 'var(--floor)', 'var(--ink)', 'stroke-width="1.4"');
  s += `<g data-layer="grid">`;
  for (let x = 0; x <= HALL.w; x += 1) s += line(P(x, 0), P(x, HALL.d), 'var(--grid)');
  for (let y = 0; y <= HALL.d; y += 1) s += line(P(0, y), P(HALL.w, y), 'var(--grid)');
  s += `</g>`;
  for (const st of STAGES) {
    s += poly([P(st.x0, 0), P(st.x1, 0), P(st.x1, HALL.d), P(st.x0, HALL.d)], 'var(--stage)', 'var(--line)', 'stroke-dasharray="3 3"');
    const lp = P((st.x0 + st.x1) / 2, HALL.d + 1.2);
    s += `<text class="stagelbl" x="${lp[0].toFixed(1)}" y="${(lp[1] + 4).toFixed(1)}" text-anchor="middle">ЕТАП ${st.n} · ${st.name}</text>`;
  }
  s += `<g data-layer="flow">`;
  for (let i = 0; i < FLOW.length - 1; i++) s += arrow(FLOW[i], FLOW[i + 1], 'flow');
  for (const [a, b] of BRANCH) s += arrow(a, b, 'flow');
  s += `</g>`;
  const order = [...AREAS].sort((p, q) => (p.x + p.y) - (q.x + q.y));
  for (const a of order) {
    const draw = MODELS[a.model] ?? MODELS.table;
    const lp = P(a.x + a.w / 2, a.y + a.d / 2, 3.4);
    const heat = poly([P(a.x - 0.25, a.y - 0.25), P(a.x + a.w + 0.25, a.y - 0.25), P(a.x + a.w + 0.25, a.y + a.d + 0.25), P(a.x - 0.25, a.y + a.d + 0.25)], 'none', 'none', 'class="heat" fill-opacity="0"');
    const hl = poly([P(a.x - 0.3, a.y - 0.3), P(a.x + a.w + 0.3, a.y - 0.3), P(a.x + a.w + 0.3, a.y + a.d + 0.3), P(a.x - 0.3, a.y + a.d + 0.3)], 'none', 'var(--sel)', 'class="hl"');
    s += `<g class="area" data-id="${a.id}" tabindex="0" role="button" aria-label="${a.name}">${heat}${hl}${draw(a)}<g class="names"><text class="lbl" x="${lp[0].toFixed(1)}" y="${lp[1].toFixed(1)}" text-anchor="middle">${a.name}</text><text class="sub" x="${lp[0].toFixed(1)}" y="${(lp[1] + 11).toFixed(1)}" text-anchor="middle">${a.status === 'ФАКТ' ? '' : a.status}</text><text class="badge lbl" x="${lp[0].toFixed(1)}" y="${(lp[1] - 12).toFixed(1)}" text-anchor="middle" font-size="10.5"></text></g></g>`;
  }
  s += `<g data-layer="rev">`;
  for (const r of REVERSE) s += arrow(r.a, r.b, 'rev', r.label);
  s += `</g>`;
  const mo = P(HALL.w + 0.5, 10.5, 0.2), me = P(HALL.w + 4, 10.5, 0.2);
  s += `<path d="M${pt(mo)} L${pt(me)}" stroke="var(--flow)" stroke-width="2" marker-end="url(#arr)"/><text x="${(me[0] + 6).toFixed(1)}" y="${(me[1] + 4).toFixed(1)}" font-size="12" font-weight="700" fill="var(--flow)">МОНТАЖ на об'єкті</text>`;
  return { inner: s, viewBox: `0 0 ${W} ${H}` };
}
