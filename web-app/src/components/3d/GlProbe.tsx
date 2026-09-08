import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * ЗОНД WebGL — Б-153: «на стиках вилітає».
 *
 * Власник 08.09: «це погано, треба причина, чим я можу допомогти?». Ось чим:
 * увімкнути режим «Стики», дочекатись вильоту і надіслати консоль. Зонд пише
 * туди рівно ті числа, які розрізняють три різні причини одного симптому
 * «THREE.WebGLRenderer: Context Lost»:
 *
 *   · **геометрії/текстури ростуть щосекунди** — витік: щось перестворюється
 *     кожен кадр і не звільняється (так було в №147 з лініями drei);
 *   · **контекстів створено багато** (лічильник `webgl-контекстів`) — канва
 *     перемонтовується, а браузер тримає ~16 контекстів на вкладку і глушить
 *     найстаріші;
 *   · **числа стоять на місці, а виліт є** — то не пам'ять: або зависла
 *     головна нитка (сторожовий таймер GPU знімає контекст), або драйвер.
 *
 * Зонд НІЧОГО не малює і живе лише поки увімкнений режим — у бою він мовчить.
 */

/* Лічильник створених WebGL-контекстів. Патчимо один раз при завантаженні
   модуля: R3F створює контекст сам, і перехопити його інакше нічим. */
let contextsCreated = 0;
if (typeof HTMLCanvasElement !== 'undefined' && !(HTMLCanvasElement.prototype as { __vsPatched?: boolean }).__vsPatched) {
  const original = HTMLCanvasElement.prototype.getContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function patched(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    if (typeof type === 'string' && type.startsWith('webgl')) contextsCreated += 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original as any).call(this, type, ...rest);
  };
  (HTMLCanvasElement.prototype as { __vsPatched?: boolean }).__vsPatched = true;
}

export function GlProbe({ active, label, counts }: {
  /** Вмикається тільки в підозрілому режимі */
  active: boolean;
  /** Що саме дивимось — потрапляє в кожен рядок логу */
  label: string;
  /** Довільні числа сцени: скільки пар стиків, ліній тощо */
  counts?: Record<string, number>;
}) {
  const gl = useThree((state) => state.gl);
  const countsRef = useRef(counts);
  countsRef.current = counts;
  /* Ідентифікатор ЦЬОГО вузла. Якщо в логу id щоразу новий — канва (а з нею
     WebGL-контекст) перемонтовується, і це вже інша хвороба, ніж витік. */
  const instance = useRef(Math.random().toString(36).slice(2, 6));

  useEffect(() => {
    if (!active) return undefined;
    /* Один РЯДОК, а не об'єкт: об'єкт у консолі згорнутий, і власнику довелось
       би розкривати кожен запис, щоб побачити головне число. */
    const snapshot = () => {
      const info = gl.info;
      const extra = Object.entries(countsRef.current ?? {})
        .map(([key, value]) => `${key} ${value}`)
        .join(' · ');
      const canvases = typeof document !== 'undefined' ? document.querySelectorAll('canvas').length : 0;
      return `#${instance.current} · геом ${info.memory.geometries} · текст ${info.memory.textures}`
        + ` · прог ${info.programs?.length ?? 0} · викл ${info.render.calls}`
        + ` · КОНТЕКСТІВ ${contextsCreated} · канв ${canvases}${extra ? ` · ${extra}` : ''}`;
    };

    console.info(`[VS3D · ${label}] вхід у режим ${snapshot()}`);
    const timer = window.setInterval(() => {
      console.info(`[VS3D · ${label}] тік ${snapshot()}`);
    }, 2000);

    const canvas = gl.domElement;
    const onLost = () => console.error(`[VS3D · ${label}] КОНТЕКСТ ВТРАЧЕНО ${snapshot()}`);
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      window.clearInterval(timer);
      canvas.removeEventListener('webglcontextlost', onLost);
      console.info(`[VS3D · ${label}] вихід із режиму ${snapshot()}`);
    };
  }, [active, label, gl]);

  return null;
}
