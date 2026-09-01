import { useEffect, useMemo, useState } from 'react';
import { X, Search, Scissors, ChevronDown, ChevronRight } from 'lucide-react';
import type { EdgeProfileDef } from '../../domain/types';
import {
  EXECUTION_LABEL,
  edgeProfileClass,
  edgeProfileHint,
  groupEdgeProfiles,
  type EdgeProfileGroup,
} from '../../domain/edgeProfileClasses';
import { edgeProfileDrawingUrl } from '../../domain/edgeProfileDrawings';
import { edgeProfilesForMaterial } from '../../utils/edgeProfiles';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
import { useEdgeCatalog, type EdgeCatalogRequest } from '../../store/useEdgeCatalog';
import '../../styles/bottega.css';

/**
 * КАТАЛОГ КРОМОК — вибір форми торця картками з розрізами (01.09.2026).
 *
 * Запит власника: «зроби наш каталог кромок таким, як треба, красивим — у
 * програмі». Досі форма кромки обиралась із текстової випадачки на 70 пунктів,
 * а розріз існував лише в бланку погодження. Тут — сам каталог цеху: картка =
 * векторний розріз (edgeProfileDrawings.ts) + код + форма словами + контексти
 * (П С О М В) + спосіб виконання; групи ті самі, що у випадачках
 * (edgeProfileClasses.ts): універсальні → цей матеріал у товщині плити → цей
 * матеріал лише з потовщенням → операції → інші матеріали → спадок. Форми
 * інших матеріалів і спадок згорнуті, але доступні — рішення 26.08
 * «показувати все» не порушене.
 */

const CTX_LETTERS = ['П', 'С', 'О', 'М', 'В'] as const;
const CTX_TITLE: Record<string, string> = {
  П: 'плінтус / стінова панель',
  С: 'стільниця в базовій товщині',
  О: 'опуск / борт: потовщення на фанері, підклейка 33, борт 40',
  М: 'мийка — кромка над чашею',
  В: 'виріз під мийку (акрил)',
};
const EXEC_STYLE: Record<string, string> = {
  base: 'bt-tag-neutral',
  buildup: 'bt-tag-orange',
  both: 'bt-tag-sky',
};
const COLLAPSED_BY_DEFAULT = new Set(['other', 'legacy']);

function matches(profile: EdgeProfileDef, q: string): boolean {
  if (!q) return true;
  const cls = edgeProfileClass(profile.id);
  const hay = [profile.id, profile.label, profile.shortLabel, profile.description, cls.form, cls.catalogCode, cls.how]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

function ProfileCard({
  profile,
  selected,
  onPick,
}: {
  profile: EdgeProfileDef;
  selected: boolean;
  onPick: () => void;
}) {
  const cls = edgeProfileClass(profile.id);
  const url = edgeProfileDrawingUrl(profile.id);
  const ctx = new Set((cls.ctx ?? '').split(' ').filter(Boolean));
  const code = profile.shortLabel || profile.label;
  return (
    <button
      type="button"
      onClick={onPick}
      title={edgeProfileHint(profile.id)}
      className={`bt-card flex flex-col focus:outline-none ${selected ? 'is-selected' : ''}`}
    >
      <div className="bt-im">
        {url ? (
          <img src={url} alt="" className="max-h-[96px] max-w-[94%] object-contain" draggable={false} />
        ) : (
          <span className="text-[11px] text-slate-400 text-center px-2">розрізу в каталозі цеху нема</span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="bt-code-title">{code}</span>
        {cls.catalogCode && cls.catalogCode !== code && (
          <span className="bt-tag bt-tag-amber" title="Код у каталозі цеху — прив'язка не підтверджена">{cls.catalogCode}?</span>
        )}
      </div>
      <div className="bt-form">{cls.form ?? profile.description}</div>
      <div className="flex items-center gap-1 flex-wrap mt-1.5">
        {CTX_LETTERS.map((letter) => (
          <span key={letter} title={CTX_TITLE[letter]} className={`bt-chip ${ctx.has(letter) ? 'on' : ''}`}>{letter}</span>
        ))}
        <span className={`bt-tag bt-tag-lc ml-auto ${EXEC_STYLE[cls.execution]}`}>
          {cls.execution === 'buildup' ? 'лише з потовщенням' : cls.execution === 'both' ? 'товщина і потовщення' : 'у товщині плити'}
        </span>
      </div>
      <div className="text-[11px] text-slate-400 truncate mt-1.5" title={profile.id}>
        припуск {profile.allowance}
        {cls.kind === 'operation' ? ' · операція, не форма' : cls.kind === 'legacy' ? ' · спадок, у каталозі нема' : ''}
        <span className="bt-code" style={{ fontSize: 11, marginLeft: 6 }}>{profile.id}</span>
      </div>
    </button>
  );
}

function GroupSection({
  group,
  value,
  query,
  onPick,
}: {
  group: EdgeProfileGroup;
  value?: string | null;
  query: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(!COLLAPSED_BY_DEFAULT.has(group.key));
  const visible = useMemo(() => group.profiles.filter((p) => matches(p, query)), [group.profiles, query]);
  // пошук розгортає згорнуті групи — інакше знайдене не видно
  const expanded = open || Boolean(query);
  if (!visible.length) return null;
  return (
    <section className="mb-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="bt-group-h">
        {expanded ? <ChevronDown className="w-4 h-4 text-[#0084ff]" /> : <ChevronRight className="w-4 h-4 text-[#0084ff]" />}
        <span>{group.label}</span>
        <span className="bt-count">{visible.length}</span>
        {COLLAPSED_BY_DEFAULT.has(group.key) && !expanded && (
          <span className="ml-auto bt-tag bt-tag-blue">показати</span>
        )}
      </button>
      {expanded && (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {visible.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} selected={profile.id === value} onPick={() => onPick(profile.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

export function EdgeProfileCatalog({ request, onClose }: { request: EdgeCatalogRequest; onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const setIsEdgeProfileSettingsOpen = useUIStore((s) => s.setIsEdgeProfileSettingsOpen);
  const [query, setQuery] = useState('');
  const material = request.material ?? project.projectMaterial ?? null;
  const profiles = edgeProfilesForMaterial(project.referenceData?.edgeProfiles, material);
  const groups = useMemo(() => groupEdgeProfiles(profiles, material), [profiles, material]);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (id: string) => { request.onSelect(id); onClose(); };
  const current = request.value ? profiles.find((p) => p.id === request.value) : undefined;

  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4 font-sans" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[96vw] h-[94vh] flex flex-col overflow-hidden">
        <div className="px-6 pt-4 pb-3 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="bt-brand">Bottega <span>· Viyar Stone 3D · каталог цеху «Все кромки» 17.09.25</span></div>
              <h2 className="bt-h1 flex items-center gap-2"><Scissors className="w-5 h-5 text-[#0084ff]" /> Каталог кромок</h2>
              <div className="bt-sub">
                {request.title ? `${request.title} · ` : ''}
                {material ? `матеріал: ${material}` : 'матеріал не обрано — групи по кожному матеріалу'}
                {current ? ` · зараз: ${current.shortLabel || current.label}` : ''}
                {' '}· клік по картці обирає форму
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Пошук: ZS20, R3, фаска, bullnose…"
                  className="bt-input"
                  style={{ paddingLeft: 30, width: 300 }}
                />
              </label>
              <button type="button" onClick={onClose} className="bt-btn-ghost" title="Закрити (Esc)">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="bt-rule" />
        </div>

        <div className="mx-6 mb-2 bt-panel flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-slate-600 items-center">
          <span className="bt-k">Як читати</span>
          <span><span className="bt-chip on">П</span> <span className="bt-chip on">С</span> <span className="bt-chip on">О</span> <span className="bt-chip on">М</span> <span className="bt-chip on">В</span> — контексти з каталогу цеху: плінтус/стін. панель · стільниця в базовій товщині · опуск/борт (потовщення) · мийка · виріз під мийку</span>
          <span><span className="bt-tag bt-tag-neutral bt-tag-lc">{EXECUTION_LABEL.base}</span> <span className="bt-tag bt-tag-orange bt-tag-lc">{EXECUTION_LABEL.buildup}</span> <span className="bt-tag bt-tag-sky bt-tag-lc">{EXECUTION_LABEL.both}</span> — спосіб виконання</span>
          <span><span className="bt-tag bt-tag-amber">ZR20?</span> код каталогу, прив'язка не підтверджена цехом</span>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2 bg-white">
          {groups.map((group) => (
            <GroupSection key={`${group.key}:${group.label}`} group={group} value={request.value} query={q} onPick={pick} />
          ))}
          {q && !groups.some((g) => g.profiles.some((p) => matches(p, q))) && (
            <div className="text-sm text-slate-500 py-8 text-center">Нічого не знайдено за «{query}»</div>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-3 border-t border-[#e3e8ee] bg-white">
          {request.allowNone && (
            <button type="button" onClick={() => pick('')} className="bt-btn-ghost">Без кромки</button>
          )}
          <button type="button" onClick={() => { onClose(); setIsEdgeProfileSettingsOpen(true); }} className="bt-btn-ghost">
            Довідник: припуски і послуги
          </button>
          <span className="ml-auto text-[11px] text-slate-400 italic">Bottega · розрізи — з каталогу цеху «Все кромки» 17.09.25 · натуральний камінь поруч із кварцитом як гіпотеза</span>
        </div>
      </div>
    </div>
  );
}

/** Монтується один раз у App: показує каталог, коли хтось поклав запит у useEdgeCatalog. */
export function EdgeProfileCatalogHost() {
  const request = useEdgeCatalog((s) => s.request);
  const close = useEdgeCatalog((s) => s.close);
  if (!request) return null;
  return <EdgeProfileCatalog request={request} onClose={close} />;
}
