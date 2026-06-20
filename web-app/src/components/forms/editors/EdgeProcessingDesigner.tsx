import React from 'react';
import type { EdgeFeature, EdgeProfileType, EdgeProfileSelection } from '../../../domain/types';
import { Field } from '../utils/sharedInputs';
import { EDGE_PROFILE_OPTIONS, DEFAULT_EDGE_PROFILE } from '../../../utils/edgeProfiles';

export function EdgeProcessingDesigner({
  edgeProfiles,
  thickening,
  fold,
  sides,
  blockedEdgeSides = [],
  linkedThickeningSides = [],
  linkedFoldSides = [],
  onChange,
}: {
  edgeProfiles: EdgeProfileSelection;
  thickening: EdgeFeature;
  fold: EdgeFeature;
  sides: string[];
  blockedEdgeSides?: string[];
  linkedThickeningSides?: string[];
  linkedFoldSides?: string[];
  onChange: (patch: { edgeProfiles: EdgeProfileSelection; thickening: EdgeFeature; fold: EdgeFeature }) => void;
}) {
  const blockedEdgeSet = new Set(blockedEdgeSides);
  const linkedThickeningSet = new Set(linkedThickeningSides);
  const linkedFoldSet = new Set(linkedFoldSides);

  const toggleAllSidesProfile = (checked: boolean) => {
    const nextProfiles = { ...edgeProfiles };
    sides.forEach((side) => {
      if (!blockedEdgeSet.has(side)) {
        if (checked) nextProfiles[side] = nextProfiles[side] ?? DEFAULT_EDGE_PROFILE;
        else delete nextProfiles[side];
      }
    });
    // Remove thickening and fold from sides that now have a profile
    const nextThickeningSides = thickening.sides.filter((s) => !nextProfiles[s]);
    const nextFoldSides = fold.sides.filter((s) => !nextProfiles[s]);
    onChange({
      edgeProfiles: nextProfiles,
      thickening: { ...thickening, enabled: nextThickeningSides.length > 0, sides: nextThickeningSides },
      fold: { ...fold, enabled: nextFoldSides.length > 0, sides: nextFoldSides },
    });
  };

  const toggleAllSidesFeature = (featureName: 'thickening' | 'fold', checked: boolean) => {
    const isThickening = featureName === 'thickening';
    const feature = isThickening ? thickening : fold;
    const linkedSet = isThickening ? linkedThickeningSet : linkedFoldSet;
    const nextFeatureSides = checked
      ? [...new Set([...feature.sides, ...sides.filter((s) => !linkedSet.has(s))])]
      : feature.sides.filter((s) => !sides.includes(s) || linkedSet.has(s)); // Keep sides that are linked or not in current "sides" list
      
    // If we add thickening/fold, we must remove edge profiles from those sides
    const nextProfiles = { ...edgeProfiles };
    if (checked) {
      sides.forEach((s) => {
        if (!linkedSet.has(s)) delete nextProfiles[s];
      });
    }
    
    onChange({
      edgeProfiles: nextProfiles,
      thickening: isThickening ? { ...thickening, enabled: nextFeatureSides.length > 0, sides: nextFeatureSides } : thickening,
      fold: !isThickening ? { ...fold, enabled: nextFeatureSides.length > 0, sides: nextFeatureSides } : fold,
    });
  };

  const setSideProfile = (side: string, profile: EdgeProfileType | '') => {
    if (blockedEdgeSet.has(side)) return;
    const nextProfiles = { ...edgeProfiles };
    if (profile) nextProfiles[side] = profile;
    else delete nextProfiles[side];

    // Remove feature if profile is added
    const nextThickeningSides = profile ? thickening.sides.filter((s) => s !== side) : thickening.sides;
    const nextFoldSides = profile ? fold.sides.filter((s) => s !== side) : fold.sides;

    onChange({
      edgeProfiles: nextProfiles,
      thickening: { ...thickening, enabled: nextThickeningSides.length > 0, sides: nextThickeningSides },
      fold: { ...fold, enabled: nextFoldSides.length > 0, sides: nextFoldSides },
    });
  };

  const toggleSideFeature = (side: string, featureName: 'thickening' | 'fold') => {
    const isThickening = featureName === 'thickening';
    const feature = isThickening ? thickening : fold;
    const linkedSet = isThickening ? linkedThickeningSet : linkedFoldSet;
    if (linkedSet.has(side)) return;

    const nextFeatureSides = feature.sides.includes(side)
      ? feature.sides.filter((s) => s !== side)
      : [...feature.sides, side];

    const nextProfiles = { ...edgeProfiles };
    if (!feature.sides.includes(side)) {
      delete nextProfiles[side];
    }

    onChange({
      edgeProfiles: nextProfiles,
      thickening: isThickening ? { ...thickening, enabled: nextFeatureSides.length > 0, sides: nextFeatureSides } : thickening,
      fold: !isThickening ? { ...fold, enabled: nextFeatureSides.length > 0, sides: nextFeatureSides } : fold,
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
      <h3>Обробка сторін</h3>
      
      <div className="edge-processing-global-sizes">
        <Field label="Розмір потовщення, мм">
          <input 
            type="number" 
            value={thickening.size} 
            onChange={(e) => onChange({ edgeProfiles, fold, thickening: { ...thickening, size: Number(e.target.value) } })} 
          />
        </Field>
        <Field label="Розмір підвороту, мм">
          <input 
            type="number" 
            value={fold.size} 
            onChange={(e) => onChange({ edgeProfiles, thickening, fold: { ...fold, size: Number(e.target.value) } })} 
          />
        </Field>
      </div>

      <div className="edge-processing-table-wrapper">
        <table className="edge-processing-table">
          <thead>
            <tr>
              <th className="ep-side-col">Сторона</th>
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
              <th className="ep-feature-col">
                <label className="ep-toggle-all">
                  <input
                    type="checkbox"
                    checked={allThickeningSelected}
                    ref={(el) => { if (el) el.indeterminate = someThickeningSelected && !allThickeningSelected; }}
                    onChange={(e) => toggleAllSidesFeature('thickening', e.target.checked)}
                  />
                  Потовщення
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
                  Підворот
                </label>
              </th>
            </tr>
          </thead>
          <tbody>
            {sides.map((side) => {
              const profile = edgeProfiles[side];
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
                  <td className="ep-edge-col">
                    <div className="ep-edge-select-wrapper">
                      <EdgeProfileIcon profile={profile} />
                      <select 
                        disabled={blockedEdge} 
                        title={blockedEdge ? 'На стороні вже є прив’язаний елемент DXF' : undefined} 
                        value={profile ?? ''} 
                        onChange={(e) => setSideProfile(side, e.target.value as EdgeProfileType | '')}
                      >
                        <option value="">Без кромки</option>
                        {EDGE_PROFILE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </td>
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
