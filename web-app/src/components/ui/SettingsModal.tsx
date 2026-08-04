import React, { useState } from 'react';
import { 
  X, Plus, Save, Trash2, RefreshCw, 
  Settings2, Scissors, Grid, Circle, Square, Hammer, HardHat, FileBox, Link2
} from 'lucide-react';
import { useUIStore } from '../../store/useStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { ServiceDefinition, ServiceCategory, ServiceUnit } from '../../domain/services';
import { ServiceMappingPanel } from './ServiceMappingPanel';

type ProcessingCategory = {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  serviceIds: string[];
};

const PROCESSING_CATEGORIES: ProcessingCategory[] = [
  {
    id: 'edges',
    title: 'Обробка торців',
    icon: Scissors,
    description: 'Налаштування профілів торця (Фаска, Полірування, Заокруглення). Ці послуги автоматично застосовуються до країв деталей, які ви позначили відповідним профілем у 3D-редакторі.',
    serviceIds: ['EDGE_POLISH', 'EDGE_BEVEL', 'EDGE_ROUND']
  },
  {
    id: 'cutouts',
    title: 'Вирізи та Отвори',
    icon: Circle,
    description: 'Налаштування вартості вирізів під мийку, варильну поверхню та свердління отворів. Враховується тип монтажу (верхній/нижній) для додавання полірування внутрішнього контуру.',
    serviceIds: ['CUTOUT_ROUGH', 'CUTOUT_CLEAN', 'POLISH_INNER', 'CUTOUT_HOLE']
  },
  {
    id: 'gluing',
    title: 'Склейка (Підклейки)',
    icon: Square,
    description: 'Налаштування вартості склейки для потовщення (Thickenings) та фартухів (Folds). Автоматично рахує довжину склейки та необхідні різи під 45 градусів.',
    serviceIds: ['GLUING_45', 'GLUING_STRAIGHT', 'CUT_45']
  },
  {
    id: 'corners',
    title: 'Обробка кутів',
    icon: Grid,
    description: 'Налаштування радіусів та зрізів кутів. Вимірюється у штуках.',
    serviceIds: ['CORNER_RADIUS', 'CORNER_CHAMFER']
  },
  {
    id: 'cuts',
    title: 'Прямі різи',
    icon: Hammer,
    description: 'Базова вартість прямого різу. Розраховується автоматично на основі периметру деталі.',
    serviceIds: ['CUT_STRAIGHT']
  },
  {
    id: 'materials',
    title: 'Матеріали',
    icon: FileBox,
    description: 'Базова вартість матеріалів за квадратний метр. У розрахунок автоматично закладається коефіцієнт на відходи (технологічний запас).',
    serviceIds: ['MATERIAL_QUARTZ', 'MATERIAL_CERAMIC', 'MATERIAL_NATURAL', 'MATERIAL_ACRYLIC']
  },
  {
    id: 'engineering',
    title: 'Базові послуги',
    icon: HardHat,
    description: 'Інженерні та логістичні послуги: виїзд на замір, робота конструктора, монтаж виробу на об\'єкті.',
    serviceIds: ['MEASUREMENT', 'ENGINEERING', 'INSTALLATION']
  },
  {
    id: 'other',
    title: 'Інші / Кастомні',
    icon: Settings2,
    description: 'Всі інші послуги та послуги, додані вами вручну.',
    serviceIds: [] // Filtered dynamically
  }
];

export function SettingsModal() {
  const isOpen = useUIStore(s => s.isSettingsOpen);
  const setIsOpen = useUIStore(s => s.setIsSettingsOpen);
  const { serviceCatalog, updateService, addService, removeService, resetToDefault } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<string>('edges');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ServiceDefinition>>({});
  
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState<Partial<ServiceDefinition>>({
    id: '', name: '', unit: 'm', price: 0, category: 'machine'
  });

  if (!isOpen) return null;

  const handleEditClick = (service: ServiceDefinition) => {
    setEditingId(service.id);
    setEditForm({ ...service });
  };

  const handleSaveEdit = () => {
    if (editingId && editForm) {
      updateService(editingId, editForm);
    }
    setEditingId(null);
  };

  const handleAddSubmit = () => {
    if (addForm.id && addForm.name) {
      addService(addForm as ServiceDefinition);
      setIsAdding(false);
      setAddForm({ id: '', name: '', unit: 'm', price: 0, category: 'machine' });
    }
  };

  const categories: ServiceCategory[] = ['machine', 'manual', 'engineering', 'material'];
  const units: ServiceUnit[] = ['m', 'm2', 'pcs', 'комплект'];

  const activeCategory = PROCESSING_CATEGORIES.find(c => c.id === activeTab);
  
  // Get services for active category
  let displayedServices: ServiceDefinition[] = [];
  if (activeCategory) {
    if (activeCategory.id === 'other') {
      // Find all services not in any category's serviceIds list
      const knownIds = new Set(PROCESSING_CATEGORIES.flatMap(c => c.serviceIds));
      displayedServices = Object.values(serviceCatalog).filter(s => !knownIds.has(s.id));
    } else {
      displayedServices = activeCategory.serviceIds
        .map(id => serviceCatalog[id])
        .filter(Boolean);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-white">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">Налаштування послуг та обробок</h2>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Layout */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar */}
          <div className="w-64 bg-gray-50 border-r flex flex-col overflow-y-auto">
            <div className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Типи обробок
            </div>
            <div className="flex-1 flex flex-col gap-1 p-2">
              {PROCESSING_CATEGORIES.map(category => {
                const Icon = category.icon;
                const isActive = activeTab === category.id;
                return (
                  <button
                    key={category.id}
                    onClick={() => {
                      setActiveTab(category.id);
                      setEditingId(null);
                      setIsAdding(false);
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors text-left
                      ${isActive 
                        ? 'bg-blue-100/50 text-blue-700 font-medium' 
                        : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span>{category.title}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-2 border-t">
              <button
                onClick={() => {
                  setActiveTab('mapping');
                  setEditingId(null);
                  setIsAdding(false);
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors text-left w-full
                  ${activeTab === 'mapping'
                    ? 'bg-blue-100/50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
                title="Які послуги нараховуються за яку обробку"
              >
                <Link2 className={`w-4 h-4 ${activeTab === 'mapping' ? 'text-blue-600' : 'text-gray-400'}`} />
                <span>Прив'язки послуг</span>
              </button>
            </div>

            <div className="p-4 border-t">
              <button
                onClick={resetToDefault}
                className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                title="Увага! Всі ваші налаштування цін будуть скинуті до заводських."
              >
                <RefreshCw className="w-4 h-4" />
                <span>Скинути все</span>
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 bg-white flex flex-col overflow-y-auto p-6 relative">
            {activeTab === 'mapping' && <ServiceMappingPanel />}
            {activeCategory && (
              <>
                {/* Category Header */}
                <div className="flex items-start gap-4 mb-8">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                    <activeCategory.icon className="w-8 h-8 stroke-[1.5]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-1">{activeCategory.title}</h3>
                    <p className="text-sm text-gray-500 max-w-2xl leading-relaxed">
                      {activeCategory.description}
                    </p>
                  </div>
                </div>

                {/* Toolbar */}
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setIsAdding(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Додати послугу сюди</span>
                  </button>
                </div>

                {/* Table */}
                <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                  <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 border-b">
                      <tr>
                        <th className="px-4 py-3 font-medium">Код</th>
                        <th className="px-4 py-3 font-medium">Назва послуги</th>
                        <th className="px-4 py-3 font-medium">Категорія</th>
                        <th className="px-4 py-3 font-medium">Од. виміру</th>
                        <th className="px-4 py-3 font-medium">Ціна (₴)</th>
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
                              onChange={e => setAddForm({...addForm, id: e.target.value.toUpperCase()})}
                              placeholder="NEW_CODE"
                              className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input 
                              type="text" 
                              value={addForm.name}
                              onChange={e => setAddForm({...addForm, name: e.target.value})}
                              placeholder="Назва послуги"
                              className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <select 
                              value={addForm.category}
                              onChange={e => setAddForm({...addForm, category: e.target.value as ServiceCategory})}
                              className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                            >
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <select 
                              value={addForm.unit}
                              onChange={e => setAddForm({...addForm, unit: e.target.value as ServiceUnit})}
                              className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                            >
                              {units.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input 
                              type="number" 
                              value={addForm.price}
                              onChange={e => setAddForm({...addForm, price: Number(e.target.value)})}
                              className="w-24 px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={handleAddSubmit} className="text-green-600 hover:bg-green-100 p-1.5 rounded transition-colors" title="Зберегти">
                                <Save className="w-4 h-4" />
                              </button>
                              <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:bg-gray-100 p-1.5 rounded transition-colors" title="Скасувати">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      
                      {displayedServices.length === 0 && !isAdding && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                            У цій категорії немає послуг.
                          </td>
                        </tr>
                      )}

                      {displayedServices.map(service => {
                        const isEditing = editingId === service.id;
                        return (
                          <tr key={service.id} className="hover:bg-gray-50/80 transition-colors group">
                            <td className="px-4 py-3 text-xs font-mono text-gray-500 bg-gray-50/50 w-32">{service.id}</td>
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <input 
                                  type="text" 
                                  value={editForm.name || ''}
                                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                                  className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                              ) : (
                                <span className="font-medium text-gray-800">{service.name}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 w-32">
                              {isEditing ? (
                                <select 
                                  value={editForm.category}
                                  onChange={e => setEditForm({...editForm, category: e.target.value as ServiceCategory})}
                                  className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                >
                                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              ) : (
                                <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded text-[11px] font-medium tracking-wide uppercase">
                                  {service.category}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 w-28">
                              {isEditing ? (
                                <select 
                                  value={editForm.unit}
                                  onChange={e => setEditForm({...editForm, unit: e.target.value as ServiceUnit})}
                                  className="w-full px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                >
                                  {units.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              ) : (
                                <span className="text-gray-600">{service.unit}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 w-32">
                              {isEditing ? (
                                <input 
                                  type="number" 
                                  value={editForm.price || 0}
                                  onChange={e => setEditForm({...editForm, price: Number(e.target.value)})}
                                  className="w-24 px-2 py-1.5 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                                />
                              ) : (
                                <span className="font-mono text-gray-900">{service.price.toFixed(2)}</span>
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
                                    onClick={() => handleEditClick(service)} 
                                    className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors"
                                    title="Редагувати"
                                  >
                                    <Settings2 className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => removeService(service.id)} 
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
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
