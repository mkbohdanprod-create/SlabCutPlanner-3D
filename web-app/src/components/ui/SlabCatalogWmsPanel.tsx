import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, AlertTriangle, Warehouse } from 'lucide-react';
import type { MaterialType } from '../../domain/types';
import { fetchWmsSheets, WmsError, type WmsSheet } from '../../lib/wmsStock';
import type { SlabPick } from './SlabCatalogModal';

/**
 * ДЖЕРЕЛО «WMS» У ВІКНІ ВИБОРУ СЛЯБА (01.09.2026, власник: «ТЕСТ прибирай
 * повністю, а WMS лиши як переключалку»).
 *
 * Довідник номенклатур (джерело «ІТ») знає ДЕКОРИ й артикули; склад
 * Stone WMS знає КОНКРЕТНІ ЛИСТИ — габарит, товщину, комірку, партію,
 * тон. Менеджеру часом треба саме лист: залишок 1900×900 у комірці B-18,
 * а не «декор 3200×1600 за каталогом». Тому в модалці два джерела, і
 * перемикач у шапці.
 *
 * Пошук — за артикулом (кодом 1С), як і в підборі залишків
 * (RemnantFinderModal): той самий клієнт lib/wmsStock, той самий контракт
 * /api/v1/stock?code=…&status=free. Ендпоінт на боці WMS ще в роботі —
 * поки його немає, стан «відповідь не отримана» кажемо прямо, а не
 * показуємо порожній склад: «складу не спитали» ≠ «на складі порожньо».
 *
 * Обраний лист стає слябом проєкту з ТОЧНИМ габаритом листа (не з
 * каталожним), артикул — код запиту, фото — знімок листа з WMS, якщо є.
 */

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; sheets: WmsSheet[]; truncated: boolean; total: number }
  | { kind: 'unreachable'; message: string }
  | { kind: 'service'; message: string };

const STATE_LABEL: Record<WmsSheet['state'], string> = { remnant: 'залишок', whole: 'цілий лист' };

export function SlabCatalogWmsPanel({ material, manufacturer, onPick, onClose }: {
  /** Матеріал і виробник з фільтрів модалки — WMS їх не віддає, беремо з контексту проєкту */
  material: MaterialType;
  manufacturer: string;
  onPick: (pick: SlabPick) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [state, setState] = useState<FetchState>({ kind: 'idle' });
  const inflight = useRef<AbortController | null>(null);
  // Розмонтування — скасувати запит, що ще летить
  useEffect(() => () => inflight.current?.abort(), []);

  /* Пошук — по кнопці або Enter, а не на кожну літеру: склад питають
     свідомо, за конкретним артикулом. */
  const search = () => {
    const trimmed = code.trim();
    if (trimmed.length < 3) { setState({ kind: 'idle' }); return; }
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setState({ kind: 'loading' });
    fetchWmsSheets(trimmed, controller.signal)
      .then((answer) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'ready', sheets: answer.sheets, truncated: answer.truncated, total: answer.total });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setState(cause instanceof WmsError
          ? { kind: cause.kind, message: cause.message }
          : { kind: 'unreachable', message: 'WMS недоступна' });
      });
  };

  const pickSheet = (sheet: WmsSheet) => {
    onPick({
      article: code.trim(),
      name: `Лист ${sheet.sheet}`,
      material,
      manufacturer,
      decor: '',
      width: sheet.width,
      height: sheet.height,
      thickness: sheet.thickness,
      finish: '',
      photo: sheet.photo ?? '',
      // фото конкретного листа WMS ще не дала — менеджер додасть своє
      needsManualPhoto: !sheet.photo,
      quantity: 1,
    });
  };

  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-[260px] shrink-0 p-4 overflow-auto border-r border-slate-200">
        <div className="mb-3 rounded-md border border-slate-300 bg-slate-100 p-2.5 text-[11px] leading-snug text-slate-600">
          <b className="text-slate-800">Склад Stone WMS.</b> Конкретні листи з
          габаритом, товщиною і коміркою. Пошук за артикулом (кодом 1С) —
          тим самим, що в довіднику.
        </div>
        <label className="block text-xs text-slate-600 mb-1">Артикул (код 1С)</label>
        <div className="relative mb-2">
          <Search className="w-4 h-4 absolute left-2 top-2 text-slate-400" />
          <input className="w-full border border-slate-300 rounded pl-8 pr-2 py-1.5 text-sm"
            value={code} onChange={(e) => setCode(e.target.value)} placeholder="Наприклад 116034" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
        </div>
        <button type="button" onClick={search} disabled={code.trim().length < 3}
          className="primary-action w-full mb-3 rounded py-1.5 text-sm font-semibold">
          Знайти на складі
        </button>
        <div className="text-[11px] text-slate-500 mb-4">
          Матеріал: <b>{material}</b>{manufacturer ? <> · {manufacturer}</> : null}
          <br />— з фільтрів проєкту, WMS матеріал не віддає.
        </div>
        <button type="button" onClick={onClose}
          className="w-full border border-slate-300 rounded py-1.5 text-sm text-slate-600 bg-white hover:bg-slate-50">
          Скасувати
        </button>
      </aside>

      <div className="flex-1 overflow-auto p-4">
        {state.kind === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm gap-2">
            <Warehouse className="w-8 h-8" />
            Введіть артикул і натисніть «Знайти на складі» — покажу вільні листи цього коду.
          </div>
        )}
        {state.kind === 'loading' && (
          <div className="flex items-center gap-2 text-[13px] text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Питаю склад…
          </div>
        )}
        {state.kind === 'unreachable' && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <b>Відповідь від WMS не отримана.</b> {state.message}. Ендпоінт
              складу (<code>/api/v1/stock</code>) ще не підключений — це не
              «на складі порожньо», а «склад не спитали».
            </div>
          </div>
        )}
        {state.kind === 'service' && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2.5 text-[13px] text-red-900">
            <b>WMS відповіла помилкою:</b> {state.message}
          </div>
        )}
        {state.kind === 'ready' && state.sheets.length === 0 && (
          <p className="text-sm text-slate-500 mt-8 text-center">
            Вільних листів за артикулом <b>{code.trim()}</b> на складі немає.
          </p>
        )}
        {state.kind === 'ready' && state.sheets.length > 0 && (
          <>
            <p className="text-[11px] text-slate-500 mb-3">
              Вільних листів: {state.sheets.length}{state.truncated ? ` із ${state.total} — уточніть запит` : ''}. Клік по листу — додати його слябом з точним габаритом.
            </p>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
              {state.sheets.map((sheet) => (
                <button type="button" key={sheet.sheet} onClick={() => pickSheet(sheet)}
                  className="text-left rounded-md border border-slate-200 bg-white hover:shadow-md transition-shadow overflow-hidden">
                  <div className="flex items-center justify-center text-[11px] text-slate-400"
                    style={{ height: 110, background: sheet.photo ? `url(${sheet.photo}) center/cover` : '#eef2f7' }}>
                    {!sheet.photo && 'Фото листа немає'}
                  </div>
                  <div className="px-2 py-1.5 text-[12px] text-slate-800 leading-snug">
                    <div className="font-bold">{sheet.sheet}</div>
                    <div>{sheet.width} × {sheet.height} × {sheet.thickness} мм · {STATE_LABEL[sheet.state]}</div>
                    <div className="text-[11px] text-slate-500">
                      комірка {sheet.cell || '—'}{sheet.batch ? ` · партія ${sheet.batch}` : ''}{sheet.tone ? ` · тон ${sheet.tone}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
