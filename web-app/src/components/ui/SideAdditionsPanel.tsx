import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { DetailDraft } from '../forms/utils/draftHelpers';
import { parseAdditionSlot } from '../../domain/ids';
import type { EdgeAdditionKind } from './EdgeAdditionModal';
import { EDGE_KIND_LABEL } from '../../domain/ids';

/**
 * ТРЕЙ «СТОРОНИ»: ЛИШЕ ДОПОВНЕННЯ — БОРТИКИ, ПОТОВЩЕННЯ, ПІДВОРОТИ.
 *
 * Кромки виїхали в окрему панель (`EdgeProfilesPanel`), бо кромка і
 * підворот на одній стороні — нормальна виробнича ситуація, а стара
 * спільна таблиця їх взаємовиключала.
 *
 * Кожен рядок — сторона деталі; на ній список уже доданих доповнень
 * (клік — редагувати в модалці, хрестик — прибрати) і «+» з вибором типу.
 * На одній стороні доповнень може бути кілька — слоти з суфіксом #2, #3…
 *
 * Джерела списку два, і це важливо для сумісності зі старими виробами:
 *  · слоти в subDetails (нові, з шириною і відступом);
 *  · легасі-галочки fold/thickening на самій деталі («на всю сторону») —
 *    показуються такими ж чипами; редагування переносить їх у слот.
 */

/**
 * ХВИЛЯ 4, крок 4.3 (FG-15). Панель і нога тепер теж чипи в треї: доти
 * їх було видно лише в 3D, а на одному ребрі вони існували в однині —
 * друге додавання мовчки перезаписувало перше. Щоб поставити «панель |
 * вікно | панель» на одну сторону, обидві мають бути видимі й окремо
 * редаговані.
 */
export type SideAdditionKind = EdgeAdditionKind | 'skirting' | 'wall_panel' | 'leg';

export interface SideAdditionEntry {
  kind: SideAdditionKind;
  sideId: string;
  /** Слот у subDetails; немає — це легасі-галочка без збереженого драфта. */
  slot?: string;
  /** Породжено легасі-галочкою на деталі, а не модалкою. */
  legacy?: boolean;
  /** Підпис чипа: тип + висота. */
  label: string;
}

const KIND_LABEL: Record<SideAdditionKind, string> = {
  skirting: 'Бортик',
  wall_panel: 'Панель',
  leg: 'Опора',
  ...EDGE_KIND_LABEL,
};

const KIND_COLOR: Record<SideAdditionKind, string> = {
  skirting: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  thickening: 'bg-amber-50 border-amber-300 text-amber-800',
  fold: 'bg-sky-50 border-sky-300 text-sky-800',
  wall_panel: 'bg-violet-50 border-violet-300 text-violet-800',
  leg: 'bg-slate-100 border-slate-300 text-slate-700',
};

/** Типи, які трей показує і вміє редагувати. */
const CHIP_KINDS: SideAdditionKind[] = ['skirting', 'thickening', 'fold', 'wall_panel', 'leg'];

/** Типова висота — щоб чип не писав «undefined» на щойно створеній деталі. */
const DEFAULT_HEIGHT: Record<SideAdditionKind, number> = {
  skirting: 50, thickening: 40, fold: 100, wall_panel: 600, leg: 900,
};

export function collectSideAdditions(
  ownerDetail: DetailDraft,
  subDetails: Record<string, DetailDraft>,
  sides: string[],
  /**
   * Слот власника, якщо він сам є доповненням (`leg_B`, `wall_panel_A`).
   * Порожньо — власник це головна деталь.
   *
   * ХВИЛЯ 4, крок 4.1. Раніше тут стояв прапорець `fullSideOnly`, і на
   * доповненні панель показувала ЛИШЕ легасі-галочки: слоти другого рівня
   * (`leg_B_fold_C`) відфільтровувались як «чужі». Тепер префікс каже, чиї
   * саме слоти показувати, і другий рівень нічим не бідніший за перший —
   * з шириною, відступом і власним чипом.
   */
  ownerSlot?: string,
): Record<string, SideAdditionEntry[]> {
  const bySide: Record<string, SideAdditionEntry[]> = Object.fromEntries(sides.map((s) => [s, []]));
  const prefix = ownerSlot ? `${ownerSlot}_` : '';

  // Легасі-галочки: одне доповнення на всю сторону, розмір зі sideSizes.
  (['thickening', 'fold'] as const).forEach((kind) => {
    const feature = ownerDetail[kind];
    if (!feature?.enabled) return;
    feature.sides.forEach((sideId) => {
      if (!bySide[sideId]) return;
      const size = feature.sideSizes?.[sideId] ?? feature.size;
      bySide[sideId].push({
        kind, sideId, legacy: true,
        slot: subDetails[`${prefix}${kind}_${sideId}`] ? `${prefix}${kind}_${sideId}` : undefined,
        label: `${KIND_LABEL[kind]} ${size} мм`,
      });
    });
  });

  // Слоти: бортики й нові потовщення/підвороти з модалки.
  Object.entries(subDetails || {}).forEach(([slot, draft]) => {
    const parsed = parseAdditionSlot(slot);
    if (!parsed.kind || !CHIP_KINDS.includes(parsed.kind as SideAdditionKind)) return;
    // Рівно СВОЇ доповнення: на стільниці — `fold_B`, на нозі `leg_B` —
    // `leg_B_fold_C`. Без цієї перевірки нога показувала б підворот
    // стільниці, а стільниця — підворот ноги.
    if (!slot.startsWith(`${prefix}${parsed.kind}_`)) return;
    if (!bySide[parsed.sideId]) return;
    // Базовий слот при живій легасі-галочці — це її ж збережений драфт,
    // чип для нього вже доданий вище.
    const kind = parsed.kind as SideAdditionKind;
    if ((kind === 'fold' || kind === 'thickening') && parsed.index === 1
      && ownerDetail[kind]?.sides?.includes(parsed.sideId)) return;
    const height = draft.height || DEFAULT_HEIGHT[kind];
    const offset = draft.attachOffset ?? 0;
    bySide[parsed.sideId].push({
      kind, sideId: parsed.sideId, slot,
      label: `${KIND_LABEL[kind]} ${height}×${draft.width || '—'}${offset ? ` (+${offset})` : ''}`,
    });
  });

  return bySide;
}

export function SideAdditionsPanel({
  ownerDetail,
  subDetails,
  sides,
  ownerSlot,
  onAdd,
  onEdit,
  onDelete,
}: {
  ownerDetail: DetailDraft;
  subDetails: Record<string, DetailDraft>;
  sides: string[];
  /** Слот власника, якщо він сам є доповненням. Порожньо — головна деталь. */
  ownerSlot?: string;
  onAdd: (kind: SideAdditionKind, sideId: string) => void;
  onEdit: (entry: SideAdditionEntry) => void;
  onDelete: (entry: SideAdditionEntry) => void;
}) {
  const [menuSide, setMenuSide] = useState<string | null>(null);
  const bySide = collectSideAdditions(ownerDetail, subDetails, sides, ownerSlot);
  // Бортик — оздоблення стільниці, на нозі чи панелі його не буває.
  // Решта доступна на обох рівнях: панель на панелі — це крок 4.2.
  const kinds: SideAdditionKind[] = ownerSlot
    ? ['thickening', 'fold', 'wall_panel', 'leg']
    : ['skirting', 'thickening', 'fold', 'wall_panel', 'leg'];

  return (
    <section className="p-3 bg-white">
      <div className="flex flex-col gap-1.5">
        {sides.map((side) => (
          <div key={side} className="flex items-start gap-2 py-1 border-b border-slate-100 last:border-b-0">
            <span className="ep-chip mt-0.5 shrink-0">{side}</span>
            <div className="flex flex-wrap gap-1.5 flex-1 min-h-[26px] items-center">
              {bySide[side].length === 0 && (
                <span className="text-xs text-slate-400">—</span>
              )}
              {bySide[side].map((entry, i) => (
                <span
                  key={entry.slot ?? `${entry.kind}-${i}`}
                  className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded border text-xs cursor-pointer hover:brightness-95 ${KIND_COLOR[entry.kind]}`}
                  title={entry.legacy ? 'Створено старим способом (на всю сторону) — клік відкриє налаштування' : 'Клік — редагувати'}
                  onClick={() => onEdit(entry)}
                >
                  {entry.label}
                  <button
                    className="p-0.5 rounded hover:bg-black/10"
                    title="Прибрати"
                    onClick={(e) => { e.stopPropagation(); onDelete(entry); }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative shrink-0">
              <button
                className="p-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                title="Додати доповнення на цю сторону"
                onClick={() => setMenuSide(menuSide === side ? null : side)}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {menuSide === side && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuSide(null)} />
                  <div className="absolute right-0 top-7 z-50 w-36 bg-white border border-slate-200 rounded shadow-lg flex flex-col text-sm">
                    {kinds.map((kind) => (
                      <button
                        key={kind}
                        className="text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700"
                        onClick={() => { setMenuSide(null); onAdd(kind, side); }}
                      >
                        {KIND_LABEL[kind]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
