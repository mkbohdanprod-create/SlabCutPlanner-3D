/**
 * ЗАЛИШКИ ЗІ СКЛАДУ (Stone WMS) — клієнт пошуку листів за артикулом.
 *
 * Заведено 26.08.2026 разом із кнопкою «Підібрати залишки» в панелі
 * нерозміщених деталей. Контракт погоджується з WMS (див.
 * Industry 4.0/ПРОМПТ_АГЕНТУ_WMS_ЕНДПОІНТ.md): за кодом номенклатури —
 * перелік ФІЗИЧНИХ листів, з габаритом, коміркою, партією і тоном.
 *
 * Поки ендпоінта на боці WMS немає, кожен запит чесно завершується
 * помилкою 'unreachable' — і інтерфейс каже «відповідь від WMS не
 * отримана», а не показує порожній склад. Різниця принципова: «складу
 * не спитали» і «на складі порожньо» — це різні повідомлення, і плутати
 * їх не можна (той самий принцип, що з цінами 25.08).
 *
 * Шлях запиту — /wms/... через dev-проксі vite: токен живе в оточенні
 * машини розробника і в браузер не потрапляє. У бою це буде наш бекенд;
 * для цього модуля зміниться тільки WMS_BASE.
 */

export interface WmsSheet {
  /** Ідентичність конкретного листа: SLAB-<код>-<номер> */
  sheet: string;
  width: number;
  height: number;
  thickness: number;
  /** Цілий лист чи залишок */
  state: 'whole' | 'remnant';
  /** Вільний чи вже під замовленням */
  status: 'free' | 'reserved';
  /** Комірка на складі — куди фізично йти */
  cell: string;
  batch: string | null;
  tone: string | null;
  /** Фото саме цього листа, якщо є. null — покажемо декор із каталогу */
  photo: string | null;
  updatedAt: string | null;
}

export interface WmsStockAnswer {
  code: string;
  generatedAt: string | null;
  total: number;
  truncated: boolean;
  sheets: WmsSheet[];
}

export type WmsStockError =
  /** Відповідь не отримана: сервіс не підключений, лежить, або віддав не-JSON */
  | 'unreachable'
  /** WMS відповіла помилкою зі своїм машинним кодом */
  | 'service';

export class WmsError extends Error {
  readonly kind: WmsStockError;

  constructor(kind: WmsStockError, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'WmsError';
  }
}

const WMS_BASE = '/wms/api/v1';

/**
 * Листи за артикулом. Тільки вільні: зайняті менеджеру не пропонуємо.
 *
 * Кожне поле відповіді нормалізується до чисел/рядків прямо тут — щоб
 * решта коду працювала з передбачуваними типами, хоч би що прислав
 * сервіс. HTML замість JSON (Cloudflare 502, сторінка логіна) дає
 * 'unreachable', а не криптичний краш парсера — на цьому вже обпеклись
 * із цінами.
 */
export async function fetchWmsSheets(code: string, signal?: AbortSignal): Promise<WmsStockAnswer> {
  let res: Response;
  try {
    res = await fetch(`${WMS_BASE}/stock?code=${encodeURIComponent(code)}&status=free`, { signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new WmsError('unreachable', 'WMS недоступна — запит не пройшов');
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    // Не-JSON — це проксі або сторінка помилки, тобто до WMS не дійшло
    throw new WmsError('unreachable', `WMS не відповіла (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const record = body as { error?: unknown; message?: unknown };
    const message = typeof record.message === 'string' && record.message
      ? record.message
      : `WMS відповіла помилкою (HTTP ${res.status})`;
    throw new WmsError('service', message);
  }

  const record = body as Partial<WmsStockAnswer> & { sheets?: unknown };
  const rawSheets = Array.isArray(record.sheets) ? record.sheets : [];
  const sheets: WmsSheet[] = rawSheets.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      sheet: String(item.sheet ?? ''),
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      thickness: Number(item.thickness) || 0,
      state: item.state === 'whole' ? 'whole' : 'remnant',
      status: item.status === 'reserved' ? 'reserved' : 'free',
      cell: String(item.cell ?? ''),
      batch: typeof item.batch === 'string' && item.batch ? item.batch : null,
      tone: typeof item.tone === 'string' && item.tone ? item.tone : null,
      photo: typeof item.photo === 'string' && item.photo ? item.photo : null,
      updatedAt: typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : null,
    };
  }).filter((sheet) => sheet.sheet && sheet.width > 0 && sheet.height > 0);

  return {
    code: String(record.code ?? code),
    generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : null,
    total: Number(record.total) || sheets.length,
    truncated: Boolean(record.truncated),
    sheets,
  };
}
