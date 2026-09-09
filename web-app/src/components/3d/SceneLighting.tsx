import { useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

/**
 * ОДНЕ СВІТЛО НА ВСЮ ПРОГРАМУ (№166, власник 09.09: «давай роби, тільки не
 * забувай режим підсвітки»).
 *
 * Було: `ambient 0.6 + directional 1.2 + <Environment preset="city">`. Виміряно
 * на демо-сцені 09.09 (файл `InstructionsRules\СВІТЛО_зараз_vs_нормальне.png`):
 * камінь у такій сцені виходив ТЕМНІШИМ за власне фото (яскравість 81 проти
 * 113 у самого знімка Antolini) — звідси відчуття «брудного» матеріалу. Плюс
 * `preset="city"` тягнув HDR з чужого CDN і в мережі без інтернету просто не
 * вмикався.
 *
 * Стало — чотири зміни, всі в налаштуваннях рендера, геометрії ніхто не чіпав:
 *
 *   1. ОТОЧЕННЯ генерується в коді (`RoomEnvironment` + PMREM), а не качається
 *      з CDN. Полірований камінь читається оком саме по відбиттях: без них це
 *      наклеєна картинка. Мережа більше ні до чого — падати нема чому.
 *   2. ГОЛОВНЕ СВІТЛО — площина (`rectAreaLight`), а не точка. Точкова лампа
 *      відбивається в поліровці білою плямою; площина дає м'який витягнутий
 *      блиск, як вікно в салоні.
 *   3. ТІНЬ на підлозі (тільки сцена збірки) — виріб стоїть, а не висить.
 *      Приймач — прозора площина з `ShadowMaterial`, ім'я `floor-plane`, тому
 *      знімки для PDF ховають її разом із сіткою, як і раніше.
 *   4. ТОНМАПІНГ `Neutral` замість `ACES` — ставиться на самому `<Canvas>`
 *      (`gl={{ toneMapping }}`), не тут. ACES тисне світле і зводить колір; це
 *      той самий механізм, що вибілював камінь у підсвітці (№164).
 *
 * ПРО РЕЖИМ ПІДСВІТКИ. `BacklightRig` гасить сцену імперативно: обходить
 * `scene.traverse`, збирає все, у чого `isLight`, і зводить `intensity` до
 * нуля; окремо глушить `envMapIntensity` на матеріалах каменю. Тому:
 *   · `rectAreaLight` і `hemisphereLight` — теж `Light`, гаснуть разом з усіма;
 *   · оточення входить у камінь через `envMapIntensity`, який риґ уже гасить,
 *     тож `scene.environmentIntensity` йому не заважає;
 *   · ФОН лишається `<color>`, а НЕ градієнтною текстурою: риґ уміє плавно
 *     темнити тільки `THREE.Color`. Текстурний фон зламав би затемнення;
 *   · приймач тіні гасне разом зі світлом — це робить сам риґ (він знає про
 *     `ShadowMaterial`), інакше на темному тлі лишалась би сіра пляма.
 */

/** Ім'я приймача тіні. Те саме, що в сітки: знімки для PDF ховають за ним. */
export const SHADOW_CATCHER_NAME = 'floor-plane';

type Preset = 'assembly' | 'part';

/** Розміри світла під два масштаби сцени: збірка (метри) і одна деталь. */
const PRESETS: Record<Preset, {
  soft: { intensity: number; width: number; height: number; y: number };
  key: number;
  shadowSpan: number;
}> = {
  assembly: { soft: { intensity: 2.2, width: 7, height: 3.5, y: 4.2 }, key: 0.9, shadowSpan: 12 },
  part: { soft: { intensity: 1.6, width: 3.2, height: 1.8, y: 2.0 }, key: 0.9, shadowSpan: 4 },
};

/** Внесок оточення. Нижче за 1, бо оточення тут — джерело відбиттів, не сонце. */
const ENV_INTENSITY = 0.55;

let uniformsReady = false;

/**
 * Оточення для відбиттів. Генерується один раз на рендерер і знімається при
 * розмонтуванні — інакше після зміни вкладки в сцені лишалась би чужа карта.
 */
function StudioEnvironment({ intensity }: { intensity: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();

    const previous = scene.environment;
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;

    return () => {
      if (scene.environment === target.texture) scene.environment = previous;
      target.dispose();
    };
  }, [gl, scene, intensity]);

  return null;
}

export function SceneLighting({
  preset = 'assembly',
  /** Режим «Розміри»: там дивляться на числа, тому світло рівне і без тіней. */
  flat = false,
  /** Висота підлоги для тіні. `null` — приймач не ставимо (редактор деталі). */
  groundY = null,
}: {
  preset?: Preset;
  flat?: boolean;
  groundY?: number | null;
}) {
  const cfg = PRESETS[preset];
  const soft = useRef<THREE.RectAreaLight>(null);

  // Прямокутне світло рахується по таблицях, які треба один раз завантажити.
  if (!uniformsReady) {
    RectAreaLightUniformsLib.init();
    uniformsReady = true;
  }

  // Площину світла направляємо в центр сцени — тільки позиції для цього мало.
  useLayoutEffect(() => {
    soft.current?.lookAt(0, 0, 0);
  });

  if (flat) {
    return (
      <>
        <ambientLight intensity={1.0} />
        <directionalLight position={[10, 10, 5]} intensity={0.5} />
      </>
    );
  }

  return (
    <>
      <StudioEnvironment intensity={ENV_INTENSITY} />

      {/* Запобіжник: якщо PMREM не піде на слабкій відеокарті, сцена не
          провалиться в чорноту. Свідомо мало — основне світло не тут. */}
      <ambientLight intensity={0.12} />

      <rectAreaLight
        ref={soft}
        intensity={cfg.soft.intensity}
        width={cfg.soft.width}
        height={cfg.soft.height}
        position={[-cfg.soft.width * 0.15, cfg.soft.y, cfg.soft.height * 0.9]}
      />

      <directionalLight
        /* Майже згори: виріб стоїть вище сітки, і коса лампа відкидала б тінь
           далеко вбік — вона читалась як окрема сіра пляма, а не як тінь. */
        position={[3, 12, 4]}
        intensity={cfg.key}
        color="#fff6ea"
        castShadow={groundY !== null}
        shadow-mapSize={[2048, 2048]}
        shadow-radius={4}
        shadow-bias={-0.0006}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-cfg.shadowSpan}
        shadow-camera-right={cfg.shadowSpan}
        shadow-camera-top={cfg.shadowSpan}
        shadow-camera-bottom={-cfg.shadowSpan}
      />

      {/* Контровий підсвіт ззаду-зліва: віддирає деталь від фону. */}
      <directionalLight position={[-8, 4, -6]} intensity={0.45} color="#dfe9ff" />

      <hemisphereLight args={['#ffffff', '#8a8f96', 0.15]} />

      {groundY !== null && (
        <mesh
          name={SHADOW_CATCHER_NAME}
          rotation={[-Math.PI / 2, 0, 0]}
          /* На 2 мм нижче сітки: вони співпадали б за висотою і билися за
             пікселі — сітка то зникала, то мерехтіла. */
          position={[0, groundY - 0.002, 0]}
          receiveShadow
          raycast={() => null}
        >
          <planeGeometry args={[60, 60]} />
          {/* depthWrite=false: прозора площина не має закривати собою сітку. */}
          <shadowMaterial transparent depthWrite={false} opacity={0.26} />
        </mesh>
      )}
    </>
  );
}
