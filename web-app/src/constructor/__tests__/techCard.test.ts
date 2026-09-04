/**
 * Тех карта і бланк цеху — МЕС-1 (згортка за видом і одиницею), Р1С-3
 * (косметика і пакування завжди, база Σ площ), ВЦ-16 (обпил 9,6 на лист),
 * Р1С-5 (порядок ділянок).
 */
import { describe, expect, it } from 'vitest';
import { buildTechCard, SHOP_AREAS } from '../docs/techCard';
import { buildMesJson } from '../docs/mesJson';
import type { EstimateResult } from '../../engines/estimate';
import type { Project } from '../../domain/types';

const project = { orderNumber: '81-0000001', customer: 'Тест', projectMaterial: 'Кварцит', projectThickness: 20, products: [{ name: 'Стільниця 1' }] } as unknown as Project;

const line = (serviceId: string, name: string, unit: 'm' | 'm2' | 'pcs', quantity: number, category: 'machine' | 'manual' | 'engineering' | 'material' = 'machine', externalId?: string) => ({
  serviceId, name, unit, quantity, unitPrice: 0, priceSource: 'none', total: 0, category, externalId, ruleIds: [], factKinds: [], detailIds: ['d1'], refs: [],
});

const estimate = {
  facts: [], groups: [], total: 0, missingServiceIds: [],
  factTotals: [
    { kind: 'detail_area', unit: 'm2', qty: 5.049, count: 1 },
    { kind: 'slabs_used', unit: 'pcs', qty: 2, count: 1 },
  ],
  lines: [
    line('EDGE_POLISH', 'Полірування прямого торця', 'm', 7.969, 'machine', '195681'),
    line('CUT_STRAIGHT', 'Прямий різ', 'm', 28.544, 'machine', '195660'),
    line('CUT_WATERJET', 'Криволінійна порізка водою', 'm', 0.954),
    line('CUTOUT_HOLE', 'Свердління отвору', 'pcs', 3),
    line('JOINT_SAWCUT', 'Пропил для стику', 'pcs', 2),
    line('MATERIAL_QUARTZ', 'Матеріал: Кварцит', 'm2', 5.049, 'material'),
    line('INSTALLATION', 'Монтаж', 'm2', 5.049, 'engineering'),
    line('UNKNOWN_X', 'Щось нове', 'pcs', 1),
  ],
} as unknown as EstimateResult;

describe('buildTechCard', () => {
  const card = buildTechCard(project, estimate);

  it('Р1С-5: ділянки йдуть у порядку потоку цеху', () => {
    const idx = card.sections.map((s) => SHOP_AREAS.indexOf(s.area));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(card.sections[0].area).toBe('Пильний центр');
    expect(card.sections[card.sections.length - 1].area).toBe('Косметика');
  });

  it('ВЦ-16: обпил = 9,6 × листів, першим у пильному центрі', () => {
    const saw = card.sections.find((s) => s.area === 'Пильний центр')!;
    expect(saw.ops[0]).toMatchObject({ serviceId: 'SLAB_TRIM', qty: 19.2, unit: 'м.п.' });
  });

  it('Р1С-3/ПС-1: косметика і пакування завжди, база — площа деталей', () => {
    const cos = card.sections.find((s) => s.area === 'Косметика')!;
    expect(cos.ops.map((o) => o.serviceId)).toEqual(['COSMETICS', 'PACKING']);
    expect(cos.ops[0].qty).toBe(5.049);
  });

  it('МЕС-1: полірування крайки падає у «Фрезування», пропили — у «Шліф./полір.» шт', () => {
    const mill = card.mes.find((r) => r.kind === 'Фрезування твердих матеріалів' && r.unit === 'м.п.');
    expect(mill?.qty).toBe(7.969);
    expect(mill?.sources).toContain('195681');
    const grind = card.mes.find((r) => r.kind === 'Шліфування / полірування водою' && r.unit === 'шт');
    expect(grind?.qty).toBe(2);
    const saw = card.mes.find((r) => r.kind === 'Порізка твердих матеріалів пилою' && r.unit === 'м.п.');
    expect(saw?.qty).toBeCloseTo(19.2 + 28.544, 3);
  });

  it('МЕС-4: матеріали окремо, монтаж не в цеху, невідома послуга — у «без ділянки»', () => {
    expect(card.materials.map((m) => m.serviceId)).toEqual(['MATERIAL_QUARTZ']);
    expect(card.unrouted.map((m) => m.serviceId)).toEqual(['UNKNOWN_X']);
    expect(JSON.stringify(card.sections)).not.toContain('INSTALLATION');
  });

  it('JSON для MES: маршрут як граф з ділянок, номери з джерелом, рішення verbatim', () => {
    const mes = buildMesJson(card, { decisions: [{ id: 'x', at: 't', tab: 'merge', what: 'w', why: 'y' }], hasMetal: true, hasPlywood: false, instructions: ['Кромку C не полірувати'] });
    expect(mes.route.nodes[0]).toBe('Пильний центр');
    expect(mes.route.edges.length).toBeGreaterThanOrEqual(mes.route.nodes.length - 1);
    expect(mes.order.numbers[0]).toMatchObject({ kind: 'order', value: '81-0000001' });
    expect(mes.related[0].kind).toBe('metal_frame');
    expect(mes.instructions).toEqual(['Кромку C не полірувати']);
    expect(mes.decisions[0].why).toBe('y');
  });
});
