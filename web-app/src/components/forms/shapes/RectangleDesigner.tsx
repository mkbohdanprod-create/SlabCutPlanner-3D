import React from 'react';
import type { DetailDraft } from '../../../domain/types';
import type { UiLanguage } from '../../../store/useDictionaryStore';
import { SvgInput, SvgSide, SvgQuantity, SvgCheck, TemplateInput, TemplateSide, TemplateCheck, ArrowDefs } from './SvgComponents';
import type { ShapeKind } from '../utils/draftHelpers';

export function RectangleDesigner({ detail, updateDetail, activeSides, onSideClick, language }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; activeSides: Set<string>; onSideClick: (side: string) => void; language: UiLanguage }) {
  void activeSides;
  void onSideClick;
  const ui = (value: string) => translateStaticUiText(language, value);

  return (
    <div className="schema reference-schema rect-reference rect-template-shell">
      <div className="rect-template" aria-label="Прямокутна схема розмірів">
        <img className="rect-template-image" src={rectDetailTemplateSrc} alt="" aria-hidden="true" />
        <span className="template-text-label rect-quantity-caption">{ui('Кількість')}</span>
        <TemplateInput x={358} y={54} value={detail.width} onChange={(width) => updateDetail({ width })} />
        <TemplateInput x={219} y={154} value={detail.height} onChange={(height) => updateDetail({ height })} />
        <TemplateInput x={620} y={145} width={58} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />
      </div>
    </div>
  );
}
