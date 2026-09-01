import type { SlabInstance } from '../../../domain/types';
import type { SlabOutline } from '../../../engines/slabOutline';
import { cornerTriangle, usableAreaPolygon } from '../../../engines/slabOutline';

/**
 * Аркуш слеба на дошці розкрою.
 *
 * Рамки навколо аркуша немає (27.08): лист — це предмет, його межа
 * читається за самим каменем і за пунктиром припуску. Обвідка робила з
 * фото каменю «картинку в рамочці».
 *
 * `outline` приходить із фото натурального каменю (див. engines/slabOutline):
 *  · у фоторежимі — обрізає знімок по справжній межі листа, щоб чорна
 *    порожнеча зі сколу не виглядала частиною каменю;
 *  · у технічному — показує зрізані кути штриховкою «сюди не класти».
 * Для рівних листів (керамограніт, кварцит) outline завжди null і нічого
 * не змінюється.
 */
export function SlabLayer({ slab, scale, viewMode, outline }: {
  slab: SlabInstance;
  scale: number;
  viewMode: 'technical' | 'photo' | 'texture';
  outline?: SlabOutline | null;
}) {
  const w = slab.width * scale;
  const h = slab.height * scale;
  const clipId = `slab-outline-${slab.id}`;
  const hasOutline = Boolean(outline?.polygon.length);

  return (
    <g>
      {hasOutline && (
        <clipPath id={clipId}>
          <polygon points={outline!.polygon.map((p) => `${p.x * w},${p.y * h}`).join(' ')} />
        </clipPath>
      )}

      <rect width={w} height={h} fill="#f3f7fa" rx={4} />

      {viewMode !== 'technical' && slab.photo && (
        <image
          href={slab.photo}
          x={slab.textureTransform.offsetX * scale}
          y={slab.textureTransform.offsetY * scale}
          width={w * slab.textureTransform.scale}
          height={h * slab.textureTransform.scale}
          opacity={slab.textureTransform.opacity}
          preserveAspectRatio="none"
          clipPath={hasOutline ? `url(#${clipId})` : undefined}
          transform={slab.textureTransform.rotation ? `rotate(${slab.textureTransform.rotation}, ${w / 2}, ${h / 2})` : undefined}
        />
      )}

      {/* Технічний вигляд: гіпотенуза попри крайню допустиму точку каменю.
          Штриховка означає «матеріалу тут немає», і той самий трикутник
          стоїть у дефектах слеба — тому розкрій у нього не кладе. */}
      {viewMode === 'technical' && outline?.corners.map((cut) => (
        <polygon
          key={cut.corner}
          className="slab-corner-cut"
          points={cornerTriangle(cut, slab.width, slab.height).map((p) => `${p.x * scale},${p.y * scale}`).join(' ')}
        />
      ))}

      {/* Припуск. Там, де лист відколотий, «корисна зона» не може лишатись
          прямокутною — інакше пунктир проходить по порожнечі. Тому для
          слеба зі сколами межа зрізається тими самими гіпотенузами,
          відсунутими всередину на мінімальний відступ. */}
      {outline?.corners.length ? (
        <polygon
          points={usableAreaPolygon(slab.width, slab.height, slab.minMargin, outline.corners)
            .map((p) => `${p.x * scale},${p.y * scale}`).join(' ')}
          fill="none"
          stroke="#94aab9"
          strokeDasharray="8 6"
        />
      ) : (
        <rect
          x={slab.minMargin * scale}
          y={slab.minMargin * scale}
          width={(slab.width - slab.minMargin * 2) * scale}
          height={(slab.height - slab.minMargin * 2) * scale}
          fill="none"
          stroke="#94aab9"
          strokeDasharray="8 6"
        />
      )}
    </g>
  );
}
