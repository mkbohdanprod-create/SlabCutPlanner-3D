import React from 'react';
import { localeForLanguage, statusLabel, t } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import { calculateTotalArea } from '../../utils/export';
import { CheckCircle2, Clock, AlertCircle, Maximize, Layers } from 'lucide-react';

export function AppStatusBar() {
  const { project, parts } = useProjectStore();
  const mainParts = parts.filter((part) => part.isMain);
  const language = project.uiLanguage ?? 'uk';

  // Helper to determine status color and icon
  const getStatusDisplay = () => {
    switch(project.calculationStatus) {
      case 'success':
        return { color: 'text-green-600', icon: <CheckCircle2 className="w-4 h-4" /> };
      case 'packing':
        return { color: 'text-blue-600 animate-pulse', icon: <Clock className="w-4 h-4" /> };
      case 'error':
        return { color: 'text-red-600', icon: <AlertCircle className="w-4 h-4" /> };
      default:
        return { color: 'text-slate-500', icon: <Clock className="w-4 h-4" /> };
    }
  };

  const statusInfo = getStatusDisplay();

  return (
    <footer className="h-8 flex-none bg-white border-t border-slate-200 flex items-center px-4 text-xs font-medium text-slate-600 gap-6">
      {/* Status */}
      <div className={`flex items-center gap-1.5 ${statusInfo.color}`}>
        {statusInfo.icon}
        <span className="font-semibold">{t(language, 'status')}: {statusLabel(language, project.calculationStatus)}</span>
      </div>

      <div className="h-4 w-px bg-slate-300"></div>

      {/* Areas */}
      <div className="flex items-center gap-1.5" title={t(language, 'totalBlankArea')}>
        <Maximize className="w-3.5 h-3.5 text-slate-400" />
        <span>{calculateTotalArea(parts).toFixed(3)} {t(language, 'squareMeters')}</span>
      </div>

      <div className="flex items-center gap-1.5" title={t(language, 'detailArea')}>
        <BoxIcon className="w-3.5 h-3.5 text-slate-400" />
        <span>{calculateTotalArea(mainParts).toFixed(3)} {t(language, 'squareMeters')} (деталі)</span>
      </div>

      <div className="h-4 w-px bg-slate-300"></div>

      {/* Slabs */}
      <div className="flex items-center gap-1.5">
        <Layers className="w-3.5 h-3.5 text-slate-400" />
        <span>{t(language, 'slabCount')}: {project.slabs.length}</span>
      </div>

      {/* Updated */}
      <div className="ml-auto text-slate-400 font-normal">
        {t(language, 'updated')}: {new Date(project.updatedAt).toLocaleString(localeForLanguage(language))}
      </div>
    </footer>
  );
}

// Simple box icon fallback if Box from lucide-react is not available
function BoxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}
