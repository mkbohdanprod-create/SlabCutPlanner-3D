import React from 'react';
import type { DetailDraft } from '../../../domain/types';
import type { UiLanguage } from '../../../store/useDictionaryStore';
import { SvgInput, SvgSide, SvgQuantity, SvgCheck, TemplateInput, TemplateSide, TemplateCheck, ArrowDefs } from './SvgComponents';
import type { ShapeKind } from '../utils/draftHelpers';

export function CircleDesigner({ detail, updateDetail, activeSides, onSideClick }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; activeSides: Set<string>; onSideClick: (side: string) => void }) {
  const shownValue = detail.circleSizeMode === 'diameter' ? detail.diameter : detail.diameter / 2;
  return (
    <div className="schema reference-schema circle-reference">
      <svg viewBox="0 0 540 330" className="designer-scheme-svg">
        <ArrowDefs />
        <foreignObject x="10" y="54" width="116" height="94">
          <div className="scheme-radio-box">
            <span>Розмір</span>
            <label><input type="radio" checked={detail.circleSizeMode === 'diameter'} onChange={() => updateDetail({ circleSizeMode: 'diameter' })} /> Діаметр</label>
            <label><input type="radio" checked={detail.circleSizeMode === 'radius'} onChange={() => updateDetail({ circleSizeMode: 'radius' })} /> Радіус</label>
          </div>
        </foreignObject>
        <SvgInput x={18} y={174} value={shownValue} onChange={(value) => updateDetail({ diameter: detail.circleSizeMode === 'diameter' ? value : value * 2 })} />
        <circle className="scheme-part" cx="283" cy="163" r="118" />
        <line className="scheme-dash" x1="165" y1="163" x2="401" y2="163" />
        <line className="scheme-dash" x1="283" y1="45" x2="283" y2="281" />
        <line className="scheme-arrow" x1="199" y1="246" x2="367" y2="80" />
        <text className="scheme-large-text" x="283" y="165" transform="rotate(-45 283 165)">Ø{Math.round(detail.diameter)}</text>
        <SvgSide x={166} y={14} side="A" active={activeSides.has('A')} onClick={() => onSideClick('A')} />
        <SvgSide x={360} y={14} side="B" active={activeSides.has('B')} onClick={() => onSideClick('B')} />
        <SvgSide x={360} y={272} side="C" active={activeSides.has('C')} onClick={() => onSideClick('C')} />
        <SvgSide x={166} y={272} side="D" active={activeSides.has('D')} onClick={() => onSideClick('D')} />
        <SvgQuantity x={430} y={167} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />
      </svg>
    </div>
  );
}
