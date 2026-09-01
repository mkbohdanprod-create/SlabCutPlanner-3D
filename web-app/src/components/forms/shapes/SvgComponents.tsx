import React from 'react';
import { Target, Move } from 'lucide-react';
import { useCommittedNumber } from '../../ui/useCommittedNumber';

export function CornerMarker({ x, y, id, onClick }: { x: number; y: number; id: string; onClick: (id: string, e: React.MouseEvent) => void }) {
  return (
    <button
      className="absolute flex items-center justify-center w-[18px] h-[18px] bg-[#899cae] text-white rounded-[2px] opacity-90 hover:opacity-100 hover:bg-[#1f93ef] transition-colors z-20 cursor-pointer shadow-sm border border-white"
      style={{ left: x - 9, top: y - 9 }}
      onClick={(e) => onClick(id, e)}
      title="Обробка кута"
    >
      <span className="font-bold text-lg leading-none mt-[-2px]">+</span>
    </button>
  );
}
export function SvgInput({ x, y, value, onChange, width = 68, height = 38, className = '' }: { x: number; y: number; value: number; onChange: (value: number) => void; width?: number; height?: number; className?: string }) {
  const digits = String(Math.round(Math.abs(value))).length;
  const actualWidth = Math.max(width, Math.min(96, 42 + digits * 10));
  const actualX = x - (actualWidth - width) / 2;
  // Розмір застосовується на Enter / втраті фокуса, а не на кожну цифру:
  // інакше «600» не набрати — після першої «6» число вже пішло в модель.
  const field = useCommittedNumber(value, onChange);
  return (
    <foreignObject x={actualX} y={y} width={actualWidth} height={height}>
      <div className={`scheme-input-wrap ${className}`}>
        <input type="number" {...field} />
      </div>
    </foreignObject>
  );
}

export function SvgSide({ x, y, side, active, onClick }: { x: number; y: number; side: string; active: boolean; onClick: () => void }) {
  return (
    <foreignObject x={x} y={y} width={42} height={42}>
      <div className="scheme-side-wrap">
        <button type="button" className={active ? 'active' : ''} onClick={onClick}>{side}</button>
      </div>
    </foreignObject>
  );
}

export function SvgQuantity({ x, y, value, onChange, label = 'Кількість' }: { x: number; y: number; value: number; onChange: (value: number) => void; label?: string }) {
  return (
    <>
      <text className="scheme-caption" x={x} y={y}>{label}</text>
      <SvgInput x={x} y={y + 18} width={72} height={42} value={value} onChange={onChange} />
    </>
  );
}

export function SvgCheck({ x, y, label, checked, onChange }: { x: number; y: number; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const actualX = x >= 340 ? x + 78 : x;
  return (
    <foreignObject x={actualX} y={y} width={178} height={28}>
      <label className="scheme-check">
        <span>{label}</span>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      </label>
    </foreignObject>
  );
}

export function TemplateInput({ x, y, value, onChange, width = 64 }: { x: number; y: number; value: number; onChange: (value: number) => void; width?: number }) {
  return (
    <input
      className="u-template-input"
      style={{ left: x, top: y, width }}
      type="number"
      value={Math.round(value)}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

export function TemplateSide({ x, y, side, active, onClick }: { x: number; y: number; side: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={active ? 'u-template-side active' : 'u-template-side'}
      style={{ left: x, top: y }}
      onClick={onClick}
    >
      {side}
    </button>
  );
}

export function TemplateCheck({ x, y, label, checked, onChange }: { x: number; y: number; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="u-template-check" style={{ left: x, top: y }}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export function ArrowDefs() {
  return (
    <defs>
      <marker id="arrow-start" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto">
        <path d="M6 0 L0 3 L6 6" />
      </marker>
      <marker id="arrow-end" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0 0 L6 3 L0 6" />
      </marker>
    </defs>
  );
}

