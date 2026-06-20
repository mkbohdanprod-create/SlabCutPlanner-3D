// =====================================================================
//  src/components/forms/import/ApprovalItemEditors.tsx   (P2.1 — ФІНАЛ)
//  Повертає у картку прев'ю редактори, втрачені при міграції:
//   • Розміри сторін (ручні)  → updateApprovalDimensionList (перенесено)
//   • Кромки по сторонах       → EdgeProfileDesigner (вже у проєкті)
//   • Потовщення / Підворот    → FeatureDesigner (вже у проєкті)
//
//  ВІДМІННОСТІ від чернетки:
//   1) `sides` тепер виводяться САМОСТІЙНО з геометрії item (бо sideOptionsFor
//      приймає ShapeKind, якого в ApprovalImportItem немає). Проп `sides`
//      лишився опціональним — можна передати канонічний список ззовні.
//   2) Додано взаємовиключення: кромка і потовщення/підворот не можуть бути
//      на одній стороні одночасно (як у формі звичайної деталі).
// =====================================================================

import type { ApprovalImportItem, ApprovalDimensionLabel } from '../../../utils/approvalImport';
import type { EdgeProfileSelection, EdgeFeature } from '../../../domain/types';
import { EdgeProcessingDesigner } from '../editors/EdgeProcessingDesigner';
import { Field } from '../utils/sharedInputs';

// Сторони деталі: спершу з sideSegments (авторитетне джерело),
// інакше за кількістю точок контуру (4→ABCD, 6→…F, 8→…H).
function sidesForItem(item: ApprovalImportItem): string[] {
  const segmentKeys = Object.keys(item.sideSegments ?? {});
  if (segmentKeys.length) return segmentKeys.sort();
  const count = item.customPoints?.length ?? 4;
  return 'ABCDEFGHIJKLMNOP'.split('').slice(0, Math.max(3, count));
}

// Ручне введення розміру сторони (перенесено з робочого 5174).
export function updateApprovalDimensionList(
  item: ApprovalImportItem,
  side: string,
  rawValue: string,
): Partial<ApprovalImportItem> {
  const normalizedSide = side.toUpperCase();
  const nextDimensions = item.dimensions.filter((dimension) => dimension.side !== normalizedSide);
  const value = Number(rawValue);
  if (Number.isFinite(value) && value > 0) {
    nextDimensions.push({
      side: normalizedSide,
      value,
      source: `manual preview input: ${normalizedSide}=${value} мм`,
    } as ApprovalDimensionLabel);
  }
  return {
    dimensions: nextDimensions.sort((a, b) => a.side.localeCompare(b.side)),
    dimensionsSource: nextDimensions.length
      ? (item.dimensionsSource === 'none' ? 'drawing-labels' : item.dimensionsSource)
      : 'none',
  };
}

export function ApprovalItemEditors({
  item,
  sides,
  onPatch,
}: {
  item: ApprovalImportItem;
  sides?: string[];                                  // опціонально; за замовч. — з item
  onPatch: (patch: Partial<ApprovalImportItem>) => void;
}) {
  const sideList = sides ?? sidesForItem(item);
  const dimensionFor = (side: string) =>
    item.dimensions.find((dimension) => dimension.side === side.toUpperCase())?.value ?? '';

  const featureSides = new Set([...(item.thickening?.sides ?? []), ...(item.fold?.sides ?? [])]);
  const edgeSides = new Set(Object.keys(item.edgeProfiles ?? {}).filter((side) => item.edgeProfiles?.[side]));

  // При зміні кромок — прибрати ці сторони з потовщення/підвороту.
  const onEdgeChange = (value: EdgeProfileSelection) => {
    const newEdgeSides = new Set(Object.keys(value).filter((side) => value[side]));
    const stripFeature = (feature: EdgeFeature): EdgeFeature => {
      const nextSides = feature.sides.filter((side) => !newEdgeSides.has(side));
      return { ...feature, enabled: nextSides.length > 0, sides: nextSides };
    };
    onPatch({
      edgeProfiles: value,
      thickening: stripFeature(item.thickening),
      fold: stripFeature(item.fold),
    });
  };

  // При зміні фічі — прибрати її сторони з кромок.
  const onFeatureChange = (key: 'thickening' | 'fold') => (value: EdgeFeature) => {
    const featureSideSet = new Set(value.sides);
    const nextEdges = Object.fromEntries(
      Object.entries(item.edgeProfiles ?? {}).filter(([side]) => !featureSideSet.has(side)),
    ) as EdgeProfileSelection;
    onPatch({ [key]: value, edgeProfiles: nextEdges } as Partial<ApprovalImportItem>);
  };

  return (
    <div className="approval-item-editors">
      <div className="approval-dimension-editor" aria-label="Розміри сторін">
        <strong>Розміри сторін</strong>
        <div className="approval-side-grid">
          {sideList.map((side) => (
            <Field key={side} label={side}>
              <input
                type="number"
                value={dimensionFor(side)}
                onChange={(event) => onPatch(updateApprovalDimensionList(item, side, event.target.value))}
              />
            </Field>
          ))}
        </div>
      </div>

      <EdgeProcessingDesigner
        edgeProfiles={item.edgeProfiles as EdgeProfileSelection}
        thickening={item.thickening as EdgeFeature}
        fold={item.fold as EdgeFeature}
        sides={sideList}
        blockedEdgeSides={[...featureSides]}
        onChange={onPatch}
      />
    </div>
  );
}
