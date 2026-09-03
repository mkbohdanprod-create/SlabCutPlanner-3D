import type { SlabInstance, Placement, DetailPart, ManualDimension } from '../../../domain/types';
import { placementPolygon, polygonBounds } from '../../../lib/project';

export function ManualDimensions({
  dimensions,
  scale,
  selectedId,
  onSelect,
}: {
  dimensions: ManualDimension[];
  scale: number;
  selectedId?: string;
  onSelect: (dimensionId: string) => void;
}) {
  if (!dimensions.length) return null;
  return (
    <g className="slab-dimensions manual-dimensions">
      {dimensions.map((dimension) => {
        const dx = dimension.end.x - dimension.start.x;
        const dy = dimension.end.y - dimension.start.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const midX = (dimension.start.x + dimension.end.x) * scale / 2;
        const midY = (dimension.start.y + dimension.end.y) * scale / 2;
        const labelX = midX + (-dy / length) * 12;
        const labelY = midY + (dx / length) * 12;
        const markerId = `manual-dim-arrow-${dimension.id}`;
        return (
          <g
            key={dimension.id}
            className={`manual-dimension${selectedId === dimension.id ? ' selected' : ''}`}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(dimension.id);
            }}
          >
            <defs>
              <marker id={markerId} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L8 4 L0 8 z" />
              </marker>
            </defs>
            <line
              className="manual-dimension-hitbox"
              x1={dimension.start.x * scale}
              y1={dimension.start.y * scale}
              x2={dimension.end.x * scale}
              y2={dimension.end.y * scale}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelect(dimension.id);
              }}
            />
            <line
              className="dimension-arrow"
              x1={dimension.start.x * scale}
              y1={dimension.start.y * scale}
              x2={dimension.end.x * scale}
              y2={dimension.end.y * scale}
              markerStart={`url(#${markerId})`}
              markerEnd={`url(#${markerId})`}
            />
            <text x={labelX} y={labelY} textAnchor="middle">{Math.round(length)} мм</text>
          </g>
        );
      })}
    </g>
  );
}

export function SlabDimensionHints({ slab, placements, parts, scale }: { slab: SlabInstance; placements: Placement[]; parts: DetailPart[]; scale: number }) {
  const boxes = placements
    .map((placement) => {
      const part = parts.find((item) => item.id === placement.partId);
      return part ? polygonBounds(placementPolygon(part, placement)) : undefined;
    })
    .filter(Boolean) as ReturnType<typeof polygonBounds>[];
  if (!boxes.length) {
    // Габарит порожнього листа — під нижньою кромкою праворуч, уздовж тієї
    // сторони, якої він стосується (27.08). По центру каменю напис читався
    // як щось намальоване НА камені й перекривав малюнок.
    return (
      <text
        className="slab-dimension-hint"
        x={slab.width * scale}
        y={slab.height * scale + 15}
        textAnchor="end"
      >
        {slab.width}×{slab.height}
      </text>
    );
  }
  const minX = Math.min(...boxes.map((box) => box.minX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const maxY = Math.max(...boxes.map((box) => box.maxY));
  const right = Math.max(0, slab.width - maxX);
  const bottom = Math.max(0, slab.height - maxY);
  const left = Math.max(0, minX);
  const top = Math.max(0, minY);
  const arrowId = `dim-arrow-${slab.id}`;
  const centerX = slab.width * scale / 2;
  const centerY = slab.height * scale / 2;
  return (
    <g className="slab-dimensions">
      <defs>
        <marker id={arrowId} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M0 0 L8 4 L0 8 z" />
        </marker>
      </defs>
      {left > 40 && (
        <g>
          <line className="dimension-guide" x1={minX * scale} y1={0} x2={minX * scale} y2={slab.height * scale} />
          <line className="dimension-arrow" x1={(left / 2) * scale} y1={centerY} x2={0} y2={centerY} markerEnd={`url(#${arrowId})`} />
          <line className="dimension-arrow" x1={(left / 2) * scale} y1={centerY} x2={minX * scale} y2={centerY} markerEnd={`url(#${arrowId})`} />
          <text x={(left / 2) * scale} y={centerY - 8} textAnchor="middle">{Math.round(left)} мм</text>
        </g>
      )}
      {right > 40 && (
        <g>
          <line className="dimension-guide" x1={maxX * scale} y1={0} x2={maxX * scale} y2={slab.height * scale} />
          <line className="dimension-arrow" x1={(maxX + right / 2) * scale} y1={centerY} x2={maxX * scale} y2={centerY} markerEnd={`url(#${arrowId})`} />
          <line className="dimension-arrow" x1={(maxX + right / 2) * scale} y1={centerY} x2={slab.width * scale} y2={centerY} markerEnd={`url(#${arrowId})`} />
          <text x={(maxX + right / 2) * scale} y={centerY - 8} textAnchor="middle">{Math.round(right)} мм</text>
        </g>
      )}
      {top > 40 && (
        <g>
          <line className="dimension-guide" x1={0} y1={minY * scale} x2={slab.width * scale} y2={minY * scale} />
          <line className="dimension-arrow" x1={centerX} y1={(top / 2) * scale} x2={centerX} y2={0} markerEnd={`url(#${arrowId})`} />
          <line className="dimension-arrow" x1={centerX} y1={(top / 2) * scale} x2={centerX} y2={minY * scale} markerEnd={`url(#${arrowId})`} />
          <text x={centerX + 8} y={(top / 2) * scale + 4} textAnchor="start">{Math.round(top)} мм</text>
        </g>
      )}
      {bottom > 40 && (
        <g>
          <line className="dimension-guide" x1={0} y1={maxY * scale} x2={slab.width * scale} y2={maxY * scale} />
          <line className="dimension-arrow" x1={centerX} y1={(maxY + bottom / 2) * scale} x2={centerX} y2={maxY * scale} markerEnd={`url(#${arrowId})`} />
          <line className="dimension-arrow" x1={centerX} y1={(maxY + bottom / 2) * scale} x2={centerX} y2={slab.height * scale} markerEnd={`url(#${arrowId})`} />
          <text x={centerX + 8} y={(maxY + bottom / 2) * scale + 4} textAnchor="start">{Math.round(bottom)} мм</text>
        </g>
      )}
    </g>
  );
}

// ── Лупа над слябом — ВИДАЛЕНА 03.09.2026 ─────────────────────────────
//  Тут жив компонент SlabMagnifierWindow: окреме плаваюче вікно зі
//  збільшенням карти крою (зум 2–8×, перетягування за шапку, міні-мапа
//  в кутку). Знято за рішенням власника (аудит 02.09, питання А-1):
//  фікс його поломки був серед втраченого 22–23.08, і замість повернення
//  фіксу лупу прибрано цілком. Разом із нею знято кнопку «Лупа» на
//  панелі карти крою (SlabBoard), стилі .slab-magnifier-* (global.css),
//  картку в довідці (HelpDialog) і ключ magnifier у словниках.
//  Масштаб карти крою лишається звичайним зумом полотна.


