import { useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { getAllProjectDetails } from '../../store/projectHelpers';
import { checkManufacturability, summarizeIssues } from '../../domain/manufacturability';

/**
 * Технологічні попередження до проєкту.
 *
 * Свідомо не блокує роботу. Порушення гарантійних відступів — це не
 * заборона, а вибір із наслідком: клієнт може попросити виріз ближче до
 * краю, але має знати, що гарантія на розлом тоді не діє. Тому дві різні
 * категорії з різними формулюваннями, а не одна купа «помилок».
 */
export function ManufacturabilityNotice() {
  const project = useProjectStore((s) => s.project);
  const parts = useProjectStore((s) => s.parts);
  const [expanded, setExpanded] = useState(false);

  const issues = useMemo(
    () => checkManufacturability(project, parts, { details: getAllProjectDetails(project) }),
    [project, parts],
  );
  const summary = summarizeIssues(issues);

  if (summary.total === 0) {
    if (parts.length === 0) return null;
    return (
      <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-200 bg-emerald-50/60 text-sm text-emerald-800">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>Технологічних зауважень немає: габарити, відступи й радіуси в межах норм.</span>
      </div>
    );
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const guarantee = issues.filter((issue) => issue.severity === 'guarantee');

  return (
    <div className={`border-b ${summary.errors > 0 ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
      <button
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center gap-2 px-6 py-3 text-sm text-left"
      >
        {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
        {summary.errors > 0
          ? <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          : <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />}
        <span className={summary.errors > 0 ? 'text-red-800' : 'text-amber-800'}>
          {summary.errors > 0 && <strong>{summary.errors} технологічних порушень</strong>}
          {summary.errors > 0 && summary.guarantee > 0 && ', '}
          {summary.guarantee > 0 && <strong>{summary.guarantee} під втратою гарантії</strong>}
          <span className="text-slate-500"> — натисніть, щоб побачити деталі</span>
        </span>
      </button>

      {expanded && (
        <div className="px-6 pb-4 space-y-4">
          {errors.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-red-700 mb-1.5">
                Так зробити не можна
              </div>
              <ul className="space-y-2">
                {errors.map((issue, index) => (
                  <li key={`${issue.code}_${index}`} className="text-sm">
                    <div className="text-red-900">{issue.message}</div>
                    {issue.reason && <div className="text-xs text-red-700/70 mt-0.5">{issue.reason}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {guarantee.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-1.5">
                Зробимо, але клієнт втрачає гарантію
              </div>
              <ul className="space-y-2">
                {guarantee.map((issue, index) => (
                  <li key={`${issue.code}_${index}`} className="text-sm">
                    <div className="text-amber-900">{issue.message}</div>
                    {issue.reason && <div className="text-xs text-amber-700/70 mt-0.5">{issue.reason}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
