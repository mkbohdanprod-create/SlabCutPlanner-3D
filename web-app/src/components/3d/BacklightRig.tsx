import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

/**
 * ПЛАВНА ПІДСВІТКА КАМЕНЮ (№160, власник 08.09: «кнопка Підсвітка щоб робила
 * плавний перехід — затухання сцени і підсвічування каменю, в силу тої моделі,
 * як працює, просто підміна декору, але налаштувати ефект»).
 *
 * Механіка підсвітки лишається та сама: друге фото того самого листа стає
 * текстурою (UV не змінюється, малюнок не стрибає). Змінюється тільки ПОДАЧА —
 * замість миттєвої підміни йде коротка постановка світла:
 *
 *   1. `гасне` — фон і світло сцени сходять у темряву за ~0.45 с;
 *   2. у найтемнішій точці (t ≈ 0.5) вмикається підміна фото — саме тому її
 *      не видно: у цю мить дивитись однаково нема на що;
 *   3. `світиться` — камінь піднімається власним світінням (emissive з тією ж
 *      текстурою), ніби його підсвітили ззаду.
 *
 * Технічно все робиться імперативно, у `useFrame`: React-дерево на кожен кадр
 * не перебудовується (це і вбивало контекст у №147), а сцена чіпається напряму
 * — світло, фон і матеріали. Базові значення знімаються ОДИН раз на початку
 * переходу і повертаються на місце, коли підсвітку вимикають або вузол зникає.
 */

/** Скільки триває повний перехід, секунди */
const DURATION = 0.9;
/** Фон у темряві */
const DARK = new THREE.Color('#0d1319');
/**
 * Наскільки гасне світло сцени в підсвітці. №163 (власник: «не додавай
 * картинці більшої яскравості, ніж вона є в оригіналі — вона аж побіліла»):
 * гасимо ПОВНІСТЮ. Тоді на піку камінь малюється лише власним світінням, і
 * освітлення сцени вже нічого не додає поверх фотографії.
 */
const DIM = 1;
/**
 * Сила власного світіння каменю на піку. Рівно 1 — це і є яскравість самого
 * фото з підсвіткою, ані на крихту більше. Було 1.25, і камінь вибілювало.
 */
const GLOW = 1;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

type LightLike = THREE.Light & { intensity: number };
type StoneMaterial = THREE.MeshStandardMaterial;

export function BacklightRig({ on, onSwap }: {
  /** Куди йдемо: true — підсвітка увімкнена */
  on: boolean;
  /**
   * Момент підміни фото — викликається один раз, коли сцена в найтемнішій
   * точці. Саме тут перемикається режим у сторі, і підміна текстури лишається
   * непоміченою.
   */
  onSwap: (next: boolean) => void;
}) {
  const { scene, gl } = useThree();
  const progress = useRef(on ? 1 : 0);
  const swapped = useRef(on);
  const lights = useRef<Array<{ light: LightLike; base: number }>>([]);
  const stones = useRef<Array<{ mat: StoneMaterial; baseEnv: number }>>([]);
  /*
   * №166: у сцені з'явився приймач тіні (`ShadowMaterial` під виробом). Він
   * малює тінь із карти тіней, а карта не залежить від того, на скільки ми
   * прикрутили лампу. Тому в підсвітці лишалася б сіра пляма на темному тлі.
   * Гасимо його прозорість тим самим `dim`, що й світло.
   */
  const shadows = useRef<Array<{ mat: THREE.ShadowMaterial; base: number }>>([]);
  const baseBackground = useRef<THREE.Color | null>(null);
  /*
   * №164: у режимі підсвітки дивляться САМЕ фото, тому плівковий тонмапінг
   * (ACES, типовий у R3F) на час підсвітки знімається. Він тисне світлі місця
   * і зводить контраст — на камені це читається як «вибілило і зникла
   * глибина». Повертаємо його точно таким, яким узяли.
   */
  const baseToneMapping = useRef<THREE.ToneMapping | null>(null);
  /*
   * Б-167 (знайдено 09.09 виміром, не оком): базове значення для кожного
   * об'єкта запам'ятовується РІВНО ОДИН РАЗ і більше не перезаписується.
   *
   * Було інакше — і це ламало вихід із підсвітки. `collect()` викликається ще
   * й у момент підміни фото, а в ту мить сцена вже пригашена майже в нуль.
   * Риґ брав цей нуль за «базу» і потім чесно повертав сцену… в нуль. Прогін
   * показав: після вимкнення підсвітки всі лампи лишались 0, оточення 0.
   *
   * Раніше це не вилазило випадково: лампи стояли літералами в JSX
   * (`intensity={0.6}`), і React при кожному перемальовуванні сам вписував
   * 0.6 назад. Тримати виправлення на такому збігу не можна.
   *
   * WeakMap, а не Map: матеріали й лампи живуть рівно доти, доки живе сцена,
   * і не мають триматись у пам'яті через наш словник.
   */
  const baseOf = useRef({
    light: new WeakMap<LightLike, number>(),
    env: new WeakMap<StoneMaterial, number>(),
    shadow: new WeakMap<THREE.ShadowMaterial, number>(),
  });

  /**
   * Перезбирає списки світла й матеріалів. Об'єкти, які з'явились після
   * підміни (нові матеріали каменю), дістають свою базу тут — вони ще не
   * пригашені, бо щойно створені з власними пропсами.
   */
  const collect = () => {
    lights.current = [];
    stones.current = [];
    shadows.current = [];
    const { light: lightBase, env: envBase, shadow: shadowBase } = baseOf.current;
    scene.traverse((object) => {
      const light = object as LightLike;
      if (light.isLight) {
        if (!lightBase.has(light)) lightBase.set(light, light.intensity);
        lights.current.push({ light, base: lightBase.get(light) ?? light.intensity });
        return;
      }
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      list.forEach((material) => {
        if (!material) return;
        if ((material as THREE.ShadowMaterial).isShadowMaterial) {
          const shadow = material as THREE.ShadowMaterial;
          if (!shadowBase.has(shadow)) shadowBase.set(shadow, shadow.opacity);
          shadows.current.push({ mat: shadow, base: shadowBase.get(shadow) ?? shadow.opacity });
          return;
        }
        const mat = material as StoneMaterial;
        // Камінь — це меш із фотографією слябу. Матеріали без карти (сітка,
        // помічники, підказки) не чіпаємо: їм світитись нема чим.
        if ((mat as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial && mat.map) {
          if (!envBase.has(mat)) envBase.set(mat, mat.envMapIntensity ?? 1);
          stones.current.push({ mat, baseEnv: envBase.get(mat) ?? 1 });
        }
      });
    });
    if (!baseBackground.current && scene.background instanceof THREE.Color) {
      baseBackground.current = scene.background.clone();
    }
    if (baseToneMapping.current === null) baseToneMapping.current = gl.toneMapping;
  };

  /** Наносить стан переходу на сцену. */
  const apply = (t: number) => {
    const dim = 1 - DIM * smoothstep(0, 0.55, t);
    const glow = smoothstep(0.45, 1, t);

    lights.current.forEach(({ light, base }) => { light.intensity = base * dim; });
    shadows.current.forEach(({ mat, base }) => { mat.opacity = base * dim; });

    if (baseBackground.current && scene.background instanceof THREE.Color) {
      scene.background.copy(baseBackground.current).lerp(DARK, smoothstep(0, 0.6, t));
    }

    stones.current.forEach(({ mat, baseEnv }) => {
      /* Світло сцени гасне, але камінь однаково підсвічувало б оточення
         (Environment). Тому глушимо і його — інакше «темряви» не виходить. */
      mat.envMapIntensity = baseEnv * dim;
      if (glow > 0.001) {
        // Світиться сама текстура каменю — та, що вже стоїть на матеріалі.
        // Після підміни це фото з підсвіткою, тому камінь «просвічує».
        if (mat.emissiveMap !== mat.map) {
          mat.emissiveMap = mat.map;
          mat.needsUpdate = true;
        }
        mat.emissive.setRGB(1, 1, 1);
        mat.emissiveIntensity = GLOW * glow;
      } else if (mat.emissiveMap) {
        mat.emissiveMap = null;
        mat.emissive.setRGB(0, 0, 0);
        mat.emissiveIntensity = 0;
        mat.needsUpdate = true;
      }
    });
  };

  useEffect(() => {
    collect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  /* Повернути сцену як було, якщо вузол зникає посеред переходу: інакше
     сцена лишиться темною назавжди, а причину шукатимуть у рендері. */
  useEffect(() => () => {
    if (baseToneMapping.current !== null) gl.toneMapping = baseToneMapping.current;
    lights.current.forEach(({ light, base }) => { light.intensity = base; });
    shadows.current.forEach(({ mat, base }) => { mat.opacity = base; });
    if (baseBackground.current && scene.background instanceof THREE.Color) {
      scene.background.copy(baseBackground.current);
    }
    stones.current.forEach(({ mat, baseEnv }) => {
      mat.envMapIntensity = baseEnv;
      if (!mat.emissiveMap) return;
      mat.emissiveMap = null;
      mat.emissive.setRGB(0, 0, 0);
      mat.emissiveIntensity = 0;
      mat.needsUpdate = true;
    });
  }, [scene, gl]);

  useFrame((_, delta) => {
    const target = on ? 1 : 0;
    const done = Math.abs(progress.current - target) < 0.001;
    if (done && swapped.current === on) return;

    if (!done) {
      const step = Math.min(delta, 0.05) / DURATION;
      progress.current += Math.sign(target - progress.current) * step;
      progress.current = Math.min(1, Math.max(0, progress.current));
      if (Math.abs(progress.current - target) < 0.001) progress.current = target;
    }

    // Підміна фото — рівно в найтемнішій точці, один раз на перехід.
    if (swapped.current !== on && ((on && progress.current >= 0.5) || (!on && progress.current <= 0.5))) {
      swapped.current = on;
      onSwap(on);
      // Тонмапінг міняємо в тій самій темній точці, що й фото — щоб не блимнуло.
      if (baseToneMapping.current !== null) {
        gl.toneMapping = on ? THREE.NoToneMapping : baseToneMapping.current;
      }
      // Матеріали після підміни — інші об'єкти; перечитуємо список.
      collect();
    }

    apply(progress.current);
  });

  return null;
}
