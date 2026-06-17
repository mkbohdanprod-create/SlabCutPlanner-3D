# 🔬 Повний Аудит та Рефакторинг-план SlabCutPlanner

## Загальна Статистика

| Метрика | Значення |
|---|---|
| Загальний розмір коду | **862 KB** у 49 файлах |
| Найбільший файл | `FormsPanel.tsx` — **138 KB** (2763 рядки) |
| Бандл (production) | **3 MB** (index chunk) |
| Файли > 50 KB | 7 штук (усі потребують розбиття) |

---

## 🔴 Критичні проблеми (P0)

### 1. God Objects — Файли-монстри

> [!CAUTION]
> 7 файлів перевищують 50 KB. Це робить код нечитабельним, неможливим для code review, і вбиває продуктивність IDE та hot reload.

| Файл | Розмір | Рядки | Проблема |
|---|---|---|---|
| [FormsPanel.tsx](file:///c:/hhgh/SlabCutPlanner/web-app/src/components/ui/FormsPanel.tsx) | 138 KB | 2763 | **40+ функцій** в одному файлі. Містить форми деталей, DXF-імпорт, Approval-імпорт, SVG-конструктор, редактор кромок — все в одному |
| [approvalImport.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/utils/approvalImport.ts) | 82 KB | — | Парсер "Узгоджень" — повний окремий движок в одному файлі |
| [SlabBoard.tsx](file:///c:/hhgh/SlabCutPlanner/web-app/src/components/2d/SlabBoard.tsx) | 78 KB | ~1600 | SVG канвас + drag&drop + magnifier + dimension hints + selection — все в одному |
| [packing.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/engines/packing.ts) | 73 KB | 1777 | Алгоритм пакування — один монолітний файл |
| [geometry.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/engines/geometry.ts) | 61 KB | 1185 | Геометричний движок — один монолітний файл |
| [export.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/utils/export.ts) | 57 KB | — | PDF/PNG експорт — один монолітний файл |
| [TextureLayoutPanel.tsx](file:///c:/hhgh/SlabCutPlanner/web-app/src/components/ui/TextureLayoutPanel.tsx) | 54 KB | 1235 | Панель текстур — один монолітний файл |

---

### 2. Мертві кнопки в Header (підтверджено браузером)

> [!WARNING]
> Кнопки **"Налаштування"** та **"Експорт"** в хедері — **мертві**. У них немає `onClick` обробника. Це баг на рівні UX — користувач клікає і нічого не відбувається.

---

### 3. Дублювання коду

> [!IMPORTANT]
> Функція `textureCoordinateMatrix` існує **двічі** — ідентична копія в двох файлах.

| Файл | Рядок |
|---|---|
| [TextureLayoutPanel.tsx:235](file:///c:/hhgh/SlabCutPlanner/web-app/src/components/ui/TextureLayoutPanel.tsx#L235) | Оригінал |
| [export.ts:824](file:///c:/hhgh/SlabCutPlanner/web-app/src/utils/export.ts#L824) | Копія |

Також `DEFAULT_ALLOWANCES` дублюється в [geometry.ts:5](file:///c:/hhgh/SlabCutPlanner/web-app/src/engines/geometry.ts#L5) та [useProjectStore.ts:177](file:///c:/hhgh/SlabCutPlanner/web-app/src/store/useProjectStore.ts#L177).

---

## 🟠 Архітектурні проблеми (P1)

### 4. `useProjectStore.getState()` всередині React-компонентів

В [Viewer3D.tsx:83](file:///c:/hhgh/SlabCutPlanner/web-app/src/components/3d/Viewer3D.tsx#L83) виклик `useProjectStore.getState()` відбувається **всередині рендер-функції** React-компонента. Це обходить механізм підписки Zustand і означає, що компонент **не буде перерендерюватися** при зміні `textureLayouts`. Це потенційний баг з неоновлюваними текстурами.

### 5. Монолітний Store (38 KB)

[useProjectStore.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/store/useProjectStore.ts) — 838 рядків, ~40 екшнів. Кожна зміна будь-якого поля `project` викликає ре-рендер **усіх** компонентів, підписаних на `project`. Немає `immer`, немає слайсів, немає селекторів з `shallow` порівнянням.

### 6. Дублювання стану між Store'ами

В [useStore.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/store/useStore.ts) є `viewMode` і `packingMode`, і в [useProjectStore.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/store/useProjectStore.ts) теж є `viewMode` і `packingMode` в інтерфейсі `ProjectState`. Два сторів тримають однакові поля — потенційна розсинхронізація.

### 7. Мутабельний глобальний стан в engines

В [geometry.ts:19](file:///c:/hhgh/SlabCutPlanner/web-app/src/engines/geometry.ts#L19) та [geometry.ts:48](file:///c:/hhgh/SlabCutPlanner/web-app/src/engines/geometry.ts#L48):
```ts
let activeAllowances = DEFAULT_ALLOWANCES;  // Глобальна змінна!
let pendingRectMeta: PartLayoutMeta | undefined;  // Ще одна!
```
Це класичні сайд-ефекти, які роблять функції непередбачуваними і неможливими для тестування. Якщо два виклики `explodeDetails` відбудуться одночасно, вони можуть "бачити" чужі дані.

### 8. `any` типи (TypeScript escape hatches)

Знайдено **9 місць** з `any` типами, зокрема у компонентах 3D і парсерах.

---

## 🟡 Вузькі горлишка та Performance (P2)

### 9. Бандл 3 MB (main chunk)

Увесь додаток зібраний в один chunk `index-*.js` розміром **3 MB**. Three.js, html2canvas, DOMPurify, pdf.worker — все завантажується при першому відкритті сторінки, навіть якщо користувач ніколи не зайде в 3D-перегляд.

**Рішення:** Lazy import для:
- `Viewer3D` (Three.js) — `React.lazy(() => import('./Viewer3D'))`
- `PdfExportDialog` (html2canvas + pdf.worker)
- `FormsPanel` (DXF parser)

### 10. Синхронний `autoPack` блокує UI

`packing.ts` (74 KB) виконується **синхронно** в main thread. Для великих замовлень (10+ деталей на 3+ слябах) це може заморозити UI на кілька секунд.

**Рішення:** Перенести `autoPack` у Web Worker.

### 11. `localStorage` як єдиний persistence

Весь проект зберігається в один ключ `localStorage` (`slab_cut_planner_current_project`). При великих проектах з фотографіями слябів (base64) це може досягнути ліміту 5-10 MB і мовчки обрізати дані.

### 12. Відсутність Error Boundary

Немає жодного React Error Boundary. Якщо 3D-рендер або SVG-канвас крашнеться, весь додаток стає білим екраном без можливості відновлення.

---

## 🔵 Технічний борг (P3)

### 13. Hardcoded українські тексти в engines

В [geometry.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/engines/geometry.ts) — захардкоджені українські рядки (`'Підворот'`, `'Потовщення'`, `'стільниці'`, `'Прямокутна'`). Це робить i18n неможливим для цих елементів.

### 14. CSS: 47 KB global.css

[global.css](file:///c:/hhgh/SlabCutPlanner/web-app/src/styles/global.css) — 47 KB одного глобального CSS-файлу. Немає CSS-модулів, немає scoping. Потенційні конфлікти селекторів.

### 15. Відсутність тестів

Нуль тестових файлів. Для критичних алгоритмів (packing, geometry, conflict detection) це серйозний ризик при рефакторингу.

---

## 📋 Пріоритезований план дій

### Фаза 1: Швидкі виграші (1-2 дні)
- [x] Виправити мертві кнопки "Налаштування" та "Експорт" в HeaderToolbar
- [x] Винести `textureCoordinateMatrix` в спільний utils-файл (усунення дублювання)
- [x] Винести `DEFAULT_ALLOWANCES` в `domain/defaults.ts`
- [x] Замінити `getState()` на хук `useProjectStore(selector)` у Viewer3D
- [ ] Додати базовий Error Boundary навколо `<Canvas>` та `<SlabBoard>`

### Фаза 2: Розбиття God Objects (3-5 днів)
- [ ] **FormsPanel.tsx** → розбити на `DetailForm.tsx`, `DxfImportWizard.tsx`, `ApprovalImportWizard.tsx`, `ShapeDesigners`, `EdgeProfileDesigner.tsx`
- [ ] **SlabBoard.tsx** → розбити на `SlabCanvas.tsx`, `SlabMagnifier.tsx`, `PlacementDrag.tsx`, `ManualDimensions.tsx`
- [ ] **Viewer3D.tsx** → розбити на `TexturedPart.tsx`, `AssemblyGroup.tsx`, `CaptureController.tsx`

### Фаза 3: Архітектурні покращення (5-7 днів)
- [ ] Розбити `useProjectStore` на слайси (project, ui, packing, texture)
- [ ] Додати `immer` middleware для immutable updates
- [ ] Використовувати `useShallow` для селекторів (зменшення зайвих ре-рендерів)
- [ ] Усунути мутабельний глобальний стан в `geometry.ts` (передавати `allowances` параметром)
- [ ] Lazy imports для Viewer3D, PdfExportDialog, FormsPanel
- [ ] Додати code splitting для chunks < 500 KB

### Фаза 4: Стабільність і тести (3-5 днів)
- [ ] Написати unit-тести для `packing.ts` (autoPack, detectConflicts)
- [ ] Написати unit-тести для `geometry.ts` (explodeDetails, offsetPolygon)
- [ ] Додати Error Boundaries на кожну секцію (3D, 2D, Sidebar, Forms)
- [ ] Перенести `autoPack` у Web Worker для неблокуючого UI
- [ ] Дослідити IndexedDB замість localStorage для великих проектів
