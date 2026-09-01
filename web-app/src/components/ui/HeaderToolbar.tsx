import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
import {   Settings, HelpCircle, Wrench,   Bug, Sparkles } from 'lucide-react';
import { AdminPinButton } from './AdminPinButton';

export function HeaderToolbar() {
  const packingMode = useProjectStore((s) => s.packingMode);
  const setPackingMode = useProjectStore((s) => s.setPackingMode);
  const setIsHelpOpen = useUIStore((s) => s.setIsHelpOpen);
  const isRecordingBug = useUIStore((s) => s.isRecordingBug);
  const setIsBugReporterOpen = useUIStore((s) => s.setIsBugReporterOpen);
  const setIsRecordingBug = useUIStore((s) => s.setIsRecordingBug);
  const setIsSettingsOpen = useUIStore((s) => s.setIsSettingsOpen);
  const isAdminUnlocked = useUIStore((s) => s.isAdminUnlocked);
  const isExpertMode = useUIStore((s) => s.isExpertMode);
  const setExpertMode = useUIStore((s) => s.setExpertMode);

  return (
    <div className="flex items-center gap-1.5 flex-1 justify-end">

      {/* ПРОСУНУТИЙ РЕЖИМ (26.08). Один перемикач на всю програму:
          підписи кнопок у панелях інструментів згортаються у значки.
          Стоїть у шапці, бо стосується всіх екранів одразу, а не того,
          що зараз відкрито. Стан живе в localStorage (див. useStore). */}
      <button
        type="button"
        role="switch"
        aria-checked={isExpertMode}
        onClick={() => setExpertMode(!isExpertMode)}
        title={isExpertMode
          ? 'Просунутий режим увімкнено: у панелях інструментів значки замість підписів. Назва кожної кнопки — у підказці. Натисніть, щоб повернути слова.'
          : 'Просунутий режим: згорнути підписи кнопок у значки. Нічого не зникає — тільки менше тексту на екрані.'}
        className={`flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-sm !border-transparent shadow-none transition-colors mr-1 ${
          isExpertMode
            ? '!bg-[#0084ff] hover:!bg-[#006bce] !text-white'
            : '!bg-white/10 hover:!bg-white/20 !text-white/80'
        }`}
      >
        <Sparkles className="w-[15px] h-[15px] stroke-[2.4]" />
        <span className="text-[11px] font-bold uppercase tracking-wider hidden lg:inline">Просунутий</span>
        {/* Доріжка з повзунком: видно стан, навіть коли підпис сховано на вузькому екрані */}
        <span className={`relative w-7 h-3.5 rounded-full transition-colors ${isExpertMode ? 'bg-white/85' : 'bg-white/25'}`}>
          <span
            className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${
              isExpertMode ? 'left-[1.05rem] bg-[#0084ff]' : 'left-0.5 bg-white/90'
            }`}
          />
        </span>
      </button>

      <div className="h-6 w-px bg-white/10 mr-1"></div>

      <AdminPinButton />

      {/* Налаштування (прайси, прив'язки послуг) — адмінське меню,
          видиме лише після входу супер-адміна за PIN-кодом */}
      {isAdminUnlocked && (
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-8 h-8 flex items-center justify-center !text-white !bg-[#0084ff] hover:!bg-[#006bce] rounded-sm transition-colors shadow-sm"
          title="Налаштування"
        >
          <Settings className="w-[18px] h-[18px] stroke-[2.5]" />
        </button>
      )}

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