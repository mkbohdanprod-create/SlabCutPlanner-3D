import React, { ReactNode } from 'react';
import type { ShapeKind } from './draftHelpers';

export function DimInput({ value, onChange, className = '' }: { value: number; onChange: (value: number) => void; className?: string }) {
  return <input className={`schema-input ${className}`} type="number" value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value))} />;
}

export function QuantityInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="quantity-input">
      <label>Кількість</label>
      <input type="number" min={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function ShapeIcon({ kind }: { kind: ShapeKind }) {
  return (
    <svg viewBox="0 0 80 52" aria-hidden="true">
      {kind === 'rect' && <rect x="17" y="17" width="46" height="24" rx="2" />}
      {kind === 'circle' && <circle cx="40" cy="28" r="14" />}
      {kind === 'ellipse' && <ellipse cx="40" cy="28" rx="20" ry="12" />}
      {kind === 'l' && <path d="M18 14 H56 V26 H42 V39 H18 Z" />}
      {kind === 'u' && <path d="M17 14 H63 V39 H50 V25 H30 V39 H17 Z" />}
      {kind === 'sink_rect' && <><rect x="16" y="13" width="48" height="30" rx="3" /><circle cx="40" cy="28" r="5" /></>}
      {kind === 'sink_slot' && <><rect x="15" y="15" width="50" height="26" rx="3" /><rect x="25" y="24" width="30" height="8" rx="2" /></>}
    </svg>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label>{label}</label>{children}</div>;
}

