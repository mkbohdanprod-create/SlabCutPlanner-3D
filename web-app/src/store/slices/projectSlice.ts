import type { StateCreator } from 'zustand';
import type { ProjectState } from '../useProjectStore';
import type { CutAllowances, Detail, DetailPart, Project, Rotation, SlabInstance, UiLanguage } from '../../domain/types';
import { detectConflicts } from '../../engines/packing';
import { calcStatus, loadWithoutPacking } from '../projectHelpers';
import { persist, STORAGE_KEY } from '../persistence';
import { triggerPackingAsync } from './packingSlice';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { createEmptyProject, defaultCommercialQuoteSettings } from '../../domain/defaults';
import { partNameForLabel } from '../projectHelpers';

function finalizeProjectState(state: ProjectState, refreshConflicts = true) {
  state.project.updatedAt = new Date().toISOString();
  if (refreshConflicts) {
    state.project.placements = detectConflicts(state.project, state.parts, state.project.placements);
  }
  state.project.calculationStatus = calcStatus(state.project, state.project.placements);
  state.packingRequestId += 1;
}

export interface ProjectSlice {
  project: Project;
  parts: DetailPart[];
  currentDbProjectId: string | null;
  isInitialized: boolean;
  initialize: () => void;
  setUiLanguage: (language: UiLanguage) => void;
  updateProjectHeader: (patch: Partial<Pick<Project, 'orderNumber' | 'customer' | 'textureSelectionEnabled'>>) => void;
  updateAllowances: (patch: Partial<CutAllowances>) => void;
  addSlab: (slab: SlabInstance) => void;
  updateSlab: (slabId: string, patch: Partial<SlabInstance>) => void;
  deleteSlab: (slabId: string) => void;
  clearManualDimensionsForSlab: (slabId: string) => void;
  addDetail: (detail: Detail) => void;
  addDetails: (details: Detail[]) => void;
  updateDetailRecord: (detailId: string, detail: Detail) => void;
  deleteDetail: (detailId: string) => void;
  movePlacement: (placementId: string, x: number, y: number, slabId?: string, rotation?: Rotation) => void;
  movePlacements: (moves: Array<{ placementId: string; x: number; y: number; slabId?: string; rotation?: Rotation }>) => void;
  togglePlacementPin: (placementId: string) => void;
  togglePlacementLock: (placementId: string) => void;
  setPlacementLocks: (placementIds: string[], locked: boolean) => void;
  placeUnplacedPart: (partId: string, slabId: string, x: number, y: number) => void;
  unplacePart: (partId: string) => void;
  unplaceParts: (partIds: string[]) => void;
  renamePartFamily: (partId: string, label: string) => void;
  rotatePlacement: (placementId: string) => void;
  importProject: (project: Project) => void;
  exportProject: () => string;
  updatePlacement3dTransform: (placementId: string, transform: { x: number; y: number; z: number; rx: number; ry: number; rz: number; } | undefined) => void;
  reset3dAssembly: () => void;
  setCurrentDbProjectId: (id: string | null) => void;
}

export const createProjectSlice: StateCreator<
  ProjectState,
  [['zustand/immer', never]],
  [],
  ProjectSlice
> = (set, get) => ({
  project: createEmptyProject(),
  parts: [],
  currentDbProjectId: null,
  isInitialized: false,

  initialize: async () => {
    let projectObj;
    try {
      projectObj = await idbGet(STORAGE_KEY);
    } catch (err) {
      console.warn("Failed to read from IDB", err);
    }
    
    // Fallback & Migration з localStorage
    if (!projectObj) {
      const local = localStorage.getItem(STORAGE_KEY);
      if (local) {
        try {
          projectObj = JSON.parse(local);
        } catch (e) {
          console.error("Failed to parse localStorage project", e);
        }
        try {
          if (projectObj) {
            await idbSet(STORAGE_KEY, { ...projectObj, schemaVersion: 1 });
            localStorage.removeItem(STORAGE_KEY);
          }
        } catch (e) {
          console.warn("Could not migrate from localStorage to IDB", e);
        }
      }
    }
    
    const next = loadWithoutPacking(projectObj || createEmptyProject());
    set((state) => {
      state.project = next.project;
      state.parts = next.parts;
      state.selectedSlabId = next.project.slabs[0]?.id;
      state.isInitialized = true;
    });
  },

  setUiLanguage: (language) => {
    set((state) => {
      state.project.uiLanguage = language;
      finalizeProjectState(state, false);
    });
    persist(get().project, get().currentDbProjectId);
  },

  updateProjectHeader: (patch) => {
    set((state) => {
      Object.assign(state.project, patch);
      finalizeProjectState(state, false);
    });
    persist(get().project, get().currentDbProjectId);
  },

  updateAllowances: (patch) => {
    const currentProject = get().project;
    const nextAllowances = { ...(currentProject.allowances || {}), ...patch };
    triggerPackingAsync({ ...currentProject, allowances: nextAllowances } as Project, get().packingMode, get().parts, set, get);
  },

  addSlab: (slab) => {
    set((state) => {
      state.project.slabs.push(slab);
      finalizeProjectState(state);
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },

  updateSlab: (slabId, patch) => {
    set((state) => {
      const slab = state.project.slabs.find(s => s.id === slabId);
      if (slab) {
        Object.assign(slab, patch);
      }
      finalizeProjectState(state);
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },

  deleteSlab: (slabId) => {
    set((state) => {
      state.project.slabs = state.project.slabs.filter(s => s.id !== slabId);
      state.project.placements = state.project.placements.filter(p => p.slabId !== slabId);
      state.project.textureLayouts = state.project.textureLayouts.filter(t => t.slabId !== slabId);
      if (state.project.manualDimensions) {
        state.project.manualDimensions = state.project.manualDimensions.filter(d => d.slabId !== slabId);
      }
      finalizeProjectState(state);

      if (!state.project.slabs.some(s => s.id === state.selectedSlabId)) {
        state.selectedSlabId = state.project.slabs[0]?.id;
      }
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },

  clearManualDimensionsForSlab: (slabId) => {
    set((state) => {
      if (state.project.manualDimensions) {
        state.project.manualDimensions = state.project.manualDimensions.filter(d => d.slabId !== slabId);
      }
      state.project.updatedAt = new Date().toISOString();
    });
    persist(get().project, get().currentDbProjectId);
  },

  addDetail: (detail) => {
    const currentProject = get().project;
    triggerPackingAsync({ ...currentProject, details: [...currentProject.details, detail] } as Project, get().packingMode, get().parts, set, get);
  },

  addDetails: (details) => {
    if (!details.length) return;
    const currentProject = get().project;
    triggerPackingAsync({ ...currentProject, details: [...currentProject.details, ...details] } as Project, get().packingMode, get().parts, set, get);
  },

  updateDetailRecord: (detailId, detail) => {
    const currentProject = get().project;
    triggerPackingAsync({
      ...currentProject,
      details: currentProject.details.map((item) => item.id === detailId ? { ...detail, id: detailId } : item),
    } as Project, get().packingMode, get().parts, set, get);
    set((state) => { state.editingDetailId = undefined; });
  },

  deleteDetail: (detailId) => {
    const current = get().project;
    const detailIds = new Set([detailId]);
    let foundLinkedDetail = true;
    while (foundLinkedDetail) {
      foundLinkedDetail = false;
      for (const d of current.details) {
        if (!detailIds.has(d.id) && d.dimensions?.some((dim) => dim.linkedDetailId && detailIds.has(dim.linkedDetailId))) {
          detailIds.add(d.id);
          foundLinkedDetail = true;
        }
      }
    }
    const nextDetails = current.details.filter((item) => !detailIds.has(item.id));
    triggerPackingAsync({ ...current, details: nextDetails } as Project, get().packingMode, get().parts, set, get);
  },

  movePlacement: (placementId, x, y, slabId, rotation) => {
    set((state) => {
      const placement = state.project.placements.find(p => p.id === placementId);
      if (placement) {
        const nextSlabId = slabId ?? placement.slabId;
        placement.slabId = nextSlabId;
        placement.x = x;
        placement.y = y;
        if (rotation !== undefined) placement.rotation = rotation;
        if (placement.pinnedToSlab) placement.pinnedSlabId = nextSlabId;
      }
      finalizeProjectState(state);
      
      // Update texture layouts accordingly
      state.project.textureLayouts.forEach(t => {
        const p = state.project.placements.find(pl => pl.partId === t.partId);
        if (p) {
          t.slabId = p.slabId;
          t.sourceX = p.x;
          t.sourceY = p.y;
          t.sourceRotation = p.rotation;
        }
      });
    });
    persist(get().project, get().currentDbProjectId);
  },

  movePlacements: (moves) => {
    set((state) => {
      const moveById = new Map(moves.map((move) => [move.placementId, move]));
      state.project.placements.forEach(p => {
        const move = moveById.get(p.id);
        if (move) {
          const nextSlabId = move.slabId ?? p.slabId;
          p.slabId = nextSlabId;
          p.x = move.x;
          p.y = move.y;
          if (move.rotation !== undefined) p.rotation = move.rotation;
          if (p.pinnedToSlab) p.pinnedSlabId = nextSlabId;
        }
      });
      finalizeProjectState(state);

      state.project.textureLayouts.forEach(t => {
        const p = state.project.placements.find(pl => pl.partId === t.partId);
        if (p) {
          t.slabId = p.slabId;
          t.sourceX = p.x;
          t.sourceY = p.y;
          t.sourceRotation = p.rotation;
        }
      });
    });
    persist(get().project, get().currentDbProjectId);
  },

  togglePlacementPin: (placementId) => {
    set((state) => {
      const placement = state.project.placements.find(p => p.id === placementId);
      if (placement) {
        placement.pinnedToSlab = !placement.pinnedToSlab;
        placement.pinnedSlabId = placement.pinnedToSlab ? placement.slabId : undefined;
      }
      finalizeProjectState(state);
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },

  togglePlacementLock: (placementId) => {
    set((state) => {
      const placement = state.project.placements.find(p => p.id === placementId);
      if (placement) {
        placement.locked = !placement.locked;
      }
      finalizeProjectState(state);
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },

  setPlacementLocks: (placementIds, locked) => {
    set((state) => {
      const ids = new Set(placementIds);
      state.project.placements.forEach(p => {
        if (ids.has(p.id)) p.locked = locked;
      });
      finalizeProjectState(state);
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },

  placeUnplacedPart: (partId, slabId, x, y) => {
    set((state) => {
      state.project.unplacedPartIds = state.project.unplacedPartIds.filter(id => id !== partId);
      if (state.project.unplacedReasons && state.project.unplacedReasons[partId]) {
        delete state.project.unplacedReasons[partId];
      }
      state.project.placements.push({
        id: crypto.randomUUID(),
        partId,
        slabId,
        x,
        y,
        rotation: 0,
      });
      state.bufferDragPartId = undefined;
      state.unplacedDropVisible = false;
      state.selectedSlabId = slabId;
      finalizeProjectState(state);
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },

  unplacePart: (partId) => {
    set((state) => {
      state.project.placements = state.project.placements.filter(p => p.partId !== partId);
      state.project.textureLayouts = state.project.textureLayouts.filter(t => t.partId !== partId);
      if (!state.project.unplacedPartIds.includes(partId)) {
        state.project.unplacedPartIds.push(partId);
      }
      if (!state.project.unplacedReasons) state.project.unplacedReasons = {};
      state.project.unplacedReasons[partId] = 'переміщено користувачем';
      state.placementDragPartId = undefined;
      state.unplacedDropVisible = false;
      finalizeProjectState(state);
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },

  unplaceParts: (partIds) => {
    set((state) => {
      const ids = new Set(partIds);
      if (ids.size === 0) return;
      state.project.placements = state.project.placements.filter(p => !ids.has(p.partId));
      state.project.textureLayouts = state.project.textureLayouts.filter(t => !ids.has(t.partId));
      partIds.forEach(id => {
        if (!state.project.unplacedPartIds.includes(id)) {
          state.project.unplacedPartIds.push(id);
        }
        if (!state.project.unplacedReasons) state.project.unplacedReasons = {};
        state.project.unplacedReasons[id] = 'переміщено користувачем';
      });
      state.placementDragPartId = undefined;
      state.unplacedDropVisible = false;
      finalizeProjectState(state);
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },

  renamePartFamily: (partId, label) => {
    set((state) => {
      const nextLabel = label.trim();
      if (!nextLabel) return;
      const sourcePart = state.parts.find(p => p.id === partId);
      if (!sourcePart) return;
      
      const detail = state.project.details.find(d => d.id === sourcePart.detailId);
      if (detail) {
        detail.label = nextLabel;
      }
      
      state.parts.forEach(part => {
        if (part.detailId === sourcePart.detailId && part.parentLabel === sourcePart.parentLabel) {
          part.parentLabel = nextLabel;
          part.name = partNameForLabel(part, nextLabel);
        }
      });
      state.project.updatedAt = new Date().toISOString();
    });
    persist(get().project, get().currentDbProjectId);
  },

  rotatePlacement: (placementId) => {
    set((state) => {
      const placement = state.project.placements.find(p => p.id === placementId);
      if (placement) {
        placement.rotation = ((placement.rotation + 90) % 360) as Rotation;
      }
      finalizeProjectState(state);
      
      state.project.textureLayouts.forEach(t => {
        const p = state.project.placements.find(pl => pl.partId === t.partId);
        if (p) {
          t.slabId = p.slabId;
          t.sourceX = p.x;
          t.sourceY = p.y;
          t.sourceRotation = p.rotation;
        }
      });
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },

  importProject: (project) => {
    const safeProject = {
      ...project,
      commercialQuote: {
        ...defaultCommercialQuoteSettings,
        ...(project.commercialQuote ?? {}),
        edgePrices: {
          ...defaultCommercialQuoteSettings.edgePrices,
          ...(project.commercialQuote?.edgePrices ?? {}),
        },
        manualLines: project.commercialQuote?.manualLines ?? [],
        lineOverrides: project.commercialQuote?.lineOverrides ?? {},
      },
    };
    const next = loadWithoutPacking(safeProject);
    set((state) => {
      state.project = next.project;
      state.parts = next.parts;
      state.selectedSlabId = next.project.slabs[0]?.id;
      state.movementHistory = [];
      state.movementFuture = [];
    });
    persist(get().project, get().currentDbProjectId);
  },

  exportProject: () => JSON.stringify(get().project, null, 2),

  updatePlacement3dTransform: (placementId, transform) => {
    set((state) => {
      const placement = state.project.placements.find(p => p.id === placementId);
      if (placement) {
        placement.assemblyTransform = transform;
      }
      // do not refresh conflicts or bump IDs for 3d view rotation
      state.project.updatedAt = new Date().toISOString();
    });
    persist(get().project, get().currentDbProjectId);
  },

  reset3dAssembly: () => {
    set((state) => {
      state.project.placements.forEach(p => {
        p.assemblyTransform = undefined;
      });
      state.project.updatedAt = new Date().toISOString();
    });
    persist(get().project, get().currentDbProjectId);
  },

  setCurrentDbProjectId: (id) => {
    set((state) => {
      state.currentDbProjectId = id;
    });
  },
});
