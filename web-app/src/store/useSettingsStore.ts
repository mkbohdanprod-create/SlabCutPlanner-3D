import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SERVICE_CATALOG, type ServiceDefinition } from '../domain/services';

interface SettingsState {
  serviceCatalog: Record<string, ServiceDefinition>;
  updateService: (id: string, updates: Partial<ServiceDefinition>) => void;
  addService: (service: ServiceDefinition) => void;
  removeService: (id: string) => void;
  resetToDefault: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serviceCatalog: { ...DEFAULT_SERVICE_CATALOG },
      
      updateService: (id, updates) => set((state) => {
        if (!state.serviceCatalog[id]) return state;
        return {
          serviceCatalog: {
            ...state.serviceCatalog,
            [id]: { ...state.serviceCatalog[id], ...updates }
          }
        };
      }),
      
      addService: (service) => set((state) => ({
        serviceCatalog: {
          ...state.serviceCatalog,
          [service.id]: service
        }
      })),
      
      removeService: (id) => set((state) => {
        const newCatalog = { ...state.serviceCatalog };
        delete newCatalog[id];
        return { serviceCatalog: newCatalog };
      }),
      
      resetToDefault: () => set({ serviceCatalog: { ...DEFAULT_SERVICE_CATALOG } }),
    }),
    {
      name: 'slabcutplanner-settings-storage',
    }
  )
);