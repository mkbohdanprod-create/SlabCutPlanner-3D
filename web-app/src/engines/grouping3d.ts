import type { Placement, DetailPart } from '../domain/types';

export interface AssemblyGroupData {
  mainPlacement: Placement;
  mainPart: DetailPart;
  foldPlacements: Placement[];
  isSink?: boolean;
}

export function buildAssemblyGroups(
  parts: DetailPart[],
  placements: Placement[],
  is3dGroupingEnabled: boolean
): AssemblyGroupData[] {
  const handledPlacementIds = new Set<string>();
  const grouped: AssemblyGroupData[] = [];

  // 1. Handle Sinks (Group by parentLabel, structurally identified)
  // We do this first so sinks are isolated even if they are placed on a DXF tabletop.
  const sinkParentLabels = new Set(
    parts
      .filter((p) => p.textureGroupKind === 'rectSink' || p.textureGroupKind === 'slotSink')
      .map((p) => p.parentLabel)
  );

  sinkParentLabels.forEach((label) => {
    const sinkParts = parts.filter((p) => p.parentLabel === label);
    const sinkPlacements = placements.filter((pl) => sinkParts.some((p) => p.id === pl.partId));

    if (sinkPlacements.length > 0) {
      // Find the anchor for the sink
      const anchorPart =
        sinkParts.find((p) => p.textureGroupAnchor) ||
        sinkParts.find((p) => p.name.includes('дно')) ||
        sinkParts[0];

      const anchorPlacement = sinkPlacements.find((pl) => pl.partId === anchorPart.id) || sinkPlacements[0];
      const folds = sinkPlacements.filter((pl) => pl.id !== anchorPlacement.id);

      grouped.push({
        mainPlacement: anchorPlacement,
        mainPart: anchorPart,
        foldPlacements: folds,
        isSink: true,
      });

      sinkPlacements.forEach((pl) => handledPlacementIds.add(pl.id));
    }
  });

  // 2. Handle DXF Blocks (Group by textureGroupLabel starting with 'import:')
  if (is3dGroupingEnabled) {
    const dxfGroupLabels = new Set(
      parts.filter((p) => p.textureGroupLabel?.startsWith('import:')).map((p) => p.textureGroupLabel)
    );

    dxfGroupLabels.forEach((label) => {
      // Exclude parts that were already handled (e.g. sinks) just in case
      const groupParts = parts.filter(
        (p) => p.textureGroupLabel === label && !handledPlacementIds.has(placements.find(pl => pl.partId === p.id)?.id || '')
      );
      const groupPlacements = placements.filter((pl) => groupParts.some((p) => p.id === pl.partId));

      if (groupPlacements.length > 1) {
        const anchorPart =
          groupParts.find((p) => p.textureGroupAnchor) ||
          groupParts.find((p) => p.isMain) ||
          groupParts[0];
        const anchorPlacement = groupPlacements.find((pl) => pl.partId === anchorPart.id) || groupPlacements[0];
        const folds = groupPlacements.filter((pl) => pl.id !== anchorPlacement.id);

        grouped.push({
          mainPlacement: anchorPlacement,
          mainPart: anchorPart,
          foldPlacements: folds,
          isSink: false,
        });

        groupPlacements.forEach((pl) => handledPlacementIds.add(pl.id));
      }
    });
  }

  // 3. Handle standard parts
  const mainPlacements = placements.filter((p) => {
    if (handledPlacementIds.has(p.id)) return false;
    return parts.find((part) => part.id === p.partId)?.isMain;
  });

  mainPlacements.forEach((mainP) => {
    const mainPart = parts.find((part) => part.id === mainP.partId);
    if (!mainPart) return;

    let folds: Placement[] = [];
    if (is3dGroupingEnabled) {
      folds = placements.filter((p) => {
        if (handledPlacementIds.has(p.id)) return false;
        const foldPart = parts.find((part) => part.id === p.partId);
        return foldPart && !foldPart.isMain && foldPart.parentLabel === mainPart.parentLabel;
      });
    }

    grouped.push({
      mainPlacement: mainP,
      mainPart: mainPart,
      foldPlacements: folds,
      isSink: false,
    });

    handledPlacementIds.add(mainP.id);
    folds.forEach((f) => handledPlacementIds.add(f.id));
  });

  return grouped;
}
