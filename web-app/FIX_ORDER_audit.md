# Наряд на виправлення (за результатами аудиту коду)

Це не новий крок і не рефакторинг. Це закриття дір, які накопичились за Кроки 1–6.5, поки контроль якості був несправний. Порядок жорсткий: спершу полагодити гейт (пункт 0), інакше решту знову не буде видно.

## Причина, чому шість кроків «зелений tsc» нічого не гарантували

Кореневий `tsconfig.json` — це `"files": []` + `references`, без `include`. Команда `npx tsc --noEmit` у цьому режимі компілює **нуль файлів** і завжди повертає 0. Реальна перевірка `tsc -p tsconfig.app.json` дає десятки помилок. Тобто типи не перевірялись жодного разу.

**Два правила на весь наряд:**

1. **Гейт — тільки `tsc -b` (або `tsc -p tsconfig.app.json`).** `npx tsc --noEmit` по кореню ЗАБОРОНЕНО як доказ — він порожній.
2. **Правити код ТІЛЬКИ нормальним редагуванням файлів. Заборонено `node -e` з regex-замінами.** Саме вони дали невалідний `geometry.ts`, дублі `stablePartId` і висяче посилання `theme`. Кожна така правка — джерело рантайм-поломки, яку не видно в тестах.

---

## Пункт 0 (блокер, першим): полагодити гейт і звести типи до нуля

1. У `package.json` додати скрипт:
   ```json
   "typecheck": "tsc -b"
   ```
2. Запустити `npm run typecheck`. Побачиш десятки помилок — це і є справжній стан.
3. **Звести до нуля**, не глушачи через `any`, `@ts-ignore`, `// @ts-expect-error`. Помилки реальні, серед них:
   - `App.tsx`: `Property 'language' does not exist on type 'UIState'`, `Property 'name' does not exist on type 'Project'`, `.catch` на `void`, неспівпадіння типу `view` (`'split'` зайвий/відсутній).
   - `SlabBoard.tsx`: type-only імпорти під `verbatimModuleSyntax` (`import type { ChangeEvent, MouseEvent }`).
   - `PlacementPropertiesPanel.tsx`: порівняння `MaterialType` з неіснуючими `'acryl'`/`'compact'`.
   - маса `TS6133` (unused) — прибрати мертві імпорти/змінні, а не позначати підкресленням.
4. **Критерій:** `npm run typecheck` завершується з кодом 0 і порожнім виводом.

---

## Пункт 0.5 (НАЙВИДИМІШЕ): «Зберегти виріб» нічого не робить, виріб не з'являється ніде

Два незалежні дефекти, обидва обов'язкові.

**A. `addProduct`/`updateProduct` не перезапускають розкрій.**
У `src/store/slices/projectSlice.ts` усі мутації деталей викликають `triggerPackingAsync` (`addDetail` — 213, `addDetails` — 219, `deleteDetail` — 243). А `addProduct` (246) і `updateProduct` (254) роблять лише `set` + `finalizeProjectState` — **без** `triggerPackingAsync`. Тому збереження виробу не перераховує розкрій, і візуально «нічого не відбувається».

Фікс: у кінці `addProduct` і `updateProduct`, після `set(...)`, викликати
```ts
triggerPackingAsync(get().project, get().packingMode, get().parts, set, get);
```
(і `persist(...)`, як в інших мутаціях). Звірити патерн із `addDetails`.

**B. UI читає сирий `project.details`, куди вироби не потрапляють.**
`getAllProjectDetails` під'єднано лише в `packingSlice`. Решта споживачів читає `project.details` напряму й тому не бачить виробів:
- `src/components/ui/ListsPanel.tsx` (102–114) — «Список усіх деталей» → показує «Деталей ще немає»;
- `src/components/2d/SlabBoard.tsx` (371, 926) — пошук `part.detailId` у `project.details`, деталі виробу не знаходяться;
- `src/components/3d/Viewer3D.tsx` (885, 1214, 1215) — 3D Збірка читає `project.details` (Крок 4 у збірку не під'єднано);
- `src/components/ui/FormsPanel.tsx` (168, 177);
- `src/components/ui/TextureLayoutPanel.tsx` (112).

Фікс: усюди, де для відображення/пошуку потрібні всі деталі, замінити `project.details` на `getAllProjectDetails(project)` (для пошуку по `detailId` — побудувати `Map` з нього).

Окремо для `Viewer3D`: за задумом Кроку 4 збірка має рендеритись з `project.products` через `ProductElement3DNode`, а не з плоских деталей. Якщо на це поки немає часу — мінімум перевести на `getAllProjectDetails`, щоб виріб було видно, і позначити повний перехід окремою задачею.

**Критерій:** створити виріб → «Зберегти виріб» → він одразу з'являється і в «Список усіх деталей», і на розкрої, і в 3D Збірці.

---

## Пункт 1: `extractServices` викликається зі старою сигнатурою (кошторис зламаний)

Нова сигнатура (з Кроку 5):
```ts
extractServices(project, catalog = DEFAULT_SERVICE_CATALOG, manualOverrides = [], derivedJoints = [])
```

Обидва живі виклики передають стару:

- **`src/components/ui/EstimatePanel.tsx:14`** — зараз `extractServices(project, details, catalog)`. Тут `details` летить у параметр `catalog`. Виправити на новий контракт: `catalog` другим аргументом, `details` прибрати (функція сама читає `project.products`).
- **`src/components/ui/DetailPassportModal.tsx:39`** — зараз `extractServices(project, details)`. Та сама помилка.

**Критерій:** обидва сайти відповідають новій сигнатурі; `tsc -b` по них чистий; у кошторисі виробу з вирізами/кромками з'являються послуги.

---

## Пункт 2: похідні шви (Крок 6.5) — мертвий код, під'єднати

Зараз:
- `explodeDetailsWrapped` (у `src/store/projectHelpersLogic.ts:111`) повертає `{ parts, derivedJoints }`, але його ніхто не викликає у продакшн-шляху.
- Розкрій (`src/store/slices/packingSlice.ts:37`) викликає сирий `explodeDetails`, не обгортку.
- Параметр `derivedJoints` у `extractServices` не передає ніхто.

Отже шви Г/П-стільниць не дають **жодної** послуги в застосунку.

**Зробити:**
1. Джерело `derivedJoints` — один. Обчислювати їх через `explodeDetailsWrapped(getAllProjectDetails(project))` там, де рахується кошторис, і передавати четвертим аргументом у `extractServices`.
2. Переконатись, що `explodeDetailsWrapped` і `explodeDetails` дають однакові `parts` (обгортка не має міняти розкрій — тільки додавати `derivedJoints`). Не дублювати логіку розрізу.

**Критерій:** на Г-подібній стільниці в кошторисі є послуга стяжки/склейки на шов.

---

## Пункт 3: баг двох просторів ID (краш `Cannot read properties of undefined (reading 'corners')`)

Корінь: `session.subDetails` ключується **короткими слотами** (`main`, `skirting_A`), а `activeDetailId` подекуди отримує **повний шлях** (`prod_x/element:skirting_A`). Пошук `subDetails[повний_шлях]` → `undefined` → краш на `.corners`.

Місця з рядковим хаком `id.includes('element:main')` у `src/components/ui/ProductEditorWorkspace.tsx`:
- `getActiveDraft` — рядок 162
- `updateDetail` — рядок 171
- `handleDetailContextMenu` — рядок 215
- `onDetailClick` (проп 3D-вузла) — рядок 374

**Зробити:**
1. У `src/domain/ids.ts` додати нормалізатор:
   ```ts
   export function toSlot(id: string | null | undefined): string {
     if (!id) return 'main';
     const m = id.match(/\/element:([^/]+)/);
     const slot = m ? m[1] : id;
     return slot.includes('element:main') || slot === 'main' ? 'main' : slot;
   }
   ```
2. `getActiveDraft`, `updateDetail`, `handleDetailContextMenu`, `onDetailClick` — усі приводять вхідний `id` через `toSlot(id)` і працюють **тільки зі слотом**. Ніяких `includes()` на місці.

**Критерій:** відкрити редактор → клікнути кут, сторону, стик, бортик, ногу, панель, контекстне меню кута — консоль чиста, жодного `undefined`.

---

## Пункт 4: `buildProductFromSession` — захардкоджена довжина стику

`src/components/ui/ProductEditorWorkspace.tsx:85`:
```ts
const sideLength = 1000; // Will be properly calculated later
```
Через це довжина authored-стику (бортик, нога) завжди 1 м. У `draftHelpers.ts` вже є `getSideSize(draft, side)`. Використати:
```ts
const sideLength = getSideSize(session.mainDetail!, sideId);
```
(коментар на рядку 84 «не можна імпортувати без поломки» неправдивий — перевірити й імпортувати.)

**Критерій:** бортик на стороні 2400 мм дає в кошторисі склейку на 2.4 м.

---

## Пункт 5: дубль `getAllProjectDetails`

Дві копії: `src/store/projectHelpers.ts:200` і `src/store/projectHelpersLogic.ts:104`. Розкрій імпортує з `projectHelpers`. Лишити **одну** (у `projectHelpers.ts`), другу видалити або зробити ре-експортом. Переконатись, що реалізації ідентичні перед видаленням.

---

## Протокол приймання (нове визначення «готово»)

Раніше «готово» = `tsc --noEmit` зелений + юніт-тести. Це й підвело. Тепер **усі чотири** обов'язкові:

1. `npm run typecheck` (`tsc -b`) — код 0, порожній вивід.
2. `npm run test` — усі тести зелені.
3. `npm run dev` → застосунок відкривається, **консоль браузера чиста** (скріншот у звіт).
4. Ручний наскрізний прогін зі скріншотами: створити виріб (стільниця + бортик + нога) → 3D редактор → **зберегти → виріб одразу видно в списку, на розкрої і в 3D Збірці** → кошторис із послугами **без дублів**.

Звіт по кожному пункту: `git diff`, вивід `npm run typecheck` (не `tsc --noEmit`!), і скріншот чистої консолі + скріншот застосунку. Без скріншотів пункт не зараховується.
