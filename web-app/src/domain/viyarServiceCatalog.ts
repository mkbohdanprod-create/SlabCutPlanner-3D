// =====================================================================
//  src/domain/viyarServiceCatalog.ts
//  Довідник послуг ВіярПро/1С — 178 позицій з обліковими кодами.
//
//  ЗГЕНЕРОВАНО з двох джерел:
//    · excel_dump.csv (вивантаження «Послуги для ВіярПро») — 100 позицій;
//    · SERVICES_LIST.md, розділ «Додані послуги (Актуальні послуги 2026)»
//      — ділянки PANDA камінь, Косметика, Мийки, Пильний центр, Поклейка
//      крайки, Полірування, Фанера, Шліфування.
//  Руками не правити: оновиться прайс — перегенерувати. Ціни тут навмисно
//  НЕ зберігаються, їх виставляє керівник у налаштуваннях.
//
//  У прайсі-джерелі код 224675 зустрічається ДВІЧІ («зведення стика
//  стільниці з підворотом» і «Стикування зведення фаски на опорі») —
//  лишається перше входження, дубль пропущено.
// =====================================================================

import type { ServiceDefinition, ServiceUnit, ServiceCategory } from './services';

export interface ViyarService {
  /** Код у ВіярПро/1С */
  code: string;
  name: string;
  unit: ServiceUnit;
  category: ServiceCategory;
  /** Розділ прайсу або ділянка цеху */
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

  // ── Актуальні послуги 2026 (розділ «Додані послуги» SERVICES_LIST.md) ──
  { code: '203116', name: 'Виготовлення кромки AR20 (без полірування)', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Кварцит' },
  { code: '203117', name: 'Виготовлення кромки ZS20 (без полірування)', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Кварцит' },
  { code: '203118', name: 'Чистовий Різ 45 товщина 20мм', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Кварцит' },
  { code: '203103', name: 'Чистовий Різ 45 товщина 20мм', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Керамограніт' },
  { code: '203086', name: 'Фрезерування торця', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Керамограніт' },
  { code: '203090', name: 'Виготовлення кромки ZS4(1,5х1,5)', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Керамограніт' },
  { code: '203092', name: 'Виготовлення кромки ZS6(1,5х1,5)', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Керамограніт' },
  { code: '203096', name: 'Виготовлення кромки ZS6(3х3)', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Керамограніт' },
  { code: '203099', name: 'Виготовлення кромки AR20', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Керамограніт' },
  { code: '203100', name: 'Виготовлення кромки ZS20', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Керамограніт' },
  { code: '203101', name: 'Чистовий Різ 45 товщина 4мм', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Керамограніт' },
  { code: '203102', name: 'Чистовий Різ 45 товщина 6мм', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Керамограніт' },
  { code: '203104', name: 'Чистовий Різ 45 товщина 12мм', unit: 'm', category: 'machine', section: 'Ділянка: PANDA камінь', materialGroup: 'Керамограніт' },
  { code: '195723', name: 'Вклейка мийки замовника', unit: 'pcs', category: 'manual', section: 'Ділянка: Косметика', materialGroup: 'Кварцит' },
  { code: '195389', name: 'Вклейка мийки замовника', unit: 'pcs', category: 'manual', section: 'Ділянка: Косметика', materialGroup: 'Керамограніт' },
  { code: '195390', name: 'Пакування виробу на монтаж (Керамограніт)', unit: 'm2', category: 'manual', section: 'Ділянка: Косметика', materialGroup: 'Керамограніт' },
  { code: '224681', name: 'Виготовлення мийки SS01 (кварцит)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Кварцит' },
  { code: '224682', name: 'Виготовлення мийки SS01 (кварцит)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Кварцит' },
  { code: '224683', name: 'Виготовлення мийки SS03 (кварцит)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Кварцит' },
  { code: '224684', name: 'Виготовлення мийки SS03 (кварцит)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Кварцит' },
  { code: '224685', name: 'Виготовлення мийки WS01 (кварцит)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Кварцит' },
  { code: '224686', name: 'Виготовлення мийки WS01 (кварцит)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Кварцит' },
  { code: '224687', name: 'Виготовлення мийки WS03 (кварцит)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Кварцит' },
  { code: '224670', name: 'Виготовлення мийки WS03 (кварцит)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Керамограніт' },
  { code: '224666', name: 'Виготовлення мийки SS01 (керамограніт)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Керамограніт' },
  { code: '224667', name: 'Виготовлення мийки SS01 (керамограніт)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Керамограніт' },
  { code: '224668', name: 'Виготовлення мийки SS03 (керамограніт)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Керамограніт' },
  { code: '224669', name: 'Виготовлення мийки SS03 (керамограніт)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Керамограніт' },
  { code: '224671', name: 'Виготовлення мийки WS02 (керамограніт)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Керамограніт' },
  { code: '224672', name: 'Виготовлення мийки WS02 (керамограніт)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Керамограніт' },
  { code: '224673', name: 'Виготовлення мийки CWS04 (керамограніт)', unit: 'pcs', category: 'manual', section: 'Ділянка: Мийки', materialGroup: 'Керамограніт' },
  { code: '259773', name: 'Комбінована порізка', unit: 'm', category: 'machine', section: 'Ділянка: Пильний центр', materialGroup: 'Кварцит' },
  { code: '259771', name: 'Комбінована порізка', unit: 'm', category: 'machine', section: 'Ділянка: Пильний центр', materialGroup: 'Керамограніт' },
  { code: '259774', name: 'Комбінована порізка під кутом', unit: 'm', category: 'machine', section: 'Ділянка: Пильний центр', materialGroup: 'Кварцит' },
  { code: '259772', name: 'Комбінована порізка під кутом', unit: 'm', category: 'machine', section: 'Ділянка: Пильний центр', materialGroup: 'Керамограніт' },
  { code: '195700', name: 'Поклейка крайки-опуску', unit: 'm', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Кварцит' },
  { code: '195367', name: 'Поклейка крайки-опуску', unit: 'm', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Керамограніт' },
  { code: '195701', name: 'Поклейка підвороту шириною до 50 мм', unit: 'm', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Кварцит' },
  { code: '195368', name: 'Поклейка підвороту шириною до 50 мм', unit: 'm', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Керамограніт' },
  { code: '195702', name: 'Поклейка підвороту шириною від 50 мм', unit: 'm', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Кварцит' },
  { code: '195369', name: 'Поклейка підвороту шириною від 50 мм', unit: 'm', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Керамограніт' },
  { code: '195703', name: 'Облицювання виробу замовника', unit: 'm2', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Кварцит' },
  { code: '195370', name: 'Облицювання виробу замовника', unit: 'm2', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Керамограніт' },
  { code: '224690', name: 'зведення стика стільниці з підворотом', unit: 'pcs', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Кварцит' },
  { code: '224675', name: 'зведення стика стільниці з підворотом', unit: 'pcs', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Керамограніт' },
  { code: '224696', name: 'Поклейка крайки-опуску більше 50 мм', unit: 'm', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Кварцит' },
  { code: '224680', name: 'Поклейка крайки-опуску більше 50 мм', unit: 'm', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Керамограніт' },
  { code: '203115', name: 'Формування епоксидного кута (фаска R2)', unit: 'm', category: 'manual', section: 'Ділянка: Поклейка крайки', materialGroup: 'Керамограніт' },
  { code: '195717', name: 'Обробка крайки "Антик"', unit: 'm', category: 'machine', section: 'Ділянка: Полірування', materialGroup: 'Кварцит' },
  { code: '203141', name: 'Шліфування тильної сторони кварциту', unit: 'm2', category: 'machine', section: 'Ділянка: Полірування', materialGroup: 'Кварцит' },
  { code: '203142', name: 'Полірування тильної сторони кварциту', unit: 'm2', category: 'machine', section: 'Ділянка: Полірування', materialGroup: 'Кварцит' },
  { code: '203143', name: 'Брашування тильноі сторони кварциту', unit: 'm2', category: 'machine', section: 'Ділянка: Полірування', materialGroup: 'Кварцит' },
  { code: '203114', name: 'Шліфування тильної сторони керамограніту', unit: 'm2', category: 'machine', section: 'Ділянка: Полірування', materialGroup: 'Керамограніт' },
  { code: '195705', name: 'Вклейка цільної фанери одинарної товщини', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Кварцит' },
  { code: '195371', name: 'Вклейка цільної фанери одинарної товщини', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Керамограніт' },
  { code: '195706', name: 'Вклейка фанерного каркасу з фанерного брусу', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Кварцит' },
  { code: '195707', name: 'Вклейка фанерного коробу', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Кварцит' },
  { code: '195373', name: 'Вклейка фанерного коробу', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Керамограніт' },
  { code: '195708', name: 'Фарбування тильної сторони каркасу', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Кварцит' },
  { code: '195374', name: 'Фарбування тильної сторони каркасу', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Керамограніт' },
  { code: '195722', name: 'Нанесення термошву на виріб', unit: 'm', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Кварцит' },
  { code: '195388', name: 'Нанесення термошву на виріб', unit: 'm', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Керамограніт' },
  { code: '203119', name: 'Вклейка WEDI', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Кварцит' },
  { code: '203106', name: 'Вклейка WEDI', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Керамограніт' },
  { code: '224694', name: 'Шліфування фанери', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Кварцит' },
  { code: '224678', name: 'Шліфування фанери', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Керамограніт' },
  { code: '195372', name: 'Клейка фанерного каркасу з фанерного брусу', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Керамограніт' },
  { code: '203105', name: 'Поклейка HPL', unit: 'm2', category: 'manual', section: 'Ділянка: Фанера', materialGroup: 'Керамограніт' },
  { code: '195711', name: 'Зведення складної фаски при стикуванні виробу', unit: 'pcs', category: 'manual', section: 'Ділянка: Шліфування', materialGroup: 'Кварцит' },
  { code: '195715', name: 'Нанесення технічної фаски', unit: 'm', category: 'manual', section: 'Ділянка: Шліфування', materialGroup: 'Кварцит' },
  { code: '195378', name: 'Нанесення технічної фаски', unit: 'm', category: 'manual', section: 'Ділянка: Шліфування', materialGroup: 'Керамограніт' },
  { code: '195716', name: 'Ручне нанесення фаски 2х2', unit: 'm', category: 'manual', section: 'Ділянка: Шліфування', materialGroup: 'Кварцит' },
  { code: '195379', name: 'Ручне нанесення фаски 2х2', unit: 'm', category: 'manual', section: 'Ділянка: Шліфування', materialGroup: 'Керамограніт' },
  { code: '195720', name: '3Д полірування поверхні матеріалу', unit: 'm2', category: 'manual', section: 'Ділянка: Шліфування', materialGroup: 'Кварцит' },
  { code: '224688', name: 'Допрацювання R2', unit: 'm', category: 'manual', section: 'Ділянка: Шліфування', materialGroup: 'Кварцит' },
  { code: '224674', name: 'Допрацювання R2', unit: 'm', category: 'manual', section: 'Ділянка: Шліфування', materialGroup: 'Керамограніт' },
  { code: '224689', name: 'Допрацювання R5-R10', unit: 'm', category: 'manual', section: 'Ділянка: Шліфування', materialGroup: 'Кварцит' },
  { code: '224693', name: 'Стикування зведення фаски на опорі', unit: 'pcs', category: 'manual', section: 'Ділянка: Шліфування', materialGroup: 'Кварцит' },
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
