import type { DetailDraft } from '../../../domain/types';
import type { UiLanguage } from '../../../store/useDictionaryStore';
import {     TemplateInput,  TemplateCheck} from './SvgComponents';
import { translateStaticUiText } from '../../../i18n';
import lDetailTemplateSrc from '/src/assets/l-detail-template.svg';
import { setShapeJoint, shapeJointDirection } from '../../../domain/joints';

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
        <TemplateCheck x={520} y={278} label="Ліва (дзеркально)" checked={Boolean(detail.mirrorL)} onChange={(checked) => updateDetail({ mirrorL: checked || undefined })} />
        {/* Стики Г-форми — це звичайні довільні стики (03.09.2026).
            Раніше вони жили окремим полем `jointDirection`, якого не було
            видно в панелі «Стики»: користувач бачив на моделі лінію, не міг
            її прибрати і ставив свою — звідси «стик один, ліній дві».
            Тепер прапорець створює довільний стик зі стабільним id, тож він
            і в панелі видимий, і знімається тим самим прапорцем. */}
        <TemplateCheck x={520} y={306} label="Стик вертикальний" checked={shapeJointDirection(detail.manualJoints, 'corner') === 'vertical'} onChange={(checked) => updateDetail({ manualJoints: setShapeJoint(detail.manualJoints, 'corner', checked ? 'vertical' : undefined, detail), jointDirection: undefined })} />
        <TemplateCheck x={520} y={334} label="Стик горизонтальний" checked={shapeJointDirection(detail.manualJoints, 'corner') === 'horizontal'} onChange={(checked) => updateDetail({ manualJoints: setShapeJoint(detail.manualJoints, 'corner', checked ? 'horizontal' : undefined, detail), jointDirection: undefined })} />
      </div>
    </div>
  );
}
