import { Fragment, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { getAllProjectDetails } from '../../store/projectHelpers';
import { computeEstimate, estimatePriceRequests, CATEGORY_LABELS, type EstimateLine } from '../../engines/estimate';
import { FileText, Download, AlertTriangle, List, Layers, BookMarked, Loader2, RefreshCw } from 'lucide-react';
import { usePrices1c } from './usePrices1c';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useStore';
import { ManufacturabilityNotice } from './ManufacturabilityNotice';

/**
 * Послуги для виробництва (BOM).
 *
 * Внутрішній документ: повний перелік операцій з обліковими кодами,
 * за яким цех знає, що робити. Клієнтський бік живе окремо — у вкладці
 * «Прорахунок» (QuotePanel); спільне в них джерело, а не оформлення:
 * геометрія → виробничі факти → прив'язки → ціни. Раніше тут була
 * окрема математика, яка брала номінальні width/height елемента, тому
 * для Г-подібної деталі площа й периметр були неправильні за побудовою.
 *
 * ЦІНИ. Кошторис рахується ДВІЧІ: спершу без грошей — щоб знати, які
 * коди 1С і в якій кількості питати, — і вже з відповіддю 1С удруге.
 * Інакше довелось би вгадувати перелік номенклатур наперед. Ціни ті
 * самі, що й у «Прорахунку»: один код — одне число в обох документах.
 */
export function EstimatePanel() {
  const project = useProjectStore((s) => s.project);
  const parts = useProjectStore((s) => s.parts);
  const catalog = useSettingsStore((s) => s.serviceCatalog);
  const mappingOverrides = useSettingsStore((s) => s.mappingOverrides);
  const customRules = useSettingsStore((s) => s.customRules);
  const getRules = useSettingsStore((s) => s.getRules);

  const [grouped, setGrouped] = useState(false);

  // Клік по рядку підсвічує на карті крою саме ті лінії, за якими послугу
  // нараховано. Працює і в «Спліті», бо стан живе в глобальному сторі.
  const highlightedServiceId = useUIStore((s) => s.highlightedServiceId);
  const setHighlightedService = useUIStore((s) => s.setHighlightedService);

  // Чи переведено розрахунок на облікові коди. Якщо ні — кошторис показує
  // внутрішні коди, і про це треба сказати прямо: інакше виглядає так,
  // ніби довідник ВіярПро підвантажився, а кошторис його не бачить.
  const usingViyarCodes = useMemo(
    () => getRules().some((rule) => rule.id.startsWith('viyar:') && rule.enabled),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mappingOverrides, customRules],
  );

  // Крок 1: кількості. Гроші тут ще нульові — потрібен тільки перелік
  // кодів, за якими є що питати.
  const draft = useMemo(() => {
    const details = getAllProjectDetails(project);
    return computeEstimate(project, parts, { details, catalog, rules: getRules() });
    // getRules читає mappingOverrides і customRules — тримаємо їх у залежностях
    // явно, інакше зміна прив'язок не перерахує кошторис.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, parts, catalog, mappingOverrides, customRules]);

  const priceItems = useMemo(() => estimatePriceRequests(draft.lines), [draft.lines]);
  // Контрагент — той самий, що у «Прорахунку»: знижка в 1С рахується за
  // ним, і кошторис не має показувати іншу ціну на ту саму операцію.
  const erp = usePrices1c(priceItems, project.quoteCalc?.contragentId);

  // Крок 2: той самий кошторис, але з цінами 1С.
  const estimate = useMemo(() => {
    const details = getAllProjectDetails(project);
    return computeEstimate(project, parts, {
      details, catalog, rules: getRules(), erpPrices: erp.unitPrices,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, parts, catalog, mappingOverrides, customRules, erp.unitPrices]);

  const pricesLoading = erp.state === 'loading';
  // Рядки, за якими грошей немає: або код 1С не заповнений, або 1С за ним
  // нічого не повернула. Мовчазний нуль у кошторисі — найгірше з можливого:
  // саме він колись видавався за пораховану суму.
  const unpriced = estimate.lines.filter((line) => line.priceSource === 'none');
  const noCode = unpriced.filter((line) => !line.externalId).length;
  const noAnswer = unpriced.length - noCode;

  const getUnitLabel = (unit: string) => {
    switch (unit) {
      case 'm': return 'м.п.';
      case 'm2': return 'м²';
      case 'pcs': return 'шт';
      case 'комплект': return 'компл.';
      default: return unit;
    }
  };

  const handleExportJson = () => {
    const data = {
      projectInfo: { orderNumber: project.orderNumber, customer: project.customer },
      facts: estimate.factTotals,
      services: estimate.lines,
      total: estimate.total,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `koshtorys_${project.orderNumber || 'project'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderRow = (line: EstimateLine, key: string) => {
    const isActive = highlightedServiceId === line.serviceId;
    return (
    <tr
      key={key}
      onClick={() => setHighlightedService(isActive ? null : line.serviceId, isActive ? null : line.refs)}
      title="Показати на карті крою, за якими лініями нараховано"
      className={`cursor-pointer transition-colors ${isActive ? 'bg-amber-50 ring-1 ring-amber-300' : 'hover:bg-slate-50/50'}`}
    >
      <td className="px-6 py-3 text-slate-400 font-mono text-xs">{line.externalId || line.serviceId}</td>
      <td className="px-6 py-3 font-medium text-slate-800">{line.name}</td>
      <td className="px-6 py-3 text-right font-medium text-slate-700">{line.quantity.toFixed(2)}</td>
      <td className="px-6 py-3 text-center text-slate-500">{getUnitLabel(line.unit)}</td>
      <td className={`px-6 py-3 text-right ${line.priceSource === 'none' ? 'text-slate-300' : 'text-slate-600'}`}>
        {line.unitPrice.toFixed(2)}
        {line.priceSource === 'manual' && (
          <span className="ml-1.5 text-[10px] font-bold text-amber-600" title="Ціна з каталогу налаштувань, а не з 1С">РУЧНА</span>
        )}
      </td>
      <td className="px-6 py-3 text-right font-bold text-slate-800">{line.total.toFixed(2)}</td>
    </tr>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 p-6 overflow-auto">
      <div className="max-w-5xl mx-auto w-full bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-white gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0084ff]/10 text-[#0084ff] rounded-md flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Послуги для виробництва (BOM)</h2>
              <p className="text-sm text-slate-500">Розрахунок із геометрії розкрою: {estimate.facts.length} виробничих фактів · клік по рядку підсвічує лінії на карті крою</p>
              <p className={`text-xs mt-0.5 flex items-center gap-1.5 ${erp.state === 'error' || erp.state === 'off' ? 'text-amber-600' : 'text-slate-500'}`}>
                {pricesLoading && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                <span>
                  {pricesLoading ? 'Рахую ціни в 1С…'
                    : erp.error ? erp.error
                    : priceItems.length === 0 ? 'Немає позицій із кодом 1С — цін немає, суми нульові'
                    : 'Ціни з 1С за кодом номенклатури'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
            <div className="flex rounded-md border border-slate-300 overflow-hidden text-sm shrink-0">
              <button
                onClick={() => setGrouped(false)}
                className={`flex items-center gap-1.5 px-3 py-2 ${!grouped ? 'bg-slate-100 text-slate-800 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
                title="Повний перелік послуг — для виробництва"
              >
                <List className="w-4 h-4" />
                Повний
              </button>
              <button
                onClick={() => setGrouped(true)}
                className={`flex items-center gap-1.5 px-3 py-2 border-l border-slate-300 ${grouped ? 'bg-slate-100 text-slate-800 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
                title="Згорнуто по групах — те, що бачить клієнт"
              >
                <Layers className="w-4 h-4" />
                Укрупнено
              </button>
            </div>

            <button
              onClick={erp.refresh}
              disabled={pricesLoading || priceItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 shrink-0"
              title="Перерахувати ціни в 1С"
            >
              {pricesLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              Оновити ціни
            </button>

            <button
              onClick={handleExportJson}
              className="flex items-center gap-2 px-4 py-2 bg-[#0084ff] text-white rounded-md text-sm font-bold hover:bg-[#006bce] transition-colors"
            >
              <Download className="w-4 h-4" />
              Експорт для MES
            </button>
          </div>
        </div>

        {!usingViyarCodes && estimate.lines.length > 0 && (
          <div className="flex items-start gap-2 px-6 py-3 bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
            <BookMarked className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
            <span>
              Кошторис рахує внутрішніми кодами застосунку. Щоб у графі «Код» стояли номери 1С —
              Налаштування → Прив'язки послуг → <strong>Перевести на коди ВіярПро</strong>.
            </span>
          </div>
        )}

        <ManufacturabilityNotice />

        {unpriced.length > 0 && (
          <div className="flex items-start gap-2 px-6 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Без ціни: {unpriced.length} з {estimate.lines.length} рядків — вони рахуються по нулю.
              {noCode > 0 && ` У ${noCode} не заповнений код 1С — ціну за ними спитати нема за чим.`}
              {noAnswer > 0 && ` За ${noAnswer} код є, але 1С ціну не повернула.`}
            </span>
          </div>
        )}

        {estimate.missingServiceIds.length > 0 && (
          <div className="flex items-start gap-2 px-6 py-3 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Прив'язки вказують на послуги, яких немає в каталозі: {estimate.missingServiceIds.join(', ')}.
              Ці роботи в суму не потрапили — перевірте «Прив'язки послуг» у налаштуваннях.
            </span>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0 uppercase font-bold">
              <tr>
                <th className="px-6 py-4">Код</th>
                <th className="px-6 py-4">Назва</th>
                <th className="px-6 py-4 text-right">К-сть</th>
                <th className="px-6 py-4 text-center">Од.</th>
                <th className="px-6 py-4 text-right">Ціна (₴)</th>
                <th className="px-6 py-4 text-right">Сума (₴)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {estimate.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Немає розрахованих послуг. Додайте деталі й запустіть розкрій.
                  </td>
                </tr>
              )}

              {!grouped && estimate.lines.map((line, index) => renderRow(line, `${line.serviceId}-${index}`))}

              {grouped && estimate.groups.map((group) => (
                <Fragment key={group.category}>
                  <tr className="bg-slate-50/70">
                    <td colSpan={5} className="px-6 py-2.5 font-bold text-slate-700 uppercase text-xs tracking-wide">
                      {CATEGORY_LABELS[group.category]}
                    </td>
                    <td className="px-6 py-2.5 text-right font-bold text-slate-800">{group.total.toFixed(2)}</td>
                  </tr>
                  {group.lines.map((line, index) => renderRow(line, `${group.category}-${line.serviceId}-${index}`))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-slate-500 font-medium">Загальна вартість послуг та матеріалу:</span>
          <span className="text-2xl font-black text-[#0084ff]">{estimate.total.toFixed(2)} ₴</span>
        </div>

      </div>
    </div>
  );
}
