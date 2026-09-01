/**
 * Відновлення WebGL-контексту після Context Lost.
 *
 * ЧОМУ ЦЕ ОКРЕМИЙ МОДУЛЬ (не дописка в Viewer3D.tsx). Інваріант 2.48:
 * новий клопіт — свій модуль, підключення — рівно один рядок у кожному
 * місці, де є `<Canvas>`.
 *
 * ЩО ЗА БАГ (FG-08 / SC-36, 24.08). У проєкті кілька живих WebGL-полотен
 * одночасно (редактор, «3D Збірка», прихований знімок для PDF-прорахунку
 * через CaptureController). Коли браузер втрачає контекст одного з них —
 * подія `webglcontextlost` летить у DOM, і БЕЗ `event.preventDefault()`
 * усередині обробника браузер НЕ намагається відновити контекст сам.
 * Досі жодного обробника в коді не було — тобто втрата контексту завжди
 * була НАЗАВЖДИ: сцена чорніє й такою лишається (симптом FG-08), а
 * прихований знімок для PDF тихо повертає порожнє зображення без жодної
 * помилки в консолі (симптом SC-36) — `toDataURL()` на мертвому контексті
 * не кидає виняток.
 *
 * Це не рішення «двох 3D-рушіїв одночасно» (SC-20) — воно про кількість
 * контекстів. Це рішення того, що коли контекст ВЖЕ загублено, браузер
 * має шанс сам його підняти назад, а ми — шанс не знімати порожній кадр,
 * поки він не піднявся.
 */

interface GlLike {
  getContext: () => WebGLRenderingContext | WebGL2RenderingContext | null;
}

/**
 * Вішає обробники `webglcontextlost` / `webglcontextrestored` на полотно.
 * Викликає `event.preventDefault()` — це і є той рядок, якого бракувало:
 * без нього браузер контекст не відновлює.
 *
 * Повертає функцію відписки — викликати при демонтажі `<Canvas>`.
 */
export function attachContextLossRecovery(
  canvas: HTMLCanvasElement,
  onLost?: () => void,
  onRestored?: () => void,
): () => void {
  const handleLost = (event: Event) => {
    event.preventDefault();
    console.warn('[WebGL] Контекст втрачено — чекаємо на відновлення браузером.');
    onLost?.();
  };
  const handleRestored = () => {
    console.warn('[WebGL] Контекст відновлено.');
    onRestored?.();
  };
  canvas.addEventListener('webglcontextlost', handleLost, false);
  canvas.addEventListener('webglcontextrestored', handleRestored, false);
  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost);
    canvas.removeEventListener('webglcontextrestored', handleRestored);
  };
}

/** Чи мертвий WebGL-контекст цього рендерера прямо зараз. */
export function isContextLost(gl: GlLike): boolean {
  try {
    const ctx = gl.getContext();
    return ctx ? ctx.isContextLost() : true;
  } catch {
    return true;
  }
}

/**
 * Чекає, поки контекст стане живим (короткий поллінг), або вичерпує
 * спроби. За замовчуванням ~8×150мс = до 1.2с — досить, щоб браузер
 * встиг відновити контекст після preventDefault(), не роздуваючи
 * очікування знімка для PDF до відчутної паузи.
 *
 * Використовується в CaptureController ПЕРЕД знімком — щоб не «знімати»
 * мовчки порожній кадр, поки контекст ще не піднявся.
 */
export async function waitForLiveContext(
  gl: GlLike,
  attempts = 8,
  delayMs = 150,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (!isContextLost(gl)) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return !isContextLost(gl);
}
