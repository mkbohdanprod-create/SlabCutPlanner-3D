import React, { useState } from 'react';
import { ChevronDown, Play, Trash2, Globe, Settings, Download } from 'lucide-react';
import type { PackingMode } from '../../domain/types';
import { languageOptions, packingModeLabel, t } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';

const packingModes: PackingMode[] = ['economy', 'optimal', 'full_texture'];

export function HeaderToolbar() {
  const { 
    project, 
    packingMode, 
    setPackingMode, 
    setUiLanguage, 
    updateProjectHeader, 
    runPacking, 
    clearCalculation 
  } = useProjectStore();
  
  const [menuOpen, setMenuOpen] = useState(false);
  const language = project.uiLanguage ?? 'uk';

  const clearClick = () => {
    if (window.confirm(t(language, 'confirmClear'))) {
      clearCalculation();
    }
  };

  return (
    <div className="flex items-center gap-4 flex-1 justify-end">
      {/* Project Info */}
      <div className="flex items-center gap-3 mr-auto ml-8">
        <div className="flex flex-col">
          <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{t(language, 'orderNumber')}</label>
          <input 
            className="w-32 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={project.orderNumber} 
            onChange={(e) => updateProjectHeader({ orderNumber: e.target.value })} 
            placeholder="№..."
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{t(language, 'customer')}</label>
          <input 
            className="w-48 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={project.customer} 
            onChange={(e) => updateProjectHeader({ customer: e.target.value })} 
            placeholder="Ім'я..."
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 ml-4 cursor-pointer hover:text-blue-600 transition-colors">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={project.textureSelectionEnabled}
            onChange={(e) => updateProjectHeader({ textureSelectionEnabled: e.target.checked })}
          />
          {t(language, 'textureSelection')}
        </label>
      </div>

      {/* Language */}
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 relative">
        <Globe className="w-4 h-4 text-slate-500" />
        <select 
          className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none appearance-none pr-4 cursor-pointer"
          data-i18n-skip="true" 
          value={language} 
          onChange={(event) => setUiLanguage(event.target.value as typeof language)}
        >
          {languageOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 ml-4">


        <button 
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors ml-2"
          onClick={clearClick}
        >
          <Trash2 className="w-4 h-4" />
          {t(language, 'clearCalculation')}
        </button>

        <div className="relative flex items-center shadow-sm rounded-lg">
          <button 
            className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-l-lg transition-colors"
            onClick={() => runPacking(packingMode)}
          >
            <Play className="w-4 h-4 fill-current" />
            {t(language, 'recalculate')}
          </button>
          <button 
            className="flex items-center px-2 py-1.5 text-white bg-green-700 hover:bg-green-800 rounded-r-lg border-l border-green-800 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 shadow-xl rounded-lg py-1 z-50">
              {packingModes.map((mode) => (
                <button
                  key={mode}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    mode === packingMode ? 'bg-green-50 text-green-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  onClick={() => {
                    setPackingMode(mode);
                    setMenuOpen(false);
                  }}
                >
                  {packingModeLabel(language, mode)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
