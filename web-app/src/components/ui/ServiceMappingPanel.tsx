import { useMemo, useState } from 'react';
import { Plus, Trash2, RefreshCw, Download, Upload, AlertTriangle, Link2, Info, BookMarked } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useProjectStore } from '../../store/useProjectStore';
import { uid } from '../../domain/defaults';
import { VIYAR_SERVICE_COUNT } from '../../domain/viyarServiceCatalog';
import { VIYAR_UNMAPPED_FACTS } from '../../domain/viyarMapping';
import {
  FACT_KIND_LABELS,
  factUnit,
  type MappingRule,
} from '../../domain/serviceMapping';
import type { ProductionFactKind } from '../../engines/productionFacts';
import type { MaterialType } from '../../domain/types';

/**
 * Екран для керівника: які послуги нараховуються за яку обробку.
 *
 * Тут не редагується геометрія і не редагуються ціни — тільки прив'язка.
 * Ціни лишаються на вкладках із типами обробок, геометрію рахує рушій.
 * Розділення навмисне: помилка в прив'язці коштує грошей, тому вона має
 * бути видимою, а не захованою серед двадцяти полів.
 */

const MATERIALS: MaterialType[] = ['Керамограніт', 'Кварцит', 'Натуральний камінь', 'Акрил', 'Компакт-плита'];

const FACT_KINDS: ProductionFactKind[] = [
  'saw_cut', 'waterjet_cut', 'cutout_perimeter', 'hole_small', 'hole_large',
  'edge', 'edge_manual_finish', 'joint_length', 'joint_count', 'corner',
  'detail_area', 'slabs_used', 'slab_area', 'waste_area',
];

const UNIT_LABELS: Record<string, string> = { m: 'пог. м', m2: 'м²', pcs: 'шт' };

/** Порядок груп на екрані — від різу до матеріалу, як іде виріб по цеху */
const GROUP_ORDER: ProductionFactKind[] = FACT_KINDS;

export function ServiceMappingPanel() {
  const serviceCatalog = useSettingsStore((s) => s.serviceCatalog);
  const mappingOverrides = useSettingsStore((s) => s.mappingOverrides);
  const customRules = useSettingsStore((s) => s.customRules);
  const setRuleEnabled = useSettingsStore((s) => s.setRuleEnabled);
  const updateRule = useSettingsStore((s) => s.updateRule);
  const addRule = useSettingsStore((s) => s.addRule);
  const removeRule = useSettingsStore((s) => s.removeRule);
  const resetMapping = useSettingsStore((s) => s.resetMapping);
  const getRules = useSettingsStore((s) => s.getRules);
  const getMappingProblems = useSettingsStore((s) => s.getMappingProblems);
  const exportSettings = useSettingsStore((s) => s.exportSettings);
  const importSettings = useSettingsStore((s) => s.importSettings);
  const importViyarCatalog = useSettingsStore((s) => s.importViyarCatalog);
  const switchToViyarCodes = useSettingsStore((s) => s.switchToViyarCodes);

  const edgeProfiles = useProjectStore((s) => s.project.referenceData?.edgeProfiles) ?? [];

  // Перечитуємо на кожну зміну сховища — правил десятки, це дешево.
  const rules = useMemo(
    () => getRules(),
    [getRules, mappingOverrides, customRules],
  );
  const problems = useMemo(
    () => getMappingProblems(),
    [getMappingProblems, mappingOverrides, customRules, serviceCatalog],
  );
  const problemsByRule = useMemo(() => {
    const map = new Map<string, string[]>();
    problems.forEach((problem) => {
      map.set(problem.ruleId, [...(map.get(problem.ruleId) ?? []), problem.message]);
    });
    return map;
  }, [problems]);

  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<Omit<MappingRule, 'source'>>({
    id: '',
    factKind: 'edge',
    variant: '',
    serviceId: '',
    multiplier: 1,
    enabled: true,
    note: '',
  });
  const [importError, setImportError] = useState<string | null>(null);
  const [viyarResult, setViyarResult] = useState<string | null>(null);

  const services = useMemo(
    () => Object.values(serviceCatalog).sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    [serviceCatalog],
  );

  /** Підказки для поля «уточнення» — щоб керівник не вгадував рядок */
  const variantHints = (kind: ProductionFactKind): string[] => {
    if (kind === 'edge') return edgeProfiles.map((profile) => profile.id);
    if (kind === 'joint_length') return ['butt', 'miter45', 'glued', 'tie'];
    if (kind === 'joint_count') return ['lt500', 'gt500'];
    if (kind === 'corner') return ['radius', 'chamfer', 'l-cut'];
    return [];
  };

  const edgeProfileLabel = (id?: string) =>
    edgeProfiles.find((profile) => profile.id === id)?.shortLabel
    ?? edgeProfiles.find((profile) => profile.id === id)?.label
    ?? id;

  const handleAdd = () => {
    if (!draft.serviceId) return;
    addRule({ ...draft, id: uid('rule'), variant: draft.variant?.trim() || undefined });
    setIsAdding(false);
    setDraft({ id: '', factKind: 'edge', variant: '', serviceId: '', multiplier: 1, enabled: true, note: '' });
  };

  const handleExport = () => {
    const blob = new Blob([exportSettings()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'slabcutplanner-послуги.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importSettings(String(reader.result ?? ''));
      setImportError(result.ok ? null : (result.error ?? 'Не вдалося прочитати файл'));
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const grouped = useMemo(() => {
    const map = new Map<ProductionFactKind, MappingRule[]>();
    rules.forEach((rule) => {
      map.set(rule.factKind, [...(map.get(rule.factKind) ?? []), rule]);
    });
    return GROUP_ORDER.filter((kind) => map.has(kind)).map((kind) => ({ kind, rules: map.get(kind)! }));
  }, [rules]);

  return (
    <div className="flex flex-col gap-6">
      {/* Заголовок */}
      <div className="flex items-start gap-4">
        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
          <Link2 className="w-8 h-8 stroke-[1.5]" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-gray-800">Прив'язки послуг до обробок</h3>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            Програма рахує з геометрії виробничі факти — метри різу, штуки отворів, метри торця.
            Тут задається, які послуги прайсу за них нараховуються. Одна обробка може давати
            кілька послуг: додайте ще один рядок, і обидві потраплять у кошторис.
          </p>
        </div>
      </div>

      {/* Дії */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setIsAdding((value) => !value)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Додати прив'язку
        </button>
        <button
          onClick={handleExport}
          className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
          title="Зберегти прайс і прив'язки у файл, щоб перенести на іншу машину"
        >
          <Download className="w-4 h-4" />
          Вивантажити
        </button>
        <label className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer whitespace-nowrap">
          <Upload className="w-4 h-4 shrink-0" />
          <span>Завантажити</span>
          <input type="file" accept="application/json" onChange={handleImport} style={{ display: 'none' }} />
        </label>
        <button
          onClick={() => {
            const result = switchToViyarCodes();
            setViyarResult(
              `Розрахунок переведено на облікові коди: ${result.services} послуг у каталозі, `
              + `${result.enabled} прив'язок увімкнено, ${result.disabled} внутрішніх вимкнено`,
            );
          }}
          className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm bg-slate-800 text-white rounded-md hover:bg-slate-900"
          title="Кошторис показуватиме коди 1С замість внутрішніх. Частина прив'язок — трактування, звірте їх."
        >
          <BookMarked className="w-4 h-4" />
          {rules.some((rule) => rule.id.startsWith('viyar:') && rule.enabled)
            && rules.some((rule) => rule.id.startsWith('viyar:') && !rule.enabled)
            ? 'Оновити коди ВіярПро'
            : 'Перевести на коди ВіярПро'}
        </button>
        <button
          onClick={() => {
            const result = importViyarCatalog();
            setViyarResult(
              result.added > 0
                ? `Додано ${result.added} послуг із довідника, ${result.kept} вже були в каталозі — їхні ціни не змінені`
                : `Усі ${result.kept} позицій довідника вже в каталозі`,
            );
          }}
          className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
          title="Підвантажити послуги ВіярПро з обліковими кодами. Ціни доведеться виставити — довідник їх не містить."
        >
          <BookMarked className="w-4 h-4" />
          Довідник ВіярПро ({VIYAR_SERVICE_COUNT})
        </button>
        <button
          onClick={resetMapping}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-md ml-auto"
          title="Повернути заводські прив'язки. Ціни й каталог послуг не зміняться."
        >
          <RefreshCw className="w-4 h-4" />
          Скинути прив'язки
        </button>
      </div>

      {viyarResult && (
        <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-sm text-emerald-800">
          <BookMarked className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div>{viyarResult}</div>
            <div className="text-xs text-emerald-700/70 mt-0.5">
              Ціни у нових позиціях нульові — виставте їх на вкладках зліва.
            </div>
            <div className="text-xs text-emerald-900/80 mt-2 font-medium">Для цього прямого відповідника в прайсі немає:</div>
            <ul className="text-xs text-emerald-700/70 list-disc list-inside">
              {VIYAR_UNMAPPED_FACTS.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      )}

      {importError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      {problems.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">У прив'язках {problems.length} проблем — ці рядки не порахуються правильно</div>
            <ul className="mt-1 space-y-0.5 list-disc list-inside">
              {problems.slice(0, 6).map((problem, index) => (
                <li key={`${problem.ruleId}_${index}`}>{problem.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Форма додавання */}
      {isAdding && (
        <div className="p-4 border border-blue-200 bg-blue-50/40 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-600 space-y-1">
              <span className="font-semibold uppercase tracking-wide">Обробка</span>
              <select
                className="w-full p-2 text-sm border border-slate-300 rounded bg-white"
                value={draft.factKind}
                onChange={(event) => setDraft({ ...draft, factKind: event.target.value as ProductionFactKind, variant: '' })}
              >
                {FACT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {FACT_KIND_LABELS[kind]} ({UNIT_LABELS[factUnit(kind)] ?? factUnit(kind)})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-slate-600 space-y-1">
              <span className="font-semibold uppercase tracking-wide">Уточнення</span>
              <input
                list="mapping-variant-hints"
                className="w-full p-2 text-sm border border-slate-300 rounded bg-white"
                placeholder="порожньо = будь-яке"
                value={draft.variant ?? ''}
                onChange={(event) => setDraft({ ...draft, variant: event.target.value })}
              />
              <datalist id="mapping-variant-hints">
                {variantHints(draft.factKind).map((hint) => <option key={hint} value={hint} />)}
              </datalist>
            </label>

            <label className="text-xs text-slate-600 space-y-1">
              <span className="font-semibold uppercase tracking-wide">Послуга</span>
              <select
                className="w-full p-2 text-sm border border-slate-300 rounded bg-white"
                value={draft.serviceId}
                onChange={(event) => setDraft({ ...draft, serviceId: event.target.value })}
              >
                <option value="">— оберіть послугу —</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} · {UNIT_LABELS[service.unit] ?? service.unit}
                    {service.externalId ? ` · ${service.externalId}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-600 space-y-1">
                <span className="font-semibold uppercase tracking-wide">Множник</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  className="w-full p-2 text-sm border border-slate-300 rounded bg-white"
                  value={draft.multiplier}
                  onChange={(event) => setDraft({ ...draft, multiplier: Number(event.target.value) })}
                />
              </label>
              <label className="text-xs text-slate-600 space-y-1">
                <span className="font-semibold uppercase tracking-wide">Матеріал</span>
                <select
                  className="w-full p-2 text-sm border border-slate-300 rounded bg-white"
                  value={draft.material ?? ''}
                  onChange={(event) => setDraft({ ...draft, material: (event.target.value || undefined) as MaterialType | undefined })}
                >
                  <option value="">будь-який</option>
                  {MATERIALS.map((material) => <option key={material} value={material}>{material}</option>)}
                </select>
              </label>
            </div>
          </div>

          <input
            className="w-full p-2 text-sm border border-slate-300 rounded bg-white"
            placeholder="Пояснення — навіщо ця прив'язка (видно тільки тут)"
            value={draft.note ?? ''}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          />

          <div className="flex justify-end gap-2">
            <button onClick={() => setIsAdding(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">
              Скасувати
            </button>
            <button
              onClick={handleAdd}
              disabled={!draft.serviceId}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md disabled:opacity-40 hover:bg-blue-700"
            >
              Додати
            </button>
          </div>
        </div>
      )}

      {/* Таблиця */}
      <div className="space-y-5">
        {grouped.map(({ kind, rules: groupRules }) => (
          <div key={kind}>
            <div className="flex items-baseline gap-2 mb-2">
              <h4 className="text-sm font-semibold text-slate-800">{FACT_KIND_LABELS[kind]}</h4>
              <span className="text-xs text-slate-400">
                міряється в {UNIT_LABELS[factUnit(kind)] ?? factUnit(kind)}
              </span>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
              {groupRules.map((rule) => {
                const ruleProblems = problemsByRule.get(rule.id) ?? [];
                return (
                  <div
                    key={rule.id}
                    className={`flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm ${rule.enabled ? 'bg-white' : 'bg-slate-50 text-slate-400'}`}
                  >
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) => setRuleEnabled(rule.id, event.target.checked)}
                      // global.css задає input { width: 100% } поза шарами і перебиває
                      // утиліти Tailwind — розмір чекбокса доводиться ставити інлайном
                      style={{ width: 16, height: 16, flex: '0 0 auto', margin: 0 }}
                      title={rule.enabled ? 'Вимкнути' : 'Увімкнути'}
                    />

                    <span className="min-w-[110px] text-xs">
                      {rule.variant
                        ? <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono">{kind === 'edge' ? edgeProfileLabel(rule.variant) : rule.variant}</span>
                        : <span className="text-slate-400">будь-яке</span>}
                    </span>

                    {rule.material && (
                      <span className="px-1.5 py-0.5 text-xs bg-amber-50 text-amber-700 rounded">{rule.material}</span>
                    )}

                    <select
                      className="flex-1 min-w-[220px] p-1.5 text-sm border border-slate-200 rounded bg-white"
                      value={rule.serviceId}
                      onChange={(event) => updateRule(rule.id, { serviceId: event.target.value })}
                    >
                      {!serviceCatalog[rule.serviceId] && (
                        <option value={rule.serviceId}>{rule.serviceId} — немає в каталозі</option>
                      )}
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name}{service.externalId ? ` · ${service.externalId}` : ''}
                        </option>
                      ))}
                    </select>

                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      ×
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        className="p-1 text-sm border border-slate-200 rounded text-right"
                        style={{ width: 56 }}
                        value={rule.multiplier}
                        onChange={(event) => updateRule(rule.id, { multiplier: Number(event.target.value) })}
                      />
                    </label>

                    {rule.source === 'custom'
                      ? (
                        <button
                          onClick={() => removeRule(rule.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                          title="Видалити прив'язку"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )
                      : <span className="w-7 shrink-0" />}

                    {(rule.note || ruleProblems.length > 0) && (
                      <div className="w-full flex items-start gap-1.5 pl-7 text-xs">
                        {ruleProblems.length > 0
                          ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                              <span className="text-amber-700">{ruleProblems.join('; ')}</span>
                            </>
                          )
                          : (
                            <>
                              <Info className="w-3.5 h-3.5 mt-0.5 text-slate-300 shrink-0" />
                              <span className="text-slate-400">{rule.note}</span>
                            </>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Вбудовані прив'язки не видаляються — вони вимикаються, щоб їх можна було повернути.
        Вид обробки й уточнення у вбудованих рядках не редагуються: це прив'язка до того, що
        рахує геометрія. Щоб зробити інакше — вимкніть рядок і додайте свій.
      </p>
    </div>
  );
}
