/**
 * ЗБИРАЛЬНЕ ВИРОБНИЧЕ КРЕСЛЕННЯ — 04.09.2026.
 *
 * Тонка обгортка над «машиною креслень» (`../drawing`): компонувальник
 * будує аркуш за правилами оформлення і конструктиву з обучалочки,
 * рендер малює за стилем цеху. Тут — лише збір входу і показ прогалин.
 */
import { useMemo } from 'react';
import type { Detail, DetailPart, Project } from '../../domain/types';
import { composeAssemblySheet, type ComposeInput } from '../drawing/compose';
import { DrawingSvg } from '../drawing/render';

export interface SheetProps {
  project: Project;
  parts: DetailPart[];
  details: Detail[];
  title: string;
  sheetNo: number;
  sheetCount: number;
  instructions?: string[];
  kind?: 'stone' | 'metal' | 'plywood';
  overlay?: ComposeInput['overlay'];
  /** Показати під аркушем, чого не намальовано через брак даних. */
  showGaps?: boolean;
}

export function AssemblySheet({ project, parts, details, title, sheetNo, sheetCount, instructions, kind = 'stone', overlay, showGaps }: SheetProps) {
  const sheet = useMemo(() => composeAssemblySheet({ project, parts, details, sheetNo, sheetCount, instructions, kind, overlay }),
    [project, parts, details, sheetNo, sheetCount, instructions, kind, overlay]);
  return (
    <div>
      <DrawingSvg sheet={sheet} />
      {showGaps && sheet.gaps.length > 0 && (
        <div className="no-print px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
          <b>{title}:</b> не намальовано через брак даних у моделі — {sheet.gaps.join('; ')}.
        </div>
      )}
    </div>
  );
}

export default AssemblySheet;
