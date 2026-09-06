import { Suspense, memo, lazy } from 'react';
import { Layers, Image, Box, Eye, Columns, Loader2, ExternalLink, FileText, Calculator } from 'lucide-react';
import { useUIStore, type MainView, type PaneView } from '../store/useStore';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { SlabBoard } from './2d/SlabBoard';
import { TextureLayoutPanel } from './ui/TextureLayoutPanel';
import { UnplacedPartsPanel } from './ui/UnplacedPartsPanel';
import { Viewer3D } from './3d/Viewer3DLazy';
import { EstimatePanel } from './ui/EstimatePanel';
import { QuotePanel } from './ui/QuotePanel';
import { RoomEditor } from './room/RoomEditor';
import { WorkspaceTabs } from './WorkspaceTabs';
import { CONSTRUCTOR_VIEWS, ARCHITECTURE_VIEWS } from '../store/useStore';

/*
 * КОНСТРУКТОР (04.09.2026): вкладки-пасхалки Студії. Ліниві — код
 * конструктора не вантажиться, доки менеджер працює у VS3D.
 */
const MeasureTab = lazy(() => import('../constructor/measure/MeasureTab'));
const MetalTab = lazy(() => import('../constructor/metal/MetalTab'));
const PlywoodTab = lazy(() => import('../constructor/plywood/PlywoodTab'));
const MergeTab = lazy(() => import('../constructor/merge/MergeTab'));
const ServicesTab = lazy(() => import('../constructor/docs/ServicesTab'));
const DocsTab = lazy(() => import('../constructor/docs/DocsTab'));

function ConstructorView({ view }: { view: PaneView }) {
  const Comp = view === 'measure' ? MeasureTab
    : view === 'metal' ? MetalTab
      : view === 'plywood' ? PlywoodTab
        : view === 'merge' ? MergeTab
          : view === 'services' ? ServicesTab
            : DocsTab;
  return (
    <div className="flex flex-col h-full relative">
      <ErrorBoundary componentName={`Constructor:${view}`}>
        <Suspense
          fallback={
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-100 text-slate-500 w-full h-full gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span className="font-medium">Завантаження конструктора...</span>
            </div>
          }
        >
          <Comp />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

/*
 * АРХІТЕКТОР (06.09.2026): план → розкладка → відомість. Так само ліниві —
 * pdf.js і редактори плану не вантажаться, доки людина у VS3D.
 */
const PlanEditor = lazy(() => import('../workspaces/architecture/plan/PlanEditor'));
const LayoutEditor = lazy(() => import('../workspaces/architecture/layouts/LayoutEditor'));
const BoqPanel = lazy(() => import('../workspaces/architecture/documents/BoqPanel'));

function ArchitectureView({ view }: { view: PaneView }) {
  const Comp = view === 'plan' ? PlanEditor : view === 'layout' ? LayoutEditor : BoqPanel;
  return (
    <div className="flex flex-col h-full relative">
      <ErrorBoundary componentName={`Architecture:${view}`}>
        <Suspense
          fallback={
            <div className="flex-1 flex flex-col items-center justify-center bg-[#f6f5f2] text-neutral-500 w-full h-full gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-neutral-800" />
              <span className="font-medium">Завантаження архітектора...</span>
            </div>
          }
        >
          <Comp />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

interface WorkspacePaneProps {
  view: PaneView;
  onChangeView: (view: MainView) => void;
  isSplitModeActive: boolean;
  onToggleSplit: () => void;
  /** Малювати смугу вкладок усередині панелі (у «Спліті» — так) */
  showTabs?: boolean;
}

export const WorkspacePane = memo(function WorkspacePane({
  view,
  onChangeView,
  isSplitModeActive,
  onToggleSplit,
  showTabs = true,
}: WorkspacePaneProps) {
  const isFloatingPreviewOpen = useUIStore((s) => s.isFloatingPreviewOpen);
  const is3dAssemblyMode = useUIStore((s) => s.is3dAssemblyMode);
  // «3D Прев'ю» і «Послуги для виробництва» — вкладки супер-адміна
  // (щит у шапці, PIN); для менеджера їх не існує
  const isAdminUnlocked = useUIStore((s) => s.isAdminUnlocked);
  // Документи (кошторис, прорахунок) не мають плаваючого 3D-прев'ю поверх себе,
  // тож на них вкладка «3D Прев'ю» не має підсвічуватись активною.
  const isDocumentView = view === 'estimate' || view === 'quote';
  /**
   * Значки замість підписів. Вмикається двома шляхами:
   *  · просунутий режим — свідомий вибір людини, перемикач у шапці;
   *  · «Спліт» — панель удвічі вужча, і слова там не вміщуються.
   * Один прапорець на всі панелі паня, щоб мова була однакова.
   */
  const isExpertMode = useUIStore((s) => s.isExpertMode);
  const compact = isExpertMode || isSplitModeActive;
  /** Підпис вкладки: у просунутому режимі лишається сам значок, назва — у підказці */
  const tabLabel = (label: string) => (isExpertMode ? null : label);

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col h-full bg-[#f0f3f5]">
      {/* Вкладки всередині панелі — тільки у «Спліті»: там у кожної
          половини свій набір. У звичайному режимі їх малює App над усім
          вікном, щоб група не стрибала при зміні лівої панелі. */}
      {showTabs && (
        <WorkspaceTabs
          view={view}
          onChangeView={onChangeView}
          isSplitModeActive={isSplitModeActive}
          onToggleSplit={onToggleSplit}
        />
      )}

      {/* Content Area. Чистка рамок 26.08: коробки навколо робочого поля
          немає — біле поле саме відділяється від фону, як канва в
          редакторі деталі. Волосяна лінія під вкладками лишається на смузі
          вкладок; активна вкладка зливається з полем через border-b-white. */}
      <div className="flex-1 min-h-0 bg-white flex flex-col relative z-0 overflow-hidden">
        {view === '2d' ? (
          /* Буфер нерозміщених — КОЛОНКА СПРАВА (28.08). Раніше він лежав
             смугою над аркушами: одна деталь у буфері — і дошка починалась
             на третині екрана. Скрол лишається на лівій половині, буфер
             скролить свій список сам. */
          <div className="flex h-full min-h-0">
            <div className="flex-1 min-w-0 flex flex-col gap-4 pt-1.5 px-4 pb-4 overflow-y-auto custom-scrollbar">
              <ErrorBoundary componentName="SlabBoard">
                {/* «Обробка торців» переїхала в редактор виробу (10.08): вона
                    правила РОЗМІЩЕННЯ, тобто вже нарізану деталь, тож те саме
                    налаштування доводилось повторювати на кожному розкладанні
                    і в бланк погодження воно не потрапляло. Збережені старі
                    перевизначення на розміщеннях рушій фактів досі читає. */}
                <div className="shrink-0 relative">
                  {/* У «Спліті» дошка вдвічі вужча — кнопки перемикаються
                      на значки з підказками (compact), інакше два ряди
                      текстових кнопок збиваються в кашу з переносами. */}
                  <SlabBoard compact={compact} />
                </div>
              </ErrorBoundary>
              {/* Зони підбору текстури внизу 2D більше немає (26.08):
                  підбір повністю живе у вкладці «Підбір текстури» вгорі.
                  Дві копії тієї самої зони на одному екрані — це двічі
                  відрендерені фото слебів і плутанина, де «справжня». */}
            </div>
            <ErrorBoundary componentName="UnplacedPartsPanel">
              <UnplacedPartsPanel />
            </ErrorBoundary>
          </div>
        ) : view === 'texture' ? (
          <div className="flex flex-col gap-4 p-4 h-full relative">
            <ErrorBoundary componentName="TextureLayoutPanel">
              <TextureLayoutPanel compact={compact} asTab />
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
        ) : CONSTRUCTOR_VIEWS.has(view) ? (
          <ConstructorView view={view} />
        ) : ARCHITECTURE_VIEWS.has(view) ? (
          <ArchitectureView view={view} />
        ) : view === 'room' ? (
          <div className="flex flex-col h-full relative">
            <ErrorBoundary componentName="RoomEditor">
              <Suspense
                fallback={
                  <div className="flex-1 flex flex-col items-center justify-center bg-slate-100 text-slate-500 w-full h-full gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <span className="font-medium">Завантаження редактора приміщення...</span>
                  </div>
                }
              >
                <RoomEditor />
              </Suspense>
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
                <Viewer3D compact={compact} />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}
      </div>
    </div>
  );
});
