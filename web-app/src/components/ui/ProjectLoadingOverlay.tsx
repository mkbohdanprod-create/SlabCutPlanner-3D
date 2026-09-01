import { useUIStore } from '../../store/useStore';
import { Loader2 } from 'lucide-react';

/**
 * ЩО ЗАРАЗ ВІДБУВАЄТЬСЯ ПРИ ВІДКРИТТІ ПРОЄКТУ (27.08, зауваження власника
 * «нічого не відбувається»).
 *
 * Відкриття проєкту — не одна дія, а ланцюжок: дістати з кабінету або з
 * диска, розібрати JSON (на проєкті з фото слебів це мегабайти),
 * розгорнути деталі, перерахувати розкладку. Кожен крок займає час, і всі
 * вони раніше йшли мовчки: вкладка застигала, менеджер тиснув удруге і
 * запускав усе спочатку.
 *
 * Тому вікно показує НАЗВУ КРОКУ, а не абстрактний спінер: людина бачить,
 * що процес живий і рухається, а якщо він застряг — видно, на чому саме.
 */
export function ProjectLoadingOverlay() {
  const loading = useUIStore((s) => s.projectLoading);
  if (!loading) return null;

  const percent = Math.round((loading.index / loading.total) * 100);

  return (
    <div className="fixed inset-0 z-[100] bg-[#1e2d3d]/45 flex items-center justify-center" role="status" aria-live="polite">
      <div className="bg-white rounded-xl shadow-2xl w-[380px] px-6 py-5">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-[#0084ff] shrink-0" />
          <div className="min-w-0">
            <div className="text-[15px] font-bold text-[#1e2d3d] truncate">{loading.title}</div>
            <div className="text-[13px] text-slate-500 truncate">{loading.step}</div>
          </div>
        </div>

        <div className="mt-4 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-[#0084ff] transition-all duration-300"
            style={{ width: `${Math.max(8, percent)}%` }}
          />
        </div>
        <div className="mt-1.5 text-[11px] text-slate-400 tabular-nums">
          крок {loading.index} з {loading.total}
        </div>
      </div>
    </div>
  );
}
