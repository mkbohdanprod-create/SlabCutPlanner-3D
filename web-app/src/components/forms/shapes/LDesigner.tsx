import React from 'react';
import type { DetailDraft } from '../../../domain/types';
import type { UiLanguage } from '../../../store/useDictionaryStore';
import { SvgInput, SvgSide, SvgQuantity, SvgCheck, TemplateInput, TemplateSide, TemplateCheck, ArrowDefs } from './SvgComponents';
import type { ShapeKind } from '../utils/draftHelpers';
import { translateStaticUiText } from '../../../i18n';
const lDetailTemplateSrc = new URL('../../../assets/l-detail-template.svg', import.meta.url).href;

export function LDesigner({ detail, updateDetail, activeSides, onSideClick, language }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; activeSides: Set<string>; onSideClick: (side: string) => void; language: UiLanguage }) {
  const ui = (value: string) => translateStaticUiText(language, value);
  return (
    <div className="schema reference-schema l-reference l-template-shell">
      <div className="l-template" aria-label="Г-подібна схема розмірів">
        <img className="l-template-image" src={lDetailTemplateSrc} alt="" aria-hidden="true" />
        <span className="template-text-label l-quantity-caption">{ui('Кількість')}</span>
        <TemplateInput x={306} y={40} value={detail.outerWidth} onChange={(outerWidth) => updateDetail({ outerWidth })} />
        <TemplateInput x={118} y={206} value={detail.outerHeight} onChange={(outerHeight) => updateDetail({ outerHeight })} />
        <TemplateInput x={492} y={128} value={Math.max(detail.outerHeight - detail.innerVertical, 1)} onChange={(value) => updateDetail({ innerVertical: Math.max(detail.outerHeight - value, 1) })} />
        <TemplateInput x={395} y={206} value={Math.max(detail.outerWidth - detail.innerHorizontal, 1)} onChange={(value) => updateDetail({ innerHorizontal: Math.max(detail.outerWidth - value, 1) })} />
        <TemplateInput x={366} y={254} value={detail.innerVertical} onChange={(innerVertical) => updateDetail({ innerVertical })} />
        <TemplateInput x={244} y={352} value={detail.innerHorizontal} onChange={(innerHorizontal) => updateDetail({ innerHorizontal })} />
        <TemplateInput x={585} y={255} width={58} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />
        <TemplateCheck x={520} y={306} label="Стик вертикальний" checked={detail.jointVertical} onChange={(jointVertical) => updateDetail({ jointVertical })} />
        <TemplateCheck x={520} y={334} label="Стик горизонтальний" checked={detail.jointHorizontal} onChange={(jointHorizontal) => updateDetail({ jointHorizontal })} />
      </div>
    </div>
  );
}
