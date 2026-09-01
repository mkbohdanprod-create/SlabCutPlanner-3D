import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ApiError, type Branch } from '../../lib/api';
import { loadBranchesOnce } from './branchesCache';

/**
 * Поле «Філія» — випадачка зі списку Locations Service з локальним пошуком.
 *
 * На відміну від «Контрагента» (OrganizationSearchInput) довідник тут
 * маленький — десятки записів, і сервер віддає його ЦІЛКОМ одним запитом
 * (server/src/locations.js). Тому жодного дебаунсу й мережі на кожну
 * літеру: список забирається один раз на весь застосунок (кеш у модулі,
 * без стору — дані статичні на сесію) і фільтрується вже в браузері.
 *
 * Ручне введення лишається робочим сценарієм: філії, якої ще нема в
 * довіднику (нова, у процесі відкриття), можна вписати текстом.
 */

type Props = {
  value: string;
  /** Ручне введення тексту */
  onChange: (value: string) => void;
  /** Вибір зі списку */
  onPick: (branch: Branch) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  id?: string;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'off';

function loadErrorText(error: unknown): { text: string; state: LoadState } {
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 403) return { text: 'Довідник філій відмовив у доступі — потрібне налаштування прав сервісу', state: 'error' };
  if (status === 401) return { text: 'Сесія завершилась — увійдіть у застосунок повторно', state: 'error' };
  if (status === 503 || status === 404) return { text: 'Довідник філій не підключено — введіть назву вручну', state: 'off' };
  return { text: 'Довідник філій недоступний — введіть назву вручну', state: 'error' };
}

export function BranchSelect({ value, onChange, onPick, className, inputClassName, placeholder = 'Виберіть або впишіть філію', id }: Props) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadBranchesOnce()
      .then((items) => {
        if (cancelled) return;
        setBranches(items);
        setState('ready');
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const { text, state: next } = loadErrorText(cause);
        setError(text);
        setState(next);
      });
    return () => { cancelled = true; };
  }, []);

  // Клік повз поле закриває випадачку, але не чіпає введений текст
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    const list = !query ? branches : branches.filter((branch) =>
      branch.title.toLowerCase().includes(query) || branch.code?.toLowerCase().includes(query));
    return list.slice(0, 50);
  }, [branches, value]);

  const pick = (branch: Branch) => {
    setOpen(false);
    onChange(branch.title);
    onPick(branch);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (!open || !filtered.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % filtered.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length);
    } else if (event.key === 'Enter') {
      const branch = filtered[activeIndex];
      if (branch) { event.preventDefault(); pick(branch); }
    }
  };

  const showPanel = open && (state === 'loading' || state === 'error' || state === 'off' || filtered.length > 0);

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
        onChange={(event) => { onChange(event.target.value); setActiveIndex(0); setOpen(true); }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
      />
      {state === 'loading' && (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      )}

      {showPanel && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[60] bg-white border border-slate-200 rounded-md shadow-lg max-h-64 overflow-auto">
          {state === 'loading' && <div className="px-3 py-2 text-xs text-slate-500">Завантажую філії…</div>}
          {(state === 'error' || state === 'off') && <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50">{error}</div>}
          {state === 'ready' && !filtered.length && (
            <div className="px-3 py-2 text-xs text-slate-500">Нічого не знайдено — можна ввести вручну</div>
          )}
          {filtered.length > 0 && (
            <ul role="listbox" className="py-1">
              {filtered.map((branch, index) => (
                <li key={branch.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(branch)}
                    className={`w-full text-left px-3 py-1.5 text-sm !border-none shadow-none !text-slate-700 transition-colors ${
                      index === activeIndex ? '!bg-slate-100' : '!bg-transparent'
                    }`}
                  >
                    <span className="block truncate">{branch.title}</span>
                    {branch.code && <span className="block truncate text-[11px] text-slate-400">{branch.code}</span>}
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
