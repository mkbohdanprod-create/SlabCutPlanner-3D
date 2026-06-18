import type { StateCreator } from 'zustand';
import type { ProjectState } from '../useProjectStore';
import type { DefectZone, DetailPart, Rotation, TextureFrame, TextureLayout } from '../../domain/types';
import { rotatedSize } from '../../lib/project';
import { uid } from '../../domain/defaults';
import { persist } from '../persistence';

export interface TextureSlice {
  addDefect: (slabId: string, defect: DefectZone) => void;
  updateDefect: (slabId: string, defectId: string, patch: Partial<DefectZone>) => void;
  deleteDefect: (slabId: string, defectId: string) => void;
  previewTextureSource: (partId: string, slabId: string, x: number, y: number, rotation: Rotation) => void;
  moveTextureLayout: (layoutId: string, x: number, y: number) => void;
  rotateTextureLayout: (layoutId: string) => void;
  setTextureLayoutRotation: (layoutId: string, rotation: Rotation) => void;
  addTextureFrame: (frame: Omit<TextureFrame, 'id'>) => void;
  updateTextureFrame: (frameId: string, patch: Partial<Omit<TextureFrame, 'id'>>) => void;
  deleteTextureFrame: (frameId: string) => void;
}

function texturePartGroupKey(part: DetailPart | undefined) {
  if (!part) return undefined;
  if (part.textureGroupLabel?.startsWith('import:')) return part.textureGroupLabel;
  return `${part.detailId}:${part.textureGroupLabel ?? part.parentLabel}`;
}

function texturePartInteractionKey(part: DetailPart | undefined) {
  if (!part) return undefined;
  if (part.textureGroupKind || part.textureGroupLabel?.startsWith('import:')) return texturePartGroupKey(part);
  return `${part.detailId}:${part.parentLabel}`;
}

function rotatedTextureLayouts(layouts: TextureLayout[], parts: DetailPart[], sourceLayout: TextureLayout, targetRotation: Rotation) {
  const sourcePart = parts.find((part) => part.id === sourceLayout.partId);
  const groupKey = texturePartInteractionKey(sourcePart);
  const delta = targetRotation - sourceLayout.rotation;
  const selected = layouts.filter((layout) => {
    const part = parts.find((candidate) => candidate.id === layout.partId);
    return layout.id === sourceLayout.id || (groupKey && texturePartInteractionKey(part) === groupKey);
  });
  if (selected.length <= 1) {
    return layouts.map((layout) => layout.id === sourceLayout.id ? { ...layout, rotation: targetRotation } : layout);
  }

  const boxes = selected.flatMap((layout) => {
    const part = parts.find((candidate) => candidate.id === layout.partId);
    if (!part) return [];
    const size = rotatedSize(part, layout.rotation);
    return [{ layout, part, size }];
  });
  const minX = Math.min(...boxes.map(({ layout }) => layout.x));
  const minY = Math.min(...boxes.map(({ layout }) => layout.y));
  const maxX = Math.max(...boxes.map(({ layout, size }) => layout.x + size.width));
  const maxY = Math.max(...boxes.map(({ layout, size }) => layout.y + size.height));
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const angle = (delta * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const updates = new Map(boxes.map(({ layout, part, size }) => {
    const itemCenter = { x: layout.x + size.width / 2, y: layout.y + size.height / 2 };
    const dx = itemCenter.x - center.x;
    const dy = itemCenter.y - center.y;
    const nextCenter = {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
    const rotation = (layout.rotation + delta) as Rotation;
    const nextSize = rotatedSize(part, rotation);
    return [layout.id, {
      ...layout,
      x: nextCenter.x - nextSize.width / 2,
      y: nextCenter.y - nextSize.height / 2,
      rotation,
    }];
  }));
  return layouts.map((layout) => updates.get(layout.id) ?? layout);
}

export const createTextureSlice: StateCreator<
  ProjectState,
  [['zustand/immer', never]],
  [],
  TextureSlice
> = (set, get) => ({
  addDefect: (slabId, defect) => {
    set((state) => {
      const slab = state.project.slabs.find(s => s.id === slabId);
      if (slab) slab.defects.push(defect);
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },
  updateDefect: (slabId, defectId, patch) => {
    set((state) => {
      const slab = state.project.slabs.find(s => s.id === slabId);
      if (slab) {
        const defect = slab.defects.find(d => d.id === defectId);
        if (defect) Object.assign(defect, patch);
      }
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },
  deleteDefect: (slabId, defectId) => {
    set((state) => {
      const slab = state.project.slabs.find(s => s.id === slabId);
      if (slab) {
        slab.defects = slab.defects.filter(d => d.id !== defectId);
      }
    });
    persist(get().project, get().currentDbProjectId);
    get().pushMovementSnapshot();
  },
  previewTextureSource: (partId, slabId, x, y, rotation) => {
    set((state) => {
      const layoutIndex = state.project.textureLayouts.findIndex(layout => layout.partId === partId);
      if (layoutIndex >= 0) {
        state.project.textureLayouts[layoutIndex].slabId = slabId;
        state.project.textureLayouts[layoutIndex].x = x;
        state.project.textureLayouts[layoutIndex].y = y;
        state.project.textureLayouts[layoutIndex].rotation = rotation;
      } else {
        const placement = state.project.placements.find((p) => p.partId === partId);
        if (!placement) return;
        state.project.textureLayouts.push({
          id: uid('texture'),
          slabId,
          partId,
          x,
          y,
          rotation: 0,
          sourceX: x,
          sourceY: y,
          sourceRotation: placement.rotation
        });
      }
    });
    // no persist or history for preview
  },
  moveTextureLayout: (layoutId, x, y) => {
    set((state) => {
      const sourceLayout = state.project.textureLayouts.find((layout) => layout.id === layoutId);
      if (!sourceLayout) return;
      const sourcePart = state.parts.find((part) => part.id === sourceLayout.partId);
      const groupKey = texturePartInteractionKey(sourcePart);
      const dx = x - sourceLayout.x;
      const dy = y - sourceLayout.y;
      
      state.project.textureLayouts.forEach(layout => {
        const part = state.parts.find((candidate) => candidate.id === layout.partId);
        if (layout.id === sourceLayout.id || (groupKey && texturePartInteractionKey(part) === groupKey)) {
          layout.x += dx;
          layout.y += dy;
        }
      });
      state.project.updatedAt = new Date().toISOString();
      state.packingRequestId += 1;
    });
    persist(get().project, get().currentDbProjectId);
  },
  rotateTextureLayout: (layoutId) => {
    set((state) => {
      const sourceLayout = state.project.textureLayouts.find((layout) => layout.id === layoutId);
      if (!sourceLayout) return;
      const targetRotation = ((sourceLayout.rotation + 90) % 360) as Rotation;
      state.project.textureLayouts = rotatedTextureLayouts(state.project.textureLayouts, state.parts, sourceLayout, targetRotation);
      state.project.updatedAt = new Date().toISOString();
      state.packingRequestId += 1;
    });
    persist(get().project, get().currentDbProjectId);
  },
  setTextureLayoutRotation: (layoutId, rotation) => {
    set((state) => {
      const sourceLayout = state.project.textureLayouts.find((layout) => layout.id === layoutId);
      if (!sourceLayout) return;
      state.project.textureLayouts = rotatedTextureLayouts(state.project.textureLayouts, state.parts, sourceLayout, rotation);
      state.project.updatedAt = new Date().toISOString();
      state.packingRequestId += 1;
    });
    persist(get().project, get().currentDbProjectId);
  },
  addTextureFrame: (frame) => {
    set((state) => {
      if (!state.project.textureFrames) state.project.textureFrames = [];
      state.project.textureFrames.push({ ...frame, id: uid('texture_frame') });
      state.project.updatedAt = new Date().toISOString();
      state.packingRequestId += 1;
    });
    persist(get().project, get().currentDbProjectId);
  },
  updateTextureFrame: (frameId, patch) => {
    set((state) => {
      if (!state.project.textureFrames) return;
      const frame = state.project.textureFrames.find(f => f.id === frameId);
      if (frame) Object.assign(frame, patch);
      state.project.updatedAt = new Date().toISOString();
      state.packingRequestId += 1;
    });
    persist(get().project, get().currentDbProjectId);
  },
  deleteTextureFrame: (frameId) => {
    set((state) => {
      if (!state.project.textureFrames) return;
      state.project.textureFrames = state.project.textureFrames.filter(f => f.id !== frameId);
      state.project.updatedAt = new Date().toISOString();
      state.packingRequestId += 1;
    });
    persist(get().project, get().currentDbProjectId);
  },
});
