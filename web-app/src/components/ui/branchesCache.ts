import { api, type Branch } from '../../lib/api';

/**
 * Кеш довідника філій на весь застосунок.
 *
 * Винесено з BranchSelect.tsx окремим модулем: react-refresh не дозволяє
 * компонентному файлу експортувати щось, крім компонентів (fast refresh
 * ламається), а тест потребує способу скинути кеш між незалежними прогонами.
 */
let branchesPromise: Promise<Branch[]> | null = null;

export function loadBranchesOnce(): Promise<Branch[]> {
  if (!branchesPromise) {
    branchesPromise = api.listBranches().catch((error: unknown) => {
      branchesPromise = null; // невдалу спробу не кешуємо — наступний рендер повторить
      throw error;
    });
  }
  return branchesPromise;
}

/** Для тестів: скинути кеш довідника між незалежними прогонами */
export function resetBranchesCache() {
  branchesPromise = null;
}
