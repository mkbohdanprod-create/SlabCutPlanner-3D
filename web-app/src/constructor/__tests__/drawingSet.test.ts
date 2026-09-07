/**
 * @vitest-environment jsdom
 *
 * Набір креслень цеху на тестовому замовленні «Кухня Г-подібна»:
 * склад аркушів, нумерація, штамп, розділи, і що SVG кожного аркуша
 * рендериться без падіння.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { flattenProductToDetails } from '../../store/projectHelpers';
import { explodeDetails } from '../../engines/geometry';
import { createEmptyProject, DEFAULT_ALLOWANCES } from '../../domain/defaults';
import { composeFullDrawingSet } from '../drawing';
import { DrawingSvg } from '../drawing/render';
import { buildSampleKitchenProduct, SAMPLE_PROJECT_HEADER } from '../drawing/sampleOrder';
import { buildDrawModel, layoutBody } from '../drawing/set';
import { buildProductFromSession } from '../../components/ui/ProductEditorWorkspace';
import { createDraft } from '../../components/forms/utils/draftHelpers';
import type { DetailDraft } from '../../components/forms/utils/draftHelpers';

function sample() {
  const product = buildSampleKitchenProduct();
  const project = { ...createEmptyProject(), ...SAMPLE_PROJECT_HEADER, products: [product] };
  const details = flattenProductToDetails(product);
  const parts = explodeDetails(details, DEFAULT_ALLOWANCES, project.projectMaterial);
  return { project, details, parts };
}

describe('набір креслень цеху — тестова кухня', () => {
  const { project, details, parts } = sample();
  const set = composeFullDrawingSet({ project, parts, details, instructions: ['Замовлення укомплектувати клеєм'] });

  it('модель: стільниця + 2 опори + 2 підвороти + панель, мийка з каменю', () => {
    const m = buildDrawModel({ project, parts, details });
    expect(m.main[0]?.name).toBe('Стільниця 1');
    expect(m.additions.map((a) => a.kind).sort()).toEqual(['fold', 'fold', 'leg', 'leg', 'wall_panel']);
    expect(m.sinkParts.length).toBeGreaterThan(0);
    expect(m.thickness).toBe(20);
  });

  it('склад: збірка → деталі → смуги → мийка → стики → специфікація', () => {
    const titles = set.sheets.map((s) => (s.title ?? '').split(' · ')[0]);
    expect(set.sheets[0].title).toBeUndefined(); // збірка — без заголовка, лише шапка ЗГ-1
    expect(titles[1]).toBe('Деталь 1');
    expect(titles.some((t) => /^Деталі \d+–\d+/.test(t))).toBe(true); // смуги
    expect(titles.some((t) => t.startsWith('Мийка'))).toBe(true);
    expect(titles.some((t) => t.startsWith('Стики'))).toBe(true);
    const spec = set.sheets[set.sheets.length - 1];
    const specTexts = spec.entities.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text).join('\n');
    expect(specTexts).toContain('Специфікація Виробу');
    // збірка, стільниця, опора 1, опора 2, панель, смуги (2 підвороти), мийка, стики, вибухова цех, вибухова монтаж, специфікація
    expect(titles.some((t) => t.startsWith('Збірка в цеху'))).toBe(true);
    expect(titles.some((t) => t.startsWith('Монтаж на об’єкті'))).toBe(true);
    expect(titles.some((t) => t.startsWith('Збірка мийки з каменю'))).toBe(true);
    expect(set.sheets.length).toBe(12);
  });

  it('нумерація суцільна, специфікація — A4 портрет, решта A3 альбом', () => {
    set.sheets.forEach((s, i) => {
      expect(s.sheetNo).toBe(i + 1);
      expect(s.sheetCount).toBe(set.sheets.length);
    });
    const spec = set.sheets[set.sheets.length - 1];
    expect(spec.size.w).toBeLessThan(spec.size.h);
    expect(set.sheets.slice(0, -1).every((s) => s.size.w > s.size.h)).toBe(true);
  });

  it('штамп збірки: номер, замовник, матеріал, масштаб (ШП-1)', () => {
    const asm = set.sheets[0];
    const stamp = asm.stamp.fields.map((f) => `${f.key}: ${f.value}`).join('\n');
    expect(stamp).toContain('81-0000001');
    expect(stamp).toContain('Тестовий Замовник');
    expect(stamp).toMatch(/Кварцит/);
    expect(stamp).toMatch(/1:\d+/);
    expect(stamp).toContain('Мийка');
  });

  it('червона інструкція виконавцю потрапляє на збірку', () => {
    const asm = set.sheets[0];
    const texts = asm.entities.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text);
    expect(texts.some((t) => t.includes('укомплектувати клеєм'))).toBe(true);
  });

  it('аркуш стиків: обидва підвороти, обидві опори, панель', () => {
    const joints = set.sheets.find((s) => s.title?.startsWith('Стики'))!;
    const texts = joints.entities.filter((e) => e.kind === 'text').map((e) => (e as { text: string }).text).join('\n');
    expect(texts).toMatch(/Підворот 1/);
    expect(texts).toMatch(/Підворот 2/);
    expect(texts).toMatch(/Опора 1/);
    expect(texts).toMatch(/Опора 2/);
    expect(texts).toMatch(/Стінова панель 1/);
    expect(texts).toMatch(/об’єкт/); // панель — стик монтажний, опора — на об'єкті
    expect(joints.sections.length).toBeGreaterThanOrEqual(3);
  });

  it('збірка: підвороти — лінія стику і один підпис на обидві сторони, опори — позначки «1»', () => {
    const asm = set.sheets[0];
    const leaders = asm.entities.filter((e) => e.kind === 'leader') as Array<{ text: string; targets: unknown[] }>;
    const fold = leaders.filter((l) => l.text.startsWith('Підворот'));
    expect(fold.length).toBe(1);
    expect(fold[0].targets.length).toBe(2);
    const ones = asm.entities.filter((e) => e.kind === 'text' && (e as { text: string }).text === '1');
    expect(ones.length).toBe(4); // по два на кожну опору
    const stamp = asm.stamp.fields.map((f) => f.key);
    expect(stamp).toContain('Декор стін.панель / плінтус');
  });

  it('усі аркуші рендеряться в SVG', () => {
    for (const sheet of set.sheets) {
      const svg = renderToStaticMarkup(createElement(DrawingSvg, { sheet, className: '' }));
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain(sheet.sheetNo === 1 ? `Аркуш 1/${sheet.sheetCount}` : `Аркуш ${sheet.sheetNo}`);
    }
  });

  it('інші конфігурації: пряма з мийкою замовника, П-подібна, кераміка 12 — набір збирається без падіння', () => {
    const draft = (type: string, patch: Partial<DetailDraft> = {}): DetailDraft => ({ ...createDraft(), kind: 'rect', type: type as DetailDraft['type'], thickness: 20, ...patch });
    type Sess = Parameters<typeof buildProductFromSession>[0];
    const cases: Array<{ material: 'Кварцит' | 'Керамограніт'; t: number; s: Sess; sheets: number }> = [
      { material: 'Кварцит', t: 20, sheets: 4, s: { activeDetailId: 'main', mainDetail: { ...createDraft(), kind: 'rect', type: 'Стільниця', thickness: 20, width: 3000, height: 600, edgeProfiles: { C: 'ar_20' },
        cutouts: { sink_cut_c1: { id: 'sink_cut_c1', shape: 'rect', type: 'custom', bindCorner: 'DA', x: 500, y: 100, width: 760, height: 430, cornerRadius: 15 } } as never } as DetailDraft, subDetails: {} } as Sess },
      { material: 'Кварцит', t: 20, sheets: 8, s: { activeDetailId: 'main', mainDetail: { ...createDraft(), kind: 'u', type: 'Стільниця', thickness: 20, width: 3000, height: 1500, innerCutWidth: 1800, innerCutDepth: 900, innerCutOffset: 600, leftLegHeight: 1500, rightLegHeight: 1500, edgeProfiles: { D: 'ar_20', E: 'ar_20', F: 'ar_20' }, cutouts: {} as never } as DetailDraft,
        subDetails: { thickening_E: draft('Потовщення', { width: 1800, height: 40 }), wall_panel_A: draft('Стінова панель', { width: 3000, height: 600 }) } } as Sess },
      { material: 'Керамограніт', t: 12, sheets: 6, s: { activeDetailId: 'main', mainDetail: { ...createDraft(), kind: 'rect', type: 'Стільниця', thickness: 12, width: 3200, height: 650, edgeProfiles: { C: 'ar_20' }, cutouts: {} as never } as DetailDraft,
        subDetails: { thickening_C: draft('Потовщення', { width: 3200, height: 60, thickness: 12 }), fold_D: draft('Підворот', { width: 650, height: 120, thickness: 12 }) } } as Sess },
    ];
    for (const c of cases) {
      const product = buildProductFromSession(c.s, 'p', c.material);
      const project = { ...createEmptyProject(), projectMaterial: c.material, projectThickness: c.t, products: [product] };
      const details = flattenProductToDetails(product);
      const parts = explodeDetails(details, DEFAULT_ALLOWANCES, c.material);
      const out = composeFullDrawingSet({ project, parts, details });
      expect(out.sheets.length).toBe(c.sheets);
      for (const sheet of out.sheets) expect(renderToStaticMarkup(createElement(DrawingSvg, { sheet, className: '' })).startsWith('<svg')).toBe(true);
    }
  });

  it('два вироби в проєкті: опора другого стоїть біля ДРУГОЇ стільниці, потовщення першого — лише на першій', () => {
    const draft = (type: string, patch: Partial<DetailDraft> = {}): DetailDraft => ({ ...createDraft(), kind: 'rect', type: type as DetailDraft['type'], thickness: 20, ...patch });
    type Sess = Parameters<typeof buildProductFromSession>[0];
    const sessions: Sess[] = [
      { activeDetailId: 'main', mainDetail: { ...createDraft(), kind: 'rect', type: 'Стільниця', thickness: 20, width: 2400, height: 600, cutouts: {} as never } as DetailDraft, subDetails: { thickening_C: draft('Потовщення', { width: 2400, height: 40 }) } } as Sess,
      { activeDetailId: 'main', mainDetail: { ...createDraft(), kind: 'rect', type: 'Стільниця', thickness: 20, width: 1200, height: 550, cutouts: {} as never } as DetailDraft, subDetails: { leg_B: draft('Опора', { width: 550, height: 850 }) } } as Sess,
    ];
    const products = sessions.map((s, i) => buildProductFromSession(s, `p${i}`, 'Кварцит'));
    const project = { ...createEmptyProject(), projectMaterial: 'Кварцит' as const, projectThickness: 20, products };
    const details = products.flatMap((p) => flattenProductToDetails(p));
    const parts = explodeDetails(details, DEFAULT_ALLOWANCES, 'Кварцит');
    const m = buildDrawModel({ project, parts, details });
    expect(m.main.length).toBe(2);
    const leg = m.additions.find((a) => a.kind === 'leg')!;
    const th = m.additions.find((a) => a.kind === 'thickening')!;
    expect(leg.productKey).toBe(m.main[1].productKey);
    expect(th.productKey).toBe(m.main[0].productKey);
    expect(leg.joint).toBeDefined();
    const { placed } = layoutBody(m, 300);
    const legPl = placed.find((p) => p.dp === leg)!;
    expect(legPl.host?.dp).toBe(m.main[1]);
    // опора праворуч від другої стільниці, а не першої
    expect(legPl.x).toBeGreaterThan(placed.find((p) => p.dp === m.main[1])!.x);
  });
});
