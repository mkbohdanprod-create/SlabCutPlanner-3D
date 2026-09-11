import { describe, it, expect } from 'vitest';
import { apsOrderFromEstimate, apsPayload } from '../apsExport';
import type { EstimateLine } from '../estimate';

/**
 * №173 — міст Студія → МЕС. Формат звірений з aps_engine.normalize_order
 * (smart-factory-mes): id обов'язковий, lines непорожній, одиниці
 * «м.п. / м² / шт / лист», матеріальні рядки з kind='material'.
 */

const line = (over: Partial<EstimateLine>): EstimateLine => ({
  serviceId: 'svc',
  name: 'Послуга',
  unit: 'm',
  quantity: 1,
  unitPrice: 0,
  priceSource: 'none',
  total: 0,
  category: 'machine',
  ruleIds: [],
  factKinds: [],
  detailIds: [],
  refs: [],
  ...over,
});

describe('№173 · пакет mes-aps-1 зі Студії', () => {
  it('збирає рядки з кодами 1С і перекладає одиниці', () => {
    const order = apsOrderFromEstimate('81-0000001', 'тест', [
      line({ serviceId: 'cut', name: 'Прямолінійна порізка', unit: 'm', quantity: 31.1234, externalId: '195300' }),
      line({ serviceId: 'calib', name: 'Калібрування', unit: 'm2', quantity: 0.63, externalId: '242499' }),
      line({ serviceId: 'hole', name: 'Отвір', unit: 'pcs', quantity: 3, externalId: '195310' }),
    ]);
    expect(order.id).toBe('81-0000001');
    expect(order.source).toBe('VS3D Studio');
    expect(order.lines).toEqual([
      { code: '195300', name: 'Прямолінійна порізка', unit: 'м.п.', qty: 31.123, sourceRow: 1 },
      { code: '242499', name: 'Калібрування', unit: 'м²', qty: 0.63, sourceRow: 2 },
      { code: '195310', name: 'Отвір', unit: 'шт', qty: 3, sourceRow: 3 },
    ]);
  });

  it('матеріал їде з kind=material, нульові кількості не їдуть, код без 1С — порожній рядок, не викинутий', () => {
    const order = apsOrderFromEstimate(' 81-1430086 ', 'тест', [
      line({ serviceId: 'sheet', name: 'Керамограніт 12 мм', unit: 'pcs', quantity: 2, category: 'material', externalId: '214733' }),
      line({ serviceId: 'zero', name: 'Порожній', quantity: 0, externalId: '195300' }),
      line({ serviceId: 'local', name: 'Послуга філії без коду', unit: 'm', quantity: 1.5 }),
    ]);
    expect(order.id).toBe('81-1430086');
    expect(order.lines).toHaveLength(2);
    expect(order.lines[0]).toMatchObject({ code: '214733', kind: 'material', unit: 'шт' });
    expect(order.lines[1]).toMatchObject({ code: '', name: 'Послуга філії без коду', qty: 1.5 });
  });

  it('без номера замовлення і без рядків — чесна помилка ще до МЕС', () => {
    expect(() => apsOrderFromEstimate('  ', 'тест', [line({})])).toThrow(/номер замовлення/);
    expect(() => apsOrderFromEstimate('81-1', 'тест', [line({ quantity: 0 })])).toThrow(/жодного рядка/);
  });

  it('конверт пакета — schemaVersion mes-aps-1, масив orders', () => {
    const order = apsOrderFromEstimate('81-2', 'тест', [line({ externalId: '195300' })]);
    expect(apsPayload(order)).toEqual({ schemaVersion: 'mes-aps-1', orders: [order] });
  });
});
