import { ChangeEvent, useState } from 'react';
import { t } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import { downloadTextFile, readFileAsText } from '../../utils/file';
import { exportProjectPng } from '../../utils/export';
import { FormsPanel } from './FormsPanel';
import { ListsPanel } from './ListsPanel';
import { PdfExportDialog } from './PdfExportDialog';
import { SlabInspector } from './SlabInspector';

function safeFilePart(value: string, fallback: string) {
  const clean = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ');
  return clean || fallback;
}

function projectExportFileName(project: ReturnType<typeof useProjectStore.getState>['project']) {
  const createdAt = project.versions[0]?.timestamp ?? project.updatedAt;
  const stamp = new Date(createdAt).toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  return `${safeFilePart(project.orderNumber, 'без номера')}_${safeFilePart(project.customer, 'без контрагента')}_${stamp}.json`;
}

export function Sidebar() {
  const { project, parts, exportProject, importProject } = useProjectStore();
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const language = project.uiLanguage ?? 'uk';

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    importProject(JSON.parse(text));
  };

  return (
    <>
      <aside className="sidebar w-[340px] flex-shrink-0 overflow-y-auto pr-2 custom-scrollbar">
        <section className="panel">
          <h3>{t(language, 'quickActions')}</h3>
          <div className="stack">
            <button onClick={() => downloadTextFile(projectExportFileName(project), exportProject())}>{t(language, 'saveProject')}</button>
            <label className="file-field button-like"><span>{t(language, 'loadProject')}</span><input type="file" accept="application/json" onChange={onImport} /></label>
            <button onClick={() => exportProjectPng(project, parts)}>{t(language, 'exportPng')}</button>
            <button onClick={() => setPdfDialogOpen(true)}>{t(language, 'exportPdf')}</button>
          </div>
        </section>
        <FormsPanel />
        <SlabInspector />
        <ListsPanel />
      </aside>
      <PdfExportDialog open={pdfDialogOpen} project={project} parts={parts} onClose={() => setPdfDialogOpen(false)} />
    </>
  );
}

