import React, { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import type { DetailDraft } from '../forms/utils/draftHelpers';
import { DimensionsTable } from './DimensionsTable';
import { Detail2DBlueprint } from './Detail2DBlueprint';
import { sideOptionsFor, supportsEdges } from './FormsPanel';
import { getSideSize } from '../forms/utils/draftHelpers';

function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 mb-2 rounded-sm bg-white overflow-hidden">
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 bg-[#dcebf5] hover:bg-[#cbe0f0] flex items-center justify-between text-sm font-bold text-[#1f93ef] transition-colors"
      >
        {title}
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {isOpen && (
        <div className="p-0 border-t border-slate-200">
          {children}
        </div>
      )}
    </div>
  );
}

import type { Project } from '../../../domain/types';

export function ElementSettingsModal({
  initialDetail,
  project,
  onClose,
  onSave,
  embedded = false,
}: {
  initialDetail: DetailDraft;
  project: Project;
  onClose: () => void;
  onSave: (draft: DetailDraft) => void;
  /** true — рендеримо всередині робочої області (дерево і властивості лишаються видимі),
   *  false — як повноекранна модалка. Компонент один, змінюється лише обгортка. */
  embedded?: boolean;
}) {
  const [draft, setDraft] = useState<DetailDraft>(initialDetail);
  const sides = useMemo(() => sideOptionsFor(draft.kind), [draft.kind]);
  const showEdges = supportsEdges(draft.type);

  const updateDraft = (patch: Partial<DetailDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const errorSide = useMemo(() => {
    for (const side of sides) {
      const size = getSideSize(draft, side);
      if (size > 0 && size < 150) {
        return side;
      }
    }
    return null;
  }, [draft, sides]);

  return (
    <div
      className={embedded
        ? 'w-full h-full bg-white flex flex-col overflow-hidden font-sans'
        : 'fixed inset-0 z-[100] w-full h-full bg-white flex flex-col overflow-hidden font-sans'}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
    >
      {/* Header — у вбудованому режимі не потрібен, бо є заголовок робочої області */}
        {!embedded && (
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-700">Налаштування розмірів та торців</h2>
          <button className="hover:text-[#1f93ef] transition-colors text-slate-500" onClick={onClose} title="Закрити">
            <X className="w-6 h-6" />
          </button>
        </div>
        )}

        {/* Warning / Error Banner */}
        {errorSide ? (
          <div className="bg-[#cc0000] border-b border-[#a30000] px-6 py-2 text-center text-sm font-bold text-white">
            Помилка: Сторона {errorSide} має бути мінімум 150 мм
          </div>
        ) : (
          <div className="bg-[#fff9e6] border-b border-[#f2c94c] px-6 py-2 text-center text-sm font-medium text-slate-800">
            Попередження: Перевірте всі габаритні розміри
          </div>
        )}

        {/* Main Body Split */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Blueprint Area */}
          <div className="flex-1 p-6 flex flex-col bg-white">
            <div className="flex-1 bg-[#f4f7f9] border border-slate-300 relative rounded-md overflow-hidden shadow-inner">
              <Detail2DBlueprint detail={draft} />
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="flex-1 bg-[#f4f7f9] overflow-y-auto p-4 flex flex-col">
            {/* Сторони (Розміри та Кромка) */}
            {showEdges && (
              <Accordion title="Сторони" defaultOpen={true}>
                <div className="p-0 bg-white">
                  <DimensionsTable 
                    draft={draft} 
                    updateDetail={updateDraft} 
                    sides={sides} 
                    edgeProfiles={project.referenceData?.edgeProfiles ?? []}
                    material={project.slabs[0]?.material} // Use main material as default for estimation
                  />
                </div>
              </Accordion>
            )}
            {draft.kind === 'u' && (
              <Accordion title="Ширина" defaultOpen={true}>
                <div className="p-4 bg-white flex flex-col gap-2">
                  <input 
                    type="number" 
                    min="1"
                    value={Math.max(1, (draft.leftLegHeight ?? draft.height) - draft.innerCutDepth)}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value));
                      const maxH = Math.max(draft.leftLegHeight ?? draft.height, draft.rightLegHeight ?? draft.height);
                      updateDraft({ innerCutDepth: Math.max(0, maxH - val) });
                    }}
                    className="w-full p-2 border border-slate-300 rounded-sm outline-none focus:border-[#1f93ef] text-sm font-mono"
                  />
                  <span className="text-xs text-slate-500">Товщина верхньої частини деталі</span>
                </div>
              </Accordion>
            )}

            <Accordion title="Товщина виробу" defaultOpen={true}>
              <div className="p-4 bg-white flex flex-col gap-2">
                <select 
                  value={draft.thickness.toString()}
                  onChange={(e) => updateDraft({ thickness: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-sm outline-none focus:border-[#1f93ef] bg-white text-sm"
                >
                  <option value="12">12</option>
                  <option value="20">20</option>
                  <option value="30">30</option>
                  <option value="40">40</option>
                </select>
              </div>
            </Accordion>

            <Accordion title="Висота встановлення" defaultOpen={true}>
              <div className="p-4 bg-white flex flex-col gap-2">
                <label className="text-xs text-slate-500">Висота від підлоги, мм</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={draft.elevation ?? 900}
                  onChange={(e) => updateDraft({ elevation: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-sm outline-none focus:border-[#1f93ef] bg-white text-sm"
                />
              </div>
            </Accordion>

            <Accordion title="Кількість виробів">
              <div className="p-4 bg-white">
                <input
                  type="number"
                  min="1"
                  value={draft.quantity}
                  onChange={(e) => updateDraft({ quantity: Math.max(1, Number(e.target.value)) })}
                  className="w-full p-2 border border-slate-300 rounded-sm outline-none focus:border-[#1f93ef] text-sm"
                />
              </div>
            </Accordion>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-slate-300 text-slate-600 font-medium rounded-sm hover:bg-slate-100 transition-colors"
          >
            Закрити
          </button>
          <button 
            type="button"
            onClick={() => onSave(draft)}
            disabled={!!errorSide}
            className={`px-8 py-2 font-bold rounded-sm shadow-sm transition-colors ${
              errorSide 
                ? "bg-slate-300 text-slate-500 cursor-not-allowed" 
                : "bg-[#1f93ef] text-white hover:bg-[#1875c0]"
            }`}
          >
            Зберегти
          </button>
        </div>
    </div>
  );
}
