import { Suspense, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, Plus, Trash2, AlertTriangle, Download, RefreshCw, FileDown, Loader2, Settings, X, ChevronDown } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useStore';
import { getAllProjectDetails } from '../../store/projectHelpers';
import { exportQuotePdf, DEFAULT_QUOTE_PDF_OPTIONS, type QuotePdfOptions } from '../../utils/export/quotePdf';
import { QuoteSettingsModal } from './QuoteSettingsModal';
import { OrganizationSearchInput } from './OrganizationSearchInput';
import { BranchSelect } from './BranchSelect';
import { usePrices1c } from './usePrices1c';
import { QuoteOrderCard } from './QuoteOrderCard';
import type { Branch, CustomerContact, CustomerOrganization } from '../../lib/api';
import { Viewer3D } from '../3d/Viewer3DLazy';
import type { ProductSnapshots } from '../3d/Viewer3D';
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
  QUOTE_PAYMENT_TYPES,
  QUOTE_PRODUCT_TYPES,
  QUOTE_SERVICES,
  QUOTE_SHAPES,
  createQuoteCalcDoc,
  quoteProductType,
  quoteMaterialFromSlab,
  type QuoteCalcDoc,
  type QuoteItem,
  type QuoteMaterialLine,
} from '../../domain/quoteCalc';

/**
 * Прорахунок для клієнта.
 *
 * Окремий документ зі своєю математикою (див. engines/quoteCalc.ts):
 * вартість від площі виробів за номенклатурами, а не від порізки й
 * кромок. Зберігається в проєкті (project.quoteCalc), тому їде разом
 * зі збереженням і синхронізується між вікнами.
 *
 * Ціни рахує 1С (метод getDiscountPrice) за кодами номенклатур 1С:
 * він знає прайс-категорію контрагента, знижки й акції. Локального прайсу
 * як фолбеку більше немає (рішення 25.08.2026): рядок без коду або без
 * відповіді сервісу лишається нулем — мовчазна підміна ціни колись уже
 * приховала непрацюючу інтеграцію.
 *
 * Виняток один — режим калібрування (QuoteSettingsModal): керівник
 * свідомо перекриває ціну руками, щоб зібрати статистику розходжень.
 * Тоді рядок помічений «РУЧНА», а PDF виходить блідо-червоною чернеткою
 * з написом «клієнту не передавати».
 */

const inputCls = 'border border-slate-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#0084ff]';

/**
 * Прелоадер на місці числа.
 *
 * Саме сіра смужка розміром із майбутнє число, а не спінер: таблиця не
 * стрибає, поки 1С рахує, і одразу видно, ЯКІ рядки ще без ціни.
 */
function PricePlaceholder({ className = '' }: { className?: string }) {
  return <span className={`inline-block rounded bg-slate-200 animate-pulse align-middle ${className}`} />;
}

/**
 * Згортана секція прорахунку (26.08, прохання власника).
 *
 * Прорахунок виріс у довгий сувій, а працюють зазвичай з однією секцією.
 * Клік по заголовку згортає картку до одного рядка: назва + коротка
 * вижимка (контрагент, кількість виробів, сума…) — важливе видно й у
 * згорнутому вигляді.
 *
 * Стан живе в React, не в localStorage: збережений стан згортання
 * пережив би зміну замовлення і ховав би секції, які саме зараз важливі.
 * Кожне відкриття прорахунку починається з розгорнутих секцій.
 */
function QuoteSection({ title, summary, headerRight, defaultOpen = true, children }: {
  title: string;
  /** Вижимка для згорнутого стану — саме те, що треба бачити без розгортання */
  summary?: React.ReactNode;
  /** Кнопки праворуч у заголовку — видно лише в розгорнутому стані */
  headerRight?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <div
        className={`px-6 py-3 flex items-center gap-3 cursor-pointer select-none hover:bg-slate-50/70 ${open ? 'border-b border-slate-100' : ''}`}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
        <h3 className="text-sm font-bold text-slate-700 uppercase shrink-0">{title}</h3>
        {!open && summary && (
          <span className="text-sm text-slate-500 truncate">{summary}</span>
        )}
        {open && headerRight && (
          <div className="ml-auto flex gap-2" onClick={(event) => event.stopPropagation()}>{headerRight}</div>
        )}
      </div>
      {open && <div className="p-6 pt-4 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

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
  // id проєкту в нашій базі — він їде в замовлення як project_id, за ним
  // замовлення в ERP зводиться назад із проєктом застосунку.
  const dbProjectId = useProjectStore((s) => s.currentDbProjectId);
  const updateProject = useProjectStore((s) => s.updateProject);
  const priceBook = useSettingsStore((s) => s.quotePriceBook);
  const manualPricing = useSettingsStore((s) => s.quoteManualPricing);
  const isAdminUnlocked = useUIStore((s) => s.isAdminUnlocked);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /**
   * Контрагент прорахунку живе ТІЛЬКИ в документі.
   *
   * Раніше порожнє поле показувало контрагента з шапки проєкту, а вибір у
   * довіднику писав ще й у шапку. Через це поле не стиралось: щойно його
   * очищали, назад приїжджало значення з шапки. Тепер це два незалежні
   * поля — у шапці менеджер пише руками, тут бере з довідника, а документи
   * і так уміють брати те, що заповнене (див. utils/export).
   */
  const doc: QuoteCalcDoc = useMemo(
    () => ({ ...createQuoteCalcDoc(), ...(project.quoteCalc ?? {}) }),
    [project.quoteCalc],
  );

  const patch = (partial: Partial<QuoteCalcDoc>) => updateProject({ quoteCalc: { ...doc, ...partial } });

  /**
   * Вибір організації в довіднику заповнює лише документ прорахунку —
   * шапку проєкту він більше не чіпає. id організації лишається в
   * документі: ним 1С рахує ціни за прайсом контрагента.
   */
  const pickOrganization = (organization: CustomerOrganization, contact: CustomerContact | null) => patch({
    contragent: organization.title,
    contragentId: organization.id,
    contactName: contact?.name ?? '',
    contactPhone: contact?.phone ?? '',
  });
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
    () => autoQuoteServices(project, getAllProjectDetails(project), parts),
    [project, parts],
  );
  /**
   * Матеріал прорахунку — зі СЛЕБІВ проєкту, по рядку на артикул.
   *
   * Слеб узятий із каталогу вже несе артикул, матеріал, декор і товщину,
   * тож заводити те саме в прорахунку вдруге не треба: кількість — це
   * скільки листів цього артикулу додано, ціну за артикулом дає 1С,
   * точно як за послуги.
   *
   * Рахуємо тут, а не зберігаємо в документі: джерело істини — список
   * слебів. Копія в документі розійшлася б із ним при першому ж
   * видаленні слеба.
   */
  const slabMaterials = useMemo(() => {
    const byArticle = new Map<string, QuoteMaterialLine>();
    project.slabs.forEach((slab) => {
      // Матеріал замовника в прорахунок не йде: він не наш, ми його не
      // продаємо і ціни за нього не питаємо.
      if (slab.customerOwn) return;
      // Слеби без артикулу (старі проєкти) групуються за своїм набором
      // ознак — інакше різні декори злиплись би в один рядок.
      const key = slab.article || `no-article:${slab.material}|${slab.decor}|${slab.thickness}`;
      // Півлиста важить 0.5: артикула на нього не існує, тому це наша
      // математика, а не окрема номенклатура.
      const weight = slab.halfSheet ? 0.5 : 1;
      const line = byArticle.get(key);
      if (line) { line.qty += weight; return; }
      byArticle.set(key, {
        article: slab.article ?? '',
        key,
        material: slab.material,
        decor: slab.decor,
        thickness: slab.thickness,
        qty: weight,
      });
    });
    return [...byArticle.values()];
  }, [project.slabs]);

  /**
   * Матеріал і виробник ЗАМКНУТІ на слеби (рішення 25.08.2026).
   *
   * У проєкт можна взяти лише один тип матеріалу й одного виробника —
   * решта слебів відрізняється тільки декором, товщиною і габаритом.
   * Тому в прорахунку ці два поля не обираються: щойно з'явився перший
   * слеб, вони приходять із нього.
   *
   * Обмеженням замість купи правил: інакше довелось би вирішувати, що
   * робити з прорахунком, у якому кераміка Laminam і кварцит Avant
   * одночасно — а такого замовлення в житті не буває.
   *
   * `undefined` (Компакт-плита, пари в прорахунку немає) лишає те, що
   * було в документі, — див. quoteMaterialFromSlab.
   */
  const lockedMaterial = useMemo(
    () => (project.slabs[0] ? quoteMaterialFromSlab(project.slabs[0].material) : undefined),
    [project.slabs],
  );
  const lockedManufacturer = project.slabs[0]?.manufacturer || '';
  const materialType = lockedMaterial ?? doc.materialType;
  const manufacturerName = lockedManufacturer || doc.manufacturer;

  const effectiveDoc = useMemo(
    () => ({
      ...doc,
      materialType,
      manufacturer: manufacturerName,
      services: mergeQuoteServices(autoServices, doc.services),
      materials: slabMaterials,
    }),
    [doc, autoServices, slabMaterials, materialType, manufacturerName],
  );

  // Два проходи движка: перший дає коди й кількості рядків (кількість від
  // ціни не залежить), за ними питаємо ціни, другий рахує вже з ними.
  const bookResult = useMemo(() => computeQuoteCalc(effectiveDoc, priceBook), [effectiveDoc, priceBook]);
  /**
   * Що питаємо в 1С.
   *
   * Для МАТЕРІАЛУ кількість завжди 1 — питаємо ціну за ОДИН лист і
   * множимо самі (рішення 26.08.2026). Артикула на півлиста в 1С не
   * існує, і запит на «3.5 листа» база не зрозуміє. Для решти рядків
   * кількість іде як є.
   */
  const priceItems = useMemo(
    () => bookResult.lines.flatMap((line) => (
      line.code ? [{ code: line.code, qty: line.group === 'material' ? 1 : line.qty }] : []
    )),
    [bookResult],
  );
  const erp = usePrices1c(priceItems, doc.contragentId);
  const result = useMemo(
    () => computeQuoteCalc(effectiveDoc, priceBook, erp.unitPrices, manualPricing),
    [effectiveDoc, priceBook, erp.unitPrices, manualPricing],
  );
  const [pdfBusy, setPdfBusy] = useState(false);
  /* Розрахунок згортається як і решта секцій; у згорнутому рядку видно
     загальну суму — це головне число, і воно не має ховатись. */
  const [calcOpen, setCalcOpen] = useState(true);

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

  const runPdfExport = async (snapshots: string[], productSnapshots?: ProductSnapshots[]) => {
    setCapturing3d(false);
    // FG-08/SC-36: якщо знімок 3D не вдався (WebGL-контекст був втрачений),
    // раніше PDF мовчки виходив із порожньою рамкою замість фото виробу.
    // Кажемо про це прямо, а не ховаємо за порожньою сторінкою.
    if (pdfOptions.includeViz && snapshots.length === 0) {
      alert('Не вдалося зробити знімок 3D для прорахунку (WebGL-контекст був недоступний). PDF сформується без фото виробу — спробуйте ще раз за кілька секунд.');
    }
    setPdfBusy(true);
    try {
      const options: QuotePdfOptions = {
        ...DEFAULT_QUOTE_PDF_OPTIONS,
        includeCalc: pdfOptions.includeCalc,
        includeDetailsList: pdfOptions.includeDetailsList,
        includeDrawings: pdfOptions.includeDrawings,
        // Документ у режимі калібрування виходить блідо-червоним і з
        // попередженням: ручна ціна не має вийти з дому як комерційна.
        calibration: manualPricing,
        snapshots,
        // Кілька виробів → окремий бланк візуалізації на кожен.
        productSnapshots,
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
  const isAcrylic = materialType === 'Акриловий камінь';
  const manufacturers = DEFAULT_MANUFACTURERS[materialType] ?? [];
  const availableTypes = QUOTE_PRODUCT_TYPES.filter((type) => (isSinkOnly ? type.sinkFlow : true));

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

  /**
   * Звідки ціни: контрагент вмикає його прайс-категорію, без нього сервіс
   * рахує за загальним прайсом.
   *
   * Підпис і час — окремими вузлами, бо перекладач інтерфейсу міняє текст
   * вузла ЦІЛКОМ за збігом зі словником: приліплений час зробив би рядок
   * неперекладним.
   */
  const priceStatus = useMemo(() => {
    const time = erp.updatedAt
      ? new Date(erp.updatedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
      : '';
    if (erp.state === 'waiting') return { label: 'Виберіть контрагента — без нього ціни не рахуються', time: '' };
    if (erp.state === 'loading') return { label: 'Рахую ціни в 1С…', time: '' };
    if (erp.state === 'error' || erp.state === 'off') return { label: erp.error, time: '' };
    if (erp.state === 'ready') {
      return {
        label: doc.contragentId
          ? 'Ціни від 1С за прайсом контрагента'
          : 'Ціни від 1С за загальним прайсом',
        time,
      };
    }
    return { label: 'Ціни рахує 1С за кодами номенклатур', time: '' };
  }, [erp.state, erp.error, erp.updatedAt, doc.contragentId]);

  /**
   * Клієнтський PDF — лише з контрагентом із довідника (рішення 26.08.2026).
   *
   * Компроміс між двома правильними речами. ІТ на мейні блокували все:
   * без контрагента 1С віддає ЗАГАЛЬНИЙ прайс, і менеджер прийняв би його
   * за ціну свого клієнта. Але повне блокування замикає й роботу — без
   * живого довідника контрагентів не порахувати нічого взагалі.
   *
   * Тому ділимо: числа в таблиці показуємо завжди (менеджер бачить підпис
   * «за загальним прайсом» і розуміє, що це прикидка), а документ, який
   * поїде клієнту, без контрагента не робимо — саме він і є те місце, де
   * чужа ціна стає обіцянкою.
   *
   * Прив'язка саме до contragentId, а не до тексту в полі: щоб знайти
   * контрагента в ERP, потрібен id організації з довідника, а вписана
   * руками назва («новий клієнт», «ТОВ …») його не дає.
   */
  const pdfBlocked = !doc.contragentId;
  /**
   * Прелоадер замість чисел.
   *
   * Показуємо його лише там, де ціни ще НЕМАЄ з 1С: інакше таблиця
   * блимала б цілком на кожну правку документа, хоч більшість рядків уже
   * порахована.
   */
  const pricesLoading = erp.state === 'loading';
  const totalPending = pricesLoading && result.lines.some((line) => line.source === 'none');
  /** Ціни є, але за загальним прайсом — це треба бачити, а не здогадуватись */
  const generalPrices = erp.state === 'ready' && !doc.contragentId;

  const grouped = useMemo(() => {
    const map = new Map<QuoteCalcLine['group'], QuoteCalcLine[]>();
    result.lines.forEach((line) => map.set(line.group, [...(map.get(line.group) ?? []), line]));
    return map;
  }, [result]);

  return (
    <div className="quote-panel flex-1 flex flex-col h-full bg-slate-50 p-6 overflow-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-4">

        {/* Заголовок */}
        <div className="quote-head bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex items-center justify-between gap-4">
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
              disabled={result.lines.length === 0 || pdfBlocked}
              className="flex items-center gap-2 px-4 py-2 bg-[#0084ff] text-white rounded-md text-sm font-bold hover:bg-[#006bce] transition-colors disabled:bg-slate-300 disabled:cursor-default"
              title={pdfBlocked
                ? 'Виберіть контрагента — без нього прорахунок не має цін'
                : 'Фірмовий PDF прорахунку для клієнта — з вибором складу документа'}
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
        <QuoteSection
          title="Замовлення"
          summary={[doc.contragent || 'без контрагента', doc.branch, QUOTE_METHODS.find((m) => m.id === doc.method)?.label]
            .filter(Boolean).join(' · ')}
        >

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
              <BranchSelect
                value={doc.branch}
                // Правка руками — уже інша філія, ніж вибрана в довіднику
                onChange={(branch) => patch({ branch, branchId: '' })}
                onPick={(branch: Branch) => patch({ branch: branch.title, branchId: branch.id })}
                inputClassName={`${inputCls} w-full`}
                placeholder="Філія менеджера"
              />
            </Field>
            <Field label="Контрагент">
              <OrganizationSearchInput
                value={doc.contragent}
                // Правка руками — це вже інший контрагент, ніж вибраний у
                // довіднику: id знімаємо, інакше ціни й далі рахувались би
                // за прайсом того, кого в полі вже немає.
                onChange={(contragent) => patch({ contragent, contragentId: '' })}
                onPick={pickOrganization}
                inputClassName={`${inputCls} w-full`}
                placeholder="З довідника"
              />
            </Field>
            <Field label="Контактна особа">
              <input className={inputCls} value={doc.contactName} onChange={(e) => patch({ contactName: e.target.value })} placeholder="Ім'я" />
            </Field>
            <Field label="Телефон">
              <input className={inputCls} value={doc.contactPhone} onChange={(e) => patch({ contactPhone: e.target.value })} placeholder="+380…" />
            </Field>
            {/* Вид оплати — обов'язковий для рахунку в ERP: 1С не виписує
                рахунок без нього, тому поле стоїть у шапці замовлення, а
                не серед додаткових. Значення їде в payment_type як є. */}
            <Field label="Метод оплати">
              <select
                className={inputCls}
                value={doc.paymentType ?? ''}
                onChange={(e) => patch({ paymentType: e.target.value as QuoteCalcDoc['paymentType'] })}
              >
                <option value="">— не вибрано —</option>
                {QUOTE_PAYMENT_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
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
            {/* Матеріал і виробник приходять зі слебів і руками не
                обираються: у проєкті один матеріал і один виробник.
                Поле «Декор (код із сайту)» прибране — декор приходить
                разом зі слебом, дублювати його не треба. */}
            <Field label="Тип матеріалу">
              {project.slabs.length ? (
                <div className={`${inputCls} bg-slate-50 text-slate-700 cursor-default`} title="Зі слебів проєкту">
                  {materialType}
                </div>
              ) : (
                <select className={inputCls} value={doc.materialType} onChange={(e) => patch({ materialType: e.target.value as QuoteCalcDoc['materialType'], manufacturer: '' })}>
                  {QUOTE_MATERIAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              )}
            </Field>
            <Field label="Виробник">
              {project.slabs.length ? (
                <div className={`${inputCls} bg-slate-50 text-slate-700 cursor-default truncate`} title="Зі слебів проєкту">
                  {manufacturerName || '—'}
                </div>
              ) : (
                <>
                  <input className={inputCls} list="quote-manufacturers" value={doc.manufacturer} onChange={(e) => patch({ manufacturer: e.target.value })} placeholder="Оберіть чи впишіть" />
                  <datalist id="quote-manufacturers">
                    {manufacturers.map((name) => <option key={name} value={name} />)}
                  </datalist>
                </>
              )}
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
        </QuoteSection>

        {/* Вироби */}
        <QuoteSection
          title="Вироби"
          summary={doc.items.length
            ? `${doc.items.length} шт · ${doc.items.reduce((sum, item) => sum + (item.area || 0) * (item.quantity || 1), 0).toFixed(2)} м²`
            : 'порожньо'}
          headerRight={(
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
          )}
        >

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
        </QuoteSection>

        {/* Додаткові послуги */}
        {!isSinkOnly && (
          <QuoteSection
            title="Додаткові послуги"
            summary={(() => {
              const active = QUOTE_SERVICES.filter((service) =>
                (doc.services[service.id] > 0) || (autoServices[service.id] ?? 0) > 0).length;
              return active ? `активних: ${active}` : 'немає';
            })()}
          >
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
          </QuoteSection>
        )}

        {/* Пакування і матеріал */}
        <QuoteSection
          title="Пакування і матеріал"
          summary={slabMaterials.length
            ? `${slabMaterials.length} арт. · ${slabMaterials.reduce((sum, line) => sum + line.qty, 0)} лист.`
            : (doc.materialSheets > 0 ? `${doc.materialSheets} лист.` : 'матеріалу немає')}
        >
        <div className="flex flex-wrap gap-6">
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
            {/* Матеріал приходить зі СЛЕБІВ проєкту — по рядку на артикул
                (рішення 25.08.2026). Заводити його тут удруге не треба:
                слеб із каталогу вже несе артикул, декор і товщину.
                Ручне поле нижче лишається тільки для проєктів БЕЗ слебів. */}
            {slabMaterials.length > 0 ? (
              <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                {slabMaterials.map((line) => (
                  <div key={line.key} className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-800 truncate">
                        {line.decor || line.material}
                        <span className="text-slate-400"> · {line.material}{line.thickness ? `, ${line.thickness} мм` : ''}</span>
                      </div>
                      <div className={`text-xs ${line.article ? 'text-slate-500' : 'text-amber-700'}`}>
                        {line.article
                          ? <>Артикул <span className="font-mono">{line.article}</span></>
                          : 'Артикул не заданий — ціни за цим рядком не буде'}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-700 tabular-nums shrink-0">
                      {line.qty} <span className="text-xs font-normal text-slate-500">лист</span>
                    </div>
                  </div>
                ))}
                <div className="px-3 py-1.5 bg-slate-50 text-[11px] text-slate-500">
                  Зі слебів проєкту. Щоб змінити — додайте або видаліть слеб
                  у вкладці «Слеби».
                </div>
              </div>
            ) : (
            <Field label="Листів на замовлення (крок 0.5)" style={{ width: 190 }}>
              <div className="flex items-center gap-2">
                <input
                  className={inputCls + (doc.items.length > 0 && !(doc.materialSheets > 0) ? ' !border-red-400 !bg-red-50' : '')}
                  type="number" min={0} step={0.5}
                  value={doc.materialSheets || ''}
                  onChange={(e) => patch({ materialSheets: num(e.target.value) })}
                  placeholder="лист / півлиста"
                />
                {(() => {
                  const usedSlabIds = new Set((project.placements ?? []).map((p) => p.slabId).filter(Boolean));
                  const fromNesting = usedSlabIds.size || project.slabs.length;
                  if (!fromNesting || fromNesting === doc.materialSheets) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => patch({ materialSheets: fromNesting })}
                      className="shrink-0 px-2 py-1 text-xs font-medium text-[#0084ff] border border-[#0084ff] hover:bg-[#0084ff]/5 rounded-sm transition-colors whitespace-nowrap"
                      title="Підставити кількість слябів, задіяних у розкрої"
                    >
                      З розкрою: {fromNesting}
                    </button>
                  );
                })()}
              </div>
            </Field>
            )}
          </div>
        </div>
        </QuoteSection>

        {/* Попередження */}
        {(result.warnings.length > 0 || (doc.items.length > 0 && !slabMaterials.length && !(doc.materialSheets > 0))) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col gap-1.5">
            {doc.items.length > 0 && !slabMaterials.length && !(doc.materialSheets > 0) && (
              <div className="flex items-start gap-2 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Поле «Листів на замовлення» порожнє — у КП не буде матеріалу. Кількість слябів із розкрою видно в рядку статусу внизу.</span>
              </div>
            )}
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
          <div
            className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 cursor-pointer select-none hover:bg-slate-50/70"
            onClick={() => setCalcOpen((value) => !value)}
          >
            <div>
              <div className="flex items-center gap-2">
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${calcOpen ? '' : '-rotate-90'}`} />
                <h3 className="text-sm font-bold text-slate-700 uppercase">Розрахунок</h3>
                {!calcOpen && (
                  <span className="text-sm font-bold text-[#0084ff]">{result.total.toFixed(2)} ₴</span>
                )}
              </div>
              <p className={`text-xs mt-0.5 flex items-center gap-1.5 ${erp.state === 'error' || generalPrices ? 'text-amber-600' : 'text-slate-500'}`}>
                {pricesLoading && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                <span>{priceStatus.label}</span>
                {priceStatus.time && <span className="text-slate-400"> · {priceStatus.time}</span>}
                {erp.missing.length > 0 && erp.state === 'ready' && (
                  <>{' · '}<span className="text-amber-600">{`без ціни: ${erp.missing.length}`}</span></>
                )}
              </p>
            </div>
            <button
              onClick={(event) => { event.stopPropagation(); erp.refresh(); }}
              disabled={pricesLoading || priceItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 shrink-0"
              title="Перерахувати ціни в 1С"
            >
              {pricesLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              Оновити ціни
            </button>
          </div>
          {calcOpen && (<>
          {manualPricing && (
            <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
              <b>Режим калібрування ввімкнено.</b> Рядки з позначкою «РУЧНА» рахуються
              за ціною, вписаною в налаштуваннях прорахунку, а не за ціною компанії.
              Режим для збору статистики розходжень — вимкніть його перед звичайною роботою.
            </div>
          )}
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
                <FragmentGroup key={group} label={QUOTE_GROUP_LABELS[group]} lines={lines} loading={pricesLoading} />
              ))}
            </tbody>
            {result.lines.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300">
                  <td className="px-6 py-4 font-bold text-slate-800" colSpan={4}>Загальна вартість</td>
                  <td className="px-6 py-4 text-right font-bold text-lg text-[#0084ff]">
                    {totalPending
                      ? <PricePlaceholder className="w-28 h-5 ml-auto" />
                      : `${result.total.toFixed(2)} ₴`}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          </>)}
        </div>
        {/* Замовлення: підтверджений прорахунок → Orders Service */}
        <QuoteOrderCard
          doc={effectiveDoc}
          lines={result.lines}
          total={result.total}
          project={{
            id: dbProjectId || project.id,
            name: project.orderNumber || project.customer || 'Проєкт SlabCutPlanner',
            orderNumber: project.orderNumber,
          }}
          pricesLoading={pricesLoading}
          // Попередній номер не затирається: в ERP те замовлення живе далі
          onCreated={(order) => patch({
            order,
            orderHistory: [...(doc.orderHistory ?? []), ...(doc.order ? [doc.order] : [])],
          })}
        />
      </div>

      <QuoteSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Прихований 3D-в'ювер для зйомки візуалізацій (showcase: білий фон, 3 ракурси) */}
      {capturing3d && createPortal(
        <div className="fixed top-0 left-0 w-[1200px] h-[800px] z-[-10] pointer-events-none" style={{ opacity: 0.01 }}>
          <Suspense fallback={null}>
            <Viewer3D isCaptureMode capturePreset="showcase" onCaptureReady={(snaps, perProduct) => void runPdfExport(snaps, perProduct)} />
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
                ['includeViz', '3D візуалізації', 'Окремий аркуш на кожен виріб, 3 ракурси на білому фоні'],
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

function FragmentGroup({ label, lines, loading }: {
  label: string;
  lines: QuoteCalcLine[];
  /** 1С ще рахує — рядки без її ціни показують прелоадер, а не старе число */
  loading: boolean;
}) {
  return (
    <>
      <tr className="bg-slate-50/70">
        <td colSpan={5} className="px-6 py-2 text-xs font-bold text-slate-500 uppercase">{label}</td>
      </tr>
      {lines.map((line) => {
        // Ціна цього рядка ще не з 1С, а запит триває — показуємо прелоадер.
        // Рядки, які ERP уже порахувала, лишаються на місці: інакше таблиця
        // блимала б цілком на кожну правку документа.
        // Ручна ціна калібрування прелоадером НЕ підміняється: вона не
        // залежить від відповіді 1С і має бути видима завжди.
        const pending = loading && line.source !== 'erp' && line.source !== 'manual';
        return (
          <tr key={line.id} className="hover:bg-slate-50/50">
            <td className="px-6 py-2.5 font-medium text-slate-800">
              {line.code && <span className="font-mono text-xs text-slate-400 mr-2">{line.code}</span>}
              {line.label}
            </td>
            <td className="px-4 py-2.5 text-right text-slate-700">{line.qty}</td>
            <td className="px-4 py-2.5 text-center text-slate-500">{quoteUnitLabel(line.unit)}</td>
            <td
              className={`px-4 py-2.5 text-right tabular-nums ${line.unitPrice ? 'text-slate-700' : 'text-slate-300'}`}
              title={line.source === 'erp' ? 'Ціна від 1С'
                : line.source === 'manual'
                  ? `Ручна ціна (режим калібрування)${line.erpUnitPrice !== undefined ? `. 1С дала ${line.erpUnitPrice.toFixed(2)}` : '. 1С ціни не дала'}`
                  : 'Ціни немає — 1С її не повернула'}
            >
              {pending ? <PricePlaceholder className="w-14 h-3.5" /> : line.unitPrice.toFixed(2)}
              {line.source === 'manual' && (
                <span className="ml-1.5 align-middle text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1 py-px">
                  РУЧНА
                </span>
              )}
            </td>
            <td className="px-6 py-2.5 text-right font-bold text-slate-800">
              {pending ? <PricePlaceholder className="w-20 h-3.5" /> : line.sum.toFixed(2)}
            </td>
          </tr>
        );
      })}
    </>
  );
}
