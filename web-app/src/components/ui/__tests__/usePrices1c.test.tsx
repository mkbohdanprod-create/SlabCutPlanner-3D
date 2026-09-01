/**
 * @vitest-environment jsdom
 */
import { useMemo } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { usePrices1c, PRICES_DEBOUNCE_MS, PRICES_REQUIRE_CUSTOMER, type PriceRequest } from '../usePrices1c';
import { ApiError, type Price1c, type Prices1cResponse } from '../../../lib/api';

// Ціни прорахунку: перевіряємо саме умови, за яких запит летить у 1С
// (пауза, незмінний набір кодів, контрагент), і те, що недоступна ERP не
// обнуляє розрахунок — рядки просто лишаються на локальному прайсі.

const prices1c = vi.fn<
  (items: PriceRequest[], options?: object, signal?: AbortSignal) => Promise<Prices1cResponse>
>();

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return {
    ...actual,
    api: { prices1c: (...args: [PriceRequest[], object?, AbortSignal?]) => prices1c(...args) },
  };
});

const PRICE: Price1c = {
  code: '292336',
  name: 'Виготовлення стільниці без потовщень',
  unitPrice: 3600,
  sum: 8640,
  quantity: 2.4,
  unitId: '003',
  currency: 'UAH',
};

function Harness({ items, organizationId = ORG }: { items: Array<[string, number]>; organizationId?: string }) {
  // Новий масив на кожен рендер — саме так його віддає таблиця прорахунку
  const request = useMemo(() => items.map(([code, qty]) => ({ code, qty })), [items]);
  const cost = usePrices1c(request, organizationId);
  return (
    <div>
      <span data-testid="state">{cost.state}</span>
      <span data-testid="error">{cost.error}</span>
      <span data-testid="price">{cost.unitPrices['292336'] ?? ''}</span>
      <span data-testid="missing">{cost.missing.join(',')}</span>
    </div>
  );
}

const wait = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
};

const ITEMS: Array<[string, number]> = [['292336', 2.4]];
/** Контрагент із довідника: без нього ціни не рахуються взагалі */
const ORG = 'org-1';

describe('ціни прорахунку з 1С', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    prices1c.mockReset().mockResolvedValue({ prices: { '292336': PRICE }, missing: [] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('ціна приїжджає після паузи в правках і лягає на код', async () => {
    render(<Harness items={ITEMS} />);
    expect(prices1c).not.toHaveBeenCalled();
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(prices1c).toHaveBeenCalledTimes(1);
    expect(prices1c.mock.calls[0][0]).toEqual([{ code: '292336', qty: 2.4 }]);
    expect(screen.getByTestId('price').textContent).toBe('3600');
    expect(screen.getByTestId('state').textContent).toBe('ready');
  });

  it('контрагент їде разом із запитом — від нього залежить прайс-категорія', async () => {
    render(<Harness items={ITEMS} organizationId="o1" />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(prices1c.mock.calls[0][1]).toEqual({ organizationId: 'o1' });
  });

  it('той самий набір кодів і кількостей мережу не смикає', async () => {
    const { rerender } = render(<Harness items={ITEMS} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    rerender(<Harness items={[['292336', 2.4]]} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(prices1c).toHaveBeenCalledTimes(1);
  });

  it('змінилась кількість — ціна перепитується (від обсягу залежать акції)', async () => {
    const { rerender } = render(<Harness items={ITEMS} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    rerender(<Harness items={[['292336', 5]]} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(prices1c).toHaveBeenCalledTimes(2);
    expect(prices1c.mock.calls[1][0]).toEqual([{ code: '292336', qty: 5 }]);
  });

  it('порожній прорахунок у 1С не йде', async () => {
    render(<Harness items={[]} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(prices1c).not.toHaveBeenCalled();
    expect(screen.getByTestId('state').textContent).toBe('idle');
  });

  it('403 — це про права сервісу застосунку, а не про менеджера', async () => {
    prices1c.mockRejectedValue(new ApiError(403, 'forbidden'));
    render(<Harness items={ITEMS} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(screen.getByTestId('state').textContent).toBe('error');
    expect(screen.getByTestId('error').textContent).toContain('відмовив у доступі');
  });

  it('1С не підключено — окремий стан, а не помилка', async () => {
    prices1c.mockRejectedValue(new ApiError(503, 'not configured'));
    render(<Harness items={ITEMS} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(screen.getByTestId('state').textContent).toBe('off');
    expect(screen.getByTestId('error').textContent).toContain('не підключено');
  });

  it('1С відпала — раніше отримані ціни лишаються', async () => {
    const { rerender } = render(<Harness items={ITEMS} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    prices1c.mockRejectedValue(new ApiError(502, 'unavailable'));
    rerender(<Harness items={[['292336', 9]]} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(screen.getByTestId('state').textContent).toBe('error');
    expect(screen.getByTestId('price').textContent).toBe('3600');
  });

  // Рішення власника 26.08.2026: без контрагента ціни РАХУЮТЬСЯ (за загальним
  // прайсом), бо інакше без живого довідника контрагентів не порахувати нічого.
  // Від чужої ціни в документі захищає блокування клієнтського PDF, а не
  // мовчазна відмова рахувати. Перемикач PRICES_REQUIRE_CUSTOMER повертає
  // жорстку поведінку мейну одним рядком — тест іде за перемикачем.
  it('без контрагента ціни рахуються за загальним прайсом', async () => {
    render(<Harness items={ITEMS} organizationId="" />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(PRICES_REQUIRE_CUSTOMER).toBe(false);
    expect(prices1c).toHaveBeenCalledTimes(1);
    expect(prices1c.mock.calls[0][1]).toEqual({ organizationId: undefined });
    expect(screen.getByTestId('state').textContent).toBe('ready');
    expect(screen.getByTestId('price').textContent).toBe('3600');
  });

  it('контрагента прибрали — ціни за його прайсом зникають одразу', async () => {
    const { rerender } = render(<Harness items={ITEMS} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(screen.getByTestId('price').textContent).toBe('3600');
    rerender(<Harness items={ITEMS} organizationId="" />);
    // Числа за старим контрагентом мають зникнути ще до відповіді на новий
    // запит: вони пораховані з чужою знижкою.
    expect(screen.getByTestId('price').textContent).toBe('');
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(prices1c).toHaveBeenCalledTimes(2);
    expect(prices1c.mock.calls[1][1]).toEqual({ organizationId: undefined });
  });

  it('вибрали контрагента — ціни приїжджають уже за його прайсом', async () => {
    const { rerender } = render(<Harness items={ITEMS} organizationId="" />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    rerender(<Harness items={ITEMS} organizationId="org-7" />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    // Перший запит — загальний прайс, другий — уже за прайсом контрагента
    expect(prices1c).toHaveBeenCalledTimes(2);
    expect(prices1c.mock.calls[1][1]).toEqual({ organizationId: 'org-7' });
    expect(screen.getByTestId('price').textContent).toBe('3600');
  });

  it('прелоадер вмикається одразу на правку, а не після паузи', async () => {
    render(<Harness items={ITEMS} />);
    // Запит ще не пішов, але числа в таблиці вже не ті — і це має бути видно
    expect(prices1c).not.toHaveBeenCalled();
    expect(screen.getByTestId('state').textContent).toBe('loading');
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(screen.getByTestId('state').textContent).toBe('ready');
  });

  it('контрагента немає в ERP — окреме повідомлення, а не «немає зв’язку»', async () => {
    prices1c.mockRejectedValue(new ApiError(502, 'no erp id', 'prices_client_not_in_erp'));
    render(<Harness items={ITEMS} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(screen.getByTestId('error').textContent).toContain('немає в 1С');
  });

  it('коди без ціни в 1С повертаються окремо — вони лишились на прайсі', async () => {
    prices1c.mockResolvedValue({ prices: {}, missing: ['292336'] });
    render(<Harness items={ITEMS} />);
    await wait(PRICES_DEBOUNCE_MS * 2);
    expect(screen.getByTestId('missing').textContent).toBe('292336');
  });
});
