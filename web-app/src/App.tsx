import React, { useEffect } from 'react';
import { useUIStore } from './store/useStore';
import { useProjectStore } from './store/useProjectStore';
import { SlabBoard } from './components/2d/SlabBoard';
import { Viewer3D } from './components/3d/Viewer3D';
import { Sidebar } from './components/ui/Sidebar';
import { Sidebar3D } from './components/ui/Sidebar3D';
import { UnplacedPartsPanel } from './components/ui/UnplacedPartsPanel';
import { TextureLayoutPanel } from './components/ui/TextureLayoutPanel';
import { HeaderToolbar } from './components/ui/HeaderToolbar';
import { AppStatusBar } from './components/ui/AppStatusBar';
import { Settings, Layers, Box, Package, Download } from 'lucide-react';
import { LanguageDomTranslator } from './components/ui/LanguageDomTranslator';

function App() {
  const { mainView, setMainView } = useUIStore();
  const { initialize, undoLastMovement, redoMovement } = useProjectStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoLastMovement();
      }
      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoMovement();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redoMovement, undoLastMovement]);

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 font-sans">
      <LanguageDomTranslator />
      {/* Header Panel */}
      <header className="h-16 flex-none bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Layers className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            SlabCutPlanner <span className="text-blue-600">v2</span>
          </h1>
        </div>

          {/* Left Controls */}
          <div className="flex items-center gap-4 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setMainView('2d')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mainView === '2d' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2D Розкрій
            </button>
            <button
              onClick={() => setMainView('3d')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                mainView === '3d' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Box className="w-4 h-4" /> 3D Перегляд
            </button>
          </div>

          {/* Right Controls: HeaderToolbar contains project inputs, language, pack buttons */}
          <HeaderToolbar />
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 min-h-0 overflow-hidden flex p-4 gap-4">
        {/* Left Sidebar - Tools & Parts */}
        {mainView === '2d' ? <Sidebar /> : <Sidebar3D />}

        {/* Center Canvas Area */}
        <section className="flex-1 min-h-0 min-w-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-y-auto custom-scrollbar flex flex-col p-4 gap-4 relative workspace">
          {mainView === '2d' ? (
            <div className="flex flex-col gap-4 min-h-min">
              <div className="shrink-0"><UnplacedPartsPanel /></div>
              <div className="shrink-0"><SlabBoard /></div>
              <div className="shrink-0"><TextureLayoutPanel /></div>
            </div>
          ) : (
            <Viewer3D />
          )}
        </section>
      </main>

      {/* Status Bar */}
      <AppStatusBar />
    </div>
  );
}

export default App;
