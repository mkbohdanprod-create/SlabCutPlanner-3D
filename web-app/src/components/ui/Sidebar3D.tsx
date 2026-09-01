import { useMemo } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Box,  Move, RefreshCw, RotateCw, LayoutGrid } from 'lucide-react';
import { useUIStore } from '../../store/useStore';
import { useProjectStore } from '../../store/useProjectStore';
import { DetailEditor3D } from '../3d/DetailEditor3D';
import { AssemblyConnectionsPanel } from '../assembly/AssemblyConnectionsPanel';
import { defaultSceneLayout } from '../../engines/sceneLayout';

export function Sidebar3D() {
  const { is3dAssemblyMode, set3dAssemblyMode, is3dGroupingEnabled, set3dGroupingEnabled, transformMode, setTransformMode } = useUIStore();
  const isExpertMode = useUIStore(s => s.isExpertMode);
  const isSplit = useUIStore(s => s.mainView === 'split');
  const isMobile = useIsMobile();
  // На телефоні — тільки рейка: широка панель на 300 px з'їдала б три
  // чверті екрана і відсувала сцену за край. CSS кладе рейку на сцену
  // праворуч, як плаваючу колонку інструментів.
  const compactRail = isExpertMode || isSplit || isMobile;
  const { reset3dAssembly } = useProjectStore();
  const selectedId3d = useUIStore(s => s.selectedId3d);
  const selectedProductId3d = useUIStore(s => s.selectedProductId3d);
  const setSelectedProductId3d = useUIStore(s => s.setSelectedProductId3d);
  const project = useProjectStore(s => s.project);
  const parts = useProjectStore(s => s.parts);
  const updateProductScenePlacement = useProjectStore(s => s.updateProductScenePlacement);
  const clearProductScenePlacements = useProjectStore(s => s.clearProductScenePlacements);

  /*
   * Крок 5.1: виділений виріб. Головне джерело — власний стан виділення
   * виробу (клік по виробу на сцені або по рядку списку нижче). Запасне —
   * виділена ДЕТАЛЬ: її id несе шлях виробу (`prod_<id>/element:...`).
   * Саме тому виділення працює навіть коли головна деталь виробу не
   * розмістилась на слябі (конфлікт розкрою).
   */
  const selectedProduct = useMemo(() => {
    const byId = (project.products ?? []).find((item) => item.id === selectedProductId3d);
    if (byId) return byId;
    if (!selectedId3d) return undefined;
    const placement = project.placements.find((item) => item.id === selectedId3d);
    const part = placement ? parts.find((item) => item.id === placement.partId) : undefined;
    const match = typeof part?.detailId === 'string' ? /^prod_([^/]+)\//.exec(part.detailId) : null;
    return match ? (project.products ?? []).find((item) => item.id === match[1]) : undefined;
  }, [selectedProductId3d, selectedId3d, project, parts]);

  /** Поворот виділеного виробу на ±90° — навколо його поточного місця. */
  const rotateSelected = (deltaDeg: number) => {
    if (!selectedProduct) return;
    const current = selectedProduct.scenePlacement ?? (() => {
      // Виріб ще не рухали: беремо його місце з детермінованого дефолтного
      // ряду — ту саму математику, що й сцена (engines/sceneLayout).
      const items = (project.products ?? []).map((product) => {
        const rootId = product.elements?.[0]?.id;
        const mainPart = rootId ? parts.find((item) => item.detailId === rootId && item.isMain) : undefined;
        return { productId: product.id, widthMm: mainPart?.width ?? 1000, depthMm: mainPart?.height ?? 600 };
      });
      return defaultSceneLayout(items)[selectedProduct.id] ?? { x: 0, z: 0, rotationYDeg: 0 };
    })();
    updateProductScenePlacement(selectedProduct.id, {
      ...current,
      rotationYDeg: ((current.rotationYDeg + deltaDeg) % 360 + 360) % 360,
    });
  };

  /**
   * ПРОСУНУТИЙ РЕЖИМ (27.08): колонка значків, як у панелі 2D Розкрою.
   * Списку виробів немає — виріб вибирається кліком по ньому на сцені;
   * кнопки 90° працюють по вибраному, без вибору вони неактивні.
   */
  if (compactRail) {
    const railBtn = (
      active: boolean,
      title: string,
      onClick: () => void,
      icon: React.ReactNode,
      disabled = false,
    ) => (
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={onClick}
        className={`rail-btn ${active ? 'is-active' : ''}`}
      >
        {icon}
      </button>
    );

    return (
      <aside className="sidebar-3d w-14 shrink-0 flex flex-col items-center gap-2 h-full">
        <span title="3D Збірка" className="w-10 h-10 flex items-center justify-center text-blue-600">
          <Box className="w-4 h-4" />
        </span>
        <div className="w-8 border-t border-[var(--border-color)] my-1" />
        {is3dAssemblyMode && (
          <>
            {railBtn(transformMode === 'translate', 'Рухати виріб (стрілки на сцені)', () => setTransformMode('translate'), <Move className="w-4 h-4" />)}
            {railBtn(transformMode === 'rotate', 'Обертати виріб (кільце на сцені)', () => setTransformMode('rotate'), <RefreshCw className="w-4 h-4" />)}
            <div className="w-8 border-t border-[var(--border-color)] my-1" />
            {railBtn(false, selectedProduct ? 'Повернути виріб на 90° проти годинникової' : 'Клікніть виріб на сцені', () => rotateSelected(-90), <RotateCw className="w-4 h-4 -scale-x-100" />, !selectedProduct)}
            {railBtn(false, selectedProduct ? 'Повернути виріб на 90° за годинниковою' : 'Клікніть виріб на сцені', () => rotateSelected(90), <RotateCw className="w-4 h-4" />, !selectedProduct)}
            {railBtn(false, 'Розставити вироби заново (стандартний ряд)', () => {
              useUIStore.getState().showConfirm({
                title: 'Розставити заново',
                message: 'Повернути всі вироби в стандартний ряд? Ваші переміщення і повороти виробів на сцені буде стерто.',
                confirmText: 'Розставити',
                onConfirm: () => clearProductScenePlacements(),
              });
            }, <LayoutGrid className="w-4 h-4" />)}
          </>
        )}
      </aside>
    );
  }

  return (
    <aside className="w-[300px] shrink-0 flex flex-col overflow-hidden h-full">
      {/* Чистка рамок 26.08: та сама мова, що в редакторі виробу — панель
          без коробки, заголовок відділений волосяною лінією, рамки лишились
          у кнопок і карток (предметів). */}
      <div className="px-1 pb-3 border-b border-[var(--border-color)]">
        <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Box className="w-4 h-4 text-blue-600" />
          3D Збірка
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-1 py-4 space-y-6">
        {/* FG-24: тут стояв блок «Керування» з написом-заглушкою «Опції
            перенесено у верхню панель» — жодної кнопки, лише плутав.
            Прибрано. Кнопки «Рухати»/«Обертати» нижче — робочі, вони
            видимі лише в режимі збірки. */}
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
            {/* Крок 5.1 — швидкі дії з ВИРОБОМ. Кнопки 90° працюють по
                виділеному виробу; «Розставити заново» повертає всі вироби
                в дефолтний ряд (їхні власні переміщення стираються). */}
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider pt-2">Виріб на сцені</h3>
            {/* Список виробів: клік — виділити. Працює завжди, навіть коли
                виріб не вдалося клікнути на сцені (деталь без розміщення). */}
            <div className="flex flex-col gap-1">
              {(project.products ?? []).map((item, index) => {
                const isActive = selectedProduct?.id === item.id;
                const moved = Boolean(item.scenePlacement);
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedProductId3d(isActive ? null : item.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm border transition-colors ${
                      isActive
                        ? 'border-[var(--accent-color)] bg-[var(--bg-panel-hover)] text-[var(--accent-color)] font-medium'
                        : 'border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-panel-hover)]'
                    }`}
                  >
                    №{index + 1} · {item.name || 'Виріб'}
                    <span className="block text-[11px] opacity-70">
                      {moved
                        ? `x ${Math.round(item.scenePlacement!.x)} · z ${Math.round(item.scenePlacement!.z)} · ${item.scenePlacement!.rotationYDeg}°`
                        : 'стандартний ряд'}
                    </span>
                  </button>
                );
              })}
              {(project.products ?? []).length === 0 && (
                <p className="text-[11px] text-[var(--text-secondary)]">У проєкті ще немає виробів.</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => rotateSelected(-90)}
                disabled={!selectedProduct}
                title={selectedProduct ? 'Повернути виріб на 90° проти годинникової' : 'Спершу клікніть по виробу на сцені'}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-panel-hover)] disabled:opacity-40"
              >
                <RotateCw className="w-4 h-4 -scale-x-100" /> 90°
              </button>
              <button
                onClick={() => rotateSelected(90)}
                disabled={!selectedProduct}
                title={selectedProduct ? 'Повернути виріб на 90° за годинниковою' : 'Спершу клікніть по виробу на сцені'}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-panel-hover)] disabled:opacity-40"
              >
                <RotateCw className="w-4 h-4" /> 90°
              </button>
            </div>
            <button
              onClick={() => {
                useUIStore.getState().showConfirm({
                  title: 'Розставити заново',
                  message: 'Повернути всі вироби в стандартний ряд? Ваші переміщення і повороти виробів на сцені буде стерто.',
                  confirmText: 'Розставити',
                  onConfirm: () => clearProductScenePlacements(),
                });
              }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-panel-hover)]"
            >
              <LayoutGrid className="w-4 h-4" /> Розставити заново
            </button>
            <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
              Перетягніть виріб стрілками, поверніть кільцем. Прив'язка 50 мм і 15°;
              із Shift — вільно. Червона рамка — вироби перетинаються габаритами.
            </p>
            <div className="pt-4 border-t border-[var(--border-color)] mt-4">
              <AssemblyConnectionsPanel />
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
