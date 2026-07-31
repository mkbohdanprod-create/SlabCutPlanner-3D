import React from 'react';
import { translateStaticUiText } from '../../i18n';
import type { UiLanguage } from '../../store/useDictionaryStore';

interface JointContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onSelect: (direction: 'horizontal' | 'vertical' | 'none') => void;
  language?: UiLanguage;
}

export function JointContextMenu({ x, y, onClose, onSelect, language = 'uk' }: JointContextMenuProps) {
  const ui = (value: string) => translateStaticUiText(language, value);

  React.useEffect(() => {
    // Small timeout to prevent the current click from immediately closing the menu
    const timer = setTimeout(() => {
      const handleClickOutside = () => onClose();
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }, 10);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className="fixed z-50 bg-white rounded-md shadow-lg border border-slate-200 py-1 w-48 text-sm"
      style={{
        left: Math.min(x, window.innerWidth - 200),
        top: Math.min(y, window.innerHeight - 150),
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 mb-1">
        Додати стик
      </div>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700 transition-colors"
        onClick={() => onSelect('horizontal')}
      >
        Горизонтальний стик
      </button>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700 transition-colors"
        onClick={() => onSelect('vertical')}
      >
        Вертикальний стик
      </button>
      <div className="border-t border-slate-100 my-1"></div>
      <button
        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-red-600 transition-colors"
        onClick={() => onSelect('none')}
      >
        Видалити стик
      </button>
    </div>
  );
}