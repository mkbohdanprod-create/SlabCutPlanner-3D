import { describe, it, expect } from 'vitest';
import { EDGE_KIND_LABEL, edgeKindByLabel } from '../ids';
import { normalizeProject } from '../../store/projectHelpers';
import type { Project } from '../types';

/**
 * НАЗВИ ДВОХ КРАЙОВИХ ДОПОВНЕНЬ (виправлено 10.08 власником).
 *
 * Небезпека тут не «зламається», а «тихо поміняється місцями»: код і цех
 * говорять різними словами (`fold` = «Потовщення», `thickening` =
 * «Підворот»), і будь-хто, хто напише літерал «на око», переплутає їх
 * удруге. Тест фіксує саму угоду і перевіряє, що старі збережені проєкти
 * переіменовуються при відкритті.
 */

describe('угода назв крайових доповнень', () => {
  it('код fold — це «Потовщення» (заусовка 45°), thickening — «Підворот» (підклейка)', () => {
    expect(EDGE_KIND_LABEL.fold).toBe('Потовщення');
    expect(EDGE_KIND_LABEL.thickening).toBe('Підворот');
  });

  it('читання підпису назад у код — дзеркальне', () => {
    expect(edgeKindByLabel('Потовщення')).toBe('fold');
    expect(edgeKindByLabel('Підворот')).toBe('thickening');
    expect(edgeKindByLabel('Стільниця')).toBeUndefined();
    expect(edgeKindByLabel(undefined)).toBeUndefined();
  });

  it('назви не збігаються — інакше мапа туди-назад беззмістовна', () => {
    expect(EDGE_KIND_LABEL.fold).not.toBe(EDGE_KIND_LABEL.thickening);
  });
});

describe('міграція збережених проєктів', () => {
  const projectWith = (elements: unknown[]) => ({
    products: [{ id: 'prod_1', name: 'Виріб', elements }],
  } as unknown as Project);

  it('старий підпис на слоті fold_ перейменовується на новий', () => {
    const migrated = normalizeProject(projectWith([{
      id: 'prod_1/element:main',
      type: 'Стільниця',
      joints: [],
      additions: [
        { id: 'prod_1/element:fold_C', type: 'Підворот', baseDefinition: { type: 'Підворот' }, additions: [], joints: [] },
        { id: 'prod_1/element:thickening_B', type: 'Потовщення', baseDefinition: { type: 'Потовщення' }, additions: [], joints: [] },
      ],
    }]));

    const additions = migrated.products![0].elements[0].additions as Array<{ id: string; type: string; baseDefinition: { type: string } }>;
    expect(additions[0].type).toBe('Потовщення');
    expect(additions[0].baseDefinition.type).toBe('Потовщення');
    expect(additions[1].type).toBe('Підворот');
    expect(additions[1].baseDefinition.type).toBe('Підворот');
  });

  it('джерело істини — слот, тому міграція ідемпотентна', () => {
    const once = normalizeProject(projectWith([{
      id: 'prod_1/element:main', type: 'Стільниця', joints: [],
      additions: [{ id: 'prod_1/element:fold_C', type: 'Підворот', additions: [], joints: [] }],
    }]));
    const twice = normalizeProject(once);
    expect((twice.products![0].elements[0].additions[0] as { type: string }).type).toBe('Потовщення');
  });

  it('вкладені доповнення (підворот ноги) теж переіменовуються', () => {
    const migrated = normalizeProject(projectWith([{
      id: 'prod_1/element:leg_B', type: 'Опора', joints: [],
      additions: [{ id: 'prod_1/element:leg_B_fold_C', type: 'Підворот', additions: [], joints: [] }],
    }]));
    const nested = migrated.products![0].elements[0].additions[0] as { type: string };
    expect(nested.type).toBe('Потовщення');
  });

  it('елементи, що не є крайовими доповненнями, не чіпаються', () => {
    const migrated = normalizeProject(projectWith([{
      id: 'prod_1/element:main', type: 'Стільниця', joints: [],
      additions: [{ id: 'prod_1/element:skirting_A', type: 'Бортик', additions: [], joints: [] }],
    }]));
    expect(migrated.products![0].elements[0].type).toBe('Стільниця');
    expect((migrated.products![0].elements[0].additions[0] as { type: string }).type).toBe('Бортик');
  });
});
