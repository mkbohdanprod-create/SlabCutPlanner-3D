/**
 * ВІДОМІСТЬ ОБСЯГІВ (BOQ) — 06.09.2026.
 *
 * Усі розкладки проєкту → рядки по групах: матеріал, роботи, витратні,
 * логістика. Це підкладка під КП: квадратури, листи, шви, вага, машини.
 * Рядки з нормами першої версії позначені УМОВНО — норму підтверджує кейс.
 * Експорт: CSV (у 1С/Excel) і друк (браузерний PDF).
 */
import { useMemo } from 'react';
import { Download, Printer, Grid3x3 } from 'lucide-react';
import { useArchitecture } from '../useArchitecture';
import { computeArchitecture, BOQ_GROUP_LABELS, type BoqLine } from '../../../engines/tileLayout';
import { LAYOUT_PATTERN_LABELS } from '../../../domain/architecture';
import { useProjectStore } from '../../../store/useProjectStore';
import { useUIStore } from '../../../store/useStore';
import { downloadTextFile } from '../../../utils/file';
import { BTN_IDLE, BTN_GREEN, Empty, Tag, fmt } from '../../../constructor/ui';

const GROUPS: BoqLine['group'][] = ['material', 'works', 'consumables', 'logistics'];

const q = (line: BoqLine) => (line.unit === 'шт' || line.unit === 'маш' ? String(Math.ceil(line.qty)) : fmt(line.qty, 2));

export default function BoqPanel() {
  const { model } = useArchitecture();
  const orderNumber = useProjectStore((s) => s.project.orderNumber);
  const customer = useProjectStore((s) => s.project.customer);
  const setMainView = useUIStore((s) => s.setMainView);
  const { results, totals } = useMemo(() => computeArchitecture(model), [model]);

  if (!results.length) {
    return (
      <div className="flex flex-col h-full bg-[#eaf0f4]">
        <Empty>
          <div className="text-[16px] font-bold text-slate-800 mb-2">Відомість порожня</div>
          <p>Створи хоч одну розкладку — і тут з'являться квадратури, листи, шви, вага й роботи по групах.</p>
          <button type="button" className={`${BTN_GREEN} mt-4`} onClick={() => setMainView('layout')}><Grid3x3 className="w-4 h-4" /> До розкладок</button>
        </Empty>
      </div>
    );
  }

  const lines = results.flatMap((r) => r.boq);
  const exportCsv = () => {
    const rows = [['Група', 'Код', 'Позиція', 'Поверхня', 'Розкладка', 'Од.', 'Кількість', 'Норма'].join(';')];
    for (const l of lines) rows.push([BOQ_GROUP_LABELS[l.group], l.code, l.name, l.surfaceName, l.layoutName, l.unit, q(l).replace('.', ','), l.provisional ? 'УМОВНО' : 'ФАКТ'].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'));
    downloadTextFile(`Відомість_${orderNumber || 'проєкт'}.csv`, `﻿${rows.join('\n')}`, 'text/csv;charset=utf-8');
  };
  const print = () => window.print();

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#eaf0f4]">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-white border-b border-slate-200 print:hidden">
        <span className="text-[14px] font-bold text-slate-800">Відомість обсягів</span>
        <Tag>{results.length} розкладок</Tag>
        <span className="ml-auto flex items-center gap-1.5">
          <button type="button" className={BTN_IDLE} onClick={exportCsv} title="CSV для Excel / 1С"><Download className="w-4 h-4" /> CSV</button>
          <button type="button" className={BTN_IDLE} onClick={print} title="Друк / PDF через браузер"><Printer className="w-4 h-4" /> Друк</button>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-3 print:p-0 print:overflow-visible">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 max-w-[1100px] mx-auto print:border-0 print:shadow-none" id="arch-boq-print">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-[18px] font-bold text-slate-900">Відомість обсягів облицювання</div>
              <div className="text-[12.5px] text-slate-500">{orderNumber ? `Замовлення ${orderNumber}` : 'Проєкт без номера'}{customer ? ` · ${customer}` : ''} · {new Date().toLocaleDateString('uk-UA')}</div>
            </div>
            <div className="text-right text-[12.5px] text-slate-600">
              <div>Площа: <b>{fmt(totals.areaM2, 2)} м²</b> · матеріал із запасом: <b>{fmt(totals.materialAreaM2, 2)} м²</b></div>
              <div>Листів/панелей: <b>{totals.sheets}</b> · вага: <b>{fmt(totals.weightKg / 1000, 2)} т</b> · машин: <b>{totals.trucks}</b></div>
            </div>
          </div>

          <table className="w-full text-[12.5px] border-collapse mb-4">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="text-left px-2 py-1.5 border border-slate-200">Поверхня</th>
                <th className="text-left px-2 py-1.5 border border-slate-200">Розкладка</th>
                <th className="text-left px-2 py-1.5 border border-slate-200">Патерн · формат · шов</th>
                <th className="text-right px-2 py-1.5 border border-slate-200">м²</th>
                <th className="text-right px-2 py-1.5 border border-slate-200">Цілих</th>
                <th className="text-right px-2 py-1.5 border border-slate-200">Підрізів</th>
                <th className="text-right px-2 py-1.5 border border-slate-200">Плиток +запас</th>
                <th className="text-right px-2 py-1.5 border border-slate-200">Листів</th>
                <th className="text-right px-2 py-1.5 border border-slate-200">Шви, м</th>
                <th className="text-right px-2 py-1.5 border border-slate-200">Вага, кг</th>
              </tr>
            </thead>
            <tbody>
              {results.map(({ layout, surface, result }) => (
                <tr key={layout.id} className="odd:bg-white even:bg-slate-50">
                  <td className="px-2 py-1 border border-slate-200">{surface.name} <span className="text-slate-400">({surface.kind === 'floor' ? 'підлога' : 'стіна'})</span></td>
                  <td className="px-2 py-1 border border-slate-200">{layout.name}</td>
                  <td className="px-2 py-1 border border-slate-200">{LAYOUT_PATTERN_LABELS[layout.pattern]} · {layout.tileW}×{layout.tileH} · {layout.jointMm} мм · {layout.material.name}</td>
                  <td className="px-2 py-1 border border-slate-200 text-right">{fmt(result.stats.areaM2, 2)}</td>
                  <td className="px-2 py-1 border border-slate-200 text-right">{result.stats.fullCount}</td>
                  <td className="px-2 py-1 border border-slate-200 text-right">{result.stats.cutCount}</td>
                  <td className="px-2 py-1 border border-slate-200 text-right">{result.stats.tilesNeeded} <span className="text-slate-400">(+{result.stats.wastePct}%)</span></td>
                  <td className="px-2 py-1 border border-slate-200 text-right">{result.stats.sheetsNeeded}</td>
                  <td className="px-2 py-1 border border-slate-200 text-right">{fmt(result.stats.seamLengthM, 1)}</td>
                  <td className="px-2 py-1 border border-slate-200 text-right">{fmt(result.stats.weightKg, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {GROUPS.map((g) => {
            const gl = lines.filter((l) => l.group === g);
            if (!gl.length) return null;
            // зводимо однакові коди по всіх розкладках
            const byCode = new Map<string, { name: string; unit: BoqLine['unit']; qty: number; provisional: boolean; parts: string[] }>();
            for (const l of gl) {
              const key = `${l.code}|${l.unit}|${g === 'material' ? l.name : ''}`;
              const cur = byCode.get(key) ?? { name: l.name, unit: l.unit, qty: 0, provisional: l.provisional, parts: [] };
              cur.qty += l.qty; cur.parts.push(`${l.surfaceName}: ${q(l)}`);
              byCode.set(key, cur);
            }
            return (
              <div key={g} className="mb-3">
                <div className="text-[13px] font-bold text-slate-800 mb-1">{BOQ_GROUP_LABELS[g]}</div>
                <table className="w-full text-[12.5px] border-collapse">
                  <tbody>
                    {Array.from(byCode.entries()).map(([key, v]) => (
                      <tr key={key} className="odd:bg-white even:bg-slate-50">
                        <td className="px-2 py-1 border border-slate-200 w-20 text-slate-500">{key.split('|')[0]}</td>
                        <td className="px-2 py-1 border border-slate-200">{v.name}<div className="text-[11px] text-slate-400">{v.parts.join(' · ')}</div></td>
                        <td className="px-2 py-1 border border-slate-200 text-right w-28 font-semibold">{v.unit === 'шт' || v.unit === 'маш' ? Math.ceil(v.qty) : fmt(v.qty, 2)} {v.unit}</td>
                        <td className="px-2 py-1 border border-slate-200 w-20 text-center">{v.provisional ? <Tag tone="amber">УМОВНО</Tag> : <Tag tone="green">ФАКТ</Tag>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-500 mt-2">
            УМОВНО — норма першої версії (запас на бій за патерном, клей 5,5 кг/м², темп монтажу, машина 5 т), не підтверджена кейсом. ФАКТ — рахується з геометрії плану. Ціни підставляє «Прорахунок».
          </p>
        </div>
      </div>
    </div>
  );
}
