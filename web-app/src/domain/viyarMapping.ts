// =====================================================================
//  src/domain/viyarMapping.ts
//  Прив'язки виробничих фактів до КОДІВ ВіярПро/1С.
//
//  Вбудований набір правил (serviceMapping.ts) вказує на внутрішні
//  послуги застосунку — CUT_STRAIGHT, CUT_WATERJET тощо. Через це в
//  кошторисі стояли внутрішні коди, а не 195300 і 195304, навіть після
//  того, як довідник ВіярПро підвантажено в каталог.
//
//  Тут — другий набір, який вказує на реальні облікові коди. Він
//  роздвоєний за матеріалом, як і сама номенклатура: та сама операція
//  має різний код на керамограніт і на кварцит.
//
//  ВАЖЛИВО: у коробці всі ці правила ВИМКНЕНІ. Вмикає їх керівник
//  кнопкою «Перевести на коди ВіярПро» — бо частина прив'язок є
//  трактуванням, а не фактом із прайсу, і її треба звірити. Ті, що
//  трактування, позначені в `note`.
// =====================================================================

import type { MappingRule } from './serviceMapping';

const R = (
  id: string,
  factKind: MappingRule['factKind'],
  serviceId: string,
  material: MappingRule['material'],
  extra: Partial<MappingRule> = {},
): MappingRule => ({
  id,
  factKind,
  serviceId,
  material,
  multiplier: 1,
  enabled: false,
  source: 'builtin',
  ...extra,
});

export const VIYAR_MAPPING_RULES: MappingRule[] = [
  // ── Керамограніт ───────────────────────────────────────────────────
  R('viyar:saw_cut:ceramic', 'saw_cut', '195300', 'Керамограніт',
    { note: '195300 Прямолінійна порізка пилою під 90°' }),
  R('viyar:waterjet:ceramic', 'waterjet_cut', '195304', 'Керамограніт',
    { note: '195304 Криволінійна порізка водою — «довжина зовнішніх радіусів і кутів»' }),
  R('viyar:cutout:ceramic', 'cutout_perimeter', '195304', 'Керамограніт',
    { note: '195304 — «периметр внутрішніх вирізів»' }),
  R('viyar:hole_small:ceramic', 'hole_small', '195310', 'Керамограніт',
    { note: '195310 Різ водою отворів <100 мм' }),
  R('viyar:hole_large:ceramic', 'hole_large', '195311', 'Керамограніт',
    { note: '195311 Різ водою отворів >100 мм' }),
  R('viyar:joint_lt500:ceramic', 'joint_count', '195361', 'Керамограніт',
    { variant: 'lt500', multiplier: 2, note: '195361 Пропил для стику до 500 мм, ×2 за прайсом' }),
  R('viyar:joint_gt500:ceramic', 'joint_count', '195362', 'Керамограніт',
    { variant: 'gt500', multiplier: 2, note: '195362 Пропил для стику від 500 мм, ×2 за прайсом' }),
  R('viyar:edge_d12:ceramic', 'edge', '219964', 'Керамограніт',
    { variant: 'd_12', note: '219964 Фрезерування крайки D12' }),
  R('viyar:edge_r2:ceramic', 'edge', '219960', 'Керамограніт',
    { variant: 'r2_top', note: '219960 Фрезерування крайки R2' }),
  R('viyar:edge_r2_tb:ceramic', 'edge', '219960', 'Керамограніт',
    { variant: 'r2_top_bottom', multiplier: 2, note: 'ТРАКТУВАННЯ: R2 зверху і знизу = дві сторони' }),
  R('viyar:edge_45:ceramic', 'edge', '195350', 'Керамограніт',
    { variant: 'chamfer_45_r2', note: '195350 Фрезування крайки 45°' }),
  R('viyar:edge_shark:ceramic', 'edge', '195350', 'Керамограніт',
    { variant: 'sharknose', note: 'ТРАКТУВАННЯ: sharknose виконується різом під 45°' }),
  R('viyar:pack:ceramic', 'detail_area', '219969', 'Керамограніт',
    { note: '219969 Пакування в короб — «всіх замовлень через ВіярПро»' }),

  // ── Кварцит ────────────────────────────────────────────────────────
  R('viyar:saw_cut:quartz', 'saw_cut', '219977', 'Кварцит',
    { note: '219977 Порізка кварциту' }),
  R('viyar:waterjet:quartz', 'waterjet_cut', '195666', 'Кварцит',
    { note: '195666 Криволінійна порізка водою (Combicat)' }),
  R('viyar:cutout:quartz', 'cutout_perimeter', '219981', 'Кварцит',
    { note: 'ТРАКТУВАННЯ: 219981 Прямокутний наскрізний виріз; для складних форм — 219982' }),
  R('viyar:hole_small:quartz', 'hole_small', '219979', 'Кварцит',
    { note: '219979 Отвір малий' }),
  R('viyar:hole_large:quartz', 'hole_large', '219980', 'Кварцит',
    { note: '219980 Отвір великий' }),
  R('viyar:joint_lt500:quartz', 'joint_count', '195694', 'Кварцит',
    { variant: 'lt500', multiplier: 2, note: '195694 Пропил для стику до 500 мм, ×2 за прайсом' }),
  R('viyar:joint_gt500:quartz', 'joint_count', '195695', 'Кварцит',
    { variant: 'gt500', multiplier: 2, note: '195695 Пропил для стику від 500 мм, ×2 за прайсом' }),
  R('viyar:edge_r2:quartz', 'edge', '242510', 'Кварцит',
    { variant: 'r2_top', note: '242510 Фрезерування крайки R2 (Кварцит)' }),
  R('viyar:edge_r2_tb:quartz', 'edge', '242510', 'Кварцит',
    { variant: 'r2_top_bottom', multiplier: 2, note: 'ТРАКТУВАННЯ: R2 зверху і знизу = дві сторони' }),
  R('viyar:edge_45:quartz', 'edge', '195685', 'Кварцит',
    { variant: 'chamfer_45_r2', note: '195685 Фрезування крайки 45° (Кварцит)' }),
  R('viyar:edge_shark:quartz', 'edge', '195685', 'Кварцит',
    { variant: 'sharknose', note: 'ТРАКТУВАННЯ: sharknose виконується різом під 45°' }),
  R('viyar:pack:quartz', 'detail_area', '219998', 'Кварцит',
    { note: '219998 Пакування в короб (Кварцит)' }),
];

/**
 * Внутрішні правила, які довелося б вимкнути при переході на коди —
 * інакше та сама робота порахується двічі: раз внутрішньою послугою,
 * раз обліковою.
 *
 * Матеріал і монтаж сюди НЕ входять: у прайсі ВіярПро немає ані
 * вартості каменю, ані монтажу — це не послуги цеху.
 */
export const INTERNAL_RULES_REPLACED_BY_VIYAR = [
  'saw_cut→CUT_STRAIGHT',
  'waterjet_cut→CUT_WATERJET',
  'cutout_perimeter→CUT_WATERJET',
  'hole_small→CUTOUT_HOLE',
  'hole_large→HOLE_LARGE',
  'joint_count:lt500→JOINT_SAWCUT',
  'joint_count:gt500→JOINT_SAWCUT',
  'edge:d_12→EDGE_D12',
  'edge:r2_top→EDGE_ROUND',
  'edge:r2_top_bottom→EDGE_ROUND',
  'edge:chamfer_45_r2→CUT_45',
  'edge:chamfer_45_r2→EDGE_ROUND',
  'edge:sharknose→CUT_45',
  'edge:sharknose→EDGE_POLISH',
];

/** Скільки прив'язок до кодів у наборі */
export const VIYAR_MAPPING_COUNT = VIYAR_MAPPING_RULES.length;

/**
 * Факти, для яких у прайсі ВіярПро прямого відповідника немає.
 * Показуємо керівнику чесно, щоб він знав, що добити руками.
 */
export const VIYAR_UNMAPPED_FACTS = [
  'Оброблений кут — у прайсі керамограніту окремої позиції немає, довжина радіуса вже входить у 195304',
  'Довжина стику (склейка) — у прайсі цеху її немає, це монтажна робота',
  'Ручна доводка торця — найближче 195381 «Завершення фаски і торця», але воно в штуках, а не метрах',
  'Матеріал і монтаж — у прайсі ВіярПро відсутні, лишаються на внутрішніх послугах',
];
