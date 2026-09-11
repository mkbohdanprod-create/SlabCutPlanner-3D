// =====================================================================
//  src/engines/apsExport.ts
//  №173 · Міст Студія → МЕС (APS).
//
//  По той бік моста — C:\Works\MES\smart-factory-mes: aps_engine.py
//  читає контракт «mes-aps-1» (parse_import → normalize_order) і кладе
//  замовлення в «Портфель замовлень». Цей модуль збирає рівно той
//  формат з рядків кошторису (EstimateLine) — тобто МЕС отримує ті самі
//  коди 1С і кількості, які бачить цех у BOM, з одного джерела.
//
//  Протокол (server.py, порт 8082, CORS відкритий):
//    GET  /api/aps                 → { revision, ... }
//    POST /api/aps/command         { action:'preview', payload }
//    POST /api/aps/command         { action:'import', payload, revision }
//  Імпорт не перезаписує: якщо id вже в черзі, МЕС відмовить — і це
//  правильно, історію виконання ніхто не затирає.
//
//  Рядки без коду 1С НЕ викидаються: МЕС покаже їх у replay як
//  «Код не прив’язаний до ділянки» — хай проблема буде видима в черзі,
//  а не мовчки загублена тут.
// =====================================================================

import type { EstimateLine } from './estimate';

/** Адреса локального МЕС. Сервер слухає тільки цей комп’ютер. */
export const APS_BASE = 'http://127.0.0.1:8082';

export interface ApsLine {
  code: string;
  name: string;
  unit: string;
  qty: number;
  kind?: 'material';
  sourceRow: number;
}

export interface ApsOrder {
  id: string;
  desc: string;
  source: string;
  priority: number;
  lines: ApsLine[];
}

export interface ApsPayload {
  schemaVersion: 'mes-aps-1';
  orders: ApsOrder[];
}

/** Одиниці Студії → одиниці контракту mes-aps-1. */
const APS_UNITS: Record<string, string> = {
  m: 'м.п.',
  m2: 'м²',
  pcs: 'шт',
  комплект: 'шт',
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Замовлення для МЕС з рядків кошторису. Чиста функція — її і тестуємо.
 * Порожній номер замовлення — помилка одразу тут, а не 400 від МЕС.
 */
export function apsOrderFromEstimate(
  orderNumber: string,
  desc: string,
  lines: EstimateLine[],
): ApsOrder {
  const id = orderNumber.trim();
  if (!id) throw new Error('Вкажіть номер замовлення в шапці проєкту — МЕС вимагає стабільний id.');
  const apsLines: ApsLine[] = [];
  lines.forEach((line, index) => {
    if (!(line.quantity > 0)) return;
    apsLines.push({
      code: line.externalId ?? '',
      name: line.name,
      unit: APS_UNITS[line.unit] ?? line.unit,
      qty: round3(line.quantity),
      ...(line.category === 'material' ? { kind: 'material' as const } : {}),
      sourceRow: index + 1,
    });
  });
  if (apsLines.length === 0) throw new Error('У кошторисі немає жодного рядка з кількістю — нема чого відправляти.');
  return { id, desc, source: 'VS3D Studio', priority: 2, lines: apsLines };
}

export function apsPayload(order: ApsOrder): ApsPayload {
  return { schemaVersion: 'mes-aps-1', orders: [order] };
}

export interface ApsSendResult {
  ok: boolean;
  /** Де зупинились: offline — МЕС не відповів; conflict — id уже в черзі. */
  stage: 'offline' | 'conflict' | 'rejected' | 'done';
  message: string;
}

async function apsCommand(base: string, body: object): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const response = await fetch(`${base}/api/aps/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  return { ok: response.ok, data };
}

/**
 * Прев’ю → імпорт з актуальною ревізією. Будь-який мережевий провал —
 * це «МЕС не запущений або недоступний звідси», і тоді користувачу
 * пропонується файл (downloadApsJson) замість глухої помилки.
 */
export async function sendOrderToAps(order: ApsOrder, base: string = APS_BASE): Promise<ApsSendResult> {
  const payload = apsPayload(order);
  let revision: number;
  try {
    const stateResponse = await fetch(`${base}/api/aps`);
    const state = (await stateResponse.json()) as { revision?: number };
    if (!stateResponse.ok || typeof state.revision !== 'number') {
      return { ok: false, stage: 'rejected', message: 'МЕС відповів, але без ревізії — оновіть його версію.' };
    }
    revision = state.revision;

    const preview = await apsCommand(base, { action: 'preview', payload });
    if (!preview.ok) {
      return { ok: false, stage: 'rejected', message: String(preview.data.error ?? 'МЕС відхилив пакет.') };
    }
    const conflicts = Array.isArray(preview.data.conflicts) ? (preview.data.conflicts as string[]) : [];
    if (conflicts.includes(order.id)) {
      return { ok: false, stage: 'conflict', message: `Замовлення ${order.id} вже в черзі МЕС — повторний імпорт історію не перезаписує.` };
    }

    const imported = await apsCommand(base, { action: 'import', payload, revision });
    if (!imported.ok) {
      return { ok: false, stage: 'rejected', message: String(imported.data.error ?? 'МЕС відхилив імпорт.') };
    }
    return { ok: true, stage: 'done', message: `Замовлення ${order.id} у черзі МЕС.` };
  } catch {
    return {
      ok: false,
      stage: 'offline',
      message: 'МЕС не відповідає (він запускається локально, START_MES_3D.bat). Можна зберегти файл і імпортнути в МЕС вручну.',
    };
  }
}

/** Фолбек: той самий пакет файлом — для ручного імпорту в МЕС. */
export function downloadApsJson(order: ApsOrder): void {
  const blob = new Blob([JSON.stringify(apsPayload(order), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mes-aps_${order.id}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
