import { useEffect, useState } from 'react';
import { useUIStore, type PaneView } from './store/useStore';
import { useProjectStore } from './store/useProjectStore';
import { Sidebar } from './components/ui/Sidebar';
import { Sidebar3D } from './components/ui/Sidebar3D';
import { useIsMobile } from './hooks/useIsMobile';
import { MobileBottomNav } from './components/mobile/MobileBottomNav';
import { MobileSheet } from './components/mobile/MobileSheet';
import { HeaderToolbar } from './components/ui/HeaderToolbar';
import { AppStatusBar } from './components/ui/AppStatusBar';
import { Scissors, FolderOpen, Loader2, UserCircle, Save, Image, Download, FileText, Plus, Box, Calculator, Trash, Eye, LayoutDashboard, Layers, Settings2, ZoomIn, LogOut, Edit2, Play, Undo2, Redo2 } from 'lucide-react';
import { downloadTextFile } from './utils/file';
import { exportProjectPng } from './utils/export';
import { PdfExportDialog } from './components/ui/PdfExportDialog';
import { LanguageDomTranslator } from './components/ui/LanguageDomTranslator';
import { ProjectsDashboard } from './components/ui/ProjectsDashboard';
import { CommercialQuoteDialog } from './components/ui/CommercialQuoteDialog';
import { HelpDialog } from './components/ui/HelpDialog';
import { useAuth } from './components/auth/AuthContext';
import { LoginModal } from './components/auth/LoginModal';
import { NewProjectDialog } from './components/ui/NewProjectDialog';
import { ServiceDialog } from './components/ui/ServiceDialog';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { BugReporterDialog } from './components/ui/BugReporterDialog';
import { WorkspacePane } from './components/WorkspacePane';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { ProjectLoadingOverlay } from './components/ui/ProjectLoadingOverlay';
import { AddProductWorkspace } from './components/ui/AddProductWorkspace';
import { ProductEditorWorkspace } from './components/ui/ProductEditorWorkspace';
import { SettingsModal } from './components/ui/SettingsModal';
import { EdgeProfileSettingsModal } from './components/ui/EdgeProfileSettingsModal';
import { EdgeProfileCatalogHost } from './components/ui/EdgeProfileCatalog';

import { blackbox } from './utils/blackbox';
// rrweb НЕ імпортується вгорі навмисне: блокувальники реклами (uBlock/AdGuard)
// ріжуть запит із назвою rrweb.js → модуль App не вантажився і сторінка лишалась
// біла. Тепер бібліотека підвантажується лише коли реально почали запис багу.

function App() {
  const setMainView = useUIStore((s) => s.setMainView);
  const mainView = useUIStore((s) => s.mainView);
  const isAddProductMode = useUIStore((s) => s.isAddProductMode);
  const isProductEditorMode = useUIStore((s) => s.productEditorSession !== null);
  const splitLeftView = useUIStore((s) => s.splitLeftView);
  const setSplitLeftView = useUIStore((s) => s.setSplitLeftView);
  const splitRightView = useUIStore((s) => s.splitRightView);
  const setSplitRightView = useUIStore((s) => s.setSplitRightView);
  const splitRatio = useUIStore((s) => s.splitRatio);
  const setSplitRatio = useUIStore((s) => s.setSplitRatio);

  // ── Мобільний режим ──────────────────────────────────────────────
  // Ліва панель на телефоні приходить знизу поверх креслення і йде геть:
  // ділити вузький екран між нею і робочою областю немає з чого.
  const isMobile = useIsMobile();
  const [toolsOpen, setToolsOpen] = useState(false);

  // «Спліт» на телефоні безглуздий — дві панелі по 180 px нечитабельні.
  useEffect(() => {
    if (isMobile && mainView === 'split') setMainView(splitLeftView);
  }, [isMobile, mainView, splitLeftView, setMainView]);
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
  const newProject = useProjectStore(s => s.newProject);
  const setUiLanguage = useProjectStore((s) => s.setUiLanguage);
  const language = useProjectStore((s) => s.project.uiLanguage);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const { isQuoteOpen, setIsQuoteOpen, isEdgeProfileSettingsOpen, setIsEdgeProfileSettingsOpen } = useUIStore();
  const [isHeaderEditOpen, setIsHeaderEditOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isSaveOpen, setIsSaveMenuOpen] = useState(false);
  const [isLoadOpen, setIsLoadMenuOpen] = useState(false);
  const [isExportOpen, setIsExportMenuOpen] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  // Keycloak-сесія: бейдж користувача в шапці і вхід для збережених проєктів
  const { user, signOut, backend } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const isRecordingBug = useUIStore(s => s.isRecordingBug);
  const setIsRecordingBug = useUIStore(s => s.setIsRecordingBug);
  const setIsBugReporterOpen = useUIStore(s => s.setIsBugReporterOpen);
  const setRrwebEvents = useUIStore(s => s.setRrwebEvents);

  const [popupActiveView, setPopupActiveView] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('popup')
  );

  /**
   * Що саме зникне при створенні нового проєкту. Рахуємо просте й видиме:
   * вироби, окремі деталі (DXF/бланк/ручні) і сляби. Порожній проєкт —
   * той, у якому нічого з цього немає і номер замовлення ще не вписаний.
   */
  const productCount = project.products?.length ?? 0;
  const detailCount = project.details?.length ?? 0;
  const slabCount = project.slabs?.length ?? 0;
  const isProjectEmpty = productCount === 0 && detailCount === 0
    && !project.orderNumber?.trim() && !project.customer?.trim();
  /**
   * «1 виробів» у вікні, яке попереджає про втрату роботи, читається як
   * недбалість — тому відмінюємо. Кожна форма покрита шаблоном у
   * i18nPatterns: склеєний із числом рядок точним словником не взяти.
   */
  const plural = (count: number, one: string, few: string, many: string) => {
    const mod100 = count % 100;
    const mod10 = count % 10;
    if (mod100 >= 11 && mod100 <= 14) return `${count} ${many}`;
    if (mod10 === 1) return `${count} ${one}`;
    if (mod10 >= 2 && mod10 <= 4) return `${count} ${few}`;
    return `${count} ${many}`;
  };
  const projectSummary = [
    productCount ? plural(productCount, 'виріб', 'вироби', 'виробів') : '',
    detailCount ? plural(detailCount, 'деталь', 'деталі', 'деталей') : '',
    slabCount ? plural(slabCount, 'слеб', 'слеби', 'слебів') : '',
  ].filter(Boolean).join(' · ') || 'порожній проєкт';

  const langLabels: Record<string, string> = { uk: 'UA', en: 'EN', pl: 'PL' };
  const fullLangLabels: Record<string, string> = { uk: 'Українська', en: 'English', pl: 'Polski' };

  const exportProject = useProjectStore((s) => s.exportProject);
  const canUndo = useProjectStore((s) => s.history.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const canUndoSession = useUIStore((s) => s.sessionHistory.length > 0);
  const canRedoSession = useUIStore((s) => s.sessionFuture.length > 0);

  const handleSaveProject = () => {
    const createdAt = project.versions?.[0]?.timestamp ?? project.updatedAt;
    const stamp = new Date(createdAt).toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
    const safeOrder = (project.orderNumber || 'без номера').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ');
    // Контрагент може бути заповнений лише в прорахунку — ім'я файла це враховує
    const safeCustomer = (project.customer || project.quoteCalc?.contragent || 'без контрагента').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ');
    const fileName = `${safeOrder}_${safeCustomer}_${stamp}.json`;
    downloadTextFile(fileName, exportProject());
  };

  /**
   * Ctrl+Z / Ctrl+Y (і Cmd на маку) — глобальний undo/redo проєкту.
   *
   * Два свідомі запобіжники:
   *  · у полі вводу хоткей НЕ перехоплюється — там має працювати рідний
   *    текстовий undo браузера, інакше виправлення одруку в назві
   *    відкочувало б виріз;
   *  · при відкритому редакторі виробу глобальний відкат заглушений: сесія
   *    редактора живе окремо від проєкту, і відкат проєкту «під ногами»
   *    редактора дав би розсинхрон — для чернетки там є своя кнопка
   *    «Скасувати».
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;

      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;

      e.preventDefault();
      const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
      // У редакторі виробу відкочується СЕСІЯ (стик, виріз, розмір чернетки),
      // поза ним — проєкт. Два стеки не перетинаються.
      if (useUIStore.getState().productEditorSession !== null) {
        if (isRedo) useUIStore.getState().redoSession();
        else useUIStore.getState().undoSession();
        return;
      }
      const store = useProjectStore.getState();
      if (isRedo) store.redo();
      else store.undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    initialize();
    blackbox.init();

    // Cross-tab sync for popups
    const channel = new BroadcastChannel('slabcutplanner-sync');
    channel.onmessage = (event) => {
      if (event.data === 'sync') {
        const isPopup = new URLSearchParams(window.location.search).has('popup');
        if (isPopup) {
          initialize();
        }
      }
    };
    return () => channel.close();
  }, [initialize]);

  useEffect(() => {
    if (!isRecordingBug) return;
    let stopFn: (() => void) | undefined = undefined;
    let cancelled = false;
    const events: any[] = [];
    setRrwebEvents(events);
    // Динамічний імпорт: якщо блокувальник реклами заріже rrweb —
    // впаде лише запис дій, а не весь застосунок.
    import('rrweb')
      .then((rrweb) => {
        if (cancelled) return;
        stopFn = rrweb.record({
          emit(event) {
            events.push(event);
          },
        });
      })
      .catch((err) => {
        console.warn('rrweb недоступний, запис дій вимкнено:', err);
      });
    return () => {
      cancelled = true;
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

  if (popupActiveView) {
    // ?popup= приходить із адресного рядка, тобто ззовні. Старі значення
    // ('true', '3d-preview') лишились у збережених посиланнях, а невідоме
    // краще звести до розкрою, ніж показати порожнє вікно.
    const POPUP_VIEWS: PaneView[] = ['2d', '3d', 'texture', 'estimate', 'quote'];
    const activeView: PaneView = POPUP_VIEWS.includes(popupActiveView as PaneView)
      ? (popupActiveView as PaneView)
      : (popupActiveView === 'true' || popupActiveView === '3d-preview' ? '3d' : '2d');
    return (
      <div className="flex h-screen w-full flex-col bg-[var(--bg-main)] font-sans">
        <LanguageDomTranslator />
        <WorkspacePane
          view={activeView}
          onChangeView={(newView) => {
            if (newView === 'split') return; // Split mode is disabled in popup
            setPopupActiveView(newView);
            const url = new URL(window.location.href);
            url.searchParams.set('popup', newView);
            window.history.replaceState({}, '', url);
          }} 
          isSplitModeActive={false} 
          onToggleSplit={() => {}} 
        />
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
              <h1 className="flex items-center ml-1 text-white">
                <span className="font-medium text-2xl tracking-tighter leading-none pt-1">viyar</span>
                <span className="font-normal text-2xl tracking-tight leading-none ml-1.5 pt-1">stone</span>
                <span className="font-bold text-sm tracking-widest leading-none ml-1.5">3D</span>
              </h1>
          </div>
          <div className="h-6 w-px bg-white/10 mx-4"></div>
          
          <div className="relative">
            <button 
              onClick={() => setIsHeaderEditOpen(!isHeaderEditOpen)}
              className="flex items-center gap-2 !text-white hover:!text-white/80 !bg-transparent !border-transparent transition-colors group shadow-none h-[60px]"
              title="Редагувати номер замовлення та контрагента"
            >
              <span className="text-lg font-bold tracking-wide" style={{ fontFamily: 'Roboto, sans-serif' }}>
                {[project.orderNumber, project.customer].filter(Boolean).join(' | ') || project.orderNumber || 'Без назви'}
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
                    {/* Довідник контрагентів живе лише на вкладці «Прорахунок»
                        і сюди НЕ пише: у шапці це самостійне поле, яке менеджер
                        веде руками. Документи беруть те, що заповнене — шапку
                        або прорахунок (див. utils/export). */}
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
          {/* Undo / Redo. Поза редактором — історія проєкту; всередині
              редактора виробу — історія сесії (стик, виріз, розмір), причому
              кроками є лише реальні дії, а не вибір деталі чи ракурс. */}
          <div className="flex items-center gap-0.5 mr-1">
            <button
              onClick={() => {
                if (isProductEditorMode) useUIStore.getState().undoSession();
                else useProjectStore.getState().undo();
              }}
              disabled={isProductEditorMode ? !canUndoSession : !canUndo}
              className="flex items-center justify-center w-12 h-12 !text-white !bg-transparent !border-transparent hover:!bg-white/10 rounded-sm transition-all shadow-none disabled:opacity-25 disabled:hover:!bg-transparent disabled:cursor-default"
              title="Скасувати (Ctrl+Z)"
            >
              <Undo2 className="w-[30px] h-[30px] stroke-[1.5]" />
            </button>
            <button
              onClick={() => {
                if (isProductEditorMode) useUIStore.getState().redoSession();
                else useProjectStore.getState().redo();
              }}
              disabled={isProductEditorMode ? !canRedoSession : !canRedo}
              className="flex items-center justify-center w-12 h-12 !text-white !bg-transparent !border-transparent hover:!bg-white/10 rounded-sm transition-all shadow-none disabled:opacity-25 disabled:hover:!bg-transparent disabled:cursor-default"
              title="Повернути (Ctrl+Y)"
            >
              <Redo2 className="w-[30px] h-[30px] stroke-[1.5]" />
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => {
                // Порожній проєкт нема чого рятувати — не смикаємо менеджера
                // діалогом там, де втрачати нічого.
                if (isProjectEmpty) newProject();
                else setNewProjectDialogOpen(true);
              }}
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
                      setIsLoadMenuOpen(false);
                      // Кроки видно людині: на проєкті з фото слебів читання
                      // і розбір JSON — це мегабайти й помітні секунди.
                      const { runWithProgress } = await import('./lib/loadWithProgress');
                      const { readFileAsText } = await import('./utils/file');
                      await runWithProgress<{ text: string; data: unknown }>(
                        file.name,
                        { text: '', data: null },
                        [
                          { label: 'Читаю файл із диска…', run: async (v) => ({ ...v, text: await readFileAsText(file) }) },
                          { label: 'Розбираю проєкт…', run: (v) => ({ ...v, data: JSON.parse(v.text) }) },
                          { label: 'Розгортаю деталі й розкладку…', run: (v) => {
                            useProjectStore.getState().importProject(v.data as never);
                            return v;
                          } },
                        ],
                      ).catch((err) => {
                        console.error('Не вдалося відкрити проєкт:', err);
                        window.alert('Не вдалося відкрити проєкт: файл пошкоджений або це не проєкт Viyar Stone 3D.');
                      });
                      e.target.value = '';
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

          <div className="relative">
            <button 
              className="flex items-center justify-center w-12 h-12 !text-white !bg-transparent !border-transparent hover:!bg-white/10 rounded-sm transition-colors shadow-none"
              title="Довідник Обробок"
              onClick={() => setIsEdgeProfileSettingsOpen(true)}
            >
              <Scissors className="w-[36px] h-[36px] stroke-[1.5]" />
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
          ) : backend === 'absent' ? (
            /* Демо без бекенда — кнопки входу немає, входити нема куди */
            null
          ) : (
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="w-8 h-8 flex items-center justify-center !text-white !bg-white/10 hover:!bg-white/20 rounded-sm transition-colors !border-transparent shadow-none ml-2"
              title="Увійти"
            >
              <UserCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>
      
      <ProjectsDashboard isOpen={isProjectsOpen} onClose={() => setIsProjectsOpen(false)} />
      <CommercialQuoteDialog open={isQuoteOpen} onClose={() => setIsQuoteOpen(false)} />
      <PdfExportDialog open={pdfDialogOpen} project={project} parts={useProjectStore.getState().parts} onClose={() => setPdfDialogOpen(false)} />
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
      <HelpDialog />
      {newProjectDialogOpen && (
        <NewProjectDialog
          summary={projectSummary}
          onSaveAndCreate={() => {
            // Спершу файл на диск, і лише потім знищення: якщо збереження
            // впаде (відмова в діалозі браузера), проєкт має лишитись.
            handleSaveProject();
            setNewProjectDialogOpen(false);
            newProject();
          }}
          onCreateAnyway={() => { setNewProjectDialogOpen(false); newProject(); }}
          onClose={() => setNewProjectDialogOpen(false)}
        />
      )}
      <ProjectLoadingOverlay />
      <ServiceDialog />
      <ConfirmDialog />
      <BugReporterDialog />

      {/* Main Content Workspace */}
      {/* НАВІГАЦІЯ СТОЇТЬ НА МІСЦІ (27.08). Смуга вкладок — над усією
          робочою областю, на всю ширину вікна і по центру. Раніше вона
          жила всередині правої панелі, а та міняла ширину разом із лівим
          меню (на «Прорахунку» його немає зовсім) — і група вкладок
          стрибала вправо-вліво на кожному перемиканні. У «Спліті» смуга
          лишається всередині кожної половини: там вона в кожної своя. */}
      {!isProductEditorMode && !isAddProductMode && mainView !== 'split' && (
        <WorkspaceTabs
          view={mainView as PaneView}
          onChangeView={setMainView}
          isSplitModeActive={false}
          onToggleSplit={() => setMainView('split')}
          centered
        />
      )}

      <main className="flex-1 min-h-0 overflow-hidden flex px-4 gap-4 relative">
        {isProductEditorMode ? (
          <ProductEditorWorkspace />
        ) : isAddProductMode ? (
          <AddProductWorkspace onClose={() => useUIStore.getState().setAddProductMode(false)} />
        ) : (
          <>
            {/* Left Sidebar - Tools & Parts.
                На «Прорахунку» сайдбара немає взагалі (26.08): панель
                «3D Збірка» там була недоречна — прорахунок працює з
                документом, а не зі сценою, і порожній стовпець зліва
                тільки відбирав ширину в таблиці розрахунку. */}
            {/* «3D Збірка» стосується лише сцени 3D Підбору. На «Підборі
                текстури», «Прорахунку» і «Послугах» лівого меню немає
                (26.08): там воно керувало сценою, якої на екрані нема, —
                зайвий стовпець, що відбирав ширину в робочої зони. */}
            {mainView === '2d' || mainView === 'split'
              ? (!isMobile && <Sidebar />)
              : mainView === '3d' ? <Sidebar3D /> : null}

            <div className="flex-1 min-h-0 min-w-0 flex flex-col relative">
          {mainView === 'split' ? (
            <div className="flex-1 flex flex-row w-full h-full min-h-0 overflow-hidden relative workspace-container">
              <div style={{ width: `${splitRatio}%`, minWidth: '20%' }} className="flex flex-col h-full min-h-0">
                <WorkspacePane
                  view={splitLeftView}
                  // «Спліт» усередині спліта — це вихід із нього, ним
                  // займається onToggleSplit; сюди він не доходить.
                  onChangeView={(next) => { if (next !== 'split') setSplitLeftView(next); }}
                  isSplitModeActive={true}
                  onToggleSplit={() => setMainView(splitLeftView)}
                />
              </div>
              
              <div 
                className="w-1.5 bg-slate-200 hover:bg-[#0084ff] active:bg-[#0084ff] cursor-col-resize flex-shrink-0 transition-colors z-20"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const startX = e.clientX;
                  const startRatio = splitRatio;
                  const onMouseMove = (moveEvent: MouseEvent) => {
                    const deltaX = moveEvent.clientX - startX;
                    const containerWidth = document.querySelector('.workspace-container')?.clientWidth || window.innerWidth - 300;
                    const deltaRatio = (deltaX / containerWidth) * 100;
                    const newRatio = Math.max(20, Math.min(80, startRatio + deltaRatio));
                    setSplitRatio(newRatio);
                  };
                  const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                  };
                  document.addEventListener('mousemove', onMouseMove);
                  document.addEventListener('mouseup', onMouseUp);
                }}
              />
              
              <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden" style={{ minWidth: '20%' }}>
                <WorkspacePane
                  view={splitRightView}
                  onChangeView={(next) => { if (next !== 'split') setSplitRightView(next); }}
                  isSplitModeActive={true}
                  onToggleSplit={() => setMainView(splitRightView)}
                />
              </div>
            </div>
          ) : (
            <WorkspacePane
              view={mainView}
              onChangeView={setMainView}
              isSplitModeActive={false}
              onToggleSplit={() => setMainView('split')}
              showTabs={false}
            />
          )}
        </div>
          </>
        )}
      </main>

      {/* ── Мобільні органи керування ─────────────────────────────
          Рендеряться лише на вузькому екрані — на десктопі їх у дереві
          немає взагалі, тому зачепити там нічого не можуть. */}
      {isMobile && (
        <>
          <MobileBottomNav
            view={mainView}
            onChange={(v) => {
              // Меню видно завжди — і в редакторі виробу теж. Тап по
              // вкладці з редактора означає «вийти і показати екран»,
              // а не «перемкнути тло під редактором».
              if (isProductEditorMode) useUIStore.getState().setProductEditorSession(null);
              if (isAddProductMode) useUIStore.getState().setAddProductMode(false);
              setMainView(v);
              setToolsOpen(false);
            }}
            onOpenTools={() => setToolsOpen((v) => !v)}
            toolsOpen={toolsOpen}
          />
          <MobileSheet
            open={toolsOpen}
            title="Деталі та слеби"
            onClose={() => setToolsOpen(false)}
          >
            {/* У 3D рейка інструментів уже лежить на сцені (Sidebar3D
                на мобільному стає плаваючою колонкою праворуч), тому в
                шухляді — список деталей і слебів, а не її дубль. */}
            <Sidebar />
          </MobileSheet>
        </>
      )}

      {/* Status Bar */}
      <AppStatusBar />

      {/* Modals */}
      <SettingsModal />
      <EdgeProfileSettingsModal isOpen={isEdgeProfileSettingsOpen} onClose={() => setIsEdgeProfileSettingsOpen(false)} />
      <EdgeProfileCatalogHost />
    </div>
  );
}

export default App;
