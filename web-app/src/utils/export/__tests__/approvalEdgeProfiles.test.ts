/**
 * Каталог кромок від цеху (PDF «Все кромки», 17.09.25).
 *
 * Дві обіцянки:
 *   1. Профілі з каталогу існують у довіднику — включно з акриловими,
 *      яких до 20.08 не було ВЗАГАЛІ (жодного запису на акрил).
 *   2. Вибрана кромка видна в бланку погодження — і рядком специфікації
 *      («Крайка — …»), і підписом на самому кресленні: цех читає
 *      креслення, а не таблицю.
 */
import { describe, expect, it } from 'vitest';
import { referenceData, mergeBuiltinEdgeProfiles } from '../../../domain/defaults';
import { edgeProfilesForMaterial } from '../../edgeProfiles';
import { renderApprovalBodies } from '../quotePdf';
import { EDGE_PROFILE_IMAGE_COUNT, edgeProfileImage, hasEdgeProfileImage } from '../../../domain/edgeProfileImages';

const profiles = referenceData.edgeProfiles ?? [];
const byId = new Map(profiles.map((p) => [p.id, p]));

describe('каталог 17.09.25 у довіднику', () => {
  it('акрилові профілі існують — раніше не було жодного', () => {
    const acryl = profiles.filter((p) => p.materialGroup === 'Акрил');
    expect(acryl.length).toBeGreaterThanOrEqual(30);
    for (const id of ['acr_r12', 'acr_bullnose_r12', 'acr_shark55_r3', 'acr_cove_r6', 'acr_modern', 'acr_spill_stop', 'acr_classic1', 'acr_classic2']) {
      expect(byId.has(id), id).toBe(true);
    }
  });

  it('нові кварцитні й керамогранітні форми на місці', () => {
    for (const id of ['tech_chamfer', 'zr_12', 'l_20', 'lv_40', 'lv_40_inv', 'o_40', 'u_40']) {
      expect(byId.has(id), id).toBe(true);
    }
  });

  it('id не дублюються', () => {
    expect(new Set(profiles.map((p) => p.id)).size).toBe(profiles.length);
  });

  it('усі профілі доступні на всіх матеріалах (рішення 26.08.2026)', () => {
    // Фільтр за матеріалом вимкнений свідомо: показуємо весь набір.
    const onAcryl = edgeProfilesForMaterial(profiles, 'Акрил').map((p) => p.id);
    const onCeramic = edgeProfilesForMaterial(profiles, 'Керамограніт').map((p) => p.id);
    expect(onAcryl).toContain('acr_r12');
    expect(onAcryl).toContain('zr_12');
    expect(onCeramic).toContain('zr_12');
    expect(onCeramic).toContain('acr_r12');
    expect(onAcryl).toHaveLength(profiles.length);
    expect(onCeramic).toHaveLength(profiles.length);
  });

  it('старий збережений проєкт отримує нові профілі доливанням', () => {
    // Проєкт, збережений до 20.08, ніс лише старі 12 записів.
    const old = profiles.slice(0, 12).map((p) => ({ ...p }));
    const merged = mergeBuiltinEdgeProfiles(old);
    expect(merged.find((p) => p.id === 'acr_bullnose_r12')).toBeDefined();
    expect(merged.length).toBe(profiles.length);
  });
});

// Спільні фікстури: одна деталь із двома різними кромками.
const part = {
  id: 'p1', detailId: 'd1', label: 'Стільниця', isMain: true,
  width: 2000, height: 900, thickness: 12, quantity: 1, area: 1.8,
  points: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 900 }, { x: 0, y: 900 }],
  holes: [],
} as never;

const detail = {
  id: 'd1', label: 'Стільниця', type: 'Стільниця', shape: 'Прямокутна',
  width: 2000, height: 900, thickness: 12, quantity: 1,
  geometry: { width: 2000, height: 900, corners: {}, cutouts: {} },
  edgeProfiles: { A: 'acr_bullnose_r12', C: 'acr_shark55_r3' },
} as never;

const project = {
  orderNumber: '77', customer: 'Тест', uiLanguage: 'uk',
  products: [], details: [], placements: [], slabs: [],
  referenceData: { edgeProfiles: referenceData.edgeProfiles },
} as never;

const doc = {
  method: 'drawing', branch: '', contragent: 'Тест', contactName: '', contactPhone: '',
  address: '', materialType: 'Акриловий камінь', manufacturer: '', decorCode: '',
  surfaceType: '', comment: '', items: [], services: {},
  packaging: { pyramidLength: 0, pyramidQty: 1, boxM2: 0 },
  materialSheets: 0, deliveryZone: 0,
} as never;

const blank = () => renderApprovalBodies(project, doc, [part], [detail]).join('');

describe('кромка в бланку погодження', () => {
  it('специфікація називає профіль повним іменем', () => {
    const svg = blank();
    expect(svg).toContain('R12+R12 BullNose (акрил)');
    expect(svg).toContain('SharkNose 55° R3 (акрил)');
  });

  it('на КРЕСЛЕННІ біля сторони стоїть короткий підпис профілю', () => {
    const svg = blank();
    expect(svg).toContain('BullNose R12');
    expect(svg).toContain('Shark 55° R3');
  });

  it('сторона без кромки підпису не отримує', () => {
    // На сторонах B і D профілів немає — і їхніх підписів теж.
    const svg = blank();
    expect(svg).not.toContain('>ZS20<');
  });
});

/**
 * Головна вимога власника: «я дав pdf з кресленнями в розрізі, щоб ти їх
 * підтягнув і показав у бланку». Назва профілю — половина справи; цех
 * впізнає обробку за розрізом. Тому розріз має фізично бути в SVG бланка.
 */
describe('розрізи профілів у бланку', () => {
  it('набір розрізів витягнутий із каталогу цілком', () => {
    expect(EDGE_PROFILE_IMAGE_COUNT).toBeGreaterThanOrEqual(56);
  });

  it('кожен розріз — справжній PNG з розмірами, а не порожній рядок', () => {
    for (const id of ['acr_bullnose_r12', 'acr_shark55_r3', 'acr_modern', 'zr_12', 'lv_40', 'tech_chamfer']) {
      const img = edgeProfileImage(id);
      expect(img, id).toBeDefined();
      expect(img!.src.startsWith('data:image/png;base64,iVBOR'), id).toBe(true);
      expect(img!.w, id).toBeGreaterThan(20);
      expect(img!.h, id).toBeGreaterThan(10);
    }
    expect(hasEdgeProfileImage('нема_такого')).toBe(false);
    expect(edgeProfileImage(undefined)).toBeUndefined();
  });

  it('блок «Профілі торця — розрізи» друкується з картинкою на кожну кромку', () => {
    const svg = blank();
    expect(svg).toContain('Профілі торця — розрізи');
    const images = svg.match(/<image[^>]+href="data:image\/png;base64,/g) ?? [];
    // Дві сторони — два різні профілі — дві картки.
    expect(images.length).toBe(2);
  });

  it('картка підписана і стороною, і повною назвою профілю', () => {
    const svg = blank();
    const cards = svg.slice(svg.indexOf('Профілі торця — розрізи'));
    expect(cards).toContain('>A<');
    expect(cards).toContain('>C<');
    expect(cards).toContain('R12+R12 BullNose (акрил)');
  });

  it('один профіль на двох сторонах — одна картка, обидві сторони в підписі', () => {
    const both = {
      ...(detail as unknown as Record<string, unknown>),
      edgeProfiles: { A: 'acr_bullnose_r12', C: 'acr_bullnose_r12' },
    } as never;
    const svg = renderApprovalBodies(project, doc, [part], [both]).join('');
    const images = svg.match(/<image[^>]+href="data:image\/png;base64,/g) ?? [];
    expect(images.length).toBe(1);
    expect(svg.slice(svg.indexOf('Профілі торця — розрізи'))).toContain('>A, C<');
  });

  it('профіль без розрізу порожньої рамки не малює', () => {
    const noImage = {
      ...(detail as unknown as Record<string, unknown>),
      edgeProfiles: { A: 'вигаданий_профіль' },
    } as never;
    const svg = renderApprovalBodies(project, doc, [part], [noImage]).join('');
    expect(svg).not.toContain('Профілі торця — розрізи');
  });
});
