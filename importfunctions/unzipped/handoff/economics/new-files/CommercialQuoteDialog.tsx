// =====================================================================
//  src/components/ui/CommercialQuoteDialog.tsx
//  UI комерційної пропозиції (Задача #3).
//  Адаптовано під GitHub-версію:
//   - селекторні підписки замість useProjectStore() цілком
//     (інакше діалог ре-рендериться на кожен рух деталі);
//   - PDF-експорт КП поки СТАБ (Задача #6) — кнопка не ламає білд.
//  Базові CSS-класи (modal-backdrop, detail-modal, pdf-section, ...)
//  уже є в global.css. Quote-специфічні додаються з patches/quote.css.
// =====================================================================

import { useMemo } from 'react';
import { uid } from '../../domain/defaults';
import type { CommercialManualLine, CommercialQuoteSettings, EdgeProfileType } from '../../domain/types';
import { useProjectStore } from '../../store/useProjectStore';
import { calculateCommercialQuote, type CommercialQuoteLine } from '../../engines/pricing';
import { EDGE_PROFILE_OPTIONS } from '../../utils/edgeProfiles';

type CommercialQuoteDialogProps = {
  open: boolean;
  onClose: () => void;
};

function money(value: number, currency: string) {
  return `${value.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function numberValue(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function updateManualLine(lines: CommercialManualLine[], lineId: string, patch: Partial<CommercialManualLine>) {
  return lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line));
}

export function CommercialQuoteDialog({ open, onClose }: CommercialQuoteDialogProps) {
  // Селекторні підписки — лише потрібні зрізи стейту.
  const project = useProjectStore((s) => s.project);
  const parts = useProjectStore((s) => s.parts);
  const updateCommercialQuote = useProjectStore((s) => s.updateCommercialQuote);

  const settings = project.commercialQuote;
  const calculation = useMemo(() => calculateCommercialQuote(project, parts), [project, parts]);

  if (!open) return null;

  const patchSettings = (patch: Partial<CommercialQuoteSettings>) => updateCommercialQuote(patch);

  const patchLineOverride = (line: CommercialQuoteLine, patch: { quantity?: number; unitPrice?: number; visible?: boolean }) => {
    patchSettings({
      lineOverrides: {
        ...settings.lineOverrides,
        [line.id]: { ...(settings.lineOverrides[line.id] ?? {}), ...patch },
      },
    });
  };

  const patchEdgePrice = (profile: EdgeProfileType, price: number) => {
    patchSettings({ edgePrices: { ...settings.edgePrices, [profile]: price } });
  };

  const addManualLine = () => {
    patchSettings({
      manualLines: [
        ...settings.manualLines,
        { id: uid('quote_line'), name: 'Додаткова позиція', quantity: 1, unit: 'послуга', unitPrice: 0, visible: true },
      ],
    });
  };

  const removeManualLine = (lineId: string) => {
    const { [lineId]: _removed, ...lineOverrides } = settings.lineOverrides;
    patchSettings({
      manualLines: settings.manualLines.filter((line) => line.id !== lineId),
      lineOverrides,
    });
  };

  // СТАБ: PDF-експорт КП реалізується у Задачі #6 (export/commercialProposal.ts).
  const onExport = () => {
    alert('Експорт КП у PDF — Задача #6. Поки доступний лише розрахунок на екрані.');
  };

  return (
    <div className="modal-backdrop">
      <div className="detail-modal quote-modal">
        <div className="detail-modal-header">
          <div>
            <h2>Комерційна пропозиція</h2>
            <p>Фінансовий розрахунок читає поточні деталі, слеби, кромки та елементи проєкту.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрити">×</button>
        </div>

        <div className="quote-grid">
          <section className="pdf-section quote-settings">
            <h3>Матеріал</h3>
            <label>
              Режим розрахунку
              <select value={settings.materialMode} onChange={(e) => patchSettings({ materialMode: e.target.value as CommercialQuoteSettings['materialMode'] })}>
                <option value="slab">за лист/сляб</option>
                <option value="area">за м² виробу</option>
              </select>
            </label>
            <label>
              Валюта
              <input value={settings.currency} onChange={(e) => patchSettings({ currency: e.target.value })} />
            </label>
            <label>
              Ціна листа/сляба
              <input type="number" value={settings.slabPrice} onChange={(e) => patchSettings({ slabPrice: numberValue(Number(e.target.value)) })} />
            </label>
            <label>
              Ціна за м²
              <input type="number" value={settings.squareMeterPrice} onChange={(e) => patchSettings({ squareMeterPrice: numberValue(Number(e.target.value)) })} />
            </label>
          </section>

          <section className="pdf-section quote-settings">
            <h3>Обробка</h3>
            <label>
              Порізка за пог. м
              <input type="number" value={settings.sawCutPricePerM} onChange={(e) => patchSettings({ sawCutPricePerM: numberValue(Number(e.target.value)) })} />
            </label>
            <label>
              Водяна різка за пог. м
              <input type="number" value={settings.waterjetCutPricePerM} onChange={(e) => patchSettings({ waterjetCutPricePerM: numberValue(Number(e.target.value)) })} />
            </label>
            <label>
              Склейка
              <select value={settings.gluePricingMode} onChange={(e) => patchSettings({ gluePricingMode: e.target.value as CommercialQuoteSettings['gluePricingMode'] })}>
                <option value="linear">за пог. м</option>
                <option value="element">за елемент</option>
              </select>
            </label>
            <label>
              Ціна склейки за пог. м
              <input type="number" value={settings.gluePricePerM} onChange={(e) => patchSettings({ gluePricePerM: numberValue(Number(e.target.value)) })} />
            </label>
            <label>
              Ціна склейки за елемент
              <input type="number" value={settings.gluePricePerElement} onChange={(e) => patchSettings({ gluePricePerElement: numberValue(Number(e.target.value)) })} />
            </label>
          </section>

          <section className="pdf-section quote-settings quote-edge-settings">
            <h3>Кромки</h3>
            {EDGE_PROFILE_OPTIONS.map((profile) => (
              <label key={profile.value}>
                {profile.label}
                <input type="number" value={settings.edgePrices[profile.value] ?? 0} onChange={(e) => patchEdgePrice(profile.value, numberValue(Number(e.target.value)))} />
              </label>
            ))}
          </section>

          <section className="pdf-section quote-settings">
            <h3>Знижка / націнка</h3>
            <label>
              Тип
              <select value={settings.adjustmentType} onChange={(e) => patchSettings({ adjustmentType: e.target.value as CommercialQuoteSettings['adjustmentType'] })}>
                <option value="discount">знижка</option>
                <option value="markup">націнка</option>
              </select>
            </label>
            <label>
              Відсоток
              <input type="number" value={settings.adjustmentPercent} onChange={(e) => patchSettings({ adjustmentPercent: numberValue(Number(e.target.value)) })} />
            </label>
          </section>
        </div>

        <section className="pdf-section quote-metrics">
          <h3>Поточні обсяги</h3>
          <span>Площа деталей: {calculation.metrics.detailAreaM2.toFixed(3)} м²</span>
          <span>Використано слебів: {calculation.metrics.usedSlabs}</span>
          <span>Порізка: {calculation.metrics.sawCutM.toFixed(3)} пог. м</span>
          <span>Водяна різка: {calculation.metrics.waterjetCutM.toFixed(3)} пог. м</span>
          <span>Склейка: {calculation.metrics.glueLengthM.toFixed(3)} пог. м / {calculation.metrics.glueElements} елем.</span>
        </section>

        <section className="pdf-section quote-table-section">
          <div className="quote-section-head">
            <h3>Позиції КП</h3>
            <button type="button" onClick={addManualLine}>Додати позицію</button>
          </div>
          <div className="quote-table">
            <div className="quote-row quote-row-head">
              <span>Показ</span>
              <span>Назва</span>
              <span>К-сть</span>
              <span>Од.</span>
              <span>Ціна</span>
              <span>Сума</span>
              <span />
            </div>
            {calculation.lines.map((line) => {
              const manual = settings.manualLines.find((item) => item.id === line.id);
              return (
                <div key={line.id} className="quote-row">
                  <label className="quote-check">
                    <input type="checkbox" checked={line.visible} onChange={(e) => patchLineOverride(line, { visible: e.target.checked })} />
                  </label>
                  {manual ? (
                    <input value={manual.name} onChange={(e) => patchSettings({ manualLines: updateManualLine(settings.manualLines, manual.id, { name: e.target.value }) })} />
                  ) : (
                    <span>{line.name}</span>
                  )}
                  <input type="number" value={line.quantity} onChange={(e) => patchLineOverride(line, { quantity: numberValue(Number(e.target.value)) })} />
                  {manual ? (
                    <input value={manual.unit} onChange={(e) => patchSettings({ manualLines: updateManualLine(settings.manualLines, manual.id, { unit: e.target.value }) })} />
                  ) : (
                    <span>{line.unit}</span>
                  )}
                  <input type="number" value={line.unitPrice} onChange={(e) => patchLineOverride(line, { unitPrice: numberValue(Number(e.target.value)) })} />
                  <strong>{money(line.amount, settings.currency)}</strong>
                  {manual ? <button type="button" className="danger-button" onClick={() => removeManualLine(manual.id)}>Видалити</button> : <span />}
                </div>
              );
            })}
          </div>
        </section>

        <section className="quote-totals">
          <span>Матеріал: <strong>{money(calculation.totals.material, settings.currency)}</strong></span>
          <span>Обробка: <strong>{money(calculation.totals.processing, settings.currency)}</strong></span>
          <span>Додаткові послуги: <strong>{money(calculation.totals.additional, settings.currency)}</strong></span>
          <span>Знижка/націнка: <strong>{money(calculation.totals.adjustment, settings.currency)}</strong></span>
          <span className="quote-grand-total">Загальна сума: <strong>{money(calculation.totals.grandTotal, settings.currency)}</strong></span>
        </section>

        <div className="detail-modal-footer">
          <button onClick={onClose}>Закрити</button>
          <button className="primary-action" onClick={onExport}>Експорт КП в PDF</button>
        </div>
      </div>
    </div>
  );
}
