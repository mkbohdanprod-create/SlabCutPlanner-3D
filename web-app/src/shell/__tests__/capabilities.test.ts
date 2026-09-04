// =====================================================================
//  Сторож карти прав (03.09.2026): що бачить менеджер у VS3D, що
//  технолог у Конструкторі, і що ПІН відкриває там, де відкривав.
// =====================================================================

import { describe, it, expect } from 'vitest';
import { can, WORKSPACES, workspaceIdFromLocation, type Capability } from '../capabilities';

const ALL: Capability[] = [
  'metal', 'estimate', 'allowances', 'importDxf', 'importSketchup', 'importApproval',
  'legacyDetails', 'detailPassport', 'preview3d', 'serviceDialog', 'prototypes',
  'priceSettings', 'productTemplates', 'room',
];

describe('карта прав дочок', () => {
  it('менеджер у VS3D без ПІНа не бачить інструментів технолога і наших', () => {
    const vs3d = WORKSPACES.vs3d;
    for (const cap of ['metal', 'estimate', 'allowances', 'importDxf', 'importSketchup', 'legacyDetails', 'preview3d', 'serviceDialog', 'prototypes', 'priceSettings', 'productTemplates'] as Capability[]) {
      expect(can(cap, false, vs3d), cap).toBe(false);
    }
  });

  it('ПІН у VS3D відкриває все, що відкривав до розділення', () => {
    const vs3d = WORKSPACES.vs3d;
    for (const cap of ALL) expect(can(cap, true, vs3d), cap).toBe(true);
  });

  it('технолог у Конструкторі має свої інструменти без ПІНа — і не має цін', () => {
    const c = WORKSPACES.constructor;
    for (const cap of ['metal', 'estimate', 'allowances', 'importDxf', 'importSketchup', 'legacyDetails', 'detailPassport', 'preview3d'] as Capability[]) {
      expect(can(cap, false, c), cap).toBe(true);
    }
    // Гроші лишаються в продажу (візія Конструктора §7) — навіть за ПІНом.
    expect(can('priceSettings', false, c)).toBe(false);
    expect(can('priceSettings', true, c)).toBe(false);
    // Наші інструменти — лише за ПІНом.
    expect(can('serviceDialog', false, c)).toBe(false);
    expect(can('serviceDialog', true, c)).toBe(true);
  });

  it('Архітектура заведена і має Приміщення', () => {
    expect(can('room', false, WORKSPACES.architecture)).toBe(true);
    expect(can('metal', false, WORKSPACES.architecture)).toBe(false);
  });

  it('вхід ?workspace=: невідоме або порожнє → vs3d', () => {
    expect(workspaceIdFromLocation('')).toBe('vs3d');
    expect(workspaceIdFromLocation('?desktop=1')).toBe('vs3d');
    expect(workspaceIdFromLocation('?workspace=constructor')).toBe('constructor');
    expect(workspaceIdFromLocation('?workspace=architecture&desktop=1')).toBe('architecture');
    expect(workspaceIdFromLocation('?workspace=hacker')).toBe('vs3d');
  });
});
