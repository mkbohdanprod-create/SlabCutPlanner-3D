/**
 * Розкладка розрізів біля штампа (РЗ-2) — одна функція для компонувальника
 * (щоб знати висоту смуги знизу) і для рендера (щоб поставити блоки).
 * Ряди заповнюються зліва направо; останній ряд стоїть на рівні штампа,
 * попередні — вище.
 */
import type { SectionView } from './model';
import { SHEET } from './style';

export interface SectionPlacement { s: SectionView; x: number; y: number }

export function layoutSections(sections: SectionView[], frame: { x: number; y: number; w: number; h: number }, stampH: number, noStamp: boolean): { placed: SectionPlacement[]; bandH: number } {
  const auto = sections.filter((s) => !s.at);
  const x0 = frame.x + (noStamp ? 4 : SHEET.stamp.w + 14);
  const maxX = frame.x + frame.w - SHEET.sheetNoBox.w - 6;
  const rows: Array<Array<{ s: SectionView; x: number }>> = [[]]; const rowHs: number[] = [];
  let x = x0; let rowH = 0;
  for (const s of auto) {
    if (x + s.w > maxX && rows[rows.length - 1].length) { rowHs.push(rowH); rows.push([]); x = x0; rowH = 0; }
    rows[rows.length - 1].push({ s, x }); x += s.w + 10; rowH = Math.max(rowH, s.h);
  }
  rowHs.push(rowH);
  const total = rowHs.reduce((a, h) => a + h, 0) + 8 * Math.max(0, rows.length - 1);
  const bandH = Math.max(stampH, auto.length ? total + 4 : 0);
  const bottom = frame.y + frame.h;
  // верх смуги розрізів так, щоб низ останнього ряду збігався з низом рамки (мінус 2)
  let y = bottom - 2 - total;
  const placed: SectionPlacement[] = [];
  rows.forEach((row, r) => {
    for (const it of row) placed.push({ s: it.s, x: it.x, y });
    y += rowHs[r] + 8;
  });
  return { placed, bandH };
}
