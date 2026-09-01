export type ServiceUnit = 'm' | 'm2' | 'pcs' | 'комплект';

export type ServiceCategory = 'machine' | 'manual' | 'engineering' | 'material';

export interface ServiceDefinition {
  id: string;
  name: string;
  unit: ServiceUnit;
  /**
   * Ціна за одиницю, грн. У вбудованому каталозі ЗАВЖДИ 0: гроші
   * приходять із 1С за `externalId` (див. коментар до
   * DEFAULT_SERVICE_CATALOG). Ненульовою вона буває лише в послуги,
   * яку керівник завів руками в налаштуваннях.
   */
  price: number;
  category: ServiceCategory;
  /**
   * Код послуги в обліковій системі (ВіярПро/1С), наприклад '219964'.
   * Заповнює керівник у налаштуваннях; рушій фактів його не бачить і
   * не повинен бачити — саме тому поле необов'язкове.
   */
  externalId?: string;
  /**
   * Матеріальна група. Номенклатура 1С подвоєна: одна операція має
   * різні коди на керамограніт і кварцит. Порожньо = послуга спільна.
   */
  materialGroup?: string;
  /** Верстат, на якому виконується — з довідника ВіярПро */
  equipment?: string;
  /** Послуга, додана керівником, а не вбудована */
  custom?: boolean;
}

/**
 * Довідник операцій: назва, одиниця, категорія і код 1С. ЦІН ТУТ НЕМАЄ —
 * усі нулі, і це не заготовка під заповнення.
 *
 * Ціну знає тільки 1С: вона рахує її за кодом номенклатури (getDiscountPrice)
 * з урахуванням прайс-категорії та знижки контрагента. Кошторис питає її
 * через `erpPrices` (engines/estimate.ts), рівно як це вже робить
 * «Прорахунок» (engines/quoteCalc.ts, рішення 25.08.2026).
 *
 * Раніше тут лежали вшиті числа з прайсу 19.08.2026 (5000 за м² кварциту,
 * 11337.25 за радіусний кут тощо). Вони старіли мовчки: прайс у 1С
 * мінявся, а застосунок далі показував цифру з коду — і відрізнити її від
 * справжньої відповіді інтеграції було неможливо. Тепер операція без коду
 * 1С або без відповіді від 1С коштує нуль і позначена в кошторисі як
 * «ціни немає»: краще видимий нуль, ніж правдоподібне число.
 *
 * `externalId` — те, за чим питається ціна. Порожній externalId означає,
 * що операція в обліку ще не заведена; такі рядки в кошторисі завжди
 * нульові, поки керівник не переведе прив'язки на коди ВіярПро
 * (domain/viyarMapping.ts).
 */
export const DEFAULT_SERVICE_CATALOG: Record<string, ServiceDefinition> = {
  // Матеріал
  MATERIAL_QUARTZ: { id: 'MATERIAL_QUARTZ', name: 'Матеріал: Кварцит', unit: 'm2', price: 0, category: 'material' },
  MATERIAL_CERAMIC: { id: 'MATERIAL_CERAMIC', name: 'Матеріал: Керамограніт', unit: 'm2', price: 0, category: 'material' },
  MATERIAL_NATURAL: { id: 'MATERIAL_NATURAL', name: 'Матеріал: Натуральний камінь', unit: 'm2', price: 0, category: 'material' },
  MATERIAL_ACRYLIC: { id: 'MATERIAL_ACRYLIC', name: 'Матеріал: Акрил', unit: 'm2', price: 0, category: 'material' },

  // Різи
  CUT_STRAIGHT: { id: 'CUT_STRAIGHT', name: 'Прямий різ', unit: 'm', price: 0, category: 'machine' },
  CUT_45: { id: 'CUT_45', name: 'Різ під 45°', unit: 'm', price: 0, category: 'machine' },

  // Обробка торців (Edge Profiles)
  EDGE_POLISH: { id: 'EDGE_POLISH', name: 'Полірування прямого торця', unit: 'm', price: 0, category: 'machine' },
  EDGE_BEVEL: { id: 'EDGE_BEVEL', name: 'Фаска', unit: 'm', price: 0, category: 'machine' },
  EDGE_ROUND: { id: 'EDGE_ROUND', name: 'Скруглення (Радіусний профіль)', unit: 'm', price: 0, category: 'machine' },

  // Склейка
  GLUING_45: { id: 'GLUING_45', name: 'Склейка під 45°', unit: 'm', price: 0, category: 'manual' },
  GLUING_STRAIGHT: { id: 'GLUING_STRAIGHT', name: 'Пряма склейка (стик)', unit: 'm', price: 0, category: 'manual' },

  // Вирізи
  CUTOUT_ROUGH: { id: 'CUTOUT_ROUGH', name: 'Чорновий виріз (накладний монтаж)', unit: 'pcs', price: 0, category: 'machine' },
  CUTOUT_CLEAN: { id: 'CUTOUT_CLEAN', name: 'Чистовий виріз (нижній монтаж)', unit: 'pcs', price: 0, category: 'machine' },
  POLISH_INNER: { id: 'POLISH_INNER', name: 'Полірування внутрішнього вирізу', unit: 'm', price: 0, category: 'manual' },
  CUTOUT_HOLE: { id: 'CUTOUT_HOLE', name: 'Свердління отвору', unit: 'pcs', price: 0, category: 'machine' },

  // Кути
  CORNER_RADIUS: { id: 'CORNER_RADIUS', name: 'Радіусне скруглення кута', unit: 'pcs', price: 0, category: 'machine' },
  CORNER_CHAMFER: { id: 'CORNER_CHAMFER', name: 'Прямий зріз кута (Фаска)', unit: 'pcs', price: 0, category: 'machine' },

  /*
   * ── РАДІУСНІ (ГНУТІ) ЕЛЕМЕНТИ ──────────────────────────────────────
   *
   * Номенклатура — з прайсу Viyar (ТЗ від 19.08.2026); ціни звідти прибрані,
 * їх дає 1С за externalId. Послуга
   * нараховується ЗА ШТУКУ на кожен радіусний елемент; матеріал рахується
   * окремо, по прямокутнику в розкрої, із технологічним запасом (30% на
   * сегментацію, 20% на гнуття).
   *
   * Категорія залежить від того, це край стільниці чи опора, і від розміру.
   * Номенклатура подвоєна за матеріалом — саме тому тут по п'ять записів на
   * кожен камінь, а не один із коефіцієнтом.
   */

  // Керамограніт — сегментація
  RADIUS_CT80_CERAMIC: { id: 'RADIUS_CT80_CERAMIC', name: 'Радіусний кут стільниці до 80 мм (керамограніт)', unit: 'pcs', price: 0, category: 'manual', externalId: '298634', materialGroup: 'Керамограніт' },
  RADIUS_CT200_CERAMIC: { id: 'RADIUS_CT200_CERAMIC', name: 'Радіусний кут стільниці 80–200 мм (керамограніт)', unit: 'pcs', price: 0, category: 'manual', externalId: '298635', materialGroup: 'Керамограніт' },
  RADIUS_LEG900_CERAMIC: { id: 'RADIUS_LEG900_CERAMIC', name: 'Радіусна опора до 900 мм (керамограніт)', unit: 'pcs', price: 0, category: 'manual', externalId: '298636', materialGroup: 'Керамограніт' },
  RADIUS_LEGTALL_CERAMIC: { id: 'RADIUS_LEGTALL_CERAMIC', name: 'Радіусна опора від 900 мм (керамограніт)', unit: 'pcs', price: 0, category: 'manual', externalId: '298637', materialGroup: 'Керамограніт' },
  RADIUS_COMPLEX_CERAMIC: { id: 'RADIUS_COMPLEX_CERAMIC', name: 'Складний радіусний елемент (керамограніт)', unit: 'pcs', price: 0, category: 'manual', externalId: '298638', materialGroup: 'Керамограніт' },

  // Натуральний камінь — сегментація
  RADIUS_CT80_STONE: { id: 'RADIUS_CT80_STONE', name: 'Радіусний кут стільниці до 80 мм (натуральний камінь)', unit: 'pcs', price: 0, category: 'manual', externalId: '298639', materialGroup: 'Натуральний камінь' },
  RADIUS_CT200_STONE: { id: 'RADIUS_CT200_STONE', name: 'Радіусний кут стільниці 80–200 мм (натуральний камінь)', unit: 'pcs', price: 0, category: 'manual', externalId: '298640', materialGroup: 'Натуральний камінь' },
  RADIUS_LEG900_STONE: { id: 'RADIUS_LEG900_STONE', name: 'Радіусна опора до 900 мм (натуральний камінь)', unit: 'pcs', price: 0, category: 'manual', externalId: '298641', materialGroup: 'Натуральний камінь' },
  RADIUS_LEGTALL_STONE: { id: 'RADIUS_LEGTALL_STONE', name: 'Радіусна опора від 900 мм (натуральний камінь)', unit: 'pcs', price: 0, category: 'manual', externalId: '298642', materialGroup: 'Натуральний камінь' },
  RADIUS_COMPLEX_STONE: { id: 'RADIUS_COMPLEX_STONE', name: 'Складний радіусний елемент (натуральний камінь)', unit: 'pcs', price: 0, category: 'manual', externalId: '298643', materialGroup: 'Натуральний камінь' },

  // Кварцит — сегментація
  RADIUS_CT80_QUARTZ: { id: 'RADIUS_CT80_QUARTZ', name: 'Радіусний кут стільниці до 80 мм (кварцит)', unit: 'pcs', price: 0, category: 'manual', externalId: '298644', materialGroup: 'Кварцит' },
  RADIUS_CT200_QUARTZ: { id: 'RADIUS_CT200_QUARTZ', name: 'Радіусний кут стільниці 80–200 мм (кварцит)', unit: 'pcs', price: 0, category: 'manual', externalId: '298645', materialGroup: 'Кварцит' },
  RADIUS_LEG900_QUARTZ: { id: 'RADIUS_LEG900_QUARTZ', name: 'Радіусна опора до 900 мм (кварцит)', unit: 'pcs', price: 0, category: 'manual', externalId: '298646', materialGroup: 'Кварцит' },
  RADIUS_LEGTALL_QUARTZ: { id: 'RADIUS_LEGTALL_QUARTZ', name: 'Радіусна опора від 900 мм (кварцит)', unit: 'pcs', price: 0, category: 'manual', externalId: '298647', materialGroup: 'Кварцит' },
  /*
   * УВАГА: коду 1С для складного радіуса на кварциті в прайсі НЕМАЄ —
   * у переліку є чотири позиції замість п'яти. externalId лишається
   * порожнім, тому ціни в цього рядка не буде взагалі, поки код не
   * заведуть: рядок без коду видно в кошторисі, і це чесніше за число,
   * списане з сусіднього каменю.
   */
  RADIUS_COMPLEX_QUARTZ: { id: 'RADIUS_COMPLEX_QUARTZ', name: 'Складний радіусний елемент (кварцит)', unit: 'pcs', price: 0, category: 'manual', materialGroup: 'Кварцит' },

  /*
   * Акрил — гнуття. ТЗ ділить і гнуття, і матрицю на три категорії
   * (до 600 / понад 600 / складний), але в прайсі поки по ОДНІЙ позиції на
   * кожне. Тому класифікація в моделі є (domain/radiusElement), а всі три
   * категорії поки ведуть на ці два коди. З'являться окремі — правити треба
   * лише таблицю прив'язок, не модель.
   */
  RADIUS_BEND_ACRYLIC: { id: 'RADIUS_BEND_ACRYLIC', name: 'Гнуття деталей (акрил)', unit: 'pcs', price: 0, category: 'machine', externalId: '200433', materialGroup: 'Акрил' },
  RADIUS_MATRIX_ACRYLIC: { id: 'RADIUS_MATRIX_ACRYLIC', name: 'Виготовлення матриці для термоформінгу (акрил)', unit: 'pcs', price: 0, category: 'engineering', externalId: '229536', materialGroup: 'Акрил' },

  // Різ водою і великі отвори — раніше в каталозі не існували,
  // тому криволінійна порізка ніде не нараховувалась
  CUT_WATERJET: { id: 'CUT_WATERJET', name: 'Криволінійна порізка водою', unit: 'm', price: 0, category: 'machine' },
  HOLE_LARGE: { id: 'HOLE_LARGE', name: 'Різ водою отвору понад 100 мм', unit: 'm', price: 0, category: 'machine' },

  // Торець D-12: профіль у довіднику був, послуги під нього — ні
  EDGE_D12: { id: 'EDGE_D12', name: 'Фрезерування крайки D-12', unit: 'm', price: 0, category: 'machine' },

  // Узагальнене фрезерування виробничого профілю (AR12, T20, ZS20…).
  // Власного коду 1С не має: ціна з'явиться, коли прив'язки переведуть
  // на конкретні коди крайок ВіярПро.
  EDGE_PROFILE_MILL: { id: 'EDGE_PROFILE_MILL', name: 'Фрезерування крайки (профіль)', unit: 'm', price: 0, category: 'machine' },

  // Ручна доводка торця — галочка на стороні деталі
  EDGE_MANUAL_FINISH: { id: 'EDGE_MANUAL_FINISH', name: 'Ручна доводка торця', unit: 'm', price: 0, category: 'manual' },

  // Пропил для стику — виписується двічі на стик
  JOINT_SAWCUT: { id: 'JOINT_SAWCUT', name: 'Пропил для стику деталей', unit: 'pcs', price: 0, category: 'machine' },

  // Матеріал за лист — альтернатива розрахунку за м²
  MATERIAL_SLAB: { id: 'MATERIAL_SLAB', name: 'Матеріал за лист (сляб)', unit: 'pcs', price: 0, category: 'material' },

  // Інженерні послуги
  MEASUREMENT: { id: 'MEASUREMENT', name: 'Виїзд на замір', unit: 'комплект', price: 0, category: 'engineering' },
  ENGINEERING: { id: 'ENGINEERING', name: 'Послуги конструктора (Креслення)', unit: 'комплект', price: 0, category: 'engineering' },
  INSTALLATION: { id: 'INSTALLATION', name: 'Монтаж виробу', unit: 'm2', price: 0, category: 'engineering' },
};