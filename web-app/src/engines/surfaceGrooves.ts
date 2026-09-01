import * as THREE from 'three';
import type { SurfaceGrooveGroup } from '../domain/types';
import { grooveWidthFor } from '../domain/grooveCatalog';

/**
 * ФРЕЗЕРУВАННЯ ПЛОЩИНИ: проточки для води і декоративні канавки.
 *
 * Заведено 28.08.2026 з реального кейсу власника — проточки під стікання
 * води біля врізної мийки. Та сама механіка потрібна фрезерованому
 * декору фасадів, тому модуль названий по операції, а не по мийці.
 *
 * Принцип той самий, що і в торцях (`engines/edgeCutters`): не малюємо
 * «канавку», а СИМУЛЮЄМО ФРЕЗУ — перетин інструмента протягується по
 * траєкторії й віднімається CSG. Звідси і форма дна: пальчикова фреза
 * з радіусом дає `round`, конічна — `vee`, кінцева — `flat`.
 *
 * Простір результату — той самий, що в edgeCutters: деталь центрована
 * (X, Z), Y — товщина, верх плити на +t/2.
 */

const S = 0.001;
/** Скільки сегментів на півколо дна — компроміс вигляд/вага меша. */
const ROUND_SEGMENTS = 8;
/** Виліт різака над площиною, мм — щоб CSG не лишав плівки. */
const OVERCUT_MM = 1.5;

/**
 * ФІЗИЧНІ МЕЖІ ЦЕХУ. Числа — стартові, уточнюються паспортом обладнання
 * (див. 03_КРОМКИ/ЛОГІКА_ОБРОБОК_І_ЗДІЙСНЕННОСТІ.md, розділ 5).
 */
export const GROOVE_LIMITS = {
  /** Найтонша пальчикова фреза, що є в цеху, мм */
  minWidthMm: 6,
  /** Ширша за це — це вже не канавка, а вибірка площини */
  maxWidthMm: 60,
  /** Менше не має сенсу: полірування зніме канавку */
  minDepthMm: 1,
  /** Скільки каменю МУСИТЬ лишитись під дном канавки, мм */
  minFloorMm: 4,
} as const;

/**
 * Фактична ширина канавки, мм.
 *
 * Креслення цеху (12.03.25) показали, що ширина НЕ задається окремо:
 * це слід радіусної фрези на заданій глибині. R7 на 3 мм дає 11.5,
 * R8 на 3.5 — 13.3, і так усі числа з каталогу. Тому коли радіус фрези
 * відомий, він і вирішує; поле `width` лишається для старих проєктів.
 */
export function effectiveGrooveWidth(group: SurfaceGrooveGroup): number {
  if (group.cutterRadius && group.cutterRadius > 0) {
    return grooveWidthFor(group.cutterRadius, group.depth);
  }
  return group.width;
}

export type GrooveIssue = {
  groupId: string;
  /** `error` — так зробити не можна; `warning` — можна, але з наслідками */
  level: 'error' | 'warning';
  message: string;
};

/**
 * Перевірка здійсненності — крок 1 логіки власника: чи візьме це верстат.
 *
 * Помилка (`error`) означає: наявним інструментом так не зробити.
 * За правилом із 03_КРОМКИ далі має підключатись каталог ручних обробок,
 * а якщо прецеденту немає — менеджера відправляють до технолога.
 * Тут ми поки лише чесно називаємо проблему; каталог ручних обробок
 * з'явиться окремою задачею.
 */
export function validateGrooveGroup(
  group: SurfaceGrooveGroup,
  partWidthMm: number,
  partHeightMm: number,
  thicknessMm: number,
): GrooveIssue[] {
  const issues: GrooveIssue[] = [];
  const add = (level: GrooveIssue['level'], message: string) =>
    issues.push({ groupId: group.id, level, message });

  if (group.count < 1) add('error', 'Кількість канавок має бути хоча б одна.');
  if (group.length <= 0) add('error', 'Довжина канавки має бути більшою за нуль.');

  const width = effectiveGrooveWidth(group);
  if (width < GROOVE_LIMITS.minWidthMm) {
    add('error', `Ширина ${width.toFixed(1)} мм менша за найтоншу фрезу (${GROOVE_LIMITS.minWidthMm} мм) — такої канавки цех не проріже.`);
  }
  if (width > GROOVE_LIMITS.maxWidthMm) {
    add('warning', `Ширина ${width.toFixed(1)} мм — це вже вибірка площини, а не проточка. Перевірте з технологом.`);
  }
  if (group.cutterRadius && group.depth > group.cutterRadius) {
    add('warning', `Глибина ${group.depth} мм більша за радіус фрези R${group.cutterRadius} — стінки канавки стануть прямовисними.`);
  }
  /* Ухил: у цеху канавка завжди глибша БІЛЯ МИЙКИ, інакше вода стоїть */
  if (group.depthFar !== undefined && group.depthFar > group.depth) {
    add('warning', 'Далекий край глибший за ближній — вода тектиме ВІД мийки. Схоже, кінці переплутані.');
  }
  if (group.depth < GROOVE_LIMITS.minDepthMm) {
    add('error', `Глибина ${group.depth} мм замала — після полірування канавки не лишиться.`);
  }

  const floor = thicknessMm - group.depth;
  if (floor <= 0) {
    add('error', `Глибина ${group.depth} мм ≥ товщини плити ${thicknessMm} мм — це наскрізний різ, а не фрезерування.`);
  } else if (floor < GROOVE_LIMITS.minFloorMm) {
    add('error', `Під дном лишається ${floor.toFixed(1)} мм каменю — плита трісне. Потрібно щонайменше ${GROOVE_LIMITS.minFloorMm} мм.`);
  }

  // Крок між канавками менший за ширину — фрези перекриються в одну борозну
  if (group.count > 1 && group.pitch < width) {
    add('error', `Крок ${group.pitch} мм менший за ширину канавки ${width.toFixed(1)} мм — канавки зіллються в одну.`);
  }
  if (group.count > 1 && group.pitch < width + 3) {
    add('warning', `Між канавками лишається ${(group.pitch - width).toFixed(1)} мм каменю — ребро може викришитись.`);
  }

  // Чи вміщується група в деталь
  const along = group.direction === 'horizontal' ? group.length : group.length;
  const spread = (group.count - 1) * group.pitch + width;
  const maxX = group.direction === 'horizontal' ? group.x + along : group.x + spread;
  const maxY = group.direction === 'horizontal' ? group.y + spread : group.y + along;
  if (group.x < 0 || group.y < 0) add('error', 'Початок канавок за межами деталі.');
  if (maxX > partWidthMm + 0.5 || maxY > partHeightMm + 0.5) {
    add('error', `Група виходить за габарит деталі (${Math.round(maxX)}×${Math.round(maxY)} мм проти ${Math.round(partWidthMm)}×${Math.round(partHeightMm)} мм).`);
  }

  return issues;
}

/**
 * Перетин фрези на заданій глибині: v — поперек канавки (0 = вісь),
 * y — вниз від площини плити.
 *
 * Глибина приходить параметром, а не з групи: проточка йде З УХИЛОМ
 * (креслення цеху 12.03.25 — 0.5 мм на краю, 3 мм біля мийки), тому
 * перетин будується окремо для кожного кінця, а ширина щоразу
 * перераховується під ЦЮ глибину. Саме так поводиться фреза: мілко
 * увійшла — вузький слід, глибше — ширший.
 */
function grooveCross(group: SurfaceGrooveGroup, depth: number): Array<{ v: number; y: number }> {
  const halfW = (group.cutterRadius && group.cutterRadius > 0
    ? grooveWidthFor(group.cutterRadius, depth)
    : group.width) / 2;
  const d = depth;
  const up = OVERCUT_MM;

  switch (group.profile) {
    case 'vee':
      return [
        { v: -halfW, y: -up },
        { v: halfW, y: -up },
        { v: halfW, y: 0 },
        { v: 0, y: d },
        { v: -halfW, y: 0 },
      ];
    case 'flat':
      return [
        { v: -halfW, y: -up },
        { v: halfW, y: -up },
        { v: halfW, y: d },
        { v: -halfW, y: d },
      ];
    case 'round':
    default: {
      // Дно — дуга фрези. Коли радіус фрези відомий, беремо саме його:
      // при мілкому врізанні дно ПОЛОГЕ, а не півколо.
      const r = group.cutterRadius && group.cutterRadius > 0
        ? group.cutterRadius
        : Math.min(halfW, d);
      const pts: Array<{ v: number; y: number }> = [
        { v: -halfW, y: -up },
        { v: halfW, y: -up },
      ];
      // Центр фрези стоїть на висоті (d − r) від площини; малюємо ту
      // частину кола, що нижча за площину плити.
      const cy = d - r;
      const startA = Math.acos(Math.min(1, Math.max(-1, halfW / r)));
      for (let i = 0; i <= ROUND_SEGMENTS; i += 1) {
        const a = startA + ((Math.PI - 2 * startA) * i) / ROUND_SEGMENTS;
        pts.push({ v: r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
      return pts;
    }
  }
}

/**
 * Різаки групи канавок. Повертає геометрії для CSG-віднімання в
 * локальному просторі меша деталі.
 */
export function buildGrooveCutters(
  groups: SurfaceGrooveGroup[] | undefined,
  partWidthMm: number,
  partHeightMm: number,
  thicknessMm: number,
): THREE.BufferGeometry[] {
  if (!groups?.length || thicknessMm <= 0) return [];

  const out: THREE.BufferGeometry[] = [];

  for (const group of groups) {
    // Нездійсненне не малюємо: краще порожньо і з попередженням, ніж
    // красива картинка того, чого цех не зробить.
    const blocking = validateGrooveGroup(group, partWidthMm, partHeightMm, thicknessMm)
      .some((issue) => issue.level === 'error');
    if (blocking) continue;

    const fromBottom = group.face === 'bottom';
    /*
     * УХИЛ (креслення цеху 12.03.25). Канавка мілка на дальньому краю і
     * глибша біля мийки — інакше вода стоїть у ній. Тому будуємо ДВА
     * перетини й з'єднуємо їх: різак виходить клином, як реальний прохід
     * фрези з поступовим заглибленням.
     */
    const depthNear = group.depth;
    const depthFar = group.depthFar ?? group.depth;
    const crossFar = grooveCross(group, depthFar);
    const crossNear = grooveCross(group, depthNear);
    const sloped = Math.abs(depthNear - depthFar) > 0.01;

    const toShape = (cross: Array<{ v: number; y: number }>) => {
      const shape = new THREE.Shape();
      cross.forEach((p, i) => {
        const sx = p.v * S;
        const yMm = fromBottom ? -thicknessMm / 2 + p.y : thicknessMm / 2 - p.y;
        const sy = yMm * S;
        if (i === 0) shape.moveTo(sx, sy);
        else shape.lineTo(sx, sy);
      });
      shape.closePath();
      return shape;
    };
    const shape = toShape(crossNear);
    const shapeFar = toShape(crossFar);

    for (let n = 0; n < group.count; n += 1) {
      const shift = n * group.pitch;
      // Вісь канавки в координатах деталі (мм від лівого-верхнього кута)
      const axisStart = group.direction === 'horizontal'
        ? { x: group.x, y: group.y + shift + group.width / 2 }
        : { x: group.x + shift + group.width / 2, y: group.y };
      const axisEnd = group.direction === 'horizontal'
        ? { x: group.x + group.length, y: axisStart.y }
        : { x: axisStart.x, y: group.y + group.length };

      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: group.length * S,
        bevelEnabled: false,
        curveSegments: 4,
      });

      /*
       * Клин ухилу: тіло екструзії має сталий перетин, тому вершини
       * ближче до ДАЛЬНЬОГО кінця піднімаємо до тамтешньої глибини.
       * Виходить рівний схил від `depthFar` до `depthNear` — той самий,
       * що лишає фреза, яка поступово заглиблюється.
       */
      if (sloped) {
        const pos0 = geom.attributes.position;
        const lift = (depthNear - depthFar) * S * (fromBottom ? -1 : 1);
        const lengthM = group.length * S;
        for (let i = 0; i < pos0.count; i += 1) {
          // z у shape-просторі: 0 = ближній кінець, length = дальній
          const t = Math.min(1, Math.max(0, pos0.getZ(i) / (lengthM || 1)));
          // Піднімаємо лише вершини ДНА (нижчі за площину плити)
          const y = pos0.getY(i);
          const surface = fromBottom ? -thicknessMm / 2 * S : thicknessMm / 2 * S;
          const isFloor = fromBottom ? y > surface : y < surface;
          if (isFloor) pos0.setY(i, y + lift * t);
        }
        pos0.needsUpdate = true;
      }
      void shapeFar;

      /*
       * Базис: ex — поперек канавки (у площині XZ), ey — вертикаль,
       * ez — уздовж канавки (напрямок екструзії).
       */
      const dirX = group.direction === 'horizontal' ? 1 : 0;
      const dirZ = group.direction === 'horizontal' ? 0 : 1;
      const ez = new THREE.Vector3(dirX, 0, dirZ);
      const ey = new THREE.Vector3(0, 1, 0);
      const ex = new THREE.Vector3().crossVectors(ey, ez).normalize();

      const origin = new THREE.Vector3(
        (axisStart.x - partWidthMm / 2) * S,
        0,
        (axisStart.y - partHeightMm / 2) * S,
      );
      geom.applyMatrix4(new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition(origin));

      /*
       * UV — у нормованих координатах ДЕТАЛІ, як у торцях: камінь у
       * канавці продовжує камінь навколо неї, а не починається наново.
       * Беремо проекцію на площину плити (вид зверху) — саме так виглядає
       * фрезерована канавка на живому камені.
       */
      const pos = geom.attributes.position;
      const uv = geom.attributes.uv;
      if (uv && pos) {
        for (let i = 0; i < pos.count; i += 1) {
          const xMm = pos.getX(i) / S + partWidthMm / 2;
          const zMm = pos.getZ(i) / S + partHeightMm / 2;
          uv.setXY(i, xMm / partWidthMm, zMm / partHeightMm);
        }
        uv.needsUpdate = true;
      }

      void axisEnd;
      out.push(geom);
    }
  }

  return out;
}

/** Усі проблеми по всіх групах — для панелі введення і бланка. */
export function validateGrooves(
  groups: SurfaceGrooveGroup[] | undefined,
  partWidthMm: number,
  partHeightMm: number,
  thicknessMm: number,
): GrooveIssue[] {
  if (!groups?.length) return [];
  return groups.flatMap((group) => validateGrooveGroup(group, partWidthMm, partHeightMm, thicknessMm));
}

/** Сумарна довжина фрезерування, погонні метри — для кошторису. */
export function grooveTotalLengthMm(groups: SurfaceGrooveGroup[] | undefined): number {
  if (!groups?.length) return 0;
  return groups.reduce((sum, group) => sum + Math.max(0, group.count) * Math.max(0, group.length), 0);
}
