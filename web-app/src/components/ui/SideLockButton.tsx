import { Lock, LockOpen } from 'lucide-react';

/**
 * ЗАМОЧОК БІЛЯ РОЗМІРУ (04.09.2026).
 *
 * Закритий замок = «це число не змінюється»: ні руками, ні само, коли
 * міняють сусідні розміри. Зміну тоді поглинає перший незамкнений розмір
 * того самого рівняння — див. `domain/sideLocks.ts`.
 *
 * Відкритий замок навмисно блідий: у типовій деталі замків немає, і ряд
 * із восьми яскравих іконок читався б як помилка.
 */
export function SideLockButton({
  locked,
  onToggle,
  title,
}: {
  locked: boolean;
  onToggle: () => void;
  title?: string;
}) {
  const Icon = locked ? Lock : LockOpen;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={locked}
      title={title ?? (locked ? 'Розмір закріплено — зняти замок' : 'Закріпити розмір: він не змінюватиметься сам')}
      /* `!` тут не примха: у застосунку є глобальний світлий стиль для
         <button> (біле тло, рамка, темний текст), і він перебиває звичайні
         класи — замок виходив сірим прямокутником, схожим на порожнє поле
         (спіймано зондом 04.09, як раніше з полем пароля в студії). */
      className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center !rounded !border !p-0 !shadow-none transition-colors ${
        locked
          ? '!border-[#1875c0] !bg-[#1f93ef] !text-white hover:!bg-[#1875c0]'
          : '!border-slate-200 !bg-white !text-slate-400 hover:!border-slate-300 hover:!bg-slate-50 hover:!text-[#1f93ef]'
      }`}
    >
      <Icon className="h-[15px] w-[15px]" strokeWidth={2.2} />
    </button>
  );
}
