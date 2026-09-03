import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { type EditorUISlice, createEditorUISlice } from './slices/editorUISlice';
import { type TextureSlice, createTextureSlice } from './slices/textureSlice';
import { type HistorySlice, createHistorySlice } from './slices/historySlice';
import { type PackingSlice, createPackingSlice } from './slices/packingSlice';
import { type ProjectSlice, createProjectSlice } from './slices/projectSlice';

export interface ProjectState extends EditorUISlice, TextureSlice, HistorySlice, PackingSlice, ProjectSlice {}

export const useProjectStore = create<ProjectState>()(immer((set, get, store) => ({
  ...createEditorUISlice(set, get, store),
  ...createTextureSlice(set, get, store),
  ...createHistorySlice(set, get, store),
  ...createPackingSlice(set, get, store),
  ...createProjectSlice(set, get, store),
})));
