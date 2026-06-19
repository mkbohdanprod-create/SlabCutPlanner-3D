# 🧩 Інструкція для Antigravity — вживлення блоку «Економіка / Комерційна пропозиція» (Задача #3)

**Контекст:** код вже написаний і вивірений у попередній (Electron) версії проєкту. Це не «напиши з нуля», а **перенесення готового блоку** в поточну веб-архітектуру (React 19 + Zustand 5 slices + immer + Supabase).

**Принцип роботи:** робимо строго послідовно. Після кожного блоку — `npx tsc --noEmit`. Коміти атомарні. Нічого не пушимо на GitHub, поки користувач не підтвердить, що локально все працює.

---

## Файли в цьому пакеті

```
economics/
├── new-files/
│   ├── pricing.ts                 → копіювати в src/engines/pricing.ts
│   ├── pricingSlice.ts            → копіювати в src/store/slices/pricingSlice.ts
│   └── CommercialQuoteDialog.tsx  → копіювати в src/components/ui/CommercialQuoteDialog.tsx
└── patches/
    ├── types.additions.ts         → вставити типи в src/domain/types.ts
    ├── defaults.additions.ts      → вставити в src/domain/defaults.ts
    └── quote.css                  → дописати в кінець src/styles/global.css
```

---

## КРОК 1 — Типи

Відкрий `patches/types.additions.ts` і виконай, що там написано:
1. Додай у `src/domain/types.ts` типи `CommercialMaterialMode`, `CommercialGluePricingMode`, `CommercialManualLine`, `CommercialLineOverride`, `CommercialQuoteSettings`.
2. **ОБОВ'ЯЗКОВО** додай поле `commercialQuote: CommercialQuoteSettings;` в `interface Project`.

`npx tsc --noEmit` → очікувано є помилки (поле Project ще не заповнюється в дефолтах) — це нормально, виправиться на Кроці 2.

Коміт: `feat(pricing): add commercial quote types`

## КРОК 2 — Дефолти + зворотна сумісність

Відкрий `patches/defaults.additions.ts`:
1. Додай імпорт типу та константу `defaultCommercialQuoteSettings`.
2. У `createEmptyProject()` додай `commercialQuote: defaultCommercialQuoteSettings,`.

**Окремо й важливо — зворотна сумісність зі старими проєктами.** У Supabase вже є збережені проєкти БЕЗ поля `commercialQuote`. При завантаженні такого проєкту треба підставити дефолт, інакше діалог впаде на `undefined`. Знайди в `src/store/slices/projectSlice.ts` екшен **`importProject`** і всередині (там, де приймається `project`) додай захисне злиття перед записом у стейт:

```ts
const safeProject = {
  ...project,
  commercialQuote: {
    ...defaultCommercialQuoteSettings,
    ...(project.commercialQuote ?? {}),
    edgePrices: {
      ...defaultCommercialQuoteSettings.edgePrices,
      ...(project.commercialQuote?.edgePrices ?? {}),
    },
    manualLines: project.commercialQuote?.manualLines ?? [],
    lineOverrides: project.commercialQuote?.lineOverrides ?? {},
  },
};
// далі використовуй safeProject замість project
```
(Імпортуй `defaultCommercialQuoteSettings` з `../../domain/defaults` у цьому слайсі.)

`npx tsc --noEmit` → має пройти чисто.
Коміт: `feat(pricing): default settings + backward-compatible import`

## КРОК 3 — Двигун розрахунку

Скопіюй `new-files/pricing.ts` → `src/engines/pricing.ts`. Нічого не міняй усередині.

`npx tsc --noEmit` → має пройти чисто.
Коміт: `feat(pricing): pure calculation engine`

## КРОК 4 — Слайс стору

1. Скопіюй `new-files/pricingSlice.ts` → `src/store/slices/pricingSlice.ts`.
2. Зареєструй слайс у `src/store/useProjectStore.ts`. Зроби рівно за аналогією з наявними слайсами:

```ts
// (а) додай імпорт поряд з іншими слайсами:
import { type PricingSlice, createPricingSlice } from './slices/pricingSlice';

// (б) додай PricingSlice у extends:
export interface ProjectState extends EditorUISlice, TextureSlice, HistorySlice, PackingSlice, ProjectSlice, PricingSlice {}

// (в) додай у тіло create(...):
//     ...createPricingSlice(set, get, store),
```

`npx tsc --noEmit` → має пройти чисто.
Коміт: `feat(pricing): store slice (updateCommercialQuote)`

## КРОК 5 — UI-діалог + CSS

1. Скопіюй `new-files/CommercialQuoteDialog.tsx` → `src/components/ui/CommercialQuoteDialog.tsx`.
2. Допиши вміст `patches/quote.css` у кінець `src/styles/global.css`.

`npx tsc --noEmit` → має пройти чисто.
Коміт: `feat(pricing): commercial quote dialog + styles`

## КРОК 6 — Підключення в App + кнопка відкриття

У `src/App.tsx` (там, де вже монтуються `LoginModal` і `ProjectsDashboard` через `isOpen`):

```tsx
// 1) імпорт:
import { CommercialQuoteDialog } from './components/ui/CommercialQuoteDialog';

// 2) стан (поряд з іншими useState ...Open):
const [isQuoteOpen, setIsQuoteOpen] = useState(false);

// 3) кнопка в тулбарі/хедері (поряд з кнопкою "Мої проекти"):
<button onClick={() => setIsQuoteOpen(true)}>Комерційна пропозиція</button>

// 4) монтування діалогу (поряд з <ProjectsDashboard ... />):
<CommercialQuoteDialog open={isQuoteOpen} onClose={() => setIsQuoteOpen(false)} />
```

`npx tsc --noEmit` → має пройти чисто.
Коміт: `feat(pricing): wire dialog into App`

---

## КРОК 7 — Перевірка вручну (користувач)

1. `npm run dev`, відкрий `localhost`.
2. **Обов'язково перезавантаж сторінку (Ctrl+Shift+R) і глянь консоль (F12)** — ловимо Vite/ESM-помилки, які `tsc` не бачить (як було двічі з білим екраном).
3. Завантаж проєкт з деталями → відкрий «Комерційна пропозиція».
4. Перевір: площа/порізка/водяна різка/склейка рахуються; зміна цін перераховує суми; ховання рядка змінює тотал; ручна позиція додається/видаляється; знижка/націнка працює.
5. **Зворотна сумісність:** відкрий СТАРИЙ проєкт із Supabase (збережений до цих змін) — діалог має відкритись з дефолтними нулями, без крашу.

---

## Відомі обмеження (не баги)

- **Кнопка «Експорт КП в PDF» — стаб** (показує alert). Реальний PDF — це Задача #6: створити `src/utils/export/commercialProposal.ts` у вже декомпозованому export-модулі. Окрема задача.
- `pricing.ts` містить власні локальні `pointDistance`/`sideSegment`/`polygonPerimeter` (навмисно self-contained, щоб не залежати від стану консолідації `geometryUtils.ts`). Це додає до списку відомих дублікатів — допиляємо при загальній консолідації геометрії, не зараз.

## Що НЕ робити

- Не чіпати `engines/packing.ts`, `geometry.ts`, `export.ts` — економіка з ними не перетинається.
- Не пушити на GitHub до підтвердження користувача після Кроку 7.
