import React from 'react';
import { useUIStore } from '../../store/useStore';
import { useProjectStore } from '../../store/useProjectStore';
import { Settings2, X } from 'lucide-react';

export function DetailEditor3D() {
  const selectedId = useUIStore((s) => s.selectedId3d);
  const setSelectedId = useUIStore((s) => s.setSelectedId3d);
  const project = useProjectStore((s) => s.project);
  const parts = useProjectStore((s) => s.parts);
  const updatePlacement3dTransform = useProjectStore((s) => s.updatePlacement3dTransform);

  if (!selectedId) return null;

  const placement = project.placements.find((p) => p.id === selectedId);
  const part = parts.find((p) => p.id === placement?.partId);

  if (!placement || !part) return null;

  // Calculate default values if not explicitly transformed yet
  const textureLayouts = project.textureLayouts;
  const layout = textureLayouts.find((l) => l.partId === part.id);
  const s = 0.001;
  const slab = project.slabs.find((s) => s.id === placement.slabId);
  const thickness = slab?.thickness ? slab.thickness * s : 0.02;

  const initialX = ((layout?.x ?? placement.x) + part.width / 2) * s - 1.5;
  const initialY = thickness / 2;
  const initialZ = ((layout?.y ?? placement.y) + part.height / 2) * s - 0.8;

  const transform = placement.transform3d || { x: initialX, y: initialY, z: initialZ, rx: 0, ry: 0, rz: 0 };

  const handleChange = (axis: 'x'|'y'|'z'|'rx'|'ry'|'rz', value: number) => {
    updatePlacement3dTransform(selectedId, { ...transform, [axis]: value });
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-50 border-t border-slate-200">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-blue-600" />
          Властивості деталі
        </h3>
        <button 
          onClick={() => setSelectedId(null)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="text-xs text-slate-600 font-medium bg-white p-2 border border-slate-200 rounded-md">
        {part.name}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Позиція (м)</label>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500 font-bold w-3">X</span>
              <input type="number" step="0.01" value={transform.x.toFixed(3)} onChange={e => handleChange('x', parseFloat(e.target.value) || 0)} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-500 font-bold w-3">Y</span>
              <input type="number" step="0.01" value={transform.y.toFixed(3)} onChange={e => handleChange('y', parseFloat(e.target.value) || 0)} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-500 font-bold w-3">Z</span>
              <input type="number" step="0.01" value={transform.z.toFixed(3)} onChange={e => handleChange('z', parseFloat(e.target.value) || 0)} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Обертання (рад)</label>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500 font-bold w-3">X</span>
              <input type="number" step="0.05" value={transform.rx.toFixed(3)} onChange={e => handleChange('rx', parseFloat(e.target.value) || 0)} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-500 font-bold w-3">Y</span>
              <input type="number" step="0.05" value={transform.ry.toFixed(3)} onChange={e => handleChange('ry', parseFloat(e.target.value) || 0)} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-500 font-bold w-3">Z</span>
              <input type="number" step="0.05" value={transform.rz.toFixed(3)} onChange={e => handleChange('rz', parseFloat(e.target.value) || 0)} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
            </div>
          </div>
        </div>
      </div>
      
      <button
        onClick={() => updatePlacement3dTransform(selectedId, undefined)}
        className="mt-2 w-full text-xs font-medium text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 py-1.5 rounded transition-colors"
      >
        Скинути трансформацію
      </button>
    </div>
  );
}
