import React from 'react';
import { FileText, Settings } from 'lucide-react';

interface DetailContextMenuProps {
  x: number;
  y: number;
  detailId: string;
  onClose: () => void;
  onAction: (action: 'passport' | 'settings', detailId: string) => void;
}

export function DetailContextMenu({ x, y, detailId, onClose, onAction }: DetailContextMenuProps) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const handleClickOutside = () => onClose();
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }, 10);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className="fixed z-50 bg-white rounded-md shadow-lg border border-slate-200 py-1 w-64 text-sm"
      style={{
        left: Math.min(x, window.innerWidth - 260),
        top: Math.min(y, window.innerHeight - 150),
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 mb-1">
        Дії з деталлю
      </div>
      <button
        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-2"
        onClick={() => onAction('passport', detailId)}
      >
        <FileText className="w-4 h-4 text-slate-400" />
        <span>Параметри та список обробок</span>
      </button>
      <button
        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-2"
        onClick={() => onAction('settings', detailId)}
      >
        <Settings className="w-4 h-4 text-slate-400" />
        <span>Налаштування деталі</span>
      </button>
    </div>
  );
}
