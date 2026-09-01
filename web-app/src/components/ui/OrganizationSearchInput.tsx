import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { api, ApiError, type CustomerContact, type CustomerOrganization } from '../../lib/api';

/**
 * Поле «Контрагент» з пошуком по довіднику Customers Service.
 *
 * Одне поле на два місця: попап шапки проєкту (номер замовлення +
 * контрагент) і вкладка «Прорахунок для клієнта», блок «ЗАМОВЛЕННЯ».
 * Обидва тримають свій текст самі — компонент лише шукає й повідомляє
 * про вибір, тому ручне введення (контрагента ще немає в довіднику)
 * працює як раніше.
 *
 * Навантаження на filter_query притримуємо з двох боків: коротший за
 * MIN_ORG_QUERY_LENGTH запит не летить узагалі, а решта чекає паузу в
 * наборі (ORG_SEARCH_DEBOUNCE_MS). Попередній запит скасовується
 * AbortController — інакше повільна відповідь на «сту» перезаписала б
 * свіжий список по «студія».
 *
 * Контактна особа й телефон приїжджають разом із вибором: спершу з самої
 * організації (якщо сервіс віддав їх вкладеними), інакше окремим запитом
 * по пов'язаних Customer. Правила «головного» контакту в довіднику немає —
 * беремо будь-який перший.
 */

/** Коротше — не шукаємо (той самий поріг стоїть і на бекенді) */
export const MIN_ORG_QUERY_LENGTH = 2;
/** Пауза після останньої літери перед запитом */
export const ORG_SEARCH_DEBOUNCE_MS = 350;

type Props = {
  value: string;
  /** Ручне введення тексту — довідник тут ні до чого */
  onChange: (value: string) => void;
  /** Вибір зі списку: організація + контактна особа (може не бути) */
  onPick: (organization: CustomerOrganization, contact: CustomerContact | null) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  id?: string;
};

type SearchState = 'idle' | 'loading' | 'ready' | 'error';

function searchErrorText(error: unknown): string {
  const status = error instanceof ApiError ? error.status : 0;
  // 403 — це про сервісний акаунт застосунку, а не про права менеджера,
  // тому не радимо йому «попросити доступ собі».
  if (status === 403) return 'Довідник контрагентів відмовив у доступі — потрібне налаштування прав сервісу';
  if (status === 401) return 'Сесія завершилась — увійдіть у застосунок повторно';
  if (status === 503) return 'Довідник контрагентів не підключено';
  return 'Довідник недоступний — введіть контрагента вручну';
}

export function OrganizationSearchInput({
  value,
  onChange,
  onPick,
  className,
  inputClassName,
  placeholder = 'Почніть вводити назву',
  id,
}: Props) {
  const [items, setItems] = useState<CustomerOrganization[]>([]);
  const [state, setState] = useState<SearchState>('idle');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [contactBusy, setContactBusy] = useState(false);
  // Перший рендер і повернення з вибору не мають вважатись набором тексту
  const skipSearchRef = useRef(true);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    const query = value.trim();
    // Закоротко — нічого не робимо: список гасить обробник вводу
    if (query.length < MIN_ORG_QUERY_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState('loading');
      setOpen(true);
      api
        .searchOrganizations(query, controller.signal)
        .then((found) => {
          if (controller.signal.aborted) return;
          setItems(found);
          setActiveIndex(found.length ? 0 : -1);
          setState('ready');
          setError('');
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setItems([]);
          setState('error');
          setError(searchErrorText(err));
        });
    }, ORG_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  // Клік повз поле закриває випадачку, але не чіпає введений текст
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const changeText = (next: string) => {
    onChange(next);
    if (next.trim().length < MIN_ORG_QUERY_LENGTH) {
      setItems([]);
      setState('idle');
      setError('');
      setOpen(false);
    }
  };

  const pick = async (organization: CustomerOrganization) => {
    skipSearchRef.current = true;
    setOpen(false);
    setItems([]);
    setState('idle');
    onChange(organization.title);

    let contact = organization.contact ?? null;
    if (!contact && organization.id) {
      setContactBusy(true);
      try {
        const contacts = await api.organizationContacts(organization.id);
        contact = contacts[0] ?? null;
      } catch {
        // Контакт не критичний: контрагента вже обрано, поля лишаться порожні
        contact = null;
      } finally {
        setContactBusy(false);
      }
    }
    onPick(organization, contact);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || !items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      const organization = items[activeIndex];
      if (organization) {
        event.preventDefault();
        void pick(organization);
      }
    }
  };

  const showPanel = open
    && value.trim().length >= MIN_ORG_QUERY_LENGTH
    && (state === 'loading' || state === 'error' || state === 'ready' || items.length > 0);

  return (
    <div ref={boxRef} className={`relative ${className ?? ''}`}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        className={inputClassName}
        onChange={(event) => changeText(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (items.length) setOpen(true); }}
      />
      {(state === 'loading' || contactBusy) && (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      )}

      {showPanel && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[60] bg-white border border-slate-200 rounded-md shadow-lg max-h-64 overflow-auto">
          {state === 'loading' && (
            <div className="px-3 py-2 text-xs text-slate-500 flex items-center gap-2">
              <Search className="w-3.5 h-3.5" />
              Шукаємо в довіднику…
            </div>
          )}
          {state === 'error' && <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50">{error}</div>}
          {state === 'ready' && !items.length && (
            <div className="px-3 py-2 text-xs text-slate-500">Нічого не знайдено — можна ввести вручну</div>
          )}
          {items.length > 0 && (
            <ul role="listbox" className="py-1">
              {items.map((organization, index) => (
                <li key={organization.id || `${organization.title}_${index}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void pick(organization)}
                    className={`w-full text-left px-3 py-1.5 text-sm !border-none shadow-none !text-slate-700 transition-colors ${
                      index === activeIndex ? '!bg-slate-100' : '!bg-transparent'
                    }`}
                  >
                    <span className="block truncate">{organization.title || '—'}</span>
                    {(organization.edrpou || organization.code || organization.contact?.name) && (
                      <span className="block truncate text-[11px] text-slate-400">
                        {[organization.edrpou, organization.code, organization.contact?.name].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
