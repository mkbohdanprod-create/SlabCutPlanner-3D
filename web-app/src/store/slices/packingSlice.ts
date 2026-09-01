import type { StateCreator } from 'zustand';
import type { ProjectState } from '../useProjectStore';
import type { DetailPart, PackingMode, Project } from '../../domain/types';
import { explodeDetails } from '../../engines/geometry';
import { autoPack, buildTextureLayout, detectConflicts } from '../../engines/packing';
import PackingWorker from '../../workers/packing.worker?worker';
import { stripBase64 } from '../../engines/workerMapper';
import type { PackingWorkerRequest, PackingWorkerResponse } from '../../workers/packing.worker';
import { persist } from '../persistence';
import { calcStatus, normalizeProject, remapStoredPartReferences, getAllProjectDetails } from '../projectHelpers';

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
  /** FG-32 — замок розкладки. Див. `Project.nestingLocked`. */
  setNestingLocked: (locked: boolean) => void;
  clearCalculation: () => void;
}

/** Причина, з якою заблокований розкрій відкладає деталь у буфер. */
export const LOCKED_UNPLACED_REASON = 'Розкрій заблоковано — покладіть деталь вручну';

/**
 * Причина, з якою деталь потрапляє в буфер після видалення слеба.
 *
 * Заведено 27.08 за зауваженням власника: слеб видаляли, а деталі, що на
 * ньому лежали, зникали з екрана взагалі — розміщення вже немає, а в
 * буфер їх ніхто не поклав. Менеджер бачив, що замовлення «схудло», і
 * дізнавався про втрату вже на прорахунку. Тепер деталь завжди має де
 * бути: або на слебі, або в буфері.
 */
export const SLAB_DELETED_UNPLACED_REASON = 'слеб видалено — деталі повернулись у буфер';

export function triggerPackingAsync(
  project: Project,
  mode: PackingMode,
  previousParts: DetailPart[],
  set: (state: Partial<ProjectState> | ((state: ProjectState) => void)) => void,
  get: () => ProjectState,
  /**
   * ХВИЛЯ 5, крок 5.2 — чи це СВІДОМЕ перескладання.
   *
   * `false` (за замовчуванням) — перерахунок після правки виробу: усе, що
   * людина ставила руками, лишається на місці, а перекладаються тільки
   * деталі без ручного розміщення. `true` — натиснули «Економний» або
   * «Оптимальний» із підтвердженням «позиції зміняться»: складаємо заново.
   */
  fullRepack = false,
) {
  // ІСТОРІЯ: це єдиний конвеєр, через який проходить БУДЬ-ЯКА зміна складу
  // виробів, деталей і слябів (інваріант 2.4). Знімок кладеться тут, ДО
  // застосування зміни, — тому один виклик = один крок Ctrl+Z, і жодній
  // мутації не треба пам'ятати про історію окремо.
  get().pushHistorySnapshot();

  const normalized = normalizeProject(project);
  const detailsForNesting = getAllProjectDetails(normalized).map(d => {
    if (d.id && d.id.includes('prod_')) {
      return { 
        ...d, 
        fold: { enabled: false, sides: [], size: 100 }, 
        thickening: { enabled: false, sides: [], size: 40 } 
      };
    }
    return d;
  });
  // Матеріал потрібен рушію для технологічного запасу на гнуті елементи
  // (30% сегментація / 20% гнуття) — див. domain/radiusElement.
  const parts = explodeDetails(detailsForNesting, normalized.allowances, normalized.projectMaterial);
  const remappedProject = remapStoredPartReferences(normalized, previousParts, parts);

  /**
   * FG-32 — розкрій заблоковано.
   *
   * Типова ситуація: менеджер розклав деталі, вручну підібрав малюнок каменю,
   * і тут клієнт просить додати виріз. Будь-яка правка виробу проходила через
   * цю ж функцію і перескладала розкладку з нуля — уся робота з текстурою
   * зникала. Із замком ми перераховуємо тільки СКЛАД деталей (геометрія ж
   * змінилась), а розміщення лишаємо як є: `partIdentity` не залежить від
   * розміру, тому деталь із новим вирізом зберігає своє місце.
   *
   * Деталь, якій місця не знайшлось (нова або та, що втратила відповідність),
   * іде в буфер нерозміщених із поясненням — менеджер кладе її сам. Автоматичне
   * докладання у вільне місце — наступний крок, воно потребує роботи з пакером.
   */
  if (normalized.nestingLocked) {
    const validIds = new Set(parts.map((part) => part.id));
    const kept = remappedProject.placements.filter((item) => validIds.has(item.partId));
    const textureLayouts = remappedProject.textureLayouts.filter((item) => validIds.has(item.partId));

    /*
     * КРОК 5.3 — нова деталь ДОКЛАДАЄТЬСЯ у вільне місце.
     *
     * Раніше при замкненому розкрої будь-яка нова деталь одразу летіла в
     * буфер із запискою «покладіть вручну» — навіть коли поруч було пів
     * порожнього слябу. Тепер пробуємо покласти її автоматично: наявні
     * розміщення позначені як недоторканні, тож пакер бачить їх зайнятими
     * і шукає для новачка вільне місце. Не знайшлось — тоді буфер, як і був.
     */
    const placedIds = new Set(kept.map((item) => item.partId));
    const newcomers = parts.filter((part) => !placedIds.has(part.id));
    let placements = kept;
    let unplacedPartIds = newcomers.map((part) => part.id);
    const unplacedReasons = { ...(remappedProject.unplacedReasons ?? {}) };

    if (newcomers.length) {
      const frozen = kept.map((item) => ({ ...item, manualLocked: true }));
      const topUp = autoPack(
        { ...remappedProject, placements: frozen } as Project,
        parts,
        mode,
        true,
      );
      placements = topUp.placements;
      unplacedPartIds = topUp.unplacedPartIds;
      for (const [partId, reason] of Object.entries(topUp.unplacedReasons)) {
        unplacedReasons[partId] = reason;
      }
    }
    for (const partId of unplacedPartIds) {
      if (!unplacedReasons[partId]) unplacedReasons[partId] = LOCKED_UNPLACED_REASON;
    }

    const lockedProject = {
      ...remappedProject,
      placements: [],
      textureLayouts,
      unplacedPartIds,
      unplacedReasons,
      updatedAt: new Date().toISOString(),
    } as Project;
    lockedProject.placements = detectConflicts(lockedProject, parts, placements);
    lockedProject.calculationStatus = calcStatus(lockedProject, lockedProject.placements);

    persist(lockedProject, get().currentDbProjectId);
    set((state: ProjectState) => {
      state.project = lockedProject;
      state.parts = parts;
      state.packingMode = mode;
      state.isPacking = false;
    });
    return;
  }

  // Zustand setter requires care if we are using immer middleware but calling it from outside the slice.
  // We can just use the object form for this synchronous state update if we cast.
  set((state: ProjectState) => {
    state.project = { ...remappedProject, updatedAt: new Date().toISOString() } as Project;
    state.parts = parts;
    state.packingMode = mode;
    state.isPacking = true;
    // Історію тут НЕ чистимо. Старий код обнуляв стеки при кожній зміні
    // складу — саме тому Ctrl+Z працював лише для руху деталей: будь-яке
    // редагування виробу зносило всю накопичену історію. Тепер зміна складу
    // сама Є кроком історії (pushHistorySnapshot на вході цієї функції).
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
      mode,
      // Крок 5.2: правка виробу зберігає ручні позиції, свідоме
      // перескладання (кнопки з підтвердженням) — ні.
      preserveManual: !fullRepack,
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
    // Кнопки «Економний»/«Оптимальний» — це свідоме перескладання: там
    // менеджер уже підтвердив, що позиції зміняться.
    triggerPackingAsync(get().project, packingMode, get().parts, set, get, true);
  },

  setNestingLocked: (locked) => {
    set((state) => {
      state.project.nestingLocked = locked;
      if (!locked && state.project.unplacedReasons) {
        // Знімаємо замок — прибираємо саме «замкові» пояснення, а справжні
        // причини (не влізло, дефект, немає слеба) лишаємо як були.
        for (const [partId, reason] of Object.entries(state.project.unplacedReasons)) {
          if (reason === LOCKED_UNPLACED_REASON) delete state.project.unplacedReasons[partId];
        }
      }
      state.project.updatedAt = new Date().toISOString();
    });
    persist(get().project, get().currentDbProjectId);
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
      // Очистка проєкту — єдине місце, де історія обнуляється легітимно:
      // відкочуватись у «до очистки» означало б воскрешати інший проєкт.
      state.history = [];
      state.future = [];
    });
    persist(get().project, get().currentDbProjectId);
  },
});
