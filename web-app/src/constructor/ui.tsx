/**
 * Дрібні спільні елементи вкладок конструктора — 04.09.2026.
 * Глобальний стиль `<button>` (global.css) б'є звичайні Tailwind-класи,
 * тому кольорові кнопки — з `!`-префіксом (як у Студії).
 */
import React from 'react';
import { useUIStore } from '../store/useStore';

export const BTN = 'inline-flex items-center justify-center gap-1.5 min-h-8 !py-1 !px-3 rounded-md text-[13px] leading-tight font-medium border shadow-sm transition-colors whitespace-nowrap';
export const BTN_IDLE = `${BTN} !bg-white !text-slate-700 !border-slate-300 hover:!bg-slate-50`;
export const BTN_BLUE = `${BTN} !bg-[#1f93ef] !text-white !border-[#1f93ef] hover:!bg-[#1a7fd0]`;
export const BTN_GREEN = `${BTN} !bg-[#22a06b] !text-white !border-[#22a06b] hover:!bg-[#1c8a5b]`;

export function Panel({ title, children, className = '', right }: { title?: React.ReactNode; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={`bg-white rounded-lg border border-slate-200 shadow-sm ${className}`}>
      {title && (
        <header className="flex items-center justify-between px-3 h-9 border-b border-slate-200">
          <h3 className="text-[13px] font-bold text-slate-700 m-0">{title}</h3>
          {right}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[12.5px] text-slate-600 py-1" title={hint}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function NumInput({ value, onChange, min, step = 1, width = 'w-20' }: { value: number; onChange: (v: number) => void; min?: number; step?: number; width?: string }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      step={step}
      onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }}
      className={`${width} h-7 px-2 text-right border border-slate-300 rounded text-[13px] bg-white`}
    />
  );
}

export function Tag({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' }) {
  const cls = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-rose-100 text-rose-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-sky-100 text-sky-700',
  }[tone];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

/** Порожній стан вкладки: що зробити, щоб тут щось з'явилось. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center text-slate-500 text-[14px] text-center p-8">
      <div className="max-w-md">{children}</div>
    </div>
  );
}

export const fmt = (v: number | undefined, d = 1) => (v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));

/**
 * КНОПКА «i» — довідка по інструменту (07.09.2026, №128, прохання власника
 * «добав тут значок і — з поясненнями, як воно працює»). Та сама, що в
 * панелях редактора виробу (`Accordion info=`): відкриває бібліотеку
 * інструкцій одразу на потрібному розділі.
 */
export function HelpDot({ section, title = 'Як користуватись цим інструментом' }: { section: string; title?: string }) {
  const openHelp = useUIStore((s) => s.openHelp);
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="w-5 h-5 shrink-0 rounded-full border border-[#b9d5f5] !bg-[#dbeafe] !text-[#0058ab] text-[11px] font-bold flex items-center justify-center hover:!bg-[#0084ff] hover:!text-white transition-colors !p-0 !min-h-0"
      onClick={(e) => { e.stopPropagation(); openHelp(section); }}
    >
      i
    </button>
  );
}
