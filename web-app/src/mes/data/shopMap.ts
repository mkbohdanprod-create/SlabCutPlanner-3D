/**
 * КАРТА ЦЕХУ 202 — дані (06.09.2026). Насіння `ПАСПОРТ_ДІЛЯНОК.json` з
 * плану MES (12_ВИРОБНИЦТВО_І_МЕС/04_ПЛАН_MES_ФУНДАМЕНТ_04-09.md, E1).
 *
 * [ФАКТ, скрін власника 06.09] розкладка і назви — з «Карти виробництва»
 * Smart MES v2.0: верхній ряд — ручні ділянки, під ними — їхні буфери,
 * нижній ряд — верстати (Порізка = Breton, Порізка 2 = Combicut,
 * Фрезерування = Фрезер ЧПУ 1, Фрезерування 2 — порожня, Поліровка
 * станок), ліворуч — Черга на складі, праворуч — Panda, ВТК, буфери
 * пакування і монтажу. Окремої ділянки «Порізка водою» на карті НЕМАЄ —
 * вода йде на пилах (у симуляторі це окрема колонка, прив'язана до
 * Combicut — ГІПОТЕЗА).
 * [ФАКТ] моделі верстатів — бланк обліку (03_БЛАНК_ОБЛІКУ_РОЗБІР) і
 * ЛОГІКА_ОБРОБОК. [ГІПОТЕЗА] розміри в метрах і кількість столів — поки
 * Саша не виправить. Об'єкти, яких на карті прототипу немає, але є в
 * правилах або в переліку буферів (підбір текстури ВЦ-10, зона
 * комплектації, готова продукція, сортувальна піраміда), позначені
 * статусом ГІПОТЕЗА. Координати: x — уздовж потоку, y — углиб цеху.
 */
export type AreaType = 'machine' | 'manual' | 'buffer' | 'control' | 'store' | 'zone';
export type AreaModel = 'combicut' | 'nc300' | 'waterjet' | 'saw2' | 'panda' | 'wanlong' | 'table' | 'wet' | 'frames' | 'trolleys' | 'cassette' | 'pyramid' | 'floor';
export type AreaStatus = 'ФАКТ' | 'ГІПОТЕЗА' | 'ПИТАННЯ';

export interface ShopArea {
  id: string;
  /** Етап ВЦ-1: 1 сировина · 2 різ · 3 кромка і площина · 4 доведення · 5 здача */
  st: 1 | 2 | 3 | 4 | 5;
  name: string;
  type: AreaType;
  model: AreaModel;
  x: number; y: number; w: number; d: number;
  /** Кількість столів / пірамід / тур у групі. */
  n?: number;
  gear: string;
  /** Кодів послуг на ділянці за 02_ПОСЛУГИ_НА_ДІЛЯНКАХ. */
  services?: number;
  rules: string[];
  status: AreaStatus;
  q: string;
}
export interface ShopStage { n: number; name: string; x0: number; x1: number }
export interface ReverseEdge { a: string; b: string; label: string }

export const HALL = { w: 70, d: 24 };
/** Етапи ВЦ-1 як смуги по x — на карті прототипу етапів немає, це наша шкала для читання. */
export const STAGES: ShopStage[] = [
  { n: 1, name: 'СИРОВИНА', x0: 0, x1: 11.5 },
  { n: 2, name: 'РІЗ', x0: 12, x1: 25 },
  { n: 3, name: 'КРОМКА І ПЛОЩИНА', x0: 25.5, x1: 43 },
  { n: 4, name: 'ДОВЕДЕННЯ', x0: 43.5, x1: 56 },
  { n: 5, name: 'ЗДАЧА', x0: 56.5, x1: 70 },
];

// Ряди як на карті прототипу: y ≈1–5 ручні ділянки · y ≈7.5–11.5 буфери · y ≈14.5–21 верстати
const R1 = 1, R2 = 7.5, R3 = 14.5;

export const AREAS: ShopArea[] = [
  // ---- ліва колонка: склад
  { id: 'q_store', st: 1, name: 'Черга на складі', type: 'buffer', model: 'frames', x: 0.5, y: R1, w: 5, d: 19, n: 3,
    gear: 'піраміди (А-рами) під листи; черга заявок від WMS', rules: ['ВЦ-1', 'МЕС-4'], status: 'ФАКТ', q: 'скільки пірамід і місць' },
  { id: 'b_work', st: 1, name: 'Буфер в роботу', type: 'buffer', model: 'trolleys', x: 6.5, y: R1, w: 4.5, d: 2.2, n: 2, gear: 'тури з листами, віддані в роботу', rules: ['ВЦ-1'], status: 'ФАКТ', q: '«тура» — місткість' },
  { id: 'check', st: 1, name: 'Перевірка матеріалу', type: 'control', model: 'table', x: 6.5, y: 4.2, w: 4.5, d: 1.6, gear: 'стіл: якість, бій, фактичний розмір слеба (ВЦ-26)', rules: ['ВЦ-1', 'ВЦ-26'], status: 'ФАКТ', q: 'ділянка чи стан без людей' },
  { id: 'texture', st: 1, name: 'Підбір текстури', type: 'control', model: 'table', x: 6.5, y: 12, w: 4.5, d: 1.4, gear: 'фото слебів, «Перехід текстури» — не на карті прототипу', rules: ['ВЦ-10'], status: 'ГІПОТЕЗА', q: 'окремий стан для MES чи частина перевірки' },
  { id: 'b_cut', st: 2, name: 'Буфер порізки', type: 'buffer', model: 'trolleys', x: 6.5, y: R2, w: 4.5, d: 3.5, n: 2, gear: 'тури з заготовками після пил', rules: ['ВЦ-1'], status: 'ФАКТ', q: 'місткість' },
  // ---- нижній ряд: верстати
  { id: 'saw1', st: 2, name: 'Порізка · Breton', type: 'machine', model: 'combicut', x: 6.5, y: R3, w: 7, d: 5, gear: 'мостова пила Breton (на карті прототипу — «Breton»)', services: 16, rules: ['ВЦ-1', 'ВЦ-16', 'МЕС-1'], status: 'ФАКТ', q: 'яка саме модель — Combicut чи Trinity (диск 400 + подвійний waterjet + шпиндель)?' },
  { id: 'nc1', st: 3, name: 'Фрезерування · ЧПУ 1', type: 'machine', model: 'nc300', x: 14.5, y: R3, w: 6.5, d: 4.2, gear: 'Contourbreton NC300 EVO: 4 осі, стіл 3000×1600 (ФАКТ ТУ), магазин ISO 40; кромка, чверті, свердління, калібрування', services: 38, rules: ['ВЦ-17', 'ВЦ-19', 'МЕС-1'], status: 'ФАКТ', q: '' },
  { id: 'saw2', st: 2, name: 'Порізка 2 · Combicut', type: 'machine', model: 'combicut', x: 22, y: R3, w: 7, d: 5, gear: 'Breton Combicut: диск + вода на одному векторі (комбінована порізка, отвори, підрізка водою)', services: 16, rules: ['ВЦ-1', 'МЕС-1', 'ПС-23'], status: 'ФАКТ', q: 'уся вода тут? (у прототипі окремої ділянки води немає)' },
  { id: 'nc2', st: 3, name: 'Фрезерування 2', type: 'machine', model: 'nc300', x: 30, y: R3, w: 6.5, d: 4.2, gear: 'на карті прототипу ділянка є, верстата в ній немає', rules: ['ВЦ-1'], status: 'ПИТАННЯ', q: 'план на другу ЧПК чи резервне місце' },
  { id: 'wanlong', st: 4, name: 'Поліровка станок', type: 'machine', model: 'wanlong', x: 37.5, y: R3, w: 10, d: 2.6, gear: 'Wanlong MS 3000: прохідний полірувальник тилу — стрічка + ряд головок', services: 5, rules: ['МЕС-1', 'ВЦ-1'], status: 'ФАКТ', q: 'скільки головок; півкомплект/повний — різні проходи?' },
  // ---- верхній ряд: ручні ділянки, під ними буфери
  { id: 'sinks', st: 3, name: 'Поклейка мийки', type: 'manual', model: 'table', x: 12, y: R1, w: 5.5, d: 2, n: 2, gear: 'склейка чаші, трапік, фарбування, вклейка', services: 15, rules: ['ВЦ-3', 'ВЦ-7', 'ПС-12'], status: 'ФАКТ', q: 'скільки майстрів' },
  { id: 'b_mill', st: 3, name: 'Буфер фрезерування', type: 'buffer', model: 'trolleys', x: 12, y: R2, w: 2.6, d: 4, n: 1, gear: 'тура до/після ЧПК; сюди ж повернення ВЦ-7/ВЦ-18', rules: ['ВЦ-7', 'ВЦ-18'], status: 'ФАКТ', q: 'одна черга на два заходи?' },
  { id: 'b_sink', st: 3, name: 'Буфер мийки', type: 'buffer', model: 'trolleys', x: 15, y: R2, w: 2.6, d: 4, n: 1, gear: 'тура', rules: [], status: 'ФАКТ', q: '' },
  { id: 'glue', st: 3, name: 'Поклейка крайки (опусків)', type: 'manual', model: 'table', x: 18.5, y: R1, w: 5.5, d: 2, n: 2, gear: 'опуск, підворот, облицювання, стик з підворотом', services: 15, rules: ['МЕС-1', 'КП-4'], status: 'ФАКТ', q: 'сушка клею — де і скільки' },
  { id: 'b_glue', st: 3, name: 'Буфер поклейки крайки', type: 'buffer', model: 'trolleys', x: 18.5, y: R2, w: 2.6, d: 4, n: 1, gear: 'тура', rules: [], status: 'ФАКТ', q: '' },
  { id: 'b_grind', st: 3, name: 'Буфер шліфування', type: 'buffer', model: 'trolleys', x: 21.5, y: R2, w: 2.6, d: 4, n: 1, gear: 'тура', rules: [], status: 'ФАКТ', q: '' },
  { id: 'grind', st: 3, name: 'Ділянка Шліфування', type: 'manual', model: 'wet', x: 25, y: R1, w: 5.5, d: 1.8, n: 3, gear: 'мокрі столи: техфаска, 2×2, R2, пропили, зведення фаски, стики («Ділянка фаски» окремо на карті прототипу не стоїть)', services: 23, rules: ['ВЦ-1', 'ВЦ-17', 'МЕС-1'], status: 'ФАКТ', q: 'скільки столів; фаска — ті самі люди?' },
  { id: 'b_ply', st: 3, name: 'Буфер вклейки фанери', type: 'buffer', model: 'trolleys', x: 25, y: R2, w: 2.6, d: 4, n: 1, gear: 'тура', rules: [], status: 'ФАКТ', q: '' },
  { id: 'polish', st: 4, name: 'Ділянка Полірування', type: 'manual', model: 'wet', x: 31.5, y: R1, w: 5.5, d: 1.8, n: 2, gear: 'ручне: «Антик», доводка після станка', rules: ['МЕС-1'], status: 'ФАКТ', q: 'чим відрізняється від «Поліровка станок»' },
  { id: 'b_base', st: 4, name: 'Буфер замовлень у базовій товщині', type: 'buffer', model: 'frames', x: 28.5, y: R2, w: 4.5, d: 4, n: 2, gear: 'піраміда', rules: [], status: 'ФАКТ', q: '' },
  { id: 'ply', st: 3, name: 'Ділянка Вклейки Фанери', type: 'manual', model: 'table', x: 38, y: R1, w: 5.5, d: 2, n: 2, gear: 'цільна фанера, каркас з бруса, короб, WEDI, фарбування', services: 15, rules: ['КП-1', 'КП-8'], status: 'ФАКТ', q: 'де ріжуть фанеру' },
  { id: 'b_cosm', st: 5, name: 'Буфер Косметики', type: 'buffer', model: 'trolleys', x: 34, y: R2, w: 4.5, d: 4, n: 2, gear: 'тури', rules: [], status: 'ФАКТ', q: '' },
  { id: 'base', st: 4, name: 'Ділянка Базових стільниць', type: 'manual', model: 'table', x: 44.5, y: R1, w: 6, d: 2, n: 2, gear: 'складські позиції базової товщини', rules: ['ВЦ-1'], status: 'ПИТАННЯ', q: 'що тут робиться — ділянка чи склад' },
  { id: 'b_pol', st: 4, name: 'Буфер полірування', type: 'buffer', model: 'trolleys', x: 41, y: R2, w: 4.5, d: 3.5, n: 2, gear: 'тури', rules: [], status: 'ФАКТ', q: '' },
  { id: 'cosm', st: 5, name: 'Косметика', type: 'manual', model: 'table', x: 51.5, y: R1, w: 5.5, d: 2, n: 2, gear: 'фінішна чистка, плівка на монтаж', services: 6, rules: ['МЕС-1', 'ВЦ-25'], status: 'ФАКТ', q: '' },
  { id: 'vtk', st: 5, name: 'ВТК', type: 'control', model: 'table', x: 48, y: R2, w: 4.5, d: 2.5, gear: 'контроль перед пакуванням', rules: ['ВЦ-1'], status: 'ФАКТ', q: 'хто підписує — стан чи ділянка' },
  { id: 'b_panda', st: 4, name: 'Буфер PANDA', type: 'buffer', model: 'frames', x: 58, y: R1, w: 3, d: 5, n: 1, gear: 'піраміда під тонкі листи', rules: [], status: 'ФАКТ', q: '' },
  { id: 'panda', st: 4, name: 'Panda', type: 'machine', model: 'panda', x: 62, y: R1, w: 1.8, d: 8, gear: 'прохідний кромкувальник: тонкий керамограніт 4–12 мм, чистовий 45°, AR/ZS', services: 13, rules: ['ВЦ-1'], status: 'ФАКТ', q: 'кварцит 20 теж (AR20/ZS20 без полірування)?' },
  { id: 'b_pack', st: 5, name: 'Буфер пакування', type: 'buffer', model: 'trolleys', x: 58, y: 9.5, w: 5.5, d: 3.5, n: 2, gear: 'тури; пакування на монтаж / на переміщення робиться тут (ВЦ-25)', rules: ['ВЦ-25', 'МЕС-1'], status: 'ФАКТ', q: 'окремі люди чи косметика' },
  { id: 'kit', st: 5, name: 'Зона комплектації', type: 'zone', model: 'floor', x: 50, y: R3, w: 6, d: 4, gear: 'збір усіх деталей замовлення — не на карті прототипу, є в переліку буферів', rules: ['ВЦ-1', 'МЕС-6'], status: 'ГІПОТЕЗА', q: 'де зустрічається метал' },
  { id: 'b_mount', st: 5, name: 'Буфер Монтаж', type: 'buffer', model: 'trolleys', x: 58, y: R3, w: 5.5, d: 4, n: 2, gear: 'тури під завантаження на монтаж (короб / піраміда в авто)', rules: ['ВЦ-2', 'ВЦ-24'], status: 'ФАКТ', q: '' },
  { id: 'ready', st: 5, name: 'Готова продукція', type: 'store', model: 'cassette', x: 64.5, y: R3, w: 5, d: 6, gear: 'касетний склад — у переліку прототипу, на карті не показаний', rules: ['ВЦ-1'], status: 'ГІПОТЕЗА', q: 'касет' },
  { id: 'sortpyr', st: 5, name: 'Сортувальна піраміда', type: 'buffer', model: 'pyramid', x: 64.5, y: 7.5, w: 5, d: 4, n: 1, gear: 'у переліку прототипу, на карті не показана', rules: [], status: 'ГІПОТЕЗА', q: 'місць' },
];

export const FLOW = ['q_store', 'check', 'b_work', 'saw1', 'b_cut', 'nc1', 'b_mill', 'sinks', 'grind', 'wanlong', 'polish', 'cosm', 'vtk', 'b_pack', 'b_mount'];
export const BRANCH: Array<[string, string]> = [['b_work', 'saw2'], ['saw2', 'b_cut'], ['nc1', 'glue'], ['nc1', 'ply'], ['glue', 'grind'], ['ply', 'grind'], ['b_cut', 'panda'], ['panda', 'cosm'], ['vtk', 'kit'], ['kit', 'b_pack'], ['b_mount', 'ready']];
export const REVERSE: ReverseEdge[] = [
  { a: 'sinks', b: 'nc1', label: 'ВЦ-7' },
  { a: 'nc1', b: 'saw1', label: 'ВЦ-18' },
  { a: 'b_mount', b: 'saw1', label: 'ВЦ-5' },
];
