import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Price1c } from '../../lib/api';

/**
 * Ціни прорахунку з 1С (метод getDiscountPrice).
 *
 * Ціни не вписуються руками: за кодом номенклатури 1С їх віддає сама ERP —
 * той самий прайс, за яким виписується рахунок, разом зі знижкою
 * контрагента. Ручне поле в рядку лишається — воно перекриває будь-яку
 * прораховану ціну.
 *
 * Навантаження притримуємо тим самим способом, що й у пошуку контрагентів:
 * запит летить після паузи в правках (DEBOUNCE_MS), попередній
 * скасовується AbortController, а однаковий набір «коди + кількості +
 * контрагент» не смикає мережу взагалі — перерахунок сум у таблиці
 * відбувається локально.
 *
 * 1С недоступна — це не порожній розрахунок: останні відомі ціни
 * лишаються (вони прив'язані до кодів, а не до документа). А от рядків,
 * на які ціна так і не прийшла, фолбеком на локальний прайс НЕ рятуємо
 * (рішення 25.08.2026, див. QuotePriceSource у engines/quoteCalc): у них
 * ціна нульова, і рядок стану має казати саме це, а не обіцяти прайс.
 *
 * ПРО КОНТРАГЕНТА (рішення 26.08.2026). 1С без client_guid віддає
 * ЗАГАЛЬНИЙ прайс, і менеджер може прийняти його за ціну свого клієнта.
 * ІТ закрили це повністю: без контрагента запит не летів (стан 'waiting').
 * Ми лишаємо запит — інакше без живого довідника контрагентів не
 * порахувати нічого взагалі, — але клієнтський PDF без контрагента не
 * дається (див. pdfBlocked у QuotePanel), а в рядку стану видно
 * «за загальним прайсом». Перемикач нижче повертає жорстку поведінку ІТ
 * одним рядком.
 *
 * Ціни, отримані за іншим контрагентом, скидаються в будь-якому разі:
 * контрагента змінили — старі числа до нового вже не стосуються.
 *
 * Стан 'loading' ВИВОДИТЬСЯ, а не вмикається окремим setState: поки
 * ключ поточного запиту не збігається з ключем останньої відповіді —
 * рахунок триває. Через це прелоадер з'являється одразу на правку, ще до
 * паузи (інакше кілька сотень мілісекунд у таблиці стояли б старі числа
 * без жодної ознаки, що вони вже не ті), і жоден setState не викликається
 * синхронно в тілі ефекту.
 */

/**
 * true — без контрагента запит у 1С не летить узагалі (поведінка мейну).
 * false — рахуємо й за загальним прайсом, а від чужої ціни в клієнтському
 * документі захищає блокування PDF. Рішення власника 26.08.2026.
 */
export const PRICES_REQUIRE_CUSTOMER = false;

/** Пауза після останньої правки документа перед запитом цін */
export const PRICES_DEBOUNCE_MS = 400;

/** 'waiting' — чекаємо вибору контрагента, без нього запит не летить */
export type PricesState = 'idle' | 'loading' | 'ready' | 'error' | 'off' | 'waiting';

export type PriceRequest = { code: string; qty: number };

/** Сталі порожні відповіді — щоб порожній прорахунок не смикав рендер */
const NO_MISSING: string[] = [];
const EMPTY_PRICES: Record<string, Price1c> = {};

export interface PricesResult {
  /** Повні картки цін за кодом — для підказок в інтерфейсі */
  prices: Record<string, Price1c>;
  /** Код → грн за одиницю: рівно те, що чекає движок прорахунку */
  unitPrices: Record<string, number>;
  /** Коди, на які 1С ціни не дала */
  missing: string[];
  state: PricesState;
  error: string;
  /** Час останньої успішної відповіді */
  updatedAt: number | null;
  refresh: () => void;
}

/**
 * Помилка → те, що побачить менеджер.
 *
 * Розрізняємо не лише статус, а й машинний код: у цін три різні 502 —
 * мовчить 1С, мовчить довідник номенклатур, контрагента немає в ERP, —
 * і кожен вимагає різних дій від різних людей.
 */
function priceErrorText(error: unknown): { text: string; state: PricesState } {
  const status = error instanceof ApiError ? error.status : 0;
  const code = error instanceof ApiError ? error.code : '';
  if (code === 'prices_client_not_in_erp') {
    return { text: 'Контрагента немає в 1С — ціни за його прайсом не порахувати', state: 'error' };
  }
  if (code === 'prices_catalog_unavailable' || code === 'prices_catalog_error') {
    return { text: 'Довідник номенклатур недоступний — цін немає, суми нульові', state: 'error' };
  }
  // Два різні 502 від 1С розділені навмисно: «немає зв'язку» — це мережа
  // сервера (на проді 1С живе за приватною адресою, і туди може не бути
  // маршруту), а «відхилила запит» — це вже сама ERP. Поки обидва писались
  // однаково, зі скриншота неможливо було зрозуміти, кого кликати.
  if (code === 'prices_erp_unavailable') {
    return { text: 'Немає зв’язку з 1С із сервера — цін немає, суми нульові', state: 'error' };
  }
  if (code === 'prices_erp_error') {
    return { text: '1С відхилила запит цін — цін немає, суми нульові', state: 'error' };
  }
  // 403 — про сервісний акаунт застосунку, а не про права менеджера
  if (status === 403) return { text: 'Довідник контрагентів відмовив у доступі — потрібне налаштування прав сервісу', state: 'error' };
  if (status === 401) return { text: 'Сесія завершилась — увійдіть у застосунок повторно', state: 'error' };
  // 404 — бекенд ще без ендпоінта цін (не перезапущений після оновлення):
  // для менеджера це те саме «не підключено», що й незаповнені змінні.
  if (status === 503 || status === 404) return { text: '1С не підключено — цін немає, суми нульові', state: 'off' };
  return { text: '1С не відповідає — цін немає, суми нульові', state: 'error' };
}

export function usePrices1c(items: PriceRequest[], organizationId?: string): PricesResult {
  const [prices, setPrices] = useState<Record<string, Price1c>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [state, setState] = useState<PricesState>('idle');
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  // Запит, на який уже прийшла відповідь (успішна чи ні). Розбіжність із
  // поточним і означає «рахуємо» — окремий прапорець тут зайвий.
  const [settled, setSettled] = useState('');
  // Контрагент, за прайсом якого пораховані ціни в prices. Поки не збігається
  // з поточним — показувати ці числа не можна: вони з чужою знижкою.
  const [pricedFor, setPricedFor] = useState('');
  const [nonce, setNonce] = useState(0);

  // Ключ запиту І Є запитом: рядки прорахунку перебудовуються на кожну
  // правку документа (навіть на зміну адреси), тому ефект зав'язаний не на
  // масив, а на його вміст — інакше мережа смикалась би на кожен рендер.
  const key = useMemo(
    () => JSON.stringify([organizationId ?? '', items.map((item) => [item.code, item.qty])]),
    [items, organizationId],
  );
  // «Оновити ціни» не міняє ключ, але має перерахувати — тому в
  // ідентифікатор запиту входить і лічильник ручних оновлень.
  const requestId = `${nonce}\u0000${key}`;

  useEffect(() => {
    const [organization, rows] = JSON.parse(key) as [string, Array<[string, number]>];
    // Рахувати нічого — і стан «порожньо» лишається похідним від пропсів,
    // а не окремим setState у тілі ефекту.
    if (!rows.length) return;
    // Контрагента не вибрано: питати чи ні — вирішує PRICES_REQUIRE_CUSTOMER.
    // Стан 'waiting' і порожні ціни виводяться нижче з пропсів, як і стан
    // порожнього прорахунку.
    if (PRICES_REQUIRE_CUSTOMER && !organization) return;
    const request = rows.map(([code, qty]) => ({ code, qty }));
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.prices1c(request, { organizationId: organization || undefined }, controller.signal)
        .then((answer) => {
          if (controller.signal.aborted) return;
          setPrices(answer.prices);
          setMissing(answer.missing);
          setPricedFor(organization);
          setUpdatedAt(Date.now());
          setError('');
          setState('ready');
          setSettled(requestId);
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          const { text, state: next } = priceErrorText(cause);
          setError(text);
          setState(next);
          setSettled(requestId);
        });
    }, PRICES_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, requestId]);

  // Ціни належать контрагенту, за яким їх рахували. Змінили контрагента —
  // старі числа зникають одразу, не чекаючи відповіді за новим прайсом.
  const fresh = (organizationId ?? '') === pricedFor;
  const shownPrices = fresh ? prices : EMPTY_PRICES;

  const unitPrices = useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(shownPrices).forEach((price) => { map[price.code] = price.unitPrice; });
    return map;
  }, [shownPrices]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  // Порожній прорахунок не має показувати ні статус, ні залишки минулого
  // запиту: рядків немає — і говорити нема про що.
  const empty = items.length === 0;
  // Контрагента немає — рахувати нічого й нема про що звітувати
  const waiting = PRICES_REQUIRE_CUSTOMER && !organizationId;
  // Відповіді на поточний запит ще немає — отже, рахуємо
  const loading = settled !== requestId;

  return {
    prices: shownPrices,
    unitPrices,
    missing: empty || waiting || loading ? NO_MISSING : missing,
    state: empty ? 'idle' : waiting ? 'waiting' : loading ? 'loading' : state,
    error: empty || waiting || loading ? '' : error,
    updatedAt: fresh ? updatedAt : null,
    refresh,
  };
}
