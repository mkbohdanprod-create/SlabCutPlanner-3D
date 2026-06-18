import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createEmptyProject, uid } from '../domain/defaults';
import type { CutAllowances, DefectZone, Detail, DetailPart, ManualDimension, PackingMode, Placement, Project, Rotation, SlabInstance, TextureFrame, TextureLayout, UiLanguage, ViewMode } from '../domain/types';
import { explodeDetails } from '../engines/geometry';
import { buildTextureLayout, detectConflicts } from '../engines/packing';
import PackingWorker from '../workers/packing.worker?worker';
import { stripBase64 } from '../engines/workerMapper';
import type { PackingWorkerRequest, PackingWorkerResponse } from '../workers/packing.worker';
import { t } from '../i18n';
import { rotatedSize } from '../lib/project';
import { supabase } from '../lib/supabase';

import { type EditorUISlice, createEditorUISlice } from './slices/editorUISlice';
import { type TextureSlice, createTextureSlice } from './slices/textureSlice';
import { type HistorySlice, createHistorySlice } from './slices/historySlice';
import { persist } from './persistence';

const STORAGE_KEY = 'slab_cut_planner_current_project';

interface ProjectState extends EditorUISlice, TextureSlice, HistorySlice {
  project: Project;
  packingMode: PackingMode;
  parts: DetailPart[];
  isPacking: boolean;
  packingRequestId: number;
  initialize: () => void;
  setPackingMode: (mode: PackingMode) => void;
  setUiLanguage: (language: UiLanguage) => void;
  updateProjectHeader: (patch: Partial<Pick<Project, 'orderNumber' | 'customer' | 'textureSelectionEnabled'>>) => void;
  updateAllowances: (patch: Partial<CutAllowances>) => void;
  addSlab: (slab: SlabInstance) => void;
  updateSlab: (slabId: string, patch: Partial<SlabInstance>) => void;
  deleteSlab: (slabId: string) => void;
  addDetail: (detail: Detail) => void;
  addDetails: (details: Detail[]) => void;
  updateDetailRecord: (detailId: string, detail: Detail) => void;
  deleteDetail: (detailId: string) => void;
  clearCalculation: () => void;
  runPacking: (mode?: PackingMode) => void;
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
  currentDbProjectId: string | null;
  setCurrentDbProjectId: (id: string | null) => void;
  isInitialized: boolean;
}



function calcStatus(project: Project, placements: Placement[]) {
  const hasConflict = placements.some((p) => p.conflict);
  const hasOut = placements.some((p) => p.outOfBounds);
  if (hasConflict) return 'manual_conflict';
  if (hasOut) return 'out_of_bounds';
  if (project.unplacedPartIds.length > 0) return 'partial';
  if (placements.length > 0) return 'success';
  return 'failed';
}

import { DEFAULT_ALLOWANCES } from '../domain/defaults';

function normalizeProject(project: Project): Project {
  return { ...project, uiLanguage: project.uiLanguage ?? 'uk', textureFrames: project.textureFrames ?? [], manualDimensions: project.manualDimensions ?? [], allowances: { ...DEFAULT_ALLOWANCES, ...(project.allowances ?? {}) } };
}

function partIdentity(part: DetailPart) {
  const kind = part.isMain ? 'main' : part.edgeKind ?? 'part';
  const side = part.edgeSide ?? 'body';
  const group = part.textureGroupLabel ?? part.parentLabel;
  const offsetX = Math.round(part.textureOffsetX ?? 0);
  const offsetY = Math.round(part.textureOffsetY ?? 0);
  return [part.detailId, kind, side, group, offsetX, offsetY].join('|');
}

function remapStoredPartReferences(project: Project, previousParts: DetailPart[], nextParts: DetailPart[]): Project {
  if (!previousParts.length) return project;
  const nextIds = new Set(nextParts.map((part) => part.id));
  const previousById = new Map(previousParts.map((part) => [part.id, part]));
  const nextIdByIdentity = new Map(nextParts.map((part) => [partIdentity(part), part.id]));
  const remapPartId = (partId: string) => {
    if (nextIds.has(partId)) return partId;
    const previousPart = previousById.get(partId);
    return previousPart ? nextIdByIdentity.get(partIdentity(previousPart)) ?? partId : partId;
  };
  const unplacedReasons = Object.fromEntries(
    Object.entries(project.unplacedReasons ?? {}).map(([partId, reason]) => [remapPartId(partId), reason]),
  );
  return {
    ...project,
    placements: project.placements.map((placement) => ({ ...placement, partId: remapPartId(placement.partId) })),
    textureLayouts: project.textureLayouts.map((layout) => ({ ...layout, partId: remapPartId(layout.partId) })),
    unplacedPartIds: project.unplacedPartIds.map(remapPartId),
    unplacedReasons,
  } as Project;
}

let worker: Worker | null = null;
let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
function getWorker() {
  if (!worker) worker = new PackingWorker();
  return worker;
}

function triggerPackingAsync(
  project: Project,
  mode: PackingMode,
  previousParts: DetailPart[],
  set: (state: Partial<ProjectState>) => void,
  get: () => ProjectState
) {
  // 1. Synchronously prepare data (explode, remap) so UI updates list immediately
  const normalized = normalizeProject(project);
  const parts = explodeDetails(normalized.details, normalized.allowances);
  const remappedProject = remapStoredPartReferences(normalized, previousParts, parts);
  
  set({ 
    project: { ...remappedProject, updatedAt: new Date().toISOString() } as Project, 
    parts, 
    packingMode: mode,
    isPacking: true,
    movementHistory: [],
    movementFuture: []
  });

  // 2. Debounce async packing
  if (debounceTimeout) clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    const state = get();
    const requestId = state.packingRequestId + 1;
    set({ packingRequestId: requestId });
    
    const w = getWorker();
    w.onmessage = (e: MessageEvent<PackingWorkerResponse | { requestId: number; error: string }>) => {
      const data = e.data;
      if (data.requestId !== get().packingRequestId) return; // Stale response
      
      if ('error' in data) {
        console.error('Packing Worker Error:', data.error);
        set({ isPacking: false });
        return;
      }
      
      const packed = data.result;
      const latestState = get(); // get latest state just in case
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
      set({ project: finalProject, isPacking: false });
    };
    
    w.onerror = (err) => {
      console.error('Worker threw an error:', err);
      set({ isPacking: false });
    };

    w.postMessage({
      requestId,
      project: stripBase64(state.project),
      parts: state.parts,
      mode
    } as PackingWorkerRequest);
    
  }, 200);
}

function directUpdate(set: (state: Partial<ProjectState>) => void, get: () => ProjectState, project: Project) {
  persist(project, get().currentDbProjectId);
  set({ project, parts: get().parts, selectedSlabId: get().selectedSlabId ?? project.slabs[0]?.id, packingRequestId: get().packingRequestId + 1 });
}

function updateWithoutPacking(set: (state: Partial<ProjectState>) => void, get: () => ProjectState, project: Project, refreshConflicts = true) {
  const normalized = normalizeProject(project);
  const placements = refreshConflicts ? detectConflicts(normalized, get().parts, normalized.placements) : normalized.placements;
  const nextProject = { ...normalized, placements, updatedAt: new Date().toISOString() } as Project;
  nextProject.calculationStatus = calcStatus(nextProject, placements);
  persist(nextProject, get().currentDbProjectId);
  set({ project: nextProject, parts: get().parts, selectedSlabId: get().selectedSlabId ?? nextProject.slabs[0]?.id, packingRequestId: get().packingRequestId + 1 });
}

function loadWithoutPacking(project: Project) {
  const normalized = normalizeProject(project);
  const parts = explodeDetails(normalized.details, normalized.allowances);
  const placements = detectConflicts(normalized, parts, normalized.placements);
  const nextProject = { ...normalized, placements } as Project;
  nextProject.calculationStatus = calcStatus(nextProject, placements);
  return { project: nextProject, parts };
}


function genitiveLabel(label: string) {
  const words = label.trim().split(/\s+/);
  if (!words.length) return label;
  const typedForms: Array<[RegExp, string]> = [
    [/^Стільниця\b/i, 'стільниці'],
    [/^Стінова панель\b/i, 'стінової панелі'],
    [/^Мийка\b/i, 'мийки'],
    [/^Фасад\b/i, 'фасаду'],
    [/^Опора\b/i, 'опори'],
  ];
  const typed = typedForms.find(([pattern]) => pattern.test(label));
  if (typed) return label.replace(typed[0], typed[1]);

  return words.map((word, index) => {
    const lower = word[0].toLocaleLowerCase('uk-UA') + word.slice(1);
    if (index === 0 && lower.endsWith('ий')) return `${lower.slice(0, -2)}ого`;
    if (index === 0 && lower.endsWith('ій')) return `${lower.slice(0, -2)}ього`;
    if (index === words.length - 1 && /[бвгґджзклмнпрстфхцчшщ]$/i.test(lower)) return `${lower}у`;
    return lower;
  }).join(' ');
}

function partNameForLabel(part: DetailPart, label: string) {
  if (part.isMain || !part.edgeKind || !part.edgeSide) return label;
  const prefix = part.edgeKind === 'fold' ? 'Підворот' : 'Потовщення';
  return `${prefix} ${genitiveLabel(label)} сторона ${part.edgeSide}`;
}

export const useProjectStore = create<ProjectState>()(immer((set, get, store) => ({
  ...createEditorUISlice(set, get, store),
  ...createTextureSlice(set, get, store),
  ...createHistorySlice(set, get, store),
  project: createEmptyProject(),
  packingMode: 'economy',
  parts: [],
  isPacking: false,
  packingRequestId: 0,
  movementHistory: [],
  movementFuture: [],
  currentDbProjectId: null,
  isInitialized: false,
  setCurrentDbProjectId: (id) => set({ currentDbProjectId: id }),
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
    set({ ...next, selectedSlabId: next.project.slabs[0]?.id, isInitialized: true });
  },
  setPackingMode: (packingMode) => set({ packingMode }),
  setUiLanguage: (uiLanguage) => {
    updateWithoutPacking(set, get, { ...get().project, uiLanguage } as Project, false);
  },
  updateProjectHeader: (patch) => {
    updateWithoutPacking(set, get, { ...get().project, ...patch } as Project, false);
  },
  updateAllowances: (patch) => {
    updateWithoutPacking(set, get, {
      ...get().project,
      allowances: { ...get().project.allowances, ...patch },
    } as Project, false);
  },
  addSlab: (slab) => {
    const project = { ...get().project, slabs: [...get().project.slabs, slab] } as Project;
    updateWithoutPacking(set, get, project, true);
    set({ selectedSlabId: slab.id });
  },
  updateSlab: (slabId, patch) => {
    updateWithoutPacking(set, get, { ...get().project, slabs: get().project.slabs.map((s) => s.id === slabId ? { ...s, ...patch } : s) } as Project);
  },
  deleteSlab: (slabId) => {
    const current = get().project;
    const base = {
      ...current,
      slabs: current.slabs.filter((slab) => slab.id !== slabId),
      placements: current.placements.filter((placement) => placement.slabId !== slabId),
      textureLayouts: current.textureLayouts.filter((layout) => layout.slabId !== slabId),
      manualDimensions: (current.manualDimensions ?? []).filter((dimension) => dimension.slabId !== slabId),
    } as Project;
    updateWithoutPacking(set, get, base);
    const nextProject = get().project;
    const selectedSlabId = nextProject.slabs.some((slab) => slab.id === get().selectedSlabId)
      ? get().selectedSlabId
      : nextProject.slabs[0]?.id;
    set({ selectedSlabId });
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
    const current = get().project;
    triggerPackingAsync({
      ...current,
      details: current.details.map((item) => item.id === detailId ? { ...detail, id: detailId } : item),
    } as Project, get().packingMode, get().parts, set, get);
    set({ editingDetailId: undefined });
  },

  deleteDetail: (detailId) => {
    const current = get().project;
    const detailIds = new Set([detailId]);
    let foundLinkedDetail = true;
    while (foundLinkedDetail) {
      foundLinkedDetail = false;
      current.details.forEach((detail) => {
        if (detail.parentDetailId && detailIds.has(detail.parentDetailId) && !detailIds.has(detail.id)) {
          detailIds.add(detail.id);
          foundLinkedDetail = true;
        }
      });
    }
    const partIds = new Set(get().parts.filter((part) => detailIds.has(part.detailId)).map((part) => part.id));
    const base = {
      ...current,
      details: current.details.filter((detail) => !detailIds.has(detail.id)),
      placements: current.placements.filter((placement) => !partIds.has(placement.partId)),
      textureLayouts: current.textureLayouts.filter((layout) => !partIds.has(layout.partId)),
      unplacedPartIds: current.unplacedPartIds.filter((partId) => !partIds.has(partId)),
      unplacedReasons: Object.fromEntries(Object.entries(current.unplacedReasons ?? {}).filter(([partId]) => !partIds.has(partId))),
    } as Project;
    updateWithoutPacking(set, get, base, false);
  },
  clearCalculation: () => {
    const current = get().project;
    const nextProject = {
      ...current,
      slabs: [],
      details: [],
      placements: [],
      textureLayouts: [],
      textureFrames: [],
      manualDimensions: [],
      unplacedPartIds: [],
      unplacedReasons: {},
      calculationStatus: 'failed',
      exportSnapshot: undefined,
      updatedAt: new Date().toISOString(),
    } as Project;
    persist(nextProject, get().currentDbProjectId);
    set({ project: nextProject, parts: [], selectedSlabId: undefined, editingDetailId: undefined, bufferDragPartId: undefined, placementDragPartId: undefined, unplacedDropVisible: false, movementHistory: [], movementFuture: [] });
  },
  runPacking: (mode) => {
    const packingMode = mode ?? get().packingMode;
    triggerPackingAsync(get().project, packingMode, get().parts, set, get);
  },
  movePlacement: (placementId, x, y, slabId, rotation) => {
    const project = {
      ...get().project,
      placements: get().project.placements.map((p) => {
        if (p.id !== placementId) return p;
        const nextSlabId = slabId ?? p.slabId;
        return {
          ...p,
          slabId: nextSlabId,
          x,
          y,
          rotation: rotation ?? p.rotation,
          pinnedSlabId: p.pinnedToSlab ? nextSlabId : p.pinnedSlabId,
        };
      }),
    } as Project;
    const placements = detectConflicts(project, get().parts, project.placements);
    const nextProject = { ...project, placements, updatedAt: new Date().toISOString() } as Project;
    nextProject.calculationStatus = calcStatus(nextProject, placements);
    nextProject.textureLayouts = nextProject.textureLayouts.map((t) => {
      const p = placements.find((pl) => pl.partId === t.partId);
      return p ? { ...t, slabId: p.slabId, sourceX: p.x, sourceY: p.y, sourceRotation: p.rotation } : t;
    });
    directUpdate(set, get, nextProject);
  },
  movePlacements: (moves) => {
    const moveById = new Map(moves.map((move) => [move.placementId, move]));
    const project = {
      ...get().project,
      placements: get().project.placements.map((placement) => {
        const move = moveById.get(placement.id);
        if (!move) return placement;
        const nextSlabId = move.slabId ?? placement.slabId;
        return {
          ...placement,
          slabId: nextSlabId,
          x: move.x,
          y: move.y,
          rotation: move.rotation ?? placement.rotation,
          pinnedSlabId: placement.pinnedToSlab ? nextSlabId : placement.pinnedSlabId,
        };
      }),
    } as Project;
    const placements = detectConflicts(project, get().parts, project.placements);
    const nextProject = { ...project, placements, updatedAt: new Date().toISOString() } as Project;
    nextProject.calculationStatus = calcStatus(nextProject, placements);
    nextProject.textureLayouts = nextProject.textureLayouts.map((layout) => {
      const placement = placements.find((item) => item.partId === layout.partId);
      return placement ? { ...layout, slabId: placement.slabId, sourceX: placement.x, sourceY: placement.y, sourceRotation: placement.rotation } : layout;
    });
    directUpdate(set, get, nextProject);
  },
  togglePlacementPin: (placementId) => {
    const current = get().project;
    const placement = current.placements.find((item) => item.id === placementId);
    if (!placement) return;
    if (!placement.pinnedToSlab && (placement.conflict || placement.outOfBounds)) {
      window.alert(t(current.uiLanguage, 'pinConflictWarning'));
      return;
    }
    const project = {
      ...current,
      placements: current.placements.map((item) => {
        if (item.id !== placementId) return item;
        return item.pinnedToSlab
          ? { ...item, pinnedToSlab: false, pinnedSlabId: null, pinMode: undefined }
          : { ...item, pinnedToSlab: true, pinnedSlabId: item.slabId, pinMode: 'single' as const };
      }),
    } as Project;
    updateWithoutPacking(set, get, project);
  },
  togglePlacementLock: (placementId) => {
    const current = get().project;
    const project = {
      ...current,
      placements: current.placements.map((item) => (
        item.id === placementId ? { ...item, manualLocked: !item.manualLocked } : item
      )),
    } as Project;
    updateWithoutPacking(set, get, project);
  },
  setPlacementLocks: (placementIds, locked) => {
    if (!placementIds.length) return;
    const ids = new Set(placementIds);
    const current = get().project;
    const project = {
      ...current,
      placements: current.placements.map((item) => (
        ids.has(item.id) ? { ...item, manualLocked: locked } : item
      )),
    } as Project;
    updateWithoutPacking(set, get, project);
  },
  placeUnplacedPart: (partId, slabId, x, y) => {
    const part = get().parts.find((item) => item.id === partId);
    const slab = get().project.slabs.find((item) => item.id === slabId);
    if (!part || !slab) {
      set({ bufferDragPartId: undefined, unplacedDropVisible: false });
      return;
    }

    const current = get().project;
    const existing = current.placements.find((placement) => placement.partId === partId);
    const placement: Placement = existing
      ? { ...existing, slabId, x, y, pinnedSlabId: existing.pinnedToSlab ? slabId : existing.pinnedSlabId }
      : { id: uid('placement'), slabId, partId, x, y, rotation: part.rotation, manualLocked: false };
    const project = {
      ...current,
      placements: existing
        ? current.placements.map((item) => item.id === existing.id ? placement : item)
        : [...current.placements, placement],
      textureLayouts: current.textureLayouts.some((layout) => layout.partId === partId)
        ? current.textureLayouts.map((layout) => layout.partId === partId
          ? { ...layout, slabId, sourceX: x, sourceY: y, sourceRotation: placement.rotation }
          : layout)
        : [
          ...current.textureLayouts,
          { id: uid('texture'), slabId, partId, x, y, rotation: 0, sourceX: x, sourceY: y, sourceRotation: placement.rotation },
        ],
      unplacedPartIds: current.unplacedPartIds.filter((id) => id !== partId),
      unplacedReasons: Object.fromEntries(Object.entries(current.unplacedReasons ?? {}).filter(([id]) => id !== partId)),
      updatedAt: new Date().toISOString(),
    } as Project;
    const placements = detectConflicts(project, get().parts, project.placements);
    const nextProject = { ...project, placements } as Project;
    nextProject.calculationStatus = calcStatus(nextProject, placements);
    persist(nextProject, get().currentDbProjectId);
    set({ project: nextProject, parts: get().parts, selectedSlabId: slabId, bufferDragPartId: undefined, unplacedDropVisible: false });
  },
  unplacePart: (partId) => {
    const current = get().project;
    const project = {
      ...current,
      placements: current.placements.filter((placement) => placement.partId !== partId),
      textureLayouts: current.textureLayouts.filter((layout) => layout.partId !== partId),
      unplacedPartIds: current.unplacedPartIds.includes(partId)
        ? current.unplacedPartIds
        : [...current.unplacedPartIds, partId],
      unplacedReasons: { ...(current.unplacedReasons ?? {}), [partId]: 'переміщено користувачем' },
      updatedAt: new Date().toISOString(),
    } as Project;
    const placements = detectConflicts(project, get().parts, project.placements);
    const nextProject = { ...project, placements } as Project;
    nextProject.calculationStatus = calcStatus(nextProject, placements);
    persist(nextProject, get().currentDbProjectId);
    set({ project: nextProject, parts: get().parts, placementDragPartId: undefined, unplacedDropVisible: false });
  },
  unplaceParts: (partIds) => {
    const ids = [...new Set(partIds)];
    if (!ids.length) return;
    const current = get().project;
    const idSet = new Set(ids);
    const project = {
      ...current,
      placements: current.placements.filter((placement) => !idSet.has(placement.partId)),
      textureLayouts: current.textureLayouts.filter((layout) => !idSet.has(layout.partId)),
      unplacedPartIds: [...current.unplacedPartIds, ...ids.filter((id) => !current.unplacedPartIds.includes(id))],
      unplacedReasons: {
        ...(current.unplacedReasons ?? {}),
        ...Object.fromEntries(ids.map((id) => [id, 'переміщено користувачем'])),
      },
      updatedAt: new Date().toISOString(),
    } as Project;
    const placements = detectConflicts(project, get().parts, project.placements);
    const nextProject = { ...project, placements } as Project;
    nextProject.calculationStatus = calcStatus(nextProject, placements);
    persist(nextProject, get().currentDbProjectId);
    set({ project: nextProject, parts: get().parts, placementDragPartId: undefined, unplacedDropVisible: false });
  },
  renamePartFamily: (partId, label) => {
    const nextLabel = label.trim();
    if (!nextLabel) return;
    const sourcePart = get().parts.find((part) => part.id === partId);
    if (!sourcePart) return;
    const current = get().project;
    const project = {
      ...current,
      details: current.details.map((detail) => detail.id === sourcePart.detailId ? { ...detail, label: nextLabel } : detail),
      updatedAt: new Date().toISOString(),
    } as Project;
    const parts = get().parts.map((part) => {
      if (part.detailId !== sourcePart.detailId || part.parentLabel !== sourcePart.parentLabel) return part;
      return {
        ...part,
        parentLabel: nextLabel,
        name: partNameForLabel(part, nextLabel),
      };
    });
    persist(project, get().currentDbProjectId);
    set({ project, parts });
  },
  rotatePlacement: (placementId) => {
    const project = { ...get().project, placements: get().project.placements.map((p) => p.id === placementId ? { ...p, rotation: (((p.rotation + 90) % 360) as Rotation) } : p) } as Project;
    const placements = detectConflicts(project, get().parts, project.placements);
    const nextProject = { ...project, placements, updatedAt: new Date().toISOString() } as Project;
    nextProject.calculationStatus = calcStatus(nextProject, placements);
    nextProject.textureLayouts = nextProject.textureLayouts.map((t) => {
      const p = placements.find((pl) => pl.partId === t.partId);
      return p ? { ...t, slabId: p.slabId, sourceX: p.x, sourceY: p.y, sourceRotation: p.rotation } : t;
    });
    directUpdate(set, get, nextProject);
  },

  addManualDimension: (dimension) => {
    const nextProject = {
      ...get().project,
      manualDimensions: [...(get().project.manualDimensions ?? []), dimension],
      updatedAt: new Date().toISOString(),
    } as Project;
    updateWithoutPacking(set, get, nextProject, false);
  },
  deleteManualDimension: (dimensionId) => {
    const nextProject = {
      ...get().project,
      manualDimensions: (get().project.manualDimensions ?? []).filter((dimension) => dimension.id !== dimensionId),
      updatedAt: new Date().toISOString(),
    } as Project;
    updateWithoutPacking(set, get, nextProject, false);
  },
  clearManualDimensionsForSlab: (slabId) => {
    const nextProject = {
      ...get().project,
      manualDimensions: (get().project.manualDimensions ?? []).filter((dimension) => dimension.slabId !== slabId),
      updatedAt: new Date().toISOString(),
    } as Project;
    updateWithoutPacking(set, get, nextProject, false);
  },


  importProject: (project) => {
    const next = loadWithoutPacking(project);
    persist(next.project, get().currentDbProjectId); set({ ...next, selectedSlabId: next.project.slabs[0]?.id, movementHistory: [], movementFuture: [] });
  },
  exportProject: () => JSON.stringify(get().project, null, 2),
  updatePlacement3dTransform: (placementId, transform) => {
    const project = {
      ...get().project,
      placements: get().project.placements.map((p) =>
        p.id === placementId ? { ...p, transform3d: transform } : p
      ),
    } as Project;
    updateWithoutPacking(set, get, project, false);
  },
  reset3dAssembly: () => {
    const project = {
      ...get().project,
      placements: get().project.placements.map((p) => ({ ...p, transform3d: undefined })),
    } as Project;
    updateWithoutPacking(set, get, project, false);
  },
})));
