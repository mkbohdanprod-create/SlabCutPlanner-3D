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
import { LayoutDashboard, Scissors, Box, Layers, Play, Settings2, ZoomIn, Eye, LogOut, FolderOpen, Loader2, Edit2, UserCircle, Save, Image, Download, FileText, Calculator, Plus, Trash } from 'lucide-react';
import { downloadTextFile } from './utils/file';
import { exportProjectPng } from './utils/export';
import { PdfExportDialog } from './components/ui/PdfExportDialog';
import { LanguageDomTranslator } from './components/ui/LanguageDomTranslator';
import { useAuth } from './components/auth/AuthContext';
import { LoginModal } from './components/auth/LoginModal';
import { ProjectsDashboard } from './components/ui/ProjectsDashboard';
import { CommercialQuoteDialog } from './components/ui/CommercialQuoteDialog';
import { HelpDialog } from './components/ui/HelpDialog';
import { ServiceDialog } from './components/ui/ServiceDialog';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { BugReporterDialog } from './components/ui/BugReporterDialog';

import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { blackbox } from './utils/blackbox';
import * as rrweb from 'rrweb';

function App() {
  const setMainView = useUIStore((s) => s.setMainView);
  const mainView = useUIStore((s) => s.mainView);
  const set3dAssemblyMode = useUIStore((s) => s.set3dAssemblyMode);
  const updateProjectHeader = useProjectStore((s) => s.updateProjectHeader);
  const initialize = useProjectStore(s => s.initialize);
  const undoLastMovement = useProjectStore(s => s.undoLastMovement);
  const redoMovement = useProjectStore(s => s.redoMovement);
  const currentDbProjectId = useProjectStore(s => s.currentDbProjectId);
  const project = useProjectStore(s => s.project);
  const isInitialized = useProjectStore(s => s.isInitialized);
  const isPacking = useProjectStore(s => s.isPacking);
  const clearCalculation = useProjectStore(s => s.clearCalculation);
  const setUiLanguage = useProjectStore((s) => s.setUiLanguage);
  const language = useUIStore((s) => s.language);
  const { user, signOut } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const { isQuoteOpen, setIsQuoteOpen } = useUIStore();
  const [isHeaderEditOpen, setIsHeaderEditOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isSaveOpen, setIsSaveMenuOpen] = useState(false);
  const [isLoadOpen, setIsLoadMenuOpen] = useState(false);
  const [isExportOpen, setIsExportMenuOpen] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const isRecordingBug = useUIStore(s => s.isRecordingBug);
  const setIsRecordingBug = useUIStore(s => s.setIsRecordingBug);
  const setIsBugReporterOpen = useUIStore(s => s.setIsBugReporterOpen);
  const setRrwebEvents = useUIStore(s => s.setRrwebEvents);

  const langLabels: Record<string, string> = { uk: 'UA', en: 'EN', pl: 'PL' };
  const fullLangLabels: Record<string, string> = { uk: 'Українська', en: 'English', pl: 'Polski' };

  const exportProject = useProjectStore((s) => s.exportProject);

  const handleSaveProject = () => {
    const createdAt = project.versions?.[0]?.timestamp ?? project.updatedAt;
    const stamp = new Date(createdAt).toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
    const safeOrder = (project.orderNumber || 'без номера').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ');
    const safeCustomer = (project.customer || 'без контрагента').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ');
    const fileName = `${safeOrder}_${safeCustomer}_${stamp}.json`;
    downloadTextFile(fileName, exportProject());
  };

  useEffect(() => {
    initialize().catch(console.error);
    blackbox.init();
  }, [initialize]);

  useEffect(() => {
    let stopFn: (() => void) | null = null;
    if (isRecordingBug) {
      const events: any[] = [];
      stopFn = rrweb.record({
        emit(event) {
          events.push(event);
        },
      });
      setRrwebEvents(events);
    }
    return () => {
      if (stopFn) stopFn();
    };
  }, [isRecordingBug, setRrwebEvents]);

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
      if (event.ctrlKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        const state = useUIStore.getState();
        if (state.isRecordingBug) {
          state.setIsBugReporterOpen(true);
        } else {
          state.setIsRecordingBug(true);
        }
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
    <div className={`flex h-screen w-full flex-col bg-[var(--bg-main)] font-sans transition-all duration-300 ${isRecordingBug ? 'border-4 border-red-500 box-border' : ''}`}>
      {isRecordingBug && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[100] bg-red-500 text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg animate-pulse pointer-events-none flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white"></div>
          Йде запис багу... Натисніть кнопку-жука щоб відправити
        </div>
      )}
      <LanguageDomTranslator />
      {/* Головне меню */}
      <header className="h-[60px] min-h-[60px] bg-[#303f50] flex items-center px-4 sticky top-0 z-50">
        <div className="flex items-center flex-1">
          <div className="flex items-center gap-2.5 mr-4">
            <div className="w-8 h-8 bg-[var(--accent-color)] rounded-md flex items-center justify-center shadow-sm">
              <Layers className="text-white w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold text-[var(--header-text)] tracking-tight">
              SlabCutPlanner
            </h1>
          </div>
          <div className="h-6 w-px bg-white/10 mx-4"></div>
          
          <div className="relative">
            <button 
              onClick={() => setIsHeaderEditOpen(!isHeaderEditOpen)}
              className="flex items-center gap-2 !text-[#0084ff] hover:!text-[#006bce] !bg-transparent !border-transparent transition-colors group shadow-none h-[60px]"
              title="Редагувати номер замовлення та контрагента"
            >
              <span className="text-lg font-bold tracking-wide" style={{ fontFamily: 'Roboto, sans-serif' }}>
                {[project.orderNumber, project.customer].filter(Boolean).join(' | ') || project.name || 'Без назви'}
              </span>
            </button>
            {isHeaderEditOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsHeaderEditOpen(false)}></div>
                <div className="absolute top-[60px] left-0 p-4 bg-white rounded-b-md shadow-lg border border-slate-200 z-50 flex flex-col gap-3 min-w-[250px]">
                  <div>
                    <label className="text-xs text-slate-500 font-bold mb-1 block">НОМЕР ЗАМОВЛЕННЯ</label>
                    <input 
                      type="text" 
                      value={project.orderNumber || ''} 
                      onChange={(e) => updateProjectHeader({ orderNumber: e.target.value })}
                      className="w-full h-8 px-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-[#0084ff]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-bold mb-1 block">КОНТРАГЕНТ</label>
                    <input 
                      type="text" 
                      value={project.customer || ''} 
                      onChange={(e) => updateProjectHeader({ customer: e.target.value })}
                      className="w-full h-8 px-2 border border-slate-300 rounded-sm text-sm outline-none focus:border-[#0084ff]"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center Controls */}
        <div className="flex items-center justify-center flex-1 gap-2">
          <div className="relative">
            <button 
              onClick={() => { alert('Функція створення нового проєкту буде додана незабаром.'); }}
              className="flex items-center justify-center w-12 h-12 !text-white !bg-transparent !border-transparent hover:!bg-white/10 rounded-sm transition-colors shadow-none"
              title="Додати новий проєкт"
            >
              <Plus className="w-[36px] h-[36px] stroke-[1.5]" />
            </button>
          </div>

          <div className="relative">
            <button 
              onClick={() => { setIsSaveMenuOpen(!isSaveOpen); setIsLoadMenuOpen(false); setIsExportMenuOpen(false); setIsLangOpen(false); }}
              className="flex items-center justify-center w-12 h-12 !text-white !bg-transparent !border-transparent hover:!bg-white/10 rounded-sm transition-colors shadow-none"
              title="Зберегти проєкт"
            >
              <Save className="w-[36px] h-[36px] stroke-[1.5]" />
            </button>
            {isSaveOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSaveMenuOpen(false)}></div>
                <div className="absolute top-10 right-0 bg-white rounded-sm shadow-lg border border-slate-200 z-50 flex flex-col py-1 min-w-[260px]">
                  <button
                    onClick={() => {
                      alert('Автозбереження в кабінеті працює у фоновому режимі при будь-якій зміні.');
                      setIsSaveMenuOpen(false);
                    }}
                    className="px-4 py-2 text-sm text-left hover:bg-slate-100 transition-colors shadow-none !border-none !text-slate-700 !bg-transparent flex items-center gap-2"
                  >
                    <UserCircle className="w-4 h-4 shrink-0" />
                    Зберегти в Особистому кабінеті
                  </button>
                  <button
                    onClick={() => {
                      handleSaveProject();
                      setIsSaveMenuOpen(false);
                    }}
                    className="px-4 py-2 text-sm text-left hover:bg-slate-100 transition-colors shadow-none !border-none !text-slate-700 !bg-transparent flex items-center gap-2"
                  >
                    <Save className="w-4 h-4 shrink-0" />
                    Завантажити на комп'ютер (JSON)
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button 
              onClick={() => { setIsLoadMenuOpen(!isLoadOpen); setIsSaveMenuOpen(false); setIsExportMenuOpen(false); setIsLangOpen(false); }}
              className="flex items-center justify-center w-12 h-12 !text-white !bg-transparent !border-transparent hover:!bg-white/10 rounded-sm transition-colors shadow-none"
              title="Мої проєкти / Завантажити"
            >
              <FolderOpen className="w-[36px] h-[36px] stroke-[1.5]" />
            </button>
            {isLoadOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsLoadMenuOpen(false)}></div>
                <div className="absolute top-10 right-0 bg-white rounded-sm shadow-lg border border-slate-200 z-50 flex flex-col py-1 min-w-[260px]">
                  <button
                    onClick={() => {
                      setIsProjectsOpen(true);
                      setIsLoadMenuOpen(false);
                    }}
                    className="px-4 py-2 text-sm text-left hover:bg-slate-100 transition-colors shadow-none !border-none !text-slate-700 !bg-transparent flex items-center gap-2"
                  >
                    <UserCircle className="w-4 h-4 shrink-0" />
                    Відкрити з Особистого кабінету
                  </button>
                  <label
                    className="px-4 py-2 text-sm text-left hover:bg-slate-100 transition-colors shadow-none !border-none !text-slate-700 !bg-transparent flex items-center gap-2 cursor-pointer m-0 font-normal h-auto"
                  >
                    <FolderOpen className="w-4 h-4 shrink-0" />
                    Завантажити з комп'ютера (JSON)
                    <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const { readFileAsText } = await import('./utils/file');
                      const text = await readFileAsText(file);
                      useProjectStore.getState().importProject(JSON.parse(text));
                      setIsLoadMenuOpen(false);
                    }} />
                  </label>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button 
              onClick={() => { setIsExportMenuOpen(!isExportOpen); setIsSaveMenuOpen(false); setIsLoadMenuOpen(false); setIsLangOpen(false); }}
              className="flex items-center justify-center w-12 h-12 !text-white !bg-transparent !border-transparent hover:!bg-white/10 rounded-sm transition-colors shadow-none"
              title="Експорт та Звіти"
            >
              <Download className="w-[36px] h-[36px] stroke-[1.5]" />
            </button>
            {isExportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsExportMenuOpen(false)}></div>
                <div className="absolute top-10 right-0 bg-white rounded-sm shadow-lg border border-slate-200 z-50 flex flex-col py-1 min-w-[220px]">
                  <button
                    onClick={() => {
                      exportProjectPng(project, useProjectStore.getState().parts);
                      setIsExportMenuOpen(false);
                    }}
                    className="px-4 py-2 text-sm text-left hover:bg-slate-100 transition-colors shadow-none !border-none !text-slate-700 !bg-transparent flex items-center gap-2"
                  >
                    <Image className="w-4 h-4 shrink-0" />
                    Експортувати PNG
                  </button>
                  <button
                    onClick={() => {
                      setPdfDialogOpen(true);
                      setIsExportMenuOpen(false);
                    }}
                    className="px-4 py-2 text-sm text-left hover:bg-slate-100 transition-colors shadow-none !border-none !text-slate-700 !bg-transparent flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    Експортувати PDF
                  </button>
                  <button
                    onClick={() => {
                      alert('Механізм експорту DXF буде розроблено пізніше');
                      setIsExportMenuOpen(false);
                    }}
                    className="px-4 py-2 text-sm text-left hover:bg-slate-100 transition-colors shadow-none !border-none !text-slate-700 !bg-transparent flex items-center gap-2"
                  >
                    <Box className="w-4 h-4 shrink-0" />
                    Експортувати DXF
                  </button>
                  <div className="h-px bg-slate-200 my-1 mx-2"></div>
                  <button
                    onClick={() => {
                      setIsQuoteOpen(true);
                      setIsExportMenuOpen(false);
                    }}
                    className="px-4 py-2 text-sm text-left hover:bg-slate-100 transition-colors shadow-none !border-none !text-slate-700 !bg-transparent flex items-center gap-2"
                  >
                    <Calculator className="w-4 h-4 shrink-0" />
                    Комерційна пропозиція
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button 
              className="flex items-center justify-center w-12 h-12 !text-white !bg-transparent !border-transparent hover:!bg-white/10 rounded-sm transition-colors shadow-none disabled:opacity-50"
              title="Очистити розрахунок"
              onClick={() => {
                useUIStore.getState().showConfirm({
                  title: 'Очистити розрахунок',
                  message: 'Ви впевнені, що хочете очистити розрахунок? Всі розміщені деталі будуть повернуті до списку нерозміщених.',
                  confirmText: 'Очистити',
                  isDestructive: true,
                  onConfirm: () => clearCalculation()
                });
              }}
              disabled={isPacking}
            >
              <Trash className="w-[36px] h-[36px] stroke-[1.5]" />
            </button>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center justify-end flex-1 gap-2">
          <HeaderToolbar />
          
          <div className="h-6 w-px bg-white/10 mx-2"></div>

          <div className="relative">
            <button
              onClick={() => setIsLangOpen(!isLangOpen)}
              className="flex items-center justify-center w-8 h-8 !text-white !bg-transparent !border-transparent hover:!bg-white/10 rounded-sm transition-colors text-xs font-bold shadow-none"
              title="Змінити мову"
            >
              {langLabels[language || 'uk'] || 'UA'}
            </button>
            {isLangOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsLangOpen(false)}></div>
                <div className="absolute top-10 right-0 bg-white rounded-sm shadow-lg border border-slate-200 z-50 flex flex-col py-1 min-w-[120px]">
                  {Object.entries(fullLangLabels).map(([code, label]) => (
                    <button
                      key={code}
                      onClick={() => {
                        setUiLanguage(code as any);
                        setIsLangOpen(false);
                      }}
                      className={`px-4 py-2 text-sm text-left hover:bg-slate-100 transition-colors shadow-none !border-none ${language === code ? '!text-[#0084ff] font-bold bg-blue-50/50' : '!text-slate-700 !bg-transparent'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {user ? (
            <button 
              onClick={signOut}
              className="flex items-center gap-2 !text-white hover:!text-white/80 transition-colors group ml-2 !bg-transparent !border-transparent shadow-none"
              title={`Вийти: ${user.email}`}
            >
              <span className="text-sm font-semibold">{user.email?.split('@')[0] || 'Користувач'}</span>
              <div className="w-8 h-8 flex items-center justify-center !bg-[#0084ff] group-hover:!bg-[#006bce] rounded-sm transition-colors">
                <UserCircle className="w-5 h-5 !text-white" />
              </div>
            </button>
          ) : (
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="w-8 h-8 flex items-center justify-center !text-white !bg-white/10 hover:!bg-white/20 rounded-sm transition-colors !border-transparent shadow-none"
              title="Увійти"
            >
              <UserCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>
      
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
      <ProjectsDashboard isOpen={isProjectsOpen} onClose={() => setIsProjectsOpen(false)} />
      <CommercialQuoteDialog />
      <PdfExportDialog open={pdfDialogOpen} project={project} parts={useProjectStore.getState().parts} onClose={() => setPdfDialogOpen(false)} />
      <HelpDialog />
      <ServiceDialog />
      <ConfirmDialog />
      <BugReporterDialog />

      {/* Main Content Workspace */}
      <main className="flex-1 min-h-0 overflow-hidden flex p-4 gap-4">
        {/* Left Sidebar - Tools & Parts */}
        {mainView === '2d' ? <Sidebar /> : <Sidebar3D />}

        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {/* Canvas Tabs */}
          <div className="flex items-end z-10 relative bg-[#f0f3f5] pt-2 px-4 border-b border-[var(--border-color)]">
            <button
              onClick={() => {
                setMainView('2d');
                useUIStore.getState().setFloatingPreviewOpen(false);
              }}
              className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ${
                mainView === '2d' && !useUIStore.getState().isFloatingPreviewOpen
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
                setMainView('texture');
                useUIStore.getState().setFloatingPreviewOpen(false);
              }}
              className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-1 ${
                mainView === 'texture' && !useUIStore.getState().isFloatingPreviewOpen
                  ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]' 
                  : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
              }`}
              style={{ fontFamily: 'Roboto, sans-serif' }}
            >
              <Image className="w-4 h-4" /> Підбір текстури
            </button>
            <button
              onClick={() => {
                setMainView('3d');
                set3dAssemblyMode(true);
                useUIStore.getState().setFloatingPreviewOpen(false);
              }}
              className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-1 ${
                mainView === '3d' && useUIStore.getState().is3dAssemblyMode
                  ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]' 
                  : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
              }`}
              style={{ fontFamily: 'Roboto, sans-serif' }}
            >
              <Box className="w-4 h-4" /> 3D Редактор
            </button>
            <button
              onClick={() => {
                setMainView('2d');
                useUIStore.getState().setFloatingPreviewMode('3d');
                useUIStore.getState().setFloatingPreviewOpen(true);
              }}
              className={`px-6 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 relative top-[1px] ml-1 ${
                useUIStore.getState().isFloatingPreviewOpen
                  ? 'bg-white border border-[var(--border-color)] border-b-white text-[var(--accent-color)] shadow-[0_-2px_4px_rgba(0,0,0,0.03)]' 
                  : 'bg-[#e2e6ea] border border-[#dce1e6] border-b-[var(--border-color)] text-[#6b778c] hover:bg-[#d5dbe0]'
              }`}
              style={{ fontFamily: 'Roboto, sans-serif' }}
            >
              <Eye className="w-4 h-4" /> 3D Прев'ю
            </button>
            
          </div>

          {/* Center Canvas Area */}
          <section className="flex-1 min-h-0 bg-white rounded-b-sm rounded-tr-sm shadow-sm border border-slate-300 border-t-0 overflow-y-auto custom-scrollbar flex flex-col p-4 gap-4 relative workspace z-0">
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
          ) : mainView === 'texture' ? (
            <div className="flex flex-col gap-4 h-full relative">
              <ErrorBoundary componentName="TextureLayoutPanel">
                <TextureLayoutPanel />
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
        </div>
      </main>

      {/* Status Bar */}
      <AppStatusBar />
    </div>
  );
}

export default App;
