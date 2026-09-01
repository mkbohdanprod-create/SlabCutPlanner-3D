import { describe, expect, it } from 'vitest';
import { occupiedEdgeSides, additionKindLabel } from '../edgeOccupancy';
import { copyEdgeTreatment } from '../edgeTreatment';
import { clickEdgeSideLetter, useEdgeSourceSide } from '../../store/useEdgeSourceSide';

/**
 * Зайняті торці і взірець (01.09): сторона з ногою/потовщенням/підворотом
 * не приймає кромку; клік по літері копіює обробку.
 */
describe('occupiedEdgeSides', () => {
  it('нога, потовщення і підворот закривають торець; бортик і панель — ні', () => {
    const out = occupiedEdgeSides({
      subDetails: { fold_A: {}, thickening_B: {}, leg_C: {}, skirting_D: {}, wall_panel_D: {} },
    });
    expect(out).toEqual({ A: 'Потовщення (A)', B: 'Підворот (B)', C: 'Нога (C)' });
  });

  it('друге доповнення на ребрі підписане #2; дуга і Г-заріз не рахуються', () => {
    const out = occupiedEdgeSides({ subDetails: { 'fold_A#2': {}, fold_B_radius: {}, leg_BC_lcut1: {} } });
    expect(out).toEqual({ A: 'Потовщення (A #2)' });
  });

  it('вкладені слоти належать власнику: для головної деталі їх не видно, для панелі — видно', () => {
    const subDetails = { wall_panel_B: {}, wall_panel_B_leg_C: {} };
    expect(occupiedEdgeSides({ subDetails })).toEqual({});
    expect(occupiedEdgeSides({ subDetails, ownerSlot: 'wall_panel_B' })).toEqual({ C: 'Нога (C)' });
  });

  it('легасі-галочки потовщення/підворота теж закривають сторони (лише в головної)', () => {
    const legacy = { fold: { enabled: true, sides: ['A', 'C'] }, thickening: { enabled: false, sides: ['B'] } };
    expect(occupiedEdgeSides({ legacy })).toEqual({ A: 'Потовщення (A)', C: 'Потовщення (C)' });
    expect(occupiedEdgeSides({ legacy, ownerSlot: 'leg_A' })).toEqual({});
  });

  it('підписи видів — як каже цех (fold = Потовщення, thickening = Підворот)', () => {
    expect(additionKindLabel('fold')).toBe('Потовщення');
    expect(additionKindLabel('thickening')).toBe('Підворот');
    expect(additionKindLabel('leg')).toBe('Нога');
  });
});

describe('copyEdgeTreatment', () => {
  it('копіює повний запис (обидва ребра, ділянку, ручне) — незалежною копією', () => {
    const src = { top: { profileId: 'r_3' }, bottom: { profileId: 'chamfer' }, linked: false, isFullLength: false, size: 300, align: 'right' as const, offset: 20, manualFinish: true };
    const next = copyEdgeTreatment({ A: src }, 'A', 'C');
    expect(next.C).toEqual(src);
    expect(next.C).not.toBe(src);
    expect((next.C as typeof src).top).not.toBe(src.top);
  });

  it('рядковий старий формат стає повним записом; порожній взірець прибирає кромку з цілі', () => {
    expect(copyEdgeTreatment({ A: 'r2_top' as never, B: 'zs_20' as never }, 'A', 'B').B).toEqual({ top: { profileId: 'r2_top' }, isFullLength: true });
    const cleared = copyEdgeTreatment({ B: { top: { profileId: 'r_3' } } }, 'A', 'B');
    expect(cleared.B).toBeUndefined();
  });

  it('сама на себе — без змін', () => {
    const profiles = { A: { top: { profileId: 'r_3' } } };
    expect(copyEdgeTreatment(profiles, 'A', 'A')).toEqual(profiles);
  });
});

describe('clickEdgeSideLetter', () => {
  it('перший клік — взірець, клік по іншій — копія, клік по взірцю — зняти; закрита сторона ігнорується', () => {
    useEdgeSourceSide.getState().clear();
    const applied: unknown[] = [];
    const profiles = { A: { top: { profileId: 'r_3' } } };
    const apply = (next: unknown) => applied.push(next);

    clickEdgeSideLetter({ side: 'A', scope: 'main', profiles, apply });
    expect(useEdgeSourceSide.getState()).toMatchObject({ side: 'A', scope: 'main' });
    expect(applied).toHaveLength(0);

    clickEdgeSideLetter({ side: 'B', scope: 'main', profiles, apply });
    expect(applied).toEqual([{ A: { top: { profileId: 'r_3' } }, B: { top: { profileId: 'r_3' } } }]);
    expect(useEdgeSourceSide.getState().side).toBe('A'); // взірець лишається — можна клацати далі

    clickEdgeSideLetter({ side: 'C', scope: 'main', locked: true, profiles, apply });
    expect(applied).toHaveLength(1);

    // інша деталь — взірець не діє, клік стає новим взірцем у її області
    clickEdgeSideLetter({ side: 'B', scope: 'leg_A', profiles, apply });
    expect(applied).toHaveLength(1);
    expect(useEdgeSourceSide.getState()).toMatchObject({ side: 'B', scope: 'leg_A' });

    clickEdgeSideLetter({ side: 'B', scope: 'leg_A', profiles, apply });
    expect(useEdgeSourceSide.getState().side).toBeNull();
  });
});
