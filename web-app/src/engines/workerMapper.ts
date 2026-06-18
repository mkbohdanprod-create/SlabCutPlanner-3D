import type { Project } from '../domain/types';

/**
 * Creates a lean copy of the project suitable for structuredClone and Web Worker transfer.
 * Strips out heavy base64 images and irrelevant UI-only states.
 */
export function stripBase64(project: Project): Project {
  // We do a shallow copy where possible, and map over arrays that need cleaning
  return {
    ...project,
    // Remove heavy photo data from slabs
    slabs: project.slabs.map(slab => {
      const { photo, ...leanSlab } = slab;
      return leanSlab;
    }),
    
    // Texture layouts and frames are not used by geometry/packing engine
    textureLayouts: [],
    textureFrames: [],
  };
}
