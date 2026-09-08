import { useEffect, useState } from 'react';
import { Link as LinkIcon, Unlink, Scissors, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { EdgeProfileType, EdgeProfileSelection, EdgeTreatment } from '../../../domain/types';
import { edgeProfilesForMaterial } from '../../../utils/edgeProfiles';
import { edgeToolOutMm } from '../../../domain/allowances';
import { useProjectStore } from '../../../store/useProjectStore';
import { useUIStore } from '../../../store/useStore';
import { normalizeEdgeTreatment, edgeTreatmentSpan } from '../../../domain/edgeTreatment';
import { useEdgeSourceSide, clickEdgeSideLetter } from '../../../store/useEdgeSourceSide';
import { CATALOG_OPTION_VALUE, EdgeProfileOptionGroups } from './EdgeProfileOptions';
import { EdgeProfileThumb } from './EdgeProfileThumb';
import { openEdgeCatalog } from '../../../store/useEdgeCatalog';
import '../../../styles/bottega.css';

/**
 * КРОМКИ (ОБРОБКА ТОРЦІВ) — ОКРЕМИЙ ТРЕЙ РЕДАКТОРА ВИРОБУ.
 *
 * Дві зміни проти старого вигляду (запит власника 10.08):
 *
 *  1. Кромка більше не воює з підворотом. Раніше вони жили в одній таблиці
 *     і вибивали одне одного, хоч у цеху на стороні спокійно буває і
 *     полірований торець, і підворот.
 *  2. Панель «Обробка торців» переїхала СЮДИ з карти крою. Там вона правила
 *     розміщення (`placement.edgeProfiles`) — тобто вже нарізану деталь, а
 *     не сам виріб: те саме налаштування доводилось повторювати на кожному
 *     розкладанні, і в бланк погодження воно не потрапляло. Тепер це
 *     властивість деталі й одразу йде в кошторис, креслення і КП.
 *
 * Звідси й повна модель: лицьове і тильне ребро окремо (два проходи фрези),
 * довжина не обов'язково на всю сторону, прив'язка з відступом, ручна
 * доводка. Читається все через `domain/edgeTreatment`.
 */
export function EdgeProfilesPanel({
  edgeProfiles,
  sides,
  sideLabels,
  sideLengths,
  blockedEdgeSides = [],
  occupiedSides,
  scope,
  material,
  onChange,
}: {
  edgeProfiles: EdgeProfileSelection;
  /**
   * Матеріал виробу (01.09: виріб має власний матеріал). Визначає порядок
   * груп у випадачці: чиї форми вгорі, а чиї — в «Інших матеріалах». Без
   * нього береться матеріал проєкту.
   */
  material?: string | null;
  sides: string[];
  /**
   * Показувані імена «технічних» сторін (Б-002): ребро Г-зарізу живе в
   * даних як `CD_lcut1`, а людині показується «D1»
   * (`domain/sideNaming.lcutEdgeLabels`). Немає в мапі — показуємо id.
   */
  sideLabels?: Record<string, string>;
  /** Довжина кожної сторони, мм — для «Факт. розмір» і затиску довільної ділянки. */
  sideLengths?: Record<string, number>;
  /** Сторони, зайняті прив'язаним елементом DXF — кромку туди не поставити. */
  blockedEdgeSides?: string[];
  /**
   * Сторони, закриті доповненням, що звисає з ребра (нога, потовщення,
   * підворот): сторона → підпис («Потовщення (A)»). Форму туди не обрати
   * (власник 01.09, тимчасово — див. domain/edgeOccupancy).
   */
  occupiedSides?: Record<string, string>;
  /** Id активної деталі — область дії взірця (useEdgeSourceSide). */
  scope?: string;
  onChange: (edgeProfiles: EdgeProfileSelection) => void;
}) {
  const blockedEdgeSet = new Set(blockedEdgeSides);
  const occupied = occupiedSides ?? {};
  /*
   * ВЗІРЕЦЬ (01.09, власник): клік по літері — сторона стає взірцем
   * (мініатюра зеленим), клік по інших літерах копіює на них усі
   * налаштування обробки. Повторний клік по взірцю або Esc — вихід.
   * Стан у спільному сховищі, бо ті самі літери є в 3D.
   */
  const sourceSide = useEdgeSourceSide((s) => (s.side && s.scope === (scope ?? null) ? s.side : null));
  const clearSource = useEdgeSourceSide((s) => s.clear);
  useEffect(() => () => clearSource(), [clearSource]);
  useEffect(() => {
    if (!sourceSide) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clearSource(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sourceSide, clearSource]);
  /*
   * 01.09, власник: «в дефолті лише по лицьовому ребру і на всю довжину, і
   * стрілочка-кнопка, яка розкриває розширені налаштування». Розширене
   * (тильне ребро, довільна ділянка, ручне доопрацювання) — за шевроном на
   * кожній стороні; те, що там задано, у згорнутому стані видно бейджами.
   */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const project = useProjectStore(s => s.project);
  const setIsEdgeProfileSettingsOpen = useUIStore(s => s.setIsEdgeProfileSettingsOpen);
  // Серія 12 — лише керамограніт, серія 20 — лише кварцит
  const groupMaterial = material ?? project.projectMaterial;
  const availableProfiles = edgeProfilesForMaterial(project.referenceData?.edgeProfiles, groupMaterial);

  // Дефолт — ОДНЕ лицьове ребро на всю довжину (власник 01.09: «дефолт по
  // 1 ребрі, типу ця кнопка виключена»). Зв'язка з тильним — свідомий клік.
  const treatmentOf = (side: string): EdgeTreatment =>
    normalizeEdgeTreatment(edgeProfiles[side]) ?? { isFullLength: true, linked: false };

  const patch = (side: string, updates: Partial<EdgeTreatment>) => {
    if (blockedEdgeSet.has(side)) return;
    const next: EdgeTreatment = { ...treatmentOf(side), ...updates };
    // Зв'язані ребра: тильне повторює лицьове, щоб у кошторисі було два
    // однакові проходи, а не один плюс порожнеча.
    if (next.linked && next.top) next.bottom = { ...next.top };

    const nextProfiles = { ...edgeProfiles };
    if (!next.top?.profileId && !next.bottom?.profileId) delete nextProfiles[side];
    else nextProfiles[side] = next;
    onChange(nextProfiles);
  };

  const onChipClick = (side: string) => clickEdgeSideLetter({
    side, scope, locked: blockedEdgeSet.has(side) || Boolean(occupied[side]), profiles: edgeProfiles, apply: onChange,
  });

  return (
    <section className="edge-panel">
      <div className="flex justify-between items-center w-full mb-2 gap-2">
        <span className="bt-k">Кромки</span>
        {sourceSide && (
          <span className="bt-tag bt-tag-green bt-tag-lc flex items-center gap-1" style={{ marginLeft: 'auto' }} title="Клік по іншій літері копіює обробку взірця на ту сторону. Esc — вийти">
            взірець {sideLabels?.[sourceSide] ?? sourceSide} · клік по літері копіює
            <button type="button" onClick={clearSource} title="Вийти з режиму взірця (Esc)" style={{ display: 'inline-flex', background: 'none', border: 'none', padding: 0, margin: 0, color: 'inherit', cursor: 'pointer' }}>
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
        <button type="button" onClick={() => setIsEdgeProfileSettingsOpen(true)} className="bt-btn-ghost" style={{ padding: '3px 10px', fontSize: 12 }}>
          <Scissors className="w-3.5 h-3.5" />
          Довідник
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {sides.map((side) => {
          const t = treatmentOf(side);
          // Показуване ім'я: для ребра Г-зарізу — «D1», для звичайної
          // сторони збігається з ключем даних.
          const sideLabel = sideLabels?.[side] ?? side;
          const blocked = blockedEdgeSet.has(side);
          const sideLength = sideLengths?.[side] ?? 0;
          const allowance = availableProfiles.find((p) => p.id === t.top?.profileId)?.allowance ?? 0;
          // Прев'ю: для м'яких матеріалів із нульовим припуском лишаємо 2 мм,
          // щоб довжина обробки не збігалась із повною стороною.
          const toolOut = edgeToolOutMm(project.projectMaterial, allowance, { softFallbackMm: 2 });
          const span = edgeTreatmentSpan(edgeProfiles[side], sideLength);
          const actualSize = Math.max(0, Math.round(span.to - span.from - toolOut));
          const hasAny = Boolean(t.top?.profileId || t.bottom?.profileId);
          // бейдж «тильне: …» — лише коли на тильному стоїть ІНША форма; порожнє тильне без зв'язки — норма
          const bottomDiffers = !t.linked && Boolean(t.bottom?.profileId) && t.bottom?.profileId !== t.top?.profileId;
          const partial = t.isFullLength === false;
          const isOpen = Boolean(expanded[side]);
          const labelOf = (id?: string) => availableProfiles.find((p) => p.id === id)?.shortLabel || id || 'без кромки';

          const occupiedBy = occupied[side];
          const isSource = sourceSide === side;
          const locked = blocked || Boolean(occupiedBy);
          const chipTitle = locked
            ? (occupiedBy ? `Торець закриває ${occupiedBy}` : 'На стороні вже є прив\'язаний елемент DXF')
            : isSource ? 'Взірець — клік знімає' : sourceSide ? `Скопіювати обробку зі сторони ${sideLabels?.[sourceSide] ?? sourceSide}` : 'Зробити взірцем: далі клік по інших літерах копіює обробку';

          return (
            <div key={side} className={`edge-side ${hasAny ? 'has-profile' : ''}`}>
              {/* Компактний рядок: сторона · розріз · лицьове ребро · каталог · розширені */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={`bt-chip ${hasAny ? 'on' : ''} ${isSource ? 'src' : ''} ${locked ? 'locked' : ''}`}
                  style={{ width: 24, height: 24, fontSize: 12, cursor: locked ? 'not-allowed' : sourceSide && !isSource ? 'copy' : 'pointer' }}
                  title={chipTitle}
                  aria-pressed={isSource}
                  onClick={() => onChipClick(side)}
                >
                  {sideLabel}
                </button>
                <span className={isSource ? 'edge-thumb-src' : ''} style={{ display: 'inline-flex' }}>
                  <EdgeProfileThumb profileId={t.top?.profileId} height={26} title={t.top?.profileId ?? 'без кромки'} />
                </span>
                <select
                  className="bt-input flex-1 min-w-0"
                  style={{ padding: '4px 6px', fontSize: 12, width: 'auto' }}
                  disabled={locked}
                  title={occupiedBy ? `Торець закриває ${occupiedBy} — форму тут не обрати` : blocked ? 'На стороні вже є прив\'язаний елемент DXF' : 'Лицьове ребро'}
                  value={t.top?.profileId ?? ''}
                  onChange={(e) => {
                    if (e.target.value === CATALOG_OPTION_VALUE) {
                      // Пункт «Каталог з розрізами…» — відкриваємо каталог, значення не міняємо
                      openEdgeCatalog({
                        title: `Сторона ${sideLabel} · лицьове ребро`,
                        material: groupMaterial,
                        value: t.top?.profileId,
                        allowNone: true,
                        onSelect: (id) => patch(side, { top: id ? { profileId: id as EdgeProfileType } : undefined }),
                      });
                      return;
                    }
                    patch(side, { top: e.target.value ? { profileId: e.target.value as EdgeProfileType } : undefined });
                  }}
                >
                  <option value="">Без кромки</option>
                  <EdgeProfileOptionGroups profiles={availableProfiles} material={groupMaterial} />
                </select>
                <button
                  type="button"
                  className={`bt-btn-ghost ${isOpen ? 'is-open' : ''}`}
                  style={{ padding: 4, borderRadius: 6, ...(isOpen ? { background: '#dbeafe', borderColor: '#b9d5f5', color: '#0058ab' } : {}) }}
                  disabled={Boolean(occupiedBy)}
                  title={occupiedBy ? `Торець закриває ${occupiedBy}` : isOpen ? 'Сховати розширені налаштування' : 'Розширені: тильне ребро, довільна ділянка, ручне доопрацювання'}
                  onClick={() => setExpanded((prev) => ({ ...prev, [side]: !isOpen }))}
                >
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {sideLength > 0 && (
                  <span className="text-[11px] text-slate-400 whitespace-nowrap w-14 text-right">{Math.round(sideLength)} мм</span>
                )}
              </div>

              {/* Сторона закрита доповненням: чому вимкнено, і що робити з формою, яка тут лишилась */}
              {occupiedBy && (
                <div className="flex flex-wrap items-center gap-1 mt-1 ml-8">
                  <span className="bt-tag bt-tag-amber bt-tag-lc" title="Нога, потовщення чи підворот закриває торець — фрезерувати тут нема чого">зайнято: {occupiedBy}</span>
                  {hasAny && (
                    <>
                      <span className="bt-tag bt-tag-red bt-tag-lc" title="Форма стояла до того, як сторону закрило доповнення">форма лишилась: {labelOf(t.top?.profileId ?? t.bottom?.profileId)}</span>
                      <button
                        type="button"
                        className="bt-btn-ghost"
                        style={{ padding: '1px 8px', fontSize: 11 }}
                        title="Прибрати обробку з цієї сторони"
                        onClick={() => { const next = { ...edgeProfiles }; delete next[side]; onChange(next); }}
                      >
                        прибрати
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Що сховано в розширених — видно і в згорнутому стані */}
              {!isOpen && !occupiedBy && (bottomDiffers || partial || t.manualFinish) && (
                <div className="flex flex-wrap gap-1 mt-1 ml-8">
                  {bottomDiffers && <span className="bt-tag bt-tag-sky bt-tag-lc">тильне: {labelOf(t.bottom?.profileId)}</span>}
                  {partial && <span className="bt-tag bt-tag-amber bt-tag-lc">довільна {actualSize} мм</span>}
                  {t.manualFinish && <span className="bt-tag bt-tag-neutral bt-tag-lc">ручне доопрацювання</span>}
                </div>
              )}

              {isOpen && !occupiedBy && (
                <div className="edge-side-more">
                  <div className="flex items-center gap-1.5">
                    <span className="bt-k" style={{ width: 96 }}>Тильне ребро</span>
                    <button
                      type="button"
                      className="bt-btn-ghost"
                      style={{ padding: 4, borderRadius: 6, ...(t.linked ? { background: '#dbeafe', borderColor: '#b9d5f5', color: '#0058ab' } : {}) }}
                      onClick={() => patch(side, { linked: !t.linked })}
                      title={t.linked ? 'Тильне повторює лицьове — відв\'язати' : 'Зв\'язати з лицьовим'}
                    >
                      {t.linked ? <LinkIcon className="w-3.5 h-3.5" /> : <Unlink className="w-3.5 h-3.5" />}
                    </button>
                    <select
                      className="bt-input flex-1 min-w-0"
                      style={{ padding: '4px 6px', fontSize: 12, width: 'auto' }}
                      value={(t.linked ? t.top?.profileId : t.bottom?.profileId) ?? ''}
                      disabled={t.linked || blocked}
                      title={t.linked ? 'Як лицьове' : 'Тильне ребро'}
                      onChange={(e) => {
                        if (e.target.value === CATALOG_OPTION_VALUE) {
                          openEdgeCatalog({
                            title: `Сторона ${sideLabel} · тильне ребро`,
                            material: groupMaterial,
                            value: t.bottom?.profileId,
                            allowNone: true,
                            onSelect: (id) => patch(side, { bottom: id ? { profileId: id as EdgeProfileType } : undefined }),
                          });
                          return;
                        }
                        patch(side, { bottom: e.target.value ? { profileId: e.target.value as EdgeProfileType } : undefined });
                      }}
                    >
                      <option value="">Без кромки</option>
                      <EdgeProfileOptionGroups profiles={availableProfiles} material={groupMaterial} />
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="bt-k" style={{ width: 96 }}>Довжина</span>
                    <div className="flex flex-1 bt-panel" style={{ padding: 2, gap: 2 }}>
                      <button
                        type="button"
                        className="flex-1 rounded"
                        style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px', lineHeight: 1.2, border: 'none', ...(t.isFullLength !== false ? { background: '#0084ff', color: '#fff' } : { background: 'transparent', color: '#55627a' }) }}
                        onClick={() => patch(side, { isFullLength: true })}
                      >
                        Вся довжина
                      </button>
                      <button
                        type="button"
                        className="flex-1 rounded"
                        style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px', lineHeight: 1.2, border: 'none', ...(partial ? { background: '#0084ff', color: '#fff' } : { background: 'transparent', color: '#55627a' }) }}
                        onClick={() => patch(side, { isFullLength: false, size: t.size || Math.round(sideLength) || undefined })}
                      >
                        Ділянка
                      </button>
                    </div>
                  </div>

                  {partial && (
                    <div className="grid grid-cols-2 gap-1.5 ml-[102px]">
                      <label className="flex flex-col gap-0.5">
                        <span className="bt-k" style={{ fontSize: 9 }}>Прив'язка</span>
                        <select
                          className="bt-input"
                          style={{ padding: '3px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
                          value={t.align || 'left'}
                          onChange={(e) => patch(side, { align: e.target.value as EdgeTreatment['align'] })}
                        >
                          <option value="left">Ліва</option>
                          <option value="center">Центр</option>
                          <option value="right">Права</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="bt-k" style={{ fontSize: 9 }}>Відступ, мм</span>
                        <input type="number" className="bt-input" style={{ padding: '3px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }} value={t.offset || 0} onChange={(e) => patch(side, { offset: Number(e.target.value) })} />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="bt-k" style={{ fontSize: 9 }}>Розмір, мм</span>
                        <input type="number" className="bt-input" style={{ padding: '3px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }} value={t.size ?? ''} placeholder="Довжина" onChange={(e) => patch(side, { size: Number(e.target.value) })} />
                      </label>
                      <div className="flex flex-col gap-0.5">
                        <span className="bt-k" style={{ fontSize: 9 }}>Факт.</span>
                        <span className="bt-code" style={{ padding: '4px 6px' }}>{actualSize} мм</span>
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer ml-[102px]">
                    <input
                      type="checkbox"
                      style={{ width: 14, height: 14, margin: 0 }}
                      checked={t.manualFinish || false}
                      onChange={(e) => patch(side, { manualFinish: e.target.checked })}
                    />
                    <span className="text-[12px] text-slate-700">Ручне доопрацювання</span>
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
