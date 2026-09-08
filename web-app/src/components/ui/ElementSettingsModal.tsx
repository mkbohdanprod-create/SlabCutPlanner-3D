import React, { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import type { DetailDraft } from '../forms/utils/draftHelpers';
import { DimensionsTable, SideSizeInput } from './DimensionsTable';
import { SideLockButton } from './SideLockButton';
import { Detail2DBlueprint } from './Detail2DBlueprint';
import { sideOptionsFor, supportsEdges } from './FormsPanel';
import { getSideSize, applySideEdit } from '../forms/utils/draftHelpers';
import { DIAMETER_SIDE, ELLIPSE_H_SIDE, ELLIPSE_W_SIDE, sideEditable, WIDTH_SIDE } from '../../domain/sideLocks';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useStore';
import { minSideMmFor } from '../../domain/manufacturability';
import { jointAnchorPoints, manualJointPosition } from '../../domain/joints';
import { toDetailShape } from '../../domain/elementToDetail';

/**
 * СЕКЦІЯ РЕДАГУВАННЯ ДЕТАЛІ (№134, задум власника 08.09).
 *
 * Усе редагування деталі зводиться в одне вікно, праворуч — п'ять секцій:
 *   1 Габарити · 2 Стики · 3 Вирізи · 4 Мийки і проточки · 5 Розетки й інше.
 * Відкрита завжди рівно одна — вона ж вирішує, як показувати креслення:
 * у «Габаритах» воно з виносками й літерами сторін, у решті — голе, бо там
 * людина клацає по площині деталі, а розмірна графіка заважає.
 */
function SectionRow({ n, title, active, onClick, hint }: {
  n: number; title: string; active: boolean; onClick: () => void; hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={`shrink-0 w-full mb-2 px-3 py-2.5 rounded-sm border text-left flex items-center gap-2.5 transition-colors ${
        active
          ? 'bg-white border-[#1f93ef] shadow-sm'
          : 'bg-white/70 border-slate-200 hover:bg-white hover:border-slate-300'
      }`}
    >
      <span className={`w-5 h-5 shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center ${
        active ? 'bg-[#1f93ef] text-white' : 'bg-slate-200 text-slate-600'
      }`}>{n}</span>
      <span className={`text-sm ${active ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{title}</span>
      <ChevronDown className={`w-4 h-4 ml-auto text-slate-400 transition-transform ${active ? 'rotate-180' : ''}`} />
    </button>
  );
}

/** Секція, меню якої ще переносимо з редактора виробу. */
function SectionStub({ what }: { what: string }) {
  return (
    <div className="shrink-0 mb-2 rounded-sm border border-dashed border-slate-300 bg-white px-3 py-3 text-xs leading-relaxed text-slate-500">
      <b className="text-slate-700">Меню переноситься сюди.</b> {what}
      <div className="mt-1 text-slate-400">
        Поки що керується у властивостях деталі в редакторі виробу.
      </div>
    </div>
  );
}

function Accordion({ title, children, defaultOpen = false, info, flat }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Розділ довідки для кнопки «i» — як у панелі кромок (openHelp). */
  info?: string;
  /** №134: підблок усередині секції — заголовок є, власного згортання немає.
      Власник: «ці чотири схлопуємо в одну випадашку» — тобто чотири колишні
      акордеони («Сторони», «λ», «Товщина», «Висота») стали підблоками однієї
      секції «Габарити», і клацати їх окремо більше не треба. */
  flat?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const openHelp = useUIStore((s) => s.openHelp);
  if (flat) {
    return (
      <div className="shrink-0 border-b border-slate-100 last:border-b-0">
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</span>
          {info && (
            <button
              type="button"
              onClick={() => openHelp(info)}
              className="w-4 h-4 rounded-full border border-[#1f93ef] text-[#1f93ef] text-[10px] leading-none flex items-center justify-center hover:bg-[#e8f3fd]"
              title="Довідка"
            >i</button>
          )}
        </div>
        {children}
      </div>
    );
  }
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
  panels,
  /* `occupiedSides` більше не розбираємо: кромки прибрані з цього вікна
     04.09, а пропс лишається в типі, щоб не переписувати виклики. */
}: {
  initialDetail: DetailDraft;
  project: Project;
  /**
   * №134: готові панелі властивостей деталі з редактора виробу — стики,
   * вирізи, проточки, кромки, радіуси. Приходять сюди вузлами, а не копією
   * коду: JSX і стан лишаються там, де були, а це вікно лише показує їх у
   * своїх секціях. Немає панелей (модал відкрито з іншого місця) —
   * показуємо, що саме сюди переїде.
   */
  panels?: {
    edges?: React.ReactNode;
    corners?: React.ReactNode;
    cutouts?: React.ReactNode;
    millings?: React.ReactNode;
    joints?: React.ReactNode;
  };
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
  /* №134: активна секція правої панелі. «Габарити» — стартова. */
  /* null — усі секції згорнуті: клік по відкритій секції закриває її
     (№136, зауваження власника: «при натисканні не звертається»). */
  const [section, setSection] = useState<'sizes' | 'joints' | 'cutouts' | 'sinks' | 'sockets' | null>('sizes');
  const toggleSection = (id: 'sizes' | 'joints' | 'cutouts' | 'sinks' | 'sockets') =>
    setSection((cur) => (cur === id ? null : id));

  /* ── СТИКИ (№137) ──────────────────────────────────────────────────────
     Єдине місце створення стиків для деталей: клік по стороні на кресленні,
     відступ, Enter. Тут — запис у деталь, список і видалення. */
  const manualJoints = (draft as { manualJoints?: Array<{ id: string; axis: 'vertical' | 'horizontal'; anchorCorner?: string; offset: number; referenceSideId?: string; sideId?: string; oppositeSideId?: string }> }).manualJoints ?? [];

  const addJoint = (j: {
    sideId: string; oppositeSideId: string; axis: 'vertical' | 'horizontal';
    anchorCorner?: string; referenceSideId?: string; offset: number;
  }) => {
    const id = `mj_${Date.now().toString(36)}`;
    setDraft((prev) => ({
      ...prev,
      manualJoints: [...(((prev as { manualJoints?: unknown[] }).manualJoints ?? []) as never[]), { id, ...j } as never],
    } as DetailDraft));
  };

  const removeJoint = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      manualJoints: (((prev as { manualJoints?: Array<{ id: string }> }).manualJoints ?? []).filter((x) => x.id !== id)) as never,
    } as DetailDraft));
  };

  /* Подвійний клік по підпису = «змінити відступ»: прибираємо стик і даємо
     поставити наново — так само, як його і створювали. Це чесніше за
     окреме вікно редагування: механіка одна. */
  const editJoint = (id: string) => removeJoint(id);

  /* Лінії для креслення: домен рахує позицію від кута, ми лише передаємо. */
  const jointLines = manualJoints.map((j) => ({
    id: j.id,
    axis: j.axis,
    position: manualJointPosition(
      jointAnchorPoints(toDetailShape(draft.kind), draft as never),
      draft.corners,
      j,
    ).snapped,
    /* На кресленні — жодних підписів: лінія і виноска з числом (власник
       08.09). Пара сторін і мм читаються у списку праворуч. */
    offset: j.offset,
    sideId: j.sideId,
    oppositeId: j.oppositeSideId,
  }));

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
                /* №134: виноски й літери сторін — тільки в секції «Габарити». */
                /* Голе креслення — лише для секцій, де розміри заважають.
                   У «Стиках» власник просив показати розміри, але заборонити
                   їх редагувати: тут створюються стики, а не габарити. */
                bare={section !== null && section !== 'sizes' && section !== 'joints'}
                sideLabels={section === 'joints'}
                dimsReadOnly={section === 'joints'}
                jointMode={section === 'joints'}
                joints={jointLines}
                onJointCreate={addJoint}
                onJointEdit={editJoint}
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
            <SectionRow n={1} title="Габарити" active={section === 'sizes'} onClick={() => toggleSection('sizes')}
              hint="Сторони, λ, товщина, висота встановлення — креслення з виносками" />

            {section === 'sizes' && (
            <div className="shrink-0 mb-2 rounded-sm border border-slate-200 bg-white overflow-hidden">
            {/* Сторони (Розміри та Кромка) */}
            {showEdges && (
              <Accordion title="Сторони" defaultOpen={true} flat info="sizes">
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
            {/* Кругла: єдиний розмір — діаметр. Сторони A–D у таблиці вище
                це чверті дуги, ними форму не задати. */}
            {draft.kind === 'circle' && (
              <Accordion title="Ø" defaultOpen={true} flat info="sizes">
                <div className="p-4 bg-white flex flex-col gap-2">
                  <SideSizeInput
                    length={getSideSize(draft, DIAMETER_SIDE)}
                    readOnly={false}
                    onCommit={(val) => {
                      const patch = applySideEdit(draft, DIAMETER_SIDE, val);
                      if (Object.keys(patch).length > 0) updateDraft(patch);
                    }}
                  />
                  <span className="text-xs text-slate-500">Ø — діаметр деталі</span>
                </div>
              </Accordion>
            )}

            {/* Овальна: дві осі. Замків тут немає — рівняння між ними теж. */}
            {draft.kind === 'ellipse' && (
              <Accordion title="Габарити" defaultOpen={true} flat info="sizes">
                <div className="p-4 bg-white flex flex-col gap-3">
                  <label className="flex items-center justify-between gap-3 text-xs text-slate-600">
                    Ширина
                    <SideSizeInput
                      length={getSideSize(draft, ELLIPSE_W_SIDE)}
                      readOnly={false}
                      className="w-[110px]"
                      onCommit={(val) => {
                        const patch = applySideEdit(draft, ELLIPSE_W_SIDE, val);
                        if (Object.keys(patch).length > 0) updateDraft(patch);
                      }}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-xs text-slate-600">
                    Висота
                    <SideSizeInput
                      length={getSideSize(draft, ELLIPSE_H_SIDE)}
                      readOnly={false}
                      className="w-[110px]"
                      onCommit={(val) => {
                        const patch = applySideEdit(draft, ELLIPSE_H_SIDE, val);
                        if (Object.keys(patch).length > 0) updateDraft(patch);
                      }}
                    />
                  </label>
                  <span className="text-xs text-slate-500">Дві осі овалу; A–D у таблиці — чверті дуги</span>
                </div>
              </Accordion>
            )}

            {draft.kind === 'u' && (
              <Accordion title="λ" defaultOpen={true} flat info="sizes">
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

            <Accordion title="Товщина виробу" defaultOpen={true} flat>
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

            <Accordion title="Висота встановлення" defaultOpen={true} flat>
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

            </div>
            )}

            <SectionRow n={2} title="Стики" active={section === 'joints'} onClick={() => toggleSection('joints')}
              hint="З'єднання деталей — креслення показується голим" />
            {section === 'joints' && (
              <div className="shrink-0 mb-2 rounded-sm border border-slate-200 bg-white overflow-hidden">
                <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Стики цієї деталі
                </div>
                {manualJoints.length === 0 ? (
                  <div className="px-3 pb-3 text-xs text-slate-500">
                    Клацни літеру сторони на кресленні — протилежна підсвітиться сама,
                    введи відступ і натисни Enter.
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {manualJoints.map((j) => (
                      <div key={j.id} className="flex items-center gap-2 px-3 py-2 border-t border-slate-100 text-sm">
                        <span className="w-2 h-2 rounded-full bg-[#22c55e] shrink-0" />
                        <button
                          type="button"
                          onClick={() => editJoint(j.id)}
                          className="flex-1 text-left text-slate-700 hover:text-[#1f93ef]"
                          title="Клік — поставити цей стик наново"
                        >
                          Стик {j.sideId}{j.oppositeSideId ? `–${j.oppositeSideId}` : ''}
                          {j.referenceSideId ? <span className="text-slate-400"> · від {j.referenceSideId}</span> : null}
                          <span className="text-slate-400"> · {j.offset} мм</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeJoint(j.id)}
                          className="text-slate-400 hover:text-red-500 px-1"
                          title="Видалити стик"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {section === 'joints' && (
              panels?.joints
                ? <div className="shrink-0 mb-2 rounded-sm border border-slate-200 bg-white overflow-hidden">{panels.joints}</div>
                : <SectionStub what="Стики (З'єднання деталей): вибір сторони, тип шва, розкладка стиків." />
            )}

            <SectionRow n={3} title="Вирізи" active={section === 'cutouts'} onClick={() => toggleSection('cutouts')}
              hint="Обробка площин — вирізи в тілі деталі" />
            {section === 'cutouts' && (
              (panels?.cutouts || panels?.corners || panels?.edges)
                ? <div className="shrink-0 mb-2 rounded-sm border border-slate-200 bg-white overflow-hidden">
                    {panels?.cutouts}{panels?.corners}{panels?.edges}
                  </div>
                : <SectionStub what="Обробка площин (Вирізи): прямокутні й довільні вирізи, радіуси кутів вирізу." />
            )}

            <SectionRow n={4} title="Мийки і проточки" active={section === 'sinks'} onClick={() => toggleSection('sinks')}
              hint="Встановлення мийки, фрезерування проточок для води" />
            {section === 'sinks' && (
              panels?.millings
                ? <div className="shrink-0 mb-2 rounded-sm border border-slate-200 bg-white overflow-hidden">
                    {panels.millings}
                    <div className="px-3 py-2 text-[11px] text-slate-400 border-t border-slate-100">
                      Мийка поки керується у властивостях деталі — переносимо наступною хвилею.
                    </div>
                  </div>
                : <SectionStub what="Встановлення мийки в виріб + Фрезерування площини (Проточки для води)." />
            )}

            <SectionRow n={5} title="Розетки, кнопки, інше" active={section === 'sockets'} onClick={() => toggleSection('sockets')}
              hint="Отвори під розетки, вимикачі та інші врізки" />
            {section === 'sockets' && (
              <SectionStub what="Розетки й вимикачі з каменю, кнопки, інші врізки в площину." />
            )}

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
