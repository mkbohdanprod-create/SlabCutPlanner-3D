import  { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Link, Plus, Trash2 } from 'lucide-react';
import type { AssemblyConnection } from '../../domain/types';

export function AssemblyConnectionsPanel() {
  const { project, updateProject } = useProjectStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newConn, setNewConn] = useState<Partial<AssemblyConnection>>({
    connectionType: 'straight',
    part1Side: 'A',
    part2Side: 'A'
  });

  const connections = project.assembly?.connections || [];
  
  // Доступні деталі (placements, які є на розкрої)
  const availableParts = project.placements.map(pl => {
    return {
      id: pl.partId,
      name: `Деталь ${pl.partId.substring(0, 4)}` // Спрощена назва, потім можна додати name з DetailPart
    };
  });

  // Унікальні деталі для списку
  const uniqueParts = Array.from(new Map(availableParts.map(item => [item.id, item])).values());

  const handleAdd = () => {
    if (!newConn.part1Id || !newConn.part2Id) return;
    
    const conn: AssemblyConnection = {
      id: `conn_${Date.now()}`,
      part1Id: newConn.part1Id,
      part2Id: newConn.part2Id,
      part1Side: newConn.part1Side || 'A',
      part2Side: newConn.part2Side || 'A',
      connectionType: newConn.connectionType as any,
    };

    const updatedAssembly = {
      ...project.assembly,
      connections: [...connections, conn],
      partTransforms: project.assembly?.partTransforms || {}
    };

    updateProject({ assembly: updatedAssembly });
    setIsAdding(false);
    setNewConn({ connectionType: 'straight', part1Side: 'A', part2Side: 'A' });
  };

  const handleRemove = (id: string) => {
    const updatedAssembly = {
      ...project.assembly,
      connections: connections.filter(c => c.id !== id),
      partTransforms: project.assembly?.partTransforms || {}
    };
    updateProject({ assembly: updatedAssembly });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Link className="w-4 h-4 text-green-600" />
          З'єднання (Склейки)
        </h3>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="p-1 hover:bg-slate-200 rounded text-slate-600"
          title="Додати з'єднання"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {isAdding && (
        <div className="p-3 bg-white border border-slate-200 rounded-md space-y-3 text-xs">
          <div className="space-y-1">
            <label className="text-slate-500">Деталь 1</label>
            <div className="flex gap-2">
              <select 
                className="flex-1 p-1 border rounded"
                value={newConn.part1Id || ''}
                onChange={e => setNewConn({...newConn, part1Id: e.target.value})}
              >
                <option value="">Виберіть...</option>
                {uniqueParts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select 
                className="w-16 p-1 border rounded"
                value={newConn.part1Side || 'A'}
                onChange={e => setNewConn({...newConn, part1Side: e.target.value})}
              >
                <option value="A">A</option><option value="B">B</option>
                <option value="C">C</option><option value="D">D</option>
              </select>
            </div>
          </div>
          
          <div className="space-y-1">
            <label className="text-slate-500">Деталь 2</label>
            <div className="flex gap-2">
              <select 
                className="flex-1 p-1 border rounded"
                value={newConn.part2Id || ''}
                onChange={e => setNewConn({...newConn, part2Id: e.target.value})}
              >
                <option value="">Виберіть...</option>
                {uniqueParts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select 
                className="w-16 p-1 border rounded"
                value={newConn.part2Side || 'A'}
                onChange={e => setNewConn({...newConn, part2Side: e.target.value})}
              >
                <option value="A">A</option><option value="B">B</option>
                <option value="C">C</option><option value="D">D</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-500">Тип стику</label>
            <select 
              className="w-full p-1 border rounded"
              value={newConn.connectionType}
              onChange={e => setNewConn({...newConn, connectionType: e.target.value as any})}
            >
              <option value="straight">Пряма склейка</option>
              <option value="miter_45">Підворот 45°</option>
              <option value="glue_only">Тільки клей (без обробки)</option>
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button 
              onClick={handleAdd}
              disabled={!newConn.part1Id || !newConn.part2Id}
              className="flex-1 bg-blue-600 text-white py-1 rounded disabled:opacity-50"
            >
              Зберегти
            </button>
            <button 
              onClick={() => setIsAdding(false)}
              className="flex-1 bg-slate-200 text-slate-700 py-1 rounded"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {connections.length === 0 && !isAdding && (
          <div className="text-xs text-slate-500 italic text-center p-4">
            Немає з'єднань. Додайте їх для прорахунку склейки.
          </div>
        )}
        {connections.map(conn => (
          <div key={conn.id} className="p-2 bg-white border border-slate-200 rounded-md flex justify-between items-center text-xs">
            <div>
              <div className="font-medium">
                {uniqueParts.find(p => p.id === conn.part1Id)?.name || 'Деталь'} ({conn.part1Side}) 
                <span className="mx-1 text-slate-400">↔</span> 
                {uniqueParts.find(p => p.id === conn.part2Id)?.name || 'Деталь'} ({conn.part2Side})
              </div>
              <div className="text-slate-500 mt-1">
                {conn.connectionType === 'miter_45' ? 'Підворот 45°' : 
                 conn.connectionType === 'straight' ? 'Пряма склейка' : 'Клей'}
              </div>
            </div>
            <button 
              onClick={() => handleRemove(conn.id)}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}