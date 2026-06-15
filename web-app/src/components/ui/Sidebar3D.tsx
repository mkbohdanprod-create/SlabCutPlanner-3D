import { Box, RotateCcw, MousePointer2, Move, RefreshCw } from 'lucide-react';
import { useUIStore } from '../../store/useStore';
import { useProjectStore } from '../../store/useProjectStore';

export function Sidebar3D() {
  const { is3dAssemblyMode, set3dAssemblyMode, is3dGroupingEnabled, set3dGroupingEnabled, transformMode, setTransformMode } = useUIStore();
  const { reset3dAssembly } = useProjectStore();

  return (
    <aside className="w-64 shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full">
      <div className="bg-slate-100/50 p-4 border-b border-slate-200">
        <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Box className="w-4 h-4 text-blue-600" />
          3D Збірка
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Керування</h3>
          
          <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer hover:bg-blue-50 transition-colors">
            <input 
              type="checkbox" 
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              checked={is3dAssemblyMode}
              onChange={(e) => set3dAssemblyMode(e.target.checked)}
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <MousePointer2 className="w-3.5 h-3.5" />
                Режим збірки
              </span>
              <span className="text-xs text-slate-500 mt-0.5">Дозволяє рухати деталі</span>
            </div>
          </label>

          <label className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${is3dAssemblyMode ? 'bg-slate-50 border-slate-200 hover:bg-blue-50' : 'bg-slate-50/50 border-slate-100 opacity-60 pointer-events-none'}`}>
            <input 
              type="checkbox" 
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              checked={is3dGroupingEnabled}
              onChange={(e) => set3dGroupingEnabled(e.target.checked)}
              disabled={!is3dAssemblyMode}
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-700">Групувати деталі</span>
              <span className="text-xs text-slate-500 mt-0.5">Рухати стільницю разом з підворотами</span>
            </div>
          </label>
        </div>

        {is3dAssemblyMode && (
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Дія</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setTransformMode('translate')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                  transformMode === 'translate' ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Move className="w-4 h-4" />
                Рухати
              </button>
              <button
                onClick={() => setTransformMode('rotate')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                  transformMode === 'rotate' ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                Обертати
              </button>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100">
          <button 
            onClick={() => {
              if (window.confirm('Ви впевнені, що хочете скинути всі 3D координати і повернути деталі на площину?')) {
                reset3dAssembly();
              }
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            Скинути збірку
          </button>
        </div>
      </div>
    </aside>
  );
}
