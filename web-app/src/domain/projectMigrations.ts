import type { Project } from './types';

/**
 * ВЕРСІЯ ФОРМАТУ ПРОЄКТУ І МІГРАЦІЇ (28.08.2026, перед торцями в 3D).
 *
 * До цього дня формат файла жив без номера: міграції існували
 * (fixLegJoints, retypeEdgeAdditions у projectHelpers), але були
 * анонімні — кожна пробігала на кожному відкритті і трималась на
 * власній ідемпотентності. Поки формат майже не мінявся, це сходило з
 * рук; перед торцями, кишенями і виходом у продакшн — уже ні.
 *
 * Правила, які фіксуємо назавжди:
 *
 *  1. Кожна ЗМІНА ФОРМАТУ (нове поле зі зміною змісту, перейменування,
 *     переїзд даних) — це +1 до CURRENT_PROJECT_FORMAT_VERSION і один
 *     запис у MIGRATIONS. Додавання необов'язкового поля, яке старий
 *     код спокійно ігнорує, версії не потребує.
 *  2. Міграція пише РІВНО один перехід (N-1 → N) і мусить бути чистою:
 *     жодних звернень до сторів, DOM чи мережі.
 *  3. Файл БЕЗ поля formatVersion — це версія 1 (усе, що створено до
 *     28.08.2026).
 *  4. Файл з версією ВИЩОЮ за нашу не чіпаємо і не «знижуємо»: він
 *     створений новішою програмою, його дані нам дорожчі за красу.
 *     Відкриваємо як є (невідомі поля проїдуть через spread і
 *     збережуться), у консоль — попередження.
 *
 * Старі анонімні міграції СВІДОМО лишаються в normalizeProject: вони
 * страхують від живих джерел старого формату і коштують копійки. Сюди
 * заводяться тільки нові переходи.
 */

export const CURRENT_PROJECT_FORMAT_VERSION = 2;

type Migration = {
  /** Версія, ЯКУ ця міграція виробляє. */
  to: number;
  /** Що сталося з форматом — рядок для людини і журналу. */
  note: string;
  run: (project: Project) => Project;
};

const MIGRATIONS: Migration[] = [
  {
    to: 2,
    note: 'Заведено сам номер версії. Даних не міняє.',
    run: (project) => project,
  },
  // Наступні переходи додаються сюди. Шаблон:
  // {
  //   to: 3,
  //   note: 'Кишені: поле pockets на деталі',
  //   run: (project) => ({ ...project, details: project.details.map(...) }),
  // },
];

/** Версія файла: відсутнє поле = 1 (усе, що до 28.08.2026). */
export function projectFormatVersion(project: Partial<Project>): number {
  const raw = (project as { formatVersion?: unknown }).formatVersion;
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

/** Файл створено новішою програмою, ніж ця. Для UI-попередження. */
export function projectNeedsNewerApp(project: Partial<Project>): boolean {
  return projectFormatVersion(project) > CURRENT_PROJECT_FORMAT_VERSION;
}

/**
 * Єдине гирло міграцій. Викликається з normalizeProject, тому накриває
 * всі шляхи відкриття: файл із диска, кабінет, IndexedDB при старті.
 */
export function migrateProject(project: Project): Project {
  const version = projectFormatVersion(project);

  if (version > CURRENT_PROJECT_FORMAT_VERSION) {
    console.warn(
      `Проєкт має формат v${version}, а програма знає v${CURRENT_PROJECT_FORMAT_VERSION}. ` +
      'Відкриваю як є, нічого не переписую — онови програму, щоб працювати з цим файлом повноцінно.',
    );
    return project;
  }

  let current = project;
  for (const migration of MIGRATIONS) {
    if (migration.to > version) {
      current = migration.run(current);
    }
  }
  return { ...current, formatVersion: CURRENT_PROJECT_FORMAT_VERSION };
}
