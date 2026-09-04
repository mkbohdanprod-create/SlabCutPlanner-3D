import React, { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import type { DetailDraft } from '../forms/utils/draftHelpers';
import { DimensionsTable, SideSizeInput } from './DimensionsTable';
import { SideLockButton } from './SideLockButton';
import { Detail2DBlueprint } from './Detail2DBlueprint';
import { sideOptionsFor, supportsEdges } from './FormsPanel';
import { getSideSize, applySideEdit } from '../forms/utils/draftHelpers';
import { sideEditable, WIDTH_SIDE } from '../../domain/sideLocks';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useStore';
import { minSideMmFor } from '../../domain/manufacturability';

function Accordion({ title, children, defaultOpen = false, info }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Розділ довідки для кнопки «i» — як у панелі кромок (openHelp). */
  info?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const openHelp = useUIStore((s) => s.openHelp);
  return (
    /* shrink-0 обов'язковий: права панель — flex-колонка, і без нього
       акордеон стискається нижче свого вмісту, а `overflow-hidden` тихо
       відрізає останні рядки таблиці (сторона H зникала). */
    <div className="shrink-0 border border-slate-200 mb-2 rounded-sm bg-white overflow-hidden">
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 bg-[#dcebf5] hover:bg-[#cbe0f0] flex items-center justify-between text-sm font-bold text-[#1f93ef] transition-colors"
      >
        {title}
        <span className="flex items-center gap-2">
          {info && (
            <span
              role="button"
              title="Як користуватись цим розділом — інструкція зі скрінами"
              className="w-5 h-5 rounded-full border border-[#b9d5f5] !bg-[#dbeafe] text-[#0058ab] text-[11px] font-bold flex items-center justify-center hover:!bg-[#0084ff] hover:!text-white transition-colors"
              onClick={(e) => { e.stopPropagation(); openHelp(info); }}
            >
              i
            </span>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>
      {isOpen && (
        <div className="p-0 border-t border-slate-200">
          {children}
        </div>
      )}
    </div>
  );
}

import type { MaterialType, Project } from '../../domain/types';
import { thicknessesFor, allowsManualThickness, MANUAL_THICKNESS_RANGE } from '../../domain/materialThickness';

export function ElementSettingsModal({
  initialDetail,
  project,
  material,
  onClose,
  onSave,
  embedded = false,
  /* `occupiedSides` більше не розбираємо: кромки прибрані з цього вікна
     04.09, а пропс лишається в типі, щоб не переписувати виклики. */
}: {
  initialDetail: DetailDraft;
  project: Project;
  /** Сторони, закриті доповненням (нога/потовщення/підворот) — у таблиці сторін форму не обрати. */
  occupiedSides?: Record<string, string>;
  /**
   * Матеріал виробу (01.09): від нього перелік товщин у «Товщина виробу».
   * Порожньо (старий виріб без матеріалу) — беремо матеріал проєкту, а
   * без нього — історичний список 12/20/30/40.
   */
  material?: MaterialType;
  onClose: () => void;
  onSave: (draft: DetailDraft) => void;
  /** true — рендеримо всередині робочої області (дерево і властивості лишаються видимі),
   *  false — як повноекранна модалка. Компонент один, змінюється лише обгортка. */
  embedded?: boolean;
}) {
  const [draft, setDraft] = useState<DetailDraft>(initialDetail);
  /* ЗАМКИ НА РОЗМІРАХ (04.09). Живуть у вікні, а не в проєкті: це спосіб
     редагування, а не властивість деталі. Закрив замки, посунув габарит,
     зберіг — у файлі проєкту нічого нового не з'явилось. Математику тримає
     domain/sideLocks.ts, і вона одна на таблицю сторін та константу λ. */
  const [lockedSides, setLockedSides] = useState<ReadonlySet<string>>(() => new Set<string>());
  const toggleLock = (side: string) => setLockedSides((prev) => {
    const next = new Set(prev);
    if (!next.delete(side)) next.add(side);
    return next;
  });
  const effectiveMaterial = material ?? project.projectMaterial;
  const thicknessOptions = useMemo(() => {
    const list = effectiveMaterial ? thicknessesFor(effectiveMaterial) : [12, 20, 30, 40];
    // Поточна товщина поза переліком (старий виріб, ручна товщина
    // натуралки) — показуємо, щоб select не «стрибав» на чуже значення.
    return list.includes(draft.thickness) ? list : [...list, draft.thickness].sort((a, b) => a - b);
  }, [effectiveMaterial, draft.thickness]);
  const manualThicknessAllowed = allowsManualThickness(effectiveMaterial);
  // Просунутий режим: підказки сховані (рішення власника 01.09).
  const isExpertMode = useUIStore((s) => s.isExpertMode);
  // Довільний контур і ніша дають свої імена сторін — тому в залежностях і вони.
  const sides = useMemo(() => sideOptionsFor(draft.kind, draft as never), [draft.kind, (draft as { uCutout?: unknown }).uCutout, (draft as { customPoints?: unknown }).customPoints]);
  const showEdges = supportsEdges(draft.type);

  const updateDraft = (patch: Partial<DetailDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  /**
   * FG-10. Коротка сторона — це РИЗИК, а не заборона.
   *
   * Тут стояло `size < 150` із зашитим числом, і воно гасило кнопку
   * «Зберегти». Фокус-група вперлась у це на реальному замовленні: смуга
   * 2800×32 не заводилась узагалі, хоча цех такі ріже. Тепер поріг живе в
   * налаштуваннях окремо під матеріал, а результат — жовте попередження:
   * менеджер бачить ризик і вирішує сам.
   */
  const minSideMm = useSettingsStore((s) => s.minSideMm);
  const sideLimitMm = minSideMmFor(project.projectMaterial, minSideMm);
  const warnSide = useMemo(() => {
    if (sideLimitMm <= 0) return null;
    for (const side of sides) {
      const size = getSideSize(draft, side);
      if (size > 0 && size < sideLimitMm) return side;
    }
    return null;
  }, [draft, sides, sideLimitMm]);

  return (
    <div
      className={embedded
        ? 'w-full h-full bg-white flex flex-col overflow-hidden font-sans'
        : 'fixed inset-0 z-[100] w-full h-full bg-white flex flex-col overflow-hidden font-sans'}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
    >
      {/* Header — у вбудованому режимі не потрібен, бо є заголовок робочої області */}
        {!embedded && (
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-700">Налаштування розмірів та торців</h2>
          <button className="hover:text-[#1f93ef] transition-colors text-slate-500" onClick={onClose} title="Закрити">
            <X className="w-6 h-6" />
          </button>
        </div>
        )}

        {/* Попередження про коротку сторону (FG-10).
            Три окремі вузли, а не один рядок: перекладач інтерфейсу міняє
            текст вузла ЦІЛКОМ за збігом, тож літера сторони посередині
            зробила б фразу неперекладною. */}
        {warnSide ? (
          <div className="shrink-0 bg-[#fff4e0] border-b border-[#e2a03f] px-6 py-2 text-center text-sm font-medium text-[#7a4b06]">
            <span>Сторона</span>{' '}
            <span className="font-bold">{warnSide}</span>{' '}
            <span>{`вужча за ${sideLimitMm} мм — деталь ризикована, цех може відмовити`}</span>
          </div>
        ) : (
          <div className="shrink-0 bg-[#fff9e6] border-b border-[#f2c94c] px-6 py-2 text-center text-sm font-medium text-slate-800">
            Попередження: Перевірте всі габаритні розміри
          </div>
        )}

        {/* Main Body Split.
            min-h-0 обов'язковий: без нього flex-дитина не дає собі стиснутись
            нижче власного вмісту, права панель перестає скролитись, і нижні
            блоки разом із рядком кнопок їдуть за межу вікна (FG-25/FG-26). */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Main Blueprint Area */}
          <div className="flex-1 p-6 flex flex-col bg-white">
            <div className="flex-1 bg-white relative overflow-hidden">
              <Detail2DBlueprint
                detail={draft}
                lockedSides={lockedSides}
                onToggleSideLock={toggleLock}
                /* Розмір редагується прямо в кресленні — тією самою
                   математикою, що й у панелі (applySideEdit + замки). */
                isSideEditable={(side) => sideEditable(draft, side, lockedSides)
                  && !(draft as { customPoints?: unknown[] }).customPoints?.length}
                onCommitSide={(side, value) => {
                  const patch = applySideEdit(draft, side, value, lockedSides);
                  if (Object.keys(patch).length > 0) updateDraft(patch);
                }}
              />
              {/* Ліва/права Г (26.08): перемикач прямо на кресленні, бо саме
                  тут людина бачить, куди дивиться виріз. Дзеркалиться
                  реальний контур (cornerOrientation у рушії), не картинка. */}
              {draft.kind === 'l' && (
                <div className="absolute top-2 left-2 flex rounded overflow-hidden border border-slate-300 bg-white text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => updateDraft({ mirrorL: undefined })}
                    className={`px-3 py-1.5 ${!draft.mirrorL ? 'bg-[#1f93ef] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    Права
                  </button>
                  <button
                    type="button"
                    onClick={() => updateDraft({ mirrorL: true })}
                    className={`px-3 py-1.5 ${draft.mirrorL ? 'bg-[#1f93ef] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    Ліва
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-[340px] shrink-0 min-h-0 bg-[#f4f7f9] border-l border-slate-200 overflow-y-auto custom-scrollbar p-3 flex flex-col">
            {/* Сторони (Розміри та Кромка) */}
            {showEdges && (
              <Accordion title="Сторони" defaultOpen={true} info="sizes">
                <div className="p-0 bg-white">
                  <DimensionsTable
                    draft={draft}
                    updateDetail={updateDraft}
                    sides={sides}
                    lockedSides={lockedSides}
                    onToggleLock={toggleLock}
                  />
                </div>
              </Accordion>
            )}
            {draft.kind === 'u' && (
              <Accordion title="λ" defaultOpen={true} info="sizes">
                {/* Це поле мало власну копію формули — і рахувало «Ширину»
                    від лівої ноги, тоді як решта програми рахує її від
                    найвищої. Тепер читає getSideSize і пише applySideEdit,
                    як усі сторони, і має такий самий замок: закритий —
                    перекладина не пливе, коли міняють висоти ніг. */}
                <div className="p-4 bg-white flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <SideSizeInput
                      length={getSideSize(draft, WIDTH_SIDE)}
                      readOnly={!sideEditable(draft, WIDTH_SIDE, lockedSides)}
                      title={lockedSides.has(WIDTH_SIDE) ? 'Замок закритий — зніміть його, щоб змінити λ' : undefined}
                      onCommit={(val) => {
                        const patch = applySideEdit(draft, WIDTH_SIDE, val, lockedSides);
                        if (Object.keys(patch).length > 0) updateDraft(patch);
                      }}
                    />
                    <SideLockButton locked={lockedSides.has(WIDTH_SIDE)} onToggle={() => toggleLock(WIDTH_SIDE)} />
                  </div>
                  <span className="text-xs text-slate-500">λ — товщина верхньої частини деталі</span>
                </div>
              </Accordion>
            )}

            <Accordion title="Товщина виробу" defaultOpen={true}>
              <div className="p-4 bg-white flex flex-col gap-2">
                <select 
                  value={draft.thickness.toString()}
                  onChange={(e) => updateDraft({ thickness: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-sm outline-none focus:border-[#1f93ef] bg-white text-sm"
                >
                  {thicknessOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}{effectiveMaterial && !thicknessesFor(effectiveMaterial).includes(t) ? ' (поза переліком матеріалу)' : ''}
                    </option>
                  ))}
                </select>
                {effectiveMaterial && !isExpertMode && (
                  <span className="text-xs text-slate-500">
                    Матеріал «{effectiveMaterial}»: {thicknessesFor(effectiveMaterial).join(' / ')} мм{manualThicknessAllowed ? ' або своя' : ''}
                  </span>
                )}
                {manualThicknessAllowed && (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    Своя товщина, мм
                    <input
                      type="number"
                      min={MANUAL_THICKNESS_RANGE.min}
                      max={MANUAL_THICKNESS_RANGE.max}
                      value={draft.thickness}
                      onChange={(e) => updateDraft({ thickness: Number(e.target.value) })}
                      className="w-24 p-1.5 border border-slate-300 rounded-sm outline-none focus:border-[#1f93ef] text-sm"
                    />
                  </label>
                )}
              </div>
            </Accordion>

            <Accordion title="Висота встановлення" defaultOpen={true}>
              <div className="p-4 bg-white flex flex-col gap-2">
                <label className="text-xs text-slate-500">Висота від підлоги, мм</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={draft.elevation ?? 900}
                  onChange={(e) => updateDraft({ elevation: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-sm outline-none focus:border-[#1f93ef] bg-white text-sm"
                />
              </div>
            </Accordion>

            {/* «Кількість виробів» звідси прибрано 04.09 на вимогу власника:
                поле дублювало кількість із модалки створення виробу, стояло
                в кінці налаштувань РОЗМІРІВ і збивало з пантелику. Саме число
                (`quantity`) лишається в моделі й далі множить деталі в
                розкрої (engines/geometry.ts) — прибрано другий вхід, не
                функцію. */}
          </div>
        </div>

        {/* Footer.
            FG-26: рядок дій закріплений (shrink-0) — він більше не їде разом
            із вмістом правої панелі. І назви розведені: тут зберігається САМЕ
            ця деталь, а «Зберегти виріб» угорі праворуч закриває весь виріб.
            Раніше обидві кнопки називались «Зберегти», і люди тиснули не ту. */}
        <div className="shrink-0 px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Зберігає лише цю деталь. Виріб цілком — кнопкою «Зберегти виріб» угорі.
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-slate-300 text-slate-600 font-medium rounded-sm hover:bg-slate-100 transition-colors"
            >
              {embedded ? 'Закрити креслення' : 'Закрити'}
            </button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              /* FG-10: коротка сторона більше НЕ блокує збереження — це
                 попередження, а рішення за менеджером. */
              className="px-8 py-2 font-bold rounded-sm shadow-sm transition-colors bg-[#1f93ef] text-white hover:bg-[#1875c0]" 
            >
              Зберегти деталь
            </button>
          </div>
        </div>
    </div>
  );
}
