import  { useState, useMemo } from 'react';
import { X, FileText, Settings, Plus, Trash2 } from 'lucide-react';
import type { Detail, Project, CustomService } from '../../domain/types';
import { computeDetailEstimate } from '../../engines/estimate';
import { useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { translateStaticUiText } from '../../i18n';
import { findDetailByPathOrSlot } from '../../domain/ids';
import { FACT_KIND_LABELS, factUnit } from '../../domain/serviceMapping';
import type { ProductionFact } from '../../engines/productionFacts';

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
  const parts = useProjectStore(s => s.parts);
  const serviceCatalog = useSettingsStore(s => s.serviceCatalog);
  const mappingOverrides = useSettingsStore(s => s.mappingOverrides);
  const customRules = useSettingsStore(s => s.customRules);
  const getRules = useSettingsStore(s => s.getRules);
  const ui = (val: string) => translateStaticUiText(language, val);
  
  const [activeTab, setActiveTab] = useState<'passport' | 'settings'>(initialTab);
  
  // Меню в 3D віддає слот, а деталі приходять повними шляхами — шукаємо
  // в обох формах, інакше вікно просто не відкривається.
  const detail = useMemo(() => findDetailByPathOrSlot(details, detailId), [details, detailId]);
  
  const [customServices, setCustomServices] = useState<CustomService[]>(
    detail?.customServices ? [...detail.customServices] : []
  );

  // Той самий рушій, що й у кошторисі, з користувацьким прайсом і
  // прив'язками. Раніше тут стояв окремий виклик зі стандартним каталогом,
  // тому паспорт показував заводські ціни, а не ті, що налаштував керівник.
  // Розріз по одній деталі: спершу відсіюються факти, і вже вони
  // перекладаються в послуги. Фільтрувати готові рядки кошторису не можна —
  // у них кількість зібрана з усього проєкту.
  const detailEstimate = useMemo(() => {
    if (!project || !details) return null;
    return computeDetailEstimate(project, parts, detailId, {
      details,
      catalog: serviceCatalog,
      rules: getRules(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, parts, details, detailId, serviceCatalog, mappingOverrides, customRules]);

  const calculatedServices = detailEstimate?.lines ?? [];
  const detailFacts = detailEstimate?.facts ?? [];

  const edgeProfiles = project?.referenceData?.edgeProfiles ?? [];
  const unitLabel = (unit: string) => (unit === 'm' ? 'м.п.' : unit === 'm2' ? 'м²' : unit === 'pcs' ? 'шт' : unit);

  /** Людський підпис обробки: «Торець R2 · сторона B» */
  const describeFact = (fact: ProductionFact) => {
    const base = FACT_KIND_LABELS[fact.kind] ?? fact.kind;
    const parts: string[] = [];
    if (fact.variant) {
      const profile = edgeProfiles.find((item) => item.id === fact.variant);
      parts.push(profile?.shortLabel || profile?.label || fact.variant);
    }
    if (fact.ref?.side) parts.push(`сторона ${fact.ref.side}`);
    if (fact.ref?.cornerId) parts.push(`кут ${fact.ref.cornerId}`);
    if (fact.ref?.cutoutIndex !== undefined) parts.push(`виріз ${fact.ref.cutoutIndex + 1}`);
    return parts.length ? `${base} · ${parts.join(' · ')}` : base;
  };

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
                    <span className="font-medium text-slate-800">{project?.projectMaterial || 'Не вказано'}</span>
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

              {/* Обробки, які підтягуються на деталь */}
              <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 mb-1 uppercase tracking-wider">Обробки на деталі</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Те, що програма побачила в геометрії. З цього нараховуються послуги нижче.
                </p>
                {detailFacts.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">
                    Обробок не знайдено. Якщо деталь щойно змінили — запустіть розкрій, факти рахуються з нього.
                  </p>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 bg-slate-50 border-y border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Обробка</th>
                        <th className="py-2 px-3 w-24 text-right">К-сть</th>
                        <th className="py-2 px-3 w-20">Од.вим.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailFacts.map((fact, idx) => (
                        <tr key={`${fact.kind}_${idx}`} className="hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-800">{describeFact(fact)}</td>
                          <td className="py-2 px-3 text-slate-800 font-medium text-right">{fact.qty.toFixed(3)}</td>
                          <td className="py-2 px-3 text-slate-500">{unitLabel(factUnit(fact.kind))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Calculated Services */}
              <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 mb-1 uppercase tracking-wider">Послуги за цією деталлю</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Прив'язки налаштовуються в Налаштування → Прив'язки послуг.
                </p>
                {calculatedServices.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">Немає автоматично розрахованих послуг для цієї деталі.</p>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 bg-slate-50 border-y border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Послуга</th>
                        <th className="py-2 px-3 w-24 text-right">К-сть</th>
                        <th className="py-2 px-3 w-20">Од.вим.</th>
                        <th className="py-2 px-3 w-24 text-right">Сума, ₴</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {calculatedServices.map((cs, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-800">
                            {cs.name}
                            {cs.externalId && <span className="ml-2 text-xs text-slate-400 font-mono">{cs.externalId}</span>}
                          </td>
                          <td className="py-2 px-3 text-slate-800 font-medium text-right">{cs.quantity.toFixed(2)}</td>
                          <td className="py-2 px-3 text-slate-500">{unitLabel(cs.unit)}</td>
                          <td className="py-2 px-3 text-slate-800 text-right">{cs.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200">
                        <td className="py-2 px-3 text-slate-500" colSpan={3}>Разом за деталлю</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-800">
                          {(detailEstimate?.total ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
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
                            {cs.name || serviceCatalog[cs.serviceId]?.name || cs.serviceId}
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
                              handleUpdateCustomService(index, 'name', serviceCatalog[e.target.value]?.name);
                            }
                          }}
                        >
                          <option value="custom">Своя назва (інше)...</option>
                          {Object.values(serviceCatalog).map(service => (
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