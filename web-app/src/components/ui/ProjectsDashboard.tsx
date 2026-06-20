import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useProjectStore } from '../../store/useProjectStore';
import { useAuth } from '../auth/AuthContext';
import { Folder, Plus, Trash2, X, Clock, Loader2 } from 'lucide-react';

type ProjectMetadata = {
  id: string;
  name: string;
  updated_at: string;
};

export function ProjectsDashboard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const importProject = useProjectStore((s) => s.importProject);
  const setCurrentDbProjectId = useProjectStore((s) => s.setCurrentDbProjectId);
  const clearCalculation = useProjectStore((s) => s.clearCalculation);
  // We explicitly do NOT subscribe to `project` or `currentDbProjectId` here, 
  // because we only need to read them on click events. Reading them via getState() 
  // inside handlers prevents the entire Dashboard from re-rendering every time the user moves a part in 3D.
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const fetchProjects = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, updated_at')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && user) {
      fetchProjects();
    }
  }, [isOpen, user]);

  const handleCreateNew = async () => {
    if (!user) return;
    setIsCreating(true);
    try {
      // Create an empty project from current default store state
      // We'll just generate a basic new project
      const newProjectName = `Нове замовлення ${new Date().toLocaleDateString('uk-UA')}`;
      
      // Get an empty project structure
      clearCalculation();
      const emptyProject = { ...useProjectStore.getState().project, orderNumber: newProjectName };

      const { data, error } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          name: newProjectName,
          data: emptyProject,
        })
        .select()
        .single();

      if (error) throw error;
      
      setCurrentDbProjectId(data.id);
      importProject(emptyProject);
      onClose();
    } catch (err) {
      console.error('Error creating project:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLoadProject = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('data')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      setCurrentDbProjectId(id);
      importProject(data.data);
      onClose();
    } catch (err) {
      console.error('Error loading project:', err);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Видалити цей проект?')) return;
    
    try {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
      setProjects((prev) => prev.filter((p) => p.id !== id));
      
      // If we deleted the currently active project, reset
      if (useProjectStore.getState().currentDbProjectId === id) {
        useProjectStore.getState().setCurrentDbProjectId(null);
      }
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-[#1c1e22] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2c3036] p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-900/30 p-2">
              <Folder className="h-6 w-6 text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Мої проекти</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-[#2c3036] hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <button
              onClick={handleCreateNew}
              disabled={isCreating}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#3a4049] bg-[#25272c] py-4 text-zinc-400 transition-colors hover:border-[var(--accent-color)] hover:bg-blue-900/20 hover:text-[var(--accent-color)]"
            >
              {isCreating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              <span className="font-medium">Створити новий проект</span>
            </button>
          </div>

          {isLoading ? (
            <div className="flex py-12 justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-color)]" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              У вас ще немає збережених проектів.
            </div>
          ) : (
            <div className="grid gap-3">
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleLoadProject(p.id)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-[#2c3036] bg-[#25272c] p-4 transition-all hover:border-[var(--accent-color)] hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <div className="rounded-lg bg-[#1c1e22] p-3">
                      <Folder className="h-6 w-6 text-slate-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{p.name || 'Проект без назви'}</h3>
                      <div className="flex items-center gap-1 text-sm text-zinc-500">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Змінено: {new Date(p.updated_at).toLocaleString('uk-UA')}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleDelete(p.id, e)}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Видалити"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
