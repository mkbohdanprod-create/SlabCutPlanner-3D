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
  const [localValues, setLocalValues] = React.useState<Record<string, string>>({});

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

  const transform = {
    x: placement.transform3d?.x ?? initialX,
    y: placement.transform3d?.y ?? initialY,
    z: placement.transform3d?.z ?? initialZ,
    rx: placement.transform3d?.rx ?? 0,
    ry: placement.transform3d?.ry ?? 0,
    rz: placement.transform3d?.rz ?? 0,
  };

  const toMm = (m: number) => Math.round((m || 0) * 1000);
  const fromMm = (mm: number) => mm / 1000;
  
  const toDeg = (rad: number) => Math.round((rad || 0) * (180 / Math.PI));
  const fromDeg = (deg: number) => deg * (Math.PI / 180);

  const handleChange = (axis: 'x'|'y'|'z'|'rx'|'ry'|'rz', rawValue: string) => {
    setLocalValues(prev => ({ ...prev, [axis]: rawValue }));
    const parsed = parseFloat(rawValue);
    
    if (!isNaN(parsed)) {
      const finalValue = axis.startsWith('r') ? fromDeg(parsed) : fromMm(parsed);
      updatePlacement3dTransform(selectedId, { ...transform, [axis]: finalValue });
    }
  };

  const handleBlur = (axis: string) => {
    setLocalValues(prev => {
      const next = { ...prev };
      delete next[axis];
      return next;
    });
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
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Позиція (мм)</label>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500 font-bold w-3">X</span>
              <input type="text" inputMode="decimal" value={localValues['x'] !== undefined ? localValues['x'] : toMm(transform.x)} onChange={e => handleChange('x', e.target.value)} onBlur={() => handleBlur('x')} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-500 font-bold w-3">Y</span>
              <input type="text" inputMode="decimal" value={localValues['y'] !== undefined ? localValues['y'] : toMm(transform.y)} onChange={e => handleChange('y', e.target.value)} onBlur={() => handleBlur('y')} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-500 font-bold w-3">Z</span>
              <input type="text" inputMode="decimal" value={localValues['z'] !== undefined ? localValues['z'] : toMm(transform.z)} onChange={e => handleChange('z', e.target.value)} onBlur={() => handleBlur('z')} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Обертання (град)</label>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500 font-bold w-3">X</span>
              <input type="text" inputMode="decimal" value={localValues['rx'] !== undefined ? localValues['rx'] : toDeg(transform.rx)} onChange={e => handleChange('rx', e.target.value)} onBlur={() => handleBlur('rx')} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-500 font-bold w-3">Y</span>
              <input type="text" inputMode="decimal" value={localValues['ry'] !== undefined ? localValues['ry'] : toDeg(transform.ry)} onChange={e => handleChange('ry', e.target.value)} onBlur={() => handleBlur('ry')} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-500 font-bold w-3">Z</span>
              <input type="text" inputMode="decimal" value={localValues['rz'] !== undefined ? localValues['rz'] : toDeg(transform.rz)} onChange={e => handleChange('rz', e.target.value)} onBlur={() => handleBlur('rz')} className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded outline-none focus:border-blue-500" />
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
