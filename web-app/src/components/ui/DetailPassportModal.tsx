import  { useState, useMemo } from 'react';
import { X, FileText, Settings, Plus, Trash2 } from 'lucide-react';
import type { Detail, Project, CustomService } from '../../domain/types';
import { extractServices, calculateServices } from '../../engines/servicesExtractor';
import { DEFAULT_SERVICE_CATALOG } from '../../domain/services';
import { useProjectStore } from '../../store/useProjectStore';
import { translateStaticUiText } from '../../i18n';

interface DetailPassportModalProps {
  detailId: string;
  project: Project | null;
  details: Detail[];
  initialTab?: 'passport' | 'settings';
  onClose: () => void;
  onSave: (detailId: string, customServices: CustomService[]) => void;
}

export function DetailPassportModal({
  detailId,
  project,
  details,
  initialTab = 'passport',
  onClose,
  onSave
}: DetailPassportModalProps) {
  const language = useProjectStore(s => s.language);
  const ui = (val: string) => translateStaticUiText(language, val);
  
  const [activeTab, setActiveTab] = useState<'passport' | 'settings'>(initialTab);
  
  const detail = useMemo(() => details.find(d => d.id === detailId), [details, detailId]);
  
  const [customServices, setCustomServices] = useState<CustomService[]>(
    detail?.customServices ? [...detail.customServices] : []
  );

  const calculatedServices = useMemo(() => {
    if (!project || !details) return [];
    const reqs = extractServices(project, undefined);
    const allServices = calculateServices(reqs, DEFAULT_SERVICE_CATALOG);
    return allServices.filter(s => s.detailsRef?.includes(detailId));
  }, [project, details, detailId]);

  if (!detail) return null;

  const handleAddCustomService = () => {
    setCustomServices([...customServices, { serviceId: '', quantity: 1, name: '' }]);
  };

  const handleUpdateCustomService = (index: number, field: keyof CustomService, value: any) => {
    const newServices = [...customServices];
    newServices[index] = { ...newServices[index], [field]: value };
    setCustomServices(newServices);
  };

  const handleRemoveCustomService = (index: number) => {
    const newServices = [...customServices];
    newServices.splice(index, 1);
    setCustomServices(newServices);
  };

  const handleSave = () => {
    onSave(detailId, customServices.filter(s => s.serviceId || s.name));
    onClose();
  };

  const area = ((detail.geometry.width || 0) * (detail.geometry.height || 0) / 1000000).toFixed(3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <FileText className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {detail.type} {detail.label ? `(${detail.label})` : ''}
              </h2>
              <p className="text-sm text-slate-500">
                ID: <span className="font-mono">{detail.id}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6">
          <button
            className={`py-3 px-4 font-medium text-sm border-b-2 flex items-center gap-2 ${
              activeTab === 'passport' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setActiveTab('passport')}
          >
            <FileText className="w-4 h-4" />
            Паспорт деталі
          </button>
          <button
            className={`py-3 px-4 font-medium text-sm border-b-2 flex items-center gap-2 ${
              activeTab === 'settings' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings className="w-4 h-4" />
            Налаштування обробок
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          
          {activeTab === 'passport' && (
            <div className="space-y-6">
              {/* Parameters */}
              <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Параметри</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500 block mb-1">Матеріал</span>
                    <span className="font-medium text-slate-800">{project?.referenceData?.materials[0] || 'Не вказано'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1">Товщина</span>
                    <span className="font-medium text-slate-800">{detail.thickness} мм</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1">Габарити (Ш x В)</span>
                    <span className="font-medium text-slate-800">{detail.geometry.width} × {detail.geometry.height} мм</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1">Площа</span>
                    <span className="font-medium text-slate-800">{area} м²</span>
                  </div>
                </div>
              </div>

              {/* Calculated Services */}
              <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Розраховані послуги</h3>
                {calculatedServices.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">Немає автоматично розрахованих послуг для цієї деталі.</p>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 bg-slate-50 border-y border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Послуга</th>
                        <th className="py-2 px-3 w-24">Кількість</th>
                        <th className="py-2 px-3 w-20">Од.вим.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {calculatedServices.map((cs, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-800">{cs.name}</td>
                          <td className="py-2 px-3 text-slate-800 font-medium">{cs.quantity.toFixed(2)}</td>
                          <td className="py-2 px-3 text-slate-500">{cs.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Custom Services */}
              {customServices.length > 0 && (
                <div className="bg-amber-50 p-5 rounded-lg shadow-sm border border-amber-200">
                  <h3 className="text-sm font-bold text-amber-800 mb-4 uppercase tracking-wider">Ручні коригування</h3>
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-amber-700/70 border-b border-amber-200">
                      <tr>
                        <th className="py-2 px-3">Послуга</th>
                        <th className="py-2 px-3 w-24">Кількість</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-200/50">
                      {customServices.map((cs, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 text-amber-900 font-medium">
                            {cs.name || DEFAULT_SERVICE_CATALOG[cs.serviceId]?.name || cs.serviceId}
                          </td>
                          <td className="py-2 px-3 text-amber-900">{cs.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 min-h-[300px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Додаткові послуги</h3>
                <button 
                  onClick={handleAddCustomService}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                >
                  <Plus className="w-4 h-4" /> Додати
                </button>
              </div>

              {customServices.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-slate-500">Немає ручних коригувань для цієї деталі.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {customServices.map((cs, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
                      <div className="flex-1">
                        <select
                          className="w-full text-sm p-2 border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={cs.serviceId || 'custom'}
                          onChange={(e) => {
                            if (e.target.value === 'custom') {
                              handleUpdateCustomService(index, 'serviceId', '');
                            } else {
                              handleUpdateCustomService(index, 'serviceId', e.target.value);
                              handleUpdateCustomService(index, 'name', DEFAULT_SERVICE_CATALOG[e.target.value]?.name);
                            }
                          }}
                        >
                          <option value="custom">Своя назва (інше)...</option>
                          {Object.values(DEFAULT_SERVICE_CATALOG).map(service => (
                            <option key={service.id} value={service.id}>{service.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      {(!cs.serviceId || cs.serviceId === '') && (
                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder="Назва послуги"
                            className="w-full text-sm p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={cs.name || ''}
                            onChange={(e) => handleUpdateCustomService(index, 'name', e.target.value)}
                          />
                        </div>
                      )}

                      <div className="w-24">
                        <input
                          type="number"
                          placeholder="К-ть"
                          step="0.01"
                          className="w-full text-sm p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={cs.quantity || ''}
                          onChange={(e) => handleUpdateCustomService(index, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      
                      <button 
                        onClick={() => handleRemoveCustomService(index)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 bg-white rounded-b-xl gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Скасувати
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Зберегти зміни
          </button>
        </div>

      </div>
    </div>
  );
}