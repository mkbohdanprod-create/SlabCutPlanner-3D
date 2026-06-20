import { Box, MousePointer2, Move, RefreshCw } from 'lucide-react';
import { useUIStore } from '../../store/useStore';
import { useProjectStore } from '../../store/useProjectStore';
import { DetailEditor3D } from '../3d/DetailEditor3D';

export function Sidebar3D() {
  const { is3dAssemblyMode, set3dAssemblyMode, is3dGroupingEnabled, set3dGroupingEnabled, transformMode, setTransformMode } = useUIStore();
  const { reset3dAssembly } = useProjectStore();

  return (
    <aside className="w-64 shrink-0 bg-[var(--bg-panel)] rounded-xl shadow-sm border border-[var(--border-color)] flex flex-col overflow-hidden h-full">
      <div className="bg-[var(--bg-main)] p-4 border-b border-[var(--border-color)]">
        <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Box className="w-4 h-4 text-blue-600" />
          3D Збірка
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Керування</h3>
          <div className="text-xs text-[var(--text-secondary)] italic">
            Опції перенесено у верхню панель 3D-редактора
          </div>
        </div>

        {is3dAssemblyMode && (
          <div className="space-y-3 pt-4 border-t border-[var(--border-color)]">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Дія</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setTransformMode('translate')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                  transformMode === 'translate' ? 'bg-[var(--bg-panel-hover)] text-[var(--accent-color)]' : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-panel-hover)]'
                }`}
              >
                <Move className="w-4 h-4" />
                Рухати
              </button>
              <button
                onClick={() => setTransformMode('rotate')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                  transformMode === 'rotate' ? 'bg-[var(--bg-panel-hover)] text-[var(--accent-color)]' : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-panel-hover)]'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                Обертати
              </button>
            </div>
          </div>
        )}


      </div>
      
      {/* Detail Editing Block */}
      <div className="mt-auto shrink-0">
        <DetailEditor3D />
      </div>
    </aside>
  );
}
