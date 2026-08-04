import type { StateCreator } from 'zustand';
import type { ProjectState } from '../useProjectStore';

export interface EditorUISlice {
  selectedSlabId?: string;
  selectedDetailId?: string;
  selectedPlacementIds: string[];
  editingDetailId?: string;
  bufferDragPartId?: string;
  placementDragPartId?: string;
  unplacedDropVisible: boolean;
  
  setSelectedSlabId: (id?: string) => void;
  setSelectedDetailId: (id?: string) => void;
  setSelectedPlacementIds: (action: string[] | ((ids: string[]) => string[])) => void;
  startEditDetail: (detailId: string) => void;
  clearEditDetail: () => void;
  startBufferDrag: (partId: string) => void;
  clearBufferDrag: () => void;
  startPlacementDrag: (partId: string) => void;
  clearPlacementDrag: () => void;
  showUnplacedDropZone: () => void;
  hideUnplacedDropZone: () => void;
}

export const createEditorUISlice: StateCreator<
  ProjectState,
  [['zustand/immer', never]],
  [],
  EditorUISlice
> = (set) => ({
  selectedSlabId: undefined,
  selectedDetailId: undefined,
  selectedPlacementIds: [],
  editingDetailId: undefined,
  bufferDragPartId: undefined,
  placementDragPartId: undefined,
  unplacedDropVisible: false,

  setSelectedSlabId: (selectedSlabId) => set((state) => { state.selectedSlabId = selectedSlabId; }),
  setSelectedDetailId: (selectedDetailId) => set((state) => { state.selectedDetailId = selectedDetailId; }),
  setSelectedPlacementIds: (action) => set((state) => { 
    state.selectedPlacementIds = typeof action === 'function' ? action(state.selectedPlacementIds) : action; 
  }),
  startEditDetail: (editingDetailId) => set((state) => { state.editingDetailId = editingDetailId; }),
  clearEditDetail: () => set((state) => { state.editingDetailId = undefined; }),
  startBufferDrag: (bufferDragPartId) => set((state) => { state.bufferDragPartId = bufferDragPartId; }),
  clearBufferDrag: () => set((state) => { state.bufferDragPartId = undefined; }),
  startPlacementDrag: (placementDragPartId) => set((state) => {
    state.placementDragPartId = placementDragPartId;
    state.unplacedDropVisible = false;
  }),
  clearPlacementDrag: () => set((state) => {
    state.placementDragPartId = undefined;
    state.unplacedDropVisible = false;
  }),
  showUnplacedDropZone: () => set((state) => { state.unplacedDropVisible = true; }),
  hideUnplacedDropZone: () => set((state) => { state.unplacedDropVisible = false; }),
});
