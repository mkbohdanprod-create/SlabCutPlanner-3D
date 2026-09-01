import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DetailPart } from '../../domain/types';
import { polygonBounds, pointString } from '../../lib/project';
import { useProjectStore } from '../../store/useProjectStore';
import { RemnantFinderModal } from './RemnantFinderModal';
import { PackageSearch, Inbox, ChevronRight, ChevronLeft } from 'lucide-react';

/**
 * БУФЕР НЕРОЗМІЩЕНИХ ДЕТАЛЕЙ — права колонка 2D Розкрою.
 *
 * До 28.08 буфер лежав ГОРИЗОНТАЛЬНОЮ смугою над аркушами і з'їдав
 * висоту робочого поля: одна деталь у буфері — і дошка починалась на
 * третині екрана. Власник: «деталі, які не помістились, — справа, меню
 * яке можна скривати».
 *
 * Тепер це колонка з двома станами:
 *  · розгорнута (`PANEL_WIDTH`) — картки деталей одна під одною;
 *  · згорнута (`RAIL_WIDTH`) — вузька рейка зі значком, лічильником і
 *    вертикальним підписом.
 *
 * Вибір людини живе в localStorage (`vs3d.unplacedCollapsed`) — це її
 * звичка, а не властивість проєкту (те саме правило, що для просунутого
 * режиму, див. store/useStore.ts).
 *
 * ⚠️ Клас `.unplaced-panel` на кореневому елементі — не косметика:
 * `SlabBoard` шукає саме його через `document.querySelector`, щоб
 * зрозуміти, що деталь кинули в буфер. Клас має лишатись на елементі,
 * який видно в ОБОХ станах.
 */

const PANEL_WIDTH = 268;
const RAIL_WIDTH = 44;
/** Висота мініатюри в картці. Контур вписує сам браузер (preserveAspectRatio) */
const THUMB_HEIGHT = 78;
/** Ghost при перетягуванні: більша сторона контуру в пікселях */
const GHOST_MAX_SIDE = 190;
const COLLAPSED_KEY = 'vs3d.unplacedCollapsed';

type DragPreview = {
  points: Array<{ x: number; y: number }>;
  widthMm: number;
  heightMm: number;
  /** px на міліметр — у масштабі ghost'а, не мініатюри */
  scale: number;
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
};

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function UnplacedPartsPanel() {
  const { project, parts, bufferDragPartId, unplacedDropVisible, startBufferDrag } = useProjectStore();
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [remnantsOpen, setRemnantsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const listRef = useRef<HTMLDivElement | null>(null);

  const unplacedParts = useMemo(
    () => project.unplacedPartIds
      .map((id) => parts.find((part) => part.id === id))
      .filter(Boolean) as DetailPart[],
    [project.unplacedPartIds, parts],
  );

  const unplacedReason = useMemo(() => Array.from(new Set(
    unplacedParts
      .map((part) => project.unplacedReasons?.[part.id])
      .filter(Boolean) as string[],
  )).slice(0, 2).join('; '), [unplacedParts, project.unplacedReasons]);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* приватний режим браузера */ }
      return next;
    });
  }, []);

  /*
   * Поки деталь тягнуть у буфер — колонка розгорнута примусово, навіть
   * якщо людина її згорнула. Інакше довелось би цілити в рейку 44 px, а
   * промах означає, що деталь повернулась на аркуш.
   */
  const open = !collapsed || unplacedDropVisible;

  useEffect(() => {
    if (!dragPreview) return undefined;
    const onMove = (event: MouseEvent) => {
      setDragPreview((current) => (current ? { ...current, clientX: event.clientX, clientY: event.clientY } : current));
    };
    const onUp = () => setDragPreview(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragPreview !== null]);

  const beginDrag = useCallback((event: React.MouseEvent<SVGSVGElement>, part: DetailPart) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const bounds = polygonBounds(part.points);
    const widthMm = Math.max(bounds.maxX - bounds.minX, 1);
    const heightMm = Math.max(bounds.maxY - bounds.minY, 1);
    const rect = event.currentTarget.getBoundingClientRect();

    /* Масштаб, у якому контур зараз намальовано в картці (browser fit) */
    const thumbScale = Math.min(rect.width / widthMm, rect.height / heightMm);
    /* Ghost більший за мініатюру: у колонці 268 px деталь 1600×2400 —
       нігтик, а тягти нігтиком на аркуш незручно. */
    const ghostScale = Math.max(thumbScale, GHOST_MAX_SIDE / Math.max(widthMm, heightMm));

    /* Де саме всередині контуру людина взялась — у частках, щоб ghost
       не стрибав під курсором при зміні масштабу */
    const drawnWidth = widthMm * thumbScale;
    const drawnHeight = heightMm * thumbScale;
    const insideX = event.clientX - (rect.left + (rect.width - drawnWidth) / 2);
    const insideY = event.clientY - (rect.top + (rect.height - drawnHeight) / 2);
    const shareX = Math.min(Math.max(insideX / drawnWidth, 0), 1);
    const shareY = Math.min(Math.max(insideY / drawnHeight, 0), 1);

    startBufferDrag(part.id);
    setDragPreview({
      points: part.points.map((point) => ({ x: point.x - bounds.minX, y: point.y - bounds.minY })),
      widthMm,
      heightMm,
      scale: ghostScale,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: shareX * widthMm * ghostScale,
      offsetY: shareY * heightMm * ghostScale,
    });
  }, [startBufferDrag]);

  if (!unplacedParts.length && !unplacedDropVisible) return null;

  return (
    <>
      <RemnantFinderModal
        open={remnantsOpen}
        onClose={() => setRemnantsOpen(false)}
        project={project}
        unplacedParts={unplacedParts}
      />

      <aside
        className={`unplaced-panel${unplacedDropVisible ? ' drop-target' : ''}${open ? '' : ' is-rail'}`}
        style={{ width: open ? PANEL_WIDTH : RAIL_WIDTH }}
        aria-label="Нерозміщені деталі"
      >
        {open ? (
          <>
            <header className="unplaced-head">
              <Inbox className="w-4 h-4 shrink-0 text-[#7a5a2e]" />
              <h3>Нерозміщені</h3>
              <span className="unplaced-count">{unplacedParts.length}</span>
              <button
                type="button"
                className="unplaced-toggle"
                title="Згорнути колонку"
                onClick={toggle}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </header>

            {unplacedReason && (
              <p className="unplaced-reason" title={unplacedReason}>{unplacedReason}</p>
            )}

            <div className="unplaced-list custom-scrollbar" ref={listRef}>
              {unplacedParts.map((part) => {
                const bounds = polygonBounds(part.points);
                const widthMm = Math.max(bounds.maxX - bounds.minX, 1);
                const heightMm = Math.max(bounds.maxY - bounds.minY, 1);
                const points = part.points.map((point) => ({
                  x: point.x - bounds.minX,
                  y: point.y - bounds.minY,
                }));

                return (
                  <article
                    key={part.id}
                    className={`unplaced-card${bufferDragPartId === part.id ? ' dragging' : ''}`}
                    title={`${part.name} · ${part.dimsLabel} мм — перетягніть на аркуш`}
                  >
                    <svg
                      className="unplaced-thumb"
                      style={{ height: THUMB_HEIGHT }}
                      viewBox={`0 0 ${widthMm} ${heightMm}`}
                      preserveAspectRatio="xMidYMid meet"
                      onMouseDown={(event) => beginDrag(event, part)}
                    >
                      <polygon className="unplaced-fill" points={pointString(points)} />
                      <polygon className="unplaced-stroke" points={pointString(points)} />
                    </svg>
                    <div className="unplaced-card-text">
                      <strong>{part.name}</strong>
                      <span>{part.dimsLabel} мм</span>
                    </div>
                  </article>
                );
              })}

              {!unplacedParts.length && (
                <div className="unplaced-empty drop-empty">
                  Відпустіть деталь тут, щоб повернути її в нерозміщені
                </div>
              )}
            </div>

            {unplacedParts.length > 0 && (
              <button
                type="button"
                onClick={() => setRemnantsOpen(true)}
                className="unplaced-remnants"
                title="Спитати склад, які залишки цього матеріалу є, і які з деталей у них влазять"
              >
                <PackageSearch className="w-3.5 h-3.5" /> Підібрати залишки
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className="unplaced-rail"
            onClick={toggle}
            title={`Нерозміщені деталі: ${unplacedParts.length} шт. — розгорнути`}
          >
            <ChevronLeft className="w-4 h-4" />
            <Inbox className="w-4 h-4" />
            <span className="unplaced-count">{unplacedParts.length}</span>
            <span className="unplaced-rail-label">Нерозміщені</span>
          </button>
        )}
      </aside>

      {dragPreview && <BufferDragGhost preview={dragPreview} />}
    </>
  );
}

function BufferDragGhost({ preview }: { preview: DragPreview }) {
  return (
    <svg
      className="buffer-drag-ghost"
      style={{
        left: preview.clientX - preview.offsetX,
        top: preview.clientY - preview.offsetY,
        width: preview.widthMm * preview.scale,
        height: preview.heightMm * preview.scale,
      }}
      viewBox={`0 0 ${preview.widthMm} ${preview.heightMm}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon className="unplaced-fill" points={pointString(preview.points)} />
      <polygon className="unplaced-stroke" points={pointString(preview.points)} />
    </svg>
  );
}
