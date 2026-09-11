import { describe, it, expect } from 'vitest';
import { crc32, zipStore, buildOrderJson, buildMesPack, type MesPackInput } from '../mesPack';
import type { Project } from '../../domain/types';

/**
 * №174 — «Зберегти для МЕС»: пакет vs3d-pack-1 одним ZIP.
 * Домовленості з МЕС (docs/VS3D_HANDOFF_2026-09-10.md): null для
 * невідомого (не нуль), дефекти з kind/safetyMarginMm = null поки полів
 * немає, дзеркальність прапорцем, GLB відсутній і записаний у missing.
 */

const project = {
  id: 'p1',
  orderNumber: ' 81-0000042 ',
  customer: 'Тест',
  uiLanguage: 'uk',
  textureSelectionEnabled: false,
  slabTypes: [],
  slabs: [
    {
      id: 'slab-a',
      width: 3200,
      height: 1600,
      thickness: 20,
      material: 'Кварцит',
      decor: 'Vanilla Noir',
      comment: '',
      minMargin: 10,
      serialNumber: 'SN-7',
      article: '214733',
      textureTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 1 },
      defects: [
        { id: 'dz1', shapeType: 'rect', x: 100, y: 200, width: 60, height: 40, comment: 'скол на краю' },
      ],
    },
  ],
  products: [],
  details: [],
  placements: [
    {
      id: 'plc1', slabId: 'slab-a', partId: 'part-x', x: 12.3456, y: 7,
      rotation: 90, mirror: true, manualLocked: false,
    },
  ],
  textureLayouts: [],
  textureFrames: [],
  manualDimensions: [],
  calculationStatus: 'ok',
  unplacedPartIds: [],
  referenceData: { materials: [], detailTypes: [], detailShapes: [], slabSizes: [], thicknesses: [], serviceParams: { defaultMinMargin: 10, roundingDecimals: 3, sawOvercut: 70 }, edgeProfiles: [] },
  versions: [{ id: 'v1', timestamp: 't', note: 'створено' }, { id: 'v2', timestamp: 't', note: 'правка' }],
  updatedAt: 'now',
} as unknown as Project;

const parts = [
  {
    id: 'part-x', detailId: 'det-1', name: 'Стільниця.1', type: 'Стільниця',
    shape: 'Прямокутна', width: 1200, height: 600, rotation: 0, area: 0.72,
    points: [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 600 }, { x: 0, y: 600 }],
    isMain: true, thickness: 20, parentLabel: 'Виріб', dimsLabel: '1200×600',
  },
] as unknown as MesPackInput['parts'];

const input: MesPackInput = { project, parts, details: [], estimateLines: [] };

describe('№174 · zip-письменник', () => {
  it('CRC32 відповідає еталонному вектору', () => {
    // Класичний перевірочний вектор CRC-32: "123456789" → 0xCBF43926.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('архів має правильні сигнатури і читається назад', () => {
    const data = new TextEncoder().encode('вміст файлу');
    const zip = zipStore([{ path: 'папка/файл.json', data }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // local header
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50); // EOCD
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(1); // кількість записів
    // Дані лежать одразу за заголовком і не зіпсовані (метод STORE).
    const nameLength = view.getUint16(26, true);
    const stored = zip.slice(30 + nameLength, 30 + nameLength + data.length);
    expect(new TextDecoder().decode(stored)).toBe('вміст файлу');
  });
});

describe('№174 · order.json для МЕС', () => {
  it('дефекти їдуть як є, kind і safetyMarginMm — чесний null, дзеркальність прапорцем', () => {
    const order = buildOrderJson(input, {}) as {
      slabs: Array<{ serialNumber: string; defects: Array<Record<string, unknown>> }>;
      placements: Array<Record<string, unknown>>;
    };
    expect(order.slabs[0].serialNumber).toBe('SN-7');
    expect(order.slabs[0].defects[0]).toMatchObject({
      defectId: 'dz1', xMm: 100, yMm: 200, kind: null, safetyMarginMm: null,
    });
    expect(order.placements[0]).toMatchObject({
      placementId: 'plc1', slabId: 'slab-a', xMm: 12.346, rotationDeg: 90, mirror: true,
    });
    const withParts = order as unknown as { parts: Array<Record<string, unknown>> };
    // partId — тип заготовки, instanceId — конкретна; placements.partId вказує на instanceId.
    expect(withParts.parts[0]).toMatchObject({ instanceId: 'part-x', partId: 'det-1', detailId: 'det-1', isMain: true, thicknessMm: 20 });
  });

  it('повний пакет: project/order/manifest усередині, GLB чесно в missing, номер обрізаний', async () => {
    const result = await buildMesPack(input);
    expect(result.fileName).toBe('order_81-0000042_v2.zip');
    const text = new TextDecoder('utf-8', { fatal: false }).decode(result.zip);
    expect(text).toContain('project.json');
    expect(text).toContain('order.json');
    expect(text).toContain('manifest.json');
    expect(text).toContain('vs3d-pack-1');
    // Чого в пакеті немає — сказано в manifest.missing, а не замовчано.
    expect(text).toContain('models/*.glb');
  });

  it('авто-скол із фото: kind=chip, відступ уже в контурі, походження назване', () => {
    const withAuto = {
      ...input,
      project: {
        ...project,
        slabs: [{ ...project.slabs[0], minMargin: 15, defects: [
          { id: 'auto_cut_TL', shapeType: 'polygon', x: 0, y: 0, width: 120, height: 90, comment: 'скол — визначено з фото листа' },
          { id: 'dz-hand', shapeType: 'rect', x: 500, y: 500, width: 40, height: 40 },
        ] }],
      } as unknown as Project,
    };
    const order = buildOrderJson(withAuto, {}) as { slabs: Array<{ defects: Array<Record<string, unknown>> }> };
    expect(order.slabs[0].defects[0]).toMatchObject({
      defectId: 'auto_cut_TL', kind: 'chip', safetyMarginMm: 15, safetyMarginApplied: true,
      isDemo: false, origin: 'auto:slab-photo-outline', verified: false,
    });
    // Ручний дефект типу не вигадуємо — його заводила людина без класифікації.
    expect(order.slabs[0].defects[1]).toMatchObject({ kind: null, safetyMarginMm: null, origin: 'manual' });
  });

  it('порожні коди 1С і зламаний розкрій — blocker-и з поясненням, а не тиша', () => {
    const broken = {
      ...input,
      project: { ...project, calculationStatus: 'manual_conflict', unplacedPartIds: ['p1'] } as unknown as Project,
      estimateLines: [
        { serviceId: 'CUT_STRAIGHT', name: 'Прямий різ', unit: 'm', quantity: 3, unitPrice: 0, priceSource: 'none', total: 0, category: 'machine', ruleIds: [], factKinds: [], detailIds: [], refs: [] },
      ] as unknown as MesPackInput['estimateLines'],
    };
    const order = buildOrderJson(broken, {}) as { issues: Array<{ code: string; severity: string }>; readyForRun: boolean; serviceMap: { viyarCodesEnabled: boolean; rules: unknown[] } };
    expect(order.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['no-1c-codes', 'calculation-not-ok']));
    expect(order.issues.every((issue) => issue.severity !== 'blocker')).toBe(false);
    expect(order.readyForRun).toBe(false);
    // Таблиця serviceId → код 1С їде навіть коли прив'язки вимкнені.
    expect(order.serviceMap.viyarCodesEnabled).toBe(false);
    expect(order.serviceMap.rules.length).toBeGreaterThan(20);
  });

  it('extraFiles потрапляють у ZIP, а їхній purpose — у manifest', async () => {
    const result = await buildMesPack({
      ...input,
      extraFiles: [
        { path: 'docs/Пакет_цеху.pdf', data: new Uint8Array([0x25, 0x50, 0x44, 0x46]), purpose: 'набір креслень + тех карта + бланк цеху' },
      ],
    });
    const text = new TextDecoder('utf-8', { fatal: false }).decode(result.zip);
    expect(text).toContain('docs/Пакет_цеху.pdf');
    expect(text).toContain('набір креслень + тех карта + бланк цеху');
    // Коли документи додані, manifest не скаржиться на їхню відсутність.
    expect(text).not.toContain('документи пакета для цеху не додані');
  });

  it('без номера замовлення — помилка ще до збирання', async () => {
    const broken = { ...input, project: { ...project, orderNumber: '  ' } as Project };
    await expect(buildMesPack(broken)).rejects.toThrow(/номер замовлення/);
  });
});
