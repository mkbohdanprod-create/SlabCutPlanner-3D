import React from 'react';
import type { DetailDraft } from '../../../domain/types';
import type { UiLanguage } from '../../../store/useDictionaryStore';
import { SvgInput, SvgSide, SvgQuantity, SvgCheck, TemplateInput, TemplateSide, TemplateCheck, ArrowDefs } from './SvgComponents';
import type { ShapeKind } from '../utils/draftHelpers';

export function UDesigner({ detail, updateDetail, activeSides, onSideClick }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; activeSides: Set<string>; onSideClick: (side: string) => void }) {
  return (
    <div className="schema reference-schema u-reference u-template-shell">
      <div className="u-template" aria-label="П-подібна схема розмірів">
        <svg viewBox="0 0 690 380" className="u-template-bg" aria-hidden="true">
          <defs>
            <linearGradient id="u-template-fill" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#f9fcfe" />
              <stop offset="1" stopColor="#e8f0f6" />
            </linearGradient>
          </defs>
          <text className="u-template-caption" x="10" y="42">Розмір</text>
          <path className="u-template-part" d="M142 64 H423 V320 H355 V190 H224 V320 H142 Z" />
          <text className="u-template-symbol" x="215" y="178">Ω</text>
          <text className="u-template-symbol" x="356" y="178">λ</text>
          <line className="u-template-dash" x1="142" y1="38" x2="423" y2="38" />
          <line className="u-template-dash" x1="142" y1="38" x2="142" y2="64" />
          <line className="u-template-dash" x1="423" y1="38" x2="423" y2="64" />
          <line className="u-template-dash" x1="110" y1="64" x2="110" y2="320" />
          <line className="u-template-dash" x1="110" y1="64" x2="142" y2="64" />
          <line className="u-template-dash" x1="110" y1="320" x2="142" y2="320" />
          <line className="u-template-dash" x1="454" y1="64" x2="454" y2="320" />
          <line className="u-template-dash" x1="423" y1="64" x2="454" y2="64" />
          <line className="u-template-dash" x1="423" y1="320" x2="454" y2="320" />
          <line className="u-template-dash" x1="224" y1="190" x2="355" y2="190" />
          <line className="u-template-dash" x1="289" y1="190" x2="289" y2="320" />
          <line className="u-template-dash" x1="224" y1="320" x2="355" y2="320" />
          <line className="u-template-dash" x1="142" y1="352" x2="224" y2="352" />
          <line className="u-template-dash" x1="142" y1="320" x2="142" y2="352" />
          <line className="u-template-dash" x1="224" y1="320" x2="224" y2="352" />
          <line className="u-template-dash" x1="355" y1="352" x2="423" y2="352" />
          <line className="u-template-dash" x1="355" y1="320" x2="355" y2="352" />
          <line className="u-template-dash" x1="423" y1="320" x2="423" y2="352" />
          <text className="u-template-caption" x="600" y="138">Кількість</text>
          <text className="u-template-caption" x="600" y="156">Деталей</text>
        </svg>

        <TemplateInput x={282} y={38} value={detail.width} onChange={(width) => updateDetail({ width })} />
        <TemplateInput x={110} y={204} value={detail.height} onChange={(height) => updateDetail({ height })} />
        <TemplateInput x={454} y={204} value={detail.height} onChange={(height) => updateDetail({ height })} />
        <TemplateInput x={289} y={254} value={detail.innerCutDepth} onChange={(innerCutDepth) => updateDetail({ innerCutDepth })} />
        <TemplateInput x={289} y={314} value={detail.innerCutWidth} onChange={(innerCutWidth) => updateDetail({ innerCutWidth })} />
        <TemplateInput x={182} y={352} value={detail.innerCutOffset} onChange={(innerCutOffset) => updateDetail({ innerCutOffset })} />
        <TemplateInput x={389} y={352} value={Math.max(detail.width - detail.innerCutOffset - detail.innerCutWidth, 1)} onChange={(value) => updateDetail({ innerCutOffset: Math.max(detail.width - detail.innerCutWidth - value, 0) })} />
        <TemplateInput x={600} y={190} width={58} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />

        <TemplateSide x={86} y={168} side="A" active={activeSides.has('A')} onClick={() => onSideClick('A')} />
        <TemplateSide x={310} y={94} side="B" active={activeSides.has('B')} onClick={() => onSideClick('B')} />
        <TemplateSide x={486} y={168} side="C" active={activeSides.has('C')} onClick={() => onSideClick('C')} />
        <TemplateSide x={388} y={284} side="D" active={activeSides.has('D')} onClick={() => onSideClick('D')} />
        <TemplateSide x={350} y={254} side="E" active={activeSides.has('E')} onClick={() => onSideClick('E')} />
        <TemplateSide x={289} y={352} side="F" active={activeSides.has('F')} onClick={() => onSideClick('F')} />
        <TemplateSide x={224} y={254} side="G" active={activeSides.has('G')} onClick={() => onSideClick('G')} />
        <TemplateSide x={172} y={284} side="H" active={activeSides.has('H')} onClick={() => onSideClick('H')} />

        <TemplateCheck x={520} y={238} label="Стик вертикальний Ω" checked={detail.jointOmegaVertical} onChange={(jointOmegaVertical) => updateDetail({ jointOmegaVertical })} />
        <TemplateCheck x={520} y={266} label="Стик горизонтальний Ω" checked={detail.jointOmegaHorizontal} onChange={(jointOmegaHorizontal) => updateDetail({ jointOmegaHorizontal })} />
        <TemplateCheck x={520} y={294} label="Стик вертикальний λ" checked={detail.jointLambdaVertical} onChange={(jointLambdaVertical) => updateDetail({ jointLambdaVertical })} />
        <TemplateCheck x={520} y={322} label="Стик горизонтальний λ" checked={detail.jointLambdaHorizontal} onChange={(jointLambdaHorizontal) => updateDetail({ jointLambdaHorizontal })} />
      </div>
    </div>
  );
}
