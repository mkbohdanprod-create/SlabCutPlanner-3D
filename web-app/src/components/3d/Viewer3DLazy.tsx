import { lazy } from 'react';

export const Viewer3D = lazy(() => import('./Viewer3D').then(m => ({ default: m.Viewer3D })));
