import { Suspense, memo } from 'react';
import { Layers, Image, Box, Eye, Columns, Loader2 } from 'lucide-react';
import { useUIStore } from '../store/useStore';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { SlabBoard } from './2d/SlabBoard';
import { TextureLayoutPanel } from './ui/TextureLayoutPanel';
import { UnplacedPartsPanel } from './ui/UnplacedPartsPanel';
import { Viewer3D } from './3d/Viewer3DLazy';

interface WorkspacePaneProps {
  view: '2d' | 'texture' | '3d';
  onChangeView: (view: '2d' | 'texture' | '3d' | 'split') => void;
  isSplitModeActive: boolean;
  onToggleSplit: () => void;
}

export const WorkspacePane = memo(function WorkspacePane({
  view,
  onChangeView,
  isSplitModeActive,
  onToggleSplit,
}: WorkspacePaneProps) {
  const isFloatingPreviewOpen = useUIStore((s) => s.isFloatingPreviewOpen);
  const is3dAssemblyMode = useUIStore((s) => s.is3dAssemblyMode);

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col h-full bg-[#f0f3f5]">
      {/* Canvas Tabs */}
      <div className="flex items-end z-10 relative bg-[#f0f3f5] pt-2 px-4 border-b border-[var(--border-color)] shrink-0">
        <button
          onClick={() => {
            onChangeView('2d');
            useUIStore.getState().setFloatingPreviewOpen(false);
          }}
          className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ${
            view === '2d' && !isFloatingPreviewOpen
              ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]'
              : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
        >
          <Layers className="w-4 h-4" />
          2D Розкрій
        </button>
        <button
          onClick={() => {
            onChangeView('texture');
            useUIStore.getState().setFloatingPreviewOpen(false);
          }}
          className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-1 ${
            view === 'texture' && !isFloatingPreviewOpen
              ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]'
              : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
        >
          <Image className="w-4 h-4" /> Підбір текстури
        </button>
        <button
          onClick={() => {
            onChangeView('3d');
            useUIStore.getState().set3dAssemblyMode(true);
            useUIStore.getState().setFloatingPreviewOpen(false);
          }}
          className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-1 ${
            view === '3d' && is3dAssemblyMode
              ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]'
              : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
        >
          <Box className="w-4 h-4" /> 3D Редактор
        </button>
        <button
          onClick={() => {
            onChangeView('2d'); // Switch to 2D for background
            useUIStore.getState().setFloatingPreviewMode('3d');
            useUIStore.getState().setFloatingPreviewOpen(true);
          }}
          className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-1 ${
            isFloatingPreviewOpen
              ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]'
              : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
        >
          <Eye className="w-4 h-4" /> 3D Прев'ю
        </button>
        <button
          onClick={onToggleSplit}
          className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-1 ${
            isSplitModeActive
              ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]'
              : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
        >
          <Columns className="w-4 h-4" /> Спліт
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 bg-white rounded-b-sm rounded-tr-sm shadow-sm border border-slate-300 border-t-0 flex flex-col relative z-0 overflow-hidden">
        {view === '2d' ? (
          <div className="flex flex-col gap-4 p-4 overflow-y-auto custom-scrollbar h-full">
            <ErrorBoundary componentName="UnplacedPartsPanel">
              <div className="shrink-0"><UnplacedPartsPanel /></div>
            </ErrorBoundary>
            <ErrorBoundary componentName="SlabBoard">
              <div className="shrink-0"><SlabBoard /></div>
            </ErrorBoundary>
            <ErrorBoundary componentName="TextureLayoutPanel">
              <div className="shrink-0"><TextureLayoutPanel /></div>
            </ErrorBoundary>
          </div>
        ) : view === 'texture' ? (
          <div className="flex flex-col gap-4 p-4 h-full relative">
            <ErrorBoundary componentName="TextureLayoutPanel">
              <TextureLayoutPanel />
            </ErrorBoundary>
          </div>
        ) : (
          <div className="flex flex-col h-full relative">
            <ErrorBoundary componentName="Viewer3D">
              <Suspense
                fallback={
                  <div className="flex-1 flex flex-col items-center justify-center bg-slate-100 text-slate-500 w-full h-full gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <span className="font-medium">Завантаження 3D-движка...</span>
                  </div>
                }
              >
                <Viewer3D />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}
      </div>
    </div>
  );
});
