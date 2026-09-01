import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronRight, ClipboardCheck, Loader2, AlertTriangle, X, ShoppingCart } from 'lucide-react';
import { api, ApiError, type CreatedOrder, type OrderItemInfo } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { QUOTE_METHODS, quotePaymentLabel, quoteProductType, type QuoteCalcDoc, type QuoteOrderRef } from '../../domain/quoteCalc';
import { quoteUnitLabel, type QuoteCalcLine } from '../../engines/quoteCalc';

/**
 * Підтвердження прорахунку → замовлення в Orders Service.
 *
 * Менеджер натискає «Створити замовлення» — і документ, який він щойно
 * бачив, стає замовленням: Order + OrderDetails одним атомарним запитом
 * (POST {orders}/v2/orders/mixin/, див. server/src/orders.js). Сервіс
 * повертає номер PREFIX-YY-NNNNNN, і далі він живе в документі як номер
 * замовлення.
 *
 * Два правила, які тут головні:
 *
 *   · ДРУГЕ замовлення з того самого прорахунку не створюється. Номер
 *     лежить у документі (quoteCalc.order) і переживає перезавантаження,
 *     тому кнопки після створення просто немає — інакше подвійний клік
 *     або повторне відкриття вкладки давали б ERP два замовлення на одну
 *     кухню.
 *   · Підтверджують СВІДОМО: між кнопкою і мережею стоїть вікно з тим,
 *     що поїде в ERP (контрагент, філія, позиції, сума). Скасувати
 *     замовлення з застосунку неможливо — це вже робота ERP.
 *
 * Прорахунок після створення не блокується: менеджер може правити його
 * далі (наприклад, для нового КП). Розбіжність суми з тією, на яку
 * виписане замовлення, показується прямо в картці.
 */

/** Помилка бекенда → те, що побачить менеджер */
function orderErrorText(error: unknown): string {
  const status = error instanceof ApiError ? error.status : 0;
  const code = error instanceof ApiError ? error.code : '';
  const details = error instanceof ApiError ? error.details : [];
  // Рядок поза номенклатурою — найчастіша відмова, і вона поправна:
  // Orders Service шукає кожну позицію в довіднику за кодом 1С, тому в
  // повідомленні мають бути самі рядки, а не їхня кількість.
  const listed = details.slice(0, 3).join('; ') + (details.length > 3 ? ` та ще ${details.length - 3}` : '');
  if (code === 'order_lines_without_code') {
    return `Без коду 1С не можна створити замовлення: ${listed}`;
  }
  if (code === 'order_unknown_articles') {
    return `Цих кодів немає в довіднику номенклатури: ${listed}`;
  }
  if (code === 'order_client_not_in_erp') return 'Контрагента немає в 1С — замовлення нема на кого виписати';
  if (code === 'order_no_counter_agent') return 'Виберіть контрагента з довідника';
  if (code === 'order_no_payment_type') return 'Виберіть метод оплати — без нього в ERP не виписати рахунок';
  if (code === 'order_empty' || code === 'order_zero_total') return 'Порожній розрахунок — замовлення створювати нема з чого';
  if (code === 'order_payload_too_large') return 'Прорахунок завеликий для передачі в сервіс замовлень — зверніться до розробників';
  // 403 — про роль orders_creator на сервіс-акаунті застосунку, а не про
  // права менеджера: сам менеджер тут нічого не виправить.
  if (status === 403) return 'Сервісу замовлень бракує ролі orders_creator — потрібне налаштування прав';
  if (status === 401) return 'Сесія завершилась — увійдіть у застосунок повторно';
  // 404 — бекенд ще без ендпоінта (не перезапущений після оновлення)
  if (status === 503 || status === 404) return 'Сервіс замовлень не підключено';
  if (status === 400) return 'Прорахунок неповний — замовлення не створене';
  return 'Сервіс замовлень не відповідає — замовлення не створене';
}

const methodLabel = (id: string) => QUOTE_METHODS.find((method) => method.id === id)?.label ?? id;

/**
 * Вироби прорахунку для замовлення — з підписами типів.
 *
 * У позиції замовлення матеріалу й виробу місця немає (OrderService — це
 * назва, артикул, кількість і гроші), тому бекенд ставить їх хвостом у
 * назву й окремим блоком в additional_prop. Підпис типу («Стільниця без
 * потовщень») знає лише цей довідник, тож збираємо його тут.
 */
function orderItems(doc: QuoteCalcDoc): OrderItemInfo[] {
  return doc.items.map((item) => ({
    id: item.id,
    product: quoteProductType(item.productTypeId)?.label ?? item.productTypeId,
    shape: item.shape,
    count: item.count,
    thicknessMm: item.thicknessMm,
    areaM2: item.areaM2,
    lengthM: item.lengthM,
    sourceLabel: item.sourceLabel,
  }));
}

export function QuoteOrderCard({ doc, lines, total, project, pricesLoading, onCreated }: {
  doc: QuoteCalcDoc;
  lines: QuoteCalcLine[];
  total: number;
  project: { id: string; name: string; orderNumber: string };
  /** 1С ще рахує — сума ще не остаточна */
  pricesLoading: boolean;
  onCreated: (order: QuoteOrderRef) => void;
}) {
  const { user } = useAuth();
  /*
   * Контрагент обов'язковий саме для ЗАМОВЛЕННЯ, і це вже не те саме, що
   * для цін: після 26.08.2026 прорахунок без контрагента рахується за
   * загальним прайсом (панель про це попереджає окремо). А замовленню
   * потрібен erp_uuid — без нього невідомо, кому воно виписане, і бекенд
   * відповість order_no_counter_agent.
   */
  const blocked = !doc.contragentId;
  /*
   * Вид оплати — без нього ERP не виписує рахунок за замовленням, тому
   * замовлення без нього не створюємо: рахунок довелось би дозаводити
   * руками, а зв'язок із прорахунком при цьому губиться.
   */
  const noPayment = !doc.paymentType;
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Перелік позицій у вікні підтвердження — згорнутий за замовчуванням:
  // у прорахунку їх буває пів десятка, і вікно перетворилось би на другу
  // таблицю. Стрілка розкриває саме те, що поїде в замовлення.
  const [linesOpen, setLinesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const order = doc.order;
  // Повторне створення — тільки після явного натискання «Створити ще
  // одне»: інакше кнопки після створення просто немає.
  /*
   * «Створити ще одне» — картка повертається до звичайного стану
   * створення: ні номера попереднього замовлення, ні попередження про
   * розбіжність суми. Попередній номер від цього не зникає — він їде в
   * orderHistory (див. QuotePanel), просто не мозолить очі, коли менеджер
   * уже вирішив виписувати нове.
   */
  const [again, setAgain] = useState(false);
  const empty = lines.length === 0;
  /*
   * Рядки, яких у замовленні не буде: без коду 1С позиція не існує в
   * номенклатурі, а Orders Service шукає кожну саме за нею. Такий рядок
   * на 0 ₴ просто не поїде (сума замовлення від нього не залежить), а з
   * грошима — взагалі не дасть створити замовлення, і бекенд назве його
   * поіменно. У вікні підтвердження це має бути видно ДО відправки.
   */
  const notSent = lines.filter((line) => !line.code);
  // Рядки є, а сума нульова — це не «порожній прорахунок», а «1С не дала
  // цін»: замовлення на нуль не створюємо, але й не вдаємо, що виробів немає.
  const zeroTotal = !empty && !(total > 0);
  const disabled = busy || blocked || noPayment || empty || zeroTotal || pricesLoading;

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const created: CreatedOrder = await api.createOrder({
        project,
        quote: doc,
        lines,
        items: orderItems(doc),
        total,
        organizationId: doc.contragentId,
        methodLabel: methodLabel(doc.method),
      });
      onCreated({
        externalId: created.externalOrderId,
        orderId: created.orderId,
        orderDetailsId: created.orderDetailsId,
        createdAt: new Date().toISOString(),
        createdBy: user?.email || user?.name || '',
        total,
      });
      setConfirmOpen(false);
      setAgain(false);
    } catch (cause) {
      setError(orderErrorText(cause));
    } finally {
      setBusy(false);
    }
  };

  // Замовлення вже створене: показуємо номер, а не кнопку. Виняток —
  // менеджер натиснув «Створити ще одне» (див. нижче).
  if (order && !again) {
    const changed = Math.abs(order.total - total) >= 0.01;
    return (
      <div className="bg-white rounded-lg shadow-sm border border-emerald-200 p-6 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-md flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-700 uppercase">Замовлення створене</h3>
            <p className="text-2xl font-bold text-slate-800 tabular-nums mt-1">
              {order.externalId || order.orderId}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {new Date(order.createdAt).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}
              {' · '}на суму {order.total.toFixed(2)} ₴
              {!order.externalId && ' · сервіс не повернув номер, це ідентифікатор документа'}
            </p>
          </div>
        </div>
        {changed && (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Прорахунок змінився після створення замовлення: зараз {total.toFixed(2)} ₴,
              а замовлення виписане на {order.total.toFixed(2)} ₴. Зміни в ERP не поїхали —
              правити замовлення треба там.
            </span>
          </div>
        )}
        {(doc.orderHistory?.length ?? 0) > 0 && (
          <p className="text-xs text-slate-400">
            Раніше з цього прорахунку: {doc.orderHistory?.map((entry) => entry.externalId || entry.orderId).join(', ')}
          </p>
        )}
        <button
          onClick={() => { setError(''); setAgain(true); }}
          className="self-start text-xs font-semibold text-slate-500 hover:text-[#0084ff] transition-colors underline underline-offset-2"
          title="Створити ОКРЕМЕ друге замовлення — попереднє при цьому не скасовується"
        >
          Створити ще одне замовлення
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-600/10 text-emerald-700 rounded-md flex items-center justify-center">
          <ShoppingCart className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-700 uppercase">Замовлення</h3>
          <p className="text-sm text-slate-500">
            {blocked ? 'Виберіть контрагента — без нього замовлення не створити'
              : noPayment ? 'Виберіть метод оплати — без нього в ERP не виписати рахунок'
              : empty ? 'Додайте вироби з розмірами — замовлення створюється з розрахунку'
              : pricesLoading ? 'Зачекайте, поки 1С дорахує ціни'
              : zeroTotal ? 'Розрахунок на 0 ₴ — 1С не дала цін, замовлення на нуль не створюємо'
              : 'Підтверджений прорахунок стає замовленням у Viyar (Orders Service)'}
          </p>
          {error && (
            <p className="flex items-center gap-1.5 text-sm text-red-600 mt-1">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={() => { setError(''); setConfirmOpen(true); }}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-bold hover:bg-emerald-700 transition-colors disabled:bg-slate-300 disabled:cursor-default"
        title="Створити замовлення в Orders Service за цим прорахунком"
      >
        <ClipboardCheck className="w-4 h-4" /> Підтвердити і створити замовлення
      </button>

      {confirmOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 font-sans" onClick={() => { if (!busy) setConfirmOpen(false); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-semibold text-gray-800">Створити замовлення</h2>
              </div>
              <button onClick={() => setConfirmOpen(false)} className="text-gray-500 hover:text-gray-700 p-1" disabled={busy}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <p className="text-sm text-slate-600">
                У Viyar поїде замовлення за цим прорахунком. Скасувати його з SlabCutPlanner
                неможливо — далі замовлення живе в ERP.
              </p>

              <div className="text-sm border border-slate-200 rounded-md divide-y divide-slate-100">
                {([
                  ['Контрагент', doc.contragent || '—'],
                  ['Контактна особа', [doc.contactName, doc.contactPhone].filter(Boolean).join(', ') || '—'],
                  ['Філія', doc.branch || '—'],
                  ['Спосіб', methodLabel(doc.method)],
                  ['Метод оплати', doc.paymentType ? quotePaymentLabel(doc.paymentType) : '—'],
                ] as const).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 px-3 py-2">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold text-slate-800 text-right">{value}</span>
                  </div>
                ))}

                {/* Позиції — під стрілкою: цифра каже «скільки», розкриття — «що саме» */}
                <button
                  type="button"
                  onClick={() => setLinesOpen((open) => !open)}
                  className="w-full flex justify-between items-center gap-4 px-3 py-2 hover:bg-slate-50 transition-colors"
                  title={linesOpen ? 'Згорнути позиції' : 'Показати позиції, які поїдуть у замовлення'}
                >
                  <span className="flex items-center gap-1 text-slate-500">
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${linesOpen ? 'rotate-90' : ''}`} />
                    Позицій у розрахунку
                  </span>
                  <span className="font-semibold text-slate-800">{lines.length}</span>
                </button>
                {linesOpen && (
                  <ul className="bg-slate-50/70 max-h-56 overflow-auto custom-scrollbar">
                    {lines.map((line) => (
                      <li key={line.id} className="flex items-baseline gap-2 px-3 py-1.5 text-xs border-b border-slate-100 last:border-0">
                        <span className="text-slate-600 flex-1 truncate" title={line.label}>{line.label}</span>
                        <span className="text-slate-400 whitespace-nowrap">{line.qty} {quoteUnitLabel(line.unit)}</span>
                        <span className={`tabular-nums w-24 text-right font-semibold ${line.source === 'none' ? 'text-amber-600' : 'text-slate-700'}`}>
                          {line.source === 'none' ? 'без ціни' : line.sum.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {notSent.length > 0 && (
                  <div className="flex justify-between gap-4 px-3 py-2" title={notSent.map((line) => line.label).join('; ')}>
                    <span className="text-slate-500">Не поїде в замовлення</span>
                    <span className="font-semibold text-amber-600 text-right">{notSent.length}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4 px-3 py-2">
                  <span className="text-slate-500">Сума</span>
                  <span className="font-semibold text-slate-800 text-right">{total.toFixed(2)} ₴</span>
                </div>
              </div>
              {error && (
                <p className="flex items-start gap-2 text-sm text-red-600">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                </p>
              )}
              <button
                onClick={() => void create()}
                disabled={busy}
                className="mt-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-md text-sm font-bold hover:bg-emerald-700 transition-colors disabled:bg-slate-300"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                {busy ? 'Створюю замовлення…' : 'Створити замовлення'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
