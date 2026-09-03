import type { Project, ReferenceData } from './types';
import { CURRENT_PROJECT_FORMAT_VERSION } from './projectMigrations';

/**
 * Матеріали, які пропонуються В РОБОТУ (рішення власника 26.08.2026).
 *
 * Компакт-плити тут немає: у програмі її більше не буде. Але зі списку
 * `referenceData.materials` нижче вона НЕ прибрана навмисно — імпорт
 * бланка погодження кодує матеріал ПОРЯДКОВИМ НОМЕРОМ у тому списку
 * (див. approvalImport.ts), і зсув індексів мовчки перетворив би один
 * матеріал на інший у вже збережених документах.
 *
 * Тобто: обирати не можна, читати старе — можна.
 */
export const MATERIALS_IN_USE: ReferenceData['materials'] = [
  'Керамограніт', 'Кварцит', 'Натуральний камінь', 'Акрил',
];

export const referenceData: ReferenceData = {
  materials: ['Керамограніт', 'Кварцит', 'Натуральний камінь', 'Акрил', 'Компакт-плита'],
  detailTypes: ['Стільниця', 'Стінова панель', 'Мийка', 'Фасад', 'Опора', 'Довільний елемент', 'Металопрокат'],
  detailShapes: ['Прямокутна', 'Г-подібна', 'П-подібна', 'Кругла', 'Овальна'],
  slabSizes: [
    { width: 3200, height: 1600 },
    { width: 3000, height: 1400 },
    { width: 3000, height: 2000 },
  ],
  thicknesses: [12, 20, 30, 40],
  serviceParams: { defaultMinMargin: 10, roundingDecimals: 3, sawOvercut: 70 },
  edgeProfiles: [
    { id: 'polished_straight', label: 'Пряма полірована кромка', shortLabel: 'Полір.', description: 'Straight edge', allowance: 0, operations: [{ serviceId: 'EDGE_POLISH', multiplier: 1 }] },
    { id: 'chamfer_2x2', label: 'Фаска 2×2', shortLabel: 'Фаска 2×2', description: 'фаска зверху 2 мм', allowance: 2.5, operations: [{ serviceId: 'EDGE_BEVEL', multiplier: 1 }] },
    { id: 'chamfer_2x2_top_bottom', label: 'Фаска 2×2 верх/низ', shortLabel: '2×2 в/н', description: 'фаска зверху і знизу', allowance: 2.5, operations: [{ serviceId: 'EDGE_BEVEL', multiplier: 2 }] },
    { id: 'r2_top', label: 'R2 верх', shortLabel: 'R2', description: 'радіус 2 мм зверху', allowance: 2.5, operations: [{ serviceId: 'EDGE_ROUND', multiplier: 1 }] },
    { id: 'r2_top_bottom', label: 'R2 верх/низ', shortLabel: 'R2 в/н', description: 'радіус 2 мм зверху і знизу', allowance: 2.5, operations: [{ serviceId: 'EDGE_ROUND', multiplier: 2 }] },
    { id: 'chamfer_45_r2', label: 'Фаска 45° з R2', shortLabel: '45° R2', description: 'скошена кромка 45° з мікрорадіусом', allowance: 0, operations: [{ serviceId: 'CUT_45', multiplier: 1 }, { serviceId: 'EDGE_ROUND', multiplier: 1 }] },
    { id: 'chamfered_edge', label: 'Chamfered edge', shortLabel: 'Chamfer', description: 'скошена фаска', allowance: 2.5, operations: [{ serviceId: 'EDGE_BEVEL', multiplier: 1 }] },
    { id: 'half_bullnose', label: 'Half bullnose', shortLabel: 'Half bull', description: 'верхній великий радіус', allowance: 2.5, operations: [{ serviceId: 'EDGE_ROUND', multiplier: 1 }] },
    { id: 'full_bullnose', label: 'Full bullnose', shortLabel: 'Full bull', description: 'повний радіус торця', allowance: 2.5, operations: [{ serviceId: 'EDGE_ROUND', multiplier: 2 }] },
    { id: 'sharknose', label: 'Sharknose', shortLabel: 'Shark', description: 'скошена піднутрена кромка', allowance: 2.5, operations: [{ serviceId: 'CUT_45', multiplier: 1 }, { serviceId: 'EDGE_POLISH', multiplier: 1 }] },
    { id: 'straight_edge', label: 'Straight edge', shortLabel: 'Straight', description: 'пряма кромка без фаски/радіуса', allowance: 0, operations: [{ serviceId: 'CUT_STRAIGHT', multiplier: 1 }] },
    { id: 'd_12', label: 'Крайка D12', shortLabel: 'D12', description: 'Виробничий профіль NC300, припуск 4.5 мм на сторону', allowance: 4.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_D12', multiplier: 1 }] },

    // ── Виробничі профілі з прайсу ВіярПро ───────────────────────────
    //  Припуски — з CUTTING_RULES_TZ: крайка 2.5, D12 — 4.5, стик Z — 1.5.
    //  Серія 12 живе лише на керамограніті, серія 20 — на кварциті;
    //  AR20 і ZS20 — виняток, вони існують на обох матеріалах, тому без
    //  materialGroup: код послуги обирає прив'язка за матеріалом проєкту.
    { id: 'ar_12', label: 'Крайка AR12', shortLabel: 'AR12', description: 'Фрезерування крайки NC300 (219959)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 't_12', label: 'Крайка T12', shortLabel: 'T12', description: 'Фрезерування крайки NC300 (219963)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'z_12', label: 'Крайка Z (стик)', shortLabel: 'Z', description: 'Крайка під стик, припуск 1.5 мм (219966)', allowance: 1.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'zs_12', label: 'Крайка ZS12', shortLabel: 'ZS12', description: 'Фрезерування крайки NC300 (219961)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'zs_4', label: 'Крайка ZS4 (1.5×1.5)', shortLabel: 'ZS4', description: 'Тонкий керамограніт, ділянка PANDA (203090)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'zs_6_15', label: 'Крайка ZS6 (1.5×1.5)', shortLabel: 'ZS6 1.5', description: 'Тонкий керамограніт, ділянка PANDA (203092)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'zs_6_3', label: 'Крайка ZS6 (3×3)', shortLabel: 'ZS6 3', description: 'Тонкий керамограніт, ділянка PANDA (203096)', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'ar_20', label: 'Крайка AR20', shortLabel: 'AR20', description: 'Кварцит 219991 / керамограніт 203099', allowance: 2.5, operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'd_20', label: 'Крайка D20', shortLabel: 'D20', description: 'Фрезерування крайки NC300 (242507)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'h_40', label: 'Крайка H40', shortLabel: 'H40', description: 'Фрезерування крайки NC300 (242508)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'r_10', label: 'Крайка R10', shortLabel: 'R10', description: 'Фрезерування крайки NC300 (242509)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'r_3', label: 'Крайка R3', shortLabel: 'R3', description: 'Фрезерування крайки NC300 (219992)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'r_5', label: 'Крайка R5', shortLabel: 'R5', description: 'Фрезерування крайки NC300 (242511)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 't_20', label: 'Крайка T20', shortLabel: 'T20', description: 'Фрезерування крайки NC300 (219994)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'xd_20', label: 'Крайка XD20', shortLabel: 'XD20', description: 'Фрезерування крайки NC300 (219995)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'z_20', label: 'Крайка Z20 (стик)', shortLabel: 'Z20', description: 'Крайка під стик, кварцит (242512); припуск 2.5 за 195666', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'zs_20', label: 'Крайка ZS20', shortLabel: 'ZS20', description: 'Кварцит 219993 / керамограніт 203100', allowance: 2.5, operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'edge_45', label: 'Торець 45°', shortLabel: '45°', description: 'Фрезування крайки 45° (195350 / 195685)', allowance: 2.5, operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'antik', label: 'Крайка «Антик»', shortLabel: 'Антик', description: 'Алмазні щітки для матових покриттів (195717)', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },

    /*
     * ── Каталог «Все кромки» від цеху (PDF 17.09.25) ──────────────────
     *
     * Джерело — 9 сторінок креслень перерізів: керамограніт, кварцит,
     * акрил. Правила відбору:
     *   · профіль = ФОРМА кромки; «на плінтусі», «на борті з фанерою»,
     *     «на підклейці 33», «на мийці» — це КОНТЕКСТИ застосування тієї
     *     самої форми, окремих записів вони не отримують;
     *   · форми, що вже покриті наявними записами, не дублюються:
     *     R2 верх → r2_top, R2+R2 → r2_top_bottom, фаска 2×2 →
     *     chamfer_2x2, 2×2+2×2 → chamfer_2x2_top_bottom, R0 (пряма) →
     *     polished_straight;
     *   · ZR20 (R3 верх), A20R5 (R5), A20 (R10) з каталогу, ймовірно,
     *     і є наші r_3 / r_5 / r_10 з прайсу NC300 — НЕ додані, щоб не
     *     плодити дублі у випадачці; чекають підтвердження власника
     *     (див. КРОМКИ_ЗВІРКА_20-08.md);
     *   · припуск усім 2.5 (стандарт крайки з CUTTING_RULES), техфасці 0;
     *     власник коригує в налаштуваннях профілів;
     *   · послуга поки що загальне профільне фрезерування
     *     (EDGE_PROFILE_MILL); парні форми — ×2, як у наявних в/н. Коди 1С
     *     на акрилові форми підв'яжуться, коли цех дасть номенклатуру.
     */
    { id: 'tech_chamfer', label: 'Технічна фаска (<1×1)', shortLabel: 'Техфаска', description: 'Керамограніт і кварцит; захисна мікрофаска, каталог 17.09.25', allowance: 0, operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'zr_12', label: 'Крайка ZR12 (R2 верх)', shortLabel: 'ZR12', description: 'Каталог 17.09.25; форма = R2 зверху, серія 12', allowance: 2.5, materialGroup: 'Керамограніт', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },

    // Кварцит — серії 20 і 40 з каталогу
    { id: 'l_20', label: 'Крайка L20 (увігнутий R10)', shortLabel: 'L20', description: 'Каталог 17.09.25; увігнутий радіус R10 зверху', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'lv_40', label: 'Крайка LV40', shortLabel: 'LV40', description: 'Каталог 17.09.25; профіль на борті 40 мм', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'lv_40_inv', label: 'Крайка LV40 перевернутий', shortLabel: 'LV40 пер.', description: 'Каталог 17.09.25; той самий профіль дзеркально', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'o_40', label: 'Крайка O40', shortLabel: 'O40', description: 'Каталог 17.09.25; профіль на борті 40 мм', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'u_40', label: 'Крайка U40', shortLabel: 'U40', description: 'Каталог 17.09.25; профіль на борті 40 мм', allowance: 2.5, materialGroup: 'Кварцит', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },

    // Акрил — уперше в довіднику: досі жодного акрилового профілю не було
    { id: 'acr_r3', label: 'R3 верх (акрил)', shortLabel: 'R3', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_r6', label: 'R6 верх (акрил)', shortLabel: 'R6', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_r8', label: 'R8 верх (акрил)', shortLabel: 'R8', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_r10', label: 'R10 верх (акрил)', shortLabel: 'R10', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_r12', label: 'R12 верх (акрил)', shortLabel: 'R12', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_r20', label: 'R20 верх (акрил)', shortLabel: 'R20', description: 'Каталог 17.09.25; лише на борті з фанерою', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_r3_3', label: 'R3+R3 верх/низ (акрил)', shortLabel: 'R3 в/н', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 2 }] },
    { id: 'acr_r6_6', label: 'R6+R6 верх/низ (акрил)', shortLabel: 'R6 в/н', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 2 }] },
    { id: 'acr_r8_8', label: 'R8+R8 верх/низ (акрил)', shortLabel: 'R8 в/н', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 2 }] },
    { id: 'acr_bullnose_r10', label: 'R10+R10 BullNose (акрил)', shortLabel: 'BullNose R10', description: 'Каталог 17.09.25; повний заокруглений торець', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 2 }] },
    { id: 'acr_bullnose_r12', label: 'R12+R12 BullNose (акрил)', shortLabel: 'BullNose R12', description: 'Каталог 17.09.25; повний заокруглений торець', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 2 }] },
    { id: 'acr_ch_5x5', label: 'Фаска 5×5 (акрил)', shortLabel: '5×5', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_ch_10x10', label: 'Фаска 10×10 (акрил)', shortLabel: '10×10', description: 'Каталог 17.09.25; лише на борті з фанерою', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_ch_5x5_5x5', label: 'Фаска 5×5+5×5 в/н (акрил)', shortLabel: '5×5 в/н', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 2 }] },
    { id: 'acr_ch_10x10_10x10', label: 'Фаска 10×10+10×10 в/н (акрил)', shortLabel: '10×10 в/н', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 2 }] },
    { id: 'acr_cove_r6', label: 'R6 профіль увігнутий (акрил)', shortLabel: 'R6 увігн.', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_cove_r6_6', label: 'R6+R6 профіль увігнутий в/н (акрил)', shortLabel: 'R6 увігн. в/н', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 2 }] },
    { id: 'acr_fillet_r10r12', label: 'Галтель R10+R12 (акрил, плінтус)', shortLabel: 'Галтель', description: 'Каталог 17.09.25; перехід плінтуса в стільницю', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_shark45_r0', label: 'SharkNose 45° R0 (акрил)', shortLabel: 'Shark 45°', description: 'Каталог 17.09.25; зріз під 45°, верх прямий', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_shark45_r3', label: 'SharkNose 45° R3 (акрил)', shortLabel: 'Shark 45° R3', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_shark45_r6', label: 'SharkNose 45° R6 (акрил)', shortLabel: 'Shark 45° R6', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_shark55_r0', label: 'SharkNose 55° R0 (акрил)', shortLabel: 'Shark 55°', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_shark55_r2', label: 'SharkNose 55° R2 (акрил)', shortLabel: 'Shark 55° R2', description: 'Каталог 17.09.25; тонкі стільниці 10–12 мм', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_shark55_r3', label: 'SharkNose 55° R3 (акрил)', shortLabel: 'Shark 55° R3', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_shark55_r6', label: 'SharkNose 55° R6 (акрил)', shortLabel: 'Shark 55° R6', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_shark225_r0', label: 'SharkNose 22.5° R0 (акрил)', shortLabel: 'Shark 22.5°', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_shark225_r3', label: 'SharkNose 22.5° R3 (акрил)', shortLabel: 'Shark 22.5° R3', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_shark225_r6', label: 'SharkNose 22.5° R6 (акрил)', shortLabel: 'Shark 22.5° R6', description: 'Каталог 17.09.25', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_modern', label: 'Кромка «Модерн» (акрил)', shortLabel: 'Модерн', description: 'Каталог 17.09.25; тонкий верх R2 з підклейкою', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_spill_stop', label: 'Кромка «Непроливайка» (акрил)', shortLabel: 'Непролив.', description: 'Каталог 17.09.25; бортик R12/R12+R3 проти стікання', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_classic1', label: 'Кромка «Классік-1» (акрил)', shortLabel: 'Классік-1', description: 'Каталог 17.09.25; R12 із полицею 2 мм зверху', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
    { id: 'acr_classic2', label: 'Кромка «Классік-2» (акрил)', shortLabel: 'Классік-2', description: 'Каталог 17.09.25; R12 із полицями 2 мм зверху і знизу', allowance: 2.5, materialGroup: 'Акрил', operations: [{ serviceId: 'EDGE_PROFILE_MILL', multiplier: 1 }] },
  ],
};

/**
 * Долити вбудовані профілі торців у довідник збереженого проєкту.
 *
 * referenceData зберігається РАЗОМ із проєктом, тому проєкт, збережений
 * до появи виробничих профілів, назавжди лишився б із дванадцятьма
 * старими — нові AR12/D20/ZS20 у випадачках просто не з'являлися б.
 * Профілі, які користувач редагував (ціна, припуск), не чіпаються:
 * доливаються лише відсутні id.
 */
export function mergeBuiltinEdgeProfiles(existing?: import('./types').EdgeProfileDef[]) {
  const current = [...(existing ?? [])];
  const have = new Set(current.map((profile) => profile.id));
  (referenceData.edgeProfiles ?? []).forEach((profile) => {
    if (!have.has(profile.id)) current.push(profile);
  });
  return current;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export const DEFAULT_ALLOWANCES = {
  detailLength: 0,
  detailWidth: 0,
  detailSmallCutout: 0,
  detailLargeCutout: 0,
  elementLength: 0,
  elementWidth: 0,
  elementSmallCutout: 0,
  elementLargeCutout: 0,
  interPartSpacing: 0,
  show: false,
  applyToImports: false,
};


export function createEmptyProject(): Project {
  return {
    id: uid('project'),
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    orderNumber: '',
    customer: '',
    uiLanguage: 'uk',
    textureSelectionEnabled: false,
    slabTypes: [],
    slabs: [],
    details: [],
    placements: [],
    textureLayouts: [],
    textureFrames: [],
    manualDimensions: [],
    calculationStatus: 'failed',
    unplacedPartIds: [],
    unplacedReasons: {},
    referenceData,
    versions: [{ id: uid('version'), timestamp: new Date().toISOString(), note: 'Створено проєкт' }],
    updatedAt: new Date().toISOString(),
    allowances: { ...DEFAULT_ALLOWANCES },
  };
}
