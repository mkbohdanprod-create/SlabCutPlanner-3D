import { CSSProperties, MouseEvent, Ref, WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Detail, DetailPart, Rotation, SlabInstance, TextureFrame, TextureLayout } from '../../domain/types';
import { translateStaticUiText } from '../../i18n';
import { pointString, rotatePoint, rotatedLocalPoints, rotatedPoints, rotatedSize } from '../../lib/project';
import { SIDE_SEGMENT_INDEXES } from '../../domain/constants';
import { useProjectStore } from '../../store/useProjectStore';
import { edgeMarkersForPart, edgeProfileShortLabel } from '../../utils/edgeProfiles';
import { pointInPolygonStrict as pointInPolygon, pointOnSegment, outwardNormal } from '../../engines/geometryUtils';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { TextureScene } from './TextureScene';
import type { FrameDraft, FrameDrag } from './TextureScene';
import { svgPoint } from './TextureScene';

import { getSourceX, getSourceY, getSourceRotation } from '../../engines/textureLayout';

import type {
  TextureItem,
  ViewBox,
} from '../../engines/textureLayout';
import {
  clamp,
  clampTextureLayoutPosition,
  constrainTextureGroupPosition,
  findPart,
  getTextureItems,
  resolveTextureOverlaps,
  snapTexturePosition,
  textureInteractionKey,
  textureItemsInPaintOrder
} from '../../engines/textureLayout';

import { Viewer3D } from '../3d/Viewer3DLazy';

const MIN_TEXTURE_WIDTH = 1000;
const MIN_TEXTURE_HEIGHT = 320;
const MAX_TEXTURE_HEIGHT = 1400;
const TEXTURE_PADDING = 48;

function roundToGrid(value: number, grid = 10) {
  return Math.round(value / grid) * grid;
}

function getDefaultScale(slabs: SlabInstance[]) {
  const maxW = Math.max(...slabs.map((slab) => slab.width), 3200);
  const totalHeight = slabs.reduce((sum, slab) => sum + slab.height, 0) + slabs.length * 110;
  return Math.min(1080 / maxW, 940 / Math.max(totalHeight, 1600));
}

import { textureCoordinateMatrix } from '../../lib/textureMatrix';

function buildViewBox(items: TextureItem[], scale: number, containerWidth: number): ViewBox {
  const width = Math.max(MIN_TEXTURE_WIDTH, containerWidth);
  if (!items.length) return { x: 0, y: 0, width, height: MIN_TEXTURE_HEIGHT };

  const bounds = items.reduce((acc, item) => {
    const size = rotatedSize(item.part, item.layout.rotation);
    const minX = item.displayX * scale;
    const minY = item.displayY * scale;
    const maxX = (item.displayX + size.width) * scale;
    const maxY = (item.displayY + size.height) * scale;
    return {
      minX: Math.min(acc.minX, minX),
      minY: Math.min(acc.minY, minY),
      maxX: Math.max(acc.maxX, maxX),
      maxY: Math.max(acc.maxY, maxY),
    };
  }, { minX: 0, minY: 0, maxX: width, maxY: MIN_TEXTURE_HEIGHT });

  const height = Math.max(MIN_TEXTURE_HEIGHT, bounds.maxY + TEXTURE_PADDING, Math.abs(Math.min(0, bounds.minY)) + MIN_TEXTURE_HEIGHT);
  return { x: 0, y: 0, width, height };
}

export function TextureLayoutPanel() {
  const { project, parts, moveTextureLayout, rotateTextureLayout, setTextureLayoutRotation, addTextureFrame, updateTextureFrame, deleteTextureFrame, pushMovementSnapshot } = useProjectStore();
  const language = project.uiLanguage ?? 'uk';
  const ui = (value: string) => translateStaticUiText(language, value);
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [previewMode, setPreviewMode] = useState<'2d' | '3d'>('2d');
  const [showElements, setShowElements] = useState(false);
  const [customScale, setCustomScale] = useState<number | null>(null);
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const [resizeDrag, setResizeDrag] = useState<{ startY: number; startHeight: number } | null>(null);
  const [floatingPreviewOpen, setFloatingPreviewOpen] = useState(false);
  const [frameMode, setFrameMode] = useState(false);
  const [frameDraft, setFrameDraft] = useState<FrameDraft | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layoutId: string } | null>(null);
  const [frameMenu, setFrameMenu] = useState<{ x: number; y: number; frameId: string } | null>(null);
  const [frameFormatMenu, setFrameFormatMenu] = useState<{ x: number; y: number; frameId: string } | null>(null);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [activePieceId, setActivePieceId] = useState<string | null>(null);
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [frameDrag, setFrameDrag] = useState<FrameDrag | null>(null);
  const [frameMoveId, setFrameMoveId] = useState<string | null>(null);
  const [framePresetOpen, setFramePresetOpen] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ x: 18, y: 18 });
  const [previewDrag, setPreviewDrag] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previewWindowRef = useRef<Window | null>(null);
  const [containerWidth, setContainerWidth] = useState(MIN_TEXTURE_WIDTH);

  const defaultScale = useMemo(() => getDefaultScale(project.slabs), [project.slabs]);
  const scale = customScale ?? defaultScale;
  const layouts = useMemo(() => project.textureLayouts.filter((layout) => findPart(layout, parts)), [project.textureLayouts, parts]);
  const interPartSpacing = Math.max(0, project.allowances?.interPartSpacing ?? 0);
  const allItems = useMemo(() => getTextureItems(layouts, parts, project.slabs, true, interPartSpacing), [interPartSpacing, layouts, parts, project.slabs]);
  const items = useMemo(() => showElements
    ? allItems
    : getTextureItems(layouts, parts, project.slabs, false, interPartSpacing), [allItems, interPartSpacing, layouts, parts, project.slabs, showElements]);
  const detailsById = useMemo(() => new Map(project.details.map((detail) => [detail.id, detail])), [project.details]);
  const viewBox = useMemo(() => buildViewBox(items, scale, containerWidth), [containerWidth, items, scale]);
  const textureFrames = project.textureFrames ?? [];
  const frameHeight = textureFrames.reduce((height, frame) => Math.max(height, (frame.y + frame.height) * scale + TEXTURE_PADDING), 0);
  const autoHeight = Math.max(MIN_TEXTURE_HEIGHT, Math.ceil(viewBox.height), Math.ceil(frameHeight));
  const viewportHeight = manualHeight ?? autoHeight;
  const sceneViewBox = useMemo(() => ({ ...viewBox, height: Math.max(viewBox.height, viewportHeight, frameHeight) }), [frameHeight, viewBox, viewportHeight]);

  useEffect(() => {
    setManualHeight((current) => current === null ? autoHeight : Math.max(current, autoHeight));
  }, [autoHeight]);

  useEffect(() => {
    const updateWidth = () => {
      const width = scrollRef.current?.clientWidth ?? MIN_TEXTURE_WIDTH;
      setContainerWidth(Math.max(MIN_TEXTURE_WIDTH, Math.floor(width)));
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    if (!resizeDrag) return;

    const onMove = (event: globalThis.MouseEvent) => {
      setManualHeight(clamp(resizeDrag.startHeight + event.clientY - resizeDrag.startY, MIN_TEXTURE_HEIGHT, MAX_TEXTURE_HEIGHT));
    };
    const onUp = () => setResizeDrag(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeDrag]);

  useEffect(() => {
    if (!previewDrag) return;

    const onMove = (event: globalThis.MouseEvent) => {
      const width = Math.min(440, window.innerWidth - 36);
      const maxX = Math.max(0, window.innerWidth - width - 8);
      const maxY = Math.max(0, window.innerHeight - 120);
      setPreviewPosition({
        x: clamp(previewDrag.originX + event.clientX - previewDrag.startX, 8, maxX),
        y: clamp(previewDrag.originY + event.clientY - previewDrag.startY, 8, maxY),
      });
    };
    const onUp = () => setPreviewDrag(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [previewDrag]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || !activeFrameId) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      event.preventDefault();
      deleteTextureFrame(activeFrameId);
      setActiveFrameId(null);
      setEditingFrameId(null);
      setFrameMoveId(null);
      setFrameMenu(null);
      setFrameFormatMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeFrameId, deleteTextureFrame]);

  useEffect(() => {
    const preview = previewWindowRef.current;
    if (!preview || preview.closed || !svgRef.current) return;
    const root = preview.document.getElementById('texture-preview-root');
    if (root) root.innerHTML = svgRef.current.outerHTML;
  }, [activeFrameId, items, scale, sceneViewBox, textureFrames, viewportHeight]);

  if (!project.textureSelectionEnabled) return null;

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    setCustomScale((current) => clamp((current ?? defaultScale) * factor, 0.08, 1.4));
  };

  const openPreview = () => {
    const svg = svgRef.current;
    if (!svg) return;
    setFloatingPreviewOpen(true);
    const preview = window.open('', 'SlabCutPlannerTexturePreview', 'width=1180,height=620');
    if (!preview) return;
    previewWindowRef.current = preview;
    preview.document.open();
    preview.document.write(`<!doctype html><html lang="${language}"><head><meta charset="utf-8" /><title>${ui('Прев’ю підбору текстури')}</title><style>body{margin:0;background:#eaf0f4;font-family:Inter,Arial,sans-serif;color:#1f2d3a}.preview-header{position:sticky;top:0;background:#dfe8ee;border-bottom:1px solid #c6d3dd;padding:10px 14px;font-weight:700}.preview-wrap{padding:14px;overflow:auto}svg{background:#f7fbfe;border:1px solid rgba(127,152,173,.35);border-radius:10px;max-width:none}.texture-frame rect{fill:rgba(31,120,180,.05);stroke:#1f78b4;stroke-width:2;stroke-dasharray:10 7;vector-effect:non-scaling-stroke}.texture-frame.active rect{fill:rgba(31,120,180,.08)}.texture-frame-handle{fill:#f8fbfd;stroke:#1f78b4;stroke-width:1.4;vector-effect:non-scaling-stroke}.texture-frame-draft{fill:rgba(31,120,180,.12);stroke:#1f78b4;stroke-width:1.6;stroke-dasharray:8 5;vector-effect:non-scaling-stroke}.edge-profile-marks line{stroke:#1f5f87;stroke-width:1.15;stroke-dasharray:8 5;vector-effect:non-scaling-stroke}.edge-profile-marks text{fill:#1f5f87;font-size:9px;font-weight:700;paint-order:stroke;stroke:rgba(248,251,253,.82);stroke-width:3px}</style></head><body><div class="preview-header">${ui('Прев’ю зони підбору текстури')}</div><div id="texture-preview-root" class="preview-wrap">${svg.outerHTML}</div></body></html>`);
    preview.document.close();
    preview.focus();
  };

  const startTextureDrag = (event: MouseEvent<SVGGElement>, item: TextureItem) => {
    if (!item.draggable) return;
    event.stopPropagation();
    const point = svgPoint(event, svgRef.current, sceneViewBox);
    if (!point) return;
    setContextMenu(null);
    setFrameFormatMenu(null);
    pushMovementSnapshot();
    setDrag({
      id: item.layout.id,
      offsetX: point.x - item.displayX * scale,
      offsetY: point.y - item.displayY * scale,
    });
  };

  const startFrameDraw = (event: MouseEvent<SVGSVGElement>) => {
    setContextMenu(null);
    setFrameMenu(null);
    setFrameFormatMenu(null);
    if (!frameMode) {
      setFrameMoveId(null);
      setActiveFrameId(null);
      setEditingFrameId(null);
      return;
    }
    const point = svgPoint(event, svgRef.current, sceneViewBox);
    if (!point) return;
    setFrameDraft({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y });
  };

  const moveFrameDraw = (event: MouseEvent<SVGSVGElement>) => {
    if (!frameDraft) return;
    const point = svgPoint(event, svgRef.current, sceneViewBox);
    if (!point) return;
    setFrameDraft((current) => current ? { ...current, currentX: point.x, currentY: point.y } : current);
  };

  const finishFrameDraw = () => {
    if (!frameDraft) return;
    const x = Math.min(frameDraft.startX, frameDraft.currentX) / scale;
    const y = Math.min(frameDraft.startY, frameDraft.currentY) / scale;
    const width = Math.abs(frameDraft.currentX - frameDraft.startX) / scale;
    const height = Math.abs(frameDraft.currentY - frameDraft.startY) / scale;
    if (width > 40 && height > 40) addTextureFrame({ x, y, width, height });
    setFrameDraft(null);
    setFrameMode(false);
  };

  const startFrameDrag = (event: MouseEvent<SVGElement>, frame: TextureFrame, handle?: string) => {
    event.preventDefault();
    event.stopPropagation();
    const point = svgPoint(event, svgRef.current, sceneViewBox);
    if (!point) return;
    setContextMenu(null);
    setFrameMenu(null);
    setFrameFormatMenu(null);
    setActiveFrameId(frame.id);
    if (handle) {
      if (editingFrameId !== frame.id) return;
      setFrameDrag({ type: 'resize', id: frame.id, handle, startX: point.x, startY: point.y, frame, proportional: event.shiftKey });
      return;
    }
    if (frameMoveId === frame.id) {
      setFrameDrag({ type: 'move', id: frame.id, startX: point.x, startY: point.y, frame });
    }
  };

  const updateDraggedFrame = (event: MouseEvent<SVGSVGElement>) => {
    if (!frameDrag) return;
    const point = svgPoint(event, svgRef.current, sceneViewBox);
    if (!point) return;
    const dx = (point.x - frameDrag.startX) / scale;
    const dy = (point.y - frameDrag.startY) / scale;
    if (frameDrag.type === 'move') {
      updateTextureFrame(frameDrag.id, {
        x: Math.max(0, roundToGrid(frameDrag.frame.x + dx)),
        y: Math.max(0, roundToGrid(frameDrag.frame.y + dy)),
      });
      return;
    }

    const minSize = 120;
    const next = { ...frameDrag.frame };
    if (frameDrag.handle.includes('e')) next.width = Math.max(minSize, frameDrag.frame.width + dx);
    if (frameDrag.handle.includes('s')) next.height = Math.max(minSize, frameDrag.frame.height + dy);
    if (frameDrag.handle.includes('w')) {
      const width = Math.max(minSize, frameDrag.frame.width - dx);
      next.x = frameDrag.frame.x + (frameDrag.frame.width - width);
      next.width = width;
    }
    if (frameDrag.handle.includes('n')) {
      const height = Math.max(minSize, frameDrag.frame.height - dy);
      next.y = frameDrag.frame.y + (frameDrag.frame.height - height);
      next.height = height;
    }

    if (frameDrag.proportional && frameDrag.handle.length === 2) {
      const ratio = frameDrag.frame.width / Math.max(frameDrag.frame.height, 1);
      if (Math.abs(dx) >= Math.abs(dy)) next.height = Math.max(minSize, next.width / ratio);
      else next.width = Math.max(minSize, next.height * ratio);
      if (frameDrag.handle.includes('w')) next.x = frameDrag.frame.x + frameDrag.frame.width - next.width;
      if (frameDrag.handle.includes('n')) next.y = frameDrag.frame.y + frameDrag.frame.height - next.height;
    }

    updateTextureFrame(frameDrag.id, {
      x: Math.max(0, roundToGrid(next.x)),
      y: Math.max(0, roundToGrid(next.y)),
      width: roundToGrid(next.width),
      height: roundToGrid(next.height),
    });
  };

  const openFrameContext = (event: MouseEvent<SVGRectElement>, frame: TextureFrame) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    setFrameFormatMenu(null);
    setActiveFrameId(frame.id);
    setFrameMenu({ x: event.clientX, y: event.clientY, frameId: frame.id });
  };

  const applyFrameRatio = (frameId: string, ratio: number) => {
    const frame = textureFrames.find((item) => item.id === frameId);
    if (!frame) return;
    const safeRatio = Math.max(ratio, 0.01);
    const area = Math.max(frame.width * frame.height, 120 * 120);
    const nextWidth = Math.max(120, Math.sqrt(area * safeRatio));
    const nextHeight = Math.max(120, nextWidth / safeRatio);
    const centerX = frame.x + frame.width / 2;
    const centerY = frame.y + frame.height / 2;
    updateTextureFrame(frame.id, {
      x: Math.max(0, roundToGrid(centerX - nextWidth / 2)),
      y: Math.max(0, roundToGrid(centerY - nextHeight / 2)),
      width: roundToGrid(nextWidth),
      height: roundToGrid(nextHeight),
    });
    setFrameFormatMenu(null);
  };

  const addFrameGrid = (columns: number, rows: number) => {
    const paddingPx = 28;
    const gapPx = 18;
    const widthPx = Math.max(180, (sceneViewBox.width - paddingPx * 2 - gapPx * (columns - 1)) / columns);
    const targetHeightPx = columns === 1 ? Math.max(240, widthPx * 0.44) : Math.max(180, widthPx * 0.92);
    const availableHeightPx = Math.max(viewportHeight, MIN_TEXTURE_HEIGHT) - paddingPx * 2 - gapPx * (rows - 1);
    const heightPx = Math.max(targetHeightPx, availableHeightPx / Math.max(rows, 1));
    const startX = paddingPx / scale;
    const startY = paddingPx / scale;
    const gap = gapPx / scale;
    const width = widthPx / scale;
    const height = heightPx / scale;
    textureFrames.forEach((frame) => deleteTextureFrame(frame.id));
    Array.from({ length: columns * rows }).forEach((_, index) => {
      addTextureFrame({
        x: startX + (index % columns) * (width + gap),
        y: startY + Math.floor(index / columns) * (height + gap),
        width,
        height,
      });
    });
    const requiredHeight = Math.ceil((startY + rows * height + (rows - 1) * gap + paddingPx / scale) * scale);
    setManualHeight((current) => Math.max(current ?? viewportHeight, requiredHeight));
    setActiveFrameId(null);
    setEditingFrameId(null);
    setFrameMoveId(null);
    setFramePresetOpen(false);
  };

  const openTextureContext = (event: MouseEvent<SVGGElement>, item: TextureItem) => {
    event.preventDefault();
    event.stopPropagation();
    setActivePieceId(item.layout.id);
    setFrameMenu(null);
    setFrameFormatMenu(null);
    setContextMenu({ x: event.clientX, y: event.clientY, layoutId: item.layout.id });
  };

  const setExactTextureAngle = () => {
    if (!contextMenu) return;
    const layout = project.textureLayouts.find((item) => item.id === contextMenu.layoutId);
    const value = window.prompt(ui('Кут'), String(layout?.rotation ?? 0));
    if (value !== null) {
      const angle = Number(value.replace(',', '.'));
      if (Number.isFinite(angle)) setTextureLayoutRotation(contextMenu.layoutId, angle);
    }
    setContextMenu(null);
  };

  return (
    <section className="panel texture-panel">
      <div className="toolbar texture-toolbar">
        <div>
          <h3>{ui('Зона підбору текстури')}</h3>
          <span className="muted">{ui('Колесо миші прокручує, Shift + колесо масштабує цю зону')}</span>
        </div>
        <div className="texture-actions">
          <div className="texture-frame-create">
            <button className={frameMode ? 'chip active' : 'chip'} onClick={() => { setFrameMode((value) => !value); setFrameDraft(null); setFramePresetOpen(false); }}>{ui('Створити рамку')}</button>
            <button className="chip texture-frame-arrow" onClick={() => setFramePresetOpen((value) => !value)}>▼</button>
            {framePresetOpen && (
              <div className="split-menu texture-frame-menu">
                <button onClick={() => addFrameGrid(1, 1)}>1</button>
                <button onClick={() => addFrameGrid(1, 2)}>2</button>
                <button onClick={() => addFrameGrid(1, 3)}>3</button>
                <button onClick={() => addFrameGrid(1, 2)}>1×2</button>
                <button onClick={() => addFrameGrid(1, 3)}>1×3</button>
                <button onClick={() => addFrameGrid(1, 4)}>1×4</button>
                <button onClick={() => addFrameGrid(2, 2)}>2×2</button>
                <button onClick={() => addFrameGrid(2, 3)}>2×3</button>
                <button onClick={() => addFrameGrid(3, 2)}>3×2</button>
                <button onClick={() => addFrameGrid(2, 4)}>2×4</button>
                <button onClick={() => addFrameGrid(3, 3)}>3×3</button>
              </div>
            )}
          </div>
          <button className={showElements ? 'chip active' : 'chip'} onClick={() => setShowElements((value) => !value)}>{ui('Показати елементи')}</button>
          <button onClick={() => setCustomScale(null)}>{ui('Масштаб')} 1:1</button>
          <button onClick={openPreview}>{ui('Відкрити прев’ю')}</button>
        </div>
      </div>
      <div className="texture-canvas-shell">
        <div
          ref={scrollRef}
          className="texture-canvas-scroll"
          onWheel={onWheel}
          style={{
            height: `${viewportHeight}px`,
            overflowY: sceneViewBox.height > viewportHeight + 1 ? 'auto' : 'hidden',
            overflowX: 'hidden',
          }}
        >
          <TextureScene
            items={items}
            frames={textureFrames}
            frameDraft={frameDraft}
            activeFrameId={activeFrameId}
            activePieceId={activePieceId}
            editingFrameId={editingFrameId}
            scale={scale}
            viewBox={sceneViewBox}
            svgRef={svgRef}
            className="texture-svg"
            style={{ width: '100%', height: `${sceneViewBox.height}px` }}
            clipPrefix="main_texture"
            detailsById={detailsById}
            onMouseMove={(event) => {
              if (frameDraft) {
                moveFrameDraw(event);
                return;
              }
              if (frameDrag) {
                updateDraggedFrame(event);
                return;
              }
              if (!drag) return;
              const point = svgPoint(event, svgRef.current, sceneViewBox);
              if (!point) return;
              const rawX = roundToGrid((point.x - drag.offsetX) / scale);
              const rawY = roundToGrid((point.y - drag.offsetY) / scale);
              const snapped = snapTexturePosition(drag.id, rawX, rawY, items, interPartSpacing);
              const constrained = constrainTextureGroupPosition(drag.id, snapped.x, Math.max(0, snapped.y), allItems, interPartSpacing);
              const next = clampTextureLayoutPosition(drag.id, constrained.x, constrained.y, allItems, sceneViewBox, scale, viewportHeight);
              moveTextureLayout(drag.id, next.x, next.y);
            }}
            onMouseUp={() => {
              finishFrameDraw();
              setFrameDrag(null);
              setDrag(null);
            }}
            onMouseLeave={() => {
              setFrameDraft(null);
              setFrameDrag(null);
              setDrag(null);
            }}
            onStartDrag={startTextureDrag}
            onActivate={(item) => setActivePieceId(item.layout.id)}
            onRotate={(item) => item.draggable && rotateTextureLayout(item.layout.id)}
            onContextMenu={openTextureContext}
            onStartFrame={startFrameDraw}
            onDeleteFrame={deleteTextureFrame}
            onFrameContextMenu={openFrameContext}
            onStartFrameDrag={startFrameDrag}
          />
        </div>
        <div
          className="texture-resize-handle"
          onMouseDown={(event) => setResizeDrag({ startY: event.clientY, startHeight: viewportHeight })}
          onDoubleClick={() => setManualHeight(null)}
          title={ui('Потягніть, щоб змінити висоту зони')}
        >
          <span />
        </div>
      </div>
      {contextMenu && (
        <div className="canvas-context-menu texture-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={setExactTextureAngle}>{ui('Кут')}</button>
          <button onClick={() => { rotateTextureLayout(contextMenu.layoutId); setContextMenu(null); }}>{ui('Повернути 90°')}</button>
        </div>
      )}
      {frameMenu && (
        <div className="canvas-context-menu texture-context-menu" style={{ left: frameMenu.x, top: frameMenu.y }}>
          <button onClick={() => { setFrameMoveId(frameMenu.frameId); setActiveFrameId(frameMenu.frameId); setEditingFrameId(null); setFrameMenu(null); }}>{ui('Перемістити')}</button>
          <button onClick={() => { setActiveFrameId(frameMenu.frameId); setEditingFrameId(frameMenu.frameId); setFrameMoveId(null); setFrameMenu(null); }}>{ui('Редагувати')}</button>
          <button onClick={() => {
            setFrameFormatMenu({ x: frameMenu.x + 178, y: frameMenu.y, frameId: frameMenu.frameId });
            setFrameMenu(null);
          }}>{ui('Формат')}</button>
          <button onClick={() => { deleteTextureFrame(frameMenu.frameId); setFrameMenu(null); setEditingFrameId((id) => id === frameMenu.frameId ? null : id); }}>{ui('Видалити')}</button>
        </div>
      )}
      {frameFormatMenu && (
        <div className="canvas-context-menu texture-context-menu texture-format-menu" style={{ left: frameFormatMenu.x, top: frameFormatMenu.y }}>
          {[
            ['1×1', 1],
            ['2×3', 2 / 3],
            ['3×2', 3 / 2],
            ['4×3', 4 / 3],
            ['3×4', 3 / 4],
            ['16×9', 16 / 9],
            ['9×16', 9 / 16],
          ].map(([label, ratio]) => (
            <button key={label} onClick={() => applyFrameRatio(frameFormatMenu.frameId, Number(ratio))}>{label}</button>
          ))}
        </div>
      )}
      {floatingPreviewOpen && (
        <aside
          className="texture-preview-floating"
          style={{ left: `${previewPosition.x}px`, top: `${previewPosition.y}px`, right: 'auto', bottom: 'auto' }}
        >
          <div
            className="texture-preview-header"
            onMouseDown={(event) => setPreviewDrag({
              startX: event.clientX,
              startY: event.clientY,
              originX: previewPosition.x,
              originY: previewPosition.y,
            })}
          >
            <strong>{ui('Прев’ю підбору текстури')}</strong>
            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', marginRight: '16px' }}>
              <button 
                className={previewMode === '2d' ? 'chip active' : 'chip'} 
                onClick={() => setPreviewMode('2d')}
              >
                2D
              </button>
              <button 
                className={previewMode === '3d' ? 'chip active' : 'chip'} 
                onClick={() => setPreviewMode('3d')}
              >
                3D
              </button>
            </div>
            <button onClick={() => setFloatingPreviewOpen(false)}>{ui('Закрити')}</button>
          </div>
          <div className="texture-preview-body" onWheel={previewMode === '2d' ? onWheel : undefined} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {previewMode === '2d' ? (
              <TextureScene
                items={items}
                frames={textureFrames}
                activeFrameId={activeFrameId}
                activePieceId={activePieceId}
                scale={scale}
                viewBox={sceneViewBox}
                className="texture-preview-svg"
                clipPrefix="floating_texture_preview"
                detailsById={detailsById}
              />
            ) : (
              <Suspense fallback={
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="font-medium text-sm">Завантаження 3D-движка...</span>
                </div>
              }>
                <Viewer3D className="w-full h-full bg-slate-900 overflow-hidden relative" />
              </Suspense>
            )}
          </div>
        </aside>
      )}
    </section>
  );
}

