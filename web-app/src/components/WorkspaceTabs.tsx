import React from 'react';
import { Layers, Image, Box, Eye, Columns, ExternalLink, FileText, Calculator, Home, Ruler, Wrench, LayoutGrid, Combine, ClipboardList, FileOutput, X } from 'lucide-react';
import { useUIStore, type MainView, type PaneView } from '../store/useStore';

/**
 * СМУГА ВКЛАДОК РОБОЧОЇ ОБЛАСТІ.
 *
 * Винесена з панелі окремим компонентом 27.08 за зауваженням власника:
 * ліва панель то є, то немає (на «Прорахунку» і «Підборі текстури» її
 * нема зовсім), робоча область через це щоразу міняла ширину — і група
 * вкладок стрибала вправо-вліво при кожному перемиканні. Це основна
 * навігація програми, вона мусить стояти на місці.
 *
 * Тому в звичайному режимі смуга живе НАД усім (App малює її на всю
 * ширину вікна і центрує), а в «Спліті» лишається всередині кожної
 * половини — там у кожної панелі свій набір вкладок і свій стан.
 */
/** Вкладки конструктора — порядок за словами власника 04.09. */
const CONSTRUCTOR_TABS: Array<{ view: PaneView; label: string; title: string; icon: React.ComponentType<{ className?: string }> }> = [
  { view: 'measure', label: 'Замір', title: 'Замір з приладу (Leica DXF): підвантажили — відмалювався', icon: Ruler },
  { view: 'metal', label: 'Метал', title: 'Конструктор металокаркаса: шаблони, профіль, окремий виріб', icon: Wrench },
  { view: 'plywood', label: 'Фанера', title: 'Конструктор фанерного підкладу: рама, ребра, специфікація', icon: LayoutGrid },
  { view: 'merge', label: 'Зведення', title: 'Шари замір / виріб / фанера / метал — звести і підігнати під стіни', icon: Combine },
  { view: 'services', label: 'Послуги', title: 'Послуги для виробництва поруч із розкроєм', icon: ClipboardList },
  { view: 'docs', label: 'Документи', title: 'Креслення, тех карта, бланк цеху, JSON для MES — з попереднім переглядом', icon: FileOutput },
];

export function WorkspaceTabs({ view, onChangeView, isSplitModeActive, onToggleSplit, centered = false }: {
  view: PaneView;
  onChangeView: (view: MainView) => void;
  isSplitModeActive: boolean;
  onToggleSplit: () => void;
  /** Центрувати групу вкладок — режим «смуга на всю ширину вікна» */
  centered?: boolean;
}) {
  const isFloatingPreviewOpen = useUIStore((s) => s.isFloatingPreviewOpen);
  const is3dAssemblyMode = useUIStore((s) => s.is3dAssemblyMode);
  const isAdminUnlocked = useUIStore((s) => s.isAdminUnlocked);
  const isDocumentView = view === 'estimate' || view === 'quote';
  const isExpertMode = useUIStore((s) => s.isExpertMode);
  // КОНСТРУКТОР (04.09): додаткові вкладки лише в режимі конструктора;
  // вкладки VS3D лишаються всі, разом зі «Спліт» і «2D Розкрій».
  const constructorMode = useUIStore((s) => s.constructorMode);
  const setConstructorMode = useUIStore((s) => s.setConstructorMode);

  // На телефоні стрічка вкладок прокручується — активна може опинитись
  // за краєм, і людина бачить обрубок «…крій». Підвозимо її в кадр.
  const stripRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector('.pane-tab.is-active') as HTMLElement | null;
    if (active && strip.scrollWidth > strip.clientWidth) {
      active.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }, [view, isFloatingPreviewOpen]);
  const tabLabel = (label: string) => (isExpertMode ? null : label);
  // У конструкторі вкладок на шість більше — корінці вужчі, щоб уся смуга влізла в 1600 px
  const padX = isExpertMode ? 'px-3.5' : constructorMode ? 'px-3' : 'px-6';

  // Canvas Tabs
  // overflow-x-auto: у «Спліті» панель удвічі вужча, а вкладок сім —
  // хай краще прокручуються, ніж стискаються в нечитабельні обрубки.
  // КОРІНЕЦЬ ВІДКРИТОЇ ВКЛАДКИ — ЦІЛЬНИЙ З ПОЛЕМ (27.08).
  // Активна вкладка без власної рамки: біле тло корінця і біле тло
  // робочого поля — одна фігура, як язичок папки. Рамка лишається
  // прозорою, а не знімається зовсім, щоб текст не стрибав на
  // піксель при перемиканні.
  // Наскрізну лінію знято зі СМУГИ і віддано неактивним вкладкам —
  // кожна несе свою нижню межу. Так було зроблено не заради краси:
  // смуга має overflow-x-auto (у «Спліті» вкладки прокручуються), а
  // overflow обрізає вміст по padding-box — тому вкладка фізично не
  // могла накрити лінію, що лежить нижче, скільки б її не зсували
  // через top-[1px]. Саме через це корінець ніколи не зростався з
  // полем, хоча в коді все виглядало правильно.
  return (
      <div ref={stripRef} className={`workspace-tabs-desktop flex items-end z-10 relative bg-[#f0f3f5] pt-2 px-4 shrink-0 overflow-x-auto custom-scrollbar ${centered ? 'justify-center relative' : ''}`}>
        <button
          onClick={() => {
            onChangeView('2d');
            useUIStore.getState().setFloatingPreviewOpen(false);
          }}
          className={`pane-tab ${padX} h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
            view === '2d' && !isFloatingPreviewOpen ? 'is-active' : ''
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
          title="2D Розкрій"
        >
          <Layers className="w-4 h-4" />
          {tabLabel('2D Розкрій')}
        </button>
        <button
          onClick={() => {
            onChangeView('texture');
            useUIStore.getState().setFloatingPreviewOpen(false);
          }}
          className={`pane-tab ${padX} h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ml-1 ${
            view === 'texture' && !isFloatingPreviewOpen ? 'is-active' : ''
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
          title="2D Підбір — підбір текстури на слебі"
        >
          <Image className="w-4 h-4" /> {tabLabel('2D Підбір')}
        </button>
        <button
          onClick={() => {
            onChangeView('3d');
            useUIStore.getState().set3dAssemblyMode(true);
            useUIStore.getState().setFloatingPreviewOpen(false);
          }}
          className={`pane-tab ${padX} h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ml-1 ${
            view === '3d' && is3dAssemblyMode ? 'is-active' : ''
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
          title="3D Підбір"
        >
          <Box className="w-4 h-4" /> {tabLabel('3D Підбір')}
        </button>
        {isAdminUnlocked && (
          <button
            onClick={() => {
              onChangeView('2d'); // Switch to 2D for background
              useUIStore.getState().setFloatingPreviewMode('3d');
              useUIStore.getState().setFloatingPreviewOpen(true);
            }}
            className={`pane-tab ${padX} h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ml-1 shrink-0 whitespace-nowrap ${
              isFloatingPreviewOpen && !isDocumentView ? 'is-active' : ''
            }`}
            style={{ fontFamily: 'Roboto, sans-serif' }}
            title="3D Прев'ю"
          >
            <Eye className="w-4 h-4" /> {tabLabel("3D Прев'ю")}
          </button>
        )}
        {isAdminUnlocked && (
          <button
            onClick={() => {
              onChangeView('estimate');
              useUIStore.getState().setFloatingPreviewOpen(false);
            }}
            className={`pane-tab ${padX} h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ml-1 shrink-0 whitespace-nowrap ${
              view === 'estimate' ? 'is-active' : ''
            }`}
            style={{ fontFamily: 'Roboto, sans-serif' }}
            title="Повний перелік операцій із кодами — для виробництва"
          >
            <FileText className="w-4 h-4" /> {tabLabel('Послуги для виробництва')}
          </button>
        )}
        {/* Приміщення (база) — 01.09: редактор кімнати, у розкрій не йде */}
        <button
          onClick={() => {
            onChangeView('room');
            useUIStore.getState().setFloatingPreviewOpen(false);
          }}
          className={`pane-tab ${padX} h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ml-1 shrink-0 whitespace-nowrap ${
            view === 'room' ? 'is-active' : ''
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
          title="Приміщення: стіни, ніші, подіуми — база, у якій стоїть виріб"
        >
          <Home className="w-4 h-4" /> {tabLabel('Приміщення')}
        </button>
        <button
          onClick={() => {
            onChangeView('quote');
            useUIStore.getState().setFloatingPreviewOpen(false);
          }}
          className={`pane-tab ${padX} h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ml-1 shrink-0 whitespace-nowrap ${
            view === 'quote' ? 'is-active' : ''
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
          title="Розрахунок вартості для клієнта"
        >
          <Calculator className="w-4 h-4" /> {tabLabel('Прорахунок')}
        </button>
        {constructorMode && CONSTRUCTOR_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.view}
              onClick={() => {
                onChangeView(tab.view);
                useUIStore.getState().setFloatingPreviewOpen(false);
              }}
              className={`pane-tab ${padX} h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ml-1 shrink-0 whitespace-nowrap ${
                view === tab.view ? 'is-active' : ''
              }`}
              style={{ fontFamily: 'Roboto, sans-serif' }}
              title={tab.title}
            >
              <Icon className="w-4 h-4" /> {tabLabel(tab.label)}
            </button>
          );
        })}
        <button
          onClick={onToggleSplit}
          className={`pane-tab ${padX} h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ml-1 shrink-0 whitespace-nowrap ${
            isSplitModeActive ? 'is-active' : ''
          }`}
          style={{ fontFamily: 'Roboto, sans-serif' }}
          title="Спліт: два екрани поруч"
        >
          <Columns className="w-4 h-4" /> {tabLabel('Спліт')}
        </button>
        
        {constructorMode && (
          <button
            onClick={() => setConstructorMode(false)}
            className={`pane-tab px-2.5 h-10 rounded-t-lg text-[12px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap !text-violet-700 ${centered ? 'absolute right-14 bottom-0' : 'ml-auto'}`}
            title="Конструктор увімкнено — клік: вийти назад у VS3D (нічого не губиться)"
          >
            <Ruler className="w-4 h-4" /><X className="w-3.5 h-3.5" />
          </button>
        )}
        {/* Open in new window button */}
        <button
          onClick={() => {
            const url = new URL(window.location.href);
            // Pass the current view so the popup knows what to render
            url.searchParams.set('popup', isFloatingPreviewOpen ? '3d-preview' : view);
            window.open(url.toString(), 'SlabCutPlannerPopup', 'width=1200,height=800');
          }}
          className={`pane-tab px-4 h-10 rounded-t-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 shrink-0 hover:text-[var(--accent-color)] ${centered ? 'absolute right-4 bottom-0' : constructorMode ? '' : 'ml-auto'}`}
          title="Відкрити поточний вид в окремому вікні"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

  );
}
