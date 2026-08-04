import  { useState } from 'react';
import { X, Plus, Save, Trash2, Scissors } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import type { EdgeProfileDef, EdgeProfileOperation } from '../../domain/types';
import { DEFAULT_SERVICE_CATALOG } from '../../domain/services';

export function EdgeProfileSettingsModal({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const project = useProjectStore(s => s.project);
  const updateProjectHeader = useProjectStore(s => s.updateProjectHeader);

  const edgeProfiles = project.referenceData?.edgeProfiles ?? [];

  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState<Partial<EdgeProfileDef>>({
    id: '', label: '', shortLabel: '', description: '', allowance: 0, operations: []
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<EdgeProfileDef>>({});

  if (!isOpen) return null;

  const handleSaveAdd = () => {
    if (addForm.id && addForm.label) {
      const newProfile = { ...addForm } as EdgeProfileDef;
      const newProfiles = [...edgeProfiles, newProfile];
      updateProjectHeader({ referenceData: { ...project.referenceData!, edgeProfiles: newProfiles } });
      setIsAdding(false);
      setAddForm({ id: '', label: '', shortLabel: '', description: '', allowance: 0, operations: [] });
    }
  };

  const handleSaveEdit = () => {
    if (editingId && editForm) {
      const newProfiles = edgeProfiles.map(p => p.id === editingId ? { ...p, ...editForm } as EdgeProfileDef : p);
      updateProjectHeader({ referenceData: { ...project.referenceData!, edgeProfiles: newProfiles } });
    }
    setEditingId(null);
  };

  const handleRemove = (id: string) => {
    if (window.confirm('Видалити обробку?')) {
      const newProfiles = edgeProfiles.filter(p => p.id !== id);
      updateProjectHeader({ referenceData: { ...project.referenceData!, edgeProfiles: newProfiles } });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-white">
          <div className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">Довідник Обробок Торців</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">Налаштування доступних обробок торця та їх допусків на розмір розкрою.</p>
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Додати обробку</span>
            </button>
          </div>

          <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 text-gray-700 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">ID (Код)</th>
                  <th className="px-4 py-3 font-medium">Повна назва</th>
                  <th className="px-4 py-3 font-medium">Скорочено</th>
                  <th className="px-4 py-3 font-medium">Опис</th>
                  <th className="px-4 py-3 font-medium text-center">Допуск (мм)</th>
                  <th className="px-4 py-3 font-medium">Операції (Послуги)</th>
                  <th className="px-4 py-3 font-medium text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isAdding && (
                  <tr className="bg-blue-50/50">
                    <td className="px-4 py-2">
                      <input 
                        type="text" 
                        value={addForm.id}
                        onChange={e => setAddForm({...addForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')})}
                        placeholder="my_edge_1"
                        className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input 
                        type="text" 
                        value={addForm.label}
                        onChange={e => setAddForm({...addForm, label: e.target.value})}
                        placeholder="Наприклад: Фаска 3х3"
                        className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input 
                        type="text" 
                        value={addForm.shortLabel}
                        onChange={e => setAddForm({...addForm, shortLabel: e.target.value})}
                        placeholder="Ф3х3"
                        className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input 
                        type="text" 
                        value={addForm.description}
                        onChange={e => setAddForm({...addForm, description: e.target.value})}
                        placeholder="Опис обробки"
                        className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input 
                        type="number" 
                        value={addForm.allowance}
                        step="0.5"
                        onChange={e => setAddForm({...addForm, allowance: Number(e.target.value)})}
                        className="w-16 px-2 py-1.5 border rounded text-xs text-center focus:ring-1 focus:ring-blue-500 outline-none font-mono mx-auto block"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-2">
                        {(addForm.operations || []).map((op, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <select
                              value={op.serviceId}
                              onChange={e => {
                                const newOps = [...(addForm.operations || [])];
                                newOps[i].serviceId = e.target.value;
                                setAddForm({...addForm, operations: newOps});
                              }}
                              className="w-32 px-1 py-1 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                            >
                              <option value="">-- Виберіть --</option>
                              {Object.values(DEFAULT_SERVICE_CATALOG).map(svc => (
                                <option key={svc.id} value={svc.id}>{svc.name}</option>
                              ))}
                            </select>
                            <span className="text-xs text-gray-500">×</span>
                            <input
                              type="number"
                              step="1"
                              value={op.multiplier}
                              onChange={e => {
                                const newOps = [...(addForm.operations || [])];
                                newOps[i].multiplier = Number(e.target.value);
                                setAddForm({...addForm, operations: newOps});
                              }}
                              className="w-12 px-1 py-1 border rounded text-xs text-center focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                            />
                            <button
                              onClick={() => {
                                const newOps = [...(addForm.operations || [])];
                                newOps.splice(i, 1);
                                setAddForm({...addForm, operations: newOps});
                              }}
                              className="text-red-400 hover:text-red-600 p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setAddForm({ ...addForm, operations: [...(addForm.operations || []), { serviceId: '', multiplier: 1 }] })}
                          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 self-start"
                        >
                          <Plus className="w-3 h-3" /> Додати
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={handleSaveAdd} className="text-green-600 hover:bg-green-100 p-1.5 rounded transition-colors" title="Зберегти">
                          <Save className="w-4 h-4" />
                        </button>
                        <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:bg-gray-100 p-1.5 rounded transition-colors" title="Скасувати">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {edgeProfiles.map(profile => {
                  const isEditing = editingId === profile.id;
                  return (
                    <tr key={profile.id} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-4 py-3 text-xs font-mono text-gray-500 w-32">{profile.id}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editForm.label || ''}
                            onChange={e => setEditForm({...editForm, label: e.target.value})}
                            className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        ) : (
                          <span className="font-medium text-gray-800">{profile.label}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editForm.shortLabel || ''}
                            onChange={e => setEditForm({...editForm, shortLabel: e.target.value})}
                            className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        ) : (
                          <span className="text-gray-600">{profile.shortLabel}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editForm.description || ''}
                            onChange={e => setEditForm({...editForm, description: e.target.value})}
                            className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        ) : (
                          <span className="text-gray-500 text-xs">{profile.description}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <input 
                            type="number" 
                            step="0.5"
                            value={editForm.allowance || 0}
                            onChange={e => setEditForm({...editForm, allowance: Number(e.target.value)})}
                            className="w-16 px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none font-mono mx-auto block text-center"
                          />
                        ) : (
                          <span className="font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded">+{profile.allowance}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            {(editForm.operations || []).map((op, i) => (
                              <div key={i} className="flex items-center gap-1">
                                <select
                                  value={op.serviceId}
                                  onChange={e => {
                                    const newOps = [...(editForm.operations || [])];
                                    newOps[i].serviceId = e.target.value;
                                    setEditForm({...editForm, operations: newOps});
                                  }}
                                  className="w-32 px-1 py-1 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                >
                                  <option value="">-- Виберіть --</option>
                                  {Object.values(DEFAULT_SERVICE_CATALOG).map(svc => (
                                    <option key={svc.id} value={svc.id}>{svc.name}</option>
                                  ))}
                                </select>
                                <span className="text-xs text-gray-500">×</span>
                                <input
                                  type="number"
                                  step="1"
                                  value={op.multiplier}
                                  onChange={e => {
                                    const newOps = [...(editForm.operations || [])];
                                    newOps[i].multiplier = Number(e.target.value);
                                    setEditForm({...editForm, operations: newOps});
                                  }}
                                  className="w-12 px-1 py-1 border rounded text-xs text-center focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                                />
                                <button
                                  onClick={() => {
                                    const newOps = [...(editForm.operations || [])];
                                    newOps.splice(i, 1);
                                    setEditForm({...editForm, operations: newOps});
                                  }}
                                  className="text-red-400 hover:text-red-600 p-0.5"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => setEditForm({ ...editForm, operations: [...(editForm.operations || []), { serviceId: '', multiplier: 1 }] })}
                              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 self-start"
                            >
                              <Plus className="w-3 h-3" /> Додати
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {profile.operations?.map((op, i) => (
                              <div key={i} className="text-xs text-gray-600">
                                <span className="text-blue-600 font-medium">×{op.multiplier}</span> {DEFAULT_SERVICE_CATALOG[op.serviceId]?.name || op.serviceId}
                              </div>
                            ))}
                            {(!profile.operations || profile.operations.length === 0) && (
                              <span className="text-gray-400 text-xs italic">Немає операцій</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right w-24">
                        {isEditing ? (
                          <div className="flex justify-end gap-1">
                            <button onClick={handleSaveEdit} className="text-green-600 hover:bg-green-100 p-1.5 rounded transition-colors" title="Зберегти">
                              <Save className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="text-gray-400 hover:bg-gray-100 p-1.5 rounded transition-colors" title="Скасувати">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditingId(profile.id);
                                setEditForm(profile);
                              }}
                              className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors"
                              title="Редагувати"
                            >
                              <Scissors className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleRemove(profile.id)} 
                              className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                              title="Видалити"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}