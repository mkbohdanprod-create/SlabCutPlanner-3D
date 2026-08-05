import { Suspense, memo } from 'react';
import { Layers, Image, Box, Eye, Columns, Loader2, ExternalLink, FileText, Calculator } from 'lucide-react';
import { useUIStore, type MainView, type PaneView } from '../store/useStore';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { SlabBoard } from './2d/SlabBoard';
import { TextureLayoutPanel } from './ui/TextureLayoutPanel';
import { UnplacedPartsPanel } from './ui/UnplacedPartsPanel';
import { Viewer3D } from './3d/Viewer3DLazy';
import { EstimatePanel } from './ui/EstimatePanel';
import { QuotePanel } from './ui/QuotePanel';
import { PlacementPropertiesPanel } from './2d/PlacementPropertiesPanel';

interface WorkspacePaneProps {
  view: PaneView;
  onChangeView: (view: MainView) => void;
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
  // «3D Прев'ю» і «Послуги для виробництва» — вкладки супер-адміна
  // (щит у шапці, PIN); для менеджера їх не існує
  const isAdminUnlocked = useUIStore((s) => s.isAdminUnlocked);
  // Документи (кошторис, прорахунок) не мають плаваючого 3D-прев'ю поверх себе,
  // тож на них вкладка «3D Прев'ю» не має підсвічуватись активною.
  const isDocumentView = view === 'estimate' || view === 'quote';

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col h-full bg-[#f0f3f5]">
      {/* Canvas Tabs */}
      {/* overflow-x-auto: у «Спліті» панель удвічі вужча, а вкладок сім —
          хай краще прокручуються, ніж стискаються в нечитабельні обрубки. */}
      <div className="flex items-end z-10 relative bg-[#f0f3f5] pt-2 px-4 border-b border-[var(--border-color)] shrink-0 overflow-x-auto custom-scrollbar">
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
          <Box className="w-4 h-4" /> 3D Підбір
        </button>
        {isAdminUnlocked && (
          <button
            onClick={() => {
              onChangeView('2d'); // Switch to 2D for background
              useUIStore.getState().setFloatingPreviewMode('3d');
              useUIStore.getState().setFloatingPreviewOpen(true);
            }}
            className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-1 shrink-0 whitespace-nowrap ${
              isFloatingPreviewOpen && !isDocumentView
                ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]'
                : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
            }`}
            style={{ fontFamily: 'Roboto, sans-serif' }}
          >
            <Eye className="w-4 h-4" /> 3D Прев'ю
          </button>
        )}
        {isAdminUnlocked && (
          <button
            onClick={() => {
              onChangeView('estimate');
              useUIStore.getState().setFloatingPreviewOpen(false);
            }}
            className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-1 shrink-0 whitespace-nowrap ${
              view === 'estimate'
                ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]'
                : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
            }`}
            style={{ fontFamily: 'Roboto, sans-serif' }}
            title="Повний перелік операцій із кодами — для виробництва"
          >
            <FileText className="w-4 h-4" /> Послуги для виробництва
          </button>
        )}
        <button
          onClick={() => {
            onChangeView('quote');
            useUIStore.getState().setFloatingPreviewOpen(false);
          }}
          className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-1 shrink-0 whitespace-nowrap ${
            view === 'quote'
              ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]'
              : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
          title="Розрахунок вартості для клієнта"
        >
          <Calculator className="w-4 h-4" /> Прорахунок
        </button>
        <button
          onClick={onToggleSplit}
          className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-1 shrink-0 whitespace-nowrap ${
            isSplitModeActive
              ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]'
              : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
        >
          <Columns className="w-4 h-4" /> Спліт
        </button>
        
        {/* Open in new window button */}
        <button
          onClick={() => {
            const url = new URL(window.location.href);
            // Pass the current view so the popup knows what to render
            url.searchParams.set('popup', isFloatingPreviewOpen ? '3d-preview' : view);
            window.open(url.toString(), 'SlabCutPlannerPopup', 'width=1200,height=800');
          }}
          className="px-4 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-auto shrink-0 bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0] hover:text-[var(--accent-color)]"
          title="Відкрити поточний вид в окремому вікні"
        >
          <ExternalLink className="w-4 h-4" />
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
              <div className="shrink-0 relative">
                <SlabBoard />
                <PlacementPropertiesPanel />
              </div>
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
        ) : view === 'estimate' ? (
          <div className="flex flex-col h-full relative">
            <ErrorBoundary componentName="EstimatePanel">
              <EstimatePanel />
            </ErrorBoundary>
          </div>
        ) : view === 'quote' ? (
          <div className="flex flex-col h-full relative overflow-y-auto custom-scrollbar">
            <ErrorBoundary componentName="QuotePanel">
              <QuotePanel />
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
