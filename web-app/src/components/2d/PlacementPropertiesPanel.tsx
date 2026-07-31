import { useProjectStore } from '../../store/useProjectStore';
import { Settings, Link as LinkIcon, Unlink } from 'lucide-react';
import type { EdgeTreatment, EdgeProcessing } from '../../domain/types';

export function PlacementPropertiesPanel() {
  const { project, selectedPlacementIds, updatePlacement } = useProjectStore();

  if (!selectedPlacementIds || selectedPlacementIds.length !== 1) return null;

  const placement = project.placements.find(p => p.id === selectedPlacementIds[0]);
  if (!placement) return null;

  const edgeProfiles = project.referenceData?.edgeProfiles || [];

  const handleUpdate = (side: string, updates: Partial<EdgeTreatment>) => {
    const currentEdges = placement.edgeProfiles || {};
    const currentTreatment = currentEdges[side] as EdgeTreatment | undefined;
    
    // Convert old string format if exists
    let treatment: EdgeTreatment = { isFullLength: true };
    if (typeof currentTreatment === 'string') {
      treatment.top = { profileId: currentTreatment };
    } else if (currentTreatment) {
      treatment = { ...currentTreatment };
    }

    const newTreatment = { ...treatment, ...updates };
    
    // If linked, sync top to bottom
    if (newTreatment.linked && newTreatment.top) {
      newTreatment.bottom = { ...newTreatment.top };
    }

    const newEdges = { ...currentEdges, [side]: newTreatment };
    updatePlacement(placement.id, { edgeProfiles: newEdges });
  };

  const renderSideSettings = (side: string) => {
    const rawVal = placement.edgeProfiles?.[side];
    let t: EdgeTreatment = { isFullLength: true, linked: true };
    if (typeof rawVal === 'string') {
      t.top = { profileId: rawVal };
    } else if (rawVal) {
      t = { ...t, ...rawVal };
    }

    // Default sizing based on material logic (preview only)
    const allowance = edgeProfiles.find(p => p.id === t.top?.profileId)?.allowance || 0;
    const material = project.projectMaterial;
    let toolOut = 30; // quartz/keramogranit
    if (material === 'Акрил' || material === 'Компакт-плита') {
      toolOut = allowance || 2;
    }
    const actualSize = t.size ? Math.max(0, t.size - toolOut) : 0;

    return (
      <div key={side} className="border border-slate-200 rounded-md p-3 space-y-3 bg-white">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="font-bold text-slate-800">Сторона {side}</span>
        </div>

        {/* Profiles */}
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-slate-500 uppercase font-semibold">Лицьове ребро</label>
            <select 
              className="w-full p-1.5 text-xs border rounded border-slate-300 focus:outline-none focus:border-blue-500"
              value={t.top?.profileId || ''}
              onChange={e => handleUpdate(side, { top: e.target.value ? { profileId: e.target.value } : undefined })}
            >
              <option value="">--</option>
              {edgeProfiles.map(p => <option key={p.id} value={p.id}>{p.shortLabel || p.label}</option>)}
            </select>
          </div>
          
          <button 
            className={`mt-4 p-1.5 rounded ${t.linked ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}
            onClick={() => handleUpdate(side, { linked: !t.linked })}
            title={t.linked ? 'Відв\'язати' : 'Зв\'язати'}
          >
            {t.linked ? <LinkIcon className="w-4 h-4" /> : <Unlink className="w-4 h-4" />}
          </button>

          <div className="flex-1 space-y-1">
            <label className="text-[10px] text-slate-500 uppercase font-semibold">Тильне ребро</label>
            <select 
              className="w-full p-1.5 text-xs border rounded border-slate-300 focus:outline-none focus:border-blue-500"
              value={t.bottom?.profileId || ''}
              disabled={t.linked}
              onChange={e => handleUpdate(side, { bottom: e.target.value ? { profileId: e.target.value } : undefined })}
            >
              <option value="">--</option>
              {edgeProfiles.map(p => <option key={p.id} value={p.id}>{p.shortLabel || p.label}</option>)}
            </select>
          </div>
        </div>

        {/* Sizing type */}
        <div className="flex bg-slate-100 p-1 rounded-md">
          <button 
            className={`flex-1 text-xs py-1 rounded font-medium ${t.isFullLength !== false ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600'}`}
            onClick={() => handleUpdate(side, { isFullLength: true })}
          >
            На всю довжину
          </button>
          <button 
            className={`flex-1 text-xs py-1 rounded font-medium ${t.isFullLength === false ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600'}`}
            onClick={() => handleUpdate(side, { isFullLength: false })}
          >
            Довільна
          </button>
        </div>

        {/* Custom Sizing */}
        {t.isFullLength === false && (
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">Прив'язка</label>
              <select 
                className="w-full p-1.5 text-xs border rounded border-slate-300"
                value={t.align || 'left'}
                onChange={e => handleUpdate(side, { align: e.target.value as any })}
              >
                <option value="left">Ліва</option>
                <option value="center">Центр</option>
                <option value="right">Права</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">Відступ (мм)</label>
              <input 
                type="number" 
                className="w-full p-1.5 text-xs border rounded border-slate-300"
                value={t.offset || 0}
                onChange={e => handleUpdate(side, { offset: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">Розмір (мм)</label>
              <input 
                type="number" 
                className="w-full p-1.5 text-xs border rounded border-slate-300"
                value={t.size || ''}
                onChange={e => handleUpdate(side, { size: Number(e.target.value) })}
                placeholder="Довжина"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase">Факт. розмір</label>
              <div className="w-full p-1.5 text-xs border rounded bg-slate-50 text-slate-600 font-mono">
                {actualSize} мм
              </div>
            </div>
          </div>
        )}

        {/* Manual Finish */}
        <label className="flex items-center gap-2 pt-2 cursor-pointer group">
          <input 
            type="checkbox" 
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={t.manualFinish || false}
            onChange={e => handleUpdate(side, { manualFinish: e.target.checked })}
          />
          <span className="text-xs text-slate-700 group-hover:text-slate-900">Ручне доопрацювання</span>
        </label>
      </div>
    );
  };

  return (
    <div className="absolute right-4 top-4 w-72 bg-slate-50/95 backdrop-blur rounded-lg shadow-xl border border-slate-200 z-50 flex flex-col max-h-[85vh]">
      <div className="p-3 border-b border-slate-200 bg-white rounded-t-lg flex items-center justify-between shrink-0">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#0084ff]" />
          Обробка торців
        </h3>
      </div>
      <div className="p-3 overflow-y-auto space-y-3 custom-scrollbar">
        {['A', 'B', 'C', 'D'].map(renderSideSettings)}
      </div>
    </div>
  );
}