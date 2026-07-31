import  { useMemo } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { getAllProjectDetails, explodeDetailsWrapped } from '../../store/projectHelpers';
import { extractServices, calculateServices } from '../../engines/servicesExtractor';
import { FileText, Download } from 'lucide-react';
import type { CalculatedService } from '../../domain/services';
import { useSettingsStore } from '../../store/useSettingsStore';

export function EstimatePanel() {
  const project = useProjectStore(s => s.project);
  const details = getAllProjectDetails(project);
  const catalog = useSettingsStore(s => s.serviceCatalog);

  const services = useMemo(() => {
    const { derivedJoints } = explodeDetailsWrapped(details);
    const reqs = extractServices(project, catalog, [], derivedJoints);
    return calculateServices(reqs, catalog);
  }, [project, details, catalog]);

  const totalCost = services.reduce((acc, s) => acc + s.totalPrice, 0);

  const handleExportJson = () => {
    const data = {
      projectInfo: {
        orderNumber: project.orderNumber,
        customer: project.customer,
      },
      services: services
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `koshtorys_${project.orderNumber || 'project'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getUnitLabel = (unit: string) => {
    switch (unit) {
      case 'm': return 'м.п.';
      case 'm2': return 'м²';
      case 'pcs': return 'шт';
      case 'комплект': return 'компл.';
      default: return unit;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 p-6 overflow-auto">
      <div className="max-w-5xl mx-auto w-full bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0084ff]/10 text-[#0084ff] rounded-md flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Кошторис проєкту (BOM)</h2>
              <p className="text-sm text-slate-500">Автоматичний розрахунок послуг на основі 3D-моделі</p>
            </div>
          </div>
          <button
            onClick={handleExportJson}
            className="flex items-center gap-2 px-4 py-2 bg-[#0084ff] text-white rounded-md text-sm font-bold hover:bg-[#006bce] transition-colors"
          >
            <Download className="w-4 h-4" />
            Експорт для MES
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0 uppercase font-bold">
              <tr>
                <th className="px-6 py-4">Код послуги</th>
                <th className="px-6 py-4">Назва</th>
                <th className="px-6 py-4 text-right">К-сть</th>
                <th className="px-6 py-4 text-center">Од.</th>
                <th className="px-6 py-4 text-right">Ціна (₴)</th>
                <th className="px-6 py-4 text-right">Сума (₴)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {services.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Немає розрахованих послуг. Додайте деталі та обробки до проєкту.
                  </td>
                </tr>
              ) : (
                services.map((srv: CalculatedService, i) => (
                  <tr key={`${srv.serviceId}-${i}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs">{srv.serviceId}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{srv.name}</td>
                    <td className="px-6 py-4 text-right font-medium text-slate-700">{srv.quantity.toFixed(2)}</td>
                    <td className="px-6 py-4 text-center text-slate-500">{getUnitLabel(srv.unit)}</td>
                    <td className="px-6 py-4 text-right text-slate-600">{srv.pricePerUnit.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-800">{srv.totalPrice.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with Total */}
        <div className="p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-slate-500 font-medium">Загальна вартість послуг та матеріалу:</span>
          <span className="text-2xl font-black text-[#0084ff]">{totalCost.toFixed(2)} ₴</span>
        </div>

      </div>
    </div>
  );
}