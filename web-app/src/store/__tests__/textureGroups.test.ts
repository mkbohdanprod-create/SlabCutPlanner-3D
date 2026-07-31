import { describe, it, expect } from 'vitest';
import { flattenProductToDetails } from '../projectHelpers';
import { explodeDetails } from '../../engines/geometry';
import { textureGroupKey } from '../../engines/geometryUtils';
import type { Product, ProductElement } from '../../domain/types';

describe('Texture Groups (Connected Components)', () => {
  it('1. Стільниця+бортик з textureContinuity:true → однаковий лейбл', () => {
    const product: Product = {
      id: 'prod1',
      name: 'Product 1',
      elements: [{
        id: 'prod1/element:main',
        type: 'Стільниця',
        baseDefinition: { type: 'Стільниця', width: 1000, height: 600, quantity: 1, kind: 'rect' } as any,
        joints: [{ id: 'j1', type: 'miter45', a: { elementPath: 'prod1/element:main', sideId: '', from: 0, to: 1000 }, b: { elementPath: 'prod1/element:skirting', sideId: '', from: 0, to: 1000 }, textureContinuity: true }],
        additions: [{
          id: 'prod1/element:skirting',
          type: 'Бортик',
          baseDefinition: { type: 'Бортик', width: 1000, height: 50, quantity: 1, kind: 'rect' } as any,
          joints: [],
          additions: []
        }]
      }]
    };
    const details = flattenProductToDetails(product);
    expect(details).toHaveLength(2);
    expect(details[0].textureGroupLabel).toBeDefined();
    expect(details[0].textureGroupLabel).toEqual(details[1].textureGroupLabel);
  });

  it('2. Нога з false → окремий унікальний лейбл', () => {
    const product: Product = {
      id: 'prod1',
      name: 'Product 1',
      elements: [{
        id: 'prod1/element:main',
        type: 'Стільниця',
        baseDefinition: { type: 'Стільниця', width: 1000, height: 600, quantity: 1, kind: 'rect' } as any,
        joints: [{ id: 'j1', type: 'glued', a: { elementPath: 'prod1/element:main', sideId: '', from: 0, to: 600 }, b: { elementPath: 'prod1/element:leg', sideId: '', from: 0, to: 600 }, textureContinuity: false }],
        additions: [{
          id: 'prod1/element:leg',
          type: 'Опора',
          baseDefinition: { type: 'Опора', width: 600, height: 800, quantity: 1, kind: 'rect' } as any,
          joints: [],
          additions: []
        }]
      }]
    };
    const details = flattenProductToDetails(product);
    expect(details).toHaveLength(2);
    expect(details[0].textureGroupLabel).toBeDefined();
    expect(details[1].textureGroupLabel).toBeDefined();
    expect(details[0].textureGroupLabel).not.toEqual(details[1].textureGroupLabel);
  });

  it('3. П-форма (цикл) → не падає, компонент зв\'язний', () => {
    const product: Product = {
      id: 'prod1',
      name: 'Product 1',
      elements: [{
        id: 'prod1/element:main',
        type: 'Стільниця',
        baseDefinition: { type: 'Стільниця', width: 1000, height: 600, quantity: 1, kind: 'rect' } as any,
        joints: [
          { id: 'j1', type: 'glued', a: { elementPath: 'prod1/element:main', sideId: '', from: 0, to: 0 }, b: { elementPath: 'prod1/element:left', sideId: '', from: 0, to: 0 }, textureContinuity: true },
          { id: 'j2', type: 'glued', a: { elementPath: 'prod1/element:main', sideId: '', from: 0, to: 0 }, b: { elementPath: 'prod1/element:right', sideId: '', from: 0, to: 0 }, textureContinuity: true },
          { id: 'j3', type: 'glued', a: { elementPath: 'prod1/element:left', sideId: '', from: 0, to: 0 }, b: { elementPath: 'prod1/element:right', sideId: '', from: 0, to: 0 }, textureContinuity: true }, // Artificial cycle
        ],
        additions: [
          {
            id: 'prod1/element:left',
            type: 'Стільниця',
            baseDefinition: { type: 'Стільниця', width: 500, height: 600, quantity: 1, kind: 'rect' } as any,
            joints: [], additions: []
          },
          {
            id: 'prod1/element:right',
            type: 'Стільниця',
            baseDefinition: { type: 'Стільниця', width: 500, height: 600, quantity: 1, kind: 'rect' } as any,
            joints: [], additions: []
          }
        ]
      }]
    };
    const details = flattenProductToDetails(product);
    expect(details).toHaveLength(3);
    const label = details[0].textureGroupLabel;
    expect(label).toBeDefined();
    expect(details[1].textureGroupLabel).toEqual(label);
    expect(details[2].textureGroupLabel).toEqual(label);
  });

  it('4. Дві незалежні деталі без стиків → різні лейбли, не склеєні', () => {
    const product: Product = {
      id: 'prod1',
      name: 'Product 1',
      elements: [{
        id: 'prod1/element:main1',
        type: 'Стільниця',
        baseDefinition: { type: 'Стільниця', width: 1000, height: 600, quantity: 1, kind: 'rect' } as any,
        joints: [],
        additions: [{
          id: 'prod1/element:main2',
          type: 'Стільниця',
          baseDefinition: { type: 'Стільниця', width: 1000, height: 600, quantity: 1, kind: 'rect' } as any,
          joints: [],
          additions: []
        }]
      }]
    };
    const details = flattenProductToDetails(product);
    expect(details).toHaveLength(2);
    expect(details[0].textureGroupLabel).toBeDefined();
    expect(details[1].textureGroupLabel).toBeDefined();
    expect(details[0].textureGroupLabel).not.toEqual(details[1].textureGroupLabel);
  });

  it('3.1. П-форма: єдиний елемент розрізається на сегменти, які успадковують один спільний textureGroupLabel', () => {
    // В реальності складна П-форма будується в інтерфейсі як єдиний елемент з kind: 'u'.
    // BFS бачить його як одну вершину і дає один textureGroupLabel.
    // Потім explodeDetails розрізає його на сегменти (parts), які всі мають зберегти цей спільний label,
    // що гарантує їх пакування поруч (waterfall).
    const product: Product = {
      id: 'prod_u',
      name: 'U-Shape Real',
      elements: [{
        id: 'element_u',
        type: 'Стільниця',
        baseDefinition: { type: 'Стільниця', width: 3000, height: 1000, quantity: 1, kind: 'u' } as any,
        joints: [],
        additions: [],
      }]
    };
    
    // 1. Побудова деталей (BFS)
    const details = flattenProductToDetails(product);
    expect(details).toHaveLength(1);
    const parentLabel = details[0].textureGroupLabel;
    expect(parentLabel).toBeDefined();

    // Щоб П-форма гарантовано розрізалася, у неї має бути wholeDetail: false
    details[0].geometry = details[0].geometry || {};
    details[0].geometry.wholeDetail = false;
    details[0].geometry.innerCutSide = 'bottom'; // стандартний напрямок розрізу для П-форми
    details[0].geometry.width = 3000;
    details[0].geometry.height = 1000;
    details[0].geometry.innerCutWidth = 1000;
    details[0].geometry.leftLegHeight = 1000;
    details[0].geometry.rightLegHeight = 1000;
    details[0].geometry.jointOmegaDirection = 'vertical';
    details[0].geometry.jointLambdaDirection = 'vertical';

    // 2. Розрізання геометрії
    // Імітуємо те, як працює explodeDetails для форми 'П-подібна'
    // Використаємо import, але щоб не тягнути складні залежності, можемо перевірити лише структуру, 
    // або зробити виклик оригінальної функції explodeDetails.
    // Для надійності викличемо explodeDetails
    const parts = explodeDetails(details);
    
    // П-форма розрізається на 3 сегменти
    expect(parts).toHaveLength(3);
    
    // Усі сегменти мають успадкувати батьківський textureGroupLabel
    parts.forEach((part: any) => {
      expect(part.textureGroupLabel).toBe(`${parentLabel}-0`);
    });
  });

  it('5. Деталі РІЗНИХ Елементів сходяться в один ключ групування нестингу', () => {
    // Головне питання власника: чи знає розкрій, що стінова панель і стільниця
    // стикуються. Ключ групування довго починався з `detailId`, тому деталі
    // різних Елементів не могли потрапити в одну групу в принципі — «Повна
    // текстура» розкидала їх по слябах.
    const product: Product = {
      id: 'prod_mix',
      name: 'Стільниця + панель + нога',
      elements: [{
        id: 'prod_mix/element:main',
        type: 'Стільниця',
        baseDefinition: { type: 'Стільниця', width: 2000, height: 600, quantity: 1, kind: 'rect' } as any,
        joints: [
          // панель тримає малюнок…
          { id: 'j1', origin: 'authored', dominant: 'a', type: 'butt', a: { elementPath: 'prod_mix/element:main', sideId: 'A', from: 0, to: 2000 }, b: { elementPath: 'prod_mix/element:panel', sideId: 'C', from: 0, to: 2000 }, textureContinuity: true },
          // …а нога під столом — ні
          { id: 'j2', origin: 'authored', dominant: 'a', type: 'butt', a: { elementPath: 'prod_mix/element:main', sideId: 'B', from: 0, to: 600 }, b: { elementPath: 'prod_mix/element:leg', sideId: 'A', from: 0, to: 600 }, textureContinuity: false },
        ],
        additions: [
          { id: 'prod_mix/element:panel', type: 'Стінова панель', baseDefinition: { type: 'Стінова панель', width: 2000, height: 400, quantity: 1, kind: 'rect' } as any, joints: [], additions: [] },
          { id: 'prod_mix/element:leg', type: 'Опора', baseDefinition: { type: 'Опора', width: 600, height: 800, quantity: 1, kind: 'rect' } as any, joints: [], additions: [] },
        ],
      }]
    };

    const details = flattenProductToDetails(product);
    const parts = explodeDetails(details);

    const keyOf = (name: string) => {
      const part = parts.find((p: any) => p.type === name);
      expect(part, `не знайдено парт для «${name}»`).toBeDefined();
      return textureGroupKey(part!);
    };

    // Різні Elements → різні detailId, але ключ має збігтися.
    const topKey = keyOf('Стільниця');
    const panelKey = keyOf('Стінова панель');
    const legKey = keyOf('Опора');

    expect(parts.find((p: any) => p.type === 'Стільниця')!.detailId)
      .not.toEqual(parts.find((p: any) => p.type === 'Стінова панель')!.detailId);
    expect(topKey).toEqual(panelKey);
    expect(legKey).not.toEqual(topKey);
  });
});
