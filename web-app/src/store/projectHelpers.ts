import type { DetailPart, Placement, Project } from '../domain/types';
import { DEFAULT_ALLOWANCES } from '../domain/defaults';

export function normalizeProject(project: Project): Project {
  return { ...project, uiLanguage: project.uiLanguage ?? 'uk', textureFrames: project.textureFrames ?? [], manualDimensions: project.manualDimensions ?? [], allowances: { ...DEFAULT_ALLOWANCES, ...(project.allowances ?? {}) } };
}

export function calcStatus(project: Project, placements: Placement[]) {
  const hasConflict = placements.some((p) => p.conflict);
  return hasConflict ? 'error' : project.calculationStatus;
}

export function partIdentity(part: DetailPart) {
  const kind = part.isMain ? 'main' : part.edgeKind ?? 'part';
  const side = part.edgeSide ?? 'body';
  const group = part.textureGroupLabel ?? part.parentLabel;
  const offsetX = Math.round(part.textureOffsetX ?? 0);
  const offsetY = Math.round(part.textureOffsetY ?? 0);
  return [part.detailId, kind, side, group, offsetX, offsetY].join('|');
}

export function remapStoredPartReferences(project: Project, previousParts: DetailPart[], nextParts: DetailPart[]): Project {
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
