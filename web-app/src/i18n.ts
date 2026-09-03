import type { CalculationStatus, PackingMode, UiLanguage } from './domain/types';
import { staticUiText } from './i18nStatic';
import { staticUiPatterns } from './i18nPatterns';

export const languageOptions: Array<{ value: UiLanguage; label: string }> = [
  { value: 'uk', label: 'Українська' },
  { value: 'en', label: 'English' },
  { value: 'pl', label: 'Polski' },
];

const messages = {
  uk: {
    language: 'Мова',
    orderNumber: 'Номер замовлення',
    customer: 'Контрагент',
    clearCalculation: 'Очистити розрахунок',
    confirmClear: 'Очистити всі слеби, фото, деталі та поточний розрахунок?',
    textureSelection: 'Підбір текстури',
    recalculate: 'Перерахувати',
    selectCutMode: 'Вибрати режим розкрою',
    mode: 'Режим',
    economy: 'Економний',
    optimal: 'Оптимальний',
    fullTexture: 'Повна текстура',
    status: 'Статус',
    totalBlankArea: 'Площа всіх заготовок',
    detailArea: 'Площа деталей',
    slabCount: 'Кількість слебів',
    updated: 'Оновлено',
    squareMeters: 'м²',
    technical: 'Технічний',
    photoSurface: 'Поверх фото',
    textureMode: 'Текстурний режим',
    dimensions: 'Розміри',
    angle: 'Кут',
    pinToSlab: 'Прив’язати до слеба',
    unpinFromSlab: 'Відв’язати від слеба',
    lockPlacement: 'Зафіксувати',
    unlockPlacement: 'Зняти фіксацію',
    lockAssembly: 'Зафіксувати збірку',
    unlockAssembly: 'Зняти фіксацію збірки',
    edit: 'Редагувати',
    copy: 'Копіювати',
    delete: 'Видалити',
    recalcSlab: 'Перерахувати слеб',
    addPhoto: 'Додати фото',
    addDefect: 'Додати дефект',
    additionalDimension: 'Додатковий розмір',
    clearManualDimensions: 'Очистити додаткові розміри',
    deleteManualDimension: 'Видалити розмір',
    editSlab: 'Редагувати слеб',
    save: 'Застосувати',
    pinConflictWarning: 'Неможливо прив’язати: деталь має конфлікт або виходить за межі слеба.',
    quickActions: 'Швидкі дії',
    saveProject: 'Зберегти проект',
    loadProject: 'Завантажити проект',
    exportPng: 'Експортувати PNG',
    exportPdf: 'Експортувати PDF',
    statusSuccess: 'Успішно',
    statusPartial: 'Частково',
    statusFailed: 'Не сформовано',
    statusManualConflict: 'Конфлікт після ручного редагування',
    statusOutOfBounds: 'Поза корисною зоною',
    statusError: 'Конфлікт розміщення',
    statusPacking: 'Пакування...',
  },
  en: {
    language: 'Language',
    orderNumber: 'Order number',
    customer: 'Customer',
    clearCalculation: 'Clear calculation',
    confirmClear: 'Clear all slabs, photos, details, and the current calculation?',
    textureSelection: 'Texture matching',
    recalculate: 'Recalculate',
    selectCutMode: 'Select cutting mode',
    mode: 'Mode',
    economy: 'Economy',
    optimal: 'Optimal',
    fullTexture: 'Full texture',
    status: 'Status',
    totalBlankArea: 'Total blank area',
    detailArea: 'Detail area',
    slabCount: 'Slab count',
    updated: 'Updated',
    squareMeters: 'm²',
    technical: 'Technical',
    photoSurface: 'Photo surface',
    textureMode: 'Texture mode',
    dimensions: 'Dimensions',
    angle: 'Angle',
    pinToSlab: 'Pin to slab',
    unpinFromSlab: 'Unpin from slab',
    lockPlacement: 'Lock',
    unlockPlacement: 'Unlock',
    lockAssembly: 'Lock assembly',
    unlockAssembly: 'Unlock assembly',
    edit: 'Edit',
    copy: 'Copy',
    delete: 'Delete',
    recalcSlab: 'Recalculate slab',
    addPhoto: 'Add photo',
    addDefect: 'Add defect',
    additionalDimension: 'Additional dimension',
    clearManualDimensions: 'Clear additional dimensions',
    deleteManualDimension: 'Delete dimension',
    editSlab: 'Edit slab',
    save: 'Apply',
    pinConflictWarning: 'Cannot pin: the detail has a conflict or is outside the slab.',
    quickActions: 'Quick actions',
    saveProject: 'Save project',
    loadProject: 'Load project',
    exportPng: 'Export PNG',
    exportPdf: 'Export PDF',
    statusSuccess: 'Success',
    statusPartial: 'Partial',
    statusFailed: 'Not calculated',
    statusManualConflict: 'Conflict after manual editing',
    statusOutOfBounds: 'Outside usable area',
    statusError: 'Placement conflict',
    statusPacking: 'Packing...',
  },
  pl: {
    language: 'Język',
    orderNumber: 'Numer zamówienia',
    customer: 'Kontrahent',
    clearCalculation: 'Wyczyść obliczenia',
    confirmClear: 'Wyczyścić wszystkie slaby, zdjęcia, detale i bieżące obliczenia?',
    textureSelection: 'Dobór tekstury',
    recalculate: 'Przelicz',
    selectCutMode: 'Wybierz tryb rozkroju',
    mode: 'Tryb',
    economy: 'Ekonomiczny',
    optimal: 'Optymalny',
    fullTexture: 'Pełna tekstura',
    status: 'Status',
    totalBlankArea: 'Powierzchnia wszystkich formatek',
    detailArea: 'Powierzchnia detali',
    slabCount: 'Liczba slabów',
    updated: 'Zaktualizowano',
    squareMeters: 'm²',
    technical: 'Techniczny',
    photoSurface: 'Na zdjęciu',
    textureMode: 'Tryb tekstury',
    dimensions: 'Wymiary',
    angle: 'Kąt',
    pinToSlab: 'Przypnij do slabu',
    unpinFromSlab: 'Odepnij od slabu',
    lockPlacement: 'Zablokuj',
    unlockPlacement: 'Odblokuj',
    lockAssembly: 'Zablokuj zestaw',
    unlockAssembly: 'Odblokuj zestaw',
    edit: 'Edytuj',
    copy: 'Kopiuj',
    delete: 'Usuń',
    recalcSlab: 'Przelicz slab',
    addPhoto: 'Dodaj zdjęcie',
    addDefect: 'Dodaj defekt',
    additionalDimension: 'Dodatkowy wymiar',
    clearManualDimensions: 'Wyczyść dodatkowe wymiary',
    deleteManualDimension: 'Usuń wymiar',
    editSlab: 'Edytuj slab',
    save: 'Zastosuj',
    pinConflictWarning: 'Nie można przypiąć: detal ma konflikt albo wychodzi poza slab.',
    quickActions: 'Szybkie akcje',
    saveProject: 'Zapisz projekt',
    loadProject: 'Wczytaj projekt',
    exportPng: 'Eksportuj PNG',
    exportPdf: 'Eksportuj PDF',
    statusSuccess: 'Sukces',
    statusPartial: 'Częściowo',
    statusFailed: 'Nie utworzono',
    statusManualConflict: 'Konflikt po ręcznej edycji',
    statusOutOfBounds: 'Poza obszarem roboczym',
    statusError: 'Konflikt rozmieszczenia',
    statusPacking: 'Pakowanie...',
  },
} as const;

export type TranslationKey = keyof typeof messages.uk;

export function t(language: UiLanguage | undefined, key: TranslationKey) {
  return messages[language ?? 'uk']?.[key] ?? messages.uk[key];
}

export function packingModeLabel(language: UiLanguage | undefined, mode: PackingMode) {
  if (mode === 'economy') return t(language, 'economy');
  if (mode === 'optimal') return t(language, 'optimal');
  return t(language, 'fullTexture');
}

export function statusLabel(language: UiLanguage | undefined, status: CalculationStatus) {
  if (status === 'success') return t(language, 'statusSuccess');
  if (status === 'partial') return t(language, 'statusPartial');
  if (status === 'manual_conflict') return t(language, 'statusManualConflict');
  if (status === 'out_of_bounds') return t(language, 'statusOutOfBounds');
  if (status === 'error') return t(language, 'statusError');
  if (status === 'packing') return t(language, 'statusPacking');
  return t(language, 'statusFailed');
}

export function localeForLanguage(language: UiLanguage | undefined) {
  if (language === 'en') return 'en-US';
  if (language === 'pl') return 'pl-PL';
  return 'uk-UA';
}

const reverseStaticUiText = new Map<string, string>();
Object.entries(staticUiText).forEach(([source, translations]) => {
  reverseStaticUiText.set(source, source);
  reverseStaticUiText.set(translations.en, source);
  reverseStaticUiText.set(translations.pl, source);
});

function sourceUiText(text: string) {
  return reverseStaticUiText.get(text.trim());
}

/**
 * ШАБЛОНИ З ПІДСТАНОВКОЮ — другий ешелон після точного словника.
 *
 * Зразок «Радіус: {0} мм» перетворюється на регулярку з групою на кожне
 * місце підстановки. Ліниво: регулярки збираються при першому зверненні,
 * бо на українській мові вони взагалі не потрібні.
 */
const CYRILLIC_RE = /[А-Яа-яІіЇїЄєҐґ]/;
const NUMBER_SLOT = '([-+\\d][\\d\\s.,×xX*/+-]*)';
// Латиниця і цифри: літера сторони (A…F), артикул, код профілю. Кирилиці тут
// свідомо немає — інакше «Кут {0}» з'їв би «Кут нахилу».
const CODE_SLOT = '([A-Za-z0-9Ø][A-Za-z0-9.,°×+/Ø-]{0,11})';
const FREE_SLOT = '([\\s\\S]+?)';

let compiledPatterns: RegExp[] | null = null;
/**
 * Порядок перебору: спершу найдовший сталий текст. Інакше «Виріз {0} мм»
 * забрав би собі «Виріз під розетку 410×12 мм», і уточнення загубилось би.
 * У самому файлі шаблони згруповані по джерелах — так їх зручніше читати,
 * тому черговість задаємо тут, а не порядком рядків.
 */
let patternOrder: number[] | null = null;

function splitOnSlots(text: string) {
  return text.split(/\{\d+\}/);
}

function slotOrder(text: string) {
  return Array.from(text.matchAll(/\{(\d+)\}/g)).map((m) => Number(m[1]));
}

function compilePatterns(): RegExp[] {
  return staticUiPatterns.map((entry) => {
    const slot = entry.guard === 'number' ? NUMBER_SLOT
      : entry.guard === 'code' ? CODE_SLOT
        : FREE_SLOT;
    const body = splitOnSlots(entry.pattern)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join(slot);
    return new RegExp(`^${body}$`);
  });
}

function fillTemplate(template: string, groups: string[]) {
  return splitOnSlots(template).reduce((acc, part, index) => {
    if (index === 0) return part;
    const slot = slotOrder(template)[index - 1] ?? index - 1;
    return `${acc}${groups[slot] ?? ''}${part}`;
  }, '');
}

/**
 * Підставлене значення теж буває словниковим: «Виготовлення: Стільниця без
 * потовщень — Laminam». Значення пробуємо ТІЛЬКИ точним словником (пускати
 * сюди шаблони означало б рекурсію), спершу цілком, а потім по сегментах —
 * назви в прорахунку склеюються з частин через « — », « · » і кому, і
 * перекладна там зазвичай лише перша.
 */
const VALUE_SEPARATORS = /( — | · |, )/;

function translateValue(language: 'en' | 'pl', value: string | undefined): string {
  if (!value) return value ?? '';
  const whole = sourceUiText(value);
  if (whole) return staticUiText[whole][language];
  if (!VALUE_SEPARATORS.test(value)) return value;
  return value
    .split(VALUE_SEPARATORS)
    .map((part) => {
      const source = sourceUiText(part);
      return source ? staticUiText[source][language] : part;
    })
    .join('');
}

function translateByPattern(language: 'en' | 'pl', trimmed: string) {
  if (!CYRILLIC_RE.test(trimmed)) return null;
  if (!compiledPatterns) compiledPatterns = compilePatterns();
  if (!patternOrder) {
    const literalLength = (index: number) =>
      staticUiPatterns[index].pattern.replace(/\{\d+\}/g, '').length;
    patternOrder = staticUiPatterns
      .map((_, index) => index)
      .sort((a, b) => literalLength(b) - literalLength(a));
  }
  for (let i = 0; i < patternOrder.length; i += 1) {
    const index = patternOrder[i];
    const match = compiledPatterns[index].exec(trimmed);
    if (!match) continue;
    return fillTemplate(staticUiPatterns[index][language], match.slice(1).map((group) => translateValue(language, group)));
  }
  return null;
}

export function translateStaticUiText(language: UiLanguage | undefined, text: string) {
  const leading = text.match(/^\s*/)?.[0] ?? '';
  const trailing = text.match(/\s*$/)?.[0] ?? '';
  const trimmed = text.trim();
  const source = sourceUiText(trimmed);
  if (source) {
    if (language === 'uk' || !language) return `${leading}${source}${trailing}`;
    return `${leading}${staticUiText[source][language]}${trailing}`;
  }
  if (language === 'uk' || !language) return text;
  const patterned = translateByPattern(language, trimmed);
  return patterned === null ? text : `${leading}${patterned}${trailing}`;
}
