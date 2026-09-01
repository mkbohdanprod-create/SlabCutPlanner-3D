/**
 * FG-30 — «розмірів вирізів не видно ні в 2D, ні в 3D».
 *
 * Габарит отвору в бланку був і раніше, а от ЯК ВІН СТОЇТЬ — ні. Щоб
 * перевірити виріз, доводилось відкривати його через «Обробка площин» і
 * читати поля. Тепер від найближчого кута деталі йдуть дві розмірні лінії.
 *
 * Заразом сторож на баг, знайдений тут же 20.08: круглий виріз зберігається
 * РАДІУСОМ, а рядок специфікації читав неіснуюче поле `diameter` — і кожна
 * розетка показувалась як «Ø0 мм».
 */
import { describe, expect, it } from 'vitest';
import { renderApprovalBodies } from '../quotePdf';

const part = {
  id: 'p1', detailId: 'd1', label: 'Стільниця', isMain: true,
  width: 2000, height: 900, thickness: 20, quantity: 1, area: 1.8,
  points: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 900 }, { x: 0, y: 900 }],
  holes: [
    // Прямокутний виріз 400×250, кут за 300 мм від лівого краю і 250 від верху.
    [{ x: 300, y: 250 }, { x: 700, y: 250 }, { x: 700, y: 500 }, { x: 300, y: 500 }],
  ],
} as never;

const detail = {
  id: 'd1', label: 'Стільниця', type: 'Стільниця', shape: 'Прямокутна',
  width: 2000, height: 900, thickness: 20, quantity: 1,
  geometry: {
    width: 2000, height: 900, corners: {},
    cutouts: {
      c1: { id: 'c1', shape: 'rect', width: 400, height: 250, x: 300, y: 250, bindCorner: 'DA' },
      c2: { id: 'c2', shape: 'circle', radius: 35, x: 1535, y: 635, bindCorner: 'AB' },
    },
  },
} as never;

const project = {
  orderNumber: '123', customer: 'Тест', uiLanguage: 'uk',
  products: [], details: [], placements: [], slabs: [], referenceData: {},
} as never;

const doc = {
  method: 'drawing', branch: '', contragent: 'Тест', contactName: '', contactPhone: '',
  address: '', materialType: 'Керамограніт', manufacturer: '', decorCode: '',
  surfaceType: '', comment: '', items: [], services: {},
  packaging: { pyramidLength: 0, pyramidQty: 1, boxM2: 0 },
  materialSheets: 0, deliveryZone: 0,
} as never;

const blank = () => renderApprovalBodies(project, doc, [part], [detail]).join('');

describe('FG-30 · відступи вирізу на кресленні', () => {
  it('обидва відступи від найближчого кута підписані', () => {
    const svg = blank();
    expect(svg).toContain('300 мм'); // від лівого краю
    expect(svg).toContain('250 мм'); // від верхнього краю
  });

  it('габарит вирізу лишився на місці', () => {
    expect(blank()).toContain('400×250');
  });

  it('сторони деталі підписані як раніше — нові розміри їх не витіснили', () => {
    const svg = blank();
    expect(svg).toContain('A=2000 мм');
    expect(svg).toContain('B=900 мм');
  });
});

describe('специфікація бланка', () => {
  it('круглий виріз показує свій діаметр, а не нуль', () => {
    const svg = blank();
    expect(svg).toContain('Виріз Ø70 мм');
    expect(svg).not.toContain('Ø0 мм');
  });

  it('прямокутний виріз показує габарит', () => {
    expect(blank()).toContain('Виріз 400×250 мм');
  });
});
