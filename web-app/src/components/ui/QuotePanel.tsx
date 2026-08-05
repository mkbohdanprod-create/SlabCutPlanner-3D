import { Suspense, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, Plus, Trash2, AlertTriangle, Download, RefreshCw, FileDown, Loader2, Settings, X } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useStore';
import { getAllProjectDetails } from '../../store/projectHelpers';
import { exportQuotePdf, DEFAULT_QUOTE_PDF_OPTIONS, type QuotePdfOptions } from '../../utils/export/quotePdf';
import { QuoteSettingsModal } from './QuoteSettingsModal';
import { Viewer3D } from '../3d/Viewer3DLazy';
import {
  autoQuoteServices,
  mergeQuoteServices,
  computeQuoteCalc,
  itemAreaM2,
  itemLengthM,
  quoteItemsFromProject,
  suggestPyramidLength,
  quoteUnitLabel,
  QUOTE_GROUP_LABELS,
  type QuoteCalcLine,
} from '../../engines/quoteCalc';
import {
  ACRYLIC_SURFACE_TYPES,
  DEFAULT_MANUFACTURERS,
  DELIVERY_ZONES,
  PYRAMID_LENGTHS,
  QUOTE_JOINT_ORIENTATIONS,
  QUOTE_MATERIAL_TYPES,
  QUOTE_METHODS,
  QUOTE_PRODUCT_TYPES,
  QUOTE_SERVICES,
  QUOTE_SHAPES,
  createQuoteCalcDoc,
  quoteProductType,
  type QuoteCalcDoc,
  type QuoteItem,
} from '../../domain/quoteCalc';

/**
 * Прорахунок для клієнта.
 *
 * Окремий документ зі своєю математикою (див. engines/quoteCalc.ts):
 * вартість від площі виробів за номенклатурами, а не від порізки й
 * кромок. Зберігається в проєкті (project.quoteCalc), тому їде разом
 * зі збереженням і синхронізується між вікнами.
 *
 * Ціни: прайс за замовчуванням порожній — менеджер вписує ціну прямо
 * в рядок розрахунку (зберігається в документі як priceOverrides).
 * Редактор прайсу для старших менеджерів — наступний крок.
 */

const inputCls = 'border border-slate-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#0084ff]';

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500" style={style}>
      {label}
      {children}
    </label>
  );
}

const num = (value: string) => {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

let itemSeq = 0;

export function QuotePanel() {
  const project = useProjectStore((s) => s.project);
  const parts = useProjectStore((s) => s.parts);
  const updateProject = useProjectStore((s) => s.updateProject);
  const priceBook = useSettingsStore((s) => s.quotePriceBook);
  const isAdminUnlocked = useUIStore((s) => s.isAdminUnlocked);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const doc: QuoteCalcDoc = useMemo(
    () => ({ ...createQuoteCalcDoc(), ...(project.quoteCalc ?? {}) }),
    [project.quoteCalc],
  );

  const patch = (partial: Partial<QuoteCalcDoc>) => updateProject({ quoteCalc: { ...doc, ...partial } });
  const patchItem = (id: string, partial: Partial<QuoteItem>) => patch({
    items: doc.items.map((item) => (item.id === id ? { ...item, ...partial } : item)),
  });

  const addItem = () => {
    itemSeq += 1;
    const productTypeId = doc.method === 'sink_only' ? 'sink' : 'countertop_plain';
    patch({
      items: [...doc.items, {
        id: `qi_${Date.now()}_${itemSeq}`,
        productTypeId,
        count: 1,
        shape: 'Пряма',
        dims: {},
      }],
    });
  };

  /**
   * Вироби вже намальовані в проєкті — не вводимо їх двічі. Підтягнуті
   * позиції (sourceRef) заміняються свіжими, введені вручну лишаються.
   */
  const importFromProject = () => {
    const imported = quoteItemsFromProject(getAllProjectDetails(project), parts, project.projectThickness);
    patch({ items: [...imported, ...doc.items.filter((item) => !item.sourceRef)] });
  };

  // Кількості, які виробнича логіка знає сама (стикування ноги, стики
  // в площині, підбір текстури). Ручне значення в документі перемагає
  // авто; порожнє поле повертає авто.
  const autoServices = useMemo(
    () => autoQuoteServices(project, getAllProjectDetails(project)),
    [project],
  );
  const effectiveDoc = useMemo(
    () => ({ ...doc, services: mergeQuoteServices(autoServices, doc.services) }),
    [doc, autoServices],
  );

  const result = useMemo(() => computeQuoteCalc(effectiveDoc, priceBook), [effectiveDoc, priceBook]);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Діалог складу PDF: що включати в документ. Знімки 3D робить прихований
  // в'ювер у режимі showcase (білий фон, 3 ракурси) — той самий механізм,
  // що й у PDF розкрою.
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfOptions, setPdfOptions] = useState({
    includeCalc: true,
    includeViz: true,
    includeDetailsList: false,
    includeDrawings: false,
  });
  const [capturing3d, setCapturing3d] = useState(false);

  const runPdfExport = async (snapshots: string[]) => {
    setCapturing3d(false);
    setPdfBusy(true);
    try {
      const options: QuotePdfOptions = {
        ...DEFAULT_QUOTE_PDF_OPTIONS,
        includeCalc: pdfOptions.includeCalc,
        includeDetailsList: pdfOptions.includeDetailsList,
        includeDrawings: pdfOptions.includeDrawings,
        snapshots,
      };
      await exportQuotePdf(project, effectiveDoc, result, options, parts, getAllProjectDetails(project));
      setPdfDialogOpen(false);
    } finally {
      setPdfBusy(false);
    }
  };

  const handleExportPdf = () => {
    if (pdfOptions.includeViz) setCapturing3d(true);
    else void runPdfExport([]);
  };

  const isMeasure = doc.method === 'measure_install';
  const isSinkOnly = doc.method === 'sink_only';
  const isAcrylic = doc.materialType === 'Акриловий камінь';
  const manufacturers = DEFAULT_MANUFACTURERS[doc.materialType] ?? [];
  const availableTypes = QUOTE_PRODUCT_TYPES.filter((type) => (isSinkOnly ? type.sinkFlow : true));

  const setOverride = (lineId: string, raw: string) => {
    const next = { ...doc.priceOverrides };
    if (raw.trim() === '') delete next[lineId];
    else next[lineId] = num(raw);
    patch({ priceOverrides: next });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ doc, result }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prorakhunok_${project.orderNumber || 'zamovlennya'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const grouped = useMemo(() => {
    const map = new Map<QuoteCalcLine['group'], QuoteCalcLine[]>();
    result.lines.forEach((line) => map.set(line.group, [...(map.get(line.group) ?? []), line]));
    return map;
  }, [result]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 p-6 overflow-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-4">

        {/* Заголовок */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0084ff]/10 text-[#0084ff] rounded-md flex items-center justify-center">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Прорахунок для клієнта</h2>
              <p className="text-sm text-slate-500">Спрощений розрахунок замовлення · окремо від виробничого BOM</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPdfDialogOpen(true)}
              disabled={result.lines.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-[#0084ff] text-white rounded-md text-sm font-bold hover:bg-[#006bce] transition-colors disabled:bg-slate-300 disabled:cursor-default"
              title="Фірмовий PDF прорахунку для клієнта — з вибором складу документа"
            >
              <FileDown className="w-4 h-4" /> PDF для клієнта
            </button>
            <button onClick={exportJson} className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-300 rounded-md text-sm font-bold hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4" /> JSON
            </button>
            {/* Прайс і коди 1С — адмінське меню: видиме після входу
                супер-адміна (кнопка з щитом у шапці, PIN-код) */}
            {isAdminUnlocked && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center justify-center w-10 h-10 bg-white text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 hover:text-[#0084ff] transition-colors"
                title="Налаштування прорахунку: прайс і коди 1С (для старших менеджерів)"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Замовлення */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-slate-700 uppercase">Замовлення</h3>

          <div className="flex gap-2 flex-wrap">
            {QUOTE_METHODS.map((method) => (
              <button
                key={method.id}
                onClick={() => patch({ method: method.id })}
                className={`px-4 py-2 rounded-md text-sm font-semibold border transition-colors ${
                  doc.method === method.id
                    ? 'bg-[#0084ff] text-white border-[#0084ff]'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {method.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Філія">
              <input className={inputCls} value={doc.branch} onChange={(e) => patch({ branch: e.target.value })} placeholder="Філія менеджера" />
            </Field>
            <Field label="Контрагент">
              <input className={inputCls} value={doc.contragent} onChange={(e) => patch({ contragent: e.target.value })} placeholder="З довідника" />
            </Field>
            <Field label="Контактна особа">
              <input className={inputCls} value={doc.contactName} onChange={(e) => patch({ contactName: e.target.value })} placeholder="Ім'я" />
            </Field>
            <Field label="Телефон">
              <input className={inputCls} value={doc.contactPhone} onChange={(e) => patch({ contactPhone: e.target.value })} placeholder="+380…" />
            </Field>
          </div>

          {isMeasure && (
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field label="Адреса (замір і монтаж)">
                <input className={inputCls} value={doc.address} onChange={(e) => patch({ address: e.target.value })} placeholder="Місто, вулиця, будинок" />
              </Field>
              <Field label="Зона виїзду">
                <select className={inputCls} value={doc.deliveryZone} onChange={(e) => patch({ deliveryZone: Number(e.target.value) })} style={{ width: 170 }}>
                  {DELIVERY_ZONES.map((zone) => (
                    <option key={zone} value={zone}>{zone === 0 ? 'Біля філії (без доплати)' : `Зона ${zone}`}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Тип матеріалу">
              <select className={inputCls} value={doc.materialType} onChange={(e) => patch({ materialType: e.target.value as QuoteCalcDoc['materialType'], manufacturer: '' })}>
                {QUOTE_MATERIAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Виробник">
              <>
                <input className={inputCls} list="quote-manufacturers" value={doc.manufacturer} onChange={(e) => patch({ manufacturer: e.target.value })} placeholder="Оберіть чи впишіть" />
                <datalist id="quote-manufacturers">
                  {manufacturers.map((name) => <option key={name} value={name} />)}
                </datalist>
              </>
            </Field>
            <Field label="Декор (код із сайту)">
              <input className={inputCls} value={doc.decorCode} onChange={(e) => patch({ decorCode: e.target.value })} placeholder="Код декору" />
            </Field>
            {isAcrylic && !isSinkOnly && (
              <Field label="Тип поверхні (акрил)">
                <select className={inputCls} value={doc.surfaceType} onChange={(e) => patch({ surfaceType: e.target.value })}>
                  <option value="">— не вибрано —</option>
                  {ACRYLIC_SURFACE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
            )}
          </div>

          <Field label="Коментар">
            <textarea className={`${inputCls} resize-y`} rows={2} value={doc.comment} onChange={(e) => patch({ comment: e.target.value })} placeholder="Вільне поле" />
          </Field>
        </div>

        {/* Вироби */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-700 uppercase">Вироби</h3>
            <div className="flex gap-2">
              {!isSinkOnly && (
                <button
                  onClick={importFromProject}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0084ff] text-white rounded-md text-sm font-bold hover:bg-[#006bce] transition-colors"
                  title="Підтягнути намальовані вироби з фактичними площами з розкрою"
                >
                  <RefreshCw className="w-4 h-4" /> Підтягнути з розкрою
                </button>
              )}
              <button onClick={addItem} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm font-bold hover:bg-emerald-700 transition-colors">
                <Plus className="w-4 h-4" /> Додати виріб
              </button>
            </div>
          </div>

          {doc.items.length === 0 && (
            <p className="text-sm text-slate-500 py-2">
              Виробів ще немає. «Підтягнути з розкрою» забере намальовані вироби з фактичними площами,
              «Додати виріб» — для позицій без креслення.
            </p>
          )}

          {doc.items.map((item) => {
            const type = quoteProductType(item.productTypeId);
            const unit = type?.unit ?? 'pcs';
            const isArea = unit === 'm2';
            const isLength = unit === 'mp';
            const isPieces = unit === 'pcs';
            const isLShaped = item.shape === 'Г-подібна' || item.shape === 'П-подібна';
            const computed = isArea ? `${itemAreaM2(item).toFixed(3)} м²`
              : isLength ? `${itemLengthM(item).toFixed(2)} м.п.`
              : `${Math.max(1, item.count)} шт`;
            // Нога окремої номенклатури не має — її площа вливається у
            // стільницю (Логіка §3). Показуємо це прямо біля цифри.
            const foldsAway = Boolean(type?.foldInto?.length);
            const imported = Boolean(item.sourceRef);
            return (
              <div key={item.id} className="border border-slate-200 rounded-md p-3 flex flex-col gap-3 bg-slate-50/50">
                {imported && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-[#0084ff]/10 text-[#0084ff] font-bold">з розкрою</span>
                    <span className="text-slate-600 font-semibold">{item.sourceLabel}</span>
                    <span className="text-slate-400">· фактична площа, оновлюється кнопкою «Підтягнути з розкрою»</span>
                  </div>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Тип виробу" style={{ minWidth: 210 }}>
                    <select className={inputCls} value={item.productTypeId} onChange={(e) => patchItem(item.id, { productTypeId: e.target.value })}>
                      <optgroup label="Основні">
                        {availableTypes.filter((entry) => entry.kind === 'main').map((entry) => (
                          <option key={entry.id} value={entry.id}>{entry.label}</option>
                        ))}
                      </optgroup>
                      {!isSinkOnly && (
                        <optgroup label="Додаткові">
                          {availableTypes.filter((entry) => entry.kind === 'additional').map((entry) => (
                            <option key={entry.id} value={entry.id}>{entry.label}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </Field>
                  <Field label="К-сть" style={{ width: 70 }}>
                    <input className={inputCls} type="number" min={1} value={item.count} onChange={(e) => patchItem(item.id, { count: Math.max(1, Math.round(num(e.target.value))) })} />
                  </Field>
                  {isArea && (
                    <Field label="Форма" style={{ width: 130 }}>
                      <select className={inputCls} value={item.shape} onChange={(e) => patchItem(item.id, { shape: e.target.value as QuoteItem['shape'] })}>
                        {QUOTE_SHAPES.map((shape) => <option key={shape} value={shape}>{shape}</option>)}
                      </select>
                    </Field>
                  )}
                  <Field label="Товщина, мм" style={{ width: 100 }}>
                    <input className={inputCls} type="number" value={item.thicknessMm ?? ''} onChange={(e) => patchItem(item.id, { thicknessMm: num(e.target.value) || undefined })} placeholder="20" />
                  </Field>
                  {isPieces && (
                    <Field label="Модель" style={{ minWidth: 140 }}>
                      <input className={inputCls} value={item.model ?? ''} onChange={(e) => patchItem(item.id, { model: e.target.value })} placeholder="Модель мийки" />
                    </Field>
                  )}
                  <div className="ml-auto flex items-end gap-3">
                    <span className="text-sm font-bold text-slate-700 pb-1.5 text-right" title={foldsAway ? 'Нога тарифікується площею в номенклатурі стільниці — окремого рядка не буде' : 'Розрахована кількість'}>
                      {computed}
                      {foldsAway && <span className="block text-xs font-normal text-slate-400">→ у площу стільниці</span>}
                    </span>
                    <button onClick={() => patch({ items: doc.items.filter((other) => other.id !== item.id) })} className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Видалити виріб">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  {isArea && !imported && (
                    <>
                      <Field label="Плече 1: довжина × ширина, мм">
                        <div className="flex gap-1 items-center">
                          <input className={inputCls} style={{ width: 90 }} type="number" value={item.dims.w ?? ''} onChange={(e) => patchItem(item.id, { dims: { ...item.dims, w: num(e.target.value) } })} placeholder="2000" />
                          <span className="text-slate-400">×</span>
                          <input className={inputCls} style={{ width: 90 }} type="number" value={item.dims.h ?? ''} onChange={(e) => patchItem(item.id, { dims: { ...item.dims, h: num(e.target.value) } })} placeholder="600" />
                        </div>
                      </Field>
                      {isLShaped && (
                        <Field label="Плече 2, мм">
                          <div className="flex gap-1 items-center">
                            <input className={inputCls} style={{ width: 90 }} type="number" value={item.dims.w2 ?? ''} onChange={(e) => patchItem(item.id, { dims: { ...item.dims, w2: num(e.target.value) } })} />
                            <span className="text-slate-400">×</span>
                            <input className={inputCls} style={{ width: 90 }} type="number" value={item.dims.h2 ?? ''} onChange={(e) => patchItem(item.id, { dims: { ...item.dims, h2: num(e.target.value) } })} />
                          </div>
                        </Field>
                      )}
                      {item.shape === 'П-подібна' && (
                        <Field label="Плече 3, мм">
                          <div className="flex gap-1 items-center">
                            <input className={inputCls} style={{ width: 90 }} type="number" value={item.dims.w3 ?? ''} onChange={(e) => patchItem(item.id, { dims: { ...item.dims, w3: num(e.target.value) } })} />
                            <span className="text-slate-400">×</span>
                            <input className={inputCls} style={{ width: 90 }} type="number" value={item.dims.h3 ?? ''} onChange={(e) => patchItem(item.id, { dims: { ...item.dims, h3: num(e.target.value) } })} />
                          </div>
                        </Field>
                      )}
                      {isLShaped && (
                        <Field label="Стик плечей" style={{ width: 150 }}>
                          <select className={inputCls} value={item.jointOrientation ?? ''} onChange={(e) => patchItem(item.id, { jointOrientation: e.target.value || undefined })}>
                            <option value="">— не вказано —</option>
                            {QUOTE_JOINT_ORIENTATIONS.map((orientation) => <option key={orientation} value={orientation}>{orientation}</option>)}
                          </select>
                        </Field>
                      )}
                    </>
                  )}
                  {isLength && !imported && (
                    <Field label="Довжина, мм" style={{ width: 120 }}>
                      <input className={inputCls} type="number" value={item.dims.l ?? ''} onChange={(e) => patchItem(item.id, { dims: { ...item.dims, l: num(e.target.value) } })} placeholder="1500" />
                    </Field>
                  )}
                  {isPieces && !imported && (
                    <Field label="Габарити, мм (на розкрій)">
                      <div className="flex gap-1 items-center">
                        <input className={inputCls} style={{ width: 90 }} type="number" value={item.dims.w ?? ''} onChange={(e) => patchItem(item.id, { dims: { ...item.dims, w: num(e.target.value) } })} />
                        <span className="text-slate-400">×</span>
                        <input className={inputCls} style={{ width: 90 }} type="number" value={item.dims.h ?? ''} onChange={(e) => patchItem(item.id, { dims: { ...item.dims, h: num(e.target.value) } })} />
                      </div>
                    </Field>
                  )}
                  <Field label="Обробки (торці, зрізи, вирізи) — для креслень, на ціну не впливає" style={{ flex: 1, minWidth: 240 }}>
                    <input className={inputCls} value={item.processingNote ?? ''} onChange={(e) => patchItem(item.id, { processingNote: e.target.value })} placeholder="Фаска по фронту, виріз під мийку…" />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>

        {/* Додаткові послуги */}
        {!isSinkOnly && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex flex-col gap-3">
            <h3 className="text-sm font-bold text-slate-700 uppercase">Додаткові послуги</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
              {QUOTE_SERVICES.map((service) => {
                // Ручне значення рахується лише коли воно > 0: збережений
                // нуль — це слід від порожнього поля, а не рішення
                const isAuto = !(doc.services[service.id] > 0) && (autoServices[service.id] ?? 0) > 0;
                return (
                  <div key={service.id} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-sm text-slate-700">
                      {service.label}
                      {isAuto && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#0084ff]/10 text-[#0084ff] text-[10px] font-bold align-middle" title="Порахувало автоматично з розкрою; впишіть своє значення, щоб перекрити">
                          авто
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        className={`${inputCls} ${isAuto ? 'border-[#0084ff]/40 bg-[#0084ff]/5' : ''}`}
                        style={{ width: 80 }}
                        type="number"
                        min={0}
                        value={isAuto ? autoServices[service.id] : (doc.services[service.id] ?? '')}
                        onChange={(e) => {
                          const next = { ...doc.services };
                          // Порожнє поле чи нуль — знімають ручне значення
                          // й повертають авто (якщо воно є)
                          const parsed = num(e.target.value);
                          if (e.target.value.trim() === '' || parsed <= 0) delete next[service.id];
                          else next[service.id] = parsed;
                          patch({ services: next });
                        }}
                        placeholder="0"
                      />
                      <span className="text-xs text-slate-400 w-14">{quoteUnitLabel(service.unit)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Пакування і матеріал */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex flex-wrap gap-6">
          {doc.method === 'drawing' && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-slate-700 uppercase">Пакування</h3>
              <div className="flex items-end gap-3 flex-wrap">
                <Field label="Дерев'яна піраміда" style={{ width: 170 }}>
                  <select className={inputCls} value={doc.packaging.pyramidLength} onChange={(e) => patch({ packaging: { ...doc.packaging, pyramidLength: Number(e.target.value) } })}>
                    <option value={0}>Авто ({suggestPyramidLength(doc.items)} мм)</option>
                    {PYRAMID_LENGTHS.map((length) => <option key={length} value={length}>{length} мм</option>)}
                  </select>
                </Field>
                <Field label="К-сть пірамід" style={{ width: 90 }}>
                  <input className={inputCls} type="number" min={0} value={doc.packaging.pyramidQty} onChange={(e) => patch({ packaging: { ...doc.packaging, pyramidQty: Math.max(0, Math.round(num(e.target.value))) } })} />
                </Field>
                <Field label="Пакування в короб, м²" style={{ width: 140 }}>
                  <input className={inputCls} type="number" min={0} step={0.1} value={doc.packaging.boxM2 || ''} onChange={(e) => patch({ packaging: { ...doc.packaging, boxM2: num(e.target.value) } })} placeholder="0" />
                </Field>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-slate-700 uppercase">Матеріал</h3>
            <Field label="Листів на замовлення (крок 0.5)" style={{ width: 190 }}>
              <input className={inputCls} type="number" min={0} step={0.5} value={doc.materialSheets || ''} onChange={(e) => patch({ materialSheets: num(e.target.value) })} placeholder="лист / півлиста" />
            </Field>
          </div>
        </div>

        {/* Попередження */}
        {result.warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col gap-1.5">
            {result.warnings.map((warning, index) => (
              <div key={index} className="flex items-start gap-2 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}

        {/* Розрахунок */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-700 uppercase">Розрахунок</h3>
            <p className="text-xs text-slate-500 mt-0.5">Ціну можна вписати прямо в рядок — вона збережеться в документі й перекриє прайс</p>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 uppercase font-bold">
              <tr>
                <th className="px-6 py-3">Назва</th>
                <th className="px-4 py-3 text-right">К-сть</th>
                <th className="px-4 py-3 text-center">Од.</th>
                <th className="px-4 py-3 text-right">Ціна (₴)</th>
                <th className="px-6 py-3 text-right">Сума (₴)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.lines.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Додайте вироби з розмірами — розрахунок з'явиться тут.</td></tr>
              )}
              {[...grouped.entries()].map(([group, lines]) => (
                <FragmentGroup key={group} label={QUOTE_GROUP_LABELS[group]} lines={lines} onPrice={setOverride} />
              ))}
            </tbody>
            {result.lines.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300">
                  <td className="px-6 py-4 font-bold text-slate-800" colSpan={4}>Загальна вартість</td>
                  <td className="px-6 py-4 text-right font-bold text-lg text-[#0084ff]">{result.total.toFixed(2)} ₴</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <QuoteSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Прихований 3D-в'ювер для зйомки візуалізацій (showcase: білий фон, 3 ракурси) */}
      {capturing3d && createPortal(
        <div className="fixed top-0 left-0 w-[1200px] h-[800px] z-[-10] pointer-events-none" style={{ opacity: 0.01 }}>
          <Suspense fallback={null}>
            <Viewer3D isCaptureMode capturePreset="showcase" onCaptureReady={(snaps) => void runPdfExport(snaps)} />
          </Suspense>
        </div>,
        document.body,
      )}

      {pdfDialogOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 font-sans" onClick={() => !pdfBusy && !capturing3d && setPdfDialogOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm flex flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <FileDown className="w-5 h-5 text-[#0084ff]" />
                <h2 className="text-base font-semibold text-gray-800">PDF для клієнта</h2>
              </div>
              <button onClick={() => setPdfDialogOpen(false)} className="text-gray-500 hover:text-gray-700 p-1" disabled={pdfBusy || capturing3d}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <p className="text-sm text-slate-600">Що включити в документ:</p>
              {([
                ['includeCalc', 'КП — розрахунок вартості', 'Шапка замовлення, вироби, розрахунок'],
                ['includeViz', '3D візуалізації', '2–3 ракурси виробу на білому фоні'],
                ['includeDrawings', 'Бланк погодження', 'Контури виробів з розмірами, обробки, підпис замовника'],
                ['includeDetailsList', 'Список деталей', 'Таблиця з габаритами і площами'],
              ] as const).map(([key, label, hint]) => (
                <label key={key} className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="mt-1"
                    style={{ width: 16, height: 16 }}
                    checked={pdfOptions[key]}
                    onChange={(event) => setPdfOptions((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{label}</span>
                    <span className="block text-xs text-slate-500">{hint}</span>
                  </span>
                </label>
              ))}
              <button
                onClick={handleExportPdf}
                disabled={pdfBusy || capturing3d || (!pdfOptions.includeCalc && !pdfOptions.includeViz && !pdfOptions.includeDrawings && !pdfOptions.includeDetailsList)}
                className="mt-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0084ff] text-white rounded-md text-sm font-bold hover:bg-[#006bce] transition-colors disabled:bg-slate-300"
              >
                {(pdfBusy || capturing3d) ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                {capturing3d ? 'Знімаю 3D…' : pdfBusy ? 'Формую PDF…' : 'Сформувати PDF'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function FragmentGroup({ label, lines, onPrice }: {
  label: string;
  lines: QuoteCalcLine[];
  onPrice: (lineId: string, raw: string) => void;
}) {
  return (
    <>
      <tr className="bg-slate-50/70">
        <td colSpan={5} className="px-6 py-2 text-xs font-bold text-slate-500 uppercase">{label}</td>
      </tr>
      {lines.map((line) => (
        <tr key={line.id} className="hover:bg-slate-50/50">
          <td className="px-6 py-2.5 font-medium text-slate-800">
            {line.code && <span className="font-mono text-xs text-slate-400 mr-2">{line.code}</span>}
            {line.label}
          </td>
          <td className="px-4 py-2.5 text-right text-slate-700">{line.qty}</td>
          <td className="px-4 py-2.5 text-center text-slate-500">{quoteUnitLabel(line.unit)}</td>
          <td className="px-4 py-2.5 text-right">
            <input
              className={`border rounded px-2 py-1 text-sm text-right ${line.overridden ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
              style={{ width: 90 }}
              type="number"
              min={0}
              value={line.unitPrice || ''}
              placeholder="0"
              onChange={(e) => onPrice(line.id, e.target.value)}
              title={line.overridden ? 'Ручна ціна (перекриває прайс)' : 'Ціна з прайсу — можна перекрити'}
            />
          </td>
          <td className="px-6 py-2.5 text-right font-bold text-slate-800">{line.sum.toFixed(2)}</td>
        </tr>
      ))}
    </>
  );
}
