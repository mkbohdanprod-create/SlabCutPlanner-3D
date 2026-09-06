/**
 * Доступ до `project.architecture` з екранів архітектора.
 *
 * Модель лежить у проєкті поруч із виробами (одна пачка — рішення
 * власника 06.09), тож пишемо через `updateProject({ architecture })`,
 * як «Приміщення» пише `room`. Кожен запис — новий об'єкт: стор на immer,
 * а компоненти порівнюють посилання.
 */
import { useCallback, useMemo } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { emptyArchitecture, type ArchitectureModel, type Surface, type TileLayout } from '../../domain/architecture';

export function useArchitecture() {
  const stored = useProjectStore((s) => s.project.architecture);
  const model = useMemo<ArchitectureModel>(() => stored ?? emptyArchitecture(), [stored]);

  const write = useCallback((next: ArchitectureModel) => {
    useProjectStore.getState().updateProject({ architecture: next });
  }, []);

  const patch = useCallback((fn: (m: ArchitectureModel) => ArchitectureModel) => {
    const cur = useProjectStore.getState().project.architecture ?? emptyArchitecture();
    write(fn(cur));
  }, [write]);

  const upsertSurface = useCallback((surface: Surface) => patch((m) => ({
    ...m,
    surfaces: m.surfaces.some((s) => s.id === surface.id) ? m.surfaces.map((s) => (s.id === surface.id ? surface : s)) : [...m.surfaces, surface],
  })), [patch]);

  const removeSurface = useCallback((id: string) => patch((m) => ({
    ...m,
    surfaces: m.surfaces.filter((s) => s.id !== id && s.planEdge?.surfaceId !== id),
    layouts: m.layouts.filter((l) => l.surfaceId !== id && m.surfaces.some((s) => s.id === l.surfaceId && s.planEdge?.surfaceId !== id)),
  })), [patch]);

  const upsertLayout = useCallback((layout: TileLayout) => patch((m) => ({
    ...m,
    layouts: m.layouts.some((l) => l.id === layout.id) ? m.layouts.map((l) => (l.id === layout.id ? layout : l)) : [...m.layouts, layout],
  })), [patch]);

  const removeLayout = useCallback((id: string) => patch((m) => ({ ...m, layouts: m.layouts.filter((l) => l.id !== id) })), [patch]);

  return { model, write, patch, upsertSurface, removeSurface, upsertLayout, removeLayout };
}
