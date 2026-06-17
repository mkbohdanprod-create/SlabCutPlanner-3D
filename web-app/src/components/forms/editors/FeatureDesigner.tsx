import React, { ReactNode } from 'react';
import { Target, Maximize, Scissors, AlertCircle, Move } from 'lucide-react';
import type { DetailDraft, EdgeFeature, EdgeProfileType, EdgeProfileSelection, UiLanguage } from '../../../domain/types';
import { allSides, curveSides } from '../utils/draftHelpers';
import { EDGE_PROFILE_OPTIONS, DEFAULT_EDGE_PROFILE } from '../../../utils/edgeProfiles';

export function FeatureDesigner({
  title,
  feature,
  linkedSides = [],
  onChange,
  sides,
}: {
  title: string;
  feature: EdgeFeature;
  linkedSides?: string[];
  onChange: (v: EdgeFeature) => void;
  sides: string[];
}) {
  const availableSides = new Set(sides);
  const selectedAvailableSides = feature.sides.filter((side) => availableSides.has(side));
  const linkedSideSet = new Set(linkedSides);
  const allSidesSelected = sides.length > 0 && sides.every((side) => feature.sides.includes(side) || linkedSideSet.has(side));

  const toggleAllSides = (checked: boolean) => {
    const nextSides = checked
      ? [...feature.sides.filter((side) => !availableSides.has(side)), ...sides.filter((side) => !linkedSideSet.has(side))]
      : feature.sides.filter((side) => !availableSides.has(side));
    onChange({ ...feature, enabled: nextSides.length > 0, sides: nextSides });
  };

  const toggleSide = (side: string) => {
    if (linkedSideSet.has(side)) return;
    const nextSides = feature.sides.includes(side)
      ? feature.sides.filter((item) => item !== side)
      : [...feature.sides, side];
    onChange({ ...feature, enabled: nextSides.length > 0, sides: nextSides });
  };

  return (
    <section className="feature-designer">
      <h3>{title}</h3>
      <div className="feature-side-controls">
        <label className="feature-toggle-all">
          <input
            type="checkbox"
            checked={allSidesSelected}
            ref={(input) => {
              if (input) input.indeterminate = (selectedAvailableSides.length > 0 || linkedSides.length > 0) && !allSidesSelected;
            }}
            onChange={(event) => toggleAllSides(event.target.checked)}
          />
          Усі сторони
        </label>
        <div className="side-chip-row">
          {sides.map((side) => (
            <button
              type="button"
              key={side}
              className={linkedSideSet.has(side) ? 'chip active linked' : feature.sides.includes(side) ? 'chip active' : 'chip'}
              title={linkedSideSet.has(side) ? 'Прив’язано з DXF' : undefined}
              onClick={() => toggleSide(side)}
            >
              {side}
            </button>
          ))}
        </div>
      </div>
      <Field label="Розмір"><input type="number" value={feature.size} onChange={(e) => onChange({ ...feature, size: Number(e.target.value), enabled: feature.enabled || feature.sides.length > 0 })} /></Field>
    </section>
  );
}

