import { set as idbSet } from 'idb-keyval';
import type { Project } from '../domain/types';
import { api } from '../lib/api';

export const STORAGE_KEY = 'slab_cut_planner_current_project';

let isSavingToIDB = false;

window.addEventListener('beforeunload', (e) => {
  if (isSavingToIDB) {
    e.preventDefault();
    e.returnValue = '';
  }
});

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const syncChannel = new BroadcastChannel('slabcutplanner-sync');

export async function persist(project: Project, dbProjectId?: string | null) {
  isSavingToIDB = true;
  try {
    const toSave = { ...project, schemaVersion: 1 };
    await idbSet(STORAGE_KEY, toSave);
    syncChannel.postMessage('sync');
  } catch (err) {
    console.warn("IndexedDB failed, falling back to localStorage", err);
    try {
      const toSaveLocal = { ...project, schemaVersion: 1 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSaveLocal));
      syncChannel.postMessage('sync');
    } catch (lsErr) {
      console.error("QuotaExceededError in localStorage fallback!", lsErr);
    }
  } finally {
    isSavingToIDB = false;
  }

  if (dbProjectId) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        // Бекенд сам перевіряє сесію (httpOnly-кука); 401 = не залогінені — мовчки пропускаємо
        await api.updateProject(dbProjectId, {
          data: project,
          name: project.orderNumber || 'Проект без назви',
        });
      } catch (err) {
        if (!String(err).includes('401')) console.error('Помилка збереження:', err);
      }
    }, 1000);
  }
}
