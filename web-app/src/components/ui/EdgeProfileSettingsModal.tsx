import  { useMemo, useState } from 'react';
import { X, Plus, Save, Trash2, Scissors, Search } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import type { EdgeProfileDef, EdgeProfileOperation } from '../../domain/types';
import { DEFAULT_SERVICE_CATALOG } from '../../domain/services';
import { EXECUTION_LABEL, edgeProfileClass, edgeProfileFitsMaterial, groupEdgeProfiles, type EdgeExecution, type EdgeProfileKind } from '../../domain/edgeProfileClasses';
import { hasEdgeProfileDrawing } from '../../domain/edgeProfileDrawings';
import { EdgeProfileThumb } from '../forms/editors/EdgeProfileThumb';
import '../../styles/bottega.css';

export function EdgeProfileSettingsModal({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const project = useProjectStore(s => s.project);
  const updateProjectHeader = useProjectStore(s => s.updateProjectHeader);

  const storedProfiles = project.referenceData?.edgeProfiles;
  const edgeProfiles = useMemo(() => storedProfiles ?? [], [storedProfiles]);

  /*
   * ФІЛЬТРИ (01.09, власник: «вікно більше, щоб картинки були більші, і
   * фільтри добав»). Матеріал — чиї форми показувати (і в якому порядку
   * груп); виконання — у товщині плити / лише з потовщенням; вид — форми /
   * операції / спадок; пошук — по коду, назві, id, формі. Порожній
   * матеріал = матеріал проєкту вгорі, решта нижче — як у випадачках.
   */
  const [query, setQuery] = useState('');
  const [materialFilter, setMaterialFilter] = useState<string>('');
  const [executionFilter, setExecutionFilter] = useState<'' | EdgeExecution>('');
  const [kindFilter, setKindFilter] = useState<'' | EdgeProfileKind>('');
  const [onlyDrawn, setOnlyDrawn] = useState(false);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => edgeProfiles.filter((p) => {
    const cls = edgeProfileClass(p.id);
    // «Лише універсальні» — без прив'язки до матеріалу; «<матеріал> + універсальні» — його форми і універсальні
    if (materialFilter === 'universal' && cls.materials) return false;
    if (materialFilter && materialFilter !== 'universal' && !edgeProfileFitsMaterial(p.id, materialFilter)) return false;
    if (executionFilter && cls.execution !== executionFilter) return false;
    if (kindFilter && cls.kind !== kindFilter) return false;
    if (onlyDrawn && !hasEdgeProfileDrawing(p.id)) return false;
    if (q) {
      const hay = [p.id, p.label, p.shortLabel, p.description, cls.form, cls.catalogCode].filter(Boolean).join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }), [edgeProfiles, materialFilter, executionFilter, kindFilter, onlyDrawn, q]);
  // Рядки — тими самими групами, що й випадачки редактора (обраний матеріал або матеріал проєкту вгорі)
  const groupMaterial = materialFilter && materialFilter !== 'universal' ? materialFilter : project.projectMaterial;
  const profileGroups = groupEdgeProfiles(filtered, groupMaterial);
  const MATERIALS = ['Керамограніт', 'Кварцит', 'Натуральний камінь', 'Акрил'];

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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[96vw] h-[94vh] flex flex-col overflow-hidden">
        {/* Шапка — як у документах Bottega: бренд, заголовок, підзаголовок, синя лінія */}
        <div className="px-6 pt-4 pb-3 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="bt-brand">Bottega <span>· Viyar Stone 3D · довідник</span></div>
              <h2 className="bt-h1 flex items-center gap-2"><Scissors className="w-5 h-5 text-[#0084ff]" /> Довідник обробок торців</h2>
              <div className="bt-sub">Форми кромки з каталогу цеху «Все кромки» (17.09.25): розріз, матеріал, спосіб виконання, припуск на розкрій і послуги. Матеріал і виконання — з коду, тут не редагуються.</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => setIsAdding(true)} className="bt-btn">
                <Plus className="w-4 h-4" />
                <span>Додати обробку</span>
              </button>
              <button onClick={onClose} className="bt-btn-ghost" title="Закрити">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="bt-rule" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 bg-white">

          {/* Фільтри */}
          <div className="bt-panel flex flex-wrap items-center gap-2 mb-3 mt-3">
            <span className="bt-k mr-1">Фільтри</span>
            <label className="relative" style={{ width: 300 }}>
              <Search className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Пошук: ZS20, R3, фаска, bullnose…"
                className="bt-input"
                style={{ paddingLeft: 30, width: 300 }}
              />
            </label>
            <select
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value)}
              className="bt-input"
              style={{ width: 320 }}
              title="Матеріал: чиї форми показувати"
            >
              <option value="">Усі матеріали{project.projectMaterial ? ` (проєкт: ${project.projectMaterial} вгорі)` : ''}</option>
              <option value="universal">Лише універсальні</option>
              {MATERIALS.map((m) => <option key={m} value={m}>{m} + універсальні</option>)}
            </select>
            <select
              value={executionFilter}
              onChange={(e) => setExecutionFilter(e.target.value as '' | EdgeExecution)}
              className="bt-input"
              style={{ width: 300 }}
              title="Спосіб виконання"
            >
              <option value="">Будь-яке виконання</option>
              <option value="base">{EXECUTION_LABEL.base}</option>
              <option value="buildup">{EXECUTION_LABEL.buildup}</option>
              <option value="both">{EXECUTION_LABEL.both}</option>
            </select>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as '' | EdgeProfileKind)}
              className="bt-input"
              style={{ width: 280 }}
              title="Вид запису"
            >
              <option value="">Форми, операції і спадок</option>
              <option value="form">Лише форми з каталогу</option>
              <option value="operation">Лише операції (стик, антик, 45°)</option>
              <option value="legacy">Лише спадок (нема в каталозі)</option>
            </select>
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none whitespace-nowrap" style={{ margin: 0 }}>
              <input type="checkbox" checked={onlyDrawn} onChange={(e) => setOnlyDrawn(e.target.checked)} style={{ width: 16, height: 16, margin: '0 6px 0 0' }} />
              лише з розрізом
            </label>
            <span className="ml-auto text-xs text-slate-500"><b className="text-slate-700">{filtered.length}</b> з {edgeProfiles.length}</span>
            {(query || materialFilter || executionFilter || kindFilter || onlyDrawn) && (
              <button
                type="button"
                onClick={() => { setQuery(''); setMaterialFilter(''); setExecutionFilter(''); setKindFilter(''); setOnlyDrawn(false); }}
                className="bt-btn-ghost"
                style={{ padding: '3px 10px', fontSize: 12 }}
              >
                скинути
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[12px] text-slate-500">
            <span><span className="bt-tag bt-tag-blue">Матеріал</span> на яких існує; «універсальна» — на всіх</span>
            <span><span className="bt-tag bt-tag-neutral bt-tag-lc">у товщині плити</span> <span className="bt-tag bt-tag-orange bt-tag-lc">лише з потовщенням</span> <span className="bt-tag bt-tag-sky bt-tag-lc">товщина і потовщення</span> — спосіб виконання</span>
            <span><span className="bt-tag bt-tag-amber">ZR20?</span> код каталогу, прив'язка не підтверджена</span>
            <span><span className="bt-tag bt-tag-red">операція</span> / <span className="bt-tag bt-tag-red">спадок</span> — не форма з каталогу</span>
          </div>

          <div className="rounded-[7px] overflow-hidden border border-[#dde5ee]">
            <table className="bt-table">
              <thead>
                <tr>
                  <th>Розріз</th>
                  <th>ID (код)</th>
                  <th>Повна назва</th>
                  <th>Скорочено</th>
                  <th>Опис</th>
                  <th>Матеріал · виконання</th>
                  <th className="text-center">Припуск, мм</th>
                  <th>Операції (послуги)</th>
                  <th className="text-right">Дії</th>
                </tr>
              </thead>
              <tbody>
                {isAdding && (
                  <tr className="bg-blue-50/50">
                    <td className="text-xs text-gray-400 italic">—</td>
                    <td>
                      <input 
                        type="text" 
                        value={addForm.id}
                        onChange={e => setAddForm({...addForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')})}
                        placeholder="my_edge_1"
                        className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        value={addForm.label}
                        onChange={e => setAddForm({...addForm, label: e.target.value})}
                        placeholder="Наприклад: Фаска 3х3"
                        className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        value={addForm.shortLabel}
                        onChange={e => setAddForm({...addForm, shortLabel: e.target.value})}
                        placeholder="Ф3х3"
                        className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        value={addForm.description}
                        onChange={e => setAddForm({...addForm, description: e.target.value})}
                        placeholder="Опис обробки"
                        className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </td>
                    <td className="text-xs text-gray-400 italic">за каталогом цеху</td>
                    <td className="px-4 py-2 text-center">
                      <input 
                        type="number" 
                        value={addForm.allowance}
                        step="0.5"
                        onChange={e => setAddForm({...addForm, allowance: Number(e.target.value)})}
                        className="w-16 px-2 py-1.5 border rounded text-xs text-center focus:ring-1 focus:ring-blue-500 outline-none font-mono mx-auto block"
                      />
                    </td>
                    <td>
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

                {!profileGroups.length && (
                  <tr><td colSpan={9} className="text-center text-sm text-slate-500" style={{ padding: 32 }}>Нічого не знайдено за цими фільтрами</td></tr>
                )}
                {profileGroups.map((group) => [
                  <tr key={`group:${group.key}:${group.label}`} className="bg-slate-50">
                    <td colSpan={9} className="bt-group">{group.label}</td>
                  </tr>,
                  ...group.profiles.map(profile => {
                  const isEditing = editingId === profile.id;
                  const cls = edgeProfileClass(profile.id);
                  return (
                    <tr key={profile.id} className="group">
                      <td className="w-56"><EdgeProfileThumb profileId={profile.id} height={72} /></td>
                      <td className="w-40"><span className="bt-code">{profile.id}</span></td>
                      <td>
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
                      <td>
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
                      <td>
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
                      <td className="w-56">
                        <div className="flex flex-wrap gap-1 items-center">
                          {cls.materials
                            ? cls.materials.map((m) => <span key={m} className="bt-tag bt-tag-blue bt-tag-lc">{m}</span>)
                            : <span className="bt-tag bt-tag-neutral bt-tag-lc">універсальна</span>}
                          {cls.catalogCode && <span className="bt-tag bt-tag-amber" title="Код у каталозі цеху — прив'язка не підтверджена">{cls.catalogCode}?</span>}
                        </div>
                        <div className="flex flex-wrap gap-1 items-center mt-1">
                          <span className={`bt-tag bt-tag-lc ${cls.execution === 'buildup' ? 'bt-tag-orange' : cls.execution === 'both' ? 'bt-tag-sky' : 'bt-tag-neutral'}`}>{EXECUTION_LABEL[cls.execution]}</span>
                          {cls.kind === 'operation' && <span className="bt-tag bt-tag-red">операція</span>}
                          {cls.kind === 'legacy' && <span className="bt-tag bt-tag-red">спадок</span>}
                        </div>
                        {cls.form && <div className="text-[11px] text-slate-500 mt-1">{cls.form}</div>}
                      </td>
                      <td className="text-center">
                        {isEditing ? (
                          <input 
                            type="number" 
                            step="0.5"
                            value={editForm.allowance || 0}
                            onChange={e => setEditForm({...editForm, allowance: Number(e.target.value)})}
                            className="w-16 px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none font-mono mx-auto block text-center"
                          />
                        ) : (
                          <span className="bt-code">+{profile.allowance}</span>
                        )}
                      </td>
                      <td>
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
                      <td className="text-right w-24">
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
                  }),
                ])}
              </tbody>
            </table>
          </div>
          <div className="bt-foot">Bottega · розрізи — з каталогу цеху «Все кромки» 17.09.25 (edgeProfileDrawings.ts) · матеріал і виконання — edgeProfileClasses.ts · натуральний камінь поруч із кварцитом як гіпотеза</div>
        </div>
      </div>
    </div>
  );
}
