import type { StateCreator } from 'zustand';
import type { ProjectState } from '../useProjectStore';
import type { DetailPart, Project } from '../../domain/types';
import { detectConflicts } from '../../engines/packing';
import { persist } from '../persistence';

export type MovementSnapshot = Pick<Project, 'placements' | 'textureLayouts' | 'unplacedPartIds' | 'unplacedReasons' | 'calculationStatus'>;

function calcStatus(project: Project, placements: any[]) {
  const hasConflict = placements.some((p) => p.conflict);
  return hasConflict ? 'error' : project.calculationStatus;
}

export function movementSnapshot(project: Project): MovementSnapshot {
  return {
    placements: project.placements.map((placement) => ({ ...placement })),
    textureLayouts: project.textureLayouts.map((layout) => ({ ...layout })),
    unplacedPartIds: [...project.unplacedPartIds],
    unplacedReasons: { ...(project.unplacedReasons ?? {}) },
    calculationStatus: project.calculationStatus,
  };
}

export function restoreMovementSnapshot(project: Project, parts: DetailPart[], snapshot: MovementSnapshot): Project {
  const restored = {
    ...project,
    placements: snapshot.placements,
    textureLayouts: snapshot.textureLayouts,
    unplacedPartIds: snapshot.unplacedPartIds,
    unplacedReasons: snapshot.unplacedReasons,
    calculationStatus: snapshot.calculationStatus,
    updatedAt: new Date().toISOString(),
  } as Project;
  const placements = detectConflicts(restored, parts, restored.placements);
  restored.placements = placements;
  restored.calculationStatus = calcStatus(restored, placements);
  return restored;
}

export interface HistorySlice {
  movementHistory: MovementSnapshot[];
  movementFuture: MovementSnapshot[];
  pushMovementSnapshot: () => void;
  undoLastMovement: () => void;
  redoMovement: () => void;
}

export const createHistorySlice: StateCreator<
  ProjectState,
  [['zustand/immer', never]],
  [],
  HistorySlice
> = (set, get) => ({
  movementHistory: [],
  movementFuture: [],

  pushMovementSnapshot: () => set((state) => {
    const current = state.project;
    state.movementHistory.push(movementSnapshot(current));
    if (state.movementHistory.length > 80) {
      state.movementHistory.shift();
    }
    state.movementFuture = [];
  }),

  undoLastMovement: () => {
    set((state) => {
      const history = state.movementHistory;
      if (history.length === 0) return;
      const snapshot = history[history.length - 1];
      if (!snapshot) return;

      const currentSnapshot = movementSnapshot(state.project);
      const nextProject = restoreMovementSnapshot(state.project, state.parts, snapshot);

      state.project = nextProject;
      state.movementHistory.pop();
      state.movementFuture.push(currentSnapshot);
    });
    persist(get().project, get().currentDbProjectId);
  },

  redoMovement: () => {
    set((state) => {
      const future = state.movementFuture;
      if (future.length === 0) return;
      const snapshot = future[future.length - 1];
      if (!snapshot) return;

      const currentSnapshot = movementSnapshot(state.project);
      const nextProject = restoreMovementSnapshot(state.project, state.parts, snapshot);

      state.project = nextProject;
      state.movementHistory.push(currentSnapshot);
      if (state.movementHistory.length > 80) {
        state.movementHistory.shift();
      }
      state.movementFuture.pop();
    });
    persist(get().project, get().currentDbProjectId);
  },
});
