import React, { useMemo } from 'react';
import type { DetailDraft } from '../../forms/utils/draftHelpers';
import { EdgeProfileIcon } from '../forms/editors/EdgeProcessingDesigner';
import type { EdgeProfileType, EdgeProfileDef, MaterialType } from '../../../domain/types';

interface DimensionsTableProps {
  draft: DetailDraft;
  updateDetail: (patch: Partial<DetailDraft>) => void;
  sides: string[];
  edgeProfiles: EdgeProfileDef[];
  material?: MaterialType;
}

export function DimensionsTable({ draft, updateDetail, sides, edgeProfiles, material }: DimensionsTableProps) {
  const getSideLength = (side: string): number => {
    if (draft.kind === 'rect' || draft.kind === 'sink_rect' || draft.kind === 'sink_slot') {
      if (side === 'A' || side === 'C') return draft.width;
      if (side === 'B' || side === 'D') return draft.height;
    }
    
    if (draft.kind === 'l') {
      const { outerWidth = 1200, outerHeight = 1200, innerHorizontal = 600, innerVertical = 600 } = draft;
      switch (side) {
        case 'A': return outerWidth;
        case 'B': return innerVertical;
        case 'C': return Math.max(1, outerWidth - innerHorizontal);
        case 'D': return Math.max(1, outerHeight - innerVertical);
        case 'E': return innerHorizontal;
        case 'F': return outerHeight;
      }
    }
    
    if (draft.kind === 'u') {
      const w = draft.width || 2400;
      const leftH = draft.leftLegHeight ?? (draft.height || 1200);
      const rightH = draft.rightLegHeight ?? (draft.height || 1200);
      const maxH = Math.max(leftH, rightH);
      const cutW = draft.innerCutWidth || 1200;
      const cutD = draft.innerCutDepth || 600;
      const cutOff = draft.innerCutOffset || 600;
      const topBarHeight = Math.max(0, maxH - cutD);
      
      switch (side) {
        case 'A': return w;
        case 'B': return rightH;
        case 'C': return Math.max(1, w - cutOff - cutW);
        case 'D': return Math.max(1, rightH - topBarHeight);
        case 'E': return cutW;
        case 'F': return Math.max(1, leftH - topBarHeight);
        case 'G': return cutOff;
        case 'H': return leftH;
      }
    }
    return 0;
  };

  const handleSizeChange = (side: string, val: number) => {
    if (val < 1) val = 1;
    
    if (draft.kind === 'rect' || draft.kind === 'sink_rect' || draft.kind === 'sink_slot') {
      if (side === 'A' || side === 'C') updateDetail({ width: val });
      if (side === 'B' || side === 'D') updateDetail({ height: val });
    }
    
    if (draft.kind === 'l') {
      let { outerWidth = 1200, outerHeight = 1200, innerHorizontal = 600, innerVertical = 600 } = draft;
      switch (side) {
        case 'A': outerWidth = val; break;
        case 'B': innerVertical = val; break;
        case 'C': outerWidth = val + innerHorizontal; break;
        case 'D': outerHeight = val + innerVertical; break;
        case 'E': innerHorizontal = val; break;
        case 'F': outerHeight = val; break;
      }
      updateDetail({ outerWidth, outerHeight, innerHorizontal, innerVertical });
    }
    
    if (draft.kind === 'u') {
      let w = draft.width || 2400;
      let leftH = draft.leftLegHeight ?? (draft.height || 1200);
      let rightH = draft.rightLegHeight ?? (draft.height || 1200);
      let maxH = Math.max(leftH, rightH);
      let cutW = draft.innerCutWidth || 1200;
      let cutD = draft.innerCutDepth || 600;
      let cutOff = draft.innerCutOffset || 600;
      const topBarHeight = Math.max(0, maxH - cutD);
      
      const updateHeights = (newLeft: number, newRight: number) => {
        leftH = newLeft;
        rightH = newRight;
        maxH = Math.max(leftH, rightH);
        cutD = Math.max(0, maxH - topBarHeight);
      };
      
      const updateWidths = (newCutOff: number, newCutW: number, newC: number) => {
        cutOff = newCutOff;
        cutW = newCutW;
        w = cutOff + cutW + newC;
      };

      const c = w - cutOff - cutW;
      
      switch (side) {
        case 'A': 
          w = val; 
          break;
        case 'B': 
          updateHeights(leftH, val);
          break;
        case 'C': 
          updateWidths(cutOff, cutW, val);
          break;
        case 'D': 
          updateHeights(leftH, topBarHeight + val);
          break;
        case 'E': 
          updateWidths(cutOff, val, c);
          break;
        case 'F': 
          updateHeights(topBarHeight + val, rightH);
          break;
        case 'G': 
          updateWidths(val, cutW, c);
          break;
        case 'H': 
          updateHeights(val, rightH);
          break;
      }
      updateDetail({ 
        width: w, height: maxH, leftLegHeight: leftH, rightLegHeight: rightH,
        innerCutWidth: cutW, innerCutDepth: cutD, innerCutOffset: cutOff
      });
    }
  };

  const setSideProfile = (side: string, profile: EdgeProfileType | '') => {
    const nextProfiles = { ...draft.edgeProfiles };
    if (profile === '') delete nextProfiles[side];
    else nextProfiles[side] = profile;
    updateDetail({ edgeProfiles: nextProfiles });
  };
  
  const toggleFeature = (side: string, featureName: 'thickening' | 'fold') => {
    const feature = draft[featureName];
    const isChecked = feature.sides.includes(side);
    const nextSides = isChecked ? feature.sides.filter(s => s !== side) : [...feature.sides, side];
    updateDetail({ [featureName]: { ...feature, enabled: nextSides.length > 0, sides: nextSides } });
  };

  return (
    <div className="bg-white text-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[#b3d4f0] text-slate-700 font-medium text-xs">
            <th className="py-2 px-2 border-b border-[#a3c4e0] text-center w-10"></th>
            <th className="py-2 px-2 border-b border-[#a3c4e0]">Сторони</th>
            <th className="py-2 px-2 border-b border-[#a3c4e0]" title="Габарит заготовки для розкрою (+допуски)">Розкрій</th>
            <th className="py-2 px-2 border-b border-[#a3c4e0]">Обробка</th>
          </tr>
        </thead>
        <tbody>
          {sides.map((side) => {
            const length = getSideLength(side);
            const profile = draft.edgeProfiles[side];
            
            return (
              <tr key={side} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                <td className="py-1 px-2 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded text-sm bg-[#1f93ef] text-white font-bold">{side}</span>
                </td>
                <td className="py-1 px-2">
                  {(() => {
                    const isReadOnly = draft.kind === 'u' && (side === 'D' || side === 'E' || side === 'F');
                    return (
                      <input
                        type="number"
                        value={Math.round(length)}
                        onChange={(e) => !isReadOnly && handleSizeChange(side, Number(e.target.value))}
                        disabled={isReadOnly}
                        title={isReadOnly ? "Цей розмір розраховується автоматично" : ""}
                        className={`w-[80px] px-2 py-1 border rounded outline-none font-mono text-sm ${isReadOnly ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : 'border-slate-300 bg-white focus:border-[#1f93ef]'}`}
                      />
                    );
                  })()}
                </td>
                <td className="py-1 px-2">
                  {(() => {
                    if (!material || !['Керамограніт', 'Кварцит', 'Натуральний камінь'].includes(material)) return null;
                    const allowance = profile ? (edgeProfiles.find((p) => p.id === profile)?.allowance ?? 0) : 0;
                    if (allowance === 0) return null;
                    return (
                      <div className="text-xs text-slate-500 font-mono" title="Розмір з урахуванням допуску на обробку">
                        {Math.round(length + allowance)} мм
                      </div>
                    );
                  })()}
                </td>
                <td className="py-1 px-2">
                  <div className="flex items-center gap-1">
                    <EdgeProfileIcon profile={profile} />
                    <select
                      value={profile ?? ''}
                      onChange={(e) => setSideProfile(side, e.target.value as EdgeProfileType | '')}
                      className="border border-slate-300 rounded py-1 px-1 focus:border-[#1f93ef] outline-none w-[180px] text-xs truncate bg-white"
                    >
                      <option value="">Без фрезерування</option>
                      {edgeProfiles.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}