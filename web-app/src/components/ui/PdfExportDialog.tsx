import { useMemo, useState } from 'react';
import type { DetailPart, Project } from '../../domain/types';
import { translateStaticUiText } from '../../i18n';
import { defaultPdfExportOptions, exportProjectPdf } from '../../utils/export';
import type { PdfExportOptions, PdfOrientation, PdfPageFormat } from '../../utils/export';
import { lazy, Suspense } from 'react';

const Viewer3D = lazy(() => import('../3d/Viewer3D').then(m => ({ default: m.Viewer3D })));

type PdfExportDialogProps = {
  open: boolean;
  project: Project;
  parts: DetailPart[];
  onClose: () => void;
};

type BooleanPdfOption = {
  [Key in keyof PdfExportOptions]: PdfExportOptions[Key] extends boolean ? Key : never;
}[keyof PdfExportOptions];

const pagePresets: Array<{ value: string; label: string; format: PdfPageFormat; orientation: PdfOrientation }> = [
  { value: 'a4-portrait', label: 'A4 книжний', format: 'a4', orientation: 'portrait' },
  { value: 'a4-landscape', label: 'A4 альбомний', format: 'a4', orientation: 'landscape' },
  { value: 'a3-portrait', label: 'A3 книжний', format: 'a3', orientation: 'portrait' },
  { value: 'a3-landscape', label: 'A3 альбомний', format: 'a3', orientation: 'landscape' },
];

function checkboxLabel(label: string, checked: boolean, onChange: () => void) {
  return (
    <label className="pdf-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

export function PdfExportDialog({ open, project, parts, onClose }: PdfExportDialogProps) {
  const [options, setOptions] = useState<PdfExportOptions>(defaultPdfExportOptions);
  const [busy, setBusy] = useState(false);
  const [capturing3d, setCapturing3d] = useState(false);
  const language = project.uiLanguage ?? 'uk';
  const ui = (value: string) => translateStaticUiText(language, value);

  const pagePreset = useMemo(
    () => `${options.format}-${options.orientation}`,
    [options.format, options.orientation],
  );

  if (!open) return null;

  const update = <Key extends keyof PdfExportOptions>(key: Key, value: PdfExportOptions[Key]) => {
    setOptions((current) => ({ ...current, [key]: value }));
  };

  const toggle = (key: BooleanPdfOption) => {
    setOptions((current) => ({ ...current, [key]: !current[key] }));
  };

  const onPresetChange = (value: string) => {
    const preset = pagePresets.find((item) => item.value === value) ?? pagePresets[1];
    setOptions((current) => ({
      ...current,
      format: preset.format,
      orientation: preset.orientation,
    }));
  };

  const onExport = async () => {
    if (options.include3d) {
      setCapturing3d(true);
      return;
    }
    doExport([]);
  };

  const doExport = async (snapshots3D: string[]) => {
    setBusy(true);
    setCapturing3d(false);
    try {
      await exportProjectPdf(project, parts, options, snapshots3D);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      {capturing3d && (
        <div className="fixed top-0 left-0 w-[1200px] h-[800px] z-[-10] pointer-events-none" style={{ opacity: 0.01 }}>
          <Suspense fallback={null}>
            <Viewer3D onCaptureReady={(captures: any) => doExport(captures)} isCaptureMode={true} />
          </Suspense>
        </div>
      )}
      <div className="detail-modal pdf-modal z-10">
        <div className="detail-modal-header">
          <div>
            <h2>{ui('Налаштування PDF')}</h2>
            <p>{ui('Оберіть формат, режим сторінок і блоки, які потрібно включити у документ.')}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={ui('Закрити')}>×</button>
        </div>

        <div className="pdf-grid">
          <section className="pdf-section">
            <h3>{ui('Сторінка')}</h3>
            <label>
              {ui('Формат')}
              <select value={pagePreset} onChange={(event) => onPresetChange(event.target.value)}>
                {pagePresets.map((preset) => (
                  <option key={preset.value} value={preset.value}>{ui(preset.label)}</option>
                ))}
              </select>
            </label>
            <label>
              {ui('Масштаб')}
              <select value={options.scaleMode} onChange={(event) => update('scaleMode', event.target.value as PdfExportOptions['scaleMode'])}>
                <option value="auto">{ui('Автоматично під сторінку')}</option>
                <option value="100">{ui('100% від доступного масштабу')}</option>
                <option value="75">{ui('75% від доступного масштабу')}</option>
                <option value="50">{ui('50% від доступного масштабу')}</option>
              </select>
            </label>
            <label>
              {ui('Розміщення слебів')}
              <select value={options.slabLayout} onChange={(event) => update('slabLayout', event.target.value as PdfExportOptions['slabLayout'])}>
                <option value="one">{ui('Один слеб на сторінку')}</option>
                <option value="two">{ui('Два слеби на сторінку')}</option>
                <option value="multi">{ui('Кілька слебів на сторінку')}</option>
                <option value="auto">{ui('Автоматично')}</option>
              </select>
            </label>
            <label>
              {ui('Автор розкрою')}
              <input value={options.author} onChange={(event) => update('author', event.target.value)} placeholder={ui("Ім'я автора")} />
            </label>
          </section>

          <section className="pdf-section">
            <h3>{ui('Склад PDF')}</h3>
            <div className="pdf-check-grid">
              {checkboxLabel(ui('Титульна сторінка'), options.includeTitle, () => toggle('includeTitle'))}
              {checkboxLabel(ui('Загальний список деталей'), options.includeDetails, () => toggle('includeDetails'))}
              {checkboxLabel(ui('Список нерозміщених деталей'), options.includeUnplaced, () => toggle('includeUnplaced'))}
              {checkboxLabel(ui('Технічний режим'), options.includeTechnical, () => toggle('includeTechnical'))}
              {checkboxLabel(ui('Фото-режим'), options.includePhoto, () => toggle('includePhoto'))}
              {checkboxLabel(ui('Текстурний режим'), options.includeTexture, () => toggle('includeTexture'))}
              {checkboxLabel(ui('2D-зона підбору текстури'), options.includeTextureZone, () => toggle('includeTextureZone'))}
              {checkboxLabel(ui('3D-збірка'), options.include3d, () => toggle('include3d'))}
            </div>
          </section>

          <section className="pdf-section pdf-section-wide">
            <h3>{ui('Відображення')}</h3>
            <div className="pdf-check-grid pdf-check-grid-wide">
              {checkboxLabel(ui('Показувати розміри'), options.showDimensions, () => toggle('showDimensions'))}
              {checkboxLabel(ui('Включати дефекти'), options.includeDefects, () => toggle('includeDefects'))}
              {checkboxLabel(ui('Включати коментарі'), options.includeComments, () => toggle('includeComments'))}
              <div className="pdf-hint">{ui('Пропорції реальних розмірів слебів зберігаються на сторінці автоматично.')}</div>
            </div>
          </section>
        </div>

        <div className="pdf-modal-footer">
          <button onClick={onClose} disabled={busy || capturing3d}>{ui('Закрити')}</button>
          <button className="primary-action" onClick={onExport} disabled={busy || capturing3d}>
            {capturing3d ? ui('Захоплення 3D...') : busy ? ui('Формується PDF…') : ui('Сформувати PDF')}
          </button>
        </div>
      </div>
    </div>
  );
}

