import { create } from 'zustand';
import type { ViewMode } from '../domain/types';
import type { FactRef } from '../engines/productionFacts';
import type { ProductEditorSession } from '../components/forms/utils/draftHelpers';
import { publishHighlight, subscribeHighlight } from './highlightSync';


/**
 * Вкладка робочої області. Один список замість чотирьох копій union'а —
 * інакше кожна нова вкладка означає правку в п'ятьох файлах, і десь її
 * забудуть (саме так «Прорахунок» ледь не лишився без режиму «Спліт»).
 *
 *  · estimate — послуги для виробництва (внутрішній BOM)
 *  · quote    — прорахунок для клієнта
 *  · room     — приміщення (база): редактор кімнати, 01.09
 */
export type PaneView = '2d' | '3d' | 'texture' | 'estimate' | 'quote' | 'room';
export type MainView = PaneView | 'split';

interface UIState {
  mainView: MainView;
  splitRatio: number;
  setSplitRatio: (ratio: number) => void;
  splitLeftView: PaneView;
  setSplitLeftView: (view: PaneView) => void;
  splitRightView: PaneView;
  setSplitRightView: (view: PaneView) => void;
  viewMode: ViewMode;
  setMainView: (view: MainView) => void;
  setViewMode: (mode: ViewMode) => void;
  is3dAssemblyMode: boolean;
  set3dAssemblyMode: (enabled: boolean) => void;
  /** Режим «Підсвітка» у 3D Підборі: показує фото слябу, зняте з підсвіткою (просвітний камінь). */
  isBacklightMode: boolean;
  setBacklightMode: (enabled: boolean) => void;
  /**
   * ПРОСУНУТИЙ РЕЖИМ (26.08, задача власника). Панелі інструментів
   * показують значки замість підписів: той, хто знає програму напам'ять,
   * читає рядок кнопок як приладову панель, а не як список слів.
   *
   * Це НЕ окремий набір функцій: жодна кнопка не з'являється і не
   * зникає, міняється лише подача. Кожен значок несе підказку з повною
   * назвою — навів, почекав, прочитав.
   *
   * Живе в localStorage, а не в проєкті: це звичка людини, а не
   * властивість замовлення. Новачок відкриває програму зі словами.
   */
  isExpertMode: boolean;
  setExpertMode: (enabled: boolean) => void;
  /**
   * ЗАВАНТАЖЕННЯ ПРОЄКТУ — що зараз відбувається (27.08).
   *
   * Відкриття проєкту з кабінету чи з диска не давало жодного знаку: на
   * великому проєкті вкладка просто застигала на кілька секунд, і людина
   * тиснула ще раз, думаючи, що не спрацювало. Тут — назва кроку, який
   * виконується просто зараз, і скільки кроків лишилось.
   */
  projectLoading: { title: string; step: string; index: number; total: number } | null;
  setProjectLoading: (state: UIState['projectLoading']) => void;
  is3dGroupingEnabled: boolean;
  set3dGroupingEnabled: (enabled: boolean) => void;
  transformMode: 'translate' | 'rotate';
  setTransformMode: (mode: 'translate' | 'rotate') => void;
  selectedId3d: string | null;
  /**
   * Крок 5.1: виділений ВИРІБ на сцені Підбору. Окремо від selectedId3d
   * (там id розміщення деталі): виріб мусить виділятись навіть коли його
   * головна деталь не розмістилась на слябі — інакше при конфлікті
   * розкрою виріб неможливо ні посунути, ні повернути.
   */
  selectedProductId3d: string | null;
  setSelectedProductId3d: (id: string | null) => void;
  setSelectedId3d: (id: string | null) => void;
  showEdges: boolean;
  setShowEdges: (show: boolean) => void;
  isAddProductMode: boolean;
  setAddProductMode: (enabled: boolean) => void;
  /**
   * Що підсвітити на карті крою: посилання з рядка кошторису.
   * Живе в глобальному сторі, бо в режимі «Спліт» кошторис і розкрій —
   * два незалежні інстанси WorkspacePane, і локальний стан їх не зв'яже.
   * Між ОКРЕМИМИ вікнами розходиться через BroadcastChannel — див.
   * highlightSync.ts; там же пояснено, чому це окремий канал.
   */
  highlightedFactRefs: FactRef[] | null;
  highlightedServiceId: string | null;
  setHighlightedService: (serviceId: string | null, refs: FactRef[] | null) => void;
  /**
   * Режим супер-адміна: розблоковує приховані адмінські меню (шестерні
   * налаштувань прайсів). Свідомо НЕ зберігається: перезавантаження
   * сторінки знову замикає меню — розблокування живе, поки відкрите вікно.
   */
  isAdminUnlocked: boolean;
  setAdminUnlocked: (unlocked: boolean) => void;
  /**
   * Останній застосований шаблон виробу: id і введені числа. Тримаємо тут,
   * щоб із редактора можна було повернутись у конфігуратор і перебудувати
   * виріб іншими розмірами, не набираючи все заново. Не персиститься —
   * це стан сеансу, а не проєкту.
   */
  lastTemplate: {
    templateId: string;
    values: Record<string, number | string | boolean>;
    /** Слоти, які шаблон створив минулого разу — щоб перебудова їх прибрала */
    slots: string[];
  } | null;
  setLastTemplate: (state: {
    templateId: string;
    values: Record<string, number | string | boolean>;
    slots: string[];
  } | null) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isEdgeProfileSettingsOpen: boolean;
  setIsEdgeProfileSettingsOpen: (open: boolean) => void;
  productEditorSession: ProductEditorSession | null;
  setProductEditorSession: (session: ProductEditorSession | null) => void;
  /** Ctrl+Z всередині редактора виробу: знімки сесії (лише реальні дії) */
  sessionHistory: ProductEditorSession[];
  sessionFuture: ProductEditorSession[];
  undoSession: () => void;
  redoSession: () => void;
  editingDetailId: string | null;
  setEditingDetailId: (id: string | null) => void;
  isQuoteOpen: boolean;
  setIsQuoteOpen: (open: boolean) => void;
  isHelpOpen: boolean;
  /**
   * Розділ, на якому відкрити довідку. Кнопка «i» біля інструмента має
   * вести саме до свого розділу, а не змушувати шукати його в списку.
   */
  helpSection: string | null;
  openHelp: (section?: string) => void;
  setIsHelpOpen: (open: boolean) => void;
  isServiceOpen: boolean;
  setIsServiceOpen: (open: boolean) => void;
  isBugReporterOpen: boolean;
  setIsBugReporterOpen: (open: boolean) => void;
  isRecordingBug: boolean;
  setIsRecordingBug: (recording: boolean) => void;
  rrwebEvents: any[];
  setRrwebEvents: (events: any[]) => void;
  isFloatingPreviewOpen: boolean;
  setFloatingPreviewOpen: (open: boolean) => void;
  floatingPreviewMode: '2d' | '3d';
  setFloatingPreviewMode: (mode: '2d' | '3d') => void;
  confirmState: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  };
  showConfirm: (options: Omit<UIState['confirmState'], 'isOpen'>) => void;
  hideConfirm: () => void;
}

/** Мітка часу останньої зміни сесії — для злиття серій швидких правок в один крок */
let sessionBurstAt = 0;

/** Ключ звички користувача: просунутий режим переживає перезавантаження */
const EXPERT_MODE_KEY = 'vs3d.expertMode';

/**
 * Читаємо збережений режим один раз, при створенні стану. У приватному
 * вікні або зі згорнутим сховищем доступ кидає виняток — тоді просто
 * стартуємо зі словами, це робочий стан за замовчуванням.
 */
function readExpertMode(): boolean {
  try {
    return window.localStorage.getItem(EXPERT_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export const useUIStore = create<UIState>((set) => ({
  mainView: '2d',
  splitRatio: 50,
  setSplitRatio: (splitRatio) => set({ splitRatio }),
  splitLeftView: '2d',
  setSplitLeftView: (splitLeftView) => set({ splitLeftView }),
  splitRightView: '3d',
  setSplitRightView: (splitRightView) => set({ splitRightView }),
  viewMode: 'technical',
  setMainView: (mainView) => set({ mainView }),
  setViewMode: (viewMode) => set({ viewMode }),
  is3dAssemblyMode: false,
  set3dAssemblyMode: (is3dAssemblyMode) => set({ is3dAssemblyMode }),
  isBacklightMode: false,
  setBacklightMode: (isBacklightMode) => set({ isBacklightMode }),
  projectLoading: null,
  setProjectLoading: (projectLoading) => set({ projectLoading }),
  isExpertMode: readExpertMode(),
  setExpertMode: (isExpertMode) => {
    // Пишемо в localStorage у тому ж кроці, що й у стан: інакше режим
    // губиться при перезавантаженні, і перемикач виглядає зламаним.
    try { window.localStorage.setItem(EXPERT_MODE_KEY, isExpertMode ? '1' : '0'); } catch { /* приватний режим браузера */ }
    set({ isExpertMode });
  },
  is3dGroupingEnabled: true,
  set3dGroupingEnabled: (is3dGroupingEnabled) => set({ is3dGroupingEnabled }),
  transformMode: 'translate',
  setTransformMode: (transformMode) => set({ transformMode }),
  selectedId3d: null,
  setSelectedId3d: (selectedId3d) => set({ selectedId3d }),
  selectedProductId3d: null,
  setSelectedProductId3d: (selectedProductId3d) => set({ selectedProductId3d }),
  showEdges: true,
  setShowEdges: (showEdges) => set({ showEdges }),
  isAddProductMode: false,
  setAddProductMode: (enabled) => set({ isAddProductMode: enabled }),
  productEditorSession: null,
  /**
   * Кожна зміна сесії редактора йде через цей сеттер — тому історія Ctrl+Z
   * для редактора живе прямо тут, без обходу всіх місць редагування.
   *
   * Що є кроком, а що ні (рішення власника 07.08):
   *  · крок — лише РЕАЛЬНА дія: змінився mainDetail або subDetails
   *    (розмір, стик, виріз, додане доповнення…);
   *  · зміна активної деталі (клік по дереву чи по 3D) — НЕ крок:
   *    порівнюємо посилання, selection-only оновлення проходить повз стек;
   *  · швидкі послідовні зміни (набір числа клавішами) зливаються в один
   *    крок: поки між змінами менше 800 мс, знімок не додається — відкат
   *    повертає стан до початку серії, а не по одній цифрі.
   *  · вхід у редактор і вихід із нього скидають стек: історія живе рівно
   *    одну сесію редагування, чужу сесію відкочувати не можна.
   */
  setProductEditorSession: (session) => set((state) => {
    const prev = state.productEditorSession;
    if (prev === null || session === null) {
      sessionBurstAt = 0;
      return { productEditorSession: session, sessionHistory: [], sessionFuture: [] };
    }
    const geometryChanged = prev.mainDetail !== session.mainDetail || prev.subDetails !== session.subDetails;
    if (!geometryChanged) return { productEditorSession: session };

    const now = Date.now();
    const isBurst = now - sessionBurstAt < 800;
    sessionBurstAt = now;
    if (isBurst) return { productEditorSession: session };

    const sessionHistory = [...state.sessionHistory, prev];
    if (sessionHistory.length > 50) sessionHistory.shift();
    return { productEditorSession: session, sessionHistory, sessionFuture: [] };
  }),
  sessionHistory: [],
  sessionFuture: [],
  undoSession: () => set((state) => {
    const prev = state.sessionHistory[state.sessionHistory.length - 1];
    if (!prev || state.productEditorSession === null) return {};
    sessionBurstAt = 0;
    return {
      productEditorSession: prev,
      sessionHistory: state.sessionHistory.slice(0, -1),
      sessionFuture: [...state.sessionFuture, state.productEditorSession],
    };
  }),
  redoSession: () => set((state) => {
    const next = state.sessionFuture[state.sessionFuture.length - 1];
    if (!next || state.productEditorSession === null) return {};
    sessionBurstAt = 0;
    return {
      productEditorSession: next,
      sessionFuture: state.sessionFuture.slice(0, -1),
      sessionHistory: [...state.sessionHistory, state.productEditorSession],
    };
  }),
  editingDetailId: null,
  setEditingDetailId: (id) => set({ editingDetailId: id }),
  isFloatingPreviewOpen: false,
  setFloatingPreviewOpen: (isFloatingPreviewOpen) => set({ isFloatingPreviewOpen }),
  floatingPreviewMode: '2d',
  setFloatingPreviewMode: (floatingPreviewMode) => set({ floatingPreviewMode }),
  isQuoteOpen: false,
  setIsQuoteOpen: (isQuoteOpen) => set({ isQuoteOpen }),
  isHelpOpen: false,
  helpSection: null,
  openHelp: (section) => set({ isHelpOpen: true, helpSection: section ?? null }),
  setIsHelpOpen: (open) => set({ isHelpOpen: open }),
  isServiceOpen: false,
  setIsServiceOpen: (open) => set({ isServiceOpen: open }),
  isBugReporterOpen: false,
  setIsBugReporterOpen: (open) => set({ isBugReporterOpen: open }),
  isRecordingBug: false,
  setIsRecordingBug: (isRecordingBug) => set({ isRecordingBug }),
  rrwebEvents: [],
  setRrwebEvents: (rrwebEvents) => set({ rrwebEvents }),
  confirmState: {
    isOpen: false,
    title: '',
    message: ''
  },
  showConfirm: (options) => set({ confirmState: { ...options, isOpen: true } }),
  hideConfirm: () => set((state) => ({ confirmState: { ...state.confirmState, isOpen: false } })),
  highlightedFactRefs: null,
  highlightedServiceId: null,
  setHighlightedService: (highlightedServiceId, highlightedFactRefs) => {
    set({ highlightedServiceId, highlightedFactRefs });
    publishHighlight({ serviceId: highlightedServiceId, refs: highlightedFactRefs });
  },
  isAdminUnlocked: false,
  setAdminUnlocked: (isAdminUnlocked) => set({ isAdminUnlocked }),
  lastTemplate: null,
  setLastTemplate: (lastTemplate) => set({ lastTemplate }),
  isSettingsOpen: false,
  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  isEdgeProfileSettingsOpen: false,
  setIsEdgeProfileSettingsOpen: (isEdgeProfileSettingsOpen) => set({ isEdgeProfileSettingsOpen })
}));

// Підсвітка з іншого вікна лягає НАПРЯМУ через setState, а не через
// setHighlightedService: інакше кожне вікно ретранслювало б отримане
// назад у канал, і два вікна зациклилися б.
export const stopHighlightSync = subscribeHighlight(({ serviceId, refs }) => {
  useUIStore.setState({ highlightedServiceId: serviceId, highlightedFactRefs: refs });
});
