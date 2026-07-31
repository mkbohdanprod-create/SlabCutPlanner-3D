import { create } from 'zustand';
import type { ViewMode } from '../domain/types';
import type { ProductEditorSession } from '../components/forms/utils/draftHelpers';


interface UIState {
  mainView: '2d' | '3d' | 'texture' | 'split' | 'estimate';
  splitRatio: number;
  setSplitRatio: (ratio: number) => void;
  splitLeftView: '2d' | '3d' | 'texture' | 'estimate';
  setSplitLeftView: (view: '2d' | '3d' | 'texture' | 'estimate') => void;
  splitRightView: '2d' | '3d' | 'texture' | 'estimate';
  setSplitRightView: (view: '2d' | '3d' | 'texture' | 'estimate') => void;
  viewMode: ViewMode;
  setMainView: (view: '2d' | '3d' | 'texture' | 'split' | 'estimate') => void;
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
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isEdgeProfileSettingsOpen: boolean;
  setIsEdgeProfileSettingsOpen: (open: boolean) => void;
  productEditorSession: ProductEditorSession | null;
  setProductEditorSession: (session: ProductEditorSession | null) => void;
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
  setProductEditorSession: (session) => set({ productEditorSession: session }),
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
  isSettingsOpen: false,
  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  isEdgeProfileSettingsOpen: false,
  setIsEdgeProfileSettingsOpen: (isEdgeProfileSettingsOpen) => set({ isEdgeProfileSettingsOpen })
}));
