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

const SETTINGS_VERSION = 2;

interface SettingsState {
  serviceCatalog: Record<string, ServiceDefinition>;
  mappingOverrides: Record<string, MappingOverride>;
  customRules: MappingRule[];

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
      }, null, 2),

      importSettings: (json) => {
        try {
          const parsed = JSON.parse(json) as Partial<SettingsState>;
          if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Файл не схожий на налаштування' };
          set({
            serviceCatalog: mergeBuiltinServices(parsed.serviceCatalog),
            mappingOverrides: parsed.mappingOverrides ?? {},
            customRules: Array.isArray(parsed.customRules) ? parsed.customRules : [],
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
        const state = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...state,
          serviceCatalog: mergeBuiltinServices(state.serviceCatalog),
          mappingOverrides: state.mappingOverrides ?? {},
          customRules: Array.isArray(state.customRules) ? state.customRules : [],
        } as SettingsState;
      },
    },
  ),
);

/** Скільки позицій у довіднику ВіярПро */
export { VIYAR_SERVICE_COUNT };

/** Скільки вбудованих правил у таблиці — показуємо в налаштуваннях */
export const BUILTIN_RULE_COUNT = DEFAULT_MAPPING_RULES.length;
