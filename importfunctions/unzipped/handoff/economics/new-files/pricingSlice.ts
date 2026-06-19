// =====================================================================
//  src/store/slices/pricingSlice.ts
//  Слайс стейту для комерційної пропозиції (Задача #3).
//  Дотримується точного патерну інших слайсів GitHub-версії:
//  StateCreator з immer + persist() після мутації.
// =====================================================================

import type { StateCreator } from 'zustand';
import type { ProjectState } from '../useProjectStore';
import type { CommercialQuoteSettings } from '../../domain/types';
import { persist } from '../persistence';

export interface PricingSlice {
  updateCommercialQuote: (patch: Partial<CommercialQuoteSettings>) => void;
}

export const createPricingSlice: StateCreator<
  ProjectState,
  [['zustand/immer', never]],
  [],
  PricingSlice
> = (set, get) => ({
  updateCommercialQuote: (patch) => {
    set((state) => {
      state.project.commercialQuote = {
        ...state.project.commercialQuote,
        ...patch,
      };
      state.project.updatedAt = new Date().toISOString();
    });
    persist(get().project, get().currentDbProjectId);
  },
});
