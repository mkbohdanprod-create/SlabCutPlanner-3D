/**
 * ЦІНИ З COST SERVICE — ВІД'ЄДНАНО 01.09.2026: цей хук ніхто не викликає.
 *
 * Інтеграція робоча й перевірена наживо: сервіс приймає запит, впізнає
 * контрагента (cost_agent 514024), сам ставить валюту й прайс-категорію
 * 18. Але ЦІНИ він не дає ЖОДНОЇ: 1159 слябів каталогу, виготовлення
 * (292356/292357/292359), цехові послуги (195299) і 180 довільних
 * товарів Viyar — усі до одного «No retail price found for element …».
 * Частина номенклатур узагалі невідома Cost («product_db_id not found»).
 *
 * Тому прорахунок повернувся на 1С getDiscountPrice (usePrices1c.ts), а
 * це лишається готовим до вмикання: серверна половина — server/src/cost.js
 * з тестами, клієнтська — цей хук і api.costPrices. Бракує лише ендпоінта
 * /api/cost/prices в server/src/index.js (він знятий разом із проводкою) і
 * заміни usePrices1c на useCostPrices у панелях.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type CostPrice } from '../../lib/api';

/**
 * Ціни рядків із Cost Service.
 *
 * ЦІНА — ЦЕ ВІДПОВІДЬ СЕРВІСУ НА ПОВНЕ ПИТАННЯ: контрагент (його знижка
 * й прайс-категорія), філія (у різних філіях різний прайс), номенклатури
 * з кількостями й одиницями. Локального прайсу в застосунку немає —
 * нульова сума означає рівно одне: сервіс ціни не дав.
 *
 * ПО КНОПЦІ, А НЕ САМО. Раніше перерахунок летів сам через 400 мс після
 * будь-якої правки, і кнопка «Оновити ціни» лише повторювала те, що й
 * так відбувалось. Тепер запит робить менеджер: спершу він заповнює
 * питання цілком (філія, контрагент, вироби), і аж тоді питає ціну.
 *
 * ЗМІНИВ ПИТАННЯ — ЦІНИ ЗАСТАРІЛИ. Показані числа не зникають (вони
 * прив'язані до кодів, а не до документа), але стан стає 'stale', і
 * інтерфейс має сказати про це прямо: інакше менеджер підпише КП сумою,
 * порахованою для іншої філії чи іншого складу виробів.
 */

/** 'stale' — питання змінилось після останньої відповіді */
export type CostState = 'idle' | 'loading' | 'ready' | 'stale' | 'error';

export type CostRequestItem = { code: string; qty: number };

/** Сталі порожні відповіді — щоб порожній прорахунок не смикав рендер */
const NO_CODES: string[] = [];
const EMPTY_PRICES: Record<string, CostPrice> = {};

export interface CostPricesResult {
  /** Повні картки цін за кодом — для підказок в інтерфейсі */
  prices: Record<string, CostPrice>;
  /** Код → грн за одиницю: рівно те, що чекає движок прорахунку */
  unitPrices: Record<string, number>;
  /** Питали — прайсу на позицію немає */
  missing: string[];
  /** Коду немає в довіднику номенклатур: це вносять, а не лагодять */
  unknown: string[];
  /** Код є, але Cost цієї номенклатури не знає — його синхронізація */
  failed: string[];
  /** Пояснення самого сервісу («No retail price found for …») */
  errors: string[];
  /** Валюта відповіді — її визначає сервіс за контрагентом */
  currency: string;
  state: CostState;
  error: string;
  /** Час останньої успішної відповіді */
  updatedAt: number | null;
  /** Питати ціни. Без позицій із кодом 1С не робить нічого */
  refresh: () => void;
}

/**
 * Помилка → те, що побачить менеджер.
 *
 * Розрізняємо не лише статус, а й машинний код: «сервіс не налаштований»
 * (503) — це до адміністратора, 403 — про роль сервіс-акаунта, а не про
 * права менеджера, і жодне з цього не «спробуйте ще раз».
 */
function costErrorText(error: unknown): string {
  const status = error instanceof ApiError ? error.status : 0;
  const code = error instanceof ApiError ? error.code : '';
  if (code === 'prices_not_configured' || status === 503 || status === 404) {
    return 'Сервіс цін не підключено — суми лишаються нульові';
  }
  if (code === 'prices_forbidden' || status === 403) {
    return 'Сервісу цін бракує доступу — потрібне налаштування прав сервіс-акаунта';
  }
  if (code === 'prices_auth_failed' || code === 'prices_unauthorized') {
    return 'Сервіс цін не приймає токен застосунку — потрібне налаштування';
  }
  if (status === 401) return 'Сесія завершилась — увійдіть у застосунок повторно';
  return 'Сервіс цін не відповідає — суми не пораховані';
}

export function useCostPrices(
  items: CostRequestItem[],
  { organizationId = '', branchId = '' }: { organizationId?: string; branchId?: string } = {},
): CostPricesResult {
  const [answer, setAnswer] = useState<{
    prices: Record<string, CostPrice>;
    missing: string[];
    unknown: string[];
    failed: string[];
    errors: string[];
    currency: string;
    at: number;
    /** Питання, на яке це відповідь */
    key: string;
  } | null>(null);
  const [loadingKey, setLoadingKey] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  /*
   * Ключ питання: коди з кількостями + контрагент + філія. Саме за його
   * зміною ціни стають застарілими — і саме тому в ньому кількості, а не
   * лише коди: та сама послуга на 2 і на 20 м² може мати різну ціну.
   */
  const request = useMemo(() => {
    const rows = items.filter((item) => item.code && Number.isFinite(item.qty));
    return { rows, key: JSON.stringify([rows, organizationId, branchId]) };
  }, [items, organizationId, branchId]);

  const refresh = useCallback(() => {
    if (!request.rows.length) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const key = request.key;
    setLoadingKey(key);
    setError('');
    api.costPrices(request.rows, {
      organizationId: organizationId || undefined,
      branchId: branchId || undefined,
    }, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setAnswer({ ...data, at: Date.now(), key });
        setLoadingKey('');
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(costErrorText(cause));
        setLoadingKey('');
      });
  }, [request, organizationId, branchId]);

  // Незавершений запит при зникненні панелі скасовуємо — інакше відповідь
  // прийде в розмонтований компонент.
  useEffect(() => () => abort.current?.abort(), []);

  const unitPrices = useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(answer?.prices ?? EMPTY_PRICES).forEach((price) => {
      if (price.unitPrice > 0) map[price.code] = price.unitPrice;
    });
    return map;
  }, [answer]);

  const state: CostState = loadingKey ? 'loading'
    : error ? 'error'
    : !answer ? 'idle'
    : answer.key === request.key ? 'ready'
    : 'stale';

  return {
    prices: answer?.prices ?? EMPTY_PRICES,
    unitPrices,
    missing: answer?.missing ?? NO_CODES,
    unknown: answer?.unknown ?? NO_CODES,
    failed: answer?.failed ?? NO_CODES,
    errors: answer?.errors ?? NO_CODES,
    currency: answer?.currency ?? '',
    state,
    error,
    updatedAt: answer?.at ?? null,
    refresh,
  };
}
