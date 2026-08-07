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
 */
export type PaneView = '2d' | '3d' | 'texture' | 'estimate' | 'quote';
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
  is3dGroupingEnabled: boolean;
  set3dGroupingEnabled: (enabled: boolean) => void;
  transformMode: 'translate' | 'rotate';
  setTransformMode: (mode: 'translate' | 'rotate') => void;
  selectedId3d: string | null;
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
  is3dGroupingEnabled: true,
  set3dGroupingEnabled: (is3dGroupingEnabled) => set({ is3dGroupingEnabled }),
  transformMode: 'translate',
  setTransformMode: (transformMode) => set({ transformMode }),
  selectedId3d: null,
  setSelectedId3d: (selectedId3d) => set({ selectedId3d }),
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
