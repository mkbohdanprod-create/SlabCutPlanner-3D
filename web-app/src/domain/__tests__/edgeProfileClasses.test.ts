import { describe, expect, it } from 'vitest';
import { referenceData } from '../defaults';
import {
  EDGE_PROFILE_CLASSES,
  edgeProfileClass,
  edgeProfileFitsMaterial,
  edgeProfileHint,
  groupEdgeProfiles,
} from '../edgeProfileClasses';

const profiles = referenceData.edgeProfiles ?? [];
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe('класифікація кромок по матеріалу і виконанню (01.09)', () => {
  it('кожен профіль довідника має клас, і жоден клас не висить без профілю', () => {
    const known = new Set(profiles.map((p) => p.id));
    const missing = profiles.filter((p) => !EDGE_PROFILE_CLASSES[p.id]).map((p) => p.id);
    const orphans = Object.keys(EDGE_PROFILE_CLASSES).filter((id) => !known.has(id));
    expect(missing).toEqual([]);
    expect(orphans).toEqual([]);
  });

  it('серія 12 — керамограніт, борт 40 — кварцит лише з потовщенням, натуралка йде поруч із кварцитом', () => {
    expect(edgeProfileFitsMaterial('zs_12', 'Керамограніт')).toBe(true);
    expect(edgeProfileFitsMaterial('zs_12', 'Кварцит')).toBe(false);
    expect(edgeProfileClass('lv_40').execution).toBe('buildup');
    expect(edgeProfileFitsMaterial('lv_40', 'Натуральний камінь')).toBe(true);
    expect(edgeProfileFitsMaterial('lv_40', 'Акрил')).toBe(false);
    // AR20 / ZS20 — прайс знає на обох матеріалах
    expect(edgeProfileFitsMaterial('ar_20', 'Керамограніт')).toBe(true);
    // універсальні й порожній матеріал — завжди підходять
    expect(edgeProfileFitsMaterial('chamfer_2x2', 'Акрил')).toBe(true);
    expect(edgeProfileFitsMaterial('h_40', null)).toBe(true);
    // невідомий id (доданий руками) — універсальна форма
    expect(edgeProfileClass('custom_xyz')).toEqual({ execution: 'base', kind: 'form' });
  });

  it('групи для кварциту: універсальні → у товщині → з потовщенням → операції → інші → спадок', () => {
    const groups = groupEdgeProfiles(profiles, 'Кварцит');
    expect(groups.map((g) => g.key)).toEqual(['universal', 'base', 'buildup', 'operations', 'other', 'legacy']);
    const byKey = Object.fromEntries(groups.map((g) => [g.key, ids(g.profiles)]));
    expect(byKey.universal).toEqual(['polished_straight', 'chamfer_2x2', 'chamfer_2x2_top_bottom', 'r2_top', 'r2_top_bottom', 'tech_chamfer']);
    expect(byKey.base).toEqual(['ar_20', 'd_20', 'r_10', 'r_3', 'r_5', 't_20', 'xd_20', 'zs_20', 'l_20']);
    expect(byKey.buildup).toEqual(['h_40', 'lv_40', 'lv_40_inv', 'o_40', 'u_40']);
    expect(byKey.operations).toEqual(['z_20', 'edge_45', 'antik']);
    expect(byKey.legacy).toEqual(['chamfer_45_r2', 'chamfered_edge', 'half_bullnose', 'full_bullnose', 'sharknose', 'straight_edge']);
    // інші матеріали: спершу керамограніт, потім акрил; жодного кварцитного
    expect(byKey.other[0]).toBe('d_12');
    expect(byKey.other.at(-1)).toBe('acr_classic2');
    expect(byKey.other).toContain('z_12');
    expect(byKey.other).not.toContain('zs_20');
    // нічого не загубилось і не подвоїлось
    const all = groups.flatMap((g) => ids(g.profiles));
    expect(all.length).toBe(profiles.length);
    expect(new Set(all).size).toBe(profiles.length);
  });

  it('натуральний камінь отримує кварцитні форми (гіпотеза «як кварцит 20»)', () => {
    const groups = groupEdgeProfiles(profiles, 'Натуральний камінь');
    const base = groups.find((g) => g.key === 'base')!;
    expect(base.label).toBe('Натуральний камінь — у товщині плити');
    expect(ids(base.profiles)).toContain('r_3');
    expect(ids(groups.find((g) => g.key === 'buildup')!.profiles)).toContain('u_40');
  });

  it('без матеріалу — окремі групи по кожному матеріалу в порядку кераміка → кварцит → акрил', () => {
    const groups = groupEdgeProfiles(profiles, null);
    expect(groups.map((g) => g.label)).toEqual([
      'Універсальні',
      'Керамограніт — у товщині плити',
      'Кварцит — у товщині плити',
      'Кварцит — лише з потовщенням (зрощення плит)',
      'Акрил — у товщині плити',
      'Акрил — лише з потовщенням (зрощення плит)',
      'Операції торця (не форма)',
      'Спадок — у каталозі цеху нема',
    ]);
    expect(groups.flatMap((g) => g.profiles).length).toBe(profiles.length);
  });

  it('керамограніт: серія 12 угорі, а кварцитний борт 40 — в «інших»', () => {
    const groups = groupEdgeProfiles(profiles, 'Керамограніт');
    const byKey = Object.fromEntries(groups.map((g) => [g.key, ids(g.profiles)]));
    expect(byKey.base).toEqual(['d_12', 'ar_12', 't_12', 'zs_12', 'zs_4', 'zs_6_15', 'zs_6_3', 'ar_20', 'zs_20', 'zr_12']);
    expect(byKey.buildup).toBeUndefined();
    expect(byKey.other).toContain('lv_40');
    expect(byKey.operations).toEqual(['z_12', 'edge_45']);
  });

  it('підказка називає матеріали, спосіб виконання і як робиться', () => {
    expect(edgeProfileHint('lv_40')).toContain('Кварцит, Натуральний камінь');
    expect(edgeProfileHint('lv_40')).toContain('лише з потовщенням');
    expect(edgeProfileHint('lv_40')).toContain('дві плити 20');
    expect(edgeProfileHint('antik')).toContain('операція');
    expect(edgeProfileHint('sharknose')).toContain('спадок');
    expect(edgeProfileHint('chamfer_2x2')).toContain('універсальна');
  });
});
