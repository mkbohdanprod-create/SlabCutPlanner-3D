/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QuoteOrderCard } from '../QuoteOrderCard';
import { createQuoteCalcDoc, type QuoteCalcDoc, type QuoteOrderRef } from '../../../domain/quoteCalc';
import type { QuoteCalcLine } from '../../../engines/quoteCalc';
import type { CreatedOrder } from '../../../lib/api';

/*
 * Картка замовлення. Перевіряємо саме те, що коштує грошей і нервів:
 * коли кнопка неактивна, що замовлення не створюється двічі випадково,
 * і що ПОВТОРНЕ створення можливе, але тільки як свідома дія.
 */

const createOrder = vi.fn<(request: unknown) => Promise<CreatedOrder>>();

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return { ...actual, api: { createOrder: (request: unknown) => createOrder(request) } };
});

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'manager@viyar.ua', name: 'Менеджер' }, isLoading: false, signOut: vi.fn() }),
}));

const LINES: QuoteCalcLine[] = [
  { id: 'fab', group: 'fabrication', label: 'Виготовлення: Стільниця', qty: 1.44, unit: 'm2', unitPrice: 15847.38, source: 'erp', sum: 22820.23, code: '292356' },
  { id: 'material', group: 'material', label: 'Матеріал: Керамограніт', qty: 2, unit: 'sheet', unitPrice: 0, source: 'none', sum: 0 },
];

const ORDER: QuoteOrderRef = {
  externalId: 'AMN-8912', orderId: 'oid-1', orderDetailsId: 'oid-2',
  createdAt: '2026-08-26T12:35:00.000Z', createdBy: 'r_duchenko@viyar.ua', total: 22820.23,
};

const PROJECT = { id: 'p-1', name: 'Кухня', orderNumber: 'SCP-17' };

const button = (name: RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

function show(doc: Partial<QuoteCalcDoc> = {}, onCreated = vi.fn()) {
  const full: QuoteCalcDoc = { ...createQuoteCalcDoc(), contragentId: 'org-1', paymentType: 'Готівка', ...doc };
  render(
    <QuoteOrderCard
      doc={full}
      lines={LINES}
      total={22820.23}
      project={PROJECT}
      pricesLoading={false}
      onCreated={onCreated}
    />,
  );
  return onCreated;
}

beforeEach(() => createOrder.mockReset());
afterEach(cleanup);

describe('коли створювати не можна', () => {
  it('без контрагента з довідника кнопка неактивна — сервісу потрібен erp_uuid', () => {
    show({ contragentId: '' });
    expect(button(/створити замовлення/i).disabled).toBe(true);
    expect(screen.getByText(/Виберіть контрагента/)).toBeTruthy();
  });

  it('без методу оплати кнопка неактивна — без нього ERP не виписує рахунок', () => {
    show({ paymentType: '' });
    expect(button(/створити замовлення/i).disabled).toBe(true);
    expect(screen.getByText(/Виберіть метод оплати/)).toBeTruthy();
  });

  it('розрахунок на 0 ₴ — теж неактивна, замовлення на нуль не створюємо', () => {
    render(
      <QuoteOrderCard doc={{ ...createQuoteCalcDoc(), contragentId: 'org-1', paymentType: 'Готівка' }} lines={LINES} total={0}
        project={PROJECT} pricesLoading={false} onCreated={vi.fn()} />,
    );
    expect(button(/створити замовлення/i).disabled).toBe(true);
    expect(screen.getByText(/1С не дала цін/)).toBeTruthy();
  });
});

describe('створення', () => {
  it('між кнопкою і мережею стоїть вікно підтвердження', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Підтвердити і створити замовлення/i }));
    expect(screen.getByText(/Скасувати його з SlabCutPlanner неможливо/)).toBeTruthy();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('рядок без коду 1С видно ще до відправки — у замовлення він не поїде', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Підтвердити і створити замовлення/i }));
    expect(screen.getByText('Не поїде в замовлення')).toBeTruthy();
  });

  it('номер від сервісу повертається в документ', async () => {
    createOrder.mockResolvedValue({
      externalOrderId: 'AMN-8912', orderId: 'oid-1', orderDetailsId: 'oid-2', prefix: 'UA', year: '26',
    });
    const onCreated = show();
    fireEvent.click(screen.getByRole('button', { name: /Підтвердити і створити замовлення/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Створити замовлення$/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated.mock.calls[0][0]).toMatchObject({
      externalId: 'AMN-8912', total: 22820.23, createdBy: 'manager@viyar.ua',
    });
  });

});

describe('коли замовлення вже створене', () => {
  it('показується номер, а кнопки створення немає — двічі випадково не поїде', () => {
    show({ order: ORDER });
    expect(screen.getByText('AMN-8912')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Підтвердити і створити замовлення/i })).toBeNull();
  });

  it('правки після створення видно як розбіжність суми', () => {
    show({ order: { ...ORDER, total: 100 } });
    expect(screen.getByText(/Прорахунок змінився після створення/)).toBeTruthy();
  });

  it('«ще одне» повертає картку до створення й прибирає стару заявку з очей', () => {
    show({ order: { ...ORDER, total: 100 } });
    fireEvent.click(screen.getByRole('button', { name: /Створити ще одне замовлення/i }));
    expect(screen.queryByText('AMN-8912')).toBeNull();
    expect(screen.queryByText(/Прорахунок змінився після створення/)).toBeNull();
    expect(button(/Підтвердити і створити замовлення/i).disabled).toBe(false);
  });

  it('раніше створені номери не зникають', () => {
    show({ order: ORDER, orderHistory: [{ ...ORDER, externalId: 'AMN-8899' }] });
    expect(screen.getByText(/Раніше з цього прорахунку: AMN-8899/)).toBeTruthy();
  });
});
