# 🔬 Повний Аудит та Рефакторинг-план SlabCutPlanner (ОНОВЛЕНО)

## Загальна Статистика

| Метрика               | Значення                                   | Статус                                |
| --------------------- | ------------------------------------------ | ------------------------------------- |
| Загальний розмір коду | **862 KB** у 49 файлах                     | У процесі оптимізації                 |
| Найбільший файл       | `FormsPanel.tsx` — **138 KB** (2763 рядки) | ✅ Схуд до **88 KB** (1644 рядки)     |
| Бандл (production)    | **3 MB** (index chunk)                     | ✅ **2 MB** (Viewer3D відщеплено)     |
| Файли > 50 KB         | 7 штук                                     | Все ще 7 штук (хоч і меншого розміру) |

---

## 🔴 Критичні проблеми (P0)

### 1. God Objects — Файли-монстри

> [!CAUTION] 7 файлів перевищують 50 KB. Це робить код нечитабельним, неможливим для code review, і вбиває продуктивність IDE та hot reload.

| Файл                                                                                                      | Розмір | Рядки | Проблема                                                                                                        | Статус                                  |
| :-------------------------------------------------------------------------------------------------------- | :----- | :---- | :-------------------------------------------------------------------------------------------------------------- | :-------------------------------------- |
| [FormsPanel.tsx](file:///c:/hhgh/SlabCutPlanner/web-app/src/components/ui/FormsPanel.tsx)                 | 88 KB  | 1644  | Був 138 KB. Містить форми деталей, DXF-імпорт, Approval-імпорт, SVG-конструктор, редактор кромок — все в одному | ✅ **Частково розбито на 10+ файлів**   |
| [approvalImport.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/utils/approvalImport.ts)                   | 82 KB  | —     | Парсер "Узгоджень" — повний окремий движок в одному файлі                                                       | ⏸️ **Заморожено (чекаємо нову логіку)** |
| [SlabBoard.tsx](file:///c:/hhgh/SlabCutPlanner/web-app/src/components/2d/SlabBoard.tsx)                   | 60 KB  | 1184  | Був 78 KB. SVG канвас + drag&drop + magnifier + dimension hints + selection — все в одному                      | ✅ **Розбито на 10 підкомпонентів**     |
| [packing.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/engines/packing.ts)                               | 73 KB  | 1777  | Алгоритм пакування — один монолітний файл                                                                       | ⏳ В черзі                              |
| [geometry.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/engines/geometry.ts)                             | 61 KB  | 1185  | Геометричний движок — один монолітний файл                                                                      | ✅ **Глобальний стан усунуто**          |
| [export.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/utils/export.ts)                                   | 57 KB  | 988   | PDF/PNG експорт та розрахунки масштабів сторінок                                                                | ⏳ В черзі                              |
| [TextureLayoutPanel.tsx](file:///c:/hhgh/SlabCutPlanner/web-app/src/components/ui/TextureLayoutPanel.tsx) | 54 KB  | 1208  | Панель текстур — логіка драг-н-дропу, генерація 3D-прев'ю, SVG-відмальовка                                      | ⏳ В черзі                              |

---

### 2. Мертві кнопки в Header

> [!IMPORTANT] ✅ **ВИРІШЕНО:** Кнопки "Налаштування" та "Експорт" не були потрібні (створені раніше на розсуд) і успішно видалені з HeaderToolbar. Проблема закрита.

---

### 3. Дублювання коду

> [!IMPORTANT] ✅ **ВИРІШЕНО:** Функція `textureCoordinateMatrix` винесена у спільний utils-файл `src/lib/textureMatrix.ts` і використовується без дублювань. `DEFAULT_ALLOWANCES` винесено в `domain/defaults.ts`.

---

## 🟠 Архітектурні проблеми (P1)

### 4. `useProjectStore.getState()` всередині React-компонентів

> [!IMPORTANT] ✅ **ВИРІШЕНО:** Виклик `useProjectStore.getState()` прибрано з рендер-функцій `Viewer3D.tsx` та `ProjectsDashboard.tsx`. Замінено на підписку через хуки з селекторами.

### 5. Монолітний Store (38 KB)

[useProjectStore.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/store/useProjectStore.ts) — 838 рядків, ~40 екшнів. Кожна зміна будь-якого поля `project` викликає ре-рендер **усіх** компонентів, підписаних на `project`. Немає `immer`, немає слайсів, немає селекторів з `shallow` порівнянням.

### 6. Дублювання стану між Store'ами

В [useStore.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/store/useStore.ts) є `viewMode` і `packingMode`, і в [useProjectStore.ts](file:///c:/hhgh/SlabCutPlanner/web-app/src/store/useProjectStore.ts) теж є `viewMode` і `packingMode` в інтерфейсі `ProjectState`. Два сторів тримають однакові поля — потенційна розсинхронізація.

### 7. Мутабельний глобальний стан в engines

> [!IMPORTANT] ✅ **ВИРІШЕНО:** Змінні `activeAllowances` та `pendingRectMeta` винесено з глобального скоупу `geometry.ts` завдяки використанню патерну Фабрики (Factory closure pattern). Це усунуло state pollution без регресій (доведено byte-diff тестуванням).

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

> [!IMPORTANT] ✅ **ВИРІШЕНО:** Ми створили надійний Safety Net! Встановлено `vitest`, створено детерміновані фікстури (Edge Cases: дефекти, переповнення, точні входження) у `mockData.ts`. Написано Regression (Snapshot) тести для `packing.ts` та `geometry.ts`. Додано округлення `-0` → `0`, мокання `uid()` та скрипт `prebuild` для CI (Vercel). Тепер будь-яка регресія блокується на етапі білда!
>
> 📄 **Детальніше читайте в інструкції:** [safety net пункт 15](file:///c:/hhgh/SlabCutPlanner/Рефактор/safety%20net%20пункт%2015)

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

- [x] Написати unit-тести для `packing.ts` (autoPack, detectConflicts)
- [x] Написати unit-тести для `geometry.ts` (explodeDetails, offsetPolygon)
- [ ] Додати Error Boundaries на кожну секцію (3D, 2D, Sidebar, Forms)
- [ ] Перенести `autoPack` у Web Worker для неблокуючого UI
- [ ] Дослідити IndexedDB замість localStorage для великих проектів
