/**
 * ШАБЛОНИ ІНТЕРФЕЙСУ З ПІДСТАНОВКОЮ.
 *
 * Словник `staticUiText` міняє текст вузла тільки за точним збігом, тому
 * підпис, зібраний із числом («Радіус: 12 мм», «Сторона A»), туди не
 * покласти: у DOM це один вузол, і його текст щоразу інший. Тут лежать ті
 * самі підписи у вигляді шаблонів, де `{0}`, `{1}` — місця підстановки.
 *
 * Два запобіжники, які роблять це безпечним:
 *  · місце підстановки НЕ приліплене до українського слова. Інакше шаблон
 *    на кшталт `{0}ого` (відмінкове закінчення з генератора назв) з'їв би
 *    будь-який текст, що закінчується на «ого»;
 *  · guard звужує те, що взагалі можна підставити: "number" — число з
 *    розмірністю (без нього `{0} мм` перехопив би будь-який рядок, що
 *    закінчується на «мм»), "code" — латинська літера сторони чи артикул
 *    (щоб `Кут {0}` брав «Кут A», але не «Кут нахилу»).
 *
 * Шаблони пробуються ПІСЛЯ точного словника і лише якщо в тексті є
 * кирилиця — на англійській та польській це майже завжди нуль перевірок.
 */
export type UiTextPattern = {
  /** Український зразок, `{n}` — місце підстановки. */
  pattern: string;
  en: string;
  pl: string;
  /** Чим може бути підставлене значення: число/розмір або латинський код. */
  guard?: 'number' | 'code';
};

export const staticUiPatterns: UiTextPattern[] = [
  // ─── _units ───
  { pattern: "{0} виріб", en: "{0} product", pl: "{0} produkt", guard: 'number' },
  { pattern: "{0} вироби", en: "{0} products", pl: "{0} produkty", guard: 'number' },
  { pattern: "{0} виробів", en: "{0} products", pl: "{0} produktów", guard: 'number' },
  { pattern: "{0} деталь", en: "{0} detail", pl: "{0} detal", guard: 'number' },
  { pattern: "{0} деталі", en: "{0} details", pl: "{0} detale", guard: 'number' },
  { pattern: "{0} деталей", en: "{0} details", pl: "{0} detali", guard: 'number' },
  { pattern: "{0} слеб", en: "{0} slab", pl: "{0} slab", guard: 'number' },
  { pattern: "{0} слеби", en: "{0} slabs", pl: "{0} slaby", guard: 'number' },
  { pattern: "{0} слебів", en: "{0} slabs", pl: "{0} slabów", guard: 'number' },
  { pattern: "{0} м.п.", en: "{0} lm", pl: "{0} mb", guard: 'number' },
  { pattern: "{0} м²", en: "{0} m²", pl: "{0} m²", guard: 'number' },
  { pattern: "{0} мм", en: "{0} mm", pl: "{0} mm", guard: 'number' },
  { pattern: "{0} шт", en: "{0} pcs", pl: "{0} szt", guard: 'number' },

  // ─── components/2d/SlabBoard.tsx ───
  { pattern: "{0} копія", en: "{0} copy", pl: "{0} kopia" },

  // ─── components/2d/canvasUtils.ts ───
  { pattern: "Сторона {0}", en: "Side {0}", pl: "Strona {0}" },

  // ─── components/assembly/AssemblyConnectionsPanel.tsx ───
  { pattern: "Деталь {0}", en: "Detail {0}", pl: "Detal {0}" },

  // ─── components/forms/import/approvalCanvasUtils.ts ───
  { pattern: "Бланк група {0}", en: "Form group {0}", pl: "Grupa formularza {0}" },

  // ─── components/ui/QuotePanel.tsx ───
  { pattern: "без ціни: {0}", en: "no price: {0}", pl: "bez ceny: {0}", guard: 'number' },

  // ─── components/ui/CutoutProcessingModal.tsx ───
  { pattern: "Від кута по {0}", en: "From corner along {0}", pl: "Od narożnika wzdłuż {0}" },
  { pattern: "Центр по {0}", en: "Center along {0}", pl: "Środek wzdłuż {0}" },

  // ─── components/ui/DetailPassportModal.tsx ───
  { pattern: "виріз {0}", en: "cutout {0}", pl: "wycięcie {0}" },
  { pattern: "сторона {0}", en: "side {0}", pl: "strona {0}" },

  // ─── components/ui/FormsPanel.tsx ───
  { pattern: ", сторона {0}", en: ", side {0}", pl: ", strona {0}" },
  { pattern: "DXF блок {0}", en: "DXF block {0}", pl: "Blok DXF {0}" },
  { pattern: "Бланк {0} виріб {1}", en: "Form {0} product {1}", pl: "Formularz {0} produkt {1}" },
  { pattern: "Блокову прив’язку створено: {0} контури, підв’язано елементів: {1}.", en: "Block binding created: {0} contours, elements bound: {1}.", pl: "Utworzono powiązanie blokowe: {0} kontury, powiązanych elementów: {1}." },
  { pattern: "Блокову прив’язку створено: {0} контури.", en: "Block binding created: {0} contours.", pl: "Utworzono powiązanie blokowe: {0} kontury." },
  { pattern: "Не вдалося прочитати бланк погодження: {0}", en: "Failed to read the approval form: {0}", pl: "Nie udało się odczytać formularza zatwierdzenia: {0}" },
  { pattern: "Не вдалося прочитати файл.\\n\\n{0}", en: "Failed to read the file.\\n\\n{0}", pl: "Nie udało się odczytać pliku.\\n\\n{0}" },

  // ─── components/ui/ProductEditorWorkspace.tsx ───
  { pattern: "Г-виріз: {0}x{1} мм", en: "L-cutout: {0}x{1} mm", pl: "Wycięcie L: {0}x{1} mm" },
  { pattern: "Радіус: {0} мм", en: "Radius: {0} mm", pl: "Promień: {0} mm" },
  { pattern: "Редагування: {0} {1}", en: "Editing: {0} {1}", pl: "Edycja: {0} {1}" },
  { pattern: "Розмір: {0}x{1} мм", en: "Size: {0}x{1} mm", pl: "Rozmiar: {0}x{1} mm" },
  { pattern: "Сегмент {0}", en: "Segment {0}", pl: "Segment {0}" },
  { pattern: "Фаска: {0}x{1} мм", en: "Chamfer: {0}x{1} mm", pl: "Faza: {0}x{1} mm" },

  // ─── components/ui/ProjectsDashboard.tsx ───
  { pattern: "Нове замовлення {0}", en: "New order {0}", pl: "Nowe zamówienie {0}" },

  // ─── components/ui/ElementSettingsModal.tsx (FG-10) ───
  { pattern: "вужча за {0} мм — деталь ризикована, цех може відмовити",
    en: "is narrower than {0} mm — risky detail, the shop may refuse",
    pl: "jest węższa niż {0} mm — ryzykowny detal, zakład może odmówić", guard: 'number' },

  // ─── components/ui/QuotePanel.tsx ───
  { pattern: "Зона {0}", en: "Zone {0}", pl: "Strefa {0}" },

  // ─── components/ui/QuoteSettingsModal.tsx ───
  { pattern: "Вбудований код: {0}. Впишіть свій, щоб перекрити.", en: "Built-in code: {0}. Enter your own to override it.", pl: "Wbudowany kod: {0}. Wpisz własny, aby go nadpisać." },
  { pattern: "Виїзд — зона {0}", en: "Site visit — zone {0}", pl: "Dojazd — strefa {0}" },
  { pattern: "Дерев'яна піраміда {0} мм", en: "Wooden pyramid {0} mm", pl: "Piramida drewniana {0} mm" },
  { pattern: "Замір ({0})", en: "Measurement ({0})", pl: "Pomiar ({0})" },

  // ─── components/ui/ServiceMappingPanel.tsx ───
  { pattern: "{0} прив'язок увімкнено, {1} внутрішніх вимкнено", en: "{0} bindings enabled, {1} internal ones disabled", pl: "{0} powiązań włączono, {1} wewnętrznych wyłączono" },
  { pattern: "Додано {0} послуг із довідника, {1} вже були в каталозі — їхні ціни не змінені", en: "Added {0} services from the reference list, {1} were already in the catalog — their prices are unchanged", pl: "Dodano {0} usług ze słownika, {1} już były w katalogu — ich ceny nie zostały zmienione" },
  { pattern: "Розрахунок переведено на облікові коди: {0} послуг у каталозі,", en: "Calculation switched to accounting codes: {0} services in the catalog,", pl: "Kalkulacja przeniesiona na kody księgowe: {0} usług w katalogu," },
  { pattern: "Усі {0} позицій довідника вже в каталозі", en: "All {0} reference list items are already in the catalog", pl: "Wszystkie {0} pozycji ze słownika są już w katalogu" },

  // ─── domain/manufacturability.ts ───
  { pattern: "{0}, кут {1}: внутрішній радіус {2} мм із обробкою крайки. Мінімум — {3} мм", en: "{0}, corner {1}: inner radius {2} mm with edging processing. Minimum — {3} mm", pl: "{0}, narożnik {1}: promień wewnętrzny {2} mm z obróbką obrzeża. Minimum — {3} mm" },
  { pattern: "{0}, кут {1}: зовнішній радіус {2} мм. Рекомендований мінімум — {3} мм", en: "{0}, corner {1}: outer radius {2} mm. Recommended minimum — {3} mm", pl: "{0}, narożnik {1}: promień zewnętrzny {2} mm. Zalecane minimum — {3} mm" },
  { pattern: "«{0}» — {1}×{2} мм. Більше за {3}×{4} мм на верстат не заходить", en: "«{0}» — {1}×{2} mm. Anything larger than {3}×{4} mm does not fit the machine", pl: "«{0}» — {1}×{2} mm. Większe niż {3}×{4} mm nie mieści się na obrabiarce" },
  { pattern: "«{0}» — {1}×{2} мм. Деталь із обробкою не може бути меншою за {3}×{4} мм", en: "«{0}» — {1}×{2} mm. A detail with processing cannot be smaller than {3}×{4} mm", pl: "«{0}» — {1}×{2} mm. Detal z obróbką nie może być mniejszy niż {3}×{4} mm" },
  { pattern: "«{0}» — {1}×{2} мм. За довжини {3} мм ширина має бути від {4} мм", en: "«{0}» — {1}×{2} mm. At a length of {3} mm the width must be at least {4} mm", pl: "«{0}» — {1}×{2} mm. Przy długości {3} mm szerokość musi wynosić co najmniej {4} mm" },
  { pattern: "«{0}»: виріз за {1} мм від краю. Гарантійний мінімум — {2} мм", en: "«{0}»: cutout at {1} mm from the edge. Warranty minimum — {2} mm", pl: "«{0}»: wycięcie w odległości {1} mm od krawędzi. Minimum gwarancyjne — {2} mm" },
  { pattern: "«{0}»: між вирізами {1} мм. Гарантійний мінімум — {2} мм", en: "«{0}»: {1} mm between cutouts. Warranty minimum — {2} mm", pl: "«{0}»: {1} mm między wycięciami. Minimum gwarancyjne — {2} mm" },
  { pattern: "«{0}»: отвір Ø{1} мм за {2} мм від краю. Гарантійний мінімум — {3} мм", en: "«{0}»: hole Ø{1} mm at {2} mm from the edge. Warranty minimum — {3} mm", pl: "«{0}»: otwór Ø{1} mm w odległości {2} mm od krawędzi. Minimum gwarancyjne — {3} mm" },
  { pattern: "«{0}»: отвір Ø{1} мм при ширині деталі {2} мм. Максимум — Ø{3} мм", en: "«{0}»: hole Ø{1} mm with a detail width of {2} mm. Maximum — Ø{3} mm", pl: "«{0}»: otwór Ø{1} mm przy szerokości detalu {2} mm. Maksimum — Ø{3} mm" },
  { pattern: "«{0}»: отвір Ø{1} мм. Мінімум — Ø{2} мм", en: "«{0}»: hole Ø{1} mm. Minimum — Ø{2} mm", pl: "«{0}»: otwór Ø{1} mm. Minimum — Ø{2} mm" },
  { pattern: "Виріз {0}: радіус у куті {1} мм. Для матеріалу «{2}» мінімум — {3} мм", en: "Cutout {0}: corner radius {1} mm. For material «{2}» minimum — {3} mm", pl: "Wycięcie {0}: promień w narożniku {1} mm. Dla materiału «{2}» minimum — {3} mm" },

  // ─── domain/productSink.ts ───
  { pattern: "Мийка ({0})", en: "Sink ({0})", pl: "Zlew ({0})" },

  // ─── domain/serviceMapping.ts ───
  { pattern: "Послуги «{0}» немає в каталозі", en: "Service «{0}» is not in the catalog", pl: "Usługi «{0}» nie ma w katalogu" },
  { pattern: "Факт міряється в «{0}», а послуга «{1}» — в «{2}»", en: "Actual is measured in «{0}», and the service «{1}» — in «{2}»", pl: "Wartość rzeczywista jest mierzona w «{0}», a usługa «{1}» — w «{2}»" },

  // ─── engines/geometry.ts ───
  { pattern: "{0} {1} сторона {2}", en: "{0} {1} side {2}", pl: "{0} {1} strona {2}" },
  { pattern: "{0} текстура", en: "{0} texture", pl: "{0} tekstura" },
  { pattern: "Довільний елемент part missing sideSegments. Falling back to bounding box. ID: {0}", en: "Custom element part missing sideSegments. Falling back to bounding box. ID: {0}", pl: "Dowolny element part missing sideSegments. Falling back to bounding box. ID: {0}" },
  { pattern: "Стик посунуто з {0} мм на {1} мм:", en: "Joint moved from {0} mm to {1} mm:", pl: "Styk przesunięto z {0} mm na {1} mm:" },
  { pattern: "Стик посунуто з {0} мм на {1} мм:", en: "The joint was moved from {0} mm to {1} mm:", pl: "Styk przesunięto z {0} mm na {1} mm:" },

  // ─── engines/pricing.ts ───
  { pattern: "Кромка: {0}", en: "Edge: {0}", pl: "Krawędź: {0}" },

  // ─── engines/quoteCalc.ts ───
  { pattern: "(з ногою {0} м²)", en: "(with leg {0} m²)", pl: "(z nogą {0} m²)" },
  { pattern: ", декор {0}", en: ", decor {0}", pl: ", dekor {0}" },
  { pattern: "«{0}» без розмірів — не потрапляє в розрахунок", en: "«{0}» has no dimensions — not included in the calculation", pl: "«{0}» bez wymiarów — nie jest uwzględniany w obliczeniach" },
  { pattern: "«{0}» без стільниці в замовленні — площу враховано за номенклатурою стільниці", en: "«{0}» has no countertop in the order — the area is counted from the countertop item", pl: "«{0}» bez blatu w zamówieniu — powierzchnię policzono według pozycji blatu" },
  { pattern: "Без ціни: {0} з {1} рядків — впишіть ціни в рядках або наповніть прайс", en: "No price: {0} of {1} rows — enter prices in the rows or fill in the price list", pl: "Bez ceny: {0} z {1} wierszy — wpisz ceny w wierszach lub uzupełnij cennik" },
  { pattern: "Виготовлення: {0}", en: "Manufacturing: {0}", pl: "Wykonanie: {0}" },
  { pattern: "Виїзд на адресу (зона {0})", en: "Travel to address (zone {0})", pl: "Dojazd pod adres (strefa {0})" },
  { pattern: "Матеріал: {0}", en: "Material: {0}", pl: "Materiał: {0}" },
  { pattern: "Найдовша деталь {0} мм не влазить у піраміду {1} мм", en: "The longest detail {0} mm does not fit in the pyramid {1} mm", pl: "Najdłuższy detal {0} mm nie mieści się w piramidzie {1} mm" },
  { pattern: "Невідомий тип виробу: {0}", en: "Unknown product type: {0}", pl: "Nieznany typ produktu: {0}" },

  // ─── parsers/dxf/parser.ts ───
  { pattern: "DXF група {0}", en: "DXF group {0}", pl: "Grupa DXF {0}" },

  // ─── store/projectHelpers.ts ───
  { pattern: "[flattenProductToDetails] Увага: виявлено вкладеність доповнень більшу за 1 (елемент {0}).", en: "[flattenProductToDetails] Warning: add-on nesting deeper than 1 level detected (element {0}).", pl: "[flattenProductToDetails] Uwaga: wykryto zagnieżdżenie dodatków większe niż 1 (element {0})." },

  // ─── utils/approvalImport.ts ───
  { pattern: "Кромка сторони {0} не має надійно знайденого сегмента на контурі.", en: "The edge of side {0} has no reliably detected segment on the contour.", pl: "Dla krawędzi strony {0} nie znaleziono pewnego segmentu na konturze." },
  { pattern: "Нога по стороні {0} ({1})", en: "Leg along side {0} ({1})", pl: "Noga wzdłuż strony {0} ({1})" },
  { pattern: "Площа геометрії відрізняється від площі в бланку на {0}%.", en: "The geometry area differs from the area in the form by {0}%.", pl: "Powierzchnia geometrii różni się od powierzchni w formularzu o {0}%." },
  { pattern: "Стінова панель по стороні {0}", en: "Wall panel along side {0}", pl: "Panel ścienny wzdłuż strony {0}" },

  // ─── utils/export/quotePdf.ts ───
  { pattern: "(зона виїзду {0})", en: "(travel zone {0})", pl: "(strefa dojazdu {0})" },
  { pattern: "{0}={1} мм", en: "{0}={1} mm", pl: "{0}={1} mm", guard: 'code' },
  { pattern: "БЛАНК ПОГОДЖЕННЯ ВИРОБУ ДО ЗАМОВЛЕННЯ № {0}", en: "PRODUCT APPROVAL FORM FOR ORDER No. {0}", pl: "FORMULARZ ZATWIERDZENIA PRODUKTU DO ZAMÓWIENIA NR {0}" },
  { pattern: "Виріб №{0} — {1} ({2} м.кв)", en: "Product No. {0} — {1} ({2} m²)", pl: "Produkt nr {0} — {1} ({2} m²)" },
  { pattern: "Виріз {0} мм", en: "Cutout {0} mm", pl: "Wycięcie {0} mm", guard: 'code' },
  { pattern: "Виріз під змішувач {0} мм", en: "Cutout for faucet {0} mm", pl: "Wycięcie pod baterię {0} mm", guard: 'code' },
  { pattern: "Виріз під розетку {0} мм", en: "Cutout for socket {0} mm", pl: "Wycięcie pod gniazdko {0} mm", guard: 'code' },
  { pattern: "Крайка — {0}", en: "Edging — {0}", pl: "Obrzeże — {0}" },
  { pattern: "Кут {0}", en: "Corner {0}", pl: "Narożnik {0}", guard: 'code' },
  { pattern: "Потовщення — сторона {0}", en: "Thickening — side {0}", pl: "Pogrubienie — bok {0}", guard: 'code' },
  { pattern: "Підворот — сторона {0}", en: "Fold — side {0}", pl: "Podwinięcie — bok {0}", guard: 'code' },
  { pattern: "Бортик {0}", en: "Upstand {0}", pl: "Rant {0}" },
  { pattern: "Потовщення {0}", en: "Thickening {0}", pl: "Pogrubienie {0}" },
  { pattern: "Підворот {0}", en: "Fold {0}", pl: "Podwinięcie {0}" },
  { pattern: "Прорахунок № {0} · продовження", en: "Calculation No. {0} · continued", pl: "Kalkulacja nr {0} · ciąg dalszy" },
  { pattern: "Прорахунок_{0}_{1}.pdf", en: "Calculation_{0}_{1}.pdf", pl: "Kalkulacja_{0}_{1}.pdf" },
  { pattern: "Радіус R{0}", en: "Radius R{0}", pl: "Promień R{0}" },
  { pattern: "Сторінка {0} з {1}", en: "Page {0} of {1}", pl: "Strona {0} z {1}" },
  { pattern: "кут {0}", en: "corner {0}", pl: "narożnik {0}", guard: 'code' },
  { pattern: "стик: {0}", en: "joint: {0}", pl: "styk: {0}" },

  // ─── utils/sketchupImport.ts ───
  { pattern: "Імпорт не виконано.\\n\\n{0}", en: "Import failed.\\n\\n{0}", pl: "Import nie powiódł się.\\n\\n{0}" },
  { pattern: "Виріб: {0}", en: "Product: {0}", pl: "Produkt: {0}" },
  { pattern: "Елемент {0}", en: "Element {0}", pl: "Element {0}" },
  { pattern: "Невідомий формат файлу: {0}. Очікується \"slabcut-sketchup\".", en: "Unknown file format: {0}. Expected \"slabcut-sketchup\".", pl: "Nieznany format pliku: {0}. Oczekiwano \"slabcut-sketchup\"." },
  { pattern: "Непідтримувана версія формату: {0}. Очікується 1.", en: "Unsupported format version: {0}. Expected 1.", pl: "Nieobsługiwana wersja formatu: {0}. Oczekiwano 1." },
  { pattern: "Очікуються міліметри, а у файлі: {0}.", en: "Millimeters expected, but the file has: {0}.", pl: "Oczekiwano milimetrów, a w pliku jest: {0}." },
  { pattern: "Прийнято деталей: {0}", en: "Details accepted: {0}", pl: "Przyjęto detali: {0}" },
  { pattern: "Увага ({0}):", en: "Warning ({0}):", pl: "Uwaga ({0}):" },
  { pattern: "габарит замалий ({0}×{1} мм)", en: "size too small ({0}×{1} mm)", pl: "gabaryt za mały ({0}×{1} mm)" },
  { pattern: "слот \"{0}\" уже зайнятий, перейменовано на \"{1}\"", en: "slot \"{0}\" is already taken, renamed to \"{1}\"", pl: "slot \"{0}\" jest już zajęty, zmieniono nazwę na \"{1}\"" },
  { pattern: "• {0} → {1} ({2}), {3}×{4}, товщина {5} мм", en: "• {0} → {1} ({2}), {3}×{4}, thickness {5} mm", pl: "• {0} → {1} ({2}), {3}×{4}, grubość {5} mm" },

];
