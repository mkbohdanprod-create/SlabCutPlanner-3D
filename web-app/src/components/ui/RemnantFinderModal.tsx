import { useEffect, useMemo, useState } from 'react';
import { X, PackageSearch, AlertTriangle, RefreshCw } from 'lucide-react';
import type { DetailPart, Project } from '../../domain/types';
import { polygonBounds } from '../../lib/project';
import { fetchWmsSheets, WmsError, type WmsSheet } from '../../lib/wmsStock';

/**
 * ПІДБІР ЗАЛИШКІВ ЗІ СКЛАДУ — модалка з панелі нерозміщених деталей.
 *
 * Заведено 26.08.2026. Ідея власника: там, де висять деталі, які не
 * влізли, має бути кнопка — подивитись, які залишки цього матеріалу
 * лежать на складі, і які з нерозміщених деталей у них влазять.
 * Замість «взяти ще один цілий лист 3200×1600 під деталь 1900×900» —
 * «ось обрізок 1900×900 у комірці B-18, сюди лягають деталі 3 і 7».
 *
 * Артикули беруться зі СЛЕБІВ проєкту (матеріал у проєкті один, а
 * артикулів може бути кілька — різні декори/товщини). За кожним
 * артикулом питаємо WMS, геометричну примірку робимо самі: чи влазить
 * габарит деталі з відступом у габарит листа, прямо або з поворотом.
 * Це ПРИМІРКА за прямокутником, а не повний розкрій — тому в підписі
 * чесно «попередньо»: остаточне слово за розкладкою, коли сляб
 * реально додано.
 *
 * WMS ще не віддає дані (ендпоінт у роботі). Стан «відповідь не
 * отримана» — окремий і гучний: він означає «складу не спитали», а не
 * «на складі порожньо». Плутати ці два повідомлення не можна — рівно
 * на цій плутанині ми обпеклись із цінами 25.08.
 */

interface ArticleQuery {
  article: string;
  decor: string;
  thickness: number;
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; sheets: WmsSheet[]; truncated: boolean; total: number }
  | { kind: 'unreachable'; message: string }
  | { kind: 'service'; message: string };

/** Габарит нерозміщеної деталі — з контуру, як у панелі нерозміщених */
function partSize(part: DetailPart) {
  const bounds = polygonBounds(part.points);
  return {
    width: Math.max(bounds.maxX - bounds.minX, 1),
    height: Math.max(bounds.maxY - bounds.minY, 1),
  };
}

/** Чи влазить деталь у лист із відступом — прямо або з поворотом на 90° */
function fitsSheet(part: DetailPart, sheet: WmsSheet, margin: number) {
  const size = partSize(part);
  const w = size.width + margin * 2;
  const h = size.height + margin * 2;
  return (w <= sheet.width && h <= sheet.height) || (h <= sheet.width && w <= sheet.height);
}

const STATE_LABEL: Record<WmsSheet['state'], string> = {
  remnant: 'залишок',
  whole: 'цілий лист',
};

export function RemnantFinderModal({ open, onClose, project, unplacedParts }: {
  open: boolean;
  onClose: () => void;
  project: Project;
  unplacedParts: DetailPart[];
}) {
  /**
   * Артикули — зі слебів проєкту. Матеріал замовника пропускаємо: він
   * не наш, на складі його немає. Дублікати злипаються: два сляби того
   * самого артикулу — один запит.
   */
  const queries = useMemo(() => {
    const byArticle = new Map<string, ArticleQuery>();
    project.slabs.forEach((slab) => {
      if (slab.customerOwn || !slab.article) return;
      if (!byArticle.has(slab.article)) {
        byArticle.set(slab.article, { article: slab.article, decor: slab.decor, thickness: slab.thickness });
      }
    });
    return [...byArticle.values()];
  }, [project.slabs]);

  const margin = project.referenceData?.serviceParams?.defaultMinMargin ?? 10;

  const [answers, setAnswers] = useState<Record<string, FetchState>>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !queries.length) { setAnswers({}); return; }
    const controller = new AbortController();
    setAnswers(Object.fromEntries(queries.map((q) => [q.article, { kind: 'loading' } as FetchState])));
    queries.forEach((query) => {
      fetchWmsSheets(query.article, controller.signal)
        .then((answer) => {
          if (controller.signal.aborted) return;
          setAnswers((current) => ({
            ...current,
            [query.article]: { kind: 'ready', sheets: answer.sheets, truncated: answer.truncated, total: answer.total },
          }));
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          const state: FetchState = cause instanceof WmsError
            ? { kind: cause.kind, message: cause.message }
            : { kind: 'unreachable', message: 'WMS недоступна' };
          setAnswers((current) => ({ ...current, [query.article]: state }));
        });
    });
    return () => controller.abort();
  }, [open, queries, attempt]);

  if (!open) return null;

  const anyLoading = queries.some((q) => answers[q.article]?.kind === 'loading');
  const allUnreachable = queries.length > 0
    && queries.every((q) => answers[q.article]?.kind === 'unreachable');

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onMouseDown={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* шапка */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageSearch className="w-5 h-5 text-[#0084ff]" />
            <h2 className="text-base font-bold text-slate-800">Залишки на складі</h2>
            <span className="text-xs text-slate-500">
              під {unplacedParts.length} нерозміщен{unplacedParts.length === 1 ? 'у деталь' : 'і деталі'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              disabled={anyLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 border border-slate-300 rounded text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${anyLoading ? 'animate-spin' : ''}`} /> Оновити
            </button>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5 flex flex-col gap-4">
          {/* Що шукаємо: нерозміщені деталі з габаритами. Менеджер бачить
              задачу тими самими числами, якими WMS відповість листами. */}
          {unplacedParts.length > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-2.5 text-[13px] text-slate-700">
              <b>Шукаємо місце під:</b>{' '}
              {unplacedParts.map((part) => {
                const size = partSize(part);
                return `${part.name} ${Math.round(size.width)}×${Math.round(size.height)}`;
              }).join(' · ')}
              <span className="text-slate-400"> — за артикулами слебів проєкту</span>
            </div>
          )}
          {/* Немає за чим питати: у проєкті немає слебів з артикулом */}
          {!queries.length && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              <b className="text-slate-800">Немає за чим питати склад.</b>
              <p className="mt-1.5 leading-snug">
                Залишки шукаються за артикулом слебів проєкту, а тут артикула немає —
                сляби ще не додані з каталогу, або це матеріал замовника чи натуралка
                зі своїми габаритами.
              </p>
            </div>
          )}

          {/* WMS мовчить — гучно і чесно. «Не спитали» ≠ «порожньо». */}
          {allUnreachable && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <b>Відповідь від WMS не отримана.</b> Знайдено залишків: <b>0</b> — але це
                  не «на складі порожньо», а «склад не відповів»: сервіс ще не
                  підключений або зараз недоступний.
                  <div className="mt-1 text-[12px] opacity-80">
                    Ендпоінт на боці WMS у роботі. Щойно з&apos;явиться — ця сама кнопка почне
                    показувати живі листи з комірками.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* по артикулах */}
          {queries.map((query) => {
            const state = answers[query.article] ?? { kind: 'loading' as const };
            return (
              <section key={query.article} className="rounded-lg border border-slate-200">
                <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-slate-400">{query.article}</span>
                  <span className="font-semibold text-slate-800">{query.decor || 'Без декору'}</span>
                  {query.thickness > 0 && <span className="text-slate-500">· {query.thickness} мм</span>}
                </div>
                <div className="p-4 text-sm">
                  {state.kind === 'loading' && <span className="text-slate-500">Питаю склад…</span>}
                  {state.kind === 'unreachable' && !allUnreachable && (
                    <span className="text-amber-700">{state.message}</span>
                  )}
                  {state.kind === 'service' && (
                    <span className="text-amber-700">{state.message}</span>
                  )}
                  {state.kind === 'ready' && state.sheets.length === 0 && (
                    <span className="text-slate-500">
                      Вільних листів цього артикулу на складі немає.
                    </span>
                  )}
                  {state.kind === 'ready' && state.sheets.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {state.truncated && (
                        <div className="text-[12px] text-amber-700">
                          Показано {state.sheets.length} з {state.total} — список обрізаний складом.
                        </div>
                      )}
                      {[...state.sheets]
                        /* Менший залишок першим: вичищаємо дрібне, цілі листи в кінці */
                        .sort((a, b) => (a.width * a.height) - (b.width * b.height))
                        .map((sheet) => {
                          const fitting = unplacedParts.filter((part) => fitsSheet(part, sheet, margin));
                          return (
                            <div key={sheet.sheet} className="flex gap-3 rounded border border-slate-200 p-2.5">
                              {sheet.photo
                                ? <img src={sheet.photo} alt={sheet.sheet} className="w-20 h-14 object-cover rounded shrink-0" />
                                : <div className="w-20 h-14 rounded bg-slate-100 shrink-0" />}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs text-slate-500">{sheet.sheet}</span>
                                  <b className="text-slate-800">{sheet.width}×{sheet.height}</b>
                                  <span className="text-slate-500">· {sheet.thickness} мм · {STATE_LABEL[sheet.state]}</span>
                                  {sheet.cell && (
                                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-px">
                                      комірка {sheet.cell}
                                    </span>
                                  )}
                                </div>
                                {(sheet.batch || sheet.tone) && (
                                  <div className="text-[12px] text-slate-500 mt-0.5">
                                    {sheet.batch && <>партія {sheet.batch}</>}
                                    {sheet.batch && sheet.tone && ' · '}
                                    {sheet.tone && <>тон {sheet.tone}</>}
                                    {' '}— звірити з листами проєкту
                                  </div>
                                )}
                                <div className="text-[12px] mt-1">
                                  {fitting.length
                                    ? <span className="text-emerald-700">
                                        Попередньо влазять: {fitting.map((part) => {
                                          const size = partSize(part);
                                          return `${part.name} ${Math.round(size.width)}×${Math.round(size.height)}`;
                                        }).join(', ')}
                                      </span>
                                    : <span className="text-slate-400">
                                        Жодна з нерозміщених деталей не влазить
                                      </span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          <p className="text-[11px] leading-snug text-slate-400">
            Примірка попередня — за прямокутним габаритом деталі з відступом {margin} мм.
            Остаточне слово за розкладкою: додай сляб із цим габаритом у проєкт, і розкрій
            перевірить по-справжньому. Резерв листа буде окремо — при створенні рахунку в ERP.
          </p>
        </div>
      </div>
    </div>
  );
}
