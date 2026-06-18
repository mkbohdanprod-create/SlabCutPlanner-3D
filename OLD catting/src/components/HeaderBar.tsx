import { useState } from 'react';
import { PackingMode } from '../domain/types';
import { languageOptions, packingModeLabel, t } from '../i18n';
import { useProjectStore } from '../store/useProjectStore';

const packingModes: PackingMode[] = ['economy', 'optimal', 'full_texture'];

export function HeaderBar() {
  const { project, packingMode, setPackingMode, setUiLanguage, updateProjectHeader, runPacking, clearCalculation } = useProjectStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const language = project.uiLanguage ?? 'uk';

  const clearClick = () => {
    if (window.confirm(t(language, 'confirmClear'))) {
      clearCalculation();
    }
  };

  return (
    <section className="panel header-grid top-header">
      <div className="app-brand">SlabCutPlanner</div>
      <div className="header-field">
        <label>{t(language, 'orderNumber')}</label>
        <input value={project.orderNumber} onChange={(e) => updateProjectHeader({ orderNumber: e.target.value })} />
      </div>
      <div className="header-field">
        <label>{t(language, 'customer')}</label>
        <input value={project.customer} onChange={(e) => updateProjectHeader({ customer: e.target.value })} />
      </div>
      <div className="language-field">
        <label>{t(language, 'language')}</label>
        <select data-i18n-skip="true" value={language} onChange={(event) => setUiLanguage(event.target.value as typeof language)}>
          {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <button className="danger-action header-clear" onClick={clearClick}>{t(language, 'clearCalculation')}</button>
      <div className="checkbox-field">
        <label>
          <input
            type="checkbox"
            checked={project.textureSelectionEnabled}
            onChange={(e) => updateProjectHeader({ textureSelectionEnabled: e.target.checked })}
          />
          {t(language, 'textureSelection')}
        </label>
      </div>
      <div className="header-actions">
        <div className="split-action">
          <button className="primary-action split-main" onClick={() => runPacking(packingMode)}>{t(language, 'recalculate')}</button>
          <button className="primary-action split-arrow" aria-label={t(language, 'selectCutMode')} onClick={() => setMenuOpen((value) => !value)}>▼</button>
          {menuOpen && (
            <div className="split-menu">
              {packingModes.map((mode) => (
                <button
                  key={mode}
                  className={mode === packingMode ? 'active' : ''}
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
        <span className="mode-caption">{t(language, 'mode')}: {packingModeLabel(language, packingMode)}</span>
      </div>
    </section>
  );
}
