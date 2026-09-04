import * as THREE from 'three';
import type { MetalSegmentDef } from './metalChain';

/**
 * Параметричні шаблони металовиробів (MVP Viyar Metal).
 *
 * Шаблон — це ГЕНЕРАТОР ланцюга: він «веде» черепашку маршрутом, як плотер
 * (матеріал = перо вниз, gap = перо вгору), і повертає готовий metalSegments.
 * Джерело істини НЕ додається: результат — звичайний ланцюг на базовому
 * профілі, який далі живе за наявними правилами (розкрій mseg_*, 3D,
 * маса) і який менеджер може руками докрутити в редакторі сегментів.
 *
 * Конструкції — з типової практики цехів (див. СТАН_РОБІТ/МЕТАЛ_MVP):
 *   · каркас під стільницю: верхня обв'язка + ноги + поперечки (+ нижня обв'язка);
 *   · ферма з паралельними поясами: пояси + крайні стійки + розкоси ~45°
 *     (H ≈ L/8, решітка з легшого профілю);
 *   · опора для острова: посилена рама-тумба, нижня обв'язка обов'язкова;
 *   · каркас під мийку: рама, де дві верхні поперечки обрамляють проріз чаші.
 *
 * Числа за замовчуванням — стартові для менеджера; кроки/перерізи підтверджує
 * технолог (ризик із МЕТАЛ_MVP_аналіз §3).
 */

export interface MetalTemplateResult {
  /** Довжина базового відрізка (def.width) — перший матеріальний хід по +X */
  baseLength: number;
  /** Решта ланцюга (матеріал і переміщення) */
  segments: MetalSegmentDef[];
}

/* ------------------------------------------------------------------ */
/*  Черепашка-письменник: маршрут точками → команди ланцюга            */
/* ------------------------------------------------------------------ */

const EPS = 1e-6;

/**
 * Пише маршрут командами ланцюга ТІЄЮ САМОЮ математикою, що читає
 * metalChainPieces (кватерніони навколо локальних осей). Якщо тут і там
 * рахувати по-різному — 3D розійдеться з розкроєм, тому обертання
 * продубльовано дзеркально до domain/metalChain.metalChainPieces.
 */
export class TurtleWriter {
  readonly pos = new THREE.Vector3(0, 0, 0);
  private readonly dir = new THREE.Vector3(1, 0, 0);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private nextId = 1;
  baseLength: number | null = null;
  readonly segments: MetalSegmentDef[] = [];

  /** Матеріальний хід до точки */
  lineTo(x: number, y: number, z: number, profileId?: string): void {
    this.emitTo(new THREE.Vector3(x, y, z), false, profileId);
  }

  /** Переміщення без матеріалу до точки (покоординатно, щоб повороти
   *  лишались навколо локальних осей і були досяжні одним поворотом) */
  moveTo(x: number, y: number, z: number): void {
    const target = new THREE.Vector3(x, y, z);
    const delta = target.clone().sub(this.pos);
    const steps: THREE.Vector3[] = [];
    if (Math.abs(delta.x) > EPS) steps.push(new THREE.Vector3(this.pos.x + delta.x, this.pos.y, this.pos.z));
    if (Math.abs(delta.y) > EPS) steps.push(new THREE.Vector3(this.pos.x + delta.x, this.pos.y + delta.y, this.pos.z));
    if (Math.abs(delta.z) > EPS) steps.push(target.clone());
    steps.forEach((step) => this.emitTo(step, true));
  }

  private emitTo(target: THREE.Vector3, gap: boolean, profileId?: string): void {
    const delta = target.clone().sub(this.pos);
    const length = delta.length();
    if (length < EPS) return;
    const targetDir = delta.clone().normalize();

    if (this.baseLength === null) {
      // Перший матеріальний хід — базовий відрізок: за контрактом ланцюга
      // він іде вздовж +X від початку координат.
      if (gap) throw new Error('Маршрут шаблона має починатися матеріальним ходом по +X');
      if (targetDir.distanceTo(new THREE.Vector3(1, 0, 0)) > 1e-4) {
        throw new Error('Базовий відрізок шаблона має йти вздовж +X');
      }
      this.baseLength = round2(length);
      this.pos.copy(target);
      return;
    }

    const dot = THREE.MathUtils.clamp(this.dir.dot(targetDir), -1, 1);
    if (dot > 1 - 1e-9) {
      this.push('straight', 90, length, gap, profileId);
    } else if (dot < -1 + 1e-9) {
      // Розворот на 180°: два повороти «вліво» навколо up, перший — нульовим
      // переміщенням. Один сегмент так не вміє (вісь неоднозначна).
      this.push('left', 90, 0, true);
      this.push('left', 90, length, gap, profileId);
    } else {
      const axis = new THREE.Vector3().crossVectors(this.dir, targetDir).normalize();
      const angleDeg = round3(THREE.MathUtils.radToDeg(Math.acos(dot)));
      const side = new THREE.Vector3().crossVectors(this.dir, this.up).normalize();
      let turn: MetalSegmentDef['turn'];
      if (axis.distanceTo(side) < 1e-4) turn = 'up';
      else if (axis.clone().negate().distanceTo(side) < 1e-4) turn = 'down';
      else if (axis.distanceTo(this.up) < 1e-4) turn = 'left';
      else if (axis.clone().negate().distanceTo(this.up) < 1e-4) turn = 'right';
      else throw new Error('Поворот недосяжний однією командою ланцюга — розбий маршрут на осьові ходи');
      this.push(turn, angleDeg, length, gap, profileId);
    }
  }

  /** Дзеркало обертання з metalChainPieces + запис сегмента */
  private push(turn: MetalSegmentDef['turn'], angleDeg: number, length: number, gap: boolean, profileId?: string): void {
    if (turn !== 'straight') {
      const angleRad = (angleDeg * Math.PI) / 180;
      const quat = new THREE.Quaternion();
      if (turn === 'up' || turn === 'down') {
        const side = new THREE.Vector3().crossVectors(this.dir, this.up).normalize();
        quat.setFromAxisAngle(side, turn === 'up' ? angleRad : -angleRad);
      } else {
        quat.setFromAxisAngle(this.up.clone().normalize(), turn === 'left' ? angleRad : -angleRad);
      }
      this.dir.applyQuaternion(quat).normalize();
      this.up.applyQuaternion(quat).normalize();
    }
    this.pos.addScaledVector(this.dir, length);
    this.segments.push({
      id: String(this.nextId++),
      length: round2(length),
      turn,
      angle: angleDeg,
      ...(gap ? { gap: true } : {}),
      ...(profileId ? { profileId } : {}),
    });
  }

  result(): MetalTemplateResult {
    if (this.baseLength === null) throw new Error('Порожній маршрут шаблона');
    return { baseLength: this.baseLength, segments: this.segments };
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/* ------------------------------------------------------------------ */
/*  Спільні шматки маршрутів                                           */
/* ------------------------------------------------------------------ */

/** Верхня обв'язка W×D у площині y=0 (X — довжина, −Z — глибина), старт (0,0,0) */
function topRect(t: TurtleWriter, w: number, d: number): void {
  t.lineTo(w, 0, 0);
  t.lineTo(w, 0, -d);
  t.lineTo(0, 0, -d);
  t.lineTo(0, 0, 0);
}

/** Ноги вниз (−Y) у чотирьох кутах обв'язки */
function cornerLegs(t: TurtleWriter, w: number, d: number, h: number): void {
  const corners: Array<[number, number]> = [[0, 0], [w, 0], [w, -d], [0, -d]];
  corners.forEach(([x, z]) => {
    t.moveTo(x, 0, z);
    t.lineTo(x, -h, z);
  });
}

/** Прямокутник обв'язки на висоті y (нижня обв'язка/полиця) */
function railRect(t: TurtleWriter, w: number, d: number, y: number): void {
  t.moveTo(0, y, 0);
  t.lineTo(w, y, 0);
  t.lineTo(w, y, -d);
  t.lineTo(0, y, -d);
  t.lineTo(0, y, 0);
}

/** Верхні поперечки поперек глибини на заданих X */
function crossbarsAt(t: TurtleWriter, xs: number[], d: number): void {
  xs.forEach((x) => {
    t.moveTo(x, 0, 0);
    t.lineTo(x, 0, -d);
  });
}

/* ------------------------------------------------------------------ */
/*  Генератори                                                          */
/* ------------------------------------------------------------------ */

export interface TableFrameParams {
  /** Довжина рами (по стільниці), мм */
  width: number;
  /** Глибина рами, мм */
  depth: number;
  /** Висота до верху обв'язки, мм */
  height: number;
  /** Кількість верхніх поперечок під стільницю */
  crossbars: number;
  /** Нижня обв'язка для жорсткості */
  bottomRail: boolean;
  /** Висота нижньої обв'язки від підлоги, мм */
  bottomOffset: number;
}

/** Каркас під стільницю: верхня обв'язка + 4 ноги + поперечки (+ нижня обв'язка) */
export function tableFrameTemplate(p: TableFrameParams): MetalTemplateResult {
  const t = new TurtleWriter();
  topRect(t, p.width, p.depth);
  cornerLegs(t, p.width, p.depth, p.height);
  const n = Math.max(0, Math.round(p.crossbars));
  crossbarsAt(t, Array.from({ length: n }, (_, i) => (p.width * (i + 1)) / (n + 1)), p.depth);
  if (p.bottomRail) railRect(t, p.width, p.depth, -(p.height - p.bottomOffset));
  return t.result();
}

export interface IslandFrameParams {
  width: number;
  depth: number;
  height: number;
  /** Проміжні стійки посередині довгих сторін (для W ≥ ~1500) */
  midLegs: boolean;
  bottomOffset: number;
}

/** Опора для острова: посилена рама-тумба, нижня обв'язка обов'язкова */
export function islandFrameTemplate(p: IslandFrameParams): MetalTemplateResult {
  const t = new TurtleWriter();
  topRect(t, p.width, p.depth);
  cornerLegs(t, p.width, p.depth, p.height);
  if (p.midLegs) {
    const x = p.width / 2;
    [0, -p.depth].forEach((z) => {
      t.moveTo(x, 0, z);
      t.lineTo(x, -p.height, z);
    });
  }
  railRect(t, p.width, p.depth, -(p.height - p.bottomOffset));
  return t.result();
}

export interface SinkFrameParams {
  width: number;
  depth: number;
  height: number;
  /** Ширина прорізу під чашу, мм */
  bowlWidth: number;
  /** Зсув центру чаші від середини рами, мм (＋ вправо) */
  bowlOffset: number;
  bottomRail: boolean;
  bottomOffset: number;
}

/** Каркас під мийку: рама, дві верхні поперечки обрамляють проріз чаші */
export function sinkFrameTemplate(p: SinkFrameParams): MetalTemplateResult {
  const t = new TurtleWriter();
  topRect(t, p.width, p.depth);
  cornerLegs(t, p.width, p.depth, p.height);
  const cx = p.width / 2 + p.bowlOffset;
  const half = p.bowlWidth / 2;
  const xs = [cx - half, cx + half].filter((x) => x > EPS && x < p.width - EPS);
  crossbarsAt(t, xs, p.depth);
  if (p.bottomRail) railRect(t, p.width, p.depth, -(p.height - p.bottomOffset));
  return t.result();
}

export interface TrussParams {
  /** Проліт, мм */
  span: number;
  /** Висота між осями поясів, мм */
  height: number;
  /** Кількість панелей решітки (зигзаг розкосів) */
  panels: number;
  /** Стійки 90° у вузлах (розкосно-стійкова решітка) */
  posts: boolean;
  /** Профіль решітки; порожньо — як пояси */
  braceProfileId?: string;
}

/**
 * Ферма з паралельними поясами (площина XY): нижній пояс = база, верхній
 * пояс, крайні стійки, розкоси зигзагом. Кут розкосу виходить із панелі
 * (рекомендація ~45°: panels ≈ span / height).
 */
export function trussTemplate(p: TrussParams): MetalTemplateResult {
  const t = new TurtleWriter();
  const n = Math.max(2, Math.round(p.panels));
  const panel = p.span / n;
  const brace = p.braceProfileId;
  // Контурна «рамка»: нижній пояс → права стійка → верхній пояс → ліва стійка
  t.lineTo(p.span, 0, 0);
  t.lineTo(p.span, p.height, 0, brace);
  t.lineTo(0, p.height, 0);
  t.lineTo(0, 0, 0, brace);
  // Розкоси: зигзаг низ→верх→низ… по панелях
  for (let i = 1; i <= n; i += 1) {
    const x = panel * i;
    const y = i % 2 === 1 ? p.height : 0;
    t.lineTo(x, y, 0, brace);
  }
  // Стійки у внутрішніх вузлах (окрім країв — вони вже є)
  if (p.posts) {
    for (let i = 1; i < n; i += 1) {
      const x = panel * i;
      t.moveTo(x, 0, 0);
      t.lineTo(x, p.height, 0, brace);
    }
  }
  return t.result();
}

export interface WallConsoleParams {
  /** Довжина рейки при стіні, мм */
  rail: number;
  /** Виліт кронштейна від стіни (плече), мм */
  arm: number;
  /** Висота стійки при стіні під плечем, мм */
  drop: number;
  /** Розкос кріпиться до плеча за стільки мм від його кінця */
  braceInset: number;
  /** Кількість кронштейнів; крайні — з відступом `edgeInset` від країв рейки */
  brackets: number;
  /** Відступ крайніх кронштейнів від країв рейки, мм */
  edgeInset: number;
  /** Профіль кронштейнів; порожньо — як рейка */
  bracketProfileId?: string;
  /**
   * Явні позиції кронштейнів по рейці, мм — коли вони стоять під тумби, а
   * не рівномірно (кейс 81-2009298: 20 / 517 / 1035 / 1716 / 2165).
   * Задано — `brackets` і `edgeInset` ігноруються. З UI не доступно.
   */
  positions?: number[];
}

/**
 * Консоль під поличку (03.09.2026, з кейса 81-2009298, аркуш 2): рейка
 * при стіні (площина XY) і рівномірно розставлені кронштейни-трикутники,
 * що виходять від стіни в +Z: плече, стійка вниз при стіні, розкос від
 * плеча до п'яти стійки.
 *
 * Порядок ходу в кронштейні не випадковий: черепашка вміє повертати лише
 * навколо своїх локальних осей, тому розкос малюється З ПЛЕЧА вниз (це
 * поворот «down»), а не зі стійки вгору — з вертикалі діагональ в
 * площині YZ одним поворотом недосяжна.
 */
export function wallConsoleTemplate(p: WallConsoleParams): MetalTemplateResult {
  const t = new TurtleWriter();
  t.lineTo(p.rail, 0, 0);
  const n = Math.max(1, Math.round(p.brackets));
  const inset = Math.min(p.edgeInset, p.rail / 2);
  const xs = p.positions?.length
    ? p.positions.filter((x) => x >= 0 && x <= p.rail)
    : n === 1
      ? [p.rail / 2]
      : Array.from({ length: n }, (_, i) => inset + ((p.rail - 2 * inset) * i) / (n - 1));
  const prof = p.bracketProfileId;
  for (const x of xs) {
    t.moveTo(x, 0, 0);
    t.lineTo(x, 0, p.arm, prof);                           // плече
    t.moveTo(x, 0, Math.max(0, p.arm - p.braceInset));     // назад по плечу (перо вгору)
    t.lineTo(x, -p.drop, 0, prof);                         // розкос до п'яти
    t.lineTo(x, 0, 0, prof);                               // стійка вгору до рейки
  }
  return t.result();
}

/* ------------------------------------------------------------------ */
/*  Реєстр для UI                                                       */
/* ------------------------------------------------------------------ */

export type TemplateParamValue = number | boolean | string;

export interface TemplateParamDef {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'profile';
  default: TemplateParamValue;
  min?: number;
  max?: number;
  step?: number;
  /** Показувати параметр лише коли інший (boolean) увімкнено */
  visibleIf?: string;
}

export interface MetalTemplate {
  id: string;
  label: string;
  hint: string;
  params: TemplateParamDef[];
  generate: (values: Record<string, TemplateParamValue>) => MetalTemplateResult;
}

const num = (values: Record<string, TemplateParamValue>, key: string, fallback: number) => {
  const value = Number(values[key]);
  return Number.isFinite(value) ? value : fallback;
};

export const METAL_TEMPLATES: MetalTemplate[] = [
  {
    id: 'table_frame',
    label: 'Каркас під стільницю',
    hint: 'Верхня обвʼязка + 4 ноги + поперечки; опційно нижня обвʼязка для жорсткості.',
    params: [
      { key: 'width', label: 'Довжина, мм', type: 'number', default: 1200, min: 300, max: 6000, step: 10 },
      { key: 'depth', label: 'Глибина, мм', type: 'number', default: 600, min: 200, max: 2000, step: 10 },
      { key: 'height', label: 'Висота, мм', type: 'number', default: 850, min: 200, max: 1200, step: 10 },
      { key: 'crossbars', label: 'Поперечок під стільницю', type: 'number', default: 1, min: 0, max: 8, step: 1 },
      { key: 'bottomRail', label: 'Нижня обвʼязка', type: 'boolean', default: false },
      { key: 'bottomOffset', label: 'Нижня обвʼязка від підлоги, мм', type: 'number', default: 150, min: 30, max: 500, step: 10, visibleIf: 'bottomRail' },
    ],
    generate: (v) => tableFrameTemplate({
      width: num(v, 'width', 1200), depth: num(v, 'depth', 600), height: num(v, 'height', 850),
      crossbars: num(v, 'crossbars', 1), bottomRail: Boolean(v.bottomRail), bottomOffset: num(v, 'bottomOffset', 150),
    }),
  },
  {
    id: 'island_frame',
    label: 'Опора для острова',
    hint: 'Посилена рама-тумба під кухонний острів: ноги по кутах, нижня обвʼязка завжди.',
    params: [
      { key: 'width', label: 'Довжина, мм', type: 'number', default: 1200, min: 400, max: 4000, step: 10 },
      { key: 'depth', label: 'Глибина, мм', type: 'number', default: 800, min: 300, max: 2000, step: 10 },
      { key: 'height', label: 'Висота, мм', type: 'number', default: 870, min: 300, max: 1200, step: 10 },
      { key: 'midLegs', label: 'Проміжні стійки (довгі прольоти)', type: 'boolean', default: false },
      { key: 'bottomOffset', label: 'Нижня обвʼязка від підлоги, мм', type: 'number', default: 120, min: 30, max: 500, step: 10 },
    ],
    generate: (v) => islandFrameTemplate({
      width: num(v, 'width', 1200), depth: num(v, 'depth', 800), height: num(v, 'height', 870),
      midLegs: Boolean(v.midLegs), bottomOffset: num(v, 'bottomOffset', 120),
    }),
  },
  {
    id: 'sink_frame',
    label: 'Каркас під мийку',
    hint: 'Рама з ногами; дві верхні поперечки обрамляють проріз під чашу.',
    params: [
      { key: 'width', label: 'Довжина, мм', type: 'number', default: 800, min: 400, max: 3000, step: 10 },
      { key: 'depth', label: 'Глибина, мм', type: 'number', default: 600, min: 300, max: 1200, step: 10 },
      { key: 'height', label: 'Висота, мм', type: 'number', default: 850, min: 300, max: 1200, step: 10 },
      { key: 'bowlWidth', label: 'Проріз під чашу, мм', type: 'number', default: 500, min: 200, max: 1200, step: 10 },
      { key: 'bowlOffset', label: 'Зсув чаші від центру, мм', type: 'number', default: 0, min: -1000, max: 1000, step: 10 },
      { key: 'bottomRail', label: 'Нижня обвʼязка', type: 'boolean', default: true },
      { key: 'bottomOffset', label: 'Нижня обвʼязка від підлоги, мм', type: 'number', default: 150, min: 30, max: 500, step: 10, visibleIf: 'bottomRail' },
    ],
    generate: (v) => sinkFrameTemplate({
      width: num(v, 'width', 800), depth: num(v, 'depth', 600), height: num(v, 'height', 850),
      bowlWidth: num(v, 'bowlWidth', 500), bowlOffset: num(v, 'bowlOffset', 0),
      bottomRail: Boolean(v.bottomRail), bottomOffset: num(v, 'bottomOffset', 150),
    }),
  },
  {
    id: 'truss',
    label: 'Ферма',
    hint: 'Паралельні пояси, крайні стійки, розкоси зигзагом (~45°); решітка легшим профілем.',
    params: [
      { key: 'span', label: 'Проліт, мм', type: 'number', default: 3000, min: 500, max: 12000, step: 50 },
      { key: 'height', label: 'Висота ферми, мм', type: 'number', default: 400, min: 150, max: 1500, step: 10 },
      { key: 'panels', label: 'Панелей решітки', type: 'number', default: 6, min: 2, max: 24, step: 1 },
      { key: 'posts', label: 'Стійки у вузлах', type: 'boolean', default: false },
      { key: 'braceProfileId', label: 'Профіль решітки', type: 'profile', default: 'kv25' },
    ],
    generate: (v) => trussTemplate({
      span: num(v, 'span', 3000), height: num(v, 'height', 400), panels: num(v, 'panels', 6),
      posts: Boolean(v.posts), braceProfileId: typeof v.braceProfileId === 'string' && v.braceProfileId ? v.braceProfileId : undefined,
    }),
  },
  {
    id: 'wall_console',
    label: 'Консоль під поличку',
    hint: 'Рейка при стіні + кронштейни-трикутники: плече, стійка, розкос. Крайні кронштейни з відступом від країв.',
    params: [
      { key: 'rail', label: 'Довжина рейки, мм', type: 'number', default: 2000, min: 300, max: 6000, step: 10 },
      { key: 'arm', label: 'Виліт плеча, мм', type: 'number', default: 470, min: 150, max: 1200, step: 10 },
      { key: 'drop', label: 'Стійка при стіні, мм', type: 'number', default: 120, min: 40, max: 600, step: 10 },
      { key: 'braceInset', label: 'Розкос від кінця плеча, мм', type: 'number', default: 70, min: 0, max: 400, step: 10 },
      { key: 'brackets', label: 'Кронштейнів', type: 'number', default: 5, min: 1, max: 20, step: 1 },
      { key: 'edgeInset', label: 'Відступ крайніх від країв, мм', type: 'number', default: 20, min: 0, max: 500, step: 5 },
      { key: 'bracketProfileId', label: 'Профіль кронштейнів', type: 'profile', default: '' },
    ],
    generate: (v) => wallConsoleTemplate({
      rail: num(v, 'rail', 2000), arm: num(v, 'arm', 470), drop: num(v, 'drop', 120),
      braceInset: num(v, 'braceInset', 70), brackets: num(v, 'brackets', 5), edgeInset: num(v, 'edgeInset', 20),
      bracketProfileId: typeof v.bracketProfileId === 'string' && v.bracketProfileId ? v.bracketProfileId : undefined,
    }),
  },
];

export function templateDefaults(template: MetalTemplate): Record<string, TemplateParamValue> {
  return Object.fromEntries(template.params.map((param) => [param.key, param.default]));
}
