import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { type EditorUISlice, createEditorUISlice } from './slices/editorUISlice';
import { type TextureSlice, createTextureSlice } from './slices/textureSlice';
import { type HistorySlice, createHistorySlice } from './slices/historySlice';
import { type PackingSlice, createPackingSlice } from './slices/packingSlice';
import { type ProjectSlice, createProjectSlice } from './slices/projectSlice';
import { type PricingSlice, createPricingSlice } from './slices/pricingSlice';

export interface ProjectState extends EditorUISlice, TextureSlice, HistorySlice, PackingSlice, ProjectSlice, PricingSlice {}

export const useProjectStore = create<ProjectState>()(immer((set, get, store) => ({
  ...createEditorUISlice(set, get, store),
  ...createTextureSlice(set, get, store),
  ...createHistorySlice(set, get, store),
  ...createPackingSlice(set, get, store),
  ...createProjectSlice(set, get, store),
  ...createPricingSlice(set, get, store),
})));
