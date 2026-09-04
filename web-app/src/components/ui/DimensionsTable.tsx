import type { DetailDraft } from '../forms/utils/draftHelpers';
import { getSideSize, applySideEdit } from '../forms/utils/draftHelpers';
import { donorForSide, sideEditable, sideIsLockable } from '../../domain/sideLocks';
import { SideLockButton } from './SideLockButton';
import { useCommittedNumber } from './useCommittedNumber';

interface DimensionsTableProps {
  draft: DetailDraft;
  updateDetail: (patch: Partial<DetailDraft>) => void;
  sides: string[];
  /** Розміри, закріплені замком: не змінюються ні руками, ні від сусідів. */
  lockedSides?: ReadonlySet<string>;
  onToggleLock?: (side: string) => void;
}

/**
 * Поле розміру сторони. Значення йде в модель на Enter або втраті фокуса —
 * див. useCommittedNumber: інакше кожна набрана цифра встигає стати розміром.
 */
export function SideSizeInput({ length, readOnly, onCommit, title, className }: {
  length: number;
  readOnly: boolean;
  onCommit: (val: number) => void;
  title?: string;
  className?: string;
}) {
  const field = useCommittedNumber(length, onCommit);
  return (
    <input
      type="number"
      {...(readOnly ? { value: Math.round(length), readOnly: true } : field)}
      disabled={readOnly}
      title={title ?? (readOnly ? 'Цей розмір розраховується автоматично' : 'Enter або клік поза полем — застосувати, Esc — скасувати')}
      className={`${className ?? 'w-full'} px-2 py-1.5 border rounded outline-none font-mono text-sm ${readOnly ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : 'border-slate-300 bg-white focus:border-[#1f93ef]'}`}
    />
  );
}

const NO_LOCKS: ReadonlySet<string> = new Set<string>();

/**
 * ТАБЛИЦЯ РОЗМІРІВ (04.09.2026 — лише розміри).
 *
 * Колонки «Розкрій» і «Обробка» звідси прибрані на вимогу власника: кромки
 * задаються не тут, а «Розкрій» без обраної кромки завжди був порожній.
 * Лишилось три речі в рядку — літера, розмір, замок, — тому панель стала
 * вузькою, а кресленню дісталось місце, яке вона займала.
 */
export function DimensionsTable({ draft, updateDetail, sides, lockedSides = NO_LOCKS, onToggleLock }: DimensionsTableProps) {
  // Довжину сторони рахує СПІЛЬНА getSideSize із draftHelpers — тут жила її
  // повна копія, і на Г-подібній вони розійшлися (B і D навхрест). Дві копії
  // одного мапінгу — це і є механізм таких багів: виправляють одну, друга
  // лишається. Тому копію видалено, а не полагоджено.
  const getSideLength = (side: string): number => getSideSize(draft, side);

  // Запис розміру — теж СПІЛЬНА функція (applySideEdit), дзеркало getSideSize.
  // Замки вирішують, хто поступиться (domain/sideLocks.ts).
  const handleSizeChange = (side: string, val: number) => {
    const patch = applySideEdit(draft, side, val, lockedSides);
    if (Object.keys(patch).length > 0) updateDetail(patch);
  };

  return (
    <div className="bg-white text-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[#b3d4f0] text-slate-700 font-medium text-xs">
            <th className="py-2 px-2 border-b border-[#a3c4e0] text-center w-10"></th>
            <th className="py-2 px-2 border-b border-[#a3c4e0]">Сторони</th>
          </tr>
        </thead>
        <tbody>
          {sides.map((side) => {
            const length = getSideLength(side);
            const custom = Boolean((draft as { customPoints?: unknown[] }).customPoints?.length);
            const locked = lockedSides.has(side);
            const editable = !custom && sideEditable(draft, side, lockedSides);
            const donor = editable ? donorForSide(draft, side, lockedSides) : undefined;
            const title = custom
              ? 'Довільний контур: розмір задають точки контуру'
              : locked
                ? 'Замок закритий — зніміть його, щоб змінити розмір'
                : !editable
                  ? 'Усі суміжні розміри закриті замками — поступитись нема кому'
                  : donor
                    ? `Enter — застосувати. Поступиться розмір ${donor}`
                    : undefined;

            return (
              <tr key={side} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                <td className="py-1 px-2 text-center align-middle">
                  <span className={`inline-flex items-center justify-center min-w-6 h-6 px-1 rounded text-sm font-bold whitespace-nowrap ${
                    locked ? 'bg-[#22c55e] text-white' : 'bg-[#1f93ef] text-white'
                  }`}>{side}</span>
                </td>
                <td className="py-1 px-2">
                  {/* До 04.09 сторони D, E, F у П-подібної були назавжди сірі —
                      «розраховується автоматично». Саме це власник назвав
                      парадоксом. Тепер редагується все, а хто кому поступиться
                      — вирішує замок. */}
                  <div className="flex items-center gap-1.5">
                    <SideSizeInput
                      length={length}
                      readOnly={!editable}
                      title={title}
                      onCommit={(val) => handleSizeChange(side, val)}
                    />
                    {!custom && onToggleLock && sideIsLockable(draft, side) && (
                      <SideLockButton locked={locked} onToggle={() => onToggleLock(side)} />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
