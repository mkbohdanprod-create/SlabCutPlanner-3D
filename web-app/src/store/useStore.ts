import { create } from 'zustand';
import type { Project, ViewMode, PackingMode, SlabInstance, Detail, Placement, DetailPart } from '../domain/types';


interface UIState {
  mainView: '2d' | '3d' | 'texture';
  viewMode: ViewMode;
  setMainView: (view: '2d' | '3d' | 'texture') => void;
  setViewMode: (mode: ViewMode) => void;
  is3dAssemblyMode: boolean;
  set3dAssemblyMode: (enabled: boolean) => void;
  is3dGroupingEnabled: boolean;
  set3dGroupingEnabled: (enabled: boolean) => void;
  transformMode: 'translate' | 'rotate';
  setTransformMode: (mode: 'translate' | 'rotate') => void;
  selectedId3d: string | null;
  setSelectedId3d: (id: string | null) => void;
  showEdges: boolean;
  setShowEdges: (show: boolean) => void;
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
  viewMode: 'technical',
  setMainView: (mainView) => set({ mainView }),
  setViewMode: (viewMode) => set({ viewMode }),
  is3dAssemblyMode: false,
  set3dAssemblyMode: (is3dAssemblyMode) => set({ is3dAssemblyMode }),
  is3dGroupingEnabled: true,
  set3dGroupingEnabled: (is3dGroupingEnabled) => set({ is3dGroupingEnabled }),
  transformMode: 'translate',
  setTransformMode: (transformMode) => set({ transformMode }),
  selectedId3d: null,
  setSelectedId3d: (selectedId3d) => set({ selectedId3d }),
  showEdges: true,
  setShowEdges: (showEdges) => set({ showEdges }),
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
  hideConfirm: () => set((state) => ({ confirmState: { ...state.confirmState, isOpen: false } }))
}));
