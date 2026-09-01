import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { CornerProcessing, DetailPart, EdgeProfileSelection, SurfaceCutout } from '../domain/types';
import { normalizeEdgeTreatment, edgeTreatmentSpan, slicePolylineByLength } from '../domain/edgeTreatment';
import {
  sideContourRange,
  sideVertexIndices,
  edgeLengthForSide,
  sideNeighbours,
  sidesInContourOrder,
} from './geometryUtils';

/**
 * РІЗАКИ ТОРЦІВ ДЛЯ 3D (28.08.2026, рішення власника).
 *
 * Підхід — не «намалювати профіль з каталогу», а «просимулювати
 * інструмент»: перетин фрези протягується вздовж ребра деталі й
 * ВІДНІМАЄТЬСЯ від тіла (CSG вже живе у Viewer3D — загини 45° ріжуться
 * ним давно). Звідси все інше:
 *
 *  · ЗОВНІШНІЙ кут: фрезі ніщо не заважає — різак продовжується за межу
 *    плити, два різаки сусідніх сторін перетинаються і кут сходиться
 *    сам, як у житті. Окремої математики мітри НЕМАЄ.
 *  · ВНУТРІШНІЙ кут: фреза впирається — різак зупиняється рівно на
 *    вершині. Профіль «обривається», бо обривається залізо.
 *
 * Сторони беруться з тих САМИХ сегментів контуру, за якими рушій фактів
 * рахує метри крайки (sideContourRange: дуга кутового радіуса ділиться
 * навпіл між сусідніми сторонами — фреза не зупиняється перед дугою).
 * Тому лінія в 3D, лінія на карті крою і метраж у кошторисі — одне.
 *
 * РАДІУСИ (01.09.2026, друга ітерація). Перетин уже не тягнеться окремою
 * призмою по кожній хорді — він ставиться в кожній вершині шляху по
 * бісектрисі і з'єднується в одне тіло (лофт), як реально йде фреза.
 * Опуклі й увігнуті дуги без щілин, кут із галочкою «Обробка торців»
 * і периметр вирізу теж ріжуться. Подробиці — у блоці «ШЛЯХ ФРЕЗИ».
 *
 * ПЕРЕТИНИ. Точні кресленя форм живуть у цеху; тут — чесні наближення
 * за описами довідника (domain/defaults): клас форми правильний
 * (фаска / радіус / бульноз / увігнута / піднутрення), міліметри
 * уточнюються довідкою цеху через ЦЮ таблицю, більше ніде. Профіль,
 * якого таблиця не знає, НЕ ріжеться взагалі — чесний прямий торець
 * кращий за вигадану форму.
 *
 * Координати результату — ЛОКАЛЬНИЙ простір меша TexturedPart після
 * всіх його трансформацій: X=(px−w/2)·s, Z=(py−h/2)·s, Y — товщина,
 * верх плити на Y=+t/2. Різак підставляється у CSG без матриць.
 */

const S = 0.001;
/** Запас різака назовні від матеріалу, мм — щоб CSG різав без плівок. */
const OUT_MM = 4;
/**
 * «Закус» різака, мм: весь перетин зсувається назовні на цю волосину.
 * Без нього найглибша точка профілю (дуга бульноза, вершина фаски)
 * лежить РІВНО в площині сусіднього торця — а коінцидентні площини для
 * CSG це голки-артефакти на кутах. 0.2 мм око не бачить, фізиці не
 * суперечить (фреза і в цеху не виходить у нуль), артефакти зникають.
 */
const BITE_MM = 0.2;
const ARC_SEGMENTS = 10;

type CrossPoint = { v: number; y: number };

/** Форма перетину інструмента. Розміри в мм. */
type ShapeSpec =
  | { kind: 'chamfer'; size: number }
  | { kind: 'radius'; size: number }
  | { kind: 'halfbull' }
  | { kind: 'fullbull' }
  | { kind: 'cove'; size: number }
  /** Скіс від верху до низу під кутом; `radius` — заокруглення верхнього ребра над скосом (D12: R2, XD20: R7,5). */
  | { kind: 'shark'; angleDeg: number; radius?: number };

/** Що профіль робить з ребрами: top — лицьове, bottom — тильне. */
type ProfileCut = { top?: ShapeSpec; bottom?: ShapeSpec };

const chamfer = (size: number): ShapeSpec => ({ kind: 'chamfer', size });
const radius = (size: number): ShapeSpec => ({ kind: 'radius', size });
const both = (spec: ShapeSpec): ProfileCut => ({ top: spec, bottom: spec });

/**
 * profileId → перетин. ЄДИНЕ місце правок розмірів.
 * Парність (в/н) зашита в самі id — так історично пише прайс.
 */
const PROFILE_CUTS: Record<string, ProfileCut> = {
  // базові
  tech_chamfer: { top: chamfer(1) },
  chamfer_2x2: { top: chamfer(2) },
  chamfer_2x2_top_bottom: both(chamfer(2)),
  r2_top: { top: radius(2) },
  r2_top_bottom: both(radius(2)),
  chamfered_edge: { top: chamfer(5) },
  half_bullnose: { top: { kind: 'halfbull' } },
  full_bullnose: { top: { kind: 'fullbull' } },
  sharknose: { top: { kind: 'shark', angleDeg: 45 } },
  chamfer_45_r2: { top: { kind: 'shark', angleDeg: 45, radius: 2 } },
  edge_45: { top: { kind: 'shark', angleDeg: 45 } },
  // серія 12 (керамограніт) — за розрізами каталогу цеху «Все кромки» 17.09.25
  // (01.09.2026, Д-1: до того D12 був бульнозом, AR12 — радіусом, T12 — фаскою;
  // власник побачив XD20 у 3D як повне заокруглення)
  d_12: { top: { kind: 'shark', angleDeg: 45, radius: 2 } },   // R2 зверху, під ним скіс 45° до низу
  ar_12: both(chamfer(2)),                                     // фаска 2×2 зверху і знизу
  t_12: both(radius(2)),                                       // R2 зверху і знизу
  z_12: { top: chamfer(2) },
  zs_12: { top: chamfer(2) },
  zr_12: { top: radius(2) },
  zs_4: { top: chamfer(1.5) },
  zs_6_15: { top: chamfer(1.5) },
  zs_6_3: { top: chamfer(3) },
  // серія 20/40 (кварцит)
  ar_20: both(chamfer(2)),                                     // фаска 2×2 зверху і знизу
  d_20: { top: { kind: 'fullbull' } },                         // креслення в каталозі нема — наближення
  xd_20: { top: { kind: 'shark', angleDeg: 45, radius: 7.5 } }, // R7,5 зверху, під ним скіс 45° до низу
  h_40: { top: chamfer(5) },
  r_3: { top: radius(3) },
  r_5: { top: radius(5) },
  r_10: { top: radius(10) },
  t_20: both(radius(3)),                                       // R3 зверху і знизу
  z_20: { top: chamfer(2) },
  zs_20: { top: chamfer(2) },
  l_20: { top: { kind: 'cove', size: 10 } },
  lv_40: { top: radius(10) },
  lv_40_inv: { bottom: radius(10) },
  o_40: { top: radius(10) },
  u_40: { top: radius(10) },
  // акрил
  acr_r3: { top: radius(3) },
  acr_r6: { top: radius(6) },
  acr_r8: { top: radius(8) },
  acr_r10: { top: radius(10) },
  acr_r12: { top: radius(12) },
  acr_r20: { top: radius(20) },
  acr_r3_3: both(radius(3)),
  acr_r6_6: both(radius(6)),
  acr_r8_8: both(radius(8)),
  acr_bullnose_r10: { top: { kind: 'fullbull' } },
  acr_bullnose_r12: { top: { kind: 'fullbull' } },
  acr_ch_5x5: { top: chamfer(5) },
  acr_ch_10x10: { top: chamfer(10) },
  acr_ch_5x5_5x5: both(chamfer(5)),
  acr_ch_10x10_10x10: both(chamfer(10)),
  acr_cove_r6: { top: { kind: 'cove', size: 6 } },
  acr_cove_r6_6: both({ kind: 'cove', size: 6 }),
  acr_fillet_r10r12: { top: { kind: 'cove', size: 10 } },
  acr_shark45_r0: { top: { kind: 'shark', angleDeg: 45 } },
  acr_shark45_r3: { top: { kind: 'shark', angleDeg: 45, radius: 3 } },
  acr_shark45_r6: { top: { kind: 'shark', angleDeg: 45, radius: 6 } },
  acr_shark55_r0: { top: { kind: 'shark', angleDeg: 55 } },
  acr_shark55_r2: { top: { kind: 'shark', angleDeg: 55, radius: 2 } },
  acr_shark55_r3: { top: { kind: 'shark', angleDeg: 55, radius: 3 } },
  acr_shark55_r6: { top: { kind: 'shark', angleDeg: 55, radius: 6 } },
  acr_shark225_r0: { top: { kind: 'shark', angleDeg: 22.5 } },
  acr_shark225_r3: { top: { kind: 'shark', angleDeg: 22.5, radius: 3 } },
  acr_shark225_r6: { top: { kind: 'shark', angleDeg: 22.5, radius: 6 } },
  acr_modern: { top: radius(2) },
  acr_spill_stop: { top: radius(2) },
  acr_classic1: { top: radius(10) },
  acr_classic2: both(radius(10)),
  // свідомо БЕЗ різака: полірування форми не міняє
  polished_straight: {},
  straight_edge: {},
  antik: {},
};

/** Чи профіль взагалі щось знімає (для швидких перевірок ззовні). */
export function profileCutsMaterial(profileId: string | undefined): boolean {
  if (!profileId) return false;
  const cut = PROFILE_CUTS[profileId];
  return Boolean(cut && (cut.top || cut.bottom));
}

/**
 * Відняти різаки від готової геометрії деталі (CSG, three-bvh-csg — той
 * самий рушій, що ріже 45° на загинах). Геометрія і різаки мусять бути
 * В ОДНОМУ просторі. Повертає ту саму геометрію, якщо різати нічого або
 * CSG упав — сцена ніколи не лишається без плити через крайку.
 */
export function subtractEdgeCutters(
  geometry: THREE.BufferGeometry,
  cutters: THREE.BufferGeometry[],
): THREE.BufferGeometry {
  if (!cutters.length) return geometry;
  try {
    let brush = new Brush(geometry, new THREE.Material());
    brush.updateMatrixWorld();
    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    for (const cutterGeom of cutters) {
      const cutterBrush = new Brush(cutterGeom, new THREE.Material());
      cutterBrush.updateMatrixWorld();
      brush = evaluator.evaluate(brush, cutterBrush, SUBTRACTION);
    }
    const result = brush.geometry;
    result.computeVertexNormals();
    return result;
  } catch (e) {
    console.error('edge CSG error', e);
    return geometry;
  }
}

/**
 * Перетин негативу у площині «поперек ребра»: v — назовні від лінії
 * ребра (мм), y — товщина, 0 = низ плити, t = верх. Полігон замкнений,
 * накриває зрізану зону плюс запас назовні.
 */
function crossSectionPoints(spec: ShapeSpec, tMm: number): CrossPoint[] {
  return rawCrossSection(spec, tMm).map((p) => ({ v: p.v + BITE_MM, y: p.y }));
}

function rawCrossSection(spec: ShapeSpec, tMm: number): CrossPoint[] {
  const t = tMm;
  const out = OUT_MM;

  switch (spec.kind) {
    case 'chamfer': {
      const c = Math.min(spec.size, t * 0.9);
      return [
        { v: -c, y: t },
        { v: 0, y: t - c },
        { v: out, y: t - c },
        { v: out, y: t + out },
        { v: -c, y: t + out },
      ];
    }
    case 'radius':
    case 'halfbull': {
      const r = spec.kind === 'radius' ? Math.min(spec.size, t * 0.9) : t * 0.8;
      const cx = -r;
      const cy = t - r;
      const arc: CrossPoint[] = [];
      for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
        const phi = (Math.PI / 2) * (1 - i / ARC_SEGMENTS); // 90° → 0°
        arc.push({ v: cx + r * Math.cos(phi), y: cy + r * Math.sin(phi) });
      }
      return [
        ...arc,
        { v: out, y: t - r },
        { v: out, y: t + out },
        { v: -r, y: t + out },
      ];
    }
    case 'fullbull': {
      const r = t / 2;
      const arc: CrossPoint[] = [];
      for (let i = 0; i <= ARC_SEGMENTS * 2; i += 1) {
        const phi = (Math.PI / 2) - (Math.PI * i) / (ARC_SEGMENTS * 2); // 90° → −90°
        arc.push({ v: -r + r * Math.cos(phi), y: r + r * Math.sin(phi) });
      }
      return [
        ...arc, // від (−r, t) до (−r, 0)
        { v: -r, y: -out },
        { v: out, y: -out },
        { v: out, y: t + out },
        { v: -r, y: t + out },
      ];
    }
    case 'cove': {
      // Увігнута чверть: центр дуги — на самому ребрі (0, t).
      const r = Math.min(spec.size, t * 0.9);
      const arc: CrossPoint[] = [];
      for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
        const phi = Math.PI + (Math.PI / 2) * (i / ARC_SEGMENTS); // 180° → 270°
        arc.push({ v: r * Math.cos(phi), y: t + r * Math.sin(phi) });
      }
      return [
        ...arc, // від (−r, t) до (0, t−r)
        { v: out, y: t - r },
        { v: out, y: t + out },
        { v: -r, y: t + out },
      ];
    }
    case 'shark': {
      // Скіс: верхнє ребро на місці (або заокруглене на `radius`), низ
      // зрізаний під кутом. З радіусом — чверть дуги від (−r, t) до
      // (0, t−r), і вже від її кінця скіс до низу: D12 = R2 + 45°,
      // XD20 = R7,5 + 45° (розрізи каталогу цеху).
      const r = Math.min(spec.radius ?? 0, t * 0.9);
      const w = Math.min((t - r) / Math.tan((spec.angleDeg * Math.PI) / 180), t * 3);
      const top: CrossPoint[] = [];
      if (r > 0) {
        for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
          const phi = (Math.PI / 2) * (1 - i / ARC_SEGMENTS); // 90° → 0°
          top.push({ v: -r + r * Math.cos(phi), y: t - r + r * Math.sin(phi) });
        }
      } else {
        top.push({ v: 0, y: t });
      }
      return [
        ...top,
        { v: -w, y: 0 },
        { v: -w, y: -out },
        { v: out, y: -out },
        { v: out, y: t + out },
        { v: -r, y: t + out },
      ];
    }
  }
}


/** Дзеркало перетину на тильне ребро. */
function flipCross(points: CrossPoint[], tMm: number): CrossPoint[] {
  return points.map((p) => ({ v: p.v, y: tMm - p.y }));
}

/** Скільки міліметрів перетин заходить У матеріал (глибина «зубів» фрези). */
function cutDepthMm(cross: CrossPoint[]): number {
  let minV = Infinity;
  for (const p of cross) minV = Math.min(minV, p.v);
  return Math.max(0, -minV);
}

/** Орієнтація контуру: true = обхід за годинниковою (у наших осях y вниз). */
function isClockwise(points: Array<{ x: number; y: number }>): boolean {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += (b.x - a.x) * (b.y + a.y);
  }
  return sum < 0;
}

/**
 * Кут контуру у вершині опуклий (зовнішній)? Там інструмент виходить за
 * плиту; на увігнутому — впирається.
 */
function isConvexCorner(
  prev: { x: number; y: number },
  corner: { x: number; y: number },
  next: { x: number; y: number },
  clockwise: boolean,
): boolean {
  const cross = (corner.x - prev.x) * (next.y - corner.y) - (corner.y - prev.y) * (next.x - corner.x);
  return clockwise ? cross > 0 : cross < 0;
}

/* ═══════════════════════════════════════════════════════════════════
   ШЛЯХ ФРЕЗИ (01.09.2026, друга ітерація — «різи на радіусах»).

   Перша ітерація тягнула перетин окремою призмою по КОЖНІЙ хорді
   контуру. На прямій це те саме; на дузі хорди повернуті одна до одної
   на 7.5°, і призми або перекривались (опуклий радіус — око не бачить),
   або розходились клином з боку матеріалу (увігнутий радіус — зубці
   ~1 мм на профілях глибших за 3 мм). Плюс 13 CSG-віднімань на сторону
   з двома пів-дугами замість одного.

   Тепер перетин ставиться у КОЖНІЙ ВЕРШИНІ шляху, повернутий по
   бісектрисі сусідніх хорд і розтягнутий на 1/cos(θ/2) (мітра) — так
   реально стоїть фреза в цій точці траєкторії, — а сусідні перетини
   з'єднуються гранями в одне тіло. Ні щілин, ні перекриттів, ні милиці
   з 0.2 мм; грані різака лягають на ті самі вершини, що й плита.

   Де шлях РВЕТЬСЯ — теж фізика:
     · увігнутий поворот гостріший за BREAK_TURN_DEG — фреза не заходить
       у внутрішній кут, різак стає на вершині (як і було);
     · увігнута дуга з радіусом меншим за глибину профілю — інструмент
       туди не влазить (RADIUS_LIMITS.innerWithEdgeMin у перевірці
       здійсненності про це ж). За правилом «не малюємо нездійсненне»
       ця дуга НЕ ріжеться; сусідні прямі доходять до її початку.
   ═══════════════════════════════════════════════════════════════════ */

type P2 = { x: number; y: number };

/** Увігнутий поворот гостріший за це — фреза не проходить, шлях рветься. */
const BREAK_TURN_DEG = 20;
/** Стеля мітри: при 1/cos(θ/2) > 3 (θ > 141°) перетин виродився б у голку. */
const MITER_SCALE_MAX = 3;
/**
 * Вибіг фрези за кінець профілю на ПОЛОГОМУ куті (середина дуги, стик
 * із сусідньою стороною іншого профілю), мм. На гострому опуклому куті
 * різак виходить за плиту на всю товщину, щоб два різаки перетнулись
 * мітрою; на пологому це дало б довгий зріз по дотичній (тайл 2 лабо-
 * раторії 01.09) — тут досить пари міліметрів, щоб кришки сусідніх
 * різаків не збіглись в одній площині.
 */
const SMOOTH_EXT_MM = 2;
/**
 * `[ГІПОТЕЗА 01.09]` Що фізично означає «Стандарт» у вікні кута і вікні
 * вирізу («Обробка торців → Фрезерування: Стандарт»). Кошторис мапить
 * його на послугу EDGE_PROFILE_MILL, але послуга — не форма. Поки цех
 * не відповів, беремо технічну фаску 1 мм — найзагальніше «зняти
 * гострий край». ЄДИНЕ місце правки, коли форма стане відомою.
 */
export const STANDARD_MILL_PROFILE = 'tech_chamfer';

/** Станція лофта — місце перетину фрези на шляху. */
type Station = {
  /** Точка шляху, мм контуру деталі */
  p: P2;
  /** Одиничний вектор «назовні від матеріалу» в цій точці (бісектриса) */
  ox: number;
  oy: number;
  /** Мітра: на скільки розтягнути перетин уздовж бісектриси */
  scale: number;
};

function outwardOf(ux: number, uy: number, outwardSign: number): P2 {
  return { x: -uy * outwardSign, y: ux * outwardSign };
}

/** Прибрати сусідні дублікати (< 0.05 мм) — вони дають нульові хорди. */
function dedupe(points: P2[]): P2[] {
  const out: P2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.05) continue;
    out.push(p);
  }
  return out;
}

/**
 * Станції для шляху: у кожній вершині — бісектриса зовнішніх нормалей
 * сусідніх хорд і мітра. На кінцях відкритого шляху — нормаль єдиної
 * хорди.
 */
function stationsFor(chain: P2[], outwardSign: number, closed: boolean): Station[] {
  const n = chain.length;
  const out: Station[] = [];
  for (let i = 0; i < n; i += 1) {
    const cur = chain[i];
    const hasPrev = closed || i > 0;
    const hasNext = closed || i < n - 1;
    let nIn: P2 | undefined;
    let nOut: P2 | undefined;
    if (hasPrev) {
      const prev = chain[(i - 1 + n) % n];
      const l = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
      nIn = outwardOf((cur.x - prev.x) / l, (cur.y - prev.y) / l, outwardSign);
    }
    if (hasNext) {
      const next = chain[(i + 1) % n];
      const l = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
      nOut = outwardOf((next.x - cur.x) / l, (next.y - cur.y) / l, outwardSign);
    }
    if (nIn && nOut) {
      let bx = nIn.x + nOut.x;
      let by = nIn.y + nOut.y;
      const bl = Math.hypot(bx, by);
      if (bl < 1e-6) { bx = nIn.x; by = nIn.y; } else { bx /= bl; by /= bl; }
      const cosHalf = Math.max(bx * nIn.x + by * nIn.y, 1 / MITER_SCALE_MAX);
      out.push({ p: cur, ox: bx, oy: by, scale: Math.min(MITER_SCALE_MAX, 1 / cosHalf) });
    } else {
      const nn = (nIn ?? nOut)!;
      out.push({ p: cur, ox: nn.x, oy: nn.y, scale: 1 });
    }
  }
  return out;
}

/**
 * Тіло різака: перетин `cross` (мм) на кожній станції, з'єднаний гранями.
 * Відкритий шлях закривається кришками на кінцях; замкнений (контур
 * отвору) — кільце без кришок. Повертає геометрію в локальному просторі
 * меша деталі (X=(px−w/2)·s, Y — товщина, Z=(py−h/2)·s).
 *
 * ТЕКСТУРА ТОРЦЯ — як у цеху (уточнення власника 28.08): на торець лягає
 * смуга фото слеба, що прилягає до ребра ЗЗОВНІ. Точка на верхньому ребрі
 * профілю → сама лінія різу (прожилка перетікає без шва); що глибше по
 * товщині — то далі за ребро йде вибірка. UV у нормованих координатах
 * деталі (0..1), тому місце на слебі й поворот застосовуються самі.
 */
function loftGeometry(
  cross: CrossPoint[],
  stations: Station[],
  closed: boolean,
  partW: number,
  partH: number,
  tMm: number,
): THREE.BufferGeometry | undefined {
  const m = stations.length;
  const k = cross.length;
  if (m < 2 || k < 3) return undefined;

  const position: number[] = [];
  const uv: number[] = [];

  const vertex = (i: number, j: number): [number, number, number, number, number] => {
    const st = stations[i];
    const c = cross[j];
    const v = c.v * st.scale;
    const px = st.p.x + st.ox * v;
    const py = st.p.y + st.oy * v;
    const depthFromTop = Math.max(0, tMm - c.y);
    const ux = (st.p.x + st.ox * depthFromTop) / partW;
    const uy = (st.p.y + st.oy * depthFromTop) / partH;
    return [(px - partW / 2) * S, (c.y - tMm / 2) * S, (py - partH / 2) * S, ux, uy];
  };

  type Tri = [[number, number], [number, number], [number, number]];
  const tris: Tri[] = [];

  const spans = closed ? m : m - 1;
  for (let i = 0; i < spans; i += 1) {
    const i2 = (i + 1) % m;
    for (let j = 0; j < k; j += 1) {
      const j2 = (j + 1) % k;
      tris.push([[i, j], [i2, j], [i2, j2]]);
      tris.push([[i, j], [i2, j2], [i, j2]]);
    }
  }

  if (!closed) {
    const faces = THREE.ShapeUtils.triangulateShape(
      cross.map((c) => new THREE.Vector2(c.v, c.y)),
      [],
    );
    for (const [a, b, c] of faces) {
      tris.push([[0, a], [0, b], [0, c]]);
      tris.push([[m - 1, c], [m - 1, b], [m - 1, a]]);
    }
  }

  // Орієнтація: об'єм за формулою дивергенції має бути додатним (нормалі
  // назовні), інакше CSG відніме «навиворіт». Рахуємо і при потребі
  // перевертаємо всі трикутники разом.
  const cache = new Map<number, [number, number, number, number, number]>();
  const at = (i: number, j: number) => {
    const key = i * 4096 + j;
    let val = cache.get(key);
    if (!val) { val = vertex(i, j); cache.set(key, val); }
    return val;
  };
  let volume = 0;
  for (const [a, b, c] of tris) {
    const A = at(a[0], a[1]);
    const B = at(b[0], b[1]);
    const C = at(c[0], c[1]);
    volume += A[0] * (B[1] * C[2] - B[2] * C[1])
      - A[1] * (B[0] * C[2] - B[2] * C[0])
      + A[2] * (B[0] * C[1] - B[1] * C[0]);
  }
  const flip = volume < 0;

  const normal: number[] = [];
  for (const tri of tris) {
    const [a, b, c] = flip ? [tri[0], tri[2], tri[1]] : tri;
    const A = at(a[0], a[1]);
    const B = at(b[0], b[1]);
    const C = at(c[0], c[1]);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1];
    let ny = e1[2] * e2[0] - e1[0] * e2[2];
    let nz = e1[0] * e2[1] - e1[1] * e2[0];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    for (const P of [A, B, C]) {
      position.push(P[0], P[1], P[2]);
      uv.push(P[3], P[4]);
      normal.push(nx, ny, nz);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geom;
}

type VertexFlag = 'ok' | 'break' | 'drop';

/**
 * Що фреза робить у кожній вершині шляху:
 *   ok    — проходить (пряма, опуклий кут, пологий увігнутий поворот дуги);
 *   break — увігнутий кут гостріший за BREAK_TURN_DEG: упирається, шлях
 *           рветься на цій вершині;
 *   drop  — вершина увігнутої дуги, радіус якої менший за глибину профілю:
 *           інструмент не влазить, хорди між такими вершинами не ріжуться.
 * `materialConvex` — опуклість кута З БОКУ МАТЕРІАЛУ (для отвору навпаки).
 */
function flagVertices(
  chain: P2[],
  closed: boolean,
  clockwise: boolean,
  isHole: boolean,
  depthMm: number,
): VertexFlag[] {
  const n = chain.length;
  const flags: VertexFlag[] = new Array(n).fill('ok');
  const turnDeg: number[] = new Array(n).fill(0);
  const localRadius: number[] = new Array(n).fill(Infinity);
  const concave: boolean[] = new Array(n).fill(false);

  for (let i = 0; i < n; i += 1) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const prev = chain[(i - 1 + n) % n];
    const cur = chain[i];
    const next = chain[(i + 1) % n];
    const lIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const lOut = Math.hypot(next.x - cur.x, next.y - cur.y);
    if (lIn < 1e-6 || lOut < 1e-6) continue;
    const ux1 = (cur.x - prev.x) / lIn; const uy1 = (cur.y - prev.y) / lIn;
    const ux2 = (next.x - cur.x) / lOut; const uy2 = (next.y - cur.y) / lOut;
    const dot = Math.max(-1, Math.min(1, ux1 * ux2 + uy1 * uy2));
    const crossZ = ux1 * uy2 - uy1 * ux2;
    const theta = Math.atan2(Math.abs(crossZ), dot); // 0 — пряма
    turnDeg[i] = (theta * 180) / Math.PI;
    const convexPoly = isConvexCorner(prev, cur, next, clockwise);
    concave[i] = isHole ? convexPoly : !convexPoly;
    if (theta > 1e-4) localRadius[i] = ((lIn + lOut) / 2) / theta;
  }

  for (let i = 0; i < n; i += 1) {
    if (!concave[i]) continue;
    if (turnDeg[i] > BREAK_TURN_DEG) flags[i] = 'break';
  }

  // Пологі увігнуті ділянки (дуги): якщо десь у пробігу радіус менший за
  // глибину профілю — весь пробіг нездійсненний.
  let i = 0;
  while (i < n) {
    if (!(concave[i] && flags[i] === 'ok')) { i += 1; continue; }
    let j = i;
    let minR = Infinity;
    while (j < n && concave[j] && flags[j] === 'ok') { minR = Math.min(minR, localRadius[j]); j += 1; }
    if (depthMm > 0 && minR <= depthMm) for (let q = i; q < j; q += 1) flags[q] = 'drop';
    i = j;
  }
  return flags;
}

/**
 * Розбити шлях на ділянки, які фреза проходить не відриваючись.
 * Вершина `break`/`drop` закінчує попередню ділянку і починає наступну;
 * хорда між двома `drop` не ріжеться взагалі.
 */
function splitChain(chain: P2[], flags: VertexFlag[]): P2[][] {
  const chains: P2[][] = [];
  let cur: P2[] = [chain[0]];
  for (let i = 1; i < chain.length; i += 1) {
    const removed = flags[i - 1] === 'drop' && flags[i] === 'drop';
    if (removed) {
      if (cur.length >= 2) chains.push(cur);
      cur = [chain[i]];
      continue;
    }
    cur.push(chain[i]);
    if (flags[i] !== 'ok') {
      chains.push(cur);
      cur = [chain[i]];
    }
  }
  if (cur.length >= 2) chains.push(cur);
  return chains;
}

/**
 * Прапорці для точок ланцюга з прапорців ПОВНОГО кільця контуру: вершина
 * контуру бере свій (так кінець ланцюга посеред дуги знає, що він на
 * дузі), проміжна точка часткової крайки чи подовження — `ok`.
 */
function flagsForChain(chain: P2[], contour: P2[], ringFlags: VertexFlag[]): VertexFlag[] {
  return chain.map((p) => {
    for (let i = 0; i < contour.length; i += 1) {
      const v = contour[i];
      if (Math.abs(v.x - p.x) < 0.01 && Math.abs(v.y - p.y) < 0.01) return ringFlags[i];
    }
    return 'ok';
  });
}

/**
 * Різак для ВІДКРИТОГО шляху (сторона деталі, кут): ріже по ділянках, на
 * кінцях усього шляху — подовження за плиту (`extA`/`extB`, мм), на
 * розривах — ні (фреза стоїть на вершині). `flags` — по одному на точку
 * `chain` (див. flagsForChain).
 */
function openPathCutters(
  cross: CrossPoint[],
  chain: P2[],
  flags: VertexFlag[],
  extA: number,
  extB: number,
  outwardSign: number,
  partW: number,
  partH: number,
  tMm: number,
): THREE.BufferGeometry[] {
  if (chain.length < 2) return [];
  const runs = splitChain(chain, flags);
  const out: THREE.BufferGeometry[] = [];
  runs.forEach((run) => {
    const path = [...run];
    const atStart = path[0] === chain[0];
    const atEnd = path[path.length - 1] === chain[chain.length - 1];
    if (atStart && extA > 0) {
      const a = path[0]; const b = path[1];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      path.unshift({ x: a.x - ((b.x - a.x) / l) * extA, y: a.y - ((b.y - a.y) / l) * extA });
    }
    if (atEnd && extB > 0) {
      const a = path[path.length - 2]; const b = path[path.length - 1];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      path.push({ x: b.x + ((b.x - a.x) / l) * extB, y: b.y + ((b.y - a.y) / l) * extB });
    }
    const geom = loftGeometry(cross, stationsFor(path, outwardSign, false), false, partW, partH, tMm);
    if (geom) out.push(geom);
  });
  return out;
}

/**
 * Різак для ЗАМКНЕНОГО контуру: отвір (виріз під мийку, варильну) або
 * весь зовнішній контур, коли один профіль стоїть на всіх сторонах.
 * Для отвору матеріал — ЗЗОВНІ кільця, тому «назовні від матеріалу»
 * дивиться в отвір, а опуклість кута обернена. Гострі кути рвуть шлях
 * (фреза туди не заходить) — кожна сторона ріжеться окремою ділянкою до
 * вершини, як і в цеху без радіуса кута.
 */
function ringCutters(
  cross: CrossPoint[],
  ring: P2[],
  isHole: boolean,
  partW: number,
  partH: number,
  tMm: number,
): THREE.BufferGeometry[] {
  let pts = dedupe(ring);
  if (pts.length >= 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.05) {
    pts = pts.slice(0, -1);
  }
  if (pts.length < 3) return [];
  const clockwise = isClockwise(pts);
  // Зовнішній контур: назовні = за межі полігона; отвір — навпаки, в отвір.
  const outwardSign = (clockwise ? -1 : 1) * (isHole ? -1 : 1);
  const flags = flagVertices(pts, true, clockwise, isHole, cutDepthMm(cross));
  const firstBreak = flags.findIndex((f) => f !== 'ok');
  if (firstBreak < 0) {
    const geom = loftGeometry(cross, stationsFor(pts, outwardSign, true), true, partW, partH, tMm);
    return geom ? [geom] : [];
  }
  // Є розриви: розгортаємо кільце від першого розриву у відкритий шлях.
  const rotated = [...pts.slice(firstBreak), ...pts.slice(0, firstBreak), pts[firstBreak]];
  const rotatedFlags = [...flags.slice(firstBreak), ...flags.slice(0, firstBreak), flags[firstBreak]];
  const out: THREE.BufferGeometry[] = [];
  for (const run of splitChain(rotated, rotatedFlags)) {
    const geom = loftGeometry(cross, stationsFor(run, outwardSign, false), false, partW, partH, tMm);
    if (geom) out.push(geom);
  }
  return out;
}

/** Перетини (лицьовий/тильний) для обробки, або порожньо, якщо форма не ріже. */
function crossSectionsFor(raw: EdgeProfileSelection[string], tMm: number): CrossPoint[][] {
  const treatment = normalizeEdgeTreatment(raw);
  if (!treatment) return [];
  const out: CrossPoint[][] = [];
  const topSpec = treatment.top?.profileId ? PROFILE_CUTS[treatment.top.profileId] : undefined;
  const bottomSpec = treatment.bottom?.profileId ? PROFILE_CUTS[treatment.bottom.profileId] : undefined;
  if (topSpec?.top) out.push(crossSectionPoints(topSpec.top, tMm));
  if (topSpec?.bottom) out.push(flipCross(crossSectionPoints(topSpec.bottom, tMm), tMm));
  // Тильне ребро, задане окремим профілем: беремо його top-форму дзеркально.
  if (bottomSpec?.top) out.push(flipCross(crossSectionPoints(bottomSpec.top, tMm), tMm));
  return out;
}

/** Галочка «Обробка торців» у вікні кута/вирізу увімкнена і щось означає. */
function millingRequested(value: string | undefined): boolean {
  return Boolean(value) && value !== 'Без фрезерування';
}

/**
 * Кут між сторонами `prev` і `next` у `corners` деталі. Ключі історично
 * різні: прямокутник — «AB»; Г/П і довільний контур — ім'я сторони, що
 * ЗАКІНЧУЄТЬСЯ на куті («A» = кут між A і B), а кут перед першою
 * стороною — «start».
 */
function cornerBetween(
  corners: Record<string, CornerProcessing> | undefined,
  prev: string,
  next: string,
  nextIsFirst: boolean,
): CornerProcessing | undefined {
  if (!corners) return undefined;
  return corners[`${prev}${next}`] ?? corners[prev] ?? (nextIsFirst ? corners.start : undefined);
}

export type EdgeCutterOptions = {
  /** Кути деталі (`detail.corners`) — для галочки «Обробка торців» на куті. */
  corners?: Record<string, CornerProcessing>;
  /** Вирізи деталі (`detail.cutouts`) — для галочки на периметрі вирізу. */
  cutouts?: Record<string, SurfaceCutout>;
  /** Контури отворів у мм парта; без них беруться `part.holes`. */
  holes?: P2[][];
};

/**
 * Різаки всіх оброблених сторін деталі + кутів і вирізів з галочкою
 * «Обробка торців».
 *
 * `thicknessMm` — реальна товщина плити в мм. Повертає геометрії для
 * CSG-віднімання в локальному просторі меша TexturedPart.
 */
export function buildEdgeCutters(
  part: DetailPart,
  profiles: EdgeProfileSelection | undefined,
  thicknessMm: number,
  opts?: EdgeCutterOptions,
): THREE.BufferGeometry[] {
  if (!part?.isMain || !part.points?.length || thicknessMm <= 0) return [];

  // Індекси нижче — по part.points як є (sideContourRange рахує по них
  // же); дублікати вершин прибираються лише з витягнутого ланцюга.
  const points = part.points;
  const n = points.length;
  if (n < 3) return [];
  const clockwise = isClockwise(points);
  // Прапорці фрези на повному кільці контуру — окремо на кожну глибину
  // перетину (від неї залежить, чи влазить інструмент в увігнуту дугу).
  const ringFlagsCache = new Map<number, VertexFlag[]>();
  const ringFlagsFor = (cross: CrossPoint[]): VertexFlag[] => {
    const depth = Math.round(cutDepthMm(cross) * 100) / 100;
    let flags = ringFlagsCache.get(depth);
    if (!flags) { flags = flagVertices(points, true, clockwise, false, depth); ringFlagsCache.set(depth, flags); }
    return flags;
  };
  // outwardSign: нормаль (−uy, ux)·sign має дивитись НАЗОВНІ полігона.
  // Для обходу за годинниковою у системі з y вниз назовні — ліворуч від
  // руху, тобто (uy, −ux) → sign = −1; проти годинникової — навпаки.
  const outwardSign = clockwise ? -1 : 1;
  const extSize = Math.max(OUT_MM, thicknessMm);

  const cutters: THREE.BufferGeometry[] = [];

  // Сторони, що реально знімають матеріал.
  const sideCuts = new Map<string, { raw: EdgeProfileSelection[string]; crosses: CrossPoint[][] }>();
  for (const [side, raw] of Object.entries(profiles ?? {})) {
    if (!raw) continue;
    const crosses = crossSectionsFor(raw, thicknessMm);
    if (crosses.length) sideCuts.set(side, { raw, crosses });
  }

  const order = sidesInContourOrder(part);
  const firstSide = order[0];
  const cornerMilled = (prev: string | undefined, next: string | undefined): boolean => {
    if (!prev || !next) return false;
    return millingRequested(cornerBetween(opts?.corners, prev, next, next === firstSide)?.edgeProcessing);
  };

  const isContourVertex = (p: P2, idx: number) => {
    const v = points[idx];
    return Math.hypot(v.x - p.x, v.y - p.y) < 0.01;
  };

  /** Поворот контуру у вершині idx, градуси (0 — пряма). */
  const turnAt = (idx: number): number => {
    const prev = points[(idx - 1 + n) % n];
    const cur = points[idx];
    const next = points[(idx + 1) % n];
    const l1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const l2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    if (l1 < 1e-6 || l2 < 1e-6) return 0;
    const dot = ((cur.x - prev.x) * (next.x - cur.x) + (cur.y - prev.y) * (next.y - cur.y)) / (l1 * l2);
    const crossZ = ((cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x)) / (l1 * l2);
    return (Math.atan2(Math.abs(crossZ), Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  };
  /**
   * Подовження різака за кінцеву вершину контуру: гострий опуклий кут —
   * за плиту на товщину (мітра з сусіднім різаком), пологий опуклий —
   * SMOOTH_EXT_MM, увігнутий — нуль (фреза впирається).
   *
   * `through` (01.09, власник: «хай наскрізь проходить фреза»): за кінцем
   * ланцюга — вільний контур (дуга кута без «Обробки торців»), а не стик з
   * іншим різаком. Тоді пологий кінець теж вибігає за плиту на товщину —
   * по дотичній до дуги, як справжня фреза, що не зупиняється посеред
   * радіуса сходинкою. На стиках двох різаків (кут із галочкою, дуга
   * навпіл) лишається короткий вибіг SMOOTH_EXT_MM, щоб профілі не
   * перекривались.
   */
  const extensionAt = (idx: number, chainPrev: P2, chainNext: P2, atStartOfChain: boolean, through = false): number => {
    const v = points[idx];
    const convex = atStartOfChain
      ? isConvexCorner(points[(idx - 1 + n) % n], v, chainNext, clockwise)
      : isConvexCorner(chainPrev, v, points[(idx + 1) % n], clockwise);
    if (!convex) return 0;
    return through || turnAt(idx) >= BREAK_TURN_DEG ? extSize : SMOOTH_EXT_MM;
  };

  /**
   * Опуклий кут (01.09, «наскрізь»): дуга кута без «Обробки торців» на
   * ОПУКЛОМУ куті не профілюється — сторона закінчується на початку дуги і
   * вибігає за плиту по дотичній. На увігнутому куті фреза вибігти не може
   * (впирається в матеріал), тому там лишається стара угода: дуга навпіл
   * між сусідами. Перевіряємо поворот у вершині, де сторона переходить у дугу.
   */
  const convexAt = (idx: number): boolean =>
    isConvexCorner(points[(idx - 1 + n) % n], points[idx], points[(idx + 1) % n], clockwise);
  const throughBefore = (side: string, milled: boolean): boolean => {
    if (milled) return false;
    const bare = sideContourRange(part, side, { noGapBefore: true, noGapAfter: true });
    return Boolean(bare && convexAt(bare.startIdx));
  };
  const throughAfter = (side: string, milled: boolean): boolean => {
    if (milled) return false;
    const bare = sideContourRange(part, side, { noGapBefore: true, noGapAfter: true });
    return Boolean(bare && convexAt(bare.endIdx));
  };

  const chainBetween = (startIdx: number, endIdx: number): P2[] => {
    const chain: P2[] = [];
    for (let i = startIdx; ; i = (i + 1) % n) {
      chain.push(points[i]);
      if (i === endIdx) break;
      if (chain.length > n) break; // захист від зіпсованого діапазону
    }
    return chain;
  };

  // ── Сторони ─────────────────────────────────────────────────────────
  // Підпис обробки для злиття: сусідні сторони з ТИМ САМИМ профілем на
  // всю довжину ріжуться одним шляхом фрези — так на стику (середина
  // дуги) не лишається двох кришок в одній площині, які CSG перетворює
  // на сходинку. Профіль по всіх сторонах — замкнене кільце без кришок.
  const signatureOf = (side: string): string | undefined => {
    const cut = sideCuts.get(side);
    if (!cut) return undefined;
    const t = normalizeEdgeTreatment(cut.raw);
    if (!t) return undefined;
    const sideLen = edgeLengthForSide(part, side);
    const span = edgeTreatmentSpan(cut.raw, sideLen);
    if (!(span.from <= 0 && span.to >= sideLen)) return undefined; // часткова — окремо
    return `${t.top?.profileId ?? ''}|${t.bottom?.profileId ?? ''}`;
  };

  const handled = new Set<string>();
  const ordered = order.filter((side) => sideCuts.has(side));

  if (ordered.length) {
    // Пробіги однакових повних профілів уздовж контуру (з переходом через
    // початок масиву).
    const sig = ordered.map(signatureOf);
    const m = ordered.length;
    const joins = (i: number, j: number): boolean => {
      if (sig[i] === undefined || sig[i] !== sig[j]) return false;
      return sideNeighbours(part, ordered[i]).next === ordered[j];
    };
    // Замкнене кільце: усі сторони контуру з одним профілем, кожна
    // зливається з наступною, і остання повертається в першу.
    const closedRing = (() => {
      if (m < 2 || m !== order.length) return false;
      for (let i = 0; i < m; i += 1) if (!joins(i, (i + 1) % m)) return false;
      const a = sideContourRange(part, ordered[0]);
      const b = sideContourRange(part, ordered[m - 1]);
      return Boolean(a && b && b.endIdx === a.startIdx);
    })();
    if (closedRing) {
      for (const cross of sideCuts.get(ordered[0])!.crosses) {
        cutters.push(...ringCutters(cross, points, false, part.width, part.height, thicknessMm));
      }
      ordered.forEach((side) => handled.add(side));
    } else {
      // Початок пробігу — сторона, чий попередник у обході не зливається.
      let startAt = 0;
      for (let i = 0; i < m; i += 1) {
        if (!joins((i - 1 + m) % m, i)) { startAt = i; break; }
      }
      let i = 0;
      while (i < m) {
        const idx = (startAt + i) % m;
        const run = [ordered[idx]];
        let j = i;
        while (j + 1 < m && joins((startAt + j) % m, (startAt + j + 1) % m)) {
          j += 1;
          run.push(ordered[(startAt + j) % m]);
        }
        i = j + 1;
        if (sig[idx] === undefined) continue; // часткова крайка — нижче
        const first = run[0];
        const last = run[run.length - 1];
        const { prev } = sideNeighbours(part, first);
        const { next } = sideNeighbours(part, last);
        // Кут без «Обробки торців» — дуга не профілюється: сторона
        // закінчується на початку дуги і вибігає наскрізь по дотичній.
        // З галочкою — дуга цілком (сусід без профілю) або навпіл (стик).
        const milledBefore = cornerMilled(prev, first);
        const milledAfter = cornerMilled(last, next);
        const fullGapBefore = milledBefore && !(prev && sideCuts.has(prev));
        const fullGapAfter = milledAfter && !(next && sideCuts.has(next));
        const thruBefore = throughBefore(first, milledBefore);
        const thruAfter = throughAfter(last, milledAfter);
        const startRange = sideContourRange(part, first, { fullGapBefore, noGapBefore: thruBefore });
        const endRange = sideContourRange(part, last, { fullGapAfter, noGapAfter: thruAfter });
        if (!startRange || !endRange) continue;
        const chain = dedupe(chainBetween(startRange.startIdx, endRange.endIdx));
        if (chain.length < 2) continue;
        const extA = extensionAt(startRange.startIdx, chain[0], chain[1], true, thruBefore);
        const extB = extensionAt(endRange.endIdx, chain[chain.length - 2], chain[chain.length - 1], false, thruAfter);
        for (const cross of sideCuts.get(first)!.crosses) {
          cutters.push(...openPathCutters(
            cross, chain, flagsForChain(chain, points, ringFlagsFor(cross)),
            extA, extB, outwardSign, part.width, part.height, thicknessMm,
          ));
        }
        run.forEach((side) => handled.add(side));
      }
    }
  }

  // Решта: часткові крайки і сторони без sideSegments — кожна окремо.
  for (const [side, { raw, crosses }] of sideCuts) {
    if (handled.has(side)) continue;
    const { prev, next } = sideNeighbours(part, side);
    const milledBefore = cornerMilled(prev, side);
    const milledAfter = cornerMilled(side, next);
    const fullGapBefore = milledBefore && !(prev && sideCuts.has(prev));
    const fullGapAfter = milledAfter && !(next && sideCuts.has(next));
    const thruBefore = throughBefore(side, milledBefore);
    const thruAfter = throughAfter(side, milledAfter);
    const range = sideContourRange(part, side, { fullGapBefore, fullGapAfter, noGapBefore: thruBefore, noGapAfter: thruAfter })
      ?? sideVertexIndices(part, side);
    if (!range) continue;

    const chain = chainBetween(range.startIdx, range.endIdx);
    if (chain.length < 2) continue;

    // Крайка не на всю довжину — ріжемо ланцюг рівно там, де рахує кошторис.
    const sideLen = edgeLengthForSide(part, side);
    const span = edgeTreatmentSpan(raw, sideLen);
    const chainCut = span.from <= 0 && span.to >= sideLen
      ? chain
      : slicePolylineByLength(chain, span.from, span.to);
    if (chainCut.length < 2) continue;

    // Подовження на кінцях: за плиту — лише там, де ланцюг реально
    // закінчується ВЕРШИНОЮ контуру. Часткова крайка обривається в
    // повітрі рівно на своїй довжині.
    const first = chainCut[0];
    const last = chainCut[chainCut.length - 1];
    const extA = isContourVertex(first, range.startIdx) ? extensionAt(range.startIdx, first, chainCut[1], true, thruBefore) : 0;
    const extB = isContourVertex(last, range.endIdx) ? extensionAt(range.endIdx, chainCut[chainCut.length - 2], last, false, thruAfter) : 0;

    const chainClean = dedupe(chainCut);
    for (const cross of crosses) {
      cutters.push(...openPathCutters(
        cross, chainClean, flagsForChain(chainClean, points, ringFlagsFor(cross)),
        extA, extB, outwardSign, part.width, part.height, thicknessMm,
      ));
    }
  }

  // ── Кути з галочкою, обидві сторони без профілю ─────────────────────
  const standard = PROFILE_CUTS[STANDARD_MILL_PROFILE]?.top;
  if (standard && opts?.corners && order.length >= 2) {
    const standardCross = crossSectionPoints(standard, thicknessMm);
    for (let i = 0; i < order.length; i += 1) {
      const prev = order[i];
      const next = order[(i + 1) % order.length];
      if (sideCuts.has(prev) || sideCuts.has(next)) continue;
      if (!cornerMilled(prev, next)) continue;
      const prevRange = sideContourRange(part, prev, { fullGapAfter: true });
      const nextRange = sideContourRange(part, next);
      const bare = sideVertexIndices(part, prev);
      if (!prevRange || !nextRange || !bare) continue;
      // Перехід: від кінця «голої» сторони prev до початку next.
      const chain: P2[] = [];
      for (let idx = bare.endIdx; ; idx = (idx + 1) % n) {
        chain.push(points[idx]);
        if (idx === prevRange.endIdx) break;
        if (chain.length > n) break;
      }
      if (chain.length < 2) continue; // гострий кут без переходу — різати нічого
      cutters.push(...openPathCutters(
        standardCross, chain, flagsForChain(chain, points, ringFlagsFor(standardCross)),
        0, 0, outwardSign, part.width, part.height, thicknessMm,
      ));
    }
  }

  // ── Периметри вирізів з галочкою ────────────────────────────────────
  const holes = opts?.holes ?? part.holes;
  const cutoutList = opts?.cutouts ? Object.values(opts.cutouts) : [];
  if (standard && holes?.length && cutoutList.length === holes.length) {
    const standardCross = crossSectionPoints(standard, thicknessMm);
    holes.forEach((hole, index) => {
      if (!millingRequested(cutoutList[index]?.edgeProcessing)) return;
      if (!hole || hole.length < 3) return;
      cutters.push(...ringCutters(standardCross, hole, true, part.width, part.height, thicknessMm));
    });
  }

  return cutters;
}

/** Лише для юніт-тестів шляху фрези (engines/__tests__/edgeCutters.test.ts). */
export const __edgeCutterInternals = { stationsFor, flagVertices, splitChain, loftGeometry, crossSectionPoints, dedupe, PROFILE_CUTS };
