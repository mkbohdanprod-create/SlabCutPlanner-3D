import { CSSProperties, MouseEvent, Ref } from 'react';
import type { Detail, TextureFrame } from '../../domain/types';
import type { TextureItem, ViewBox } from '../../engines/textureLayout';
import { rotatedSize } from '../../lib/project';
import { textureItemsInPaintOrder } from '../../engines/textureLayout';
import { TexturePiece } from './TexturePiece';

export type FrameDraft = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

export type FrameDrag =
  | { type: 'move'; id: string; startX: number; startY: number; frame: TextureFrame }
  | { type: 'resize'; id: string; handle: string; startX: number; startY: number; frame: TextureFrame; proportional: boolean };

export function svgPoint(event: MouseEvent<Element>, svg: SVGSVGElement | null, viewBox: ViewBox) {
  const box = svg?.getBoundingClientRect();
  if (!box) return undefined;
  return {
    x: viewBox.x + ((event.clientX - box.left) / box.width) * viewBox.width,
    y: viewBox.y + ((event.clientY - box.top) / box.height) * viewBox.height,
  };
}

export function TextureScene({
  items,
  frames = [],
  frameDraft,
  activeFrameId,
  activePieceId,
  editingFrameId,
  scale,
  viewBox,
  svgRef,
  className,
  style,
  clipPrefix,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onStartDrag,
  onActivate,
  onRotate,
  onContextMenu,
  onStartFrame,
  onDeleteFrame,
  onFrameContextMenu,
  onStartFrameDrag,
  detailsById,
}: {
  items: TextureItem[];
  frames?: TextureFrame[];
  frameDraft?: FrameDraft | null;
  activeFrameId?: string | null;
  activePieceId?: string | null;
  editingFrameId?: string | null;
  scale: number;
  viewBox: ViewBox;
  svgRef?: Ref<SVGSVGElement>;
  className: string;
  style?: CSSProperties;
  clipPrefix: string;
  onMouseMove?: (event: MouseEvent<SVGSVGElement>) => void;
  onMouseUp?: () => void;
  onMouseLeave?: () => void;
  onStartDrag?: (event: MouseEvent<SVGGElement>, item: TextureItem) => void;
  onActivate?: (item: TextureItem) => void;
  onRotate?: (item: TextureItem) => void;
  onContextMenu?: (event: MouseEvent<SVGGElement>, item: TextureItem) => void;
  onStartFrame?: (event: MouseEvent<SVGSVGElement>) => void;
  onDeleteFrame?: (frameId: string) => void;
  onFrameContextMenu?: (event: MouseEvent<SVGRectElement>, frame: TextureFrame) => void;
  onStartFrameDrag?: (event: MouseEvent<SVGElement>, frame: TextureFrame, handle?: string) => void;
  detailsById: Map<string, Detail>;
}) {
  const draftRect = frameDraft
    ? {
      x: Math.min(frameDraft.startX, frameDraft.currentX),
      y: Math.min(frameDraft.startY, frameDraft.currentY),
      width: Math.abs(frameDraft.currentX - frameDraft.startX),
      height: Math.abs(frameDraft.currentY - frameDraft.startY),
    }
    : undefined;

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      style={style}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onMouseDown={onStartFrame}
    >
      <rect x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill="#f8fbfd" rx={10} />
      {frames.map((frame) => (
        <g key={frame.id} className={frame.id === activeFrameId ? 'texture-frame active' : 'texture-frame'}>
          <rect
            x={frame.x * scale}
            y={frame.y * scale}
            width={frame.width * scale}
            height={frame.height * scale}
            rx={8}
            onMouseDown={(event) => onStartFrameDrag?.(event, frame)}
            onContextMenu={(event) => onFrameContextMenu?.(event, frame)}
            onDoubleClick={() => onDeleteFrame?.(frame.id)}
          />
          {frame.id === editingFrameId && ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => {
            const hx = handle.includes('w') ? frame.x : handle.includes('e') ? frame.x + frame.width : frame.x + frame.width / 2;
            const hy = handle.includes('n') ? frame.y : handle.includes('s') ? frame.y + frame.height : frame.y + frame.height / 2;
            return (
              <rect
                key={handle}
                className={`texture-frame-handle handle-${handle}`}
                x={hx * scale - 5}
                y={hy * scale - 5}
                width={10}
                height={10}
                rx={2}
                onMouseDown={(event) => onStartFrameDrag?.(event, frame, handle)}
              />
            );
          })}
        </g>
      ))}
      {draftRect && <rect className="texture-frame-draft" x={draftRect.x} y={draftRect.y} width={draftRect.width} height={draftRect.height} rx={8} />}
      {textureItemsInPaintOrder(items, activePieceId).map((item) => {
        const size = rotatedSize(item.part, item.layout.rotation);
        return (
          <g
            key={item.layout.id}
            className={item.draggable ? 'texture-piece draggable' : 'texture-piece attached'}
            onMouseDown={(event) => {
              onActivate?.(item);
              onStartDrag?.(event, item);
            }}
            onDoubleClick={() => onRotate?.(item)}
            onContextMenu={(event) => onContextMenu?.(event, item)}
          >
            <TexturePiece item={item} detail={detailsById.get(item.part.detailId)} scale={scale} clipPrefix={clipPrefix} />
            <rect x={item.displayX * scale} y={item.displayY * scale} width={size.width * scale} height={size.height * scale} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}
