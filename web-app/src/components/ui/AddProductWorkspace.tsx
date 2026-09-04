import React, { useState } from 'react';
import { X, Box, Check } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
import { DesignerCanvas, designsForType } from './FormsPanel';
import { EdgeProcessingDesigner } from '../forms/editors/EdgeProcessingDesigner';
import type { ShapeKind, DetailDraft } from '../forms/utils/draftHelpers';
import {
  visibleDetailTypes,
  baseDesigns,
  createDraft,
  defaultsForKind,
  allSides
} from '../forms/utils/draftHelpers';
import { ShapeIcon } from '../forms/utils/sharedInputs';
import { translateStaticUiText } from '../../i18n';

interface AddProductWorkspaceProps {
  onClose: () => void;
}

export const AddProductWorkspace: React.FC<AddProductWorkspaceProps> = ({ onClose }) => {
  const [detail, setDetail] = useState<DetailDraft>(createDraft());
  const [activeTab, setActiveTab] = useState<'base' | '2d' | '3d'>('base');
  const project = useProjectStore((s) => s.project);
  const language = useProjectStore((s) => s.language);
  const isAdminUnlocked = useUIStore((s) => s.isAdminUnlocked);
  const ui = (text: string) => translateStaticUiText(language, text);

  // Get dynamic shapes based on the selected type
  const designs = designsForType(detail.type, isAdminUnlocked, detail.kind);
  const sides = allSides;

  const updateDetail = (patch: Partial<DetailDraft>) => {
    setDetail(prev => ({
      // Зміна форми тягне за собою її розміри (`defaultsForKind`) — так само,
      // як у панелі деталей. Без цього П-подібна лишалась із розмірами
      // прямокутника 1200 × 600, і сторона C виходила 1 мм (04.09.2026).
      ...prev,
      ...(patch.kind ? defaultsForKind(patch.kind, prev.kind) : {}),
      ...patch,
    }));
  };

  const handleCreate = () => {
    useUIStore.getState().setProductEditorSession({
      mainDetail: detail,
      subDetails: {},
      activeDetailId: 'main'
    });
    onClose();
  };

  return (
    <div className="absolute inset-0 bg-[#eaf0f4] z-50 flex flex-col shadow-lg overflow-hidden animate-in fade-in zoom-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#c6d3dd]">
        <div>
          <h1 className="text-2xl font-bold text-[#1f2d3a] flex items-center gap-3">
            <Box className="w-6 h-6 text-[#0084ff]" />
            Додати виріб (Pro Mode)
          </h1>
          <p className="text-sm text-slate-500 mt-1">Використання старої логіки малювання у новому повноекранному форматі</p>
        </div>
        <button 
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content with Sidebar */}
      <div className="flex-1 overflow-hidden flex max-w-[1400px] mx-auto w-full">
        
        {/* Left Sidebar */}
        <div className="w-[280px] bg-white border-r border-[#c6d3dd] flex flex-col p-4 gap-2 z-10 shadow-[2px_0_10px_rgba(0,0,0,0.02)]">
          <button
            className={`text-left px-4 py-3 rounded-md font-bold text-sm transition-colors ${
              activeTab === 'base' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('base')}
          >
            1. Створення бази
          </button>
          <button
            className={`text-left px-4 py-3 rounded-md font-bold text-sm transition-colors ${
              activeTab === '2d' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('2d')}
          >
            2. 2D обробка
          </button>
          <button
            className={`text-left px-4 py-3 rounded-md font-bold text-sm transition-colors ${
              activeTab === '3d' ? 'bg-[#0084ff] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('3d')}
          >
            3. 3D обробка
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-8 flex flex-col gap-6">
          
          {activeTab === 'base' && (
            <div className="flex flex-col gap-6 max-w-[1000px] mx-auto w-full">
              {/* Type & Shape Selection */}
              <div className="flex gap-6">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-slate-600 mb-2">Тип</label>
                  <select 
                    value={detail.type} 
                    onChange={(e) => {
                      const newType = e.target.value as any;
                      const nextDesigns = designsForType(newType, isAdminUnlocked, detail.kind);
                      if (!nextDesigns.some(d => d.kind === detail.kind)) {
                        updateDetail({ type: newType, kind: nextDesigns[0].kind });
                      } else {
                        updateDetail({ type: newType });
                      }
                    }}
                    className="w-full h-10 px-3 border border-slate-300 rounded-md focus:border-[#0084ff] outline-none bg-white text-base font-medium shadow-sm"
                  >
                    {visibleDetailTypes(isAdminUnlocked, detail.type).map((type) => (
                      <option key={type} value={type}>{ui(type)}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex-[2]">
                  <label className="block text-sm font-semibold text-slate-600 mb-2">Форма</label>
                  <div className="flex gap-2 h-20">
                    {designs.map((design) => (
                      <button
                        key={design.kind}
                        type="button"
                        className={`flex-1 rounded-md flex flex-col items-center justify-center gap-2 border-2 transition-all ${
                          design.kind === detail.kind 
                            ? 'border-[#0084ff] bg-[#f0f7ff] text-[#0084ff]' 
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                        onClick={() => updateDetail({ kind: design.kind })}
                      >
                        <div className="w-12 h-8 [&>svg]:w-full [&>svg]:h-full [&>svg]:stroke-current [&>svg]:fill-transparent [&>svg]:stroke-2">
                          <ShapeIcon kind={design.kind} />
                        </div>
                        <span className="text-xs font-bold">{ui(design.label)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Material & Thickness */}
              <div className="flex items-center gap-4 bg-white p-4 rounded-md border border-slate-200 shadow-sm">
                <div className="text-sm font-semibold text-slate-600">Матеріал:</div>
                <div className="text-sm font-bold">{ui(project.projectMaterial || 'Не обрано')}</div>
                
                <div className="text-sm font-semibold text-slate-600 ml-8">Товщина, мм:</div>
                <input 
                  type="number" 
                  value={project.projectThickness || ''} 
                  disabled
                  className="w-24 h-8 px-2 border border-slate-300 bg-slate-50 text-slate-500 rounded-sm outline-none text-sm cursor-not-allowed"
                />
              </div>

              {/* Real Designer Canvas */}
              <div className="bg-[#eaf0f4] border border-[#c6d3dd] rounded-md p-6 flex flex-col gap-4 shadow-inner">
                <div className="text-sm font-bold text-slate-700">Розмір та Параметрика</div>
                <div className="bg-white border border-slate-200 rounded-md shadow-sm p-4">
                  <DesignerCanvas detail={detail} updateDetail={updateDetail} language={language} />
                </div>
              </div>
            </div>
          )}

          {activeTab === '2d' && (
            <div className="flex flex-col gap-6 max-w-[1000px] mx-auto w-full">
              <div className="bg-white border border-[#c6d3dd] rounded-md p-6 shadow-sm flex flex-col items-center justify-center text-center py-20">
                <div className="w-16 h-16 bg-blue-100 text-[#0084ff] rounded-full flex items-center justify-center mb-4">
                  <Box className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-[#1f2d3a] mb-2">2D Обробка</h2>
                <p className="text-slate-500 max-w-md">
                  Тут буде функціонал для роботи з вирізами, раковинами, мийками, кутами, та іншою 2D-параметрикою геометрії.
                </p>
              </div>
              {/* Optional: Show canvas again so they see the result */}
              <div className="bg-[#eaf0f4] border border-[#c6d3dd] rounded-md p-6 flex flex-col gap-4 shadow-inner opacity-70 pointer-events-none">
                <div className="text-sm font-bold text-slate-700">Поточна геометрія</div>
                <div className="bg-white border border-slate-200 rounded-md shadow-sm p-4">
                  <DesignerCanvas detail={detail} updateDetail={updateDetail} language={language} />
                </div>
              </div>
            </div>
          )}

          {activeTab === '3d' && (
            <div className="flex flex-col gap-6 max-w-[1000px] mx-auto w-full">
              <div className="bg-[#eaf0f4] border border-[#c6d3dd] rounded-md p-6 flex flex-col gap-4 shadow-inner">
                <div className="text-sm font-bold text-slate-700">Обробка торців</div>
                <div className="bg-white border border-slate-200 rounded-md shadow-sm p-4">
                  <EdgeProcessingDesigner
                    edgeProfiles={detail.edgeProfiles}
                    thickening={detail.thickening}
                    fold={detail.fold}
                    sides={sides}
                    blockedEdgeSides={[]}
                    linkedThickeningSides={[]}
                    linkedFoldSides={[]}
                    onChange={(patch) => updateDetail(patch)}
                  />
                </div>
              </div>

              <div className="bg-white border border-slate-200 border-dashed rounded-md p-6 flex flex-col items-center justify-center text-center">
                <h3 className="text-base font-bold text-slate-600 mb-1">Інші 3D обробки</h3>
                <p className="text-sm text-slate-400">Підвороти, Стінові панелі, Опори (Ноги) додаватимуться тут.</p>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex justify-end gap-4 mt-auto pt-6 border-t border-slate-200">
            <button 
              onClick={onClose}
              className="px-6 py-2 border border-slate-300 rounded-md text-slate-600 font-bold hover:bg-slate-100 transition-colors"
            >
              Скасувати
            </button>
            <button 
              onClick={handleCreate}
              className="px-8 py-2 bg-[#0084ff] text-white rounded-md font-bold shadow-md hover:bg-[#006bce] transition-colors flex items-center gap-2"
            >
              <Check className="w-5 h-5" />
              {activeTab === '3d' ? 'Завершити та Створити' : 'Зберегти (Pro Mode)'}
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
};
