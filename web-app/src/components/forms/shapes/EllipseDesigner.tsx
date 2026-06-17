import React from 'react';
import type { DetailDraft } from '../../../domain/types';
import type { UiLanguage } from '../../../store/useDictionaryStore';
import { SvgInput, SvgSide, SvgQuantity, SvgCheck, TemplateInput, TemplateSide, TemplateCheck, ArrowDefs } from './SvgComponents';
import type { ShapeKind } from '../utils/draftHelpers';

export function EllipseDesigner({ detail, updateDetail, activeSides, onSideClick }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; activeSides: Set<string>; onSideClick: (side: string) => void }) {
  return (
    <div className="schema reference-schema ellipse-reference">
      <svg viewBox="0 0 540 310" className="designer-scheme-svg">
        <ArrowDefs />
        <text className="scheme-caption" x="10" y="48">Розмір</text>
        <text className="scheme-caption" x="10" y="88">Ширина (мм)</text>
        <text className="scheme-caption" x="10" y="166">Висота (мм)</text>
        <SvgInput x={12} y={100} value={detail.ellipseWidth} onChange={(ellipseWidth) => updateDetail({ ellipseWidth })} />
        <SvgInput x={12} y={178} value={detail.ellipseHeight} onChange={(ellipseHeight) => updateDetail({ ellipseHeight })} />
        <ellipse className="scheme-part" cx="284" cy="154" rx="170" ry="85" />
        <line className="scheme-arrow" x1="116" y1="154" x2="452" y2="154" />
        <line className="scheme-arrow" x1="284" y1="71" x2="284" y2="237" />
        <text className="scheme-large-text" x="284" y="153">{detail.ellipseWidth}</text>
        <text className="scheme-large-text" x="300" y="185" transform="rotate(-90 300 185)">{detail.ellipseHeight}</text>
        <SvgSide x={178} y={22} side="A" active={activeSides.has('A')} onClick={() => onSideClick('A')} />
        <SvgSide x={392} y={22} side="B" active={activeSides.has('B')} onClick={() => onSideClick('B')} />
        <SvgSide x={392} y={246} side="C" active={activeSides.has('C')} onClick={() => onSideClick('C')} />
        <SvgSide x={178} y={246} side="D" active={activeSides.has('D')} onClick={() => onSideClick('D')} />
        <SvgQuantity x={452} y={156} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />
      </svg>
    </div>
  );
}
