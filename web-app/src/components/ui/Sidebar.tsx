import { useMemo, useState } from 'react';
import { Shapes, Layers, Edit2, Trash2, SlidersHorizontal, X } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
import { FormsPanel } from './FormsPanel';
import { ListsPanel } from './ListsPanel';
import { SlabInspector } from './SlabInspector';
import { getAllProjectDetails } from '../../store/projectHelpers';
import { openDetailEditor, deleteDetailOrProduct } from './detailActions';

/**
 * Ліва панель 2D Розкрою.
 *
 * ПРОСУНУТИЙ РЕЖИМ (27.08, задача власника): панель згортається у вузьку
 * колонку значків. Дерева деталей і списку слебів на екрані немає —
 * деталь вибирається кліком прямо на дошці, слеб — кліком по його
 * корінцю. Олівець і кошик працюють по вибраній деталі; нічого не
 * вибрано — вони неактивні. Інспектор слеба живе за значком і
 * відкривається карткою поверх дошки.
 *
 * Ширина обох станів однакова з панеллю «3D Збірка» — це одна колонка
 * інтерфейсу, вона не має смикатись між вкладками.
 */
export function Sidebar() {
  const [activeTab, setActiveTab] = useState<'details' | 'slabs'>('details');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const project = useProjectStore(s => s.project);
  const selectedDetailId = useProjectStore(s => s.selectedDetailId);
  const selectedSlabId = useProjectStore(s => s.selectedSlabId);
  const deleteSlab = useProjectStore(s => s.deleteSlab);
  const isExpertMode = useUIStore(s => s.isExpertMode);
  // У «Спліті» половини вдвічі вужчі — панель згортається в значки
  // незалежно від просунутого режиму, як і тулбари дошки
  const isSplit = useUIStore(s => s.mainView === 'split');
  const compactRail = isExpertMode || isSplit;

  const allDetails = useMemo(() => getAllProjectDetails(project), [project]);
  const selectedDetail = useMemo(
    () => allDetails.find((d) => d.id === selectedDetailId),
    [allDetails, selectedDetailId],
  );

  if (!compactRail) {
    return (
      <aside className="sidebar w-[300px] flex-shrink-0 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-4">
        {/* Полів «Матеріал проєкту» і «Товщина» тут більше немає —
            прибрані 25.08.2026: матеріал і товщина беруться з першого
            слебу (див. addSlab у projectSlice). */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'details' ? 'bg-white shadow text-[#0084ff]' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setActiveTab('details')}
          >
            Деталі
          </button>
          <button
            className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'slabs' ? 'bg-white shadow text-[#0084ff]' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setActiveTab('slabs')}
          >
            Слеби
          </button>
        </div>
        <FormsPanel activeTab={activeTab} />
        {activeTab === 'slabs' && <SlabInspector />}
        <ListsPanel activeTab={activeTab} />
      </aside>
    );
  }

  const railTab = (tab: 'details' | 'slabs', icon: React.ReactNode, label: string) => (
    <button
      type="button"
      title={label}
      onClick={() => setActiveTab(tab)}
      className={`rail-btn ${activeTab === tab ? 'is-active' : ''}`}
    >
      {icon}
    </button>
  );

  return (
    <aside className="sidebar w-14 flex-shrink-0 flex flex-col items-center gap-2 relative">
      {railTab('details', <Shapes className="w-4 h-4" />, 'Деталі')}
      {railTab('slabs', <Layers className="w-4 h-4" />, 'Слеби')}

      <div className="w-8 border-t border-[var(--border-color)] my-1" />

      {/* Ті самі кнопки і обробники, що в повній панелі, — значками */}
      <div className="sidebar-rail flex flex-col items-stretch gap-2 w-10">
        <FormsPanel activeTab={activeTab} compact />
      </div>

      <div className="w-8 border-t border-[var(--border-color)] my-1" />

      {activeTab === 'details' && (
        <>
          {/* Олівець і кошик — по деталі, вибраній кліком на дошці */}
          <button
            type="button"
            title={selectedDetail ? `Редагувати: ${selectedDetail.label || selectedDetail.type}` : 'Клікніть деталь на дошці, щоб редагувати'}
            disabled={!selectedDetail}
            onClick={() => selectedDetail && openDetailEditor(selectedDetail, allDetails)}
            className="rail-btn"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            title={selectedDetail ? `Видалити: ${selectedDetail.label || selectedDetail.type}` : 'Клікніть деталь на дошці, щоб видалити'}
            disabled={!selectedDetail}
            onClick={() => selectedDetail && deleteDetailOrProduct(selectedDetail)}
            className="rail-btn is-danger"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}

      {activeTab === 'slabs' && (
        <>
          {/* Інспектор слеба: слеб вибирається кліком по корінцю на дошці */}
          <button
            type="button"
            title={selectedSlabId ? 'Інспектор слеба (фото, дефекти)' : 'Клікніть корінець слеба на дошці'}
            disabled={!selectedSlabId}
            onClick={() => setInspectorOpen((v) => !v)}
            className={`rail-btn ${inspectorOpen ? 'is-active' : ''}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button
            type="button"
            title={selectedSlabId ? 'Видалити вибраний слеб (деталі повернуться в буфер)' : 'Клікніть корінець слеба на дошці'}
            disabled={!selectedSlabId}
            onClick={() => selectedSlabId && deleteSlab(selectedSlabId)}
            className="rail-btn is-danger"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {inspectorOpen && selectedSlabId && (
            <div className="absolute left-14 top-0 z-40 w-[300px] bg-white rounded-lg shadow-xl border border-slate-200 p-3 pt-7">
              <button
                type="button"
                title="Закрити"
                className="!bg-transparent !border-0 p-1 text-slate-400 hover:text-slate-700 absolute right-2 top-2"
                onClick={() => setInspectorOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
              <SlabInspector />
            </div>
          )}
        </>
      )}
    </aside>
  );
}

