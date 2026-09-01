import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SERVICE_CATALOG, type ServiceDefinition } from '../domain/services';
import { viyarCatalog, VIYAR_SERVICE_COUNT } from '../domain/viyarServiceCatalog';
import { VIYAR_MAPPING_RULES, INTERNAL_RULES_REPLACED_BY_VIYAR } from '../domain/viyarMapping';
import {
  DEFAULT_MAPPING_RULES,
  effectiveRules,
  validateMapping,
  type MappingConfig,
  type MappingOverride,
  type MappingProblem,
  type MappingRule,
} from '../domain/serviceMapping';
import { mergeQuotePriceBook, stripQuotePrices, type QuotePriceBook } from '../domain/quoteCalc';

/**
 * Налаштування прайсу й прив'язок послуг до обробок.
 *
 * Усе, що тут лежить, керівник міняє з екрана налаштувань: ціни, склад
 * каталогу, коди 1С і саму таблицю відповідності «обробка → послуга».
 * Код при цьому не змінюється — заради цього таблиця й винесена в дані
 * (domain/serviceMapping.ts).
 *
 * Дві окремі скриньки навмисно:
 *   · `mappingOverrides` — правки ВБУДОВАНИХ правил (вимкнув, змінив
 *     множник). Зберігаються за id правила, тому оновлення застосунку не
 *     затирає налаштування, а налаштування не заморожують вбудовану
 *     таблицю на версії піврічної давності.
 *   · `customRules` — правила, дописані керівником. Живуть самі по собі.
 */

const SETTINGS_VERSION = 6;

/** PIN супер-адміна за замовчуванням — змінюється після першого входу */
export const DEFAULT_ADMIN_PIN = '1111';

interface SettingsState {
  serviceCatalog: Record<string, ServiceDefinition>;
  mappingOverrides: Record<string, MappingOverride>;
  customRules: MappingRule[];
  /** Прайс і коди 1С вкладки «Прорахунок» — редагують старші менеджери */
  quotePriceBook: QuotePriceBook;
  /**
   * Режим калібрування цін (рішення 25.08.2026). ВИМКНЕНО за умовчанням.
   *
   * Вимкнено — ручні ціни прорахунку рушій НЕ бачить взагалі: ціна або
   * від 1С за кодом номенклатури, або її немає. Це головний запобіжник: навіть
   * якщо в localStorage лежить стара ціна, вона не потрапить у КП.
   *
   * Увімкнено — керівник свідомо перекриває ціну руками, щоб зібрати
   * статистику розходжень на 10–20 проектах і потім виправити прайс у
   * 1С. Кожен такий рядок помічений як ручний, а поряд лишається
   * ціна, яку дала 1С — інакше нема з чим порівнювати.
   */
  quoteManualPricing: boolean;
  /**
   * PIN супер-адміна: за ним ховаються адмінські меню (налаштування
   * прайсів і прив'язок). Це НЕ безпека, а запобіжник від випадкових
   * рук: PIN лежить у localStorage відкрито, як і самі налаштування.
   */
  adminPin: string;
  /**
   * Поріг попередження про коротку сторону деталі, мм — за матеріалом (FG-10).
   * Порожньо = DEFAULT_MIN_SIDE_MM (150). Нуль = перевірку вимкнено.
   */
  minSideMm: Record<string, number>;

  // ── каталог послуг ─────────────────────────────────────────────────
  updateService: (id: string, updates: Partial<ServiceDefinition>) => void;
  addService: (service: ServiceDefinition) => void;
  removeService: (id: string) => void;
  resetToDefault: () => void;
  /** Підвантажити довідник ВіярПро з обліковими кодами */
  importViyarCatalog: () => { added: number; kept: number };
  /**
   * Перевести розрахунок на облікові коди: підвантажити довідник,
   * увімкнути прив'язки до кодів і вимкнути внутрішні, які їх дублюють.
   */
  switchToViyarCodes: () => { services: number; enabled: number; disabled: number };

  // ── таблиця відповідності ──────────────────────────────────────────
  setRuleEnabled: (ruleId: string, enabled: boolean) => void;
  updateRule: (ruleId: string, updates: Partial<MappingRule>) => void;
  addRule: (rule: Omit<MappingRule, 'source'>) => void;
  removeRule: (ruleId: string) => void;
  resetMapping: () => void;

  // ── прайс прорахунку ───────────────────────────────────────────────
  /** Частковий патч верхнього рівня; вкладені об'єкти передаються цілком */
  updateQuotePriceBook: (patch: Partial<QuotePriceBook>) => void;
  /** Код 1С за ключем (fab:…, measure:…, svc:… — див. QuotePriceBook.codes1c) */
  setQuoteCode1c: (key: string, code: string) => void;
  resetQuotePriceBook: () => void;
  setQuoteManualPricing: (enabled: boolean) => void;
  setAdminPin: (pin: string) => void;
  setMinSideMm: (material: string, mm: number | undefined) => void;

  // ── читання ────────────────────────────────────────────────────────
  getRules: () => MappingRule[];
  getMappingProblems: () => MappingProblem[];

  // ── перенесення налаштувань між машинами ───────────────────────────
  exportSettings: () => string;
  importSettings: (json: string) => { ok: boolean; error?: string };
}

/** Нові вбудовані послуги мають доїжджати до тих, хто вже щось зберіг. */
export function mergeBuiltinServices(saved: Record<string, ServiceDefinition> | undefined) {
  const result: Record<string, ServiceDefinition> = { ...DEFAULT_SERVICE_CATALOG };
  Object.entries(saved ?? {}).forEach(([id, service]) => {
    // Ціни й назви користувача перемагають; нові вбудовані просто додаються.
    result[id] = { ...result[id], ...service };
  });
  return result;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      serviceCatalog: { ...DEFAULT_SERVICE_CATALOG },
      mappingOverrides: {},
      customRules: [],
      quotePriceBook: mergeQuotePriceBook(),
      quoteManualPricing: false,
      adminPin: DEFAULT_ADMIN_PIN,
      minSideMm: {},

      updateService: (id, updates) => set((state) => {
        if (!state.serviceCatalog[id]) return state;
        return {
          serviceCatalog: {
            ...state.serviceCatalog,
            [id]: { ...state.serviceCatalog[id], ...updates },
          },
        };
      }),

      addService: (service) => set((state) => ({
        serviceCatalog: {
          ...state.serviceCatalog,
          [service.id]: { ...service, custom: service.custom ?? true },
        },
      })),

      removeService: (id) => set((state) => {
        const newCatalog = { ...state.serviceCatalog };
        delete newCatalog[id];
        return { serviceCatalog: newCatalog };
      }),

      resetToDefault: () => set({ serviceCatalog: { ...DEFAULT_SERVICE_CATALOG } }),

      importViyarCatalog: () => {
        const current = get().serviceCatalog;
        const incoming = viyarCatalog();
        let added = 0;
        let kept = 0;
        const merged = { ...current };
        Object.entries(incoming).forEach(([id, service]) => {
          if (merged[id]) {
            // Ціну й назву, які вже виставив керівник, не чіпаємо —
            // повторний імпорт не повинен обнуляти прайс.
            merged[id] = { ...service, ...merged[id] };
            kept += 1;
          } else {
            merged[id] = service;
            added += 1;
          }
        });
        set({ serviceCatalog: merged });
        return { added, kept };
      },

      switchToViyarCodes: () => {
        const imported = get().importViyarCatalog();
        const overrides = { ...get().mappingOverrides };
        VIYAR_MAPPING_RULES.forEach((rule) => {
          overrides[rule.id] = { ...overrides[rule.id], enabled: true };
        });
        INTERNAL_RULES_REPLACED_BY_VIYAR.forEach((ruleId) => {
          overrides[ruleId] = { ...overrides[ruleId], enabled: false };
        });
        set({ mappingOverrides: overrides });
        return {
          services: imported.added + imported.kept,
          enabled: VIYAR_MAPPING_RULES.length,
          disabled: INTERNAL_RULES_REPLACED_BY_VIYAR.length,
        };
      },

      setRuleEnabled: (ruleId, enabled) => set((state) => {
        const isCustom = state.customRules.some((rule) => rule.id === ruleId);
        if (isCustom) {
          return {
            customRules: state.customRules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule)),
          };
        }
        return {
          mappingOverrides: {
            ...state.mappingOverrides,
            [ruleId]: { ...state.mappingOverrides[ruleId], enabled },
          },
        };
      }),

      updateRule: (ruleId, updates) => set((state) => {
        const isCustom = state.customRules.some((rule) => rule.id === ruleId);
        if (isCustom) {
          return {
            customRules: state.customRules.map((rule) => (rule.id === ruleId ? { ...rule, ...updates } : rule)),
          };
        }
        // Для вбудованих зберігаємо лише те, що справді можна переозначити:
        // вид факту й variant — це прив'язка до геометрії, її міняти не можна,
        // інакше правило перестане відповідати тому, що рахує рушій.
        const patch: MappingOverride = { ...state.mappingOverrides[ruleId] };
        if (updates.enabled !== undefined) patch.enabled = updates.enabled;
        if (updates.multiplier !== undefined) patch.multiplier = updates.multiplier;
        if (updates.serviceId !== undefined) patch.serviceId = updates.serviceId;
        if (updates.note !== undefined) patch.note = updates.note;
        return { mappingOverrides: { ...state.mappingOverrides, [ruleId]: patch } };
      }),

      addRule: (rule) => set((state) => ({
        customRules: [...state.customRules, { ...rule, source: 'custom' }],
      })),

      removeRule: (ruleId) => set((state) => {
        const isCustom = state.customRules.some((rule) => rule.id === ruleId);
        if (isCustom) {
          return { customRules: state.customRules.filter((rule) => rule.id !== ruleId) };
        }
        // Вбудоване правило не видаляється, а вимикається — щоб його можна
        // було повернути, не перевстановлюючи застосунок.
        return {
          mappingOverrides: {
            ...state.mappingOverrides,
            [ruleId]: { ...state.mappingOverrides[ruleId], enabled: false },
          },
        };
      }),

      resetMapping: () => set({ mappingOverrides: {}, customRules: [] }),

      updateQuotePriceBook: (patch) => set((state) => ({
        quotePriceBook: { ...state.quotePriceBook, ...patch },
      })),

      setQuoteCode1c: (key, code) => set((state) => {
        const codes1c = { ...state.quotePriceBook.codes1c };
        if (code.trim()) codes1c[key] = code.trim();
        else delete codes1c[key];
        return { quotePriceBook: { ...state.quotePriceBook, codes1c } };
      }),

      resetQuotePriceBook: () => set({ quotePriceBook: mergeQuotePriceBook() }),

      setQuoteManualPricing: (enabled) => set({ quoteManualPricing: enabled }),

      setAdminPin: (pin) => set({ adminPin: pin.trim() || DEFAULT_ADMIN_PIN }),

      /**
       * Порожнє поле в налаштуваннях = «як за замовчуванням», тому запис
       * прибирається зовсім, а не зберігається нулем: нуль тут має власне
       * значення — «перевірку вимкнено».
       */
      setMinSideMm: (material, mm) => set((state) => {
        const next = { ...state.minSideMm };
        if (mm === undefined || Number.isNaN(mm)) delete next[material];
        else next[material] = Math.max(0, mm);
        return { minSideMm: next };
      }),

      getRules: () => {
        const state = get();
        const config: MappingConfig = { overrides: state.mappingOverrides, customRules: state.customRules };
        return effectiveRules(config);
      },

      getMappingProblems: () => validateMapping(get().getRules(), get().serviceCatalog),

      exportSettings: () => JSON.stringify({
        version: SETTINGS_VERSION,
        serviceCatalog: get().serviceCatalog,
        mappingOverrides: get().mappingOverrides,
        customRules: get().customRules,
        quotePriceBook: get().quotePriceBook,
        quoteManualPricing: get().quoteManualPricing,
        minSideMm: get().minSideMm,
      }, null, 2),

      importSettings: (json) => {
        try {
          const parsed = JSON.parse(json) as Partial<SettingsState>;
          if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Файл не схожий на налаштування' };
          set({
            serviceCatalog: mergeBuiltinServices(parsed.serviceCatalog),
            mappingOverrides: parsed.mappingOverrides ?? {},
            customRules: Array.isArray(parsed.customRules) ? parsed.customRules : [],
            // Файл налаштувань міг бути знятий до 25.08.2026, коли ціни
            // ще заводились руками, — чистимо їх і на імпорті теж.
            quotePriceBook: stripQuotePrices(mergeQuotePriceBook(parsed.quotePriceBook)),
            // Режим калібрування навмисно НЕ переїжджає з файлом: його
            // вмикають свідомо на конкретній машині, а не «поїхало разом
            // із налаштуваннями і ніхто не помітив».
            quoteManualPricing: false,
            minSideMm: parsed.minSideMm ?? {},
          });
          return { ok: true };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      },
    }),
    {
      name: 'slabcutplanner-settings-storage',
      version: SETTINGS_VERSION,
      migrate: (persisted) => {
        // v1 зберігав лише serviceCatalog. Нові вбудовані послуги —
        // CUT_WATERJET, HOLE_LARGE, EDGE_D12, JOINT_SAWCUT, MATERIAL_SLAB —
        // без цього злиття не з'явилися б у тих, хто вже щось налаштував,
        // і половина таблиці відповідності мовчки не спрацювала б.
        // v3 додав прайс прорахунку (quotePriceBook) — те саме злиття.
        const state = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...state,
          serviceCatalog: mergeBuiltinServices(state.serviceCatalog),
          mappingOverrides: state.mappingOverrides ?? {},
          customRules: Array.isArray(state.customRules) ? state.customRules : [],
          // v6: ручні ціни прорахунку почищені (рішення 25.08.2026). Самого
          // видалення дефолтів мало: у того, хто вже відкривав додаток,
          // сім радіусних цін лежать у localStorage — і без цієї чистки
          // вони пережили б оновлення і мовчки перекрили б відповідь 1С.
          // Коди 1С лишаються: саме за ними питається ціна.
          quotePriceBook: stripQuotePrices(mergeQuotePriceBook(state.quotePriceBook)),
          // Режим калібрування після оновлення завжди вимкнений.
          quoteManualPricing: false,
          adminPin: typeof state.adminPin === 'string' && state.adminPin ? state.adminPin : DEFAULT_ADMIN_PIN,
          // v5 (FG-10): поріг короткої сторони за матеріалом. У тих, хто вже
          // щось зберіг, поля немає — і це коректно означає «як було, 150».
          minSideMm: state.minSideMm ?? {},
        } as SettingsState;
      },
    },
  ),
);

/** Скільки позицій у довіднику ВіярПро */
export { VIYAR_SERVICE_COUNT };

/** Скільки вбудованих правил у таблиці — показуємо в налаштуваннях */
export const BUILTIN_RULE_COUNT = DEFAULT_MAPPING_RULES.length;
