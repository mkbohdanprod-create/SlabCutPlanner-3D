/**
 * СТОРОЖІ MES v0 (06.09.2026): згортання заявки за кодом (МЕС-1),
 * матеріали — не операції (МЕС-4), тотальність (МЕС-11), арифметика
 * часу (ТЗ §4.3–4.4) і шлях ВЦ-1.
 */
import { describe, it, expect } from 'vitest';
import { ORDERS } from '../data/orders';
import { CODE_AREA, areaOfCode } from '../data/codeArea';
import { DEFAULT_NORMS, DEFAULT_FUND, SIM_AREAS, cloneNorms, type Norms } from '../data/norms';
import { orderLoad, leadMinutes, simulate, unmappedLines, type Mix } from '../sim';

const byId = (id: string) => ORDERS.find((o) => o.id === id)!;
const allOn = (): Mix => Object.fromEntries(ORDERS.map((o) => [o.id, { on: true, n: 1 }]));

describe('MES v0 — дані', () => {
  it('п\'ять живих заявок, кожна 22–27 рядків, усі коди послуг мають ділянку', () => {
    expect(ORDERS.map((o) => o.id).sort()).toEqual(['81-1326953', '81-1419750', '81-1430086', '81-1750325', '81-2009298']);
    for (const o of ORDERS) {
      expect(o.lines.length).toBeGreaterThanOrEqual(22);
      expect(o.lines.length).toBeLessThanOrEqual(27);
      for (const l of o.lines) if (CODE_AREA[l.code]) expect(l.area).toBeTruthy();
    }
  });

  it('МЕС-4: без ділянки лишаються тільки матеріали (листи, м² листа, муфти, кріплення)', () => {
    for (const o of ORDERS) {
      for (const l of unmappedLines(o)) {
        expect(CODE_AREA[l.code]).toBeUndefined();
        expect(/кварцит|керамограніт|муфта|кріплення/i.test(l.name)).toBe(true);
      }
    }
  });

  it('мапа кодів: 214 кодів двох номенклатур; вода відділяється від пили за назвою', () => {
    expect(Object.keys(CODE_AREA).length).toBe(214);
    expect(areaOfCode('195663')).toBe('Пильний центр');
    expect(areaOfCode('195666')).toBe('Порізка водою');
    expect(areaOfCode('219995')).toBe('ЧПК фрезер');
    expect(areaOfCode('115929')).toBeNull();
  });

  it('81-1419750: пила збігається з бланком цеху (51,270 м.п.), вода — 0,954 м.п. + 13 шт', () => {
    const o = byId('81-1419750');
    const sum = (area: string, unit: string) => o.lines.filter((l) => l.area === area && l.unit === unit).reduce((s, l) => s + (l.qty ?? 0), 0);
    expect(sum('Пильний центр', 'м.п.')).toBeCloseTo(51.27, 3);
    expect(sum('Порізка водою', 'м.п.')).toBeCloseTo(0.954, 3);
    expect(sum('Порізка водою', 'шт')).toBe(13);
  });
});

describe('MES v0 — симулятор', () => {
  it('ТЗ §4.3: час ділянки = наладка + штучний × кількість', () => {
    const n = cloneNorms(DEFAULT_NORMS);
    const o = byId('81-1419750');
    const L = orderLoad(o, n);
    const saw = 51.27 * n['Пильний центр']['м.п.'] + n['Пильний центр'].setup;
    expect(L['Пильний центр']).toBeCloseTo(saw, 6);
    const water = 0.954 * n['Порізка водою']['м.п.'] + 13 * n['Порізка водою']['шт'] + n['Порізка водою'].setup;
    expect(L['Порізка водою']).toBeCloseTo(water, 6);
    expect(L['Мийки']).toBeUndefined(); // мийка замовника — ділянку обходить (ВЦ-3)
  });

  it('нульові норми → нуль часу; шлях ВЦ-1 не коротший за найдовшу ділянку', () => {
    const zero = cloneNorms(DEFAULT_NORMS);
    for (const a of SIM_AREAS) { zero[a].setup = 0; for (const u of ['м.п.', 'м²', 'шт', 'лист'] as const) zero[a][u] = 0; }
    expect(leadMinutes(orderLoad(byId('81-1430086'), zero))).toBe(0);
    const L = orderLoad(byId('81-1430086'), DEFAULT_NORMS);
    expect(leadMinutes(L)).toBeGreaterThanOrEqual(Math.max(...Object.values(L)));
    expect(leadMinutes(L)).toBeLessThanOrEqual(Object.values(L).reduce((s, v) => s + v, 0));
  });

  it('ТЗ §4.4: фонд = год × 60 × змін × одиниць × готовність; пропускна обмежена вузьким місцем', () => {
    const r = simulate(ORDERS, allOn(), DEFAULT_NORMS, DEFAULT_FUND);
    expect(r.fundMin['ЧПК фрезер']).toBeCloseTo(8 * 60 * 1 * 1 * 0.85, 6);
    expect(r.fundMin['Пильний центр']).toBeCloseTo(8 * 60 * 1 * 2 * 0.85, 6);
    expect(r.nOrders).toBe(5);
    const k = r.fundMin[r.bottleneck] / r.daily[r.bottleneck];
    expect(r.throughput).toBeCloseTo(k * 5, 6);
    // на умовних нормах вузьке місце — ЧПК: там найбільше рядків у кожній заявці
    expect(r.bottleneck).toBe('ЧПК фрезер');
  });

  it('друга NC300 (units 2) вдвічі знімає утилізацію ЧПК; вимкнене замовлення не рахується', () => {
    const base = simulate(ORDERS, allOn(), DEFAULT_NORMS, DEFAULT_FUND);
    const n2: Norms = cloneNorms(DEFAULT_NORMS); n2['ЧПК фрезер'].units = 2;
    const two = simulate(ORDERS, allOn(), n2, DEFAULT_FUND);
    expect(two.util['ЧПК фрезер']).toBeCloseTo(base.util['ЧПК фрезер'] / 2, 6);
    const mix = allOn(); mix['81-2009298'].on = false;
    const less = simulate(ORDERS, mix, DEFAULT_NORMS, DEFAULT_FUND);
    expect(less.nOrders).toBe(4);
    for (const a of SIM_AREAS) expect(less.daily[a]).toBeLessThanOrEqual(base.daily[a] + 1e-9);
  });
});
