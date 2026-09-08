import  { useEffect, useRef, useState } from 'react';
import { edgeProfilesForMaterial } from '../../utils/edgeProfiles';
import { edgeProfileHint, groupEdgeProfiles } from '../../domain/edgeProfileClasses';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
import { Scissors, LayoutGrid } from 'lucide-react';
import { openEdgeCatalog } from '../../store/useEdgeCatalog';
import { EDGE_KIND_LABEL } from '../../domain/ids';

interface Props {
  x: number;
  y: number;
  edgeId: string;
  /** Показуване ім'я ребра (Б-002): для `CD_lcut1` — «D1». Немає — показуємо id. */
  edgeLabel?: string;
  onClose: () => void;
  onSelect: (action: 'thickening' | 'fold' | 'skirting' | 'wall_panel' | 'leg' | 'u_cutout') => void;
  onSelectProfile?: (profile: string) => void;
}

export function EdgeContextMenu({ x, y, edgeId, edgeLabel, onClose, onSelect, onSelectProfile }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'main' | 'profiles'>('main');
  const project = useProjectStore(s => s.project);
  const setIsEdgeProfileSettingsOpen = useUIStore(s => s.setIsEdgeProfileSettingsOpen);
  const edgeProfiles = edgeProfilesForMaterial(project.referenceData?.edgeProfiles, project.projectMaterial);
  // Той самий порядок, що у випадачках редактора: універсальні → цей матеріал → потовщення → операції → інші → спадок
  const profileGroups = groupEdgeProfiles(edgeProfiles, project.projectMaterial);

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
          onClick={() => {
            // Каталог живе поза меню (меню закривається кліком поза ним — модалка всередині не вижила б)
            openEdgeCatalog({ title: `Ребро ${edgeLabel ?? edgeId}`, material: project.projectMaterial, allowNone: true, onSelect: (id) => onSelectProfile?.(id) });
            onClose();
          }}
          className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#0284c7] border-b border-[#a2d8f0]/50 font-medium flex items-center gap-2"
        >
          <LayoutGrid className="w-4 h-4" /> Каталог з розрізами…
        </button>
        <button
          onClick={() => onSelectProfile?.('')}
          className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50"
        >
          Без кромки
        </button>
        {profileGroups.map((group) => (
          <div key={`${group.key}:${group.label}`} className="flex flex-col">
            <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0058ab] bg-[#cbe6f6]/60 border-b border-[#a2d8f0]/50">
              {group.label}
            </div>
            {group.profiles.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onSelectProfile?.(opt.id)}
                title={edgeProfileHint(opt.id)}
                className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50"
              >
                {opt.label}
              </button>
            ))}
          </div>
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
      {/* Порядок пунктів лишаю як був, підписи — з EDGE_KIND_LABEL:
          10.08 назви помінялись місцями, дії (`fold`/`thickening`) — ні. */}
      <button
        onClick={() => onSelect('fold')}
        className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50"
      >
        {EDGE_KIND_LABEL.fold}
      </button>
      <button
        onClick={() => onSelect('thickening')}
        className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50"
      >
        {EDGE_KIND_LABEL.thickening}
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
        className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155] border-b border-[#a2d8f0]/50"
      >
        Нога
      </button>
      {/* Крок 4.4 (FG-34): ніша ріжеться САМЕ з ребра — тому пункт тут, а не
          в меню площини, де живуть отвори. Це різні операції: отвір лишає
          деталь цілою, ніша розриває контур. */}
      <button
        onClick={() => onSelect('u_cutout')}
        className="text-left px-4 py-2 hover:bg-[#cbe6f6] text-[#334155]"
      >
        Ніша (П-виріз)
      </button>
    </div>
  );
}
