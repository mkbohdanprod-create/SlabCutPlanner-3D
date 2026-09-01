import type { EdgeFeature, EdgeProfileType, EdgeProfileSelection } from '../../../domain/types';
import { edgeProfilesForMaterial } from '../../../utils/edgeProfiles';
import { CATALOG_OPTION_VALUE, EdgeProfileOptionGroups } from './EdgeProfileOptions';
import { Field } from '../utils/sharedInputs';
import { DEFAULT_EDGE_PROFILE } from '../../../utils/edgeProfiles';
import { useProjectStore } from '../../../store/useProjectStore';
import { useUIStore } from '../../../store/useStore';
import { Scissors } from 'lucide-react';
import { EdgeProfileThumb } from './EdgeProfileThumb';
import { openEdgeCatalog } from '../../../store/useEdgeCatalog';
import { topProfileId } from '../../../domain/edgeTreatment';
import { EDGE_KIND_LABEL } from '../../../domain/ids';

export function EdgeProcessingDesigner({
  edgeProfiles,
  thickening,
  fold,
  sides,
  blockedEdgeSides = [],
  linkedThickeningSides = [],
  linkedFoldSides = [],
  showEdgeColumn = true,
  onChange,
}: {
  edgeProfiles: EdgeProfileSelection;
  thickening: EdgeFeature;
  fold: EdgeFeature;
  sides: string[];
  blockedEdgeSides?: string[];
  linkedThickeningSides?: string[];
  linkedFoldSides?: string[];
  /** Сховати колонку кромок — коли кромки живуть в окремому треї. */
  showEdgeColumn?: boolean;
  onChange: (patch: { edgeProfiles: EdgeProfileSelection; thickening: EdgeFeature; fold: EdgeFeature }) => void;
}) {
  const blockedEdgeSet = new Set(blockedEdgeSides);
  const linkedThickeningSet = new Set(linkedThickeningSides);
  const linkedFoldSet = new Set(linkedFoldSides);
  
  const project = useProjectStore(s => s.project);
  const setIsEdgeProfileSettingsOpen = useUIStore(s => s.setIsEdgeProfileSettingsOpen);
  // Профілі фільтруються за матеріалом проєкту: серія 12 — керамограніт, 20 — кварцит
  const availableProfiles = edgeProfilesForMaterial(project.referenceData?.edgeProfiles, project.projectMaterial);

  /**
   * Кромка і потовщення/підворот НЕ виключають одне одного (правило від
   * власника, 10.08): на стороні буває і полірований торець, і підворот.
   * Раніше вибір кромки вибивав галочки доповнень і навпаки — прибрано.
   */
  const toggleAllSidesProfile = (checked: boolean) => {
    const nextProfiles = { ...edgeProfiles };
    sides.forEach((side) => {
      if (!blockedEdgeSet.has(side)) {
        if (checked) nextProfiles[side] = nextProfiles[side] ?? DEFAULT_EDGE_PROFILE;
        else delete nextProfiles[side];
      }
    });
    onChange({ edgeProfiles: nextProfiles, thickening, fold });
  };

  const toggleAllSidesFeature = (featureName: 'thickening' | 'fold', checked: boolean) => {
    const isThickening = featureName === 'thickening';
    const feature = isThickening ? thickening : fold;
    const linkedSet = isThickening ? linkedThickeningSet : linkedFoldSet;
    const nextFeatureSides = checked
      ? [...new Set([...feature.sides, ...sides.filter((s) => !linkedSet.has(s))])]
      : feature.sides.filter((s) => !sides.includes(s) || linkedSet.has(s));

    const nextSideSizes = feature.sideSizes
      ? Object.fromEntries(nextFeatureSides.map((s) => [s, feature.sideSizes?.[s] ?? feature.size]))
      : undefined;

    onChange({
      edgeProfiles,
      thickening: isThickening ? { ...thickening, enabled: nextFeatureSides.length > 0, sides: nextFeatureSides, sideSizes: nextSideSizes } : thickening,
      fold: !isThickening ? { ...fold, enabled: nextFeatureSides.length > 0, sides: nextFeatureSides, sideSizes: nextSideSizes } : fold,
    });
  };

  const setSideProfile = (side: string, profile: EdgeProfileType | '') => {
    if (blockedEdgeSet.has(side)) return;
    const nextProfiles = { ...edgeProfiles };
    if (profile) nextProfiles[side] = profile;
    else delete nextProfiles[side];
    onChange({ edgeProfiles: nextProfiles, thickening, fold });
  };

  const toggleSideFeature = (side: string, featureName: 'thickening' | 'fold') => {
    const isThickening = featureName === 'thickening';
    const feature = isThickening ? thickening : fold;
    const linkedSet = isThickening ? linkedThickeningSet : linkedFoldSet;
    if (linkedSet.has(side)) return;

    const nextFeatureSides = feature.sides.includes(side)
      ? feature.sides.filter((s) => s !== side)
      : [...feature.sides, side];

    const nextSideSizes = feature.sideSizes
      ? Object.fromEntries(nextFeatureSides.map((s) => [s, feature.sideSizes?.[s] ?? feature.size]))
      : undefined;

    onChange({
      edgeProfiles,
      thickening: isThickening ? { ...thickening, enabled: nextFeatureSides.length > 0, sides: nextFeatureSides, sideSizes: nextSideSizes } : thickening,
      fold: !isThickening ? { ...fold, enabled: nextFeatureSides.length > 0, sides: nextFeatureSides, sideSizes: nextSideSizes } : fold,
    });
  };

  const allEdgeProfilesSelected = sides.length > 0 && sides.every((s) => Boolean(edgeProfiles[s]) || blockedEdgeSet.has(s));
  const someEdgeProfilesSelected = sides.some((s) => Boolean(edgeProfiles[s]));

  const allThickeningSelected = sides.length > 0 && sides.every((s) => thickening.sides.includes(s) || linkedThickeningSet.has(s));
  const someThickeningSelected = sides.some((s) => thickening.sides.includes(s));

  const allFoldSelected = sides.length > 0 && sides.every((s) => fold.sides.includes(s) || linkedFoldSet.has(s));
  const someFoldSelected = sides.some((s) => fold.sides.includes(s));

  return (
    <section className="edge-processing-designer">
      <div className="edge-processing-header relative">
        <div className="flex justify-between items-center w-full mb-3">
          <h3 className="m-0">Обробка сторін</h3>
          <button 
            onClick={() => setIsEdgeProfileSettingsOpen(true)}
            className="flex items-center gap-1.5 text-[13px] font-medium text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 px-2 py-1 rounded transition-colors"
          >
            <Scissors className="w-3.5 h-3.5" />
            Довідник
          </button>
        </div>
        
        <div className="edge-processing-global-sizes">
          <Field label={`Розмір «${EDGE_KIND_LABEL.thickening}», мм`}>
            <input 
              type="number" 
              value={thickening.size} 
              onChange={(e) => {
                const size = Number(e.target.value);
                const nextSideSizes = thickening.sides.length > 0
                  ? Object.fromEntries(thickening.sides.map((k) => [k, size]))
                  : undefined;
                onChange({ edgeProfiles, fold, thickening: { ...thickening, size, sideSizes: nextSideSizes } });
              }} 
            />
          </Field>
          <Field label={`Розмір «${EDGE_KIND_LABEL.fold}», мм`}>
            <input 
              type="number" 
              value={fold.size} 
              onChange={(e) => {
                const size = Number(e.target.value);
                const nextSideSizes = fold.sides.length > 0
                  ? Object.fromEntries(fold.sides.map((k) => [k, size]))
                  : undefined;
                onChange({ edgeProfiles, thickening, fold: { ...fold, size, sideSizes: nextSideSizes } });
              }} 
            />
          </Field>
        </div>
      </div>

      <div className="edge-processing-table-wrapper">
        <table className="edge-processing-table">
          <thead>
            <tr>
              <th className="ep-side-col">Сторона</th>
              {showEdgeColumn && (
              <th className="ep-edge-col">
                <label className="ep-toggle-all">
                  <input
                    type="checkbox"
                    checked={allEdgeProfilesSelected}
                    ref={(el) => { if (el) el.indeterminate = someEdgeProfilesSelected && !allEdgeProfilesSelected; }}
                    onChange={(e) => toggleAllSidesProfile(e.target.checked)}
                  />
                  Кромка
                </label>
              </th>
              )}
              <th className="ep-feature-col">
                <label className="ep-toggle-all">
                  <input
                    type="checkbox"
                    checked={allThickeningSelected}
                    ref={(el) => { if (el) el.indeterminate = someThickeningSelected && !allThickeningSelected; }}
                    onChange={(e) => toggleAllSidesFeature('thickening', e.target.checked)}
                  />
                  {EDGE_KIND_LABEL.thickening}
                </label>
              </th>
              <th className="ep-feature-col">
                <label className="ep-toggle-all">
                  <input
                    type="checkbox"
                    checked={allFoldSelected}
                    ref={(el) => { if (el) el.indeterminate = someFoldSelected && !allFoldSelected; }}
                    onChange={(e) => toggleAllSidesFeature('fold', e.target.checked)}
                  />
                  {EDGE_KIND_LABEL.fold}
                </label>
              </th>
            </tr>
          </thead>
          <tbody>
            {sides.map((side) => {
              const profile = topProfileId(edgeProfiles[side]);
              const hasThickening = thickening.sides.includes(side);
              const hasFold = fold.sides.includes(side);
              const linkedThick = linkedThickeningSet.has(side);
              const linkedFol = linkedFoldSet.has(side);
              const blockedEdge = blockedEdgeSet.has(side);

              return (
                <tr key={side}>
                  <td className="ep-side-col">
                    <span className="ep-chip">{side}</span>
                  </td>
                  {showEdgeColumn && (
                  <td className="ep-edge-col">
                    <div className="ep-edge-select-wrapper">
                      <EdgeProfileThumb profileId={profile} height={30} />
                      <select
                        disabled={blockedEdge}
                        title={blockedEdge ? 'На стороні вже є прив’язаний елемент DXF' : undefined}
                        value={profile ?? ''}
                        onChange={(e) => {
                          if (e.target.value === CATALOG_OPTION_VALUE) {
                            openEdgeCatalog({
                              title: `Сторона ${side}`,
                              material: project.projectMaterial,
                              value: profile,
                              allowNone: true,
                              onSelect: (id) => setSideProfile(side, id as EdgeProfileType | ''),
                            });
                            return;
                          }
                          setSideProfile(side, e.target.value as EdgeProfileType | '');
                        }}
                      >
                        <option value="">Без кромки</option>
                        <EdgeProfileOptionGroups profiles={availableProfiles} material={project.projectMaterial} short={false} />
                      </select>
                    </div>
                  </td>
                  )}
                  <td className="ep-feature-col">
                    <label className={`ep-checkbox-wrapper ${linkedThick ? 'linked' : ''}`} title={linkedThick ? 'Прив’язано з DXF' : undefined}>
                      <input 
                        type="checkbox" 
                        checked={hasThickening || linkedThick}
                        disabled={linkedThick}
                        onChange={() => toggleSideFeature(side, 'thickening')} 
                      />
                    </label>
                  </td>
                  <td className="ep-feature-col">
                    <label className={`ep-checkbox-wrapper ${linkedFol ? 'linked' : ''}`} title={linkedFol ? 'Прив’язано з DXF' : undefined}>
                      <input 
                        type="checkbox" 
                        checked={hasFold || linkedFol}
                        disabled={linkedFol}
                        onChange={() => toggleSideFeature(side, 'fold')} 
                      />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function EdgeProfileIcon({ profile }: { profile?: EdgeProfileType }) {
  const profileType = profile ?? 'straight_edge';
  return (
    <svg className="edge-profile-icon" viewBox="0 0 54 32" aria-hidden="true">
      <defs>
        <pattern id={`edge-hatch-${profileType}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#9badba" strokeWidth="1" />
        </pattern>
      </defs>
      {profileType === 'sharknose' ? (
        <path d="M6 7 H46 L34 25 H6 Z" fill={`url(#edge-hatch-${profileType})`} />
      ) : profileType === 'full_bullnose' ? (
        <path d="M6 7 H38 Q50 16 38 25 H6 Z" fill={`url(#edge-hatch-${profileType})`} />
      ) : profileType === 'half_bullnose' || profileType === 'r2_top' || profileType === 'r2_top_bottom' ? (
        <path d="M6 7 H39 Q48 7 48 16 V25 H6 Z" fill={`url(#edge-hatch-${profileType})`} />
      ) : profileType.includes('chamfer') || profileType === 'chamfer_45_r2' ? (
        <path d="M6 7 H42 L48 13 V25 H6 Z" fill={`url(#edge-hatch-${profileType})`} />
      ) : (
        <rect x="6" y="7" width="42" height="18" fill={`url(#edge-hatch-${profileType})`} />
      )}
      <path
        d={
          profileType === 'sharknose'
            ? 'M6 7 H46 L34 25 H6 Z'
            : profileType === 'full_bullnose'
              ? 'M6 7 H38 Q50 16 38 25 H6 Z'
              : profileType === 'half_bullnose' || profileType === 'r2_top' || profileType === 'r2_top_bottom'
                ? 'M6 7 H39 Q48 7 48 16 V25 H6 Z'
                : profileType.includes('chamfer') || profileType === 'chamfer_45_r2'
                  ? 'M6 7 H42 L48 13 V25 H6 Z'
                  : 'M6 7 H48 V25 H6 Z'
        }
        fill="none"
        stroke="#2d4f6c"
        strokeWidth="1.7"
      />
    </svg>
  );
}
