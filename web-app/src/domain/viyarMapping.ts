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
  R('viyar:joint45_cut:ceramic', 'joint_length', '195303', 'Керамограніт',
    { variant: 'miter45', multiplier: 2, note: '195303 Порізка пилою під кутом — різ на обох деталях стику, ×2' }),
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
  R('viyar:joint45_cut:quartz', 'joint_length', '195665', 'Кварцит',
    { variant: 'miter45', multiplier: 2, note: '195665 Порізка пилою під кутом — різ на обох деталях стику, ×2' }),
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

  // ── Виробничі профілі торців → облікові коди ───────────────────────
  //  Серія 12 — керамограніт, серія 20 — кварцит; AR20 і ZS20 мають
  //  коди на ОБОХ матеріалах (PANDA-прайс 2026), тому по два правила.
  R('viyar:edge_ar12:ceramic', 'edge', '219959', 'Керамограніт', { variant: 'ar_12', note: '219959 Фрезерування крайки AR12' }),
  R('viyar:edge_t12:ceramic', 'edge', '219963', 'Керамограніт', { variant: 't_12', note: '219963 Фрезерування крайки T12' }),
  R('viyar:edge_z12:ceramic', 'edge', '219966', 'Керамограніт', { variant: 'z_12', note: '219966 Фрезерування крайки Z (для стику)' }),
  R('viyar:edge_zs12:ceramic', 'edge', '219961', 'Керамограніт', { variant: 'zs_12', note: '219961 Фрезерування крайки ZS12' }),
  R('viyar:edge_45:ceramic', 'edge', '195350', 'Керамограніт', { variant: 'edge_45', note: '195350 Фрезування крайки 45°' }),
  R('viyar:edge_zs4:ceramic', 'edge', '203090', 'Керамограніт', { variant: 'zs_4', note: '203090 Кромка ZS4 (1.5×1.5), PANDA' }),
  R('viyar:edge_zs6_15:ceramic', 'edge', '203092', 'Керамограніт', { variant: 'zs_6_15', note: '203092 Кромка ZS6 (1.5×1.5), PANDA' }),
  R('viyar:edge_zs6_3:ceramic', 'edge', '203096', 'Керамограніт', { variant: 'zs_6_3', note: '203096 Кромка ZS6 (3×3), PANDA' }),
  R('viyar:edge_ar20:ceramic', 'edge', '203099', 'Керамограніт', { variant: 'ar_20', note: '203099 Кромка AR20 на керамограніті, PANDA' }),
  R('viyar:edge_zs20:ceramic', 'edge', '203100', 'Керамограніт', { variant: 'zs_20', note: '203100 Кромка ZS20 на керамограніті, PANDA' }),

  R('viyar:edge_ar20:quartz', 'edge', '219991', 'Кварцит', { variant: 'ar_20', note: '219991 Фрезерування крайки AR20' }),
  R('viyar:edge_d20:quartz', 'edge', '242507', 'Кварцит', { variant: 'd_20', note: '242507 Фрезерування крайки D20' }),
  R('viyar:edge_h40:quartz', 'edge', '242508', 'Кварцит', { variant: 'h_40', note: '242508 Фрезерування крайки H40' }),
  R('viyar:edge_r10:quartz', 'edge', '242509', 'Кварцит', { variant: 'r_10', note: '242509 Фрезерування крайки R10' }),
  R('viyar:edge_r3:quartz', 'edge', '219992', 'Кварцит', { variant: 'r_3', note: '219992 Фрезерування крайки R3' }),
  R('viyar:edge_r5:quartz', 'edge', '242511', 'Кварцит', { variant: 'r_5', note: '242511 Фрезерування крайки R5' }),
  R('viyar:edge_t20:quartz', 'edge', '219994', 'Кварцит', { variant: 't_20', note: '219994 Фрезерування крайки T20' }),
  R('viyar:edge_xd20:quartz', 'edge', '219995', 'Кварцит', { variant: 'xd_20', note: '219995 Фрезерування крайки XD20' }),
  R('viyar:edge_z20:quartz', 'edge', '242512', 'Кварцит', { variant: 'z_20', note: '242512 Фрезерування крайки Z20' }),
  R('viyar:edge_zs20:quartz', 'edge', '219993', 'Кварцит', { variant: 'zs_20', note: '219993 Фрезерування крайки ZS20' }),
  R('viyar:edge_45:quartz', 'edge', '195685', 'Кварцит', { variant: 'edge_45', note: '195685 Фрезування крайки 45°' }),
  R('viyar:edge_antik:quartz', 'edge', '195717', 'Кварцит', { variant: 'antik', note: '195717 Обробка крайки «Антик»' }),
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
  // різ під 45° на стику переходить на 195303/195665
  'joint:miter45→CUT_45',
  // Оброблені кути НЕ мають окремого коду в прайсі: дуга радіуса і
  // діагональ зрізу вже входять у МЕТРИ криволінійної порізки (195304:
  // «довжина зовнішніх радіусів і кутів»). Лишити внутрішній рядок у
  // штуках означало б узяти гроші за той самий кут двічі.
  'corner:radius→CORNER_RADIUS',
  'corner:chamfer→CORNER_CHAMFER',
  'corner:l-cut→CORNER_CHAMFER',
  // виробничі профілі: внутрішня ціна поступається обліковому коду
  'edge:ar_12→EDGE_PROFILE_MILL',
  'edge:t_12→EDGE_PROFILE_MILL',
  'edge:z_12→EDGE_PROFILE_MILL',
  'edge:zs_12→EDGE_PROFILE_MILL',
  'edge:zs_4→EDGE_PROFILE_MILL',
  'edge:zs_6_15→EDGE_PROFILE_MILL',
  'edge:zs_6_3→EDGE_PROFILE_MILL',
  'edge:ar_20→EDGE_PROFILE_MILL',
  'edge:d_20→EDGE_PROFILE_MILL',
  'edge:h_40→EDGE_PROFILE_MILL',
  'edge:r_10→EDGE_PROFILE_MILL',
  'edge:r_3→EDGE_PROFILE_MILL',
  'edge:r_5→EDGE_PROFILE_MILL',
  'edge:t_20→EDGE_PROFILE_MILL',
  'edge:xd_20→EDGE_PROFILE_MILL',
  'edge:z_20→EDGE_PROFILE_MILL',
  'edge:zs_20→EDGE_PROFILE_MILL',
  'edge:edge_45→EDGE_PROFILE_MILL',
  'edge:antik→EDGE_PROFILE_MILL',
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
