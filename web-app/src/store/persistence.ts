import { get as idbGet, set as idbSet } from 'idb-keyval';
import type { Project } from '../domain/types';

export const STORAGE_KEY = 'slab_cut_planner_current_project';

let isSavingToIDB = false;

window.addEventListener('beforeunload', (e) => {
  if (isSavingToIDB) {
    e.preventDefault();
    e.returnValue = '';
  }
});

import { supabase } from '../lib/supabase';

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export async function persist(project: Project, dbProjectId?: string | null) {
  isSavingToIDB = true;
  try {
    const toSave = { ...project, schemaVersion: 1 };
    await idbSet(STORAGE_KEY, toSave);
  } catch (err) {
    console.warn("IndexedDB failed, falling back to localStorage", err);
    try {
      const toSaveLocal = { ...project, schemaVersion: 1 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSaveLocal));
    } catch (lsErr) {
      console.error("QuotaExceededError in localStorage fallback!", lsErr);
    }
  } finally {
    isSavingToIDB = false;
  }

  try {
    if (dbProjectId) {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        
        const { error } = await supabase.from('projects').update({
          data: project,
          name: project.orderNumber || 'Проект без назви',
          updated_at: new Date().toISOString()
        }).eq('id', dbProjectId);
        if (error) console.error('Помилка збереження:', error);
      }, 1000);
    }
  } catch (e) {
    // Supabase or auth might not be initialized
  }
}
