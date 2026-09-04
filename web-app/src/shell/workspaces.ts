import { lazy, type ComponentType } from 'react';
import { WORKSPACES, currentWorkspace, type WorkspaceId } from './capabilities';

/**
 * РЕЄСТР ДОЧОК — хто як вантажиться (03.09.2026).
 *
 * Кожна дочка — своя тека `src/workspaces/<id>` і свій динамічний імпорт:
 * у браузер їде лише та, яку відкрили. Сьогодні всі три віддають той самий
 * застосунок і відрізняються картою прав (`capabilities.ts`); коли в
 * Конструктора чи Архітектури з'являться власні екрани, вони лягають у
 * свою теку, і решта дочок їх не бачить і не вантажить.
 */
const loaders: Record<WorkspaceId, () => Promise<{ default: ComponentType }>> = {
  vs3d: () => import('../workspaces/vs3d'),
  constructor: () => import('../workspaces/constructor'),
  architecture: () => import('../workspaces/architecture'),
};

export function workspaceComponent(id: WorkspaceId = currentWorkspace().id) {
  return lazy(loaders[id]);
}

export { WORKSPACES, currentWorkspace };
