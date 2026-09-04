import { useState, useMemo } from 'react';
import { X, HelpCircle, LayoutTemplate, AlertTriangle, Info } from 'lucide-react';
import { translateStaticUiText } from '../../i18n';
import { ShapeIcon } from '../forms/utils/sharedInputs';
import { visibleDetailTypes, createDraft, defaultsForKind } from '../forms/utils/draftHelpers';
import { useUIStore } from '../../store/useStore';
import type { DetailDraft, ProductEditorSession } from '../forms/utils/draftHelpers';
import type { DetailType, MaterialType } from '../../domain/types';
import {
  materialsForNewProduct,
  thicknessesFor,
  allowsManualThickness,
  defaultThicknessFor,
  isThicknessAllowed,
  MANUAL_THICKNESS_CONDITIONS,
  MANUAL_THICKNESS_RANGE,
  DECOR_AVAILABILITY_HINT,
  thicknessUsageFor,
  usageRangesFor,
  thicknessTypeHint,
} from '../../domain/materialThickness';
import { designsForType } from './FormsPanel';
import { ProductTemplateModal } from './ProductTemplateModal';

/** Значення `<select>` товщини для «іншої» (ручної) товщини натурального каменю. */
const MANUAL_OPTION = 'manual';

/** Підпис під назвою матеріалу в картці: які товщини він дає. */
function thicknessCaption(material: MaterialType): string {
  const list = thicknessesFor(material);
  const base = list.length > 3 ? `${list[0]}–${list[list.length - 1]} мм` : list.map((t) => `${t} мм`).join(' · ');
  return allowsManualThickness(material) ? `${base} або своя` : base;
}

/**
 * МОДАЛКА «НОВИЙ ВИРІБ» (переробка 01.09.2026, рішення власника).
 *
 * Матеріал обирається ОБОВ'ЯЗКОВО і першим: від нього залежать дозволені
 * товщини (domain/materialThickness), профілі торця, перевірки цеху і
 * далі — окрема логіка створення виробу під кожен матеріал. Перелік
 * товщин у `<select>` — лише з таблиці матеріалу; зашитого 12/20/30/40
 * більше немає. Натуральний камінь має «Інша (вручну)» з особливими
 * умовами, які менеджер мусить підтвердити галочкою.
 */
export function CreateProductModal({
  onClose,
  onSave,
  onApplyTemplate,
  projectMaterial,
}: {
  onClose: () => void;
  onSave: (draft: DetailDraft, name: string, material: MaterialType) => void;
  /** Шаблони виробів (адмін-фіча): готова сесія редактора замість порожньої деталі. */
  onApplyTemplate?: (session: ProductEditorSession, state: { templateId: string; values: Record<string, number | string | boolean> }) => void;
  /**
   * Матеріал проєкту (з першого слеба), якщо вже є. Підставляється як
   * початковий вибір; інший матеріал обрати можна, але з попередженням —
   * на слеби проєкту такий виріб не ляже.
   */
  projectMaterial?: MaterialType;
}) {
  const materials = useMemo(() => materialsForNewProduct(), []);
  const initialMaterial = projectMaterial && materials.includes(projectMaterial) ? projectMaterial : null;

  const [material, setMaterial] = useState<MaterialType | null>(initialMaterial);
  const [draft, setDraft] = useState<DetailDraft>(() => ({
    ...createDraft(),
    thickness: defaultThicknessFor(initialMaterial),
  }));
  const [productName, setProductName] = useState('');
  const [manualThickness, setManualThickness] = useState(false);
  const [manualAcknowledged, setManualAcknowledged] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const isAdminUnlocked = useUIStore((s) => s.isAdminUnlocked);
  // Просунутий режим (01.09): підказки й сповіщення сховані — досвідчений
  // менеджер їх знає. Лишаються тільки функціональні речі: чому вимкнена
  // кнопка і галочка особливих умов (без тексту умов).
  const isExpertMode = useUIStore((s) => s.isExpertMode);
  const showHints = !isExpertMode;

  const designs = useMemo(
    () => designsForType(draft.type, isAdminUnlocked, draft.kind),
    [draft.type, isAdminUnlocked, draft.kind],
  );
  const ui = (text: string) => translateStaticUiText('uk', text);

  const updateDraft = (patch: Partial<DetailDraft>) => {
    // Форма приносить свої розміри (`defaultsForKind`) — інакше П-подібна,
    // створена тут, лишалась із розмірами прямокутника (04.09.2026).
    setDraft({ ...draft, ...(patch.kind ? defaultsForKind(patch.kind, draft.kind) : {}), ...patch });
  };

  const thicknessOptions = thicknessesFor(material);
  const manualAllowed = allowsManualThickness(material);

  const chooseMaterial = (next: MaterialType) => {
    setMaterial(next);
    setManualThickness(false);
    setManualAcknowledged(false);
    // Товщина з попереднього матеріалу може бути недозволена в новому —
    // тоді підставляємо замовчування нового.
    if (!thicknessesFor(next).includes(draft.thickness)) {
      updateDraft({ thickness: defaultThicknessFor(next) });
    }
  };

  const onThicknessSelect = (value: string) => {
    if (value === MANUAL_OPTION) {
      setManualThickness(true);
      setManualAcknowledged(false);
      return;
    }
    setManualThickness(false);
    setManualAcknowledged(false);
    updateDraft({ thickness: Number(value) });
  };

  const manualValid = !manualThickness
    || (Number.isFinite(draft.thickness)
      && draft.thickness >= MANUAL_THICKNESS_RANGE.min
      && draft.thickness <= MANUAL_THICKNESS_RANGE.max);

  /** Чому кнопка «Додати» вимкнена — щоб людина бачила, чого бракує. */
  const blocker = !material
    ? 'Оберіть матеріал'
    : !isThicknessAllowed(material, draft.thickness) || !manualValid
      ? 'Вкажіть товщину'
      : manualThickness && !manualAcknowledged
        ? 'Підтвердіть, що ознайомились з умовами'
        : null;

  const materialMismatch = Boolean(projectMaterial && material && projectMaterial !== material);

  // Підказки про товщину (01.09): загальна — про наявність декору; для
  // керамограніту — «яка товщина для чого» з підсвіткою поточної і м'яка
  // примітка, якщо тип деталі не рідний для товщини. Не блокує.
  const usageHints = thicknessUsageFor(material);
  const activeRanges = usageRangesFor(material, draft.thickness);
  const typeHint = manualThickness ? undefined : thicknessTypeHint(material, draft.thickness, draft.type);

  const handleSave = () => {
    if (!material || blocker) return;
    onSave(draft, productName, material);
  };

  return (
    <div className="create-product-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4" role="presentation">
      <div
        className="create-product-modal w-full max-w-[880px] max-h-[calc(100vh-2rem)] bg-[#dcebf5] rounded-md shadow-2xl flex flex-col overflow-hidden font-sans"
        role="dialog"
        aria-modal="true"
        aria-label="Новий виріб"
      >
        {/* Header */}
        <div className="bg-[#2489d8] text-white px-5 py-3 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold">Новий виріб</h2>
          <div className="flex items-center gap-3 text-white/80">
            {/* Шаблони — на релізі сховано: лише супер-адмін (щит, PIN) */}
            {isAdminUnlocked && onApplyTemplate && (
              <button
                className="flex items-center gap-1.5 text-sm font-medium bg-white/15 hover:bg-white/25 text-white rounded-sm px-2.5 py-1 transition-colors"
                onClick={() => setTemplatesOpen(true)}
                title="Шаблони виробів (адмін)"
              >
                <LayoutTemplate className="w-4 h-4" />
                Шаблони
              </button>
            )}
            <button className="hover:text-white transition-colors" title="Довідка">
              <HelpCircle className="w-5 h-5" />
            </button>
            <button className="hover:text-white transition-colors" onClick={onClose} title="Закрити">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="cpm-body p-7 flex flex-col gap-6 overflow-y-auto text-[15px]">
          {/* Назва виробу */}
          <div>
            <label className="block text-[15px] font-bold text-slate-700 mb-2">
              Назва виробу
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Стільниця кухня, острів, підвіконня…"
              className="w-full bg-white border border-transparent focus:border-[#2489d8] rounded-sm px-3 py-2.5 text-[15px] outline-none shadow-sm transition-colors"
            />
          </div>

          {/* Матеріал — обов'язковий. Від нього залежать товщини і далі вся логіка обробки. */}
          <div>
            <label className="block text-[15px] font-bold text-slate-700 mb-2">
              Матеріал <span className="text-red-600" title="Обов'язково">*</span>
            </label>
            <div className="cpm-materials grid grid-cols-4 gap-3" role="radiogroup" aria-label="Матеріал">
              {materials.map((m) => {
                const active = material === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => chooseMaterial(m)}
                    className={`text-left rounded-sm px-3.5 py-3 shadow-sm border transition-all ${
                      active
                        ? 'bg-white border-[#2489d8] ring-2 ring-[#2489d8]/40'
                        : 'bg-white/70 border-transparent hover:bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className={`text-[15px] font-bold leading-tight ${active ? 'text-[#2489d8]' : 'text-slate-700'}`}>{ui(m)}</div>
                    <div className="text-[12px] text-slate-500 mt-1">{thicknessCaption(m)}</div>
                  </button>
                );
              })}
            </div>
            {showHints && !material && (
              <div className="mt-2 text-[13px] text-slate-500">
                Без матеріалу виріб не створюється: від нього залежать товщини, профілі торця і перевірки цеху.
              </div>
            )}
            {showHints && materialMismatch && (
              <div className="mt-2 flex items-start gap-2 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  У проєкті вже є слеби з матеріалу «{ui(projectMaterial!)}». Виріб з «{ui(material!)}» на них не
                  ляже — під нього потрібні свої слеби.
                </span>
              </div>
            )}
          </div>

          {/* Підказки про товщину: наявність декору (усім) і призначення товщин (керамограніт) */}
          {showHints && material && (
            <div className="flex items-start gap-2 text-[13px] text-sky-900 bg-sky-50 border border-sky-200 rounded-sm px-3.5 py-2.5">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" />
              <div className="flex flex-col gap-1.5 min-w-0">
                <div>{DECOR_AVAILABILITY_HINT}</div>
                {usageHints.length > 0 && (
                  <div>
                    <div className="font-bold mb-0.5">{ui(material)} за товщиною:</div>
                    <ul className="flex flex-col gap-0.5">
                      {usageHints.map((h) => {
                        const active = activeRanges.includes(h);
                        return (
                          <li
                            key={`${h.min}-${h.max}`}
                            className={`flex gap-2 rounded-sm px-1.5 py-0.5 -mx-1.5 ${active ? 'bg-white font-semibold text-sky-900' : ''}`}
                          >
                            <span className="w-20 shrink-0 tabular-nums">{h.min}–{h.max} мм</span>
                            <span>{h.use}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Тип, товщина, кількість */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[15px] font-bold text-slate-700 mb-2">
                Базовий елемент
              </label>
              <select
                value={draft.type}
                onChange={(e) => updateDraft({ type: e.target.value as DetailType })}
                className="w-full bg-white border border-transparent focus:border-[#2489d8] rounded-sm px-3 py-2.5 text-[15px] outline-none shadow-sm cursor-pointer"
              >
                {visibleDetailTypes(isAdminUnlocked, draft.type).map((type) => (
                  <option key={type} value={type}>{ui(type)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[15px] font-bold text-slate-700 mb-2">
                Товщина, мм
              </label>
              <select
                value={manualThickness ? MANUAL_OPTION : draft.thickness.toString()}
                onChange={(e) => onThicknessSelect(e.target.value)}
                disabled={!material}
                className="w-full bg-white border border-transparent focus:border-[#2489d8] rounded-sm px-3 py-2.5 text-[15px] outline-none shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {!material && <option value="">— спершу матеріал —</option>}
                {thicknessOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                {manualAllowed && <option value={MANUAL_OPTION}>Інша (вручну)…</option>}
              </select>
            </div>
            <div>
              <label className="block text-[15px] font-bold text-slate-700 mb-2">
                Кількість
              </label>
              <div className="flex items-center bg-white rounded-sm shadow-sm border border-transparent focus-within:border-[#2489d8] overflow-hidden">
                <input
                  type="number"
                  min="1"
                  value={draft.quantity}
                  onChange={(e) => updateDraft({ quantity: Math.max(1, Number(e.target.value)) })}
                  className="flex-1 w-full min-w-0 px-3 py-2.5 text-[15px] outline-none font-bold text-slate-700"
                />
                <span className="px-3 text-[15px] text-slate-500 font-medium bg-slate-50 border-l border-slate-200">
                  шт
                </span>
              </div>
            </div>
          </div>

          {showHints && typeHint && (
            <div className="flex items-start gap-2 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-3.5 py-2.5 -mt-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Обрано «{ui(draft.type)}» на {draft.thickness} мм. {typeHint} Це підказка, не заборона.</span>
            </div>
          )}

          {/* Ручна товщина натурального каменю — особливі умови, які менеджер мусить прочитати */}
          {manualThickness && (
            <div className="bg-white rounded-sm shadow-sm border border-amber-300 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <label className="text-[15px] font-bold text-slate-700 whitespace-nowrap">Товщина плити, мм</label>
                <input
                  type="number"
                  min={MANUAL_THICKNESS_RANGE.min}
                  max={MANUAL_THICKNESS_RANGE.max}
                  step="1"
                  value={draft.thickness}
                  onChange={(e) => updateDraft({ thickness: Number(e.target.value) })}
                  className={`w-28 border rounded-sm px-3 py-2 text-[15px] outline-none ${manualValid ? 'border-slate-300 focus:border-[#2489d8]' : 'border-red-400'}`}
                />
                <span className="text-xs text-slate-500">від {MANUAL_THICKNESS_RANGE.min} до {MANUAL_THICKNESS_RANGE.max} мм</span>
              </div>
              {showHints && (
                <div className="flex items-start gap-2 text-sm text-amber-900">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <div className="font-bold mb-1">Нестандартна товщина натурального каменю — особливі умови</div>
                    <ul className="list-disc pl-5 flex flex-col gap-0.5 text-[13px]">
                      {MANUAL_THICKNESS_CONDITIONS.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer text-[15px] font-medium text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={manualAcknowledged}
                  onChange={(e) => setManualAcknowledged(e.target.checked)}
                  className="w-4 h-4 accent-[#2489d8]"
                />
                {showHints ? 'Я ознайомився з умовами і беру їх до уваги' : 'Ознайомлений з особливими умовами нестандартної товщини'}
              </label>
            </div>
          )}

          {/* Форми (Radio buttons + Thumbnails) */}
          <div className={`cpm-shapes mt-1 grid gap-5 ${designs.length > 3 ? 'grid-cols-5' : 'grid-cols-3'}`}>
            {designs.map((design) => (
              <div key={design.kind} className="flex flex-col gap-2">
                <label
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={(e) => {
                    e.preventDefault();
                    updateDraft({ kind: design.kind });
                  }}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${draft.kind === design.kind ? 'border-[#2489d8]' : 'border-slate-400 group-hover:border-[#2489d8]'}`}>
                    {draft.kind === design.kind && <div className="w-2.5 h-2.5 rounded-full bg-[#2489d8]" />}
                  </div>
                  <span className="text-[15px] font-medium text-slate-700">{ui(design.label)}</span>
                </label>

                <button
                  type="button"
                  onClick={() => updateDraft({ kind: design.kind })}
                  className={`h-28 bg-slate-400/50 rounded-sm flex items-center justify-center transition-all ${
                    draft.kind === design.kind
                      ? 'bg-[#2489d8]/10 ring-2 ring-[#2489d8] text-[#2489d8]'
                      : 'text-slate-500 hover:bg-slate-400/70'
                  }`}
                >
                  <ShapeIcon kind={design.kind} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="cpm-footer px-6 py-4 flex items-center justify-between gap-4 shrink-0 border-t border-white/60">
          <div className="text-[13px] text-slate-500">{blocker ?? ''}</div>
          <button
            type="button"
            onClick={handleSave}
            disabled={Boolean(blocker)}
            title={blocker ?? undefined}
            className="px-7 py-2.5 text-[15px] border border-[#2489d8] text-[#2489d8] font-bold rounded-sm hover:bg-[#2489d8] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#2489d8]"
          >
            Додати
          </button>
        </div>
      </div>

      {templatesOpen && onApplyTemplate && (
        <ProductTemplateModal
          onClose={() => setTemplatesOpen(false)}
          onCreate={(session, state) => {
            setTemplatesOpen(false);
            onApplyTemplate(session, state);
          }}
        />
      )}
    </div>
  );
}
