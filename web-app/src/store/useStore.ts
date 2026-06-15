import { create } from 'zustand';
import type { Project, ViewMode, PackingMode, SlabInstance, Detail, Placement, DetailPart } from '../domain/types';


interface UIState {
  mainView: '2d' | '3d';
  viewMode: ViewMode;
  packingMode: PackingMode;
  setMainView: (view: '2d' | '3d') => void;
  setViewMode: (mode: ViewMode) => void;
  setPackingMode: (mode: PackingMode) => void;
  is3dAssemblyMode: boolean;
  set3dAssemblyMode: (enabled: boolean) => void;
  is3dGroupingEnabled: boolean;
  set3dGroupingEnabled: (enabled: boolean) => void;
  transformMode: 'translate' | 'rotate';
  setTransformMode: (mode: 'translate' | 'rotate') => void;
}

export const useUIStore = create<UIState>((set) => ({
  mainView: '2d',
  viewMode: 'technical',
  packingMode: 'optimal',
  setMainView: (mainView) => set({ mainView }),
  setViewMode: (viewMode) => set({ viewMode }),
  setPackingMode: (packingMode) => set({ packingMode }),
  is3dAssemblyMode: false,
  set3dAssemblyMode: (is3dAssemblyMode) => set({ is3dAssemblyMode }),
  is3dGroupingEnabled: true,
  set3dGroupingEnabled: (is3dGroupingEnabled) => set({ is3dGroupingEnabled }),
  transformMode: 'translate',
  setTransformMode: (transformMode) => set({ transformMode }),
}));
