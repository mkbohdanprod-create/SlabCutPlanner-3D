import type { Placement, DetailPart, Detail } from '../domain/types';

export interface AssemblyGroupData {
  mainPlacement: Placement;
  mainPart: DetailPart;
  foldPlacements: Placement[];
  childPlacements: Placement[];
  isSink?: boolean;
}

export function buildAssemblyGroups(
  parts: DetailPart[],
  placements: Placement[],
  is3dGroupingEnabled: boolean,
  details: Detail[] = []
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
        childPlacements: [],
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
          childPlacements: [],
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

  mainPlacements.sort((a, b) => {
    const partA = parts.find((part) => part.id === a.partId);
    const partB = parts.find((part) => part.id === b.partId);
    const detailA = details.find(d => d.id === partA?.detailId);
    const detailB = details.find(d => d.id === partB?.detailId);
    const isRootA = !detailA?.parentDetailId ? 1 : 0;
    const isRootB = !detailB?.parentDetailId ? 1 : 0;
    return isRootB - isRootA;
  });

  mainPlacements.forEach((mainP) => {
    if (handledPlacementIds.has(mainP.id)) return;
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

    let childPlacements: Placement[] = [];
    if (is3dGroupingEnabled) {
      // Find children: details whose parentDetailId is mainPart.detailId
      const childDetailIds = new Set(
        details.filter(d => d.parentDetailId === mainPart.detailId).map(d => d.id)
      );
      
      childPlacements = placements.filter(p => {
        if (handledPlacementIds.has(p.id)) return false;
        const childPart = parts.find(part => part.id === p.partId);
        return childPart && childDetailIds.has(childPart.detailId);
      });
    }

    grouped.push({
      mainPlacement: mainP,
      mainPart: mainPart,
      foldPlacements: folds,
      childPlacements,
      isSink: false,
    });

    handledPlacementIds.add(mainP.id);
    folds.forEach((f) => handledPlacementIds.add(f.id));
    childPlacements.forEach((cp) => handledPlacementIds.add(cp.id));
  });

  return grouped;
}
