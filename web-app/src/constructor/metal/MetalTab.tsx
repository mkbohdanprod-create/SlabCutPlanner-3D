/**
 * ВКЛАДКА «К-Р МЕТАЛУ» — 04.09.2026.
 *
 * Метал у VS3D частково є (шаблони каркасів, ланцюг профілів, сортамент).
 * Тут — те саме ядро (`METAL_TEMPLATES`, `TurtleWriter`,
 * `metalChainPieces`) плюс новий шаблон з кейсів: плоска рама всередину
 * борту (МК-4: 100 = 12 + 76 + 12, рама 73, зазор 3). Спірні числа
 * (профіль, зазор, крок) — поля, не константи. Готовий каркас додається
 * окремим виробом (МК-1: окреме замовлення, власний штамп).
 */
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { METAL_TEMPLATES, TurtleWriter, templateDefaults, type MetalTemplate, type MetalTemplateResult, type TemplateParamValue } from '../../domain/metalTemplates';
import { METAL_PROFILES, metalProfileById } from '../../domain/metalProfiles';
import { metalChainPieces, metalChainWeightKg } from '../../domain/metalChain';
import { useProjectStore } from '../../store/useProjectStore';
import { useConstructorStore } from '../store';
import { buildProductFromSession } from '../../components/ui/ProductEditorWorkspace';
import { createDraft } from '../../components/forms/utils/draftHelpers';
import { BTN_GREEN, Field, NumInput, Panel, Tag, fmt } from '../ui';

/** МК-4: плоска рама всередині борту стільниці (кейс 81-2009298, аркуш 1). */
const FLAT_FRAME: MetalTemplate = {
  id: 'ctor_flat_frame',
  label: 'Плоска рама в борт (МК-4)',
  hint: 'Рама лягає всередину борту: зовнішній габарит = стільниця − 2×(кромка + зазор). Поперечки з кроком — СПІРНЕ (~380 vs ~640).',
  params: [
    { key: 'topW', label: 'Стільниця, довжина', type: 'number', default: 2400, min: 300, max: 6000, step: 10 },
    { key: 'topD', label: 'Стільниця, глибина', type: 'number', default: 600, min: 200, max: 2000, step: 10 },
    { key: 'edge', label: 'Товщина кромки/борту', type: 'number', default: 12, min: 0, max: 60, step: 1 },
    { key: 'gap', label: 'Зазор до борту (СПІРНЕ)', type: 'number', default: 3, min: 0, max: 40, step: 1 },
    { key: 'step', label: 'Крок поперечок (СПІРНЕ)', type: 'number', default: 380, min: 100, max: 1500, step: 10 },
  ],
  generate: (v) => {
    const n = (k: string, d: number) => { const x = Number(v[k]); return Number.isFinite(x) ? x : d; };
    const w = n('topW', 2400) - 2 * (n('edge', 12) + n('gap', 3));
    const d = n('topD', 600) - 2 * (n('edge', 12) + n('gap', 3));
    const t = new TurtleWriter();
    t.lineTo(w, 0, 0); t.lineTo(w, 0, d); t.lineTo(0, 0, d); t.lineTo(0, 0, 0);
    const step = Math.max(100, n('step', 380));
    const count = Math.max(0, Math.round(w / step) - 1);
    for (let i = 1; i <= count; i += 1) {
      const x = (w * i) / (count + 1);
      t.moveTo(x, 0, 0); t.lineTo(x, 0, d);
    }
    return t.result();
  },
};

const TEMPLATES: MetalTemplate[] = [FLAT_FRAME, ...METAL_TEMPLATES];

export function MetalTab() {
  const project = useProjectStore((s) => s.project);
  const addProduct = useProjectStore((s) => s.addProduct);
  const addDecision = useConstructorStore((s) => s.addDecision);
  const [tplId, setTplId] = useState(TEMPLATES[0].id);
  const tpl = TEMPLATES.find((t) => t.id === tplId) ?? TEMPLATES[0];
  const [values, setValues] = useState<Record<string, TemplateParamValue>>(() => templateDefaults(tpl));
  const [profileId, setProfileId] = useState('pr40x20');
  const [name, setName] = useState('Металокаркас');

  const selectTpl = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
    setTplId(t.id); setValues(templateDefaults(t));
  };

  const result: MetalTemplateResult | null = useMemo(() => { try { return tpl.generate(values); } catch { return null; } }, [tpl, values]);
  const def = useMemo(() => (result ? { width: result.baseLength, metalProfileId: profileId, metalSegments: result.segments } : null), [result, profileId]);
  const pieces = useMemo(() => (def ? metalChainPieces(def) : []), [def]);
  const weight = def ? metalChainWeightKg(def) : 0;
  const totalLen = pieces.reduce((a, p) => a + p.lengthMm, 0);

  const metalProducts = (project.products ?? []).filter((p) => p.elements.some((e) => (e.baseDefinition as { metalProfileId?: string }).metalProfileId));

  const add = () => {
    if (!result) return;
    const profile = metalProfileById(profileId);
    const productId = `metal_${Date.now().toString(36)}`;
    const mainDetail = {
      ...createDraft(),
      type: 'Довільний елемент' as const,
      kind: 'metal_profile' as const,
      width: result.baseLength,
      height: profile?.h ?? 40,
      thickness: profile?.w ?? 40,
      metalProfileId: profileId,
      metalSegments: result.segments,
    };
    const product = buildProductFromSession({ mainDetail: mainDetail as never, subDetails: {}, activeDetailId: 'main' }, productId, project.projectMaterial);
    addProduct({ ...product, name: name || tpl.label });
    addDecision({ tab: 'metal', what: `Додано каркас «${name}» за шаблоном «${tpl.label}», профіль ${profile?.label ?? profileId}, ${fmt(totalLen / 1000, 2)} м`, why: 'потрібен каркас під виріб (МК-10: проєктується на етапі КП)', rule: 'МК-1' });
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-[340px] shrink-0 border-r border-slate-200 bg-[#f7f9fb] p-3 overflow-y-auto custom-scrollbar flex flex-col gap-3">
        <Panel title="Шаблон">
          <select value={tplId} onChange={(e) => selectTpl(e.target.value)} className="w-full h-8 border border-slate-300 rounded px-2 text-[13px] bg-white">
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <p className="text-[11.5px] text-slate-500 mt-1 mb-2">{tpl.hint}</p>
          {tpl.params.filter((p) => !p.visibleIf || Boolean(values[p.visibleIf])).map((p) => (
            p.type === 'boolean' ? (
              <label key={p.key} className="flex items-center gap-2 text-[12.5px] text-slate-600 py-1">
                <input type="checkbox" className="!w-4 !h-4 shrink-0 !m-0" checked={Boolean(values[p.key])} onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.checked }))} /> {p.label}
              </label>
            ) : p.type === 'profile' ? (
              <Field key={p.key} label={p.label}>
                <select value={String(values[p.key] ?? '')} onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))} className="h-7 border border-slate-300 rounded px-1 text-[12px] bg-white w-40">
                  <option value="">як базовий</option>
                  {METAL_PROFILES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </Field>
            ) : (
              <Field key={p.key} label={p.label}><NumInput value={Number(values[p.key])} min={p.min} step={p.step} onChange={(v) => setValues((s) => ({ ...s, [p.key]: v }))} /></Field>
            )
          ))}
        </Panel>
        <Panel title="Профіль і виріб">
          <Field label="Базовий профіль" hint="СПІРНЕ: 30×20+20×10 vs 40×20×2 — у сортаменті є 40×20">
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="h-7 border border-slate-300 rounded px-1 text-[12px] bg-white w-40">
              {METAL_PROFILES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Назва виробу"><input value={name} onChange={(e) => setName(e.target.value)} className="h-7 border border-slate-300 rounded px-2 text-[12.5px] bg-white w-40" /></Field>
          <div className="text-[12px] text-slate-600 mt-1">Профілю: <b>{fmt(totalLen / 1000, 2)} м</b> · маса ≈ <b>{fmt(weight, 1)} кг</b> · відрізків: {pieces.length}</div>
          <button type="button" className={`${BTN_GREEN} mt-2 w-full justify-center`} onClick={add} disabled={!result}><Plus className="w-4 h-4" /> Додати як окремий виріб</button>
        </Panel>
        {metalProducts.length > 0 && (
          <Panel title="Каркаси в проєкті">
            <ul className="m-0 p-0 list-none space-y-1 text-[12.5px]">
              {metalProducts.map((p) => <li key={p.id} className="flex items-center gap-2"><span className="flex-1 truncate">{p.name}</span><Tag tone="blue">метал</Tag></li>)}
            </ul>
            <p className="text-[11.5px] text-slate-500 mt-2 mb-0">МК-1/МЕС-6: у документах піде окремим аркушем зі своїм штампом.</p>
          </Panel>
        )}
      </aside>
      <div className="flex-1 min-w-0 bg-white grid grid-rows-2">
        <ChainView pieces={pieces} plane="xz" title="План (X–Z)" />
        <ChainView pieces={pieces} plane="xy" title="Фронт (X–Y)" />
      </div>
    </div>
  );
}

function ChainView({ pieces, plane, title }: { pieces: ReturnType<typeof metalChainPieces>; plane: 'xz' | 'xy'; title: string }) {
  const segs = pieces.map((p) => {
    const a = plane === 'xz' ? { x: p.start[0], y: p.start[2] } : { x: p.start[0], y: -p.start[1] };
    const e = [p.start[0] + p.dir[0] * p.lengthMm, p.start[1] + p.dir[1] * p.lengthMm, p.start[2] + p.dir[2] * p.lengthMm];
    const b = plane === 'xz' ? { x: e[0], y: e[2] } : { x: e[0], y: -e[1] };
    return { a, b, w: metalProfileById(p.profileId)?.w ?? 40 };
  });
  const xs = segs.flatMap((s) => [s.a.x, s.b.x]); const ys = segs.flatMap((s) => [s.a.y, s.b.y]);
  const minX = Math.min(0, ...xs); const maxX = Math.max(100, ...xs); const minY = Math.min(0, ...ys); const maxY = Math.max(100, ...ys);
  const pad = Math.max(60, (maxX - minX) * 0.08);
  return (
    <div className="relative border-b border-slate-100 min-h-0">
      <div className="absolute left-3 top-2 text-[12px] font-semibold text-slate-500">{title}</div>
      <svg viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {segs.map((s, i) => (
          <g key={i}>
            <line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke="#7c3aed" strokeWidth={s.w} strokeLinecap="square" opacity={0.85} />
            {Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 1 && (
              <text x={(s.a.x + s.b.x) / 2} y={(s.a.y + s.b.y) / 2 - s.w} fontSize={Math.max(12, (maxX - minX) / 70)} textAnchor="middle" fill="#334155">{Math.round(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y))}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default MetalTab;
