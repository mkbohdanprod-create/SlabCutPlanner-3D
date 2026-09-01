import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, RotateCcw } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useStore';
import {
  DEFAULT_MANUFACTURERS,
  DELIVERY_ZONES,
  PYRAMID_LENGTHS,
  QUOTE_MATERIAL_TYPES,
  QUOTE_MONTAGE_LABELS,
  QUOTE_PRODUCT_TYPES,
  QUOTE_SERVICES,
  QUOTE_UNIT_LABELS,
  type MontageCategory,
  type QuoteMaterialType,
} from '../../domain/quoteCalc';
import { fabrication1cCode } from '../../domain/quote1cCatalog';

/**
 * Налаштування прорахунку: коди номенклатур 1С і режим калібрування цін.
 *
 * Дзеркало «Прив'язок послуг» виробничої частини, але для клієнтського
 * калькулятора. Живе в useSettingsStore (localStorage) — їде в
 * експорт/імпорт налаштувань разом із виробничим каталогом.
 *
 * Ціна за умовчанням НЕ заводиться руками (рішення 25.08.2026): єдине
 * джерело ціни — 1С за кодом номенклатури. Колонка ціни лишилась для режиму
 * калібрування: керівник свідомо вмикає його, перекриває ціну там, де
 * бачить розходження, проганяє 10–20 проектів і за статистикою
 * виправляє прайс у 1С. Поки режим вимкнений, ці числа рушій не бачить
 * узагалі — саме тому колонка сіра, а перемикач стоїть першим екраном.
 *
 * Виготовлення має два рівні: базова номенклатура типу виробу і
 * уточнення по виробнику («Виготовлення … Laminam», ТЗ §3).
 */

const inputCls = 'border border-slate-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#0084ff]';

const num = (value: string) => {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

function PriceCodeRow({ label, sublabel, price, code, codePlaceholder, onPrice, onCode, priceActive }: {
  label: string;
  sublabel?: string;
  price: number;
  /** Режим калібрування ввімкнений — ручна ціна реально впливає на КП */
  priceActive: boolean;
  code: string;
  /** Вбудований код 1С — показується сірим, коли ручний не заданий */
  codePlaceholder?: string;
  onPrice: (value: number) => void;
  onCode: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-800 truncate">{label}</div>
        {sublabel && <div className="text-xs text-slate-400">{sublabel}</div>}
      </div>
      <input
        className={`${inputCls} text-right ${priceActive ? 'border-amber-400 bg-amber-50' : 'text-slate-400 bg-slate-50'}`}
        style={{ width: 110 }}
        type="number"
        min={0}
        value={price || ''}
        placeholder="0"
        onChange={(e) => onPrice(num(e.target.value))}
        title={priceActive
          ? 'Ручна ціна за одиницю, грн — перекриває ціну сервісу'
          : 'Режим калібрування вимкнений: це значення на розрахунок не впливає'}
      />
      <input
        className={`${inputCls} font-mono`}
        style={{ width: 120 }}
        value={code}
        placeholder={codePlaceholder ?? 'код 1С'}
        onChange={(e) => onCode(e.target.value)}
        title={codePlaceholder ? `Вбудований код: ${codePlaceholder}. Впишіть свій, щоб перекрити.` : 'Код номенклатури 1С'}
      />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <h3 className="text-sm font-bold text-slate-700 uppercase">{title}</h3>
      {hint && <p className="text-xs text-slate-500 mt-0.5 mb-2">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </div>
  );
}

export function QuoteSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const book = useSettingsStore((s) => s.quotePriceBook);
  const updateBook = useSettingsStore((s) => s.updateQuotePriceBook);
  const setCode = useSettingsStore((s) => s.setQuoteCode1c);
  const resetBook = useSettingsStore((s) => s.resetQuotePriceBook);
  const manualPricing = useSettingsStore((s) => s.quoteManualPricing);
  const setManualPricing = useSettingsStore((s) => s.setQuoteManualPricing);
  const showConfirm = useUIStore((s) => s.showConfirm);

  const [fabMaterial, setFabMaterial] = useState<QuoteMaterialType>(QUOTE_MATERIAL_TYPES[0]);
  const [manufacturer, setManufacturer] = useState(DEFAULT_MANUFACTURERS[QUOTE_MATERIAL_TYPES[0]][0]);

  if (!open) return null;

  const code = (key: string) => book.codes1c[key] ?? '';
  const columnHead = (
    <div className="flex items-center gap-3 pb-1 border-b border-slate-200 text-xs font-bold text-slate-400 uppercase">
      <div className="flex-1">Номенклатура</div>
      <div style={{ width: 110 }} className="text-right">{manualPricing ? 'Ручна ціна' : 'Ціна (вимк.)'}</div>
      <div style={{ width: 120 }}>Код 1С</div>
    </div>
  );

  // Портал на body: інші модалки змонтовані на корені App, а ця живе
  // всередині панелі вкладки — там предки з overflow/трансформаціями
  // обрізали fixed-оверлей (модалка різалась об смугу вкладок, підкладка
  // не накривала екран). Портал знімає залежність від місця монтування.
  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b bg-white">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#0084ff]" />
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Налаштування прорахунку</h2>
              <p className="text-xs text-slate-500">Коди номенклатур 1С і калібрування · для старших менеджерів</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => showConfirm({
                title: 'Скинути налаштування прорахунку?',
                message: 'Ручні ціни обнуляться, коди 1С повернуться до вбудованих. Виробничих прив\'язок це не зачіпає.',
                confirmText: 'Скинути',
                isDestructive: true,
                onConfirm: resetBook,
              })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50"
            >
              <RotateCcw className="w-4 h-4" /> Скинути
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-50 flex flex-col gap-4 custom-scrollbar">

          {/* Режим калібрування. Стоїть першим і виглядає як попередження
              навмисно: поки він вимкнений, уся колонка «Ціна, грн» нижче
              на розрахунок не впливає — і менеджер має це бачити одразу,
              а не гадати, чому вписана ціна «не спрацювала». */}
          <div className={`rounded-lg border p-4 ${manualPricing ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
            <label className="cursor-pointer" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <input
                type="checkbox"
                // Ширину задаємо інлайном: глобальний стиль форм тягне
                // input на всю ширину, і чекбокс вилітав в окремий рядок.
                className="accent-amber-600 shrink-0"
                style={{ width: 16, height: 16, minWidth: 16, marginTop: 2 }}
                checked={manualPricing}
                onChange={(e) => setManualPricing(e.target.checked)}
              />
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-800">
                  Режим калібрування цін
                  <span className={`ml-2 text-[10px] font-bold px-1.5 py-px rounded border ${manualPricing
                    ? 'text-amber-800 bg-amber-100 border-amber-300'
                    : 'text-slate-500 bg-slate-100 border-slate-300'}`}>
                    {manualPricing ? 'УВІМКНЕНО' : 'ВИМКНЕНО'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  {manualPricing
                    ? <>Ціни з таблиці нижче <b>перекривають</b> ціну 1С. Кожен такий рядок
                        у розрахунку помічений «РУЧНА», поряд зберігається ціна з 1С — щоб було
                        з чим порівнювати. Для звичайної роботи режим треба вимкнути.</>
                    : <>Ціни з таблиці нижче <b>не впливають</b> на розрахунок: ціна береться лише від
                        1С за кодом номенклатури. Вмикайте, щоб зібрати статистику розходжень на
                        10–20 проектах і потім виправити прайс у 1С.</>}
                </p>
              </div>
            </label>
          </div>

          <Section title="Виготовлення — базові ціни" hint="Застосовуються, коли для виробника не задано власної номенклатури">
            {columnHead}
            {QUOTE_PRODUCT_TYPES.filter((type) => !type.foldInto).map((type) => (
              <PriceCodeRow
                priceActive={manualPricing}
                key={type.id}
                label={type.label}
                sublabel={`за ${QUOTE_UNIT_LABELS[type.unit]}`}
                price={book.fabrication[type.id] ?? 0}
                code={code(`fab:${type.id}`)}
                onPrice={(value) => updateBook({ fabrication: { ...book.fabrication, [type.id]: value } })}
                onCode={(value) => setCode(`fab:${type.id}`, value)}
              />
            ))}
            <p className="text-xs text-slate-400 mt-2">Нога і декоративні опуски власної номенклатури не мають — їхня площа йде в стільницю.</p>
          </Section>

          <Section
            title="Виготовлення — по виробниках"
            hint="Окрема номенклатура на пару «матеріал + виробник» («Виготовлення … керамограніт Laminam»). Перемагає базову — і ціною, і кодом. Коди 1С із вбудованого довідника показані сірим — свій вписувати треба лише щоб перекрити."
          >
            <div className="mb-2 flex gap-2">
              <select
                className={inputCls}
                style={{ width: 190 }}
                value={fabMaterial}
                onChange={(e) => {
                  const material = e.target.value as QuoteMaterialType;
                  setFabMaterial(material);
                  setManufacturer(DEFAULT_MANUFACTURERS[material][0]);
                }}
              >
                {QUOTE_MATERIAL_TYPES.map((material) => <option key={material} value={material}>{material}</option>)}
              </select>
              <select className={inputCls} style={{ width: 190 }} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}>
                {DEFAULT_MANUFACTURERS[fabMaterial].map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            {columnHead}
            {QUOTE_PRODUCT_TYPES.filter((type) => !type.foldInto).map((type) => {
              const pairKey = `${fabMaterial}:${manufacturer}`;
              return (
                <PriceCodeRow
                priceActive={manualPricing}
                  key={type.id}
                  label={`${type.label} — ${manufacturer}`}
                  sublabel={`за ${QUOTE_UNIT_LABELS[type.unit]}`}
                  price={book.fabricationByManufacturer[type.id]?.[pairKey] ?? 0}
                  code={code(`fab:${type.id}:${fabMaterial}:${manufacturer}`)}
                  codePlaceholder={fabrication1cCode(type.id, fabMaterial, manufacturer)?.code}
                  onPrice={(value) => updateBook({
                    fabricationByManufacturer: {
                      ...book.fabricationByManufacturer,
                      [type.id]: { ...(book.fabricationByManufacturer[type.id] ?? {}), [pairKey]: value },
                    },
                  })}
                  onCode={(value) => setCode(`fab:${type.id}:${fabMaterial}:${manufacturer}`, value)}
                />
              );
            })}
          </Section>

          <Section title="Замір" hint="Одна номенклатура на кожен тип матеріалу; рахується 1 замір на замовлення">
            {columnHead}
            {QUOTE_MATERIAL_TYPES.map((material) => (
              <PriceCodeRow
                priceActive={manualPricing}
                key={material}
                label={`Замір (${material})`}
                price={book.measure[material] ?? 0}
                code={code(`measure:${material}`)}
                onPrice={(value) => updateBook({ measure: { ...book.measure, [material]: value } })}
                onCode={(value) => setCode(`measure:${material}`, value)}
              />
            ))}
          </Section>

          <Section title="Монтаж" hint="Стільниці й панелі — за м² площі виготовлення; підвіконня і сходи — за м.п.">
            {columnHead}
            {(Object.keys(QUOTE_MONTAGE_LABELS) as MontageCategory[]).map((category) => (
              <PriceCodeRow
                priceActive={manualPricing}
                key={category}
                label={QUOTE_MONTAGE_LABELS[category]}
                price={book.montage[category] ?? 0}
                code={code(`montage:${category}`)}
                onPrice={(value) => updateBook({ montage: { ...book.montage, [category]: value } })}
                onCode={(value) => setCode(`montage:${category}`, value)}
              />
            ))}
          </Section>

          <Section title="Виїзд на адресу" hint="Зона 0 — біля філії, без доплати. Далі — за відстанню.">
            {columnHead}
            {DELIVERY_ZONES.filter((zone) => zone > 0).map((zone) => (
              <PriceCodeRow
                priceActive={manualPricing}
                key={zone}
                label={`Виїзд — зона ${zone}`}
                price={book.deliveryZones[zone] ?? 0}
                code={code(`delivery:${zone}`)}
                onPrice={(value) => updateBook({
                  deliveryZones: book.deliveryZones.map((current, index) => (index === zone ? value : current)),
                })}
                onCode={(value) => setCode(`delivery:${zone}`, value)}
              />
            ))}
          </Section>

          <Section title="Пакування і матеріал">
            {columnHead}
            {PYRAMID_LENGTHS.map((length) => (
              <PriceCodeRow
                priceActive={manualPricing}
                key={length}
                label={`Дерев'яна піраміда ${length} мм`}
                sublabel="за шт"
                price={book.pyramid[length] ?? 0}
                code={code(`pyramid:${length}`)}
                onPrice={(value) => updateBook({ pyramid: { ...book.pyramid, [length]: value } })}
                onCode={(value) => setCode(`pyramid:${length}`, value)}
              />
            ))}
            <PriceCodeRow
                priceActive={manualPricing}
              label="Пакування в короб"
              sublabel="за м²"
              price={book.boxPerM2}
              code={code('box')}
              onPrice={(value) => updateBook({ boxPerM2: value })}
              onCode={(value) => setCode('box', value)}
            />
            <PriceCodeRow
                priceActive={manualPricing}
              label="Матеріал"
              sublabel="за лист"
              price={book.sheet}
              code={code('sheet')}
              onPrice={(value) => updateBook({ sheet: value })}
              onCode={(value) => setCode('sheet', value)}
            />
          </Section>

          <Section title="Додаткові послуги">
            {columnHead}
            {QUOTE_SERVICES.map((service) => (
              <PriceCodeRow
                priceActive={manualPricing}
                key={service.id}
                label={service.label}
                sublabel={`за ${QUOTE_UNIT_LABELS[service.unit]}`}
                price={book.services[service.id] ?? 0}
                code={code(`svc:${service.id}`)}
                onPrice={(value) => updateBook({ services: { ...book.services, [service.id]: value } })}
                onCode={(value) => setCode(`svc:${service.id}`, value)}
              />
            ))}
          </Section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
