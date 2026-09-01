import { useEffect } from 'react';
import type { DefectZone, Project } from '../../../domain/types';
import { AUTO_DEFECT_PREFIX, cornerTriangle, inflateCornerCut, type SlabOutline } from '../../../engines/slabOutline';

/**
 * ЗРІЗ КУТА СТАЄ ДЕФЕКТОМ (27.08).
 *
 * Показати відкушений кут мало — розкрій має про нього ЗНАТИ, інакше
 * деталь спокійно ляже в порожнечу і поїде в цех. Дефектні зони рушій
 * уже вміє обходити, тому нічого нового вигадувати не треба: трикутник
 * зрізу записується у `slab.defects` звичайним полігональним дефектом.
 *
 * Два правила, щоб це не стало джерелом сюрпризів:
 *  · id детермінований (`auto_cut_<кут>`) — повторний аналіз того самого
 *    фото не плодить дублікати, а лише оновлює межу;
 *  · руками заведені дефекти не чіпаються ніколи — прибираються тільки
 *    авто-трикутники тих кутів, які перестали бути зрізаними (замінили
 *    фото на рівне).
 */
export function useAutoCornerDefects(
  project: Project,
  outlines: Record<string, SlabOutline | null>,
  updateSlab: (slabId: string, patch: { defects: DefectZone[] }) => void,
) {
  useEffect(() => {
    project.slabs.forEach((slab) => {
      const outline = outlines[slab.id];
      const manual = slab.defects.filter((defect) => !defect.id.startsWith(AUTO_DEFECT_PREFIX));
      const auto: DefectZone[] = (outline?.corners ?? []).map((cut) => {
        // Дефект іде з відступом: біля лінії розлому камінь ослаблений, і
        // ставити деталь упритул не можна. Той самий відступ малює пунктир
        // припуску, тому картинка і дані кажуть одне й те саме.
        const zone = inflateCornerCut(cut, slab.width, slab.height, slab.minMargin);
        const points = cornerTriangle(zone, slab.width, slab.height);
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        return {
          id: `${AUTO_DEFECT_PREFIX}${cut.corner}`,
          shapeType: 'polygon',
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
          points,
          comment: 'скол — визначено з фото листа',
        };
      });

      const next = [...manual, ...auto];
      // Пишемо тільки коли справді змінилось: інакше кожен рендер дошки
      // штовхав би проєкт у збереження і в історію.
      const same = next.length === slab.defects.length
        && next.every((defect, index) => {
          const before = slab.defects[index];
          return before && before.id === defect.id
            && Math.abs(before.width - defect.width) < 0.5
            && Math.abs(before.height - defect.height) < 0.5;
        });
      if (!same) updateSlab(slab.id, { defects: next });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlines, project.slabs.length]);
}
