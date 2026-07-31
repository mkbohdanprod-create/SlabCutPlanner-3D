import  { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
import { Scissors } from 'lucide-react';

interface Props {
  x: number;
  y: number;
  edgeId: string;
  onClose: () => void;
  onSelect: (action: 'thickening' | 'fold' | 'skirting' | 'wall_panel' | 'leg') => void;
  onSelectProfile?: (profile: string) => void;
}

export function EdgeContextMenu({ x, y, edgeId, onClose, onSelect, onSelectProfile }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'main' | 'profiles'>('main');
  const project = useProjectStore(s => s.project);
  const setIsEdgeProfileSettingsOpen = useUIStore(s => s.setIsEdgeProfileSettingsOpen);
  const edgeProfiles = project.referenceData?.edgeProfiles ?? [];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (mode === 'profiles') {
    return (
      <div
        ref={ref}
        style={{ left: x, top: y, maxHeight: '300px' }}
        /* fixed: x/y — це clientX/clientY (координати вікна), див. CornerContextMenu. */
        className="fixed z-50 w-56 bg-[#dcf2fb] border border-[#a2d8f0] shadow-lg flex flex-col text-sm overflow-y-auto"
      >
        <button
          onClick={() => setMode('main')}
          className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50 font-bold flex items-center gap-2 sticky top-0 bg-[#dcf2fb]"
        >
          ← Назад
        </button>
        <button
          onClick={() => onSelectProfile?.('')}
          className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50"
        >
          Без кромки
        </button>
        {edgeProfiles.map(opt => (
          <button
            key={opt.id}
            onClick={() => onSelectProfile?.(opt.id)}
            className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50"
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={() => { setIsEdgeProfileSettingsOpen(true); onClose(); }}
          className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#0284c7] border-t border-[#a2d8f0]/50 font-medium flex items-center gap-2"
        >
          <Scissors className="w-4 h-4" /> Налаштувати
        </button>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 w-48 bg-[#dcf2fb] border border-[#a2d8f0] shadow-lg flex flex-col text-sm"
    >
      <button
        onClick={() => setMode('profiles')}
        className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50 flex justify-between items-center"
      >
        Обробка торців <span>›</span>
      </button>
      <button
        onClick={() => onSelect('thickening')}
        className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50"
      >
        Потовщення
      </button>
      <button
        onClick={() => onSelect('fold')}
        className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50"
      >
        Підворот
      </button>
      <button
        onClick={() => onSelect('skirting')}
        className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50"
      >
        Бортик
      </button>
      <button
        onClick={() => onSelect('wall_panel')}
        className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50"
      >
        Стінова панель
      </button>
      <button
        onClick={() => onSelect('leg')}
        className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155]"
      >
        Нога
      </button>
    </div>
  );
}