import React from 'react';
import { translateStaticUiText } from '../../i18n';
import type { UiLanguage } from '../../store/useDictionaryStore';
import { useCloseOnOutsideClick } from './useCloseOnOutsideClick';

interface CornerContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onSelect: (type: 'radius' | 'chamfer' | 'l-cut') => void;
  language?: UiLanguage;
}

export function CornerContextMenu({ x, y, onClose, onSelect, language = 'uk' }: CornerContextMenuProps) {
  const ui = (value: string) => translateStaticUiText(language, value);

  useCloseOnOutsideClick(onClose);

  return (
    <div
      /* fixed, а не absolute: x/y приходять як clientX/clientY (координати ВІКНА).
         При absolute вони рахувалися від контейнера канвасу, і меню відлітало
         на суму двох зсувів. Так само зроблено в Joint/DetailContextMenu. */
      className="fixed z-[100] bg-[#ebf3f9] border border-[#3ea7fb] shadow-md py-1 min-w-[120px] text-[13px] text-slate-700 font-medium"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button 
        className="w-full text-left px-3 py-1.5 hover:bg-[#cbe3f7] hover:text-[#0084ff] transition-colors"
        onClick={(e) => { e.stopPropagation(); onSelect('radius'); onClose(); }}
      >
        {ui('радіус')}
      </button>
      <button 
        className="w-full text-left px-3 py-1.5 hover:bg-[#cbe3f7] hover:text-[#0084ff] transition-colors"
        onClick={(e) => { e.stopPropagation(); onSelect('chamfer'); onClose(); }}
      >
        {ui('Кут')}
      </button>
      <button 
        className="w-full text-left px-3 py-1.5 hover:bg-[#cbe3f7] hover:text-[#0084ff] transition-colors"
        onClick={(e) => { e.stopPropagation(); onSelect('l-cut'); onClose(); }}
      >
        {ui('Г-Заріз')}
      </button>
    </div>
  );
}
