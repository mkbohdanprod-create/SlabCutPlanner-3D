import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { METAL_TEMPLATES, templateDefaults } from '../../domain/metalTemplates';
import type { MetalTemplate, MetalTemplateResult, TemplateParamValue } from '../../domain/metalTemplates';
import { metalChainPieces, metalChainWeightKg } from '../../domain/metalChain';
import { METAL_PROFILES, metalProfileById, DEFAULT_METAL_PROFILE_ID } from '../../domain/metalProfiles';
import type { ElementDefinition } from '../../domain/types';

/**
 * Шаблони металовиробів: вибір шаблона → параметри → жива промальовка →
 * «Застосувати» пише згенерований ланцюг у metalSegments базового профілю.
 *
 * Промальовка навмисно рахується через metalChainPieces — ту саму
 * черепашку, що живить 3D і розкрій: те, що бачиш у прев'ю, і є те,
 * що поїде в цех (§3 маніфесту — жодних других реалізацій).
 */

interface Props {
  /** Профіль базового відрізка (пояси/обв'язка) */
  initialProfileId: string;
  onApply: (result: MetalTemplateResult, profileId: string) => void;
  onClose: () => void;
}

/** Косокутна проєкція шматків ланцюга в SVG (вид спереду, глибина — навскіс) */
function TemplatePreviewSvg({ result, profileId }: { result: MetalTemplateResult; profileId: string }) {
  const pieces = useMemo(() => metalChainPieces({
    width: result.baseLength,
    metalProfileId: profileId,
    metalSegments: result.segments,
  } as Pick<ElementDefinition, 'width' | 'metalProfileId' | 'metalSegments'>), [result, profileId]);

  const view = useMemo(() => {
    // Косокутна проєкція: x' = x − 0.42·z, y' = −y − 0.21·z (Y екрана вниз)
    const project = (p: [number, number, number]): [number, number] => [p[0] - 0.42 * p[2], -p[1] - 0.21 * p[2]];
    const lines = pieces.map((piece) => {
      const end: [number, number, number] = [
        piece.start[0] + piece.dir[0] * piece.lengthMm,
        piece.start[1] + piece.dir[1] * piece.lengthMm,
        piece.start[2] + piece.dir[2] * piece.lengthMm,
      ];
      return { a: project(piece.start), b: project(end), h: metalProfileById(piece.profileId)?.h ?? 40 };
    });
    const xs = lines.flatMap((line) => [line.a[0], line.b[0]]);
    const ys = lines.flatMap((line) => [line.a[1], line.b[1]]);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const w = Math.max(1, maxX - minX); const h = Math.max(1, maxY - minY);
    const pad = Math.max(w, h) * 0.07;
    return { lines, viewBox: `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`, scale: Math.max(w, h) };
  }, [pieces]);

  return (
    <svg viewBox={view.viewBox} className="w-full h-56 bg-white border border-slate-200 rounded-sm">
      {view.lines.map((line, index) => (
        <line
          key={index}
          x1={line.a[0]} y1={line.a[1]} x2={line.b[0]} y2={line.b[1]}
          stroke="#5b6770"
          strokeWidth={Math.max(view.scale * 0.006, line.h * 0.9)}
          strokeLinecap="square"
          opacity={0.92}
        />
      ))}
    </svg>
  );
}

export function MetalTemplateModal({ initialProfileId, onApply, onClose }: Props) {
  const [templateId, setTemplateId] = useState(METAL_TEMPLATES[0].id);
  const template = METAL_TEMPLATES.find((item) => item.id === templateId) ?? METAL_TEMPLATES[0];
  const [valuesByTemplate, setValuesByTemplate] = useState<Record<string, Record<string, TemplateParamValue>>>(
    () => Object.fromEntries(METAL_TEMPLATES.map((item) => [item.id, templateDefaults(item)])),
  );
  const [profileId, setProfileId] = useState(initialProfileId || DEFAULT_METAL_PROFILE_ID);
  const values = valuesByTemplate[template.id];

  const setValue = (key: string, value: TemplateParamValue) =>
    setValuesByTemplate((prev) => ({ ...prev, [template.id]: { ...prev[template.id], [key]: value } }));

  const generated = useMemo<{ result: MetalTemplateResult | null; error: string | null }>(() => {
    try {
      return { result: template.generate(values), error: null };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [template, values]);

  const stats = useMemo(() => {
    if (!generated.result) return null;
    const def = {
      width: generated.result.baseLength,
      metalProfileId: profileId,
      metalSegments: generated.result.segments,
    } as Pick<ElementDefinition, 'width' | 'metalProfileId' | 'metalSegments'>;
    const pieces = metalChainPieces(def);
    const totalMm = pieces.reduce((sum, piece) => sum + piece.lengthMm, 0);
    return { count: pieces.length, totalM: totalMm / 1000, weight: metalChainWeightKg(def) };
  }, [generated, profileId]);

  const paramVisible = (key: string) => {
    const def = template.params.find((param) => param.key === key);
    if (!def?.visibleIf) return true;
    return Boolean(values[def.visibleIf]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-[#eaf4fc] rounded-md shadow-lg w-[720px] max-h-[92vh] overflow-y-auto border border-[#b8d4ee]">
        <div className="bg-[#3b82f6] px-4 py-3 flex justify-between items-center text-white sticky top-0 z-10">
          <h3 className="font-bold">Шаблони металовиробів</h3>
          <button onClick={onClose} className="hover:text-white/80 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            {METAL_TEMPLATES.map((item: MetalTemplate) => (
              <button
                key={item.id}
                onClick={() => setTemplateId(item.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-sm border transition-colors ${
                  item.id === template.id
                    ? 'bg-[#0084ff] text-white border-[#0084ff]'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-[#0084ff]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-600 -mt-2">{template.hint}</p>

          <div className="flex gap-4">
            {/* Параметри */}
            <div className="w-[260px] flex flex-col gap-2 shrink-0">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Основний профіль (обвʼязка/пояси)</label>
                <select
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className="border border-slate-300 rounded-sm h-8 px-2 bg-white text-sm"
                >
                  {METAL_PROFILES.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.label}</option>
                  ))}
                </select>
              </div>
              {template.params.filter((param) => paramVisible(param.key)).map((param) => (
                <div key={param.key} className="flex flex-col gap-1">
                  {param.type === 'boolean' ? (
                    <label className="flex items-center gap-2 text-sm text-slate-700 py-1">
                      <input
                        type="checkbox"
                        checked={Boolean(values[param.key])}
                        onChange={(e) => setValue(param.key, e.target.checked)}
                      />
                      {param.label}
                    </label>
                  ) : param.type === 'profile' ? (
                    <>
                      <label className="text-xs font-medium text-slate-600">{param.label}</label>
                      <select
                        value={String(values[param.key] ?? '')}
                        onChange={(e) => setValue(param.key, e.target.value)}
                        className="border border-slate-300 rounded-sm h-8 px-2 bg-white text-sm"
                      >
                        <option value="">Як основний</option>
                        {METAL_PROFILES.map((profile) => (
                          <option key={profile.id} value={profile.id}>{profile.label}</option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <label className="text-xs font-medium text-slate-600">{param.label}</label>
                      <input
                        type="number"
                        value={Number(values[param.key])}
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        onChange={(e) => setValue(param.key, Number(e.target.value))}
                        className="border border-slate-300 rounded-sm h-8 px-2 text-sm font-bold"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Промальовка + підсумок */}
            <div className="flex-1 flex flex-col gap-2">
              {generated.result ? (
                <TemplatePreviewSvg result={generated.result} profileId={profileId} />
              ) : (
                <div className="w-full h-56 flex items-center justify-center bg-white border border-red-200 rounded-sm text-xs text-red-600 px-4 text-center">
                  {generated.error}
                </div>
              )}
              {stats && (
                <div className="text-xs text-slate-600 bg-white border border-slate-200 rounded-sm px-3 py-2 flex flex-col gap-1">
                  <span>Відрізків на різ: <b>{stats.count}</b></span>
                  <span>Металу разом: <b>{stats.totalM.toFixed(2)} м</b> · Маса: <b>{stats.weight.toFixed(2)} кг</b></span>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-sm transition-colors">
              Скасувати
            </button>
            <button
              disabled={!generated.result}
              onClick={() => { if (generated.result) onApply(generated.result, profileId); }}
              className="px-4 py-2 text-sm font-bold text-white bg-[#0084ff] hover:bg-[#006fd6] rounded-sm transition-colors disabled:opacity-40"
            >
              Застосувати шаблон
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
