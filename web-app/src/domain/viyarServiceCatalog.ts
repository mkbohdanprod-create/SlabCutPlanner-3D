// =====================================================================
//  src/domain/viyarServiceCatalog.ts
//  Довідник послуг ВіярПро/1С — 100 позицій із їхніми обліковими кодами.
//
//  ЗГЕНЕРОВАНО з InstructionsRules/Послуги/excel_dump.csv (вивантаження
//  файлу «Послуги для ВіярПро (керамограніт_кварцит)»). Руками не правити:
//  оновиться прайс — перегенерувати. Ціни тут навмисно НЕ зберігаються,
//  їх виставляє керівник у налаштуваннях.
//
//  Чому це окремий файл, а не частина рушія: геометричне ядро не повинно
//  знати про ID 219964. Воно рахує виробничі факти, а цей довідник —
//  просто дані, які керівник підвантажує в каталог і чіпляє до фактів у
//  «Прив'язках послуг».
// =====================================================================

import type { ServiceDefinition, ServiceUnit, ServiceCategory } from './services';

export interface ViyarService {
  /** Код у ВіярПро/1С */
  code: string;
  name: string;
  unit: ServiceUnit;
  category: ServiceCategory;
  /** Розділ прайсу: Порізка, Фрезерування, Обробка торців, Додаткові послуги */
  section: string;
  /** Матеріальна група — номенклатура подвоєна за матеріалом */
  materialGroup?: string;
  /** Верстат, на якому виконується */
  equipment?: string;
}

export const VIYAR_SERVICES: ViyarService[] = [
  { code: '195299', name: 'Обпил листа', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт' },
  { code: '195300', name: 'Прямолінійна порізка пилою під 90 град.', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт', equipment: 'Breton Combicut' },
  { code: '195304', name: 'Криволінійна порізка водою', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт', equipment: 'Breton Combicut' },
  { code: '195310', name: 'Різ водою отворів діаметром <100мм', unit: 'pcs', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт', equipment: 'Breton Combicut' },
  { code: '195311', name: 'Різ водою отворів діаметром >100мм', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт', equipment: 'Breton Combicut' },
  { code: '195334', name: 'Виріз куточків водою', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт', equipment: 'Breton Combicut' },
  { code: '195312', name: 'Пазування матеріалу пилою', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт', equipment: 'Breton Combicut' },
  { code: '203111', name: 'Декоративне пазування диском', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт', equipment: 'Breton Combicut' },
  { code: '195301', name: 'Підрізка однієї деталі водою, після порізки диском', unit: 'pcs', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт', equipment: 'Breton Combicut' },
  { code: '195339', name: 'Підрізка плінтусів в розмір після фрезерування', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт', equipment: 'Breton Combicut' },
  { code: '195306', name: 'Порізка водою під кутом', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт', equipment: 'Breton Combicut' },
  { code: '195303', name: 'Порізка пилою під кутом', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Керамограніт', equipment: 'Breton Combicut' },
  { code: '219977', name: 'Порізка кварциту', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '219978', name: 'Порізка кварциту з групуванням', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '219979', name: 'Отвір малий', unit: 'pcs', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '219980', name: 'Отвір великий', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '219981', name: 'Прямокутний наскрізний виріз', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '219982', name: 'Виріз складної форми', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '219983', name: 'Зріз кута на площині', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '219984', name: 'Радіусний зріз кута', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '219985', name: 'Порізка отворів під вентиляцію', unit: 'pcs', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '195662', name: 'Обпил листа', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '195663', name: 'Прямолінійна порізка пилою під 90 град.', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '195666', name: 'Криволінійна порізка водою', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '195669', name: 'Різ водою отворів діаметром <100мм', unit: 'pcs', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '195670', name: 'Різ водою отворів діаметром >100мм', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '195672', name: 'Виріз куточків водою', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '195671', name: 'Пазування матеріалу пилою', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '203135', name: 'Декоративне пазування диском', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '195664', name: 'Підрізка однієї деталі водою, після порізки диском', unit: 'pcs', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '195673', name: 'Підрізка плінтусів в розмір після фрезерування', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '195668', name: 'Порізка водою під кутом', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '195665', name: 'Порізка пилою під кутом', unit: 'm', category: 'machine', section: 'Порізка', materialGroup: 'Кварцит', equipment: 'Combicat' },
  { code: '224022', name: 'Вибірка чверті (Керамограніт)', unit: 'm', category: 'machine', section: 'Фрезерування', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '224023', name: 'Вибірка чверті по периметру вирізу (Керамограніт)', unit: 'm', category: 'machine', section: 'Фрезерування', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '242499', name: 'Калібрування (Керамограніт)', unit: 'm2', category: 'machine', section: 'Фрезерування', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '242500', name: 'Калібрування крайки (Керамограніт)', unit: 'm', category: 'machine', section: 'Фрезерування', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '224049', name: 'Свердління отворів фрезою (Керамограніт)', unit: 'pcs', category: 'machine', section: 'Фрезерування', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '203108', name: 'Сверління отвору під анкер Keil (9x5) (Керамограніт)', unit: 'pcs', category: 'machine', section: 'Фрезерування', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '242501', name: 'Сверління під муфту Specialinsert (Керамограніт)', unit: 'pcs', category: 'machine', section: 'Фрезерування', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '242502', name: 'Фрезерування криволінійне (Керамограніт)', unit: 'm', category: 'machine', section: 'Фрезерування', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '242503', name: 'Фрезерування проточок (Керамограніт)', unit: 'm', category: 'machine', section: 'Фрезерування', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '195690', name: '3Д фрезерування поверхні матеріалу (Кварцит)', unit: 'm2', category: 'machine', section: 'Фрезерування', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '224063', name: 'Вибірка чверті (Кварцит)', unit: 'm', category: 'machine', section: 'Фрезерування', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '224064', name: 'Вибірка чверті по периметру вирізу (Кварцит)', unit: 'm', category: 'machine', section: 'Фрезерування', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '242504', name: 'Калібрування (Кварцит)', unit: 'm2', category: 'machine', section: 'Фрезерування', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '242505', name: 'Калібрування крайки (Кварцит)', unit: 'm', category: 'machine', section: 'Фрезерування', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '224089', name: 'Свердління отворів фрезою (Кварцит)', unit: 'pcs', category: 'machine', section: 'Фрезерування', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '203110', name: 'Сверління отвору під анкер Keil (9x7) (Кварцит)', unit: 'pcs', category: 'machine', section: 'Фрезерування', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '242506', name: 'Сверління під муфту Specialinsert (Кварцит)', unit: 'pcs', category: 'machine', section: 'Фрезерування', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '242513', name: 'Фрезерування криволінійне (Кварцит)', unit: 'm', category: 'machine', section: 'Фрезерування', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '242514', name: 'Фрезерування проточок (Кварцит)', unit: 'm', category: 'machine', section: 'Фрезерування', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '219959', name: 'Фрезерування крайки AR12 (Керамограніт)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '219964', name: 'Фрезерування крайки D12 (Керамограніт)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '219960', name: 'Фрезерування крайки R2 (Керамограніт)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '219963', name: 'Фрезерування крайки T12 (Керамограніт)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '219966', name: 'Фрезерування крайки Z (для стику) (Керамограніт)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '219961', name: 'Фрезерування крайки ZS12 (Керамограніт)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '195350', name: 'Фрезування крайки 45 град (Керамограніт)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Керамограніт', equipment: 'NC300' },
  { code: '219991', name: 'Фрезерування крайки AR20  (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '242507', name: 'Фрезерування крайки D20 (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '242508', name: 'Фрезерування крайки H40 (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '242509', name: 'Фрезерування крайки R10 (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '242510', name: 'Фрезерування крайки R2 (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '219992', name: 'Фрезерування крайки R3  (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '242511', name: 'Фрезерування крайки R5 (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '219994', name: 'Фрезерування крайки T20 (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '219995', name: 'Фрезерування крайки XD20 (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '242512', name: 'Фрезерування крайки Z20 (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '219993', name: 'Фрезерування крайки ZS20 (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '195685', name: 'Фрезування крайки 45 град (Кварцит)', unit: 'm', category: 'machine', section: 'Обробка торців', materialGroup: 'Кварцит', equipment: 'NC300' },
  { code: '219967', name: 'Обробка деталі конструктором', unit: 'pcs', category: 'engineering', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '219969', name: 'Пакування в короб', unit: 'm2', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '219973', name: 'Встановлення мийки нижнього монтажу', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '219975', name: 'Шліфування тильної сторони керамограніту', unit: 'm2', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '195377', name: 'Допрацювання фаски і торця внутрішнього вирізу при малому радіусі', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '195381', name: 'Завершення фаски і торця', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '195375', name: 'Зведення простої фаски на стикуванні виробу', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '195376', name: 'Зведення складної фаски при стикуванні виробу', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '195391', name: 'Косметичні роботи на стільниці', unit: 'm2', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '195363', name: 'Підгонка стільниці з опорою', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '195362', name: 'Пропил для стику деталей (від 500мм)', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '195361', name: 'Пропил для стику деталей (до 500мм)', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '203112', name: 'Ручне доопрацювання декоративного пазування', unit: 'm', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Керамограніт' },
  { code: '219997', name: 'Обробка деталі конструктором', unit: 'pcs', category: 'engineering', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '219998', name: 'Пакування в короб', unit: 'm2', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '219999', name: 'Деталі з залишків від вирізів', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '220001', name: 'Встановлення мийки нижнього монтажу', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '220002', name: 'Шліфування тильної сторони (Кварцит)', unit: 'm2', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '220003', name: 'Полірування тильної сторони (Кварцит)', unit: 'm2', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '195712', name: 'Допрацювання фаски і торця внутрішнього вирізу при малому радіусі', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '195721', name: 'Завершення фаски і торця', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '195710', name: 'Зведення простої фаски на стикуванні виробу', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '195725', name: 'Косметичні роботи на стільниці', unit: 'm2', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '195698', name: 'Підгонка стільниці з опорою', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '195695', name: 'Пропил для стику деталей (від 500мм)', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '195694', name: 'Пропил для стику деталей (до 500мм)', unit: 'pcs', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '203136', name: 'Руне доопрацювання декоративного пазування', unit: 'm', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '195724', name: 'Пакування виробу на монтаж', unit: 'm2', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
  { code: '195727', name: 'Упаковка виробу на переміщення', unit: 'm2', category: 'manual', section: 'Додаткові послуги', materialGroup: 'Кварцит' },
];

/**
 * Перетворює позицію довідника на послугу каталогу.
 * Ціна — нуль: реальні тарифи знає тільки замовник, вигадувати їх
 * означало б показати клієнту суму, якої ніхто не погоджував.
 */
export function viyarToServiceDefinition(item: ViyarService): ServiceDefinition {
  return {
    id: item.code,
    name: item.name,
    unit: item.unit,
    price: 0,
    category: item.category,
    externalId: item.code,
    materialGroup: item.materialGroup,
    equipment: item.equipment,
    custom: false,
  };
}

/** Увесь довідник у форматі каталогу */
export function viyarCatalog(): Record<string, ServiceDefinition> {
  const out: Record<string, ServiceDefinition> = {};
  VIYAR_SERVICES.forEach((item) => {
    out[item.code] = viyarToServiceDefinition(item);
  });
  return out;
}

/** Скільки позицій у довіднику — показуємо в налаштуваннях */
export const VIYAR_SERVICE_COUNT = VIYAR_SERVICES.length;
