import React, { useRef, useEffect } from 'react';
import { Upload, X, ZoomIn, ZoomOut, Check } from 'lucide-react';
import type { DxfPreviewContour, DxfBlockDraft, DxfBindingSession, DxfModalResize, DxfPreviewDrag, DxfImportRole } from '../../../parsers/dxf';
import { dxfBounds, dxfSvgPath, dxfCanvasSize, dxfViewportForContours, dxfSelectionBounds, rotateDxfPreviewContour, parseDxfContours, inferDxfShape, inferDxfType, inferDxfRole, inferDxfEdgeProfile, inferDxfEdgeSide, inferDxfParentDetailId, inferDxfBindingPair, dxfBindingSides, dxfBindingAnchorPoint, detailMainDimensions } from '../../../parsers/dxf';
import type { DetailType } from '../../../domain/types';
import { TYPE_SINK } from '../utils/draftHelpers';
import { translateStaticUiText } from '../../../i18n';
export const DXF_ROLE_LABELS: Record<DxfImportRole, string> = {
  detail: 'Деталь',
  thickening: 'Потовщення',
  fold: 'Підворот',
};

export type DxfOverviewOverlay = {
  id: string;
  path: string;
  label?: string;
  labelX?: number;
  labelY?: number;
  className?: string;
  clipPathId?: string;
};

export function DxfPreviewShape({ contour }: { contour: DxfPreviewContour }) {
  if (!contour || !contour.points || contour.points.length === 0) {
    return <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded shrink-0" />;
  }
  const bounds = dxfBounds(contour.points);
  if (!bounds) return <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded shrink-0" />;
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const cx = bounds.minX + w / 2;
  const cy = bounds.minY + h / 2;
  const size = Math.max(w, h) || 1;
  const viewBox = `${cx - size * 0.6} ${cy - size * 0.6} ${size * 1.2} ${size * 1.2}`;
  
  return (
    <svg viewBox={viewBox} className="w-12 h-12 bg-slate-50 border border-slate-200 rounded shrink-0" style={{ transform: 'scale(1, -1)' }}>
      <path d={dxfSvgPath(contour.points, contour.holes)} fill="#cbd5e1" fillRule="evenodd" stroke="#3b82f6" strokeWidth={size * 0.02} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function DxfOverview({
  contours,
  binding,
  blockMode,
  blockDraft,
  selectedContourIds,
  overlays = [],
  canvasSize,
  viewport,
  lockCanvasToSize = false,
  dragging,
  zoom,
  onContourClick,
  onContourDragStart,
  onContourDoubleClick,
  onCanvasDragMove,
  onCanvasDragFinish,
  onCanvasPanStart,
  onClearSelection,
  onSideClick,
  onAnchorClick,
  onBlockStart,
  onBlockMove,
  onBlockFinish,
  jointToolItemId,
  onJointHover,
  onJointPoint,
}: {
  contours: DxfPreviewContour[];
  binding: DxfBindingSession | null;
  blockMode: boolean;
  blockDraft: DxfBlockDraft | null;
  selectedContourIds: string[];
  overlays?: DxfOverviewOverlay[];
  canvasSize: { width: number; height: number };
  viewport?: { x: number; y: number; width: number; height: number };
  lockCanvasToSize?: boolean;
  dragging: boolean;
  zoom: number;
  onContourClick: (contour: DxfPreviewContour) => void;
  onContourDragStart: (contour: DxfPreviewContour, point: DxfPoint, additive: boolean) => void;
  onContourDoubleClick: (contour: DxfPreviewContour) => void;
  onCanvasDragMove: (point: DxfPoint) => void;
  onCanvasDragFinish: () => void;
  onCanvasPanStart?: (event: React.MouseEvent<SVGSVGElement>) => void;
  onClearSelection: () => void;
  onSideClick: (contourId: string, side: string) => void;
  onAnchorClick: (anchor: BindingAnchor) => void;
  onBlockStart: (point: DxfPoint) => void;
  onBlockMove: (point: DxfPoint) => void;
  onBlockFinish: () => void;
  jointToolItemId?: string;
  onJointHover?: (contour: DxfPreviewContour | undefined, point?: DxfPoint) => void;
  onJointPoint?: (contour: DxfPreviewContour, point: DxfPoint) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const baseWidth = viewport?.width ?? canvasSize.width;
  const baseHeight = viewport?.height ?? canvasSize.height;
  const baseOriginX = viewport?.x ?? 0;
  const baseOriginY = viewport?.y ?? 0;
  const contentViewport = dxfViewportForContours(contours);
  const viewPad = Math.max(180, Math.max(baseWidth, baseHeight) * 0.08);
  const originX = (lockCanvasToSize ? baseOriginX : Math.min(baseOriginX, contentViewport?.x ?? baseOriginX)) - viewPad;
  const originY = (lockCanvasToSize ? baseOriginY : Math.min(baseOriginY, contentViewport?.y ?? baseOriginY)) - viewPad;
  const maxX = (lockCanvasToSize ? baseOriginX + baseWidth : Math.max(baseOriginX + baseWidth, contentViewport ? contentViewport.x + contentViewport.width : baseOriginX + baseWidth)) + viewPad;
  const maxY = (lockCanvasToSize ? baseOriginY + baseHeight : Math.max(baseOriginY + baseHeight, contentViewport ? contentViewport.y + contentViewport.height : baseOriginY + baseHeight)) + viewPad;
  const width = Math.max(1, maxX - originX);
  const height = Math.max(1, maxY - originY);
  const safeZoom = Math.max(zoom, 0.35);
  const parent = contours.find((contour) => contour.id === binding?.parentDetailId);
  const element = contours.find((contour) => contour.id === binding?.elementId);
  const sideTarget = binding?.step === 'detailSide' ? parent : binding?.step === 'elementSide' ? element : undefined;
  const anchorTarget = binding?.step === 'detailAnchor' ? parent : binding?.step === 'elementAnchor' ? element : undefined;
  const anchorSide = binding?.step === 'detailAnchor' ? binding.parentDetailSide : binding?.elementSide;
  const anchorSegment = anchorTarget && dxfBindingSides(anchorTarget).find((segment) => segment.side === anchorSide);
  const selectedEdges = [
    parent && binding?.parentDetailSide ? { contour: parent, side: binding.parentDetailSide } : undefined,
    element && binding?.elementSide ? { contour: element, side: binding.elementSide } : undefined,
  ].filter(Boolean) as Array<{ contour: DxfPreviewContour; side: string }>;
  const selectedContourSet = new Set(selectedContourIds);
  const blockPoint = (event: React.MouseEvent<SVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return undefined;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  };
  const completedBindings = contours.flatMap((contour) => {
    const linkedParent = contour.parentDetailId ? contours.find((item) => item.id === contour.parentDetailId) : undefined;
    const parentSegment = linkedParent && contour.parentDetailSide
      ? dxfBindingSides(linkedParent).find((segment) => segment.side === contour.parentDetailSide)
      : undefined;
    const elementSegment = contour.elementSide
      ? dxfBindingSides(contour).find((segment) => segment.side === contour.elementSide)
      : undefined;
    if (!linkedParent || !parentSegment || !elementSegment) return [];
    const parentPoint = dxfBindingAnchorPoint(parentSegment, contour.parentAnchor ?? 'center');
    const elementPoint = dxfBindingAnchorPoint(elementSegment, contour.elementAnchor ?? 'center');
    return [{
      id: contour.id,
      start: { x: linkedParent.sourceX + parentPoint.x, y: linkedParent.sourceY + parentPoint.y },
      end: { x: contour.sourceX + elementPoint.x, y: contour.sourceY + elementPoint.y },
      startVector: { x: parentSegment.end.x - parentSegment.start.x, y: parentSegment.end.y - parentSegment.start.y },
      endVector: { x: elementSegment.end.x - elementSegment.start.x, y: elementSegment.end.y - elementSegment.start.y },
    }];
  });
  const blockGroupIds = new Set(contours.filter((contour) => contour.groupId.startsWith('DXF блок ')).map((contour) => contour.groupId));
  return (
    <svg
      ref={svgRef}
      className={blockMode ? 'dxf-overview block-mode' : 'dxf-overview'}
      style={{
        width: `${Math.max(760, width * zoom)}px`,
        height: `${Math.max(420, height * zoom)}px`,
      }}
      viewBox={`${originX} ${originY} ${width} ${height}`}
      aria-label="Композиція DXF"
      onMouseDown={(event) => {
        if (!blockMode) {
          if (event.target === event.currentTarget) {
            if (event.button === 0 && onCanvasPanStart) {
              event.preventDefault();
              onCanvasPanStart(event);
            } else {
              onClearSelection();
            }
          }
          return;
        }
        event.preventDefault();
        const point = blockPoint(event);
        if (point) onBlockStart(point);
      }}
      onMouseMove={(event) => {
        const point = blockPoint(event);
        if (!point) return;
        if (blockMode && blockDraft) onBlockMove(point);
        else if (dragging) onCanvasDragMove(point);
      }}
      onMouseUp={() => {
        if (blockMode && blockDraft) onBlockFinish();
        else if (dragging) onCanvasDragFinish();
      }}
      onMouseLeave={() => {
        if (blockMode && blockDraft) onBlockFinish();
        else if (dragging) onCanvasDragFinish();
      }}
    >
      <defs>
        {contours.map((contour) => (
          <clipPath key={`clip-${contour.id}`} id={`clip-${contour.id}`}>
            <path transform={`translate(${contour.sourceX} ${contour.sourceY})`} d={dxfSvgPath(contour.points, contour.holes)} />
          </clipPath>
        ))}
      </defs>
      {contours.map((contour) => (
        <g key={contour.id} transform={`translate(${contour.sourceX} ${contour.sourceY})`}>
          <path
            className={[
              'dxf-overview-contour',
              binding?.parentDetailId === contour.id ? 'binding-detail' : '',
              binding?.elementId === contour.id ? 'binding-element' : '',
              contour.parentDetailId ? 'bound-element' : '',
              binding && (
                binding.step === 'detail'
                || (binding.step === 'element' && contour.id !== binding.parentDetailId)
              ) ? 'selectable' : '',
              selectedContourSet.has(contour.id) ? 'block-selected' : '',
              !binding && !blockMode ? 'draggable' : '',
            ].filter(Boolean).join(' ')}
            d={dxfSvgPath(contour.points, contour.holes)}
            fillRule="evenodd"
            onMouseDown={(event) => {
              if (jointToolItemId === contour.id && onJointPoint) {
                event.preventDefault();
                event.stopPropagation();
                const point = blockPoint(event);
                if (point) onJointPoint(contour, point);
                return;
              }
              if (binding || blockMode) return;
              event.stopPropagation();
              const point = blockPoint(event);
              if (point) onContourDragStart(contour, point, event.ctrlKey || event.metaKey);
            }}
            onMouseMove={(event) => {
              if (jointToolItemId !== contour.id || !onJointHover) return;
              const point = blockPoint(event);
              if (point) onJointHover(contour, point);
            }}
            onMouseLeave={() => {
              if (jointToolItemId === contour.id) onJointHover?.(undefined);
            }}
            onClick={() => {
              if (!blockMode) onContourClick(contour);
            }}
            onDoubleClick={(event) => {
              if (binding || blockMode) return;
              event.stopPropagation();
              onContourDoubleClick(contour);
            }}
          />
          <text x={contour.width / 2} y={contour.height / 2}>{contour.name}</text>
          {blockGroupIds.has(contour.groupId) && (
            <text className="dxf-block-mark" style={{ fontSize: `${24 / safeZoom}px` }} x={12 / safeZoom} y={18 / safeZoom}>≡</text>
          )}
        </g>
      ))}
      {(overlays ?? []).map((overlay) => (
        <g key={overlay.id} className={overlay.className ?? 'dxf-feature-overlay'} clipPath={overlay.clipPathId ? `url(#${overlay.clipPathId})` : undefined}>
          <path d={overlay.path} />
          {overlay.label && <text x={overlay.labelX} y={overlay.labelY}>{overlay.label}</text>}
        </g>
      ))}
      {completedBindings.map((link) => {
        const markLength = 18 / safeZoom;
        const markSpacing = 7 / safeZoom;
        const ticks = (
          point: DxfPoint,
          vector: DxfPoint,
          prefix: string,
        ) => {
          const vectorLength = Math.max(Math.hypot(vector.x, vector.y), 1);
          const tangent = { x: vector.x / vectorLength, y: vector.y / vectorLength };
          const normal = { x: -tangent.y, y: tangent.x };
          return [-1, 0, 1].map((offset) => {
            const x = point.x + tangent.x * markSpacing * offset;
            const y = point.y + tangent.y * markSpacing * offset;
            return (
              <line
                key={`${prefix}-${offset}`}
                className="dxf-link-tick"
                x1={x - normal.x * markLength / 2}
                y1={y - normal.y * markLength / 2}
                x2={x + normal.x * markLength / 2}
                y2={y + normal.y * markLength / 2}
              />
            );
          });
        };
        return (
          <g key={`binding-${link.id}`} className="dxf-completed-binding">
            <line className="dxf-link-guide" x1={link.start.x} y1={link.start.y} x2={link.end.x} y2={link.end.y} />
            {ticks(link.start, link.startVector, 'start')}
            {ticks(link.end, link.endVector, 'end')}
          </g>
        );
      })}
      {selectedEdges.map(({ contour, side }) => {
        const segment = dxfBindingSides(contour).find((item) => item.side === side);
        if (!segment) return null;
        return (
          <line
            key={`selected-${contour.id}-${side}`}
            className="dxf-binding-side selected"
            x1={contour.sourceX + segment.start.x}
            y1={contour.sourceY + segment.start.y}
            x2={contour.sourceX + segment.end.x}
            y2={contour.sourceY + segment.end.y}
          />
        );
      })}
      {sideTarget && dxfBindingSides(sideTarget).map((segment) => (
        <g key={`choose-${sideTarget.id}-${segment.side}`}>
          <line
            className="dxf-binding-side candidate"
            x1={sideTarget.sourceX + segment.start.x}
            y1={sideTarget.sourceY + segment.start.y}
            x2={sideTarget.sourceX + segment.end.x}
            y2={sideTarget.sourceY + segment.end.y}
          />
          <line
            className="dxf-binding-side-hit"
            x1={sideTarget.sourceX + segment.start.x}
            y1={sideTarget.sourceY + segment.start.y}
            x2={sideTarget.sourceX + segment.end.x}
            y2={sideTarget.sourceY + segment.end.y}
            onClick={() => onSideClick(sideTarget.id, segment.side)}
          />
        </g>
      ))}
      {anchorTarget && anchorSegment && (['start', 'center', 'end'] as BindingAnchor[]).map((anchor) => {
        const point = dxfBindingAnchorPoint(anchorSegment, anchor);
        return (
          <circle
            key={`anchor-${anchorTarget.id}-${anchor}`}
            className="dxf-binding-anchor"
            cx={anchorTarget.sourceX + point.x}
            cy={anchorTarget.sourceY + point.y}
            r={6 / safeZoom}
            onClick={() => onAnchorClick(anchor)}
          />
        );
      })}
      {blockDraft && (
        <rect
          className="dxf-block-draft"
          x={Math.min(blockDraft.startX, blockDraft.currentX)}
          y={Math.min(blockDraft.startY, blockDraft.currentY)}
          width={Math.abs(blockDraft.currentX - blockDraft.startX)}
          height={Math.abs(blockDraft.currentY - blockDraft.startY)}
        />
      )}
    </svg>
  );
}

