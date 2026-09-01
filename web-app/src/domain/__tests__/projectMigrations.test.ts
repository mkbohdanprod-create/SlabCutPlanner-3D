import { describe, expect, it } from 'vitest';
import {
  CURRENT_PROJECT_FORMAT_VERSION,
  migrateProject,
  projectFormatVersion,
  projectNeedsNewerApp,
} from '../projectMigrations';
import { createEmptyProject } from '../defaults';
import type { Project } from '../types';

describe('міграції формату проєкту', () => {
  it('файл БЕЗ поля версії — це версія 1 (усе, що до 28.08.2026)', () => {
    const legacy = { id: 'p1' } as Project;
    expect(projectFormatVersion(legacy)).toBe(1);
  });

  it('сміття в полі версії не ламає читання — рахується як 1', () => {
    expect(projectFormatVersion({ formatVersion: 'v2' } as unknown as Project)).toBe(1);
    expect(projectFormatVersion({ formatVersion: NaN } as unknown as Project)).toBe(1);
    expect(projectFormatVersion({ formatVersion: 0 } as unknown as Project)).toBe(1);
  });

  it('міграція доводить старий файл до поточної версії', () => {
    const legacy = createEmptyProject();
    delete (legacy as Partial<Project>).formatVersion;
    const migrated = migrateProject(legacy);
    expect(migrated.formatVersion).toBe(CURRENT_PROJECT_FORMAT_VERSION);
  });

  it('міграція ідемпотентна: другий прогін нічого не міняє', () => {
    const once = migrateProject(createEmptyProject());
    const twice = migrateProject(once);
    expect(twice).toEqual(once);
  });

  it('новий порожній проєкт народжується одразу з поточною версією', () => {
    expect(createEmptyProject().formatVersion).toBe(CURRENT_PROJECT_FORMAT_VERSION);
  });

  it('файл НОВІШОЇ програми не чіпається і не «знижується»', () => {
    const future = {
      ...createEmptyProject(),
      formatVersion: CURRENT_PROJECT_FORMAT_VERSION + 5,
      // невідоме нам поле з майбутнього — мусить вижити
      pocketsV9: [{ depth: 8 }],
    } as Project & { pocketsV9: unknown };

    const result = migrateProject(future) as typeof future;
    expect(result.formatVersion).toBe(CURRENT_PROJECT_FORMAT_VERSION + 5);
    expect(result.pocketsV9).toEqual([{ depth: 8 }]);
    expect(projectNeedsNewerApp(future)).toBe(true);
  });

  it('дані проєкту при міграції не губляться', () => {
    const legacy = {
      ...createEmptyProject(),
      orderNumber: '159-000001',
      customer: 'Тестовий клієнт',
    };
    delete (legacy as Partial<Project>).formatVersion;
    const migrated = migrateProject(legacy);
    expect(migrated.orderNumber).toBe('159-000001');
    expect(migrated.customer).toBe('Тестовий клієнт');
  });
});
