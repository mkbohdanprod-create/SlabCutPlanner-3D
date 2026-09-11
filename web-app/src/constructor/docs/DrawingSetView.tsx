/**
 * НАБІР КРЕСЛЕНЬ ЦЕХУ — перегляд і експорт (06.09.2026).
 *
 * Аркуші «як у кейсах», по одному на сюжет: збірка → деталі → смуги →
 * мийка → стики/склейка → специфікація (`../drawing/set.ts`). Тут —
 * перемикач аркушів, перегляд, прогалини моделі під аркушем і експорт:
 * PDF (той самий конвеєр SVG → PNG → jsPDF, що в прорахунку; A3 альбом,
 * специфікація — A4 портрет) або друк усіх аркушів.
 */
import { useMemo, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChevronLeft, ChevronRight, FileDown, Printer } from 'lucide-react';
import { jsPDF } from 'jspdf';
import type { Detail, DetailPart, Project } from '../../domain/types';
import { composeFullDrawingSet, DrawingSvg } from '../drawing';
import type { DrawingSheet } from '../drawing/model';
import { loadImage, svgToDataUrl, safeFilePart } from '../../utils/export/pdfUtils';
import { BTN_BLUE, BTN_IDLE } from '../ui';

export interface DrawingSetViewProps {
  project: Project;
  parts: DetailPart[];
  details: Detail[];
  instructions?: string[];
}

function sheetSvgString(sheet: DrawingSheet, pxW: number): string {
  const raw = renderToStaticMarkup(<DrawingSvg sheet={sheet} className="" />);
  const pxH = Math.round((sheet.size.h / sheet.size.w) * pxW);
  return raw.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" `);
}

/** SVG → JPEG (білий фон). PNG на 3000+ px дає PDF по 20 МБ на аркуш — JPEG 0,88 читається так само, важить у 30 разів менше. */
async function sheetJpeg(sheet: DrawingSheet, pxW: number): Promise<string> {
  const img = await loadImage(svgToDataUrl(sheetSvgString(sheet, pxW)));
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.88);
}

const orientOf = (s: DrawingSheet) => (s.size.w >= s.size.h ? 'landscape' : 'portrait');
const formatOf = (s: DrawingSheet) => (Math.max(s.size.w, s.size.h) > 300 ? 'a3' : 'a4');

async function addSheets(pdf: jsPDF, sheets: DrawingSheet[], first: boolean) {
  for (let i = 0; i < sheets.length; i += 1) {
    const s = sheets[i];
    if (!(first && i === 0)) pdf.addPage(formatOf(s), orientOf(s));
    // 6 px/мм ≈ 150 dpi — цифра 2,5 мм читається, аркуш A3 ≈ 300–500 КБ
    const jpg = await sheetJpeg(s, Math.round(s.size.w * 6));
    pdf.addImage(jpg, 'JPEG', 0, 0, s.size.w, s.size.h);
  }
}

export async function exportDrawingSetPdf(sheets: DrawingSheet[], project: Project) {
  if (!sheets.length) return;
  const pdf = new jsPDF({ orientation: orientOf(sheets[0]), unit: 'mm', format: formatOf(sheets[0]), compress: true });
  await addSheets(pdf, sheets, true);
  pdf.save(`Креслення_${safeFilePart(project.orderNumber, 'без номера')}_${safeFilePart(project.customer, 'замовник')}.pdf`);
}

/** CSS друку html-документів (тех карта, бланк цеху) — ті самі правила, що у вікні «Друк пакета». */
export const DOC_PRINT_CSS = 'body{margin:0;font-family:Arial,sans-serif;color:#111} .no-print{display:none} .grid{display:grid;grid-template-columns:140px 1fr;gap:2px 12px;padding:8px;border:1px solid #ddd;border-radius:6px;background:#f8fafc;margin:8px 0 14px} .flex{display:flex;flex-wrap:wrap;gap:6px 16px} h2{margin:6px 0 2px;font-size:20px} h3{margin:14px 0 4px;border-bottom:1px solid #ddd;padding-bottom:2px;font-size:15px} p{margin:4px 0} table{border-collapse:collapse;font-size:12px;width:100%} td,th{border:1px solid #999;padding:3px 6px;vertical-align:top;text-align:left} .ctor-route td,.ctor-route th{font-size:11px} .p-6{padding:24px} .text-slate-400{color:#94a3b8} .text-slate-500{color:#64748b} .text-slate-600{color:#475569} .text-slate-700{color:#334155} .font-bold{font-weight:700} .font-semibold{font-weight:600} .uppercase{text-transform:uppercase} .text-\\[10px\\]{font-size:10px} .text-\\[11px\\]{font-size:11px} .text-\\[12px\\]{font-size:12px} .text-\\[13px\\]{font-size:13px} .mb-1{margin-bottom:4px} .mb-3{margin-bottom:12px} .mb-4{margin-bottom:16px} .mt-1{margin-top:4px}';

/**
 * HTML-документ (тех карта, бланк цеху) → сторінки A4 портрет.
 * Не html2canvas (він не знає oklch-кольорів Tailwind 4): клон елемента
 * серіалізується в XHTML, кладеться у <foreignObject> SVG з CSS друку і
 * растеризується браузером; висоту дає прихований клон поза екраном.
 */
async function addHtmlDoc(pdf: jsPDF, el: HTMLElement) {
  const W = 900;
  const holder = document.createElement('div');
  holder.className = 'ctor-doc';
  holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;background:#fff;z-index:-1`;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.display = 'block';
  holder.appendChild(clone);
  document.body.appendChild(holder);
  let H = 1200;
  let xhtml = '';
  try {
    H = Math.max(200, Math.ceil(clone.scrollHeight) + 24);
    xhtml = new XMLSerializer().serializeToString(clone);
  } finally { holder.remove(); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="ctor-doc" style="width:${W}px;background:#fff"><style>${DOC_PRINT_CSS}</style>${xhtml}</div></foreignObject></svg>`;
  const img = await loadImage(svgToDataUrl(svg));
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pageW = 210; const pageH = 297; const margin = 8;
  const contentW = pageW - 2 * margin; const contentH = pageH - 2 * margin;
  const pxPerMm = canvas.width / contentW;
  const sliceH = Math.floor(contentH * pxPerMm);
  for (let y = 0; y < canvas.height; y += sliceH) {
    const h = Math.min(sliceH, canvas.height - y);
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = h;
    const cctx = c.getContext('2d')!; cctx.fillStyle = '#fff'; cctx.fillRect(0, 0, c.width, c.height);
    cctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    pdf.addPage('a4', 'portrait');
    pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', margin, margin, contentW, h / pxPerMm);
  }
}

/**
 * Пакет для цеху як БАЙТИ PDF (№175) — для ZIP у МЕС: та сама збірка,
 * що й exportPackagePdf, тільки без збереження файлу користувачу.
 */
export async function renderPackagePdfBytes(sheets: DrawingSheet[], htmlDocIds: string[]): Promise<Uint8Array> {
  const first = sheets[0];
  const pdf = first
    ? new jsPDF({ orientation: orientOf(first), unit: 'mm', format: formatOf(first), compress: true })
    : new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  await addSheets(pdf, sheets, true);
  let addedAny = sheets.length > 0;
  for (const id of htmlDocIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (!addedAny) { pdf.deletePage(1); addedAny = true; }
    await addHtmlDoc(pdf, el);
  }
  return new Uint8Array(pdf.output('arraybuffer'));
}

/** Пакет для цеху одним файлом: набір креслень + тех карта + бланк цеху (html-документи за id елементів). */
export async function exportPackagePdf(sheets: DrawingSheet[], project: Project, htmlDocIds: string[]) {
  const bytes = await renderPackagePdfBytes(sheets, htmlDocIds);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Пакет_цех_${safeFilePart(project.orderNumber, 'без номера')}_${safeFilePart(project.customer, 'замовник')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DrawingSetView({ project, parts, details, instructions }: DrawingSetViewProps) {
  const { sheets, model } = useMemo(() => composeFullDrawingSet({ project, parts, details, instructions }), [project, parts, details, instructions]);
  const [idx, setIdx] = useState(0);
  const cur = sheets[Math.min(idx, sheets.length - 1)];
  const [busy, setBusy] = useState(false);

  if (!sheets.length || !cur) return <div className="p-6 text-slate-500 text-[13px]">Немає деталей для креслень.</div>;

  const label = (s: DrawingSheet) => s.title ? s.title.split(' · ').slice(0, 2).join(' · ') : s.size.w < s.size.h ? 'Специфікація' : 'Збірка';
  const printAll = () => {
    const el = document.getElementById('ctor-drawing-set-all');
    if (!el) return;
    const w = window.open('', '_blank', 'width=1200,height=850');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Креслення — ${project.orderNumber || 'проєкт'}</title>
      <style>@page{size:A3 landscape;margin:6mm} @page portrait{size:A4 portrait;margin:6mm} body{margin:0} .pg{page-break-after:always;display:flex;justify-content:center} .pg:last-child{page-break-after:auto} .pg-portrait{page:portrait} .drawing-sheet{height:283mm;width:auto} .drawing-sheet--portrait{height:283mm}</style>
      </head><body>${el.innerHTML}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  };
  const pdf = async () => { setBusy(true); try { await exportDrawingSetPdf(sheets, project); } finally { setBusy(false); } };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 flex-wrap px-3 py-2 border-b border-slate-200 bg-[#f7f9fb] no-print">
        <button type="button" className={BTN_IDLE} onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} title="Попередній аркуш"><ChevronLeft className="w-4 h-4" /></button>
        <div className="flex items-center gap-1 flex-wrap max-w-[760px]">
          {sheets.map((s, i) => (
            <button key={s.sheetNo} type="button" onClick={() => setIdx(i)} title={s.title ?? 'Збірка'}
              className={`!px-2 !py-1 rounded border text-[11.5px] whitespace-nowrap ${i === idx ? '!bg-sky-50 !border-sky-300 font-semibold' : '!bg-white !border-slate-200'}`}>
              {s.sheetNo}. {label(s)}
            </button>
          ))}
        </div>
        <button type="button" className={BTN_IDLE} onClick={() => setIdx((i) => Math.min(sheets.length - 1, i + 1))} disabled={idx >= sheets.length - 1} title="Наступний аркуш"><ChevronRight className="w-4 h-4" /></button>
        <span className="ml-auto flex items-center gap-1.5">
          <button type="button" className={BTN_BLUE} onClick={pdf} disabled={busy} title="PDF набору: A3 альбом, специфікація A4"><FileDown className="w-4 h-4" /> {busy ? 'Збираю PDF…' : 'PDF набору'}</button>
          <button type="button" className={BTN_IDLE} onClick={printAll} title="Друк усіх аркушів"><Printer className="w-4 h-4" /> Друк</button>
        </span>
      </div>
      <div className="p-2">
        <DrawingSvg sheet={cur} className={cur.size.w < cur.size.h ? 'w-[60%] mx-auto block bg-white' : 'w-full h-auto bg-white'} />
      </div>
      {cur.gaps.length > 0 && (
        <div className="no-print px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
          <b>Аркуш {cur.sheetNo}:</b> не намальовано через брак даних у моделі — {Array.from(new Set(cur.gaps)).join('; ')}.
        </div>
      )}
      <div className="no-print px-4 pb-2 text-[11px] text-slate-400">
        {model.body.length} деталей тіла{model.sinkParts.length ? `, мийка з каменю — ${model.sinkParts.length} деталей` : ''}; аркушів у наборі — {sheets.length}.
      </div>
      <div id="ctor-drawing-set-all" style={{ display: 'none' }}>
        {sheets.map((s) => (
          <div key={s.sheetNo} className={`pg ${s.size.w < s.size.h ? 'pg-portrait' : ''}`}>
            <DrawingSvg sheet={s} className={s.size.w < s.size.h ? 'drawing-sheet drawing-sheet--portrait' : 'drawing-sheet'} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default DrawingSetView;
