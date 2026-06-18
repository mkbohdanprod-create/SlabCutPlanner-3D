import { localeForLanguage, statusLabel, t } from '../i18n';
import { useProjectStore } from '../store/useProjectStore';
import { calculateTotalArea } from '../utils/export';

export function StatusBar() {
  const { project, parts } = useProjectStore();
  const mainParts = parts.filter((part) => part.isMain);
  const language = project.uiLanguage ?? 'uk';

  return (
    <section className="panel status-bar">
      <div><span>{t(language, 'status')}</span><strong>{statusLabel(language, project.calculationStatus)}</strong></div>
      <div><span>{t(language, 'totalBlankArea')}</span><strong>{calculateTotalArea(parts).toFixed(3)} {t(language, 'squareMeters')}</strong></div>
      <div><span>{t(language, 'detailArea')}</span><strong>{calculateTotalArea(mainParts).toFixed(3)} {t(language, 'squareMeters')}</strong></div>
      <div><span>{t(language, 'slabCount')}</span><strong>{project.slabs.length}</strong></div>
      <div><span>{t(language, 'updated')}</span><strong>{new Date(project.updatedAt).toLocaleString(localeForLanguage(language))}</strong></div>
    </section>
  );
}
