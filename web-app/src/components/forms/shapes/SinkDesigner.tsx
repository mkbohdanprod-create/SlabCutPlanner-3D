import React from 'react';
import type { DetailDraft } from '../../../domain/types';
import type { UiLanguage } from '../../../store/useDictionaryStore';
import { SvgInput, SvgSide, SvgQuantity, SvgCheck, TemplateInput, TemplateSide, TemplateCheck, ArrowDefs } from './SvgComponents';
import type { ShapeKind } from '../utils/draftHelpers';

export function SinkDesigner({ detail, updateDetail }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void }) {
  const slot = detail.kind === 'sink_slot';
  return (
    <div className="schema reference-schema sink-reference">
      <svg viewBox="0 0 690 500" className="designer-scheme-svg">
        <ArrowDefs />
        <text className="scheme-caption centered" x="210" y="34">Вид спереду (розріз)</text>
        <text className="scheme-caption centered" x="514" y="34">Вид збоку (розріз)</text>
        <text className="scheme-caption centered" x="218" y="265">Вид зверху</text>
        <path className="scheme-part sink-section" d={slot ? 'M76 104 H352 L360 111 H69 Z M88 112 H338 V174 H88 Z M88 174 H338 V188 H88 Z' : 'M70 98 H344 L350 105 H64 Z M86 106 H330 V190 H86 Z M86 190 H330 V204 H86 Z'} />
        <path className="scheme-part sink-section" d={slot ? 'M420 104 H644 L650 111 H414 Z M431 112 H631 V174 L455 174 L431 188 Z' : 'M420 98 H640 L646 105 H414 Z M431 106 H629 V190 H431 Z M431 190 H629 V204 H431 Z'} />
        <rect className="scheme-part" x="92" y="315" width={slot ? 280 : 260} height={slot ? 150 : 170} />
        {slot ? <rect className="scheme-part inner" x="112" y="337" width="240" height="34" /> : <><rect className="scheme-part inner" x="104" y="328" width="236" height="144" /><line className="scheme-dim" x1="104" y1="328" x2="340" y2="472" /><line className="scheme-dim" x1="340" y1="328" x2="104" y2="472" /><circle className="scheme-part inner" cx="222" cy="400" r="25" /></>}
        <line className="scheme-arrow" x1="92" y1="78" x2={slot ? 352 : 344} y2="78" />
        <line className="scheme-arrow" x1="420" y1="78" x2={slot ? 644 : 640} y2="78" />
        <line className="scheme-arrow" x1="42" y1="112" x2="42" y2={slot ? 188 : 204} />
        <line className="scheme-arrow" x1="660" y1="112" x2="660" y2={slot ? 188 : 204} />
        <line className="scheme-arrow" x1="92" y1="484" x2={slot ? 372 : 352} y2="484" />
        <line className="scheme-arrow" x1="34" y1="315" x2="34" y2={slot ? 465 : 485} />
        <SvgInput x={slot ? 192 : 188} y={58} value={detail.width} onChange={(width) => updateDetail({ width })} />
        <SvgInput x={slot ? 502 : 492} y={58} value={detail.height} onChange={(height) => updateDetail({ height })} />
        <SvgInput x={slot ? 14 : 8} y={slot ? 128 : 130} value={detail.innerVertical} onChange={(innerVertical) => updateDetail({ innerVertical })} />
        <SvgInput x={slot ? 630 : 626} y={slot ? 128 : 130} value={detail.innerVertical} onChange={(innerVertical) => updateDetail({ innerVertical })} />
        <SvgInput x={slot ? 188 : 188} y={466} value={detail.width} onChange={(width) => updateDetail({ width })} />
        <SvgInput x={slot ? 4 : 0} y={slot ? 378 : 384} value={detail.height} onChange={(height) => updateDetail({ height })} />
        <SvgQuantity x={500} y={350} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />
      </svg>
    </div>
  );
}
