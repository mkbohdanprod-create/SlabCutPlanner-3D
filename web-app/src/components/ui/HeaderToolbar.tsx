import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
import { Trash2, Loader2, Settings, HelpCircle, Wrench, Play, ChevronDown, Bug } from 'lucide-react';
import { t } from '../../i18n';

export function HeaderToolbar() {
  const packingMode = useProjectStore((s) => s.packingMode);
  const setPackingMode = useProjectStore((s) => s.setPackingMode);
  const setIsHelpOpen = useUIStore((s) => s.setIsHelpOpen);
  const isRecordingBug = useUIStore((s) => s.isRecordingBug);
  const setIsBugReporterOpen = useUIStore((s) => s.setIsBugReporterOpen);
  const setIsRecordingBug = useUIStore((s) => s.setIsRecordingBug);

  return (
    <div className="flex items-center gap-1.5 flex-1 justify-end">

      <button 
        className="w-8 h-8 flex items-center justify-center !text-white !bg-[#0084ff] hover:!bg-[#006bce] rounded-sm transition-colors shadow-sm"
        title="Налаштування"
      >
        <Settings className="w-[18px] h-[18px] stroke-[2.5]" />
      </button>

      <button 
        onClick={() => setIsHelpOpen(true)}
        className="w-8 h-8 flex items-center justify-center !text-white !bg-[#0084ff] hover:!bg-[#006bce] rounded-sm transition-colors shadow-sm"
        title="Довідка"
      >
        <HelpCircle className="w-[18px] h-[18px] stroke-[2.5]" />
      </button>

      <button 
        onClick={() => useUIStore.getState().setIsServiceOpen(true)}
        className="w-8 h-8 flex items-center justify-center !text-white !bg-[#0084ff] hover:!bg-[#006bce] rounded-sm transition-colors shadow-sm"
        title="Сервіс"
      >
        <Wrench className="w-[18px] h-[18px] stroke-[2.5]" />
      </button>

      <button 
        onClick={() => {
          if (isRecordingBug) {
            setIsBugReporterOpen(true);
          } else {
            setIsRecordingBug(true);
          }
        }}
        className={`w-8 h-8 flex items-center justify-center rounded-sm transition-colors shadow-sm ${isRecordingBug ? 'bg-red-500 hover:bg-red-600 animate-pulse' : '!text-white !bg-[#0084ff] hover:!bg-[#006bce]'}`}
        title={isRecordingBug ? "Зупинити запис та відправити" : "Повідомити про помилку (почати запис)"}
      >
        <Bug className="w-[18px] h-[18px] stroke-[2.5] text-white" />
      </button>

    </div>
  );
}
