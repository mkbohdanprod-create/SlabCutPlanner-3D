const fs = require('fs');

const appTsxPath = 'C:\\hhgh\\SlabCutPlanner\\web-app\\src\\App.tsx';
let appTsx = fs.readFileSync(appTsxPath, 'utf-8');

// Ensure Edit2 is imported
if (!appTsx.includes('Edit2')) {
  appTsx = appTsx.replace(/LogOut, FolderOpen, Loader2/, 'LogOut, FolderOpen, Loader2, Edit2');
}

// Replace the left header part
const leftHeaderRegex = /<div className="flex items-center gap-4">[\s\S]*?<h1 className="text-lg font-bold text-\[var\(--header-text\)\] tracking-tight">\s*SlabCutPlanner <span className="text-\[var\(--accent-color\)\]">v2<\/span>\s*<\/h1>\s*<\/div>/;
const newLeftHeader = `<div className="flex items-center">
          <div className="flex items-center gap-2.5 mr-4">
            <div className="w-8 h-8 bg-[var(--accent-color)] rounded-md flex items-center justify-center shadow-sm">
              <Layers className="text-white w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold text-[var(--header-text)] tracking-tight">
              SlabCutPlanner
            </h1>
          </div>
          <div className="h-6 w-px bg-white/10 mx-4"></div>
          <button 
            onClick={() => setIsProjectsOpen(true)}
            className="flex items-center gap-2 text-white hover:text-[var(--accent-color)] transition-colors group"
            title="Редагувати або відкрити проєкти"
          >
            <Edit2 className="w-4 h-4 text-slate-400 group-hover:text-[var(--accent-color)]" />
            <span className="text-sm font-semibold tracking-wide">
              {project.name || 'Без назви'}
            </span>
          </button>
        </div>`;
appTsx = appTsx.replace(leftHeaderRegex, newLeftHeader);

// Replace the right controls
const rightControlsRegex = /<div className="flex items-center gap-4">\s*<HeaderToolbar \/>\s*<div className="h-6 w-px bg-white\/10 mx-2"><\/div>[\s\S]*?<\/div>\s*<\/header>/;
const newRightControls = `<div className="flex items-center gap-2">
          <HeaderToolbar />
          
          <div className="h-6 w-px bg-white/10 mx-2"></div>

          {user ? (
            <button 
              onClick={signOut}
              className="w-8 h-8 flex items-center justify-center text-white bg-transparent hover:bg-white/10 rounded-sm transition-colors border border-transparent"
              title={\`Вийти: \${user.email}\`}
            >
              <UserCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="w-8 h-8 flex items-center justify-center text-white bg-white/10 hover:bg-white/20 rounded-sm transition-colors border border-transparent"
              title="Увійти"
            >
              <UserCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>`;
appTsx = appTsx.replace(rightControlsRegex, newRightControls);

fs.writeFileSync(appTsxPath, appTsx, 'utf-8');


// Now HeaderToolbar.tsx
const headerTsxPath = 'C:\\hhgh\\SlabCutPlanner\\web-app\\src\\components\\ui\\HeaderToolbar.tsx';
let headerTsx = fs.readFileSync(headerTsxPath, 'utf-8');

// Ensure icons are imported
if (!headerTsx.includes('HelpCircle')) {
  headerTsx = headerTsx.replace(/import { Play, Trash2, Globe, ChevronDown, Loader2 } from 'lucide-react';/, "import { Play, Trash2, Globe, ChevronDown, Loader2, Settings, HelpCircle, Save } from 'lucide-react';");
}

const headerContentRegex = /<div className="flex items-center gap-4 flex-1 justify-end">[\s\S]*?<\/div>\s*$/m;
// Let's just do a string replacement for everything inside the component
// Since it's easier to just overwrite the return statement:
const newHeaderToolbarComponent = `import React, { useState } from 'react';
import { useProjectStore, packingModes, PackingMode } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';
import { Play, Trash2, ChevronDown, Loader2, Settings, HelpCircle, Save, Info } from 'lucide-react';
import { t } from '../../i18n';

export function HeaderToolbar() {
  const isPacking = useProjectStore((s) => s.isPacking);
  const runPacking = useProjectStore((s) => s.runPacking);
  const packingMode = useProjectStore((s) => s.packingMode);
  const setPackingMode = useProjectStore((s) => s.setPackingMode);
  const clearCalculation = useProjectStore((s) => s.clearCalculation);
  const language = useUIStore((s) => s.language);
  const [menuOpen, setMenuOpen] = useState(false);

  const clearClick = () => {
    if (window.confirm(t(language, 'confirmClearCalculation'))) {
      clearCalculation();
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-1 justify-end">
      <button 
        className="w-8 h-8 flex items-center justify-center text-white bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] rounded-sm transition-colors"
        title="Налаштування"
      >
        <Settings className="w-4 h-4" />
      </button>

      <button 
        className="w-8 h-8 flex items-center justify-center text-white bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] rounded-sm transition-colors"
        title="Довідка"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      <button 
        className="w-8 h-8 flex items-center justify-center text-white bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] rounded-sm transition-colors"
        title="Інформація"
      >
        <Info className="w-4 h-4" />
      </button>

      <button 
        className="w-8 h-8 flex items-center justify-center text-white bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] rounded-sm transition-colors"
        title={t(language, 'recalculate')}
        onClick={() => { if (!isPacking) runPacking(packingMode); }}
        disabled={isPacking}
      >
        {isPacking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
      </button>

      <button 
        className="w-8 h-8 flex items-center justify-center text-white bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] rounded-sm transition-colors"
        title={t(language, 'clearCalculation')}
        onClick={clearClick}
        disabled={isPacking}
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Materials / Edges Dropdown equivalent */}
      <div className="flex items-center gap-2 h-8 bg-transparent text-white px-3 ml-2 cursor-pointer hover:bg-white/5 rounded-sm transition-colors">
        <span className="text-xs font-bold uppercase tracking-wider">Матеріал | Крайка</span>
        <ChevronDown className="w-3 h-3" />
      </div>
    </div>
  );
}
`;
fs.writeFileSync(headerTsxPath, newHeaderToolbarComponent, 'utf-8');
