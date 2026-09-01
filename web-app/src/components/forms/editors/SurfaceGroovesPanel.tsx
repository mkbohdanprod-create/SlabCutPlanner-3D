import { useMemo } from 'react';
import { Plus, Trash2, AlertTriangle, Info, Waves, FileImage } from 'lucide-react';
import type { SurfaceGrooveGroup } from '../../../domain/types';
import { validateGrooveGroup, grooveTotalLengthMm, effectiveGrooveWidth } from '../../../engines/surfaceGrooves';
import { groovePresetsForMaterial, grooveGroupFromPreset, groovePresetById } from '../../../domain/grooveCatalog';

/**
 * ФРЕЗЕРУВАННЯ ПЛОЩИНИ — введення проточок для води і декоративних
 * канавок (28.08.2026, задача власника з реального кейсу: проточки під
 * стікання води біля врізної мийки).
 *
 * Панель свідомо мислить ГРУПАМИ, а не окремими канавками: у цеху їх
 * завжди роблять пачкою з однаковим кроком, і менеджер думає так само —
 * «шість штук через 50 мм». Один рядок форми = одна фрезерувальна
 * операція в бланку.
 *
 * Кожна група одразу проходить перевірку здійсненності
 * (engines/surfaceGrooves) і показує вердикт тут же, під полями: помилку
 * видно ДО того, як менеджер пообіцяв щось клієнту — рівно за правилом
 * із 03_КРОМКИ/ЛОГІКА_ОБРОБОК_І_ЗДІЙСНЕННОСТІ.md.
 */

const PROFILE_LABEL: Record<SurfaceGrooveGroup['profile'], string> = {
  round: 'Кругле дно (пальчикова)',
  vee: 'Клин (конічна)',
  flat: 'Плоске дно (кінцева)',
};

/** Типова проточка під мийку — те, з чого починається 90 % випадків. */
function defaultGroup(partWidthMm: number, partHeightMm: number): SurfaceGrooveGroup {
  const count = 5;
  const pitch = 50;
  const length = Math.min(400, Math.max(120, Math.round(partWidthMm * 0.3)));
  const spread = (count - 1) * pitch + 10;
  return {
    id: `groove_${Math.random().toString(36).slice(2, 8)}`,
    x: Math.max(0, Math.round((partWidthMm - length) / 2)),
    y: Math.max(0, Math.round((partHeightMm - spread) / 2)),
    direction: 'horizontal',
    count,
    pitch,
    length,
    width: 10,
    depth: 5,
    profile: 'round',
    face: 'top',
    label: 'Проточки для води',
  };
}

function NumberField({ label, value, onChange, suffix = 'мм', min = 0, step = 1 }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  step?: number;
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
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full pr-8 px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:border-[#0084ff] focus:outline-none"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 pointer-events-none">{suffix}</span>
      </div>
    </label>
  );
}

export function SurfaceGroovesPanel({
  groups,
  partWidthMm,
  partHeightMm,
  thicknessMm,
  material,
  onChange,
}: {
  groups: SurfaceGrooveGroup[] | undefined;
  partWidthMm: number;
  partHeightMm: number;
  thicknessMm: number;
  /** Матеріал проєкту — від нього залежать доступні пресети цеху */
  material?: string | null;
  onChange: (groups: SurfaceGrooveGroup[]) => void;
}) {
  const list = groups ?? [];

  const totalMm = useMemo(() => grooveTotalLengthMm(list), [list]);
  void groovePresetById;

  const patch = (id: string, changes: Partial<SurfaceGrooveGroup>) => {
    onChange(list.map((group) => (group.id === id ? { ...group, ...changes } : group)));
  };

  return (
    <div className="p-4 flex flex-col gap-3">
      {list.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-2">
          Фрезерування площини не на всю товщину: проточки для стікання води
          біля мийки, декоративні канавки на фасаді.
        </p>
      )}

      {list.map((group) => {
        const issues = validateGrooveGroup(group, partWidthMm, partHeightMm, thicknessMm);
        const errors = issues.filter((issue) => issue.level === 'error');
        const warnings = issues.filter((issue) => issue.level === 'warning');
        const floor = thicknessMm - group.depth;

        return (
          <section
            key={group.id}
            className={`border rounded-lg overflow-hidden ${errors.length ? 'border-[#d38b80]' : 'border-slate-200'}`}
          >
            <header className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
              <Waves className="w-4 h-4 text-[#0084ff] shrink-0" />
              <input
                value={group.label ?? ''}
                placeholder="Назва операції"
                onChange={(event) => patch(group.id, { label: event.target.value })}
                className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm font-semibold text-[#1f2d3a] focus:outline-none"
              />
              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                {group.presetId ? `${group.presetId} · ` : ''}{group.count} × {group.length} мм
              </span>
              {/* Креслення цеху для пресета — те саме, з якого взяті числа.
                  Менеджер бачить першоджерело, а не вірить полям на слово. */}
              {group.presetId && (
                <button
                  type="button"
                  title={`Відкрити креслення ${group.presetId}`}
                  onClick={() => window.open(`/drawings/grooves/${group.presetId}.png`, '_blank', 'noopener')}
                  className="!bg-transparent !border-0 p-1 text-slate-400 hover:text-[#0084ff]"
                >
                  <FileImage className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                title="Видалити групу"
                onClick={() => onChange(list.filter((item) => item.id !== group.id))}
                className="!bg-transparent !border-0 p-1 text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </header>

            <div className="p-3 grid grid-cols-3 gap-2">
              <NumberField label="Кількість" value={group.count} suffix="шт" min={1}
                onChange={(count) => patch(group.id, { count: Math.max(1, Math.round(count)) })} />
              <NumberField label="Крок (осі)" value={group.pitch}
                onChange={(pitch) => patch(group.id, { pitch })} />
              <NumberField label="Довжина" value={group.length}
                onChange={(length) => patch(group.id, { length })} />

              <NumberField label="Фреза (радіус)" value={group.cutterRadius ?? 0} suffix="R" step={0.5}
                onChange={(cutterRadius) => patch(group.id, { cutterRadius })} />
              <NumberField label="Глибина біля мийки" value={group.depth} step={0.5}
                onChange={(depth) => patch(group.id, { depth })} />
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">Напрямок</span>
                <select
                  value={group.direction}
                  onChange={(event) => patch(group.id, { direction: event.target.value as SurfaceGrooveGroup['direction'] })}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:border-[#0084ff] focus:outline-none"
                >
                  <option value="horizontal">Горизонтально</option>
                  <option value="vertical">Вертикально</option>
                </select>
              </label>

              <NumberField label="Глибина на краю" value={group.depthFar ?? group.depth} step={0.5}
                onChange={(depthFar) => patch(group.id, { depthFar })} />
              <NumberField label="Відступ зліва (X)" value={group.x}
                onChange={(x) => patch(group.id, { x })} />
              <NumberField label="Відступ зверху (Y)" value={group.y}
                onChange={(y) => patch(group.id, { y })} />
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">Фреза</span>
                <select
                  value={group.profile}
                  onChange={(event) => patch(group.id, { profile: event.target.value as SurfaceGrooveGroup['profile'] })}
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:border-[#0084ff] focus:outline-none"
                >
                  {(Object.keys(PROFILE_LABEL) as SurfaceGrooveGroup['profile'][]).map((key) => (
                    <option key={key} value={key}>{PROFILE_LABEL[key]}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="px-3 pb-3 flex flex-col gap-1.5">
              {/* Що лишається під дном — головне число для цеху */}
              {!errors.length && (
                <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  Слід фрези {effectiveGrooveWidth(group).toFixed(1)} мм · під дном {floor.toFixed(1)} мм каменю · {(group.count * group.length / 1000).toFixed(2)} пог. м
                </p>
              )}
              {errors.map((issue, index) => (
                <p key={`e${index}`} className="flex items-start gap-1.5 text-[11px] text-[#982f25] bg-[#fdeeec] border border-[#e7bdb6] rounded px-2 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>{issue.message}</span>
                </p>
              ))}
              {warnings.map((issue, index) => (
                <p key={`w${index}`} className="flex items-start gap-1.5 text-[11px] text-[#7a5a2e] bg-[#fdf6e8] border border-[#e0b661] rounded px-2 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>{issue.message}</span>
                </p>
              ))}
              {errors.length > 0 && (
                <p className="text-[11px] text-[#982f25] font-semibold">
                  Наявними послугами цю обробку виконати неможливо. Зверніться
                  до технолога, перш ніж робити пропозицію клієнту.
                </p>
              )}
            </div>
          </section>
        );
      })}

      {/* Каталог цеху — головний шлях: менеджер обирає КОД із креслення,
          а не вигадує числа. Ручний варіант лишається для нетипових. */}
      <div className="flex flex-col gap-2 pt-1 border-t border-slate-200">
        <span className="text-[11px] font-medium text-slate-500">Проточки з каталогу цеху</span>
        <div className="flex flex-wrap gap-1.5">
          {groovePresetsForMaterial(material).map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={`${preset.count} канавок · крок ${preset.pitch.toFixed(1)} мм · фреза R${preset.cutterRadius} · глибина ${preset.depthFar}→${preset.depthNear} мм`}
              onClick={() => onChange([...list, grooveGroupFromPreset(
                preset,
                Math.max(0, Math.round((partWidthMm - preset.length) / 2)),
                Math.max(0, Math.round((partHeightMm - (preset.count - 1) * preset.pitch) / 2)),
              )])}
              className="px-2 py-1 rounded border border-slate-300 bg-white text-[11px] font-semibold text-[#1f3342] hover:border-[#0084ff] hover:text-[#0084ff]"
            >
              {preset.id}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange([...list, defaultGroup(partWidthMm, partHeightMm)])}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-600 text-sm font-medium hover:border-[#0084ff] hover:text-[#0084ff]"
        >
          <Plus className="w-4 h-4" /> Нетипові
        </button>
        {totalMm > 0 && (
          <span className="text-[11px] text-slate-500">
            Разом: {(totalMm / 1000).toFixed(2)} пог. м фрезерування
          </span>
        )}
      </div>
    </div>
  );
}
