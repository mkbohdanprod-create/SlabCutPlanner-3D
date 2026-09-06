/**
 * Ручки розкладки — усе, що людина крутить: патерн, формат, шов, розбіжка,
 * кут, старт, зсув, бордюр, матеріал, запас. Одні й ті самі в редакторі
 * розкладки і в меню створення.
 */
import React from 'react';
import { DEFAULT_ARCH_MATERIALS, LAYOUT_PATTERN_LABELS, TILE_FORMATS, recommendedOffsetFraction, type LayoutPattern, type TileLayout } from '../../../domain/architecture';
import { Field, NumInput } from '../../../constructor/ui';

const PATTERNS: LayoutPattern[] = ['straight', 'brick', 'diagonal', 'herringbone', 'perimeter_center'];

/** Мініатюра патерну для картки вибору. */
export function PatternThumb({ pattern, active }: { pattern: LayoutPattern; active?: boolean }) {
  const s = active ? '#1f93ef' : '#64748b';
  const cells: React.ReactNode[] = [];
  if (pattern === 'straight' || pattern === 'brick') {
    for (let r = 0; r < 4; r += 1) for (let c = -1; c < 4; c += 1) {
      const shift = pattern === 'brick' && r % 2 ? 10 : 0;
      cells.push(<rect key={`${r}-${c}`} x={c * 20 + shift} y={r * 10} width={19} height={9} fill="none" stroke={s} strokeWidth={1} />);
    }
  } else if (pattern === 'diagonal') {
    for (let r = -2; r < 6; r += 1) for (let c = -2; c < 6; c += 1) {
      cells.push(<rect key={`${r}-${c}`} x={c * 14} y={r * 14} width={13} height={13} fill="none" stroke={s} strokeWidth={1} transform="rotate(45 30 20)" />);
    }
  } else if (pattern === 'herringbone') {
    for (let a = -3; a < 5; a += 1) for (let b = -3; b < 4; b += 1) {
      const x = a * 8 + b * 24; const y = a * 8 - b * 24;
      cells.push(<rect key={`h${a}-${b}`} x={x} y={y} width={23} height={7} fill="none" stroke={s} strokeWidth={1} transform="rotate(45 30 20)" />);
      cells.push(<rect key={`v${a}-${b}`} x={x + 24} y={y + 7 - 23} width={7} height={23} fill="none" stroke={s} strokeWidth={1} transform="rotate(45 30 20)" />);
    }
  } else {
    cells.push(<rect key="o" x={1} y={1} width={58} height={38} fill="none" stroke={s} strokeWidth={1.5} />);
    cells.push(<rect key="i" x={9} y={9} width={42} height={22} fill="none" stroke={s} strokeWidth={1} />);
    for (let c = 0; c < 4; c += 1) cells.push(<rect key={`c${c}`} x={9 + c * 10.5} y={9} width={10} height={22} fill="none" stroke={s} strokeWidth={0.7} />);
  }
  return (
    <svg viewBox="0 0 60 40" className="w-full h-10">
      <defs><clipPath id={`pt-${pattern}`}><rect x={0} y={0} width={60} height={40} /></clipPath></defs>
      <g clipPath={`url(#pt-${pattern})`}>{cells}</g>
    </svg>
  );
}

export function LayoutControls({ layout, onChange, compact = false }: { layout: TileLayout; onChange: (next: TileLayout) => void; compact?: boolean }) {
  const set = (p: Partial<TileLayout>) => onChange({ ...layout, ...p });
  const formatValue = TILE_FORMATS.find((f) => f.w === layout.tileW && f.h === layout.tileH) ? `${layout.tileW}x${layout.tileH}` : 'custom';
  const matValue = DEFAULT_ARCH_MATERIALS.find((m) => m.name === layout.material.name) ? layout.material.name : 'custom';
  const isPC = layout.pattern === 'perimeter_center';
  return (
    <div className={`flex flex-col gap-3 ${compact ? '' : ''}`}>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Патерн</div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          {PATTERNS.map((p) => (
            <button key={p} type="button" onClick={() => set({ pattern: p })} title={LAYOUT_PATTERN_LABELS[p]}
              className={`!p-1 rounded-md border-2 flex flex-col items-center gap-0.5 ${layout.pattern === p ? '!border-[#1f93ef] !bg-[#f0f7ff]' : '!border-slate-200 !bg-white hover:!border-slate-300'}`}>
              <PatternThumb pattern={p} active={layout.pattern === p} />
              <span className={`text-[10px] font-semibold leading-tight text-center ${layout.pattern === p ? 'text-[#1f93ef]' : 'text-slate-600'}`}>{LAYOUT_PATTERN_LABELS[p]}</span>
            </button>
          ))}
        </div>
      </div>
      {isPC && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Бордюр, мм" hint="Ширина смуги по периметру"><NumInput value={layout.borderMm} min={50} step={10} onChange={(v) => set({ borderMm: v })} /></Field>
          <Field label="Центр">
            <select value={layout.innerPattern} onChange={(e) => set({ innerPattern: e.target.value as TileLayout['innerPattern'] })} className="h-7 border border-slate-300 rounded px-1 text-[12px] bg-white w-32">
              {PATTERNS.filter((p) => p !== 'perimeter_center').map((p) => <option key={p} value={p}>{LAYOUT_PATTERN_LABELS[p]}</option>)}
            </select>
          </Field>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
        <Field label="Формат">
          <select value={formatValue} onChange={(e) => { const f = TILE_FORMATS.find((x) => `${x.w}x${x.h}` === e.target.value); if (f) set({ tileW: f.w, tileH: f.h, offsetFraction: recommendedOffsetFraction(f.w) }); }} className="h-7 border border-slate-300 rounded px-1 text-[12px] bg-white w-40">
            {TILE_FORMATS.map((f) => <option key={f.label} value={`${f.w}x${f.h}`}>{f.label}</option>)}
            <option value="custom">свій…</option>
          </select>
        </Field>
        <Field label="Шов, мм" hint="УМОВНО: підлога ≥ 2 мм, стіна 1–2 мм"><NumInput value={layout.jointMm} min={0} step={0.5} onChange={(v) => set({ jointMm: v })} /></Field>
        <Field label="Плитка, мм" hint="довжина × ширина (для ялинки — довга × коротка)">
          <span className="flex items-center gap-1">
            <NumInput value={layout.tileW} min={50} step={10} width="w-[72px]" onChange={(v) => set({ tileW: v })} /> ×
            <NumInput value={layout.tileH} min={50} step={10} width="w-[72px]" onChange={(v) => set({ tileH: v })} />
          </span>
        </Field>
        <Field label="Кут, °" hint="Поворот патерну; діагональ додає 45°"><NumInput value={layout.angleDeg} step={5} onChange={(v) => set({ angleDeg: v })} /></Field>
        {(layout.pattern === 'brick' || (isPC && layout.innerPattern === 'brick')) && (
          <Field label="Розбіжка" hint="РЗ-2: ½ до 900 мм, ⅓ для довшої плитки">
            <select value={String(layout.offsetFraction)} onChange={(e) => set({ offsetFraction: Number(e.target.value) })} className="h-7 border border-slate-300 rounded px-1 text-[12px] bg-white w-20">
              <option value="0.5">½</option><option value="0.3333333333333333">⅓</option><option value="0.25">¼</option>
            </select>
          </Field>
        )}
        <Field label="Старт" hint="РЗ-1: авто — однакові підрізи по протилежних краях, не вужчі за ⅓ плитки">
          <select value={layout.origin} onChange={(e) => set({ origin: e.target.value as TileLayout['origin'] })} className="h-7 border border-slate-300 rounded px-1 text-[12px] bg-white w-40">
            <option value="auto">авто (симетрія)</option><option value="corner">з кута</option><option value="center">з центру</option>
          </select>
        </Field>
        <Field label="Зсув, мм" hint="Зсув старту по X і Y">
          <span className="flex items-center gap-1">
            <NumInput value={layout.originShift.x} step={10} width="w-[72px]" onChange={(v) => set({ originShift: { ...layout.originShift, x: v } })} />
            <NumInput value={layout.originShift.y} step={10} width="w-[72px]" onChange={(v) => set({ originShift: { ...layout.originShift, y: v } })} />
          </span>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 border-t border-slate-200 pt-2">
        <Field label="Матеріал">
          <select value={matValue} onChange={(e) => { const m = DEFAULT_ARCH_MATERIALS.find((x) => x.name === e.target.value); if (m) set({ material: { ...m } }); }} className="h-7 border border-slate-300 rounded px-1 text-[12px] bg-white w-56">
            {DEFAULT_ARCH_MATERIALS.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            <option value="custom">свій…</option>
          </select>
        </Field>
        <Field label="Товщина, мм"><NumInput value={layout.material.thicknessMm} min={3} onChange={(v) => set({ material: { ...layout.material, thicknessMm: v } })} /></Field>
        <Field label="Вага, кг/м²" hint="УМОВНО: керамограніт 12 мм ≈ 30"><NumInput value={layout.material.kgPerM2} min={1} step={0.5} onChange={(v) => set({ material: { ...layout.material, kgPerM2: v } })} /></Field>
        <Field label="Лист, мм" hint="Формат листа постачальника; 0 — плитка і є лист">
          <span className="flex items-center gap-1">
            <NumInput value={layout.material.sheetW} min={0} step={10} width="w-[72px]" onChange={(v) => set({ material: { ...layout.material, sheetW: v } })} /> ×
            <NumInput value={layout.material.sheetH} min={0} step={10} width="w-[72px]" onChange={(v) => set({ material: { ...layout.material, sheetH: v } })} />
          </span>
        </Field>
        <Field label="Запас, %" hint="Порожньо — з норм за патерном (УМОВНО)">
          <input type="number" value={layout.wastePctOverride ?? ''} placeholder="норма" min={0} step={1} onChange={(e) => set({ wastePctOverride: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-20 h-7 px-2 text-right border border-slate-300 rounded text-[13px] bg-white" />
        </Field>
      </div>
    </div>
  );
}
