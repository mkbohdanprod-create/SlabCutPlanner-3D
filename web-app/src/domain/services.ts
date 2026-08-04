export type ServiceUnit = 'm' | 'm2' | 'pcs' | 'комплект';

export type ServiceCategory = 'machine' | 'manual' | 'engineering' | 'material';

export interface ServiceDefinition {
  id: string;
  name: string;
  unit: ServiceUnit;
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

export const DEFAULT_SERVICE_CATALOG: Record<string, ServiceDefinition> = {
  // Матеріал
  MATERIAL_QUARTZ: { id: 'MATERIAL_QUARTZ', name: 'Матеріал: Кварцит', unit: 'm2', price: 5000, category: 'material' },
  MATERIAL_CERAMIC: { id: 'MATERIAL_CERAMIC', name: 'Матеріал: Керамограніт', unit: 'm2', price: 6000, category: 'material' },
  MATERIAL_NATURAL: { id: 'MATERIAL_NATURAL', name: 'Матеріал: Натуральний камінь', unit: 'm2', price: 7000, category: 'material' },
  MATERIAL_ACRYLIC: { id: 'MATERIAL_ACRYLIC', name: 'Матеріал: Акрил', unit: 'm2', price: 4000, category: 'material' },

  // Різи
  CUT_STRAIGHT: { id: 'CUT_STRAIGHT', name: 'Прямий різ', unit: 'm', price: 200, category: 'machine' },
  CUT_45: { id: 'CUT_45', name: 'Різ під 45°', unit: 'm', price: 350, category: 'machine' },

  // Обробка торців (Edge Profiles)
  EDGE_POLISH: { id: 'EDGE_POLISH', name: 'Полірування прямого торця', unit: 'm', price: 400, category: 'machine' },
  EDGE_BEVEL: { id: 'EDGE_BEVEL', name: 'Фаска', unit: 'm', price: 250, category: 'machine' },
  EDGE_ROUND: { id: 'EDGE_ROUND', name: 'Скруглення (Радіусний профіль)', unit: 'm', price: 500, category: 'machine' },

  // Склейка
  GLUING_45: { id: 'GLUING_45', name: 'Склейка під 45°', unit: 'm', price: 600, category: 'manual' },
  GLUING_STRAIGHT: { id: 'GLUING_STRAIGHT', name: 'Пряма склейка (стик)', unit: 'm', price: 450, category: 'manual' },

  // Вирізи
  CUTOUT_ROUGH: { id: 'CUTOUT_ROUGH', name: 'Чорновий виріз (накладний монтаж)', unit: 'pcs', price: 800, category: 'machine' },
  CUTOUT_CLEAN: { id: 'CUTOUT_CLEAN', name: 'Чистовий виріз (нижній монтаж)', unit: 'pcs', price: 1200, category: 'machine' },
  POLISH_INNER: { id: 'POLISH_INNER', name: 'Полірування внутрішнього вирізу', unit: 'm', price: 700, category: 'manual' },
  CUTOUT_HOLE: { id: 'CUTOUT_HOLE', name: 'Свердління отвору', unit: 'pcs', price: 150, category: 'machine' },

  // Кути
  CORNER_RADIUS: { id: 'CORNER_RADIUS', name: 'Радіусне скруглення кута', unit: 'pcs', price: 200, category: 'machine' },
  CORNER_CHAMFER: { id: 'CORNER_CHAMFER', name: 'Прямий зріз кута (Фаска)', unit: 'pcs', price: 150, category: 'machine' },

  // Різ водою і великі отвори — раніше в каталозі не існували,
  // тому криволінійна порізка ніде не нараховувалась
  CUT_WATERJET: { id: 'CUT_WATERJET', name: 'Криволінійна порізка водою', unit: 'm', price: 450, category: 'machine' },
  HOLE_LARGE: { id: 'HOLE_LARGE', name: 'Різ водою отвору понад 100 мм', unit: 'm', price: 500, category: 'machine' },

  // Торець D-12: профіль у довіднику був, послуги під нього — ні
  EDGE_D12: { id: 'EDGE_D12', name: 'Фрезерування крайки D-12', unit: 'm', price: 550, category: 'machine' },

  // Ручна доводка торця — галочка на стороні деталі
  EDGE_MANUAL_FINISH: { id: 'EDGE_MANUAL_FINISH', name: 'Ручна доводка торця', unit: 'm', price: 300, category: 'manual' },

  // Пропил для стику — виписується двічі на стик
  JOINT_SAWCUT: { id: 'JOINT_SAWCUT', name: 'Пропил для стику деталей', unit: 'pcs', price: 180, category: 'machine' },

  // Матеріал за лист — альтернатива розрахунку за м²
  MATERIAL_SLAB: { id: 'MATERIAL_SLAB', name: 'Матеріал за лист (сляб)', unit: 'pcs', price: 18000, category: 'material' },

  // Інженерні послуги
  MEASUREMENT: { id: 'MEASUREMENT', name: 'Виїзд на замір', unit: 'комплект', price: 1500, category: 'engineering' },
  ENGINEERING: { id: 'ENGINEERING', name: 'Послуги конструктора (Креслення)', unit: 'комплект', price: 1000, category: 'engineering' },
  INSTALLATION: { id: 'INSTALLATION', name: 'Монтаж виробу', unit: 'm2', price: 2500, category: 'engineering' },
};