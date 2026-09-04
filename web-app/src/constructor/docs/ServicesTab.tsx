/**
 * ВКЛАДКА «ФОРМУВАННЯ ДОКІВ» — 04.09.2026.
 *
 * Власник: «Послуги для виробництва — старий спліт з розкроєм». Тобто
 * ліворуч дошка розкрою, праворуч повний перелік операцій з кодами —
 * ТІ САМІ компоненти VS3D (`SlabBoard`, `EstimatePanel`), нічого не
 * дублюємо, лише кладемо поруч. Клік по рядку кошторису підсвічує лінії
 * на карті крою — це вже вміє глобальний стор.
 */
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { SlabBoard } from '../../components/2d/SlabBoard';
import { EstimatePanel } from '../../components/ui/EstimatePanel';
import { UnplacedPartsPanel } from '../../components/ui/UnplacedPartsPanel';

export function ServicesTab() {
  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-w-0 flex flex-col gap-4 pt-1.5 px-4 pb-4 overflow-y-auto custom-scrollbar border-r border-slate-200">
        <ErrorBoundary componentName="SlabBoard">
          <div className="shrink-0 relative"><SlabBoard compact /></div>
        </ErrorBoundary>
        <ErrorBoundary componentName="UnplacedPartsPanel"><UnplacedPartsPanel /></ErrorBoundary>
      </div>
      <div className="w-[46%] min-w-[420px] shrink-0 flex flex-col h-full relative">
        <ErrorBoundary componentName="EstimatePanel"><EstimatePanel /></ErrorBoundary>
      </div>
    </div>
  );
}

export default ServicesTab;
