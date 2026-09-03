import type { StateCreator } from 'zustand';
import type { ProjectState } from '../useProjectStore';
import type { CutAllowances, Detail, DetailPart, Project, Rotation, SlabInstance, UiLanguage, Placement } from '../../domain/types';
import { detectConflicts } from '../../engines/packing';
import { calcStatus, loadWithoutPacking } from '../projectHelpers';
import { persist, STORAGE_KEY } from '../persistence';
import { triggerPackingAsync, SLAB_DELETED_UNPLACED_REASON } from './packingSlice';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { createEmptyProject } from '../../domain/defaults';
import { partNameForLabel } from '../projectHelpers';
import { edgeAllowanceMm } from '../../domain/allowances';

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
  updateProject: (patch: Partial<Project>) => void;
  updateProjectHeader: (
    patch: Partial<Pick<Project,
      | 'orderNumber'
      | 'customer'
      | 'customerId'
      | 'customerCode'
      | 'customerEdrpou'
      | 'customerContactName'
      | 'customerContactPhone'
      | 'customerContactEmail'
      | 'textureSelectionEnabled'
      | 'allowMirroring'>>,
  ) => void;
  updateAllowances: (patch: Partial<CutAllowances>) => void;
  addSlab: (slab: SlabInstance) => void;
  updateSlab: (slabId: string, patch: Partial<SlabInstance>) => void;
  deleteSlab: (slabId: string) => void;
  addManualDimension: (dimension: import('../../domain/types').ManualDimension) => void;
  deleteManualDimension: (dimensionId: string) => void;
  clearManualDimensionsForSlab: (slabId: string) => void;
  addDetail: (detail: Detail) => void;
  addDetails: (details: Detail[]) => void;
  updateProductDetails: (productId: string, newDetails: Detail[]) => void;
  updateDetailRecord: (detailId: string, detail: Detail) => void;
  deleteDetail: (detailId: string) => void;
  addProduct: (product: import('../../domain/types').Product) => void;
  updateProduct: (productId: string, product: import('../../domain/types').Product) => void;
  removeProduct: (productId: string) => void;
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
  newProject: () => void;
  exportProject: () => string;
  updatePlacement3dTransform: (placementId: string, transform: { x: number; y: number; z: number; rx: number; ry: number; rz: number; } | undefined) => void;
  /** Крок 5.1: місце виробу на сцені. Живе на виробі — переживає перерахунки розкрою. */
  updateProductScenePlacement: (productId: string, placement: { x: number; z: number; rotationYDeg: number } | undefined) => void;
  /** Крок 5.1: повернути всі вироби в дефолтний ряд. */
  clearProductScenePlacements: () => void;
  reset3dAssembly: () => void;
  setCurrentDbProjectId: (id: string | null) => void;
  updatePlacement: (placementId: string, updates: Partial<Placement>) => void;
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

  updateProject: (patch) => {
    set((state) => {
      Object.assign(state.project, patch);
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
      // Матеріал і товщина проєкту приїжджають із ПЕРШОГО слебу
      // (рішення 25.08.2026). Раніше їх виставляли окремими полями в
      // панелі — виходило два джерела однієї правди, і вони розходились:
      // слеб із каталогу вже несе і матеріал, і товщину, і декор.
      //
      // Це саме ЗАМОВЧУВАННЯ на проєкт, а не «у проєкті одна товщина».
      // На розкрої можуть лежати слеби різної товщини, і це нормально:
      // у прорахунку кожна деталь бере СВОЮ товщину (detail.thickness),
      // а проєктна підставляється лише тим, у кого своєї немає.
      //
      // Перезаписуємо тільки на першому слебі. Інакше додавання другого
      // слебу іншої товщини мовчки міняло б замовчування під усіма
      // деталями, які його не задавали, — і прорахунок би поїхав.
      //
      // Від projectMaterial залежать профілі торця, спосіб радіусу і
      // поріг короткої сторони — тому головне, щоб він був заповнений.
      if (state.project.slabs.length === 1) {
        if (slab.material) state.project.projectMaterial = slab.material;
        if (slab.thickness) state.project.projectThickness = slab.thickness;
      }
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
      /*
       * ДЕТАЛІ НЕ ЗНИКАЮТЬ РАЗОМ ІЗ СЛЕБОМ (27.08).
       *
       * Раніше тут просто викидались розміщення видаленого слеба — і
       * деталі провалювались у нікуди: на слебі їх уже немає, а в буфері
       * нерозміщених вони не з'являлись, бо той читає `unplacedPartIds`.
       * Замовлення тихо худло, і це виявлялось аж на прорахунку — рівно
       * той тип мовчазної втрати, який ми ловимо в першу чергу.
       *
       * Тепер осиротілі деталі переходять у буфер із чесною причиною.
       * Автоматично на інші слеби НЕ розкладаємо: видалення слеба — дія
       * людини, і рішення, куди тепер лягають деталі, теж її. Захоче
       * автоматично — натисне «Економний».
       */
      const orphanedPartIds = state.project.placements
        .filter(p => p.slabId === slabId)
        .map(p => p.partId);

      state.project.slabs = state.project.slabs.filter(s => s.id !== slabId);
      state.project.placements = state.project.placements.filter(p => p.slabId !== slabId);
      state.project.textureLayouts = state.project.textureLayouts.filter(t => t.slabId !== slabId);

      if (orphanedPartIds.length) {
        const alreadyInBuffer = new Set(state.project.unplacedPartIds ?? []);
        state.project.unplacedPartIds = [
          ...(state.project.unplacedPartIds ?? []),
          ...orphanedPartIds.filter(id => !alreadyInBuffer.has(id)),
        ];
        const reasons = { ...(state.project.unplacedReasons ?? {}) };
        for (const partId of orphanedPartIds) reasons[partId] = SLAB_DELETED_UNPLACED_REASON;
        state.project.unplacedReasons = reasons;
      }
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
      finalizeProjectState(state, false);
    });
    persist(get().project, get().currentDbProjectId);
  },

  addManualDimension: (dimension) => {
    set((state) => {
      if (!state.project.manualDimensions) {
        state.project.manualDimensions = [];
      }
      state.project.manualDimensions.push(dimension);
      finalizeProjectState(state, false);
    });
    persist(get().project, get().currentDbProjectId);
  },

  deleteManualDimension: (dimensionId) => {
    set((state) => {
      if (state.project.manualDimensions) {
        state.project.manualDimensions = state.project.manualDimensions.filter(d => d.id !== dimensionId);
      }
      finalizeProjectState(state, false);
    });
    persist(get().project, get().currentDbProjectId);
  },

  addProduct: (product) => {
    set((state) => {
      if (!state.project.products) state.project.products = [];
      state.project.products.push(product);
      finalizeProjectState(state, false);
    });
    const currentProject = get().project;
    triggerPackingAsync(currentProject, get().packingMode, get().parts, set, get);
  },

  updateProduct: (productId, product) => {
    set((state) => {
      if (!state.project.products) state.project.products = [];
      const idx = state.project.products.findIndex(p => p.id === productId);
      if (idx >= 0) {
        state.project.products[idx] = product;
        finalizeProjectState(state, false);
      }
    });
    const currentProject = get().project;
    triggerPackingAsync(currentProject, get().packingMode, get().parts, set, get);
  },

  removeProduct: (productId) => {
    set((state) => {
      if (!state.project.products) return;
      state.project.products = state.project.products.filter(p => p.id !== productId);
      finalizeProjectState(state, false);
    });
    const currentProject = get().project;
    triggerPackingAsync(currentProject, get().packingMode, get().parts, set, get);
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

  updateProductDetails: (productId, newDetails) => {
    const current = get().project;
    // Remove old product and all its children
    const filteredDetails = current.details.filter((item) => item.id !== productId && item.parentDetailId !== productId && !item.id.startsWith(productId + '__'));
    // Add new details
    triggerPackingAsync({ ...current, details: [...filteredDetails, ...newDetails] } as Project, get().packingMode, get().parts, set, get);
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
    // Delete the detail and all its children
    const nextDetails = current.details.filter((item) => item.id !== detailId && item.parentDetailId !== detailId && !item.id.startsWith(detailId + '__'));
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
        // Крок 5.2: тут працювала людина — правка виробу цю позицію не чіпає.
        placement.manualPlaced = true;
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
          p.manualPlaced = true;
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
        placement.manualLocked = !placement.manualLocked;
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
        if (ids.has(p.id)) p.manualLocked = locked;
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
        rotation: 0 as Rotation,
        manualLocked: false,
        // Крок 5.2: деталь дістали з буфера і поклали руками.
        manualPlaced: true,
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
        placement.manualPlaced = true;
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
    // Нормалізація commercialQuote прибрана 03.09.2026 разом із КП.
    const safeProject = project;
    const next = loadWithoutPacking(safeProject);
    set((state) => {
      state.project = next.project;
      state.parts = next.parts;
      state.selectedSlabId = next.project.slabs[0]?.id;
      // МЕЖА ІСТОРІЇ: відкриття/імпорт іншого проєкту обнуляє Ctrl+Z.
      // Інакше undo перелазив би через межу проєктів і persist записав би
      // вміст СТАРОГО проєкту під currentDbProjectId НОВОГО — тихе
      // затирання збереженого проєкту на сервері.
      state.history = [];
      state.future = [];
    });
    persist(get().project, get().currentDbProjectId);
  },

  /**
   * ЧИСТИЙ ПРОЄКТ.
   *
   * Не `importProject(createEmptyProject())`: той лишає `currentDbProjectId`,
   * і перший же `persist` записав би порожній проєкт ПОВЕРХ збереженого в
   * кабінеті — тихе затирання чужої роботи. Тому прив'язку до кабінету
   * рвемо явно: новий проєкт ще ніде не збережений.
   */
  newProject: () => {
    const next = loadWithoutPacking(createEmptyProject());
    set((state) => {
      state.project = next.project;
      state.parts = next.parts;
      state.selectedSlabId = next.project.slabs[0]?.id;
      state.currentDbProjectId = null;
      state.history = [];
      state.future = [];
    });
  },

  exportProject: () => JSON.stringify(get().project, null, 2),

  updatePlacement3dTransform: (placementId, transform) => {
    set((state) => {
      const placement = state.project.placements.find(p => p.id === placementId);
      if (placement) {
        placement.transform3d = transform;
      }
      // do not refresh conflicts or bump IDs for 3d view rotation
      state.project.updatedAt = new Date().toISOString();
    });
    persist(get().project, get().currentDbProjectId);
  },

  updateProductScenePlacement: (productId, placement) => {
    set((state) => {
      const productRecord = (state.project.products ?? []).find((item) => item.id === productId);
      if (!productRecord) return;
      productRecord.scenePlacement = placement;
      // Легасі-координати на розкладці тепер лише плутають: при першому ж
      // свідомому переміщенні виробу знімаємо їх, щоб не було двох правд.
      const rootId = productRecord.elements[0]?.id;
      if (rootId) {
        const mainPart = state.parts.find((part) => part.detailId === rootId && part.isMain);
        const mainPlacement = mainPart
          ? state.project.placements.find((item) => item.partId === mainPart.id)
          : undefined;
        if (mainPlacement) mainPlacement.transform3d = undefined;
      }
      // Розкрій і кошторис від місця на сцені не залежать — нічого не
      // перераховуємо, лише зберігаємо.
      state.project.updatedAt = new Date().toISOString();
    });
    persist(get().project, get().currentDbProjectId);
  },

  clearProductScenePlacements: () => {
    set((state) => {
      (state.project.products ?? []).forEach((item) => { item.scenePlacement = undefined; });
      state.project.updatedAt = new Date().toISOString();
    });
    persist(get().project, get().currentDbProjectId);
  },

  updatePlacement: (placementId, updates) => {
    set((state) => {
      const placement = state.project.placements.find(p => p.id === placementId);
      if (placement) {
        Object.assign(placement, updates);
        
        // Recalculate computedAllowances based on new edgeProfiles
        if (updates.edgeProfiles !== undefined) {
          const newAllowances: { top?: number; bottom?: number; left?: number; right?: number } = {};
          
          Object.entries(placement.edgeProfiles || {}).forEach(([side, rawProfile]) => {
            const treatment = (typeof rawProfile === 'string') 
              ? { isFullLength: true, top: { profileId: rawProfile } } 
              : rawProfile as any;
              
            if (!treatment) return;
            
            const pId = treatment.top?.profileId || treatment.bottom?.profileId;
            if (pId) {
              const edgeProfileDef = state.project.referenceData?.edgeProfiles?.find(p => p.id === pId);
              // Припуск рахує domain/allowances.ts — те саме джерело, з якого
              // бере кошторис. Раніше ця логіка була скопійована сюди руками.
              const allowance = edgeAllowanceMm({
                material: state.project.projectMaterial,
                profileAllowanceMm: edgeProfileDef?.allowance,
                treatment,
              });
              
              if (allowance > 0) {
                if (side === 'A') newAllowances.top = allowance;
                if (side === 'B') newAllowances.right = allowance;
                if (side === 'C') newAllowances.bottom = allowance;
                if (side === 'D') newAllowances.left = allowance;
              }
            }
          });
          
          placement.computedAllowances = newAllowances;
        }
      }
      state.project.updatedAt = new Date().toISOString();
    });
    persist(get().project, get().currentDbProjectId);
  },

  reset3dAssembly: () => {
    set((state) => {
      state.project.placements.forEach(p => {
        p.transform3d = undefined;
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
