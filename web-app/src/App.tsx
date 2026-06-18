import React, { useEffect, useState, Suspense, lazy } from 'react';
import { useUIStore } from './store/useStore';
import { useProjectStore } from './store/useProjectStore';
import { SlabBoard } from './components/2d/SlabBoard';
import { Viewer3D } from './components/3d/Viewer3DLazy';
import { Sidebar } from './components/ui/Sidebar';
import { Sidebar3D } from './components/ui/Sidebar3D';
import { UnplacedPartsPanel } from './components/ui/UnplacedPartsPanel';
import { TextureLayoutPanel } from './components/ui/TextureLayoutPanel';
import { HeaderToolbar } from './components/ui/HeaderToolbar';
import { AppStatusBar } from './components/ui/AppStatusBar';
import { Settings, Layers, Box, Package, Download, UserCircle, LogOut, FolderOpen, Loader2 } from 'lucide-react';
import { LanguageDomTranslator } from './components/ui/LanguageDomTranslator';
import { useAuth } from './components/auth/AuthContext';
import { LoginModal } from './components/auth/LoginModal';
import { ProjectsDashboard } from './components/ui/ProjectsDashboard';

import { ErrorBoundary } from './components/ui/ErrorBoundary';

function App() {
  const { mainView, setMainView } = useUIStore();
  const initialize = useProjectStore(s => s.initialize);
  const undoLastMovement = useProjectStore(s => s.undoLastMovement);
  const redoMovement = useProjectStore(s => s.redoMovement);
  const currentDbProjectId = useProjectStore(s => s.currentDbProjectId);
  const isInitialized = useProjectStore(s => s.isInitialized);
  const { user, signOut } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);

  useEffect(() => {
    initialize().catch(console.error);
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

  if (!isInitialized) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 font-sans text-slate-500 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        <span className="font-medium text-lg">Завантаження проєкту...</span>
      </div>
    );
  }

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

          {/* Right Controls */}
          <div className="flex items-center gap-4">
            <HeaderToolbar />
            <div className="h-8 w-px bg-slate-200 mx-2"></div>
            
            {user && (
              <button
                onClick={() => setIsProjectsOpen(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  currentDbProjectId 
                    ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' 
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FolderOpen className="w-4 h-4" />
                <span className="max-w-[120px] truncate">
                  {currentDbProjectId ? 'Хмарний проект' : 'Локальний проект'}
                </span>
              </button>
            )}

            {user ? (
              <div className="flex items-center gap-3 ml-2">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-medium text-slate-700">{user.email}</span>
                  <button 
                    onClick={signOut}
                    className="text-[10px] text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" /> Вийти
                  </button>
                </div>
                <UserCircle className="w-8 h-8 text-blue-600" />
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors border border-slate-300"
              >
                <UserCircle className="w-5 h-5" />
                Увійти
              </button>
            )}
          </div>
      </header>
      
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
      <ProjectsDashboard isOpen={isProjectsOpen} onClose={() => setIsProjectsOpen(false)} />

      {/* Main Content Workspace */}
      <main className="flex-1 min-h-0 overflow-hidden flex p-4 gap-4">
        {/* Left Sidebar - Tools & Parts */}
        {mainView === '2d' ? <Sidebar /> : <Sidebar3D />}

        {/* Center Canvas Area */}
        <section className="flex-1 min-h-0 min-w-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-y-auto custom-scrollbar flex flex-col p-4 gap-4 relative workspace">
          {mainView === '2d' ? (
            <div className="flex flex-col gap-4 min-h-min">
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
          ) : (
            <ErrorBoundary componentName="Viewer3D">
              <Suspense fallback={
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-100 text-slate-500 w-full h-full gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="font-medium">Завантаження 3D-движка...</span>
                </div>
              }>
                <Viewer3D />
              </Suspense>
            </ErrorBoundary>
          )}
        </section>
      </main>

      {/* Status Bar */}
      <AppStatusBar />
    </div>
  );
}

export default App;
