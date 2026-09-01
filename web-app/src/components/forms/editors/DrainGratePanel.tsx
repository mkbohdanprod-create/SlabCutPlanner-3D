import { Plus, Trash2, AlertTriangle, Info } from 'lucide-react';
import type { DrainGrate } from '../../../domain/types';
import { validateDrainGrate, defaultDrainGrate, grateCutLengthMm } from '../../../engines/drainGrate';

/**
 * РЕШІТКА ЗЛИВУ — водоструменевий різ у дні мийки (28.08.2026).
 *
 * Прев'ю малюється тим самим правилом, що й різаки в 3D
 * (engines/drainGrate): менеджер бачить рівно те, що поїде на верстат.
 *
 * Перемичка — не декор, а конструктив: без неї середина кільця випала б.
 * Тому «Перемичка» стоїть поруч зі «Скручуванням» і має свою перевірку.
 */

function NumberField({ label, value, onChange, suffix = 'мм', min = 0, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  suffix?: string; min?: number; step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <div className="relative">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full pr-8 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:border-[#0084ff] focus:outline-none"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 pointer-events-none">{suffix}</span>
      </div>
    </label>
  );
}

/** Те саме, що ріже верстат: дуги з перемичками, зміщеними по спіралі. */
function GratePreview({ grate, size = 150 }: { grate: DrainGrate; size?: number }) {
  const paths: string[] = [];
  const scale = size / Math.max(1, grate.outerDiameter + grate.slotWidth * 2);
  const c = size / 2;

  for (let ring = 0; ring < grate.rings; ring += 1) {
    const r = (grate.outerDiameter / 2 - ring * grate.ringGap) * scale;
    if (r <= 0) continue;
    const step = 360 / Math.max(1, grate.segmentsPerRing);
    const twist = ring * grate.twistDeg;
    for (let seg = 0; seg < grate.segmentsPerRing; seg += 1) {
      const a0 = ((twist + seg * step + grate.bridgeDeg / 2) * Math.PI) / 180;
      const a1 = ((twist + (seg + 1) * step - grate.bridgeDeg / 2) * Math.PI) / 180;
      if (a1 <= a0) continue;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      paths.push(
        `M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}`,
      );
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <rect width={size} height={size} rx={6} fill="#f4f8fb" />
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#35556b" strokeWidth={Math.max(1.2, grate.slotWidth * scale)} strokeLinecap="butt" />
      ))}
    </svg>
  );
}

export function DrainGratePanel({
  grate,
  bottomWidthMm,
  bottomHeightMm,
  onChange,
}: {
  grate: DrainGrate | undefined;
  bottomWidthMm: number;
  bottomHeightMm: number;
  onChange: (grate: DrainGrate | undefined) => void;
}) {
  if (!grate) {
    return (
      <div className="p-4 flex flex-col gap-3">
        <p className="text-sm text-slate-500 text-center">
          Решітка зливу — наскрізний водоструменевий різ у дні мийки:
          концентричні дуги з перемичками.
        </p>
        <button
          type="button"
          onClick={() => onChange(defaultDrainGrate())}
          className="self-center flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#0084ff] bg-white text-[#0084ff] text-sm font-bold hover:bg-[#f0f7ff]"
        >
          <Plus className="w-4 h-4" /> Додати решітку
        </button>
      </div>
    );
  }

  const issues = validateDrainGrate(grate, bottomWidthMm, bottomHeightMm);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const patch = (changes: Partial<DrainGrate>) => onChange({ ...grate, ...changes });

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className={`border rounded-lg overflow-hidden ${errors.length ? 'border-[#d38b80]' : 'border-slate-200'}`}>
        <header className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
          <input
            value={grate.label ?? ''}
            placeholder="Назва операції"
            onChange={(e) => patch({ label: e.target.value })}
            className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm font-semibold text-[#1f2d3a] focus:outline-none"
          />
          <span className="text-[11px] text-slate-500 whitespace-nowrap">Ø{grate.outerDiameter} мм</span>
          <button
            type="button"
            title="Прибрати решітку"
            onClick={() => onChange(undefined)}
            className="!bg-transparent !border-0 p-1 text-slate-400 hover:text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </header>

        <div className="p-3 flex gap-3">
          {/* Прев'ю малюється тією ж математикою, що й різ — те, що бачить
              менеджер, і те, що поїде на верстат, збігається. */}
          <GratePreview grate={grate} />

          <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
            <NumberField label="Діаметр" value={grate.outerDiameter}
              onChange={(outerDiameter) => patch({ outerDiameter })} />
            <NumberField label="Кілець" value={grate.rings} suffix="шт" min={1}
              onChange={(rings) => patch({ rings: Math.max(1, Math.round(rings)) })} />
            <NumberField label="Проріз (струмінь)" value={grate.slotWidth} step={0.5}
              onChange={(slotWidth) => patch({ slotWidth })} />
            <NumberField label="Крок кілець" value={grate.ringGap}
              onChange={(ringGap) => patch({ ringGap })} />
            <NumberField label="Дуг у кільці" value={grate.segmentsPerRing} suffix="шт" min={1}
              onChange={(segmentsPerRing) => patch({ segmentsPerRing: Math.max(1, Math.round(segmentsPerRing)) })} />
            <NumberField label="Перемичка" value={grate.bridgeDeg} suffix="°"
              onChange={(bridgeDeg) => patch({ bridgeDeg })} />
            <NumberField label="Скручування" value={grate.twistDeg} suffix="°"
              onChange={(twistDeg) => patch({ twistDeg })} />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Зсув X" value={grate.offsetX}
                onChange={(offsetX) => patch({ offsetX })} />
              <NumberField label="Зсув Y" value={grate.offsetY}
                onChange={(offsetY) => patch({ offsetY })} />
            </div>
          </div>
        </div>

        <div className="px-3 pb-3 flex flex-col gap-1.5">
          {!errors.length && (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Водоструменевий різ {(grateCutLengthMm(grate) / 1000).toFixed(2)} пог. м ·
              стінка між кільцями {(grate.ringGap - grate.slotWidth).toFixed(1)} мм
            </p>
          )}
          {errors.map((issue, i) => (
            <p key={`e${i}`} className="flex items-start gap-1.5 text-[11px] text-[#982f25] bg-[#fdeeec] border border-[#e7bdb6] rounded px-2 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{issue.message}</span>
            </p>
          ))}
          {warnings.map((issue, i) => (
            <p key={`w${i}`} className="flex items-start gap-1.5 text-[11px] text-[#7a5a2e] bg-[#fdf6e8] border border-[#e0b661] rounded px-2 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{issue.message}</span>
            </p>
          ))}
          {errors.length > 0 && (
            <p className="text-[11px] text-[#982f25] font-semibold">
              Наявними послугами цю обробку виконати неможливо. Зверніться до
              технолога, перш ніж робити пропозицію клієнту.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
