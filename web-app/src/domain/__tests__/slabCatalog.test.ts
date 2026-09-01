import { describe, it, expect } from 'vitest';
import { executionFor, groupSlabDecors, slabDecorName, slabManufacturer } from '../slabCatalog';
import type { Slab1c } from '../../lib/api';

// Усі назви нижче — справжні рядки довідника номенклатур (27.08.2026).
// У ньому один артикул = одне виконання, тому картку декору доводиться
// збирати назад із назв, і саме тут вирішується, які коди 1С менеджер
// побачить під однією карткою.

const CERAMIC = ['Керамограніт'];
const STONE = ['Мармур', 'Граніт', 'Онікс', 'Травертин'];

const row = (over: Partial<Slab1c>): Slab1c => ({
  oid: 'oid1',
  article: '279397',
  title: 'Керамограніт Laminam Rare Marfil DNA 12,5 мм 3240х1620',
  width: 1620,
  height: 3240,
  thick: 12.5,
  photo: '',
  photos: [],
  ...over,
});

describe('назва декору з назви номенклатури', () => {
  it('зрізає матеріал, товщину й габарит', () => {
    expect(slabDecorName('Керамограніт Laminam Rare Marfil DNA 12,5 мм 3240х1620', CERAMIC))
      .toBe('Laminam Rare Marfil DNA');
  });

  it('латинська x у габариті — теж габарит', () => {
    expect(slabDecorName('Кварцит BLACK ASH(STON000665 - 86947) 1900x2950', ['Кварцит']))
      .toBe('BLACK ASH(STON000665 - 86947)');
  });

  it('товщина, продубльована в назві, зрізається вся', () => {
    // Реальний запис: «Граніт  Titanium polich 20 мм 20 мм 3300х1890»
    expect(slabDecorName('Граніт  Titanium polich 20 мм 20 мм 3300х1890', STONE))
      .toBe('Titanium polich');
  });

  it('«мм» після габариту не лишає хвоста', () => {
    expect(slabDecorName('Кварцит  RUBY CRISTAL полірування 20 мм 2900х1950 мм', ['Кварцит']))
      .toBe('RUBY CRISTAL полірування');
  });

  it('назва без розмірів лишається як є', () => {
    expect(slabDecorName('Мармур Crystal White', STONE)).toBe('Crystal White');
  });

  it('число всередині назви не приймається за товщину', () => {
    expect(slabDecorName('Керамограніт Ascale Allure Black Matt 12 mm 3200Х1600', CERAMIC))
      .toBe('Ascale Allure Black Matt');
  });
});

describe('виробник у назві', () => {
  it('впізнається, коли назва починається з бренду', () => {
    expect(slabManufacturer('Laminam Rare Marfil DNA')).toBe('Laminam');
    expect(slabManufacturer('Ascale Allure Black Matt')).toBe('Ascale');
  });

  it('колір чи порода виробником не стають', () => {
    // «Кварцит BLACK ASH…» — BLACK це колір, а не завод
    expect(slabManufacturer('BLACK ASH(STON000665 - 86947)')).toBe('');
    expect(slabManufacturer('Crystal White')).toBe('');
  });
});

describe('групування виконань у картки декорів', () => {
  const items = [
    row({ article: '279397', thick: 12.5, photo: 'https://s3/a.jpg', photos: ['https://s3/a.jpg'] }),
    row({ article: '279398', thick: 20, title: 'Керамограніт Laminam Rare Marfil DNA 20 мм 3240х1620' }),
    row({
      article: '279399',
      thick: 20,
      width: 1500,
      height: 3000,
      title: 'Керамограніт Laminam Rare Marfil DNA 20 мм 3000х1500',
    }),
    row({ article: '187079', title: 'Керамограніт Ascale Allure Black Matt 12 mm 3200Х1600', thick: 12 }),
  ];

  it('той самий декор різних товщин — одна картка', () => {
    const decors = groupSlabDecors(items, 'Керамограніт', CERAMIC);
    expect(decors).toHaveLength(2);
    const marfil = decors[0];
    expect(marfil.name).toBe('Laminam Rare Marfil DNA');
    expect(marfil.executions).toHaveLength(3);
    expect(marfil.thicknesses).toEqual([12.5, 20]);
    expect(marfil.sizes).toHaveLength(2);
  });

  it('картку показує перше фото, яке знайшлося серед виконань', () => {
    const noPhotoFirst = groupSlabDecors(
      [row({ article: 'a', photo: '' }), row({ article: 'b', thick: 20, photo: 'https://s3/b.jpg' })],
      'Керамограніт',
      CERAMIC,
    );
    expect(noPhotoFirst[0].photo).toBe('https://s3/b.jpg');
  });

  it('порядок карток — як у відповіді довідника, без пересортування', () => {
    const decors = groupSlabDecors(items, 'Керамограніт', CERAMIC);
    expect(decors.map((d) => d.name)).toEqual(['Laminam Rare Marfil DNA', 'Ascale Allure Black Matt']);
  });
});

describe('артикул конкретного виконання', () => {
  const decor = groupSlabDecors(
    [
      row({ article: '279397', thick: 12.5 }),
      row({ article: '279398', thick: 20 }),
    ],
    'Керамограніт',
    CERAMIC,
  )[0];

  it('товщина й габарит разом визначають артикул', () => {
    expect(executionFor(decor, { width: 1620, height: 3240 }, 20)?.article).toBe('279398');
  });

  it('немає такого виконання — немає артикула, а не сусідній', () => {
    expect(executionFor(decor, { width: 1620, height: 3240 }, 30)).toBeUndefined();
    expect(executionFor(decor, { width: 1000, height: 1000 }, 20)).toBeUndefined();
  });
});
