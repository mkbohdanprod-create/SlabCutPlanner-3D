import { AlertTriangle } from 'lucide-react';
import { DraggableDialog } from './DraggableDialog';

/**
 * СТВОРЕННЯ НОВОГО ПРОЄКТУ.
 *
 * Проєкт живе в браузері й ніде більше, поки менеджер не зберіг його у файл
 * або в кабінет. Тому «новий проєкт» — це знищення поточного, і мовчки
 * робити цього не можна: за годину роботи над кухнею тут ціна помилки —
 * весь день.
 *
 * Діалог свідомо не має «безпечного» вигляду підтвердження: головна дія —
 * зберегти, і саме вона підсвічена. Кнопка «створити без збереження»
 * поруч, але сірим, і поруч із нею написано, що саме зникне.
 */
export function NewProjectDialog({
  summary,
  onSaveAndCreate,
  onCreateAnyway,
  onClose,
}: {
  /** Що саме зникне: короткий підсумок проєкту («3 вироби · 12 деталей · 3 сляби»). */
  summary: string;
  onSaveAndCreate: () => void;
  onCreateAnyway: () => void;
  onClose: () => void;
}) {
  return (
    <DraggableDialog
      title="Новий проєкт"
      onClose={onClose}
      width={460}
      headerClassName="bg-[#3b82f6] text-white"
      className="bg-white border border-slate-200 overflow-hidden"
    >
      <div className="p-5 flex flex-col gap-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-700 leading-relaxed">
            <p className="m-0 mb-2">
              Новий проєкт замінить поточний. Незбережене відновити не вийде.
            </p>
            <p className="m-0 text-slate-500">
              Зараз у проєкті: {summary}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={onSaveAndCreate}
            className="w-full py-2 bg-[#0084ff] text-white rounded-sm font-medium hover:bg-[#0072dd] transition-colors"
          >
            Зберегти і створити новий
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-1.5 bg-white text-slate-600 border border-slate-300 rounded-sm text-sm hover:bg-slate-50 transition-colors"
            >
              Скасувати
            </button>
            <button
              onClick={onCreateAnyway}
              className="flex-1 py-1.5 bg-white text-red-600 border border-red-200 rounded-sm text-sm hover:bg-red-50 transition-colors"
            >
              Створити без збереження
            </button>
          </div>
        </div>
      </div>
    </DraggableDialog>
  );
}
