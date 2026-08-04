import type { DetailDraft } from '../../../domain/types';
import type { UiLanguage } from '../../../store/useDictionaryStore';
import {     TemplateInput,    CornerMarker } from './SvgComponents';
import { translateStaticUiText } from '../../../i18n';
import rectDetailTemplateSrc from '/src/assets/rect-detail-template.svg';

export function RectangleDesigner({ detail, updateDetail, activeSides, onSideClick, language, onCornerClick, onCutoutClick }: { detail: DetailDraft; updateDetail: (patch: Partial<DetailDraft>) => void; activeSides: Set<string>; onSideClick: (side: string) => void; language: UiLanguage; onCornerClick?: (cornerId: string, x: number, y: number) => void; onCutoutClick?: (cutoutId: string) => void }) {
  void activeSides;
  void onSideClick;
  const ui = (value: string) => translateStaticUiText(language, value);

  console.log("RECT SVG SRC:", rectDetailTemplateSrc);

  // Mapping of corners to SVG pixel coordinates
  const cornersSvgMap: Record<string, { x: number; y: number }> = {
    'DA': { x: 158, y: 35 },
    'AB': { x: 606, y: 35 },
    'BC': { x: 606, y: 232 },
    'CD': { x: 158, y: 232 }
  };

  return (
    <div className="schema reference-schema rect-reference rect-template-shell">
      <div className="rect-template" aria-label="Прямокутна схема розмірів">
        <img className="rect-template-image" src={rectDetailTemplateSrc} alt="" aria-hidden="true" />
        <span className="template-text-label rect-quantity-caption">{ui('Кількість')}</span>
        <TemplateInput x={358} y={54} value={detail.width} onChange={(width) => updateDetail({ width })} />
        <TemplateInput x={219} y={154} value={detail.height} onChange={(height) => updateDetail({ height })} />
        <TemplateInput x={620} y={145} width={58} value={detail.quantity} onChange={(quantity) => updateDetail({ quantity })} />
        
        {onCornerClick && (
          <>
            <CornerMarker id="DA" x={cornersSvgMap['DA'].x} y={cornersSvgMap['DA'].y} onClick={onCornerClick} />
            <CornerMarker id="AB" x={cornersSvgMap['AB'].x} y={cornersSvgMap['AB'].y} onClick={onCornerClick} />
            <CornerMarker id="BC" x={cornersSvgMap['BC'].x} y={cornersSvgMap['BC'].y} onClick={onCornerClick} />
            <CornerMarker id="CD" x={cornersSvgMap['CD'].x} y={cornersSvgMap['CD'].y} onClick={onCornerClick} />
          </>
        )}

        {detail.cutouts && Object.values(detail.cutouts).map(cutout => {
          const corner = cornersSvgMap[cutout.bindCorner];
          if (!corner) return null;
          
          let cx = corner.x;
          let cy = corner.y;
          
          const svgW = 448; // 606 - 158
          const svgH = 197; // 232 - 35
          
          const dx = (cutout.x / (detail.width || 1)) * svgW;
          const dy = (cutout.y / (detail.height || 1)) * svgH;

          if (cutout.bindCorner === 'DA') { cx += dx; cy += dy; }
          else if (cutout.bindCorner === 'AB') { cx -= dx; cy += dy; }
          else if (cutout.bindCorner === 'BC') { cx -= dx; cy -= dy; }
          else if (cutout.bindCorner === 'CD') { cx += dx; cy -= dy; }

          return (
            <div 
              key={cutout.id}
              className="absolute z-10 flex items-center justify-center border-2 border-[#1f93ef] bg-[#1f93ef]/20 cursor-pointer hover:bg-[#1f93ef]/40 transition-colors"
              style={{
                left: cx - 12,
                top: cy - 12,
                width: 24,
                height: 24,
                borderRadius: cutout.shape === 'circle' ? '50%' : '2px'
              }}
              onClick={() => onCutoutClick?.(cutout.id)}
              title={ui('Редагувати виріз')}
            />
          );
        })}
      </div>
    </div>
  );
}