/**
 * Стан сеансу АРХІТЕКТОРА (06.09.2026) — те, що НЕ належить проєкту:
 * який інструмент у руці на плані, яка поверхня/розкладка вибрана, чи
 * відкрите меню створення розкладки. Проєктні дані (план, поверхні,
 * розкладки) живуть у `project.architecture` через `useArchitecture`.
 */
import { create } from 'zustand';

export type PlanTool = 'select' | 'calibrate' | 'floor' | 'arc' | 'opening' | 'wall' | 'pan';

interface ArchUIState {
  tool: PlanTool;
  setTool: (tool: PlanTool) => void;
  selectedSurfaceId: string | null;
  selectSurface: (id: string | null) => void;
  selectedLayoutId: string | null;
  selectLayout: (id: string | null) => void;
  /** Повноекранне меню «Створити розкладку» (на основі меню виробу). */
  isAddLayoutMode: boolean;
  setAddLayoutMode: (open: boolean) => void;
  /** Поверхня, з якою відкрилось меню розкладки (щоб не питати двічі). */
  addLayoutSurfaceId: string | null;
  openAddLayout: (surfaceId?: string | null) => void;
  /** Висота стіни за замовчуванням для інструмента «Стіна з ребра», мм. */
  wallHeightMm: number;
  setWallHeightMm: (h: number) => void;
  /** Орто-режим обведення: сегменти лише по осях. */
  ortho: boolean;
  setOrtho: (v: boolean) => void;
}

export const useArchUIStore = create<ArchUIState>((set) => ({
  tool: 'select',
  setTool: (tool) => set({ tool }),
  selectedSurfaceId: null,
  selectSurface: (selectedSurfaceId) => set({ selectedSurfaceId }),
  selectedLayoutId: null,
  selectLayout: (selectedLayoutId) => set({ selectedLayoutId }),
  isAddLayoutMode: false,
  setAddLayoutMode: (isAddLayoutMode) => set({ isAddLayoutMode }),
  addLayoutSurfaceId: null,
  openAddLayout: (surfaceId = null) => set({ isAddLayoutMode: true, addLayoutSurfaceId: surfaceId }),
  wallHeightMm: 3000,
  setWallHeightMm: (wallHeightMm) => set({ wallHeightMm }),
  ortho: true,
  setOrtho: (ortho) => set({ ortho }),
}));
