import { ChangeEvent, useState } from 'react';
import { t } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
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

  return (
    <>
      <aside className="sidebar w-[340px] flex-shrink-0 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-4">
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

