import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { X, Search, ChevronLeft, Loader2 } from 'lucide-react';
import { SlabCatalogWmsPanel } from './SlabCatalogWmsPanel';
import type { MaterialType } from '../../domain/types';
import { MATERIALS_IN_USE } from '../../domain/defaults';
import { readFileAsDataUrl } from '../../utils/file';
import { api, ApiError } from '../../lib/api';
import {
  executionFor,
  groupSlabDecors,
  materialWords,
  type SlabDecor,
} from '../../domain/slabCatalog';

/**
 * ДОДАВАННЯ СЛЯБА З ДОВІДНИКА НОМЕНКЛАТУР.
 *
 * Замість ручної форми («ширина, висота, товщина, декор» руками) менеджер
 * обирає сляб із довідника: спершу картка декору в каталозі, далі —
 * конкретне виконання (габарит / товщина), за артикулом якого потім
 * питається ціна.
 *
 * Каталог приходить із be-products-service (GET /api/products/slabs) —
 * назви, артикули, габарити, товщини і ФОТО. До 27.08.2026 тут лежав
 * масив у коді на 21 позицію з вигаданими артикулами: 292540 в ньому
 * звався «Marazzi Grande Marble Statuario», а в довіднику це комплект
 * шухляди Hettich. Менеджер міг додати такий сляб і отримати ціну зовсім
 * іншого товару.
 *
 * ЩО ДОВІДНИК НЕ ЗНАЄ. У слябів не заповнені ні `vendor`, ні категорія,
 * ні текстура з колірним сегментом — тому фільтрів «Текстура» і «Сегмент
 * кольору» більше немає: вони фільтрували вигадані поля. Виробник
 * лишився, але береться з назви й тому відомий переважно для кераміки
 * (див. SLAB_BRANDS у domain/slabCatalog).
 *
 * Пошук СЕРВЕРНИЙ: слябів під півтори тисячі. Матеріал, товщина й рядок
 * пошуку їдуть у запит; виробник відбирається вже на завантаженій
 * сторінці, бо в довіднику його як поля немає.
 *
 * Окремий модуль, а не дописка у FormsPanel — інваріант 2.48: у старому
 * файлі рівно один рядок переходу.
 *
 * Повний опис механіки — «Додавання слябів» у Bottega.
 */

/**
 * Крок майстра: каталог → картка виконання → підтвердження.
 *
 * Третій крок заведений 25.08.2026 на вимогу власника. До нього «Додати
 * слеб» на картці додавало одразу, і менеджер не бачив підсумку того, що
 * саме обрав. Тепер картка ОБИРАЄ виконання, а додає — окремий екран, де
 * ще раз показано вибір, ціна і кількість.
 */
type Step = 'catalog' | 'card' | 'confirm';

/**
 * ЗВІДКИ БЕРЕТЬСЯ КАТАЛОГ — перемикач у шапці (01.09.2026).
 *   it  — довідник номенклатур Viyar Tech (Products Service): декори,
 *         артикули виконань, фото. Основне джерело.
 *   wms — склад Stone WMS: конкретні листи з габаритом і коміркою
 *         (SlabCatalogWmsPanel). Тимчасове джерело «ТЕСТ» (знімок сайту
 *         viyar.ua) прибране повністю за рішенням власника 01.09.
 * Перемикач не впливає на те, що зберігається в проєкті: сляб несе
 * артикул і габарит, а звідки він прийшов — деталь походження.
 */
export type CatalogSource = 'it' | 'wms';
const SOURCES: Array<{ key: CatalogSource; label: string; hint: string }> = [
  { key: 'it', label: 'ІТ · довідник', hint: 'Довідник номенклатур Viyar Tech — декори й артикули' },
  { key: 'wms', label: 'WMS · склад', hint: 'Stone WMS — конкретні листи з габаритом і коміркою' },
];

/** Що модалка віддає назовні, коли менеджер натиснув «Додати» */
export interface SlabPick {
  /**
   * Артикул 1С обраного ВИКОНАННЯ — за ним питається ціна.
   *
   * Порожньо означає, що для обраної товщини артикулу в довіднику не
   * знайшлось. Номенклатура 1С заведена окремо на кожну товщину, і 6 мм
   * та 12 мм того самого декору — це два різні коди.
   */
  article: string;
  name: string;
  material: MaterialType;
  manufacturer: string;
  decor: string;
  width: number;
  height: number;
  thickness: number;
  finish: string;
  /** Згенерована текстура (data-URL). У бою — фото з довідника */
  photo: string;
  /**
   * Друге фото того самого листа, зняте З ПІДСВІТКОЮ (просвітний камінь:
   * онікс тощо). Кадр мусить бути ІДЕНТИЧНИЙ основному — інакше при
   * перемиканні малюнок стрибне.
   */
  photoBacklit?: string;
  /** Натуральний камінь: фото тягне менеджер вручну */
  needsManualPhoto: boolean;
  /** Матеріал замовника — не з нашого складу, артикула немає */
  customerOwn?: boolean;
  /**
   * Скільки однакових листів додати. Для натурального каменю завжди 1:
   * кожен слеб унікальний і має власне фото.
   */
  quantity: number;
}

/**
 * Картка каталогу. Це та сама SlabDecor із довідника, плюс синтетичний
 * запис «матеріал замовника»: його в довіднику немає за визначенням, а
 * додати такий сляб треба.
 */
type CatalogItem = SlabDecor & { customerOwn?: boolean };

// Компакт-плити в переліку немає — вона виведена з програми 26.08.2026
const MATERIALS = MATERIALS_IN_USE as MaterialType[];
/** Пауза після правки фільтра перед запитом у довідник */
const CATALOG_DEBOUNCE_MS = 350;

/** Товщини для фільтра. Довідник знає й дробові (5.8, 12.5), але в
    фільтрі лишаються ходові — решту знаходять пошуком за назвою. */
const THICKNESS_FILTERS = [6, 12, 20, 30];

/**
 * Матеріал замовника — по одному запису на кожен тип матеріалу
 * (рішення 26.08.2026). Це не номенклатура: артикула немає, ціни немає,
 * усе вводиться руками. Потрібен, бо клієнт часто приносить свій
 * залишок або плиту чужого виробника, і відмовити йому ми не можемо.
 */
const customerOwnCard = (material: MaterialType): CatalogItem => ({
  key: `own:${material}`,
  name: `Матеріал замовника — ${material}`,
  material,
  manufacturer: 'Матеріал замовника',
  photo: '',
  executions: [],
  sizes: [{ width: 3200, height: 1600 }],
  thicknesses: [20],
  customerOwn: true,
});

/**
 * Помилка довідника → те, що побачить менеджер.
 *
 * Мовчазний порожній каталог — найгірше з можливого: він виглядає як
 * «такого матеріалу немає», хоча насправді не відповів сервіс.
 */
function catalogErrorText(error: unknown): string {
  const status = error instanceof ApiError ? error.status : 0;
  const code = error instanceof ApiError ? error.code : '';
  if (code === 'slabs_service_not_configured' || status === 503) {
    return 'Довідник номенклатур не підключено — каталог слябів недоступний';
  }
  if (status === 403) return 'Довідник номенклатур відмовив у доступі — потрібне налаштування прав сервісу';
  if (status === 401) return 'Сесія завершилась — увійдіть у застосунок повторно';
  return 'Довідник номенклатур не відповідає — каталог слябів недоступний';
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #dde5ee', borderRadius: 6, overflow: 'hidden',
  background: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column',
};

export function SlabCatalogModal({ open, onClose, onPick, hasContragent, contragentId, lockMaterial, lockManufacturer }: {
  open: boolean;
  onClose: () => void;
  onPick: (pick: SlabPick) => void;
  /** Контрагента вибрано — тільки тоді має сенс показувати ціну */
  hasContragent?: boolean;
  /**
   * Контрагент прорахунку (oid у Customers Service) — за ним 1С накладає
   * знижку. Без нього ціна теж питається, але приїде ЗАГАЛЬНИЙ прайс, і
   * рядок під ціною про це каже (те саме рішення, що й у прорахунку:
   * див. PRICES_REQUIRE_CUSTOMER в usePrices1c).
   */
  contragentId?: string;
  /**
   * Матеріал і виробник ПЕРШОГО слеба проєкту (рішення 25.08.2026).
   *
   * У замовлення береться один тип матеріалу й один виробник — далі
   * слеби відрізняються тільки декором, товщиною і габаритом. Тому,
   * щойно перший слеб доданий, обидва фільтри замикаються на ньому.
   *
   * Обмеженням замість купи правил: інакше довелось би вирішувати, як
   * рахувати замовлення, де кераміка Laminam і кварцит Avant разом — а
   * такого в житті не буває.
   */
  lockMaterial?: MaterialType;
  lockManufacturer?: string;
}) {
  const [step, setStep] = useState<Step>('catalog');
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [source, setSource] = useState<CatalogSource>('it');

  // ── фільтри каталогу ──────────────────────────────────────────────
  const [material, setMaterial] = useState<MaterialType>(lockMaterial ?? 'Керамограніт');
  const [manufacturer, setManufacturer] = useState(lockManufacturer ?? '');
  const [thicknessFilter, setThicknessFilter] = useState('');
  const [query, setQuery] = useState('');

  // ── каталог із довідника ──────────────────────────────────────────
  const [decors, setDecors] = useState<SlabDecor[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  /** Чи лишились позиції за межами відповіді — див. SlabCatalogResponse */
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState('');
  /**
   * Запит, на який уже прийшла відповідь. Розбіжність із поточним і
   * означає «вантажу» — окремий прапорець тут зайвий, і головне: жоден
   * setState не викликається синхронно в тілі ефекту (те саме рішення,
   * що й у usePrices1c).
   */
  const [settled, setSettled] = useState('');

  // ── вибір виконання на картці ─────────────────────────────────────
  const [sizeIndex, setSizeIndex] = useState(0);
  const [thickness, setThickness] = useState(0);
  /** Скільки однакових листів додати — питається на кроці підтвердження */
  const [quantity, setQuantity] = useState(1);
  /**
   * Натуральний камінь: габарит вводиться РУКАМИ.
   *
   * У тиражних матеріалів лист має стандартні розміри з довідника, а
   * натуральний блок ріжуть як вийде — двох однакових слебів не буває.
   * Тому для натуралки замість вибору зі списку два поля, а розміри з
   * довідника лишаються тільки як стартове значення.
   */
  const [natWidth, setNatWidth] = useState(0);
  const [natHeight, setNatHeight] = useState(0);
  /** Матеріал замовника: товщина і декор теж вводяться руками */
  const [ownThickness, setOwnThickness] = useState(20);
  const [ownDecor, setOwnDecor] = useState('');
  /** Фото конкретного листа: основне і з підсвіткою (просвітний камінь) */
  const [photo, setPhoto] = useState('');
  const [photoBacklit, setPhotoBacklit] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photoIsBacklit = useRef(false);

  const onPhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const isBacklit = photoIsBacklit.current;
    event.target.value = '';
    photoIsBacklit.current = false;
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    if (isBacklit) setPhotoBacklit(dataUrl); else setPhoto(dataUrl);
  };
  const pickPhoto = (backlit: boolean) => {
    photoIsBacklit.current = backlit;
    photoInputRef.current?.click();
  };

  /* Замок сильніший за вибір користувача: поки в проєкті є слеб, фільтри
     матеріалу й виробника не просто заблоковані — вони ігнорують стан. */
  const activeMaterial = lockMaterial ?? material;
  const activeManufacturer = lockManufacturer || manufacturer;
  const locked = Boolean(lockMaterial);

  /**
   * Запит у довідник. Пауза після правки — та сама, що в пошуку
   * контрагентів: менеджер друкує «Calacatta» по літері, і кожна з них не
   * має смикати сервіс. Попередній запит скасовується, тому відповіді не
   * переганяють одна одну.
   */
  const request = useMemo(() => JSON.stringify([activeMaterial, query.trim(), Number(thicknessFilter) || 0]),
    [activeMaterial, query, thicknessFilter]);
  const loading = open && settled !== request;

  useEffect(() => {
    if (!open) return undefined;
    const [material1c, text, thickness1c] = JSON.parse(request) as [MaterialType, string, number];
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.slabs1c({ material: material1c, query: text, thickness: thickness1c }, controller.signal)
        .then((answer) => {
          if (controller.signal.aborted) return;
          setDecors(groupSlabDecors(answer.items, material1c, materialWords(material1c)));
          setTotalCount(answer.totalCount);
          setTruncated(answer.truncated);
          setError('');
          setSettled(request);
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          setDecors([]);
          setTotalCount(0);
          setTruncated(false);
          setError(catalogErrorText(cause));
          setSettled(request);
        });
    }, CATALOG_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, request]);

  /**
   * Виробники, які реально є на завантаженій сторінці.
   *
   * Список НЕ вшитий: у довіднику виробник живе тільки в назві, тому
   * пропонувати «Neolith», якого в кераміці зараз немає, означало б
   * порожній екран після вибору фільтра.
   */
  const manufacturers = useMemo(() => {
    const found = new Set(decors.map((decor) => decor.manufacturer).filter(Boolean));
    if (lockManufacturer) found.add(lockManufacturer);
    return [...found].sort((a, b) => a.localeCompare(b, 'uk'));
  }, [decors, lockManufacturer]);

  const list = useMemo<CatalogItem[]>(() => {
    const cards: CatalogItem[] = decors.filter(
      (decor) => !activeManufacturer || decor.manufacturer === activeManufacturer,
    );
    // Матеріал замовника стоїть у кінці й фільтр за виробником його не
    // ховає: це не номенклатура, і шукати його менеджер буде саме тут.
    return [...cards, customerOwnCard(activeMaterial)];
  }, [decors, activeManufacturer, activeMaterial]);

  const isNatural = picked?.material === 'Натуральний камінь';
  const isCustomerOwn = Boolean(picked?.customerOwn);
  /* Габарит і фото вводяться руками в обох випадках: у натуралки бо
     кожен лист унікальний, у матеріалу замовника бо його немає в
     довіднику взагалі. */
  const manualEntry = isNatural || isCustomerOwn;
  /**
   * Обране виконання — рівно один запис довідника.
   *
   * Товщина й габарит разом визначають артикул: у 1С це різні
   * номенклатури. Немає такої пари — немає й артикула, і про це в картці
   * сказано прямо: підставити сусідній означало б показати ціну іншого
   * товару (правило власника 25.08.2026).
   */
  const execution = useMemo(
    () => (picked && !picked.customerOwn
      ? executionFor(picked, picked.sizes[sizeIndex] ?? picked.sizes[0], thickness)
      : undefined),
    [picked, sizeIndex, thickness],
  );
  const pickedArticle = execution?.article ?? '';
  /**
   * Фото декору — з довідника (image_for_site_s3), одне на артикул.
   *
   * Раніше тут малювалась текстура-заглушка з вигаданої палітри. Тепер
   * знімок або є в довіднику, або його немає взагалі: намальований
   * «схожий» камінь у вікні вибору матеріалу — це та сама неправда, що й
   * ціна з локального прайсу.
   *
   * Натуралка й матеріал замовника фото звідси НЕ беруть: там знімок
   * КОНКРЕТНОГО листа, який менеджер чіпляє руками.
   */
  const preview = manualEntry ? '' : (execution?.photo || picked?.photo || '');

  /**
   * ЦІНА ЛИСТА — З 1С, той самий шлях, що й у рядках прорахунку.
   *
   * У довіднику номенклатур ціни немає взагалі: у записі сляба 38 полів
   * (назва, артикул, габарит, товщина, фото, постачальник), і жодного
   * грошового — перевірено на живому сервісі 27.08.2026. Так і має бути:
   * скільки цей лист коштує ЦЬОМУ клієнту, залежить від знижки
   * контрагента й прайс-категорії, і на це відповідає лише 1С
   * (getDiscountPrice).
   *
   * Кількість питаємо ЗАВЖДИ 1 — ціну за один лист, а множимо самі. Те
   * саме рішення, що й у прорахунку: артикула на півлиста в 1С не існує,
   * а запит на «3.5 листа» база не зрозуміє.
   *
   * Без контрагента запит усе одно летить, але приїде загальний прайс —
   * і рядок під ціною каже про це прямо (див. PRICES_REQUIRE_CUSTOMER).
   */
  const [slabPrice, setSlabPrice] = useState(0);
  /**
   * Одиниця, якою порахувала 1С.
   *
   * Питаємо ціну листа, але останнє слово за ERP: у довіднику
   * номенклатур цей самий артикул має базову одиницю «м2», і 1С на перший
   * запит відповідає нулем та ВЛАСНИМ кодом одиниці, після чого бекенд
   * перепитує вже нею (див. unitMemo в prices1c.js). Тому підпис береться
   * з відповіді, а не вигадується: якщо ціна прийшла за м², так і буде
   * написано.
   */
  const [priceUnit, setPriceUnit] = useState('');
  const [priceMissing, setPriceMissing] = useState(false);
  const [priceFailed, setPriceFailed] = useState(false);
  /** Запит, на який уже прийшла відповідь — той самий прийом, що й у каталозі */
  const [priceSettled, setPriceSettled] = useState('');
  const priceRequest = pickedArticle ? JSON.stringify([pickedArticle, contragentId ?? '']) : '';
  const priceLoading = Boolean(priceRequest) && priceSettled !== priceRequest;

  useEffect(() => {
    if (!priceRequest) return undefined;
    const [code, organizationId] = JSON.parse(priceRequest) as [string, string];
    const controller = new AbortController();
    api.prices1c([{ code, qty: 1 }], { organizationId: organizationId || undefined }, controller.signal)
      .then((answer) => {
        if (controller.signal.aborted) return;
        const hit = answer.prices[code];
        setSlabPrice(Number(hit?.unitPrice) || 0);
        setPriceUnit(hit?.measureName ?? '');
        // 1С відповіла, але цього коду в прайсі немає — це не збій зв'язку
        setPriceMissing(!hit || !(Number(hit.unitPrice) > 0));
        setPriceFailed(false);
        setPriceSettled(priceRequest);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setSlabPrice(0);
        setPriceUnit('');
        setPriceMissing(false);
        // Помилку показуємо як помилку зв'язку, а не як «ціни немає»:
        // нуль через недоступну 1С і нуль через відсутній прайс — різні
        // речі, і менеджер має розрізняти їх.
        setPriceFailed(!(cause instanceof DOMException && cause.name === 'AbortError'));
        setPriceSettled(priceRequest);
      });
    return () => controller.abort();
  }, [priceRequest]);

  if (!open) return null;

  const openCard = (item: CatalogItem) => {
    setPicked(item);
    setSizeIndex(0);
    /* Найтонше виконання першим: у довіднику декор частіше заведений на
       кілька товщин, і саме тонка — ходова для стільниць. Головне, що
       товщина тут ЗАВЖДИ з наявних виконань, тому артикул є одразу. */
    setThickness(item.thicknesses[0] ?? 0);
    setQuantity(1);
    setNatWidth(item.sizes[0].width);
    setNatHeight(item.sizes[0].height);
    setPhoto('');
    setPhotoBacklit('');
    setOwnThickness(item.thicknesses[0] ?? 20);
    setOwnDecor('');
    setStep('card');
  };

  const confirm = () => {
    if (!picked) return;
    const size = manualEntry
      ? { width: Math.max(1, natWidth), height: Math.max(1, natHeight) }
      : picked.sizes[sizeIndex];
    onPick({
      article: pickedArticle,
      name: execution?.title || picked.name,
      material: picked.material,
      manufacturer: picked.manufacturer,
      // Окремого поля «декор» у довіднику немає — назва запису і є декором
      decor: isCustomerOwn ? ownDecor : picked.name,
      width: size.width,
      height: size.height,
      thickness: isCustomerOwn ? Math.max(1, ownThickness) : thickness,
      // Покриття в довіднику окремим полем не заведене — воно всередині
      // назви («полірування», «Soft Matt»). Вигадувати його не будемо.
      finish: '',
      // Тиражні матеріали беруть фото з довідника; у натуралки фото — це
      // знімок КОНКРЕТНОГО листа, який менеджер щойно причепив у картці.
      photo: manualEntry ? photo : preview,
      ...(photoBacklit ? { photoBacklit } : {}),
      needsManualPhoto: manualEntry,
      ...(isCustomerOwn ? { customerOwn: true } : {}),
      // Натуралка завжди по одному: кожен слеб унікальний і має власне фото
      quantity: manualEntry ? 1 : Math.max(1, Math.round(quantity)),
    });
    setStep('catalog');
    setPicked(null);
    onClose();
  };


  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 font-sans">
      <div className="bg-[#eef7fd] rounded-lg shadow-2xl w-full max-w-[1400px] h-[88vh] flex flex-col overflow-hidden">

        {/* шапка */}
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            {step !== 'catalog' && (
              <button type="button" onClick={() => setStep(step === 'confirm' ? 'card' : 'catalog')}
                className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
                <ChevronLeft className="w-4 h-4" /> {step === 'confirm' ? 'До виконання' : 'До каталогу'}
              </button>
            )}
            <h2 className="text-lg font-bold text-[#0084ff]">
              {step === 'catalog' ? 'Матеріал' : picked?.name}
            </h2>
            {step === 'catalog' && (
              <div className="flex items-center gap-1 ml-2 p-0.5 rounded-full border border-slate-200 bg-slate-50" role="tablist" aria-label="Джерело каталогу">
                {SOURCES.map((s) => (
                  <button type="button" key={s.key} role="tab" aria-selected={source === s.key} title={s.hint}
                    onClick={() => setSource(s.key)}
                    /* inline, бо базовий button у global.css перебиває tailwind-фони (та сама причина, що в .rail-btn) */
                    style={source === s.key
                      ? { background: '#0084ff', borderColor: '#0084ff', color: '#fff', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700 }
                      : { background: 'transparent', borderColor: 'transparent', color: '#55627a', borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 600 }}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {step === 'confirm' && (
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">· підтвердження</span>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── КРОК 1 (WMS): конкретні листи зі складу ──────────────── */}
        {step === 'catalog' && source === 'wms' && (
          <SlabCatalogWmsPanel
            material={activeMaterial}
            manufacturer={activeManufacturer}
            onClose={onClose}
            onPick={(pick) => { onPick(pick); setStep('catalog'); setPicked(null); onClose(); }}
          />
        )}

        {/* ── КРОК 1: каталог ─────────────────────────────────────── */}
        {step === 'catalog' && source === 'it' && (
          <div className="flex-1 flex min-h-0">
            {/* фільтри */}
            <aside className="w-[260px] shrink-0 p-4 overflow-auto border-r border-slate-200">
              {locked && (
                <div className="mb-3 rounded-md border border-slate-300 bg-slate-100 p-2.5 text-[11px] leading-snug text-slate-600">
                  <b className="text-slate-800">У проєкті вже є слеб.</b> Матеріал і
                  виробник закріплені за ним — наступні слеби відрізняються
                  тільки декором, товщиною і габаритом. Щоб змінити — видаліть
                  усі слеби проєкту.
                </div>
              )}

              <label className="block text-xs text-slate-600 mb-1">Тип матеріалу</label>
              <select className={`w-full mb-3 border rounded px-2 py-1.5 text-sm ${locked ? 'border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed' : 'border-slate-300 bg-white'}`}
                disabled={locked}
                value={activeMaterial} onChange={(e) => setMaterial(e.target.value as MaterialType)}>
                {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>

              <label className="block text-xs text-slate-600 mb-1">Виробник</label>
              <select className={`w-full mb-3 border rounded px-2 py-1.5 text-sm ${locked ? 'border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed' : 'border-slate-300 bg-white'}`}
                disabled={locked || !manufacturers.length}
                value={activeManufacturer} onChange={(e) => setManufacturer(e.target.value)}>
                <option value="">—</option>
                {manufacturers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>

              <label className="block text-xs text-slate-600 mb-1">Товщина виробу</label>
              <select className="w-full mb-3 border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
                value={thicknessFilter} onChange={(e) => setThicknessFilter(e.target.value)}>
                <option value="">Не вибрано</option>
                {THICKNESS_FILTERS.map((t) => <option key={t} value={t}>{t} мм</option>)}
              </select>

              <label className="block text-xs text-slate-600 mb-1">Назва або код декору</label>
              <div className="relative mb-4">
                <Search className="w-4 h-4 absolute left-2 top-2 text-slate-400" />
                <input className="w-full border border-slate-300 rounded pl-8 pr-2 py-1.5 text-sm"
                  value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Наприклад 116034" />
              </div>

              <button type="button" onClick={onClose}
                className="w-full border border-slate-300 rounded py-1.5 text-sm text-slate-600 bg-white hover:bg-slate-50">
                Скасувати
              </button>

              {/* «Уточніть пошук» кажемо ТІЛЬКИ коли частина позицій
                  справді лишилась за межами відповіді. Прогрітий кеш
                  сервера віддає весь матеріал одразу, і тоді ця порада
                  збивала б з пантелику: уточнювати нічого. */}
              <p className="mt-4 text-[11px] leading-snug text-slate-500">
                {loading ? 'Питаю довідник номенклатур…'
                  : error ? ''
                  : truncated
                    ? `Показано ${decors.length} декорів із ${totalCount} позицій довідника — уточніть пошук, щоб побачити решту.`
                    : `Каталог із довідника номенклатур: ${decors.length} декорів, ${totalCount} виконань. Ціна питається за артикулом виконання.`}
              </p>
            </aside>

            {/* сітка карток */}
            <div className="flex-1 overflow-auto p-4">
              {error && !loading && (
                <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
                  <b>{error}.</b> Каталог показує лише «матеріал замовника» — його
                  можна додати руками. Решта слябів з'явиться, щойно довідник
                  відповість.
                </div>
              )}
              {loading && (
                <div className="mb-3 flex items-center gap-2 text-[13px] text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Питаю довідник номенклатур…
                </div>
              )}
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))' }}>
                {list.map((item) => (
                  <div key={item.key} style={cardStyle} onClick={() => openCard(item)}
                    className="hover:shadow-md transition-shadow">
                    {/* Фото з довідника. Немає — так і пишемо: намальований
                        «схожий» камінь у вікні вибору матеріалу вводив би в
                        оману рівно так само, як ціна з локального прайсу. */}
                    <div className="flex items-center justify-center text-center px-2 text-[11px] text-slate-400"
                      style={{
                        height: 150,
                        background: item.photo ? `url(${item.photo}) center/cover` : '#eef2f7',
                      }}>
                      {!item.photo && (item.customerOwn ? 'Матеріал замовника' : 'Фото в довіднику немає')}
                    </div>
                    <div className="px-2 py-1.5 border-t border-slate-100">
                      <div className="text-[11px] text-slate-500">
                        {item.customerOwn
                          ? 'Без артикула'
                          : `Артикулів: ${item.executions.length} · ${item.thicknesses.map((t) => `${t}`).join('/')} мм`}
                      </div>
                    </div>
                    <div className="px-2 pb-2 text-[12px] leading-snug text-slate-800">
                      {item.material}<br />{item.name}
                    </div>
                  </div>
                ))}
              </div>
              {!loading && !error && decors.length === 0 && (
                <p className="text-sm text-slate-500 mt-8 text-center">
                  У довіднику немає слябів за цими фільтрами.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── КРОК 2: картка виконання ────────────────────────────── */}
        {step === 'card' && picked && (
          <div className="flex-1 flex min-h-0">
            {/* характеристики */}
            <div className="flex-1 overflow-auto p-5">
              <div className="rounded-lg overflow-hidden border border-slate-200 mb-4 flex items-center justify-center text-center px-6"
                style={{ height: 220, background: (manualEntry ? photo : preview) ? `url(${manualEntry ? photo : preview}) center/cover` : '#f1f5f9' }}>
                {manualEntry && !photo && (
                  <span className="text-[13px] text-slate-500">
                    Фото цього листа ще не додане — кнопки «Фото 1» і «Фото 2» справа.
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-slate-700 mb-2">Основні характеристики</h3>
              <table className="w-full text-[13px] mb-4">
                <tbody>
                  {[
                    ['Тип товару', picked.material],
                    ['Артикул', pickedArticle || (isCustomerOwn ? '— матеріал замовника' : '— такого виконання в довіднику немає')],
                    ['Виробник', picked.manufacturer || '—'],
                    ['Декор', picked.name],
                    ['Назва в довіднику', execution?.title || '—'],
                    ['Виконань у довіднику', isCustomerOwn ? '—' : String(picked.executions.length)],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b border-slate-100">
                      <td className="py-1.5 text-slate-500">{k}</td>
                      <td className="py-1.5 text-right font-medium text-slate-800">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-500">
                Характеристики — з довідника номенклатур. Вологостійкість, вага
                й напрямок текстури в ньому для слябів не заведені, тому їх тут
                і немає: показувати порожні рядки як дані не варто.
              </p>
            </div>

            {/* вибір виконання */}
            <aside className="w-[330px] shrink-0 border-l border-slate-200 bg-white p-5 overflow-auto flex flex-col">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Виконання</h3>

              <label className="block text-xs text-slate-600 mb-1">Габарит</label>
              {manualEntry ? (
                /* Натуральний блок ріжуть як вийде — двох однакових слебів
                   не буває, тому розмір вводиться руками, а не обирається. */
                <div className="mb-3">
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} step={10} value={natWidth || ''}
                      onChange={(e) => setNatWidth(Number(e.target.value) || 0)}
                      className="w-full min-w-0 border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="ширина" />
                    <span className="text-slate-400 shrink-0">×</span>
                    <input type="number" min={1} step={10} value={natHeight || ''}
                      onChange={(e) => setNatHeight(Number(e.target.value) || 0)}
                      className="w-full min-w-0 border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="висота" />
                    <span className="text-xs text-slate-500 shrink-0">мм</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {isCustomerOwn ? 'Матеріалу немає в довіднику — розмір вписується руками.' : 'Натуралку міряють по факту — розмір вписується руками.'}
                  </p>
                </div>
              ) : (
                <select className="w-full mb-3 border border-slate-300 rounded px-2 py-1.5 text-sm"
                  value={sizeIndex} onChange={(e) => setSizeIndex(Number(e.target.value))}>
                  {picked.sizes.map((s, i) => <option key={`${s.width}x${s.height}`} value={i}>{s.width} × {s.height} мм</option>)}
                </select>
              )}

              <label className="block text-xs text-slate-600 mb-1">Товщина</label>
              {isCustomerOwn ? (
                <div className="flex items-center gap-2 mb-3">
                  <input type="number" min={1} step={1} value={ownThickness || ''}
                    onChange={(e) => setOwnThickness(Number(e.target.value) || 0)}
                    className="w-full min-w-0 border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="товщина" />
                  <span className="text-xs text-slate-500 shrink-0">мм</span>
                </div>
              ) : (
                <select className="w-full mb-3 border border-slate-300 rounded px-2 py-1.5 text-sm"
                  value={thickness} onChange={(e) => setThickness(Number(e.target.value))}>
                  {picked.thicknesses.map((t) => <option key={t} value={t}>{t} мм</option>)}
                </select>
              )}

              {isCustomerOwn && (
                <>
                  <label className="block text-xs text-slate-600 mb-1">Декор</label>
                  <input value={ownDecor} onChange={(e) => setOwnDecor(e.target.value)}
                    className="w-full mb-3 border border-slate-300 rounded px-2 py-1.5 text-sm"
                    placeholder="назва або опис" />
                </>
              )}

              {/* Артикул змінюється разом із товщиною — це різні
                  номенклатури 1С. Якщо на обрану товщину коду немає,
                  кажемо прямо: за чим питати ціну, нема. */}
              {isCustomerOwn ? (
                <div className="rounded-md border border-slate-300 bg-slate-100 p-3 mb-4 text-[12px] text-slate-700">
                  <b>Матеріал замовника.</b> Артикула немає — ціна за нього не
                  питається і в прорахунок він не потрапляє. Усі параметри
                  вводяться руками.
                </div>
              ) : pickedArticle ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 mb-4 text-[12px]">
                  <span className="text-slate-500">Артикул виконання: </span>
                  <b className="font-mono text-slate-800">{pickedArticle}</b>
                </div>
              ) : (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 mb-4 text-[12px] text-amber-900">
                  <b>Такого виконання в довіднику немає.</b> Цей декор заведений
                  на інші пари «габарит + товщина» — виберіть їх у списках вище.
                  Слеб можна додати і так, але ціну за ним не спитати: сервіс
                  вартості питає її за артикулом.
                </div>
              )}

              {manualEntry && (
                <>
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 mb-3 text-[12px] text-amber-900">
                    {isCustomerOwn
                      ? <><b>Фото листа.</b> Матеріалу немає в довіднику, тому знімок робиться з того листа, який привіз замовник.</>
                      : <><b>Натуральний камінь.</b> Кожен слеб унікальний — фото робиться з КОНКРЕТНОГО листа. Причепіть його тут; змінити можна потім, в інспекторі слеба.</>}
                  </div>

                  {/* Той самий механізм, що й «Додати фото» правою кнопкою на
                      слебі в розкрої: одне поле-завантажувач пише або основне
                      фото, або фото з підсвіткою. Кадр другого мусить бути
                      ІДЕНТИЧНИЙ першому — інакше при перемиканні малюнок
                      стрибне (UV-матриця не змінюється). */}
                  <input ref={photoInputRef} type="file" accept="image/*"
                    style={{ display: 'none' }} onChange={onPhotoSelected} />

                  <label className="block text-xs text-slate-600 mb-1">Фото листа</label>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {([
                      { key: 'main', label: 'Фото 1', hint: 'основне', value: photo, backlit: false },
                      { key: 'backlit', label: 'Фото 2', hint: 'з підсвіткою', value: photoBacklit, backlit: true },
                    ] as const).map((slot) => (
                      <button key={slot.key} type="button" onClick={() => pickPhoto(slot.backlit)}
                        className={`rounded border text-left overflow-hidden transition-colors ${slot.value
                          ? 'border-emerald-400 bg-emerald-50/50'
                          : 'border-dashed border-slate-300 bg-white hover:bg-slate-50'}`}>
                        <div style={{
                          height: 62,
                          background: slot.value ? `url(${slot.value}) center/cover` : '#f1f5f9',
                        }} />
                        <div className="px-2 py-1.5">
                          <div className="text-[12px] font-semibold text-slate-800">{slot.label}</div>
                          <div className={`text-[10.5px] ${slot.value ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {slot.value ? 'завантажено · змінити' : slot.hint}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-auto flex gap-2">
                <button type="button" onClick={() => setStep('catalog')}
                  className="flex-1 border border-slate-300 rounded py-2 text-sm text-slate-600 hover:bg-slate-50">
                  Назад
                </button>
                <button type="button" onClick={() => setStep('confirm')}
                  className="flex-1 rounded py-2 text-sm font-bold text-white bg-[#0084ff] hover:bg-[#006bce]">
                  Обрати слеб
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* ── КРОК 3: підтвердження ───────────────────────────────── */}
        {step === 'confirm' && picked && (() => {
          const size = manualEntry
            ? { width: Math.max(1, natWidth), height: Math.max(1, natHeight) }
            : picked.sizes[sizeIndex];
          return (
            <div className="flex-1 flex min-h-0">
              {/* що саме обрали */}
              <div className="flex-1 overflow-auto p-5">
                {manualEntry && !photo ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 mb-4 flex items-center justify-center text-center px-6"
                    style={{ height: 220 }}>
                    <span className="text-[13px] text-slate-500">
                      Фото листа не додане. Можна повернутись і причепити, або
                      додати пізніше в інспекторі слеба.
                    </span>
                  </div>
                ) : manualEntry ? (
                  <div className="rounded-lg overflow-hidden border border-slate-200 mb-4"
                    style={{ height: 220, background: `url(${photo}) center/cover` }} />
                ) : (
                  <div className="rounded-lg overflow-hidden border border-slate-200 mb-4"
                    style={{ height: 220, background: `url(${preview}) center/cover` }} />
                )}

                <h3 className="text-sm font-bold text-slate-700 mb-2">Ви обрали</h3>
                <table className="w-full text-[13px] mb-4">
                  <tbody>
                    {[
                      ['Номенклатура', execution?.title || picked.name],
                      ['Артикул', pickedArticle || (isCustomerOwn ? '— матеріал замовника' : '— такого виконання в довіднику немає')],
                      ['Тип товару', picked.material],
                      ['Виробник', picked.manufacturer || '—'],
                      ['Декор', (isCustomerOwn ? ownDecor : picked.name) || '—'],
                      ['Габарит', `${size.width} × ${size.height} мм`],
                      ['Товщина', `${isCustomerOwn ? ownThickness : thickness} мм`],
                      ...(manualEntry ? [['Фото листа', photo ? (photoBacklit ? 'основне + з підсвіткою' : 'основне') : 'не додане']] : []),
                    ].map(([k, v]) => (
                      <tr key={k} className="border-b border-slate-100">
                        <td className="py-1.5 text-slate-500">{k}</td>
                        <td className="py-1.5 text-right font-medium text-slate-800">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-slate-500">
                  Номенклатура — з довідника, ціна за артикулом — з 1С.
                </p>
              </div>

              {/* ціна і кількість */}
              <aside className="w-[330px] shrink-0 border-l border-slate-200 bg-white p-5 overflow-auto flex flex-col">
                <h3 className="text-sm font-bold text-slate-700 mb-3">Скільки додати</h3>

                {/* Ціна за лист — з 1С за артикулом (getDiscountPrice), той
                    самий прайс, за яким виписується рахунок. Вигадувати її
                    не можна: нуль чесніший за правдоподібне число, тому під
                    ним завжди стоїть причина, чому він нуль. */}
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 mb-4">
                  <div className="text-xs text-slate-500 mb-1">Ціна за {priceUnit || 'лист'}</div>
                  <div className="text-2xl font-bold text-slate-800 tabular-nums">
                    {priceLoading && pickedArticle
                      ? <span className="text-base font-normal text-slate-400">рахує 1С…</span>
                      : <>{slabPrice.toFixed(2)} <span className="text-sm font-normal text-slate-500">грн</span></>}
                  </div>
                  {/* Разом показуємо ТІЛЬКИ коли 1С порахувала за лист:
                      множити ціну за м² на кількість листів не можна. */}
                  {!priceLoading && slabPrice > 0 && quantity > 1 && !manualEntry && /лист/i.test(priceUnit || 'лист') && (
                    <div className="mt-1 text-[12px] text-slate-600 tabular-nums">
                      За {quantity} лист{quantity < 5 ? 'и' : 'ів'} — <b>{(slabPrice * quantity).toFixed(2)} грн</b>
                    </div>
                  )}
                  {!priceLoading && (!pickedArticle || slabPrice <= 0 || !hasContragent) && (
                    <div className="mt-1.5 text-[11px] leading-snug text-amber-700">
                      {!pickedArticle
                        ? `Габариту ${size.width}×${size.height} на ${thickness} мм у довіднику немає — питати ціну нема за чим.`
                        : priceFailed
                          ? '1С не відповіла — ціну показати нема з чого.'
                          : priceMissing
                            ? 'За цим артикулом 1С ціни не дала: його немає в прайсі філії.'
                            : !hasContragent
                              ? 'Контрагента не вибрано — це ціна за ЗАГАЛЬНИМ прайсом, без знижки клієнта.'
                              : ''}
                    </div>
                  )}
                </div>

                {manualEntry ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 mb-4 text-[12px] text-amber-900">
                    <b>По одному листу.</b> Кожен слеб
                    має власний малюнок, і підбір текстури робиться саме по
                    ньому, тому кількість тут не питається.
                  </div>
                ) : (
                  <>
                    <label className="block text-xs text-slate-600 mb-1">Кількість листів</label>
                    <div className="flex items-center gap-2 mb-4">
                      <button type="button" aria-label="менше"
                        onClick={() => setQuantity((n) => Math.max(1, n - 1))}
                        className="w-9 h-9 shrink-0 border border-slate-300 rounded text-lg leading-none text-slate-600 hover:bg-slate-50">−</button>
                      <input type="number" min={1} step={1} value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                        className="flex-1 min-w-0 border border-slate-300 rounded px-2 py-1.5 text-sm text-center" />
                      <button type="button" aria-label="більше"
                        onClick={() => setQuantity((n) => n + 1)}
                        className="w-9 h-9 shrink-0 border border-slate-300 rounded text-lg leading-none text-slate-600 hover:bg-slate-50">+</button>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-4">
                      Додасться {quantity} однакових листів, кожен зі своїм
                      серійним номером.
                    </p>
                  </>
                )}

                <div className="mt-auto flex gap-2">
                  <button type="button" onClick={() => setStep('card')}
                    className="flex-1 border border-slate-300 rounded py-2 text-sm text-slate-600 hover:bg-slate-50">
                    Назад
                  </button>
                  <button type="button" onClick={confirm}
                    className="flex-1 rounded py-2 text-sm font-bold text-white bg-[#28a745] hover:bg-[#218838]">
                    Додати слеб
                  </button>
                </div>
              </aside>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
