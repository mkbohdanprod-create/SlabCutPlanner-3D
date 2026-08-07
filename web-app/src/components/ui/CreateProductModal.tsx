import { useState, useMemo } from 'react';
import { X, HelpCircle, LayoutTemplate } from 'lucide-react';
import { translateStaticUiText } from '../../i18n';
import { ShapeIcon } from '../forms/utils/sharedInputs';
import { visibleDetailTypes, createDraft } from '../forms/utils/draftHelpers';
import { useUIStore } from '../../store/useStore';
import type { DetailDraft, ShapeKind, ProductEditorSession } from '../forms/utils/draftHelpers';
import type { DetailType } from '../../domain/types';
import { designsForType} from './FormsPanel';
import { ProductTemplateModal } from './ProductTemplateModal';

export function CreateProductModal({
  onClose,
  onSave,
  onApplyTemplate,
}: {
  onClose: () => void;
  onSave: (draft: DetailDraft, name: string) => void;
  /** Шаблони виробів (адмін-фіча): готова сесія редактора замість порожньої деталі. */
  onApplyTemplate?: (session: ProductEditorSession) => void;
}) {
  const [draft, setDraft] = useState<DetailDraft>(() => createDraft());
  const [productName, setProductName] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const isAdminUnlocked = useUIStore((s) => s.isAdminUnlocked);

  const designs = useMemo(() => designsForType(draft.type), [draft.type]);
  const ui = (text: string) => translateStaticUiText('uk', text);

  const updateDraft = (patch: Partial<DetailDraft>) => {
    setDraft({ ...draft, ...patch });
  };

  const handleSave = () => {
    onSave(draft, productName);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4" role="presentation">
      <div 
        className="w-full max-w-[500px] bg-[#dcebf5] rounded-md shadow-2xl flex flex-col overflow-hidden font-sans"
        role="dialog" 
        aria-modal="true" 
        aria-label="Новий виріб"
      >
        {/* Header */}
        <div className="bg-[#2489d8] text-white px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Новий виріб</h2>
          <div className="flex items-center gap-3 text-white/80">
            {/* Шаблони — на релізі сховано: лише супер-адмін (щит, PIN) */}
            {isAdminUnlocked && onApplyTemplate && (
              <button
                className="flex items-center gap-1.5 text-sm font-medium bg-white/15 hover:bg-white/25 text-white rounded-sm px-2.5 py-1 transition-colors"
                onClick={() => setTemplatesOpen(true)}
                title="Шаблони виробів (адмін)"
              >
                <LayoutTemplate className="w-4 h-4" />
                Шаблони
              </button>
            )}
            <button className="hover:text-white transition-colors" title="Довідка">
              <HelpCircle className="w-5 h-5" />
            </button>
            <button className="hover:text-white transition-colors" onClick={onClose} title="Закрити">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-5">
          {/* Назва виробу */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              Назва виробу
            </label>
            <input 
              type="text" 
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full bg-white border border-transparent focus:border-[#2489d8] rounded-sm px-3 py-2 text-sm outline-none shadow-sm transition-colors"
            />
          </div>

          {/* Тип і Товщина */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                Базовий елемент
              </label>
              <select 
                value={draft.type} 
                onChange={(e) => updateDraft({ type: e.target.value as DetailType })}
                className="w-full bg-white border border-transparent focus:border-[#2489d8] rounded-sm px-3 py-2 text-sm outline-none shadow-sm cursor-pointer"
              >
                {visibleDetailTypes(isAdminUnlocked, draft.type).map((type) => (
                  <option key={type} value={type}>{ui(type)}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                Товщина виробу:
              </label>
              <select 
                value={draft.thickness.toString()} 
                onChange={(e) => updateDraft({ thickness: Number(e.target.value) })}
                className="w-full bg-white border border-transparent focus:border-[#2489d8] rounded-sm px-3 py-2 text-sm outline-none shadow-sm cursor-pointer"
              >
                <option value="12">12</option>
                <option value="20">20</option>
                <option value="30">30</option>
                <option value="40">40</option>
              </select>
            </div>
          </div>

          {/* Кількість */}
          <div className="w-1/3">
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              Кількість
            </label>
            <div className="flex items-center bg-white rounded-sm shadow-sm border border-transparent focus-within:border-[#2489d8] overflow-hidden">
              <input 
                type="number" 
                min="1"
                value={draft.quantity}
                onChange={(e) => updateDraft({ quantity: Math.max(1, Number(e.target.value)) })}
                className="flex-1 w-full px-3 py-2 text-sm outline-none font-bold text-slate-700"
              />
              <span className="px-3 text-sm text-slate-500 font-medium bg-slate-50 border-l border-slate-200">
                шт
              </span>
            </div>
          </div>

          {/* Форми (Radio buttons + Thumbnails) */}
          <div className="mt-2 grid grid-cols-3 gap-6">
            {designs.map((design) => (
              <div key={design.kind} className="flex flex-col gap-2">
                <label 
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={(e) => {
                    e.preventDefault();
                    updateDraft({ kind: design.kind });
                  }}
                >
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${draft.kind === design.kind ? 'border-[#2489d8]' : 'border-slate-400 group-hover:border-[#2489d8]'}`}>
                    {draft.kind === design.kind && <div className="w-2.5 h-2.5 rounded-full bg-[#2489d8]" />}
                  </div>
                  <span className="text-sm font-medium text-slate-700">{ui(design.label)}</span>
                </label>
                
                <button
                  type="button"
                  onClick={() => updateDraft({ kind: design.kind })}
                  className={`h-24 bg-slate-400/50 rounded-sm flex items-center justify-center transition-all ${
                    draft.kind === design.kind 
                      ? 'bg-[#2489d8]/10 ring-2 ring-[#2489d8] text-[#2489d8]' 
                      : 'text-slate-500 hover:bg-slate-400/70'
                  }`}
                >
                  <ShapeIcon kind={design.kind} />
                </button>
              </div>
            ))}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex justify-end">
          <button 
            type="button"
            onClick={handleSave}
            className="px-6 py-2 border border-[#2489d8] text-[#2489d8] font-bold rounded-sm hover:bg-[#2489d8] hover:text-white transition-colors"
          >
            Додати
          </button>
        </div>
      </div>

      {templatesOpen && onApplyTemplate && (
        <ProductTemplateModal
          onClose={() => setTemplatesOpen(false)}
          onCreate={(session) => {
            setTemplatesOpen(false);
            onApplyTemplate(session);
          }}
        />
      )}
    </div>
  );
}