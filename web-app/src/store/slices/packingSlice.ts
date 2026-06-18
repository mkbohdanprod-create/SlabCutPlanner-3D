import type { StateCreator } from 'zustand';
import type { ProjectState } from '../useProjectStore';
import type { DetailPart, PackingMode, Project } from '../../domain/types';
import { explodeDetails } from '../../engines/geometry';
import { buildTextureLayout, detectConflicts } from '../../engines/packing';
import PackingWorker from '../../workers/packing.worker?worker';
import { stripBase64 } from '../../engines/workerMapper';
import type { PackingWorkerRequest, PackingWorkerResponse } from '../../workers/packing.worker';
import { persist } from '../persistence';
import { calcStatus, normalizeProject, remapStoredPartReferences } from '../projectHelpers';

let worker: Worker | null = null;
let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

function getWorker() {
  if (!worker) worker = new PackingWorker();
  return worker;
}

export interface PackingSlice {
  packingMode: PackingMode;
  isPacking: boolean;
  packingRequestId: number;
  setPackingMode: (mode: PackingMode) => void;
  runPacking: (mode?: PackingMode) => void;
  clearCalculation: () => void;
}

export function triggerPackingAsync(
  project: Project,
  mode: PackingMode,
  previousParts: DetailPart[],
  set: (state: Partial<ProjectState> | ((state: ProjectState) => void)) => void,
  get: () => ProjectState
) {
  const normalized = normalizeProject(project);
  const parts = explodeDetails(normalized.details, normalized.allowances);
  const remappedProject = remapStoredPartReferences(normalized, previousParts, parts);
  
  // Zustand setter requires care if we are using immer middleware but calling it from outside the slice.
  // We can just use the object form for this synchronous state update if we cast.
  set((state: ProjectState) => {
    state.project = { ...remappedProject, updatedAt: new Date().toISOString() } as Project;
    state.parts = parts;
    state.packingMode = mode;
    state.isPacking = true;
    state.movementHistory = [];
    state.movementFuture = [];
  });

  if (debounceTimeout) clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    const state = get();
    const requestId = state.packingRequestId + 1;
    set((s: ProjectState) => { s.packingRequestId = requestId; });
    
    const w = getWorker();
    w.onmessage = (e: MessageEvent<PackingWorkerResponse | { requestId: number; error: string }>) => {
      const data = e.data;
      if (data.requestId !== get().packingRequestId) return;
      
      if ('error' in data) {
        console.error('Packing Worker Error:', data.error);
        set((s: ProjectState) => { s.isPacking = false; });
        return;
      }
      
      const packed = data.result;
      const latestState = get();
      const placements = detectConflicts(latestState.project, latestState.parts, packed.placements);
      
      let textureLayouts = buildTextureLayout(placements, latestState.parts);
      if (latestState.project.textureLayouts.length) {
        const validPartIds = new Set(latestState.parts.map((part) => part.id));
        textureLayouts = textureLayouts.map((layout) => {
          const old = latestState.project.textureLayouts.find((item) => item.partId === layout.partId);
          return old
            ? { ...layout, id: old.id, x: old.x, y: old.y, rotation: old.rotation, sourceX: layout.sourceX, sourceY: layout.sourceY, sourceRotation: layout.sourceRotation }
            : layout;
        });
        const refreshedPartIds = new Set(textureLayouts.map((layout) => layout.partId));
        textureLayouts.push(...latestState.project.textureLayouts.filter((layout) => (
          validPartIds.has(layout.partId) && !refreshedPartIds.has(layout.partId)
        )));
      }
      
      const finalProject = {
        ...latestState.project,
        placements,
        textureLayouts,
        unplacedPartIds: packed.unplacedPartIds,
        unplacedReasons: packed.unplacedReasons,
        updatedAt: new Date().toISOString(),
      } as Project;
      finalProject.calculationStatus = calcStatus(finalProject, placements);
      
      persist(finalProject, get().currentDbProjectId);
      set((s: ProjectState) => {
        s.project = finalProject;
        s.isPacking = false;
      });
    };
    
    w.onerror = (err) => {
      console.error('Worker threw an error:', err);
      set((s: ProjectState) => { s.isPacking = false; });
    };

    w.postMessage({
      requestId,
      project: stripBase64(state.project),
      parts: state.parts,
      mode
    } as PackingWorkerRequest);
    
  }, 200);
}

export const createPackingSlice: StateCreator<
  ProjectState,
  [['zustand/immer', never]],
  [],
  PackingSlice
> = (set, get) => ({
  packingMode: 'economy',
  isPacking: false,
  packingRequestId: 0,

  setPackingMode: (mode) => set((state) => {
    state.packingMode = mode;
  }),

  runPacking: (mode) => {
    const packingMode = mode ?? get().packingMode;
    triggerPackingAsync(get().project, packingMode, get().parts, set, get);
  },

  clearCalculation: () => {
    set((state) => {
      state.project.slabs = [];
      state.project.details = [];
      state.project.placements = [];
      state.project.textureLayouts = [];
      state.project.textureFrames = [];
      state.project.manualDimensions = [];
      state.project.unplacedPartIds = [];
      state.project.unplacedReasons = {};
      state.project.calculationStatus = 'failed';
      state.project.exportSnapshot = undefined;
      state.project.updatedAt = new Date().toISOString();

      state.parts = [];
      state.selectedSlabId = undefined;
      state.editingDetailId = undefined;
      state.bufferDragPartId = undefined;
      state.placementDragPartId = undefined;
      state.unplacedDropVisible = false;
      state.movementHistory = [];
      state.movementFuture = [];
    });
    persist(get().project, get().currentDbProjectId);
  },
});
