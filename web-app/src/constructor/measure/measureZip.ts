/**
 * ZIP з приладу (iCONtrades) — 07.09.2026 (журнал №126).
 *
 * ЗК-1/ЗМ-Т12: замір приходить архівом `iCONtrades_<замовлення>_Exports/`:
 * на кожен проєкт пара `<проєкт>_2D.dxf` + `<проєкт>_3D.dxf` і тека
 * `<проєкт>_Panorama/*.jpg`. ЗМ-Т22/ЗК-58: проєктів у ZIP може бути
 * кілька — по одному на виріб (Кухня · Острів · Підвіконня…). ЗК-27:
 * головний вхід — `_3D`, `_2D` лишаємо як звірку.
 *
 * Імена всередині ZIP можуть бути з escape `#U0425` (архіватор без
 * UTF-8-прапорця) — декодуємо тим самим `decodeDxfText`.
 */
import JSZip from 'jszip';
import { decodeDxfText } from './leicaDxf';

export interface ZipMeasureProject {
  name: string;
  dxf3d?: { path: string; text: string };
  dxf2d?: { path: string; text: string };
  panorama: string[];
  /** Інші файли теки проєкту (фото, ескізи) — показуємо як довідку (ЗК-4). */
  attachments: string[];
}

export interface ZipMeasure {
  fileName: string;
  projects: ZipMeasureProject[];
  /** Усі DXF, які не впізнали як пару 2D/3D. */
  looseDxf: Array<{ path: string; text: string }>;
}

function baseName(path: string): string { return path.split('/').pop() ?? path; }

export async function readMeasureZip(data: ArrayBuffer | Uint8Array | Blob, fileName = 'замір.zip'): Promise<ZipMeasure> {
  const zip = await JSZip.loadAsync(data);
  const projects = new Map<string, ZipMeasureProject>();
  const looseDxf: ZipMeasure['looseDxf'] = [];
  const get = (name: string) => { if (!projects.has(name)) projects.set(name, { name, panorama: [], attachments: [] }); return projects.get(name)!; };
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  for (const f of entries) {
    const path = decodeDxfText(f.name);
    const base = baseName(path);
    const low = base.toLowerCase();
    if (low.endsWith('.dxf')) {
      const m = base.match(/^(.*)_(2d|3d)\.dxf$/i);
      const text = await f.async('string');
      if (m) {
        const p = get(m[1]);
        if (m[2].toLowerCase() === '3d') p.dxf3d = { path, text }; else p.dxf2d = { path, text };
      } else looseDxf.push({ path, text });
      continue;
    }
    const pm = path.match(/([^/]+)_Panorama\/[^/]+\.(jpe?g|png)$/i);
    if (pm) { get(pm[1]).panorama.push(path); continue; }
    if (/\.(jpe?g|png|pdf)$/i.test(low)) {
      const parent = path.split('/').slice(-2, -1)[0] ?? '';
      const owner = [...projects.keys()].find((n) => parent.startsWith(n)) ?? [...projects.keys()][0];
      if (owner) get(owner).attachments.push(path);
    }
  }
  const list = [...projects.values()].filter((p) => p.dxf3d || p.dxf2d).sort((a, b) => a.name.localeCompare(b.name));
  return { fileName, projects: list, looseDxf };
}
