import {  useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { FormsPanel } from './FormsPanel';
import { ListsPanel } from './ListsPanel';
import { SlabInspector } from './SlabInspector';

function safeFilePart(value: string, fallback: string) {
  const clean = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ');
  return clean || fallback;
}

function projectExportFileName(project: ReturnType<typeof useProjectStore.getState>['project']) {
  const createdAt = project.versions[0]?.timestamp ?? project.updatedAt;
  const stamp = new Date(createdAt).toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  return `${safeFilePart(project.orderNumber, 'без номера')}_${safeFilePart(project.customer, 'без контрагента')}_${stamp}.json`;
}

export function Sidebar() {
  const [activeTab, setActiveTab] = useState<'details' | 'slabs'>('details');
  const project = useProjectStore(s => s.project);
  const updateProject = useProjectStore(s => s.updateProject);

  const materials = project.referenceData?.materials || ['Керамограніт', 'Натуральний камінь', 'Кварцит', 'Акрил'];

  return (
    <>
      <aside className="sidebar w-[340px] flex-shrink-0 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-4">
        
        {/* Global Material & Thickness Selector */}
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Матеріал проєкту <span className="text-red-500">*</span></label>
            <select 
              className="form-select text-sm p-1.5 border border-slate-300 rounded"
              value={project.projectMaterial || ''}
              onChange={(e) => updateProject({ projectMaterial: e.target.value as any })}
            >
              <option value="" disabled>Оберіть матеріал</option>
              {materials.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Товщина, мм <span className="text-red-500">*</span></label>
            <input 
              type="number" 
              className="form-input text-sm p-1.5 border border-slate-300 rounded"
              value={project.projectThickness || ''}
              onChange={(e) => updateProject({ projectThickness: parseFloat(e.target.value) || undefined })}
              placeholder="Наприклад: 20"
            />
          </div>
        </div>

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
    </>
  );
}
