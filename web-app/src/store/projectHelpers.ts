import type { DetailPart, Placement, Project } from '../domain/types';
import { DEFAULT_ALLOWANCES, defaultCommercialQuoteSettings } from '../domain/defaults';
import { explodeDetails } from '../engines/geometry';
import { detectConflicts } from '../engines/packing';

export function normalizeProject(project: Project): Project {
  return { 
    ...project, 
    uiLanguage: project.uiLanguage ?? 'uk', 
    textureFrames: project.textureFrames ?? [], 
    manualDimensions: project.manualDimensions ?? [], 
    allowances: { ...DEFAULT_ALLOWANCES, ...(project.allowances ?? {}) },
    commercialQuote: {
      ...defaultCommercialQuoteSettings,
      ...(project.commercialQuote ?? {}),
      edgePrices: {
        ...defaultCommercialQuoteSettings.edgePrices,
        ...(project.commercialQuote?.edgePrices ?? {}),
      },
      manualLines: project.commercialQuote?.manualLines ?? [],
      lineOverrides: project.commercialQuote?.lineOverrides ?? {},
    }
  };
}

export function calcStatus(project: Project, placements: Placement[]) {
  const hasConflict = placements.some((p) => p.conflict);
  return hasConflict ? 'error' : project.calculationStatus;
}

export function loadWithoutPacking(project: Project) {
  const normalized = normalizeProject(project);
  const parts = explodeDetails(normalized.details, normalized.allowances);
  const placements = detectConflicts(normalized, parts, normalized.placements);
  const nextProject = { ...normalized, placements } as Project;
  nextProject.calculationStatus = calcStatus(nextProject, placements);
  return { project: nextProject, parts };
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

export function genitiveLabel(label: string) {
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

export function partNameForLabel(part: DetailPart, label: string) {
  if (part.isMain || !part.edgeKind || !part.edgeSide) return label;
  const prefix = part.edgeKind === 'fold' ? 'Підворот' : 'Потовщення';
  return `${prefix} ${genitiveLabel(label)} сторона ${part.edgeSide}`;
}
