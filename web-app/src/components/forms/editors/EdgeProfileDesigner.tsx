import React, { ReactNode } from 'react';
import { Target, Maximize, Scissors, AlertCircle, Move } from 'lucide-react';
import type { DetailDraft, EdgeFeature, EdgeProfileType, EdgeProfileSelection, UiLanguage } from '../../../domain/types';
import { allSides, curveSides } from '../utils/draftHelpers';
import { EDGE_PROFILE_OPTIONS, DEFAULT_EDGE_PROFILE } from '../../../utils/edgeProfiles';

export function EdgeProfileDesigner({
  title,
  profiles,
  onChange,
  sides,
  blockedSides = [],
}: {
  title: string;
  profiles: EdgeProfileSelection;
  onChange: (value: EdgeProfileSelection) => void;
  sides: string[];
  blockedSides?: string[];
}) {
  const blockedSideSet = new Set(blockedSides);
  const selectableSides = sides.filter((side) => !blockedSideSet.has(side));
  const selectedSides = selectableSides.filter((side) => profiles[side]);
  const allSidesSelected = selectableSides.length > 0 && selectableSides.every((side) => Boolean(profiles[side]));

  const toggleAllSides = (checked: boolean) => {
    const next: EdgeProfileSelection = { ...profiles };
    selectableSides.forEach((side) => {
      if (checked) next[side] = next[side] ?? DEFAULT_EDGE_PROFILE;
      else delete next[side];
    });
    onChange(next);
  };

  const setSideProfile = (side: string, profile: EdgeProfileType | '') => {
    if (blockedSideSet.has(side)) return;
    const next: EdgeProfileSelection = { ...profiles };
    if (profile) next[side] = profile;
    else delete next[side];
    onChange(next);
  };

  return (
    <section className="feature-designer edge-profile-designer">
      <h3>{title}</h3>
      <label className="feature-toggle-all">
        <input
          type="checkbox"
          checked={allSidesSelected}
          ref={(input) => {
            if (input) input.indeterminate = selectedSides.length > 0 && !allSidesSelected;
          }}
          onChange={(event) => toggleAllSides(event.target.checked)}
        />
        Усі сторони
      </label>
      <div className="edge-profile-grid">
        {sides.map((side) => {
          const profile = profiles[side];
          return (
            <div key={side} className="edge-profile-row">
              <span className="chip edge-profile-side">{side}</span>
              <EdgeProfileIcon profile={profile} />
              <select disabled={blockedSideSet.has(side)} title={blockedSideSet.has(side) ? 'На стороні вже є прив’язаний елемент DXF' : undefined} value={profile ?? ''} onChange={(event) => setSideProfile(side, event.target.value as EdgeProfileType | '')}>
                <option value="">Без кромки</option>
                {EDGE_PROFILE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          );
        })}
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

