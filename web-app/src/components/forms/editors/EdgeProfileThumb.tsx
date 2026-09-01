import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { edgeProfileDrawing, edgeProfileDrawingUrl } from '../../../domain/edgeProfileDrawings';
import { edgeProfileClass } from '../../../domain/edgeProfileClasses';
import { useProjectStore } from '../../../store/useProjectStore';

/**
 * Мініатюра профілю торця — справжній розріз із каталогу цеху (вектор), а не
 * умовна піктограма. Для профілів без креслення (стик Z, «Антик», спадок)
 * — штрихована плита без форми, щоб місце не пустувало.
 *
 * Навів і потримав (01.09, власник) — поруч спливає велике зображення:
 * розріз у 4–5 разів більший, код, назва, форма словами. Малюється через
 * портал у body, бо панелі властивостей обрізають усе, що вилазить за
 * їхній overflow.
 */
const HOVER_DELAY_MS = 180;
const PREVIEW_W = 340;

export function EdgeProfileThumb({
  profileId,
  height = 32,
  className = '',
  title,
  preview = true,
}: {
  profileId?: string | null;
  /** Висота в px; ширина — за пропорцією креслення. */
  height?: number;
  className?: string;
  title?: string;
  /** Показувати велике зображення при наведенні. */
  preview?: boolean;
}) {
  const drawing = profileId ? edgeProfileDrawing(profileId) : undefined;
  const url = profileId ? edgeProfileDrawingUrl(profileId) : undefined;
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const show = () => {
    if (!preview || !drawing || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      // праворуч від мініатюри; коли не влазить — ліворуч
      const x = rect.right + 12 + PREVIEW_W > window.innerWidth ? rect.left - 12 - PREVIEW_W : rect.right + 12;
      const y = Math.max(8, Math.min(rect.top - 20, window.innerHeight - 260));
      setHover({ x, y });
    }, HOVER_DELAY_MS);
  };
  const hide = () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    setHover(null);
  };

  const popover = hover && drawing && url && profileId ? createPortal(
    <EdgeProfilePreviewCard profileId={profileId} url={url} x={hover.x} y={hover.y} />,
    document.body,
  ) : null;

  if (drawing && url) {
    const width = Math.round((drawing.w / drawing.h) * height);
    return (
      <>
        <img
          ref={ref as React.RefObject<HTMLImageElement>}
          src={url}
          alt=""
          title={title}
          width={width}
          height={height}
          className={`edge-profile-thumb shrink-0 ${className}`}
          style={{ width, height, objectFit: 'contain', cursor: preview ? 'zoom-in' : undefined }}
          draggable={false}
          onMouseEnter={show}
          onMouseLeave={hide}
        />
        {popover}
      </>
    );
  }
  return (
    <svg className={`edge-profile-thumb shrink-0 ${className}`} viewBox="0 0 54 32" width={Math.round(height * 54 / 32)} height={height} aria-hidden="true">
      <defs>
        <pattern id="edge-thumb-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#9badba" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="6" y="7" width="42" height="18" fill="url(#edge-thumb-hatch)" stroke="#475569" strokeWidth="1.5" />
    </svg>
  );
}

/** Велика картка розрізу біля курсора (стиль Bottega). */
function EdgeProfilePreviewCard({ profileId, url, x, y }: { profileId: string; url: string; x: number; y: number }) {
  const profiles = useProjectStore((s) => s.project.referenceData?.edgeProfiles);
  const def = profiles?.find((p) => p.id === profileId);
  const cls = edgeProfileClass(profileId);
  return (
    <div
      className="edge-profile-preview"
      style={{ position: 'fixed', left: x, top: y, width: PREVIEW_W, zIndex: 200, pointerEvents: 'none',
        background: '#fff', border: '1px solid #dde5ee', borderRadius: 7, boxShadow: '0 8px 24px rgba(22,32,46,.14)', padding: 10 }}
    >
      <div style={{ background: '#fbfcfe', border: '1px solid #edf1f6', borderRadius: 5, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <img src={url} alt="" style={{ maxWidth: '94%', maxHeight: 160, objectFit: 'contain' }} draggable={false} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#16202e' }}>{def?.shortLabel || def?.label || profileId}</span>
        {cls.catalogCode && cls.catalogCode !== (def?.shortLabel || '') && (
          <span className="bt-tag bt-tag-amber">{cls.catalogCode}?</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8792a2', fontFamily: '"DejaVu Sans Mono", ui-monospace, monospace' }}>{profileId}</span>
      </div>
      {def?.label && def.label !== def.shortLabel && <div style={{ fontSize: 12, color: '#3f4a5a', marginTop: 2 }}>{def.label}</div>}
      {cls.form && <div style={{ fontSize: 12, color: '#3f4a5a', marginTop: 2 }}>{cls.form}</div>}
      <div style={{ fontSize: 11, color: '#6b7684', marginTop: 4 }}>
        {cls.materials ? cls.materials.join(', ') : 'універсальна'} · {cls.execution === 'buildup' ? 'лише з потовщенням' : cls.execution === 'both' ? 'товщина і потовщення' : 'у товщині плити'}
        {def ? ` · припуск ${def.allowance}` : ''}
      </div>
    </div>
  );
}
