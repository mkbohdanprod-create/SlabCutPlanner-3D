import { useMemo, useState } from 'react';
import type { Detail, Point, SlabInstance, UiLanguage } from '../../domain/types';
import { translateStaticUiText } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import { Edit2, Trash, Check } from 'lucide-react';

function pointsBoundsWithPadding(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function polygonPath(points: Point[], holes: Point[][] = []) {
  const toPath = (items: Point[]) => items.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ') + ' Z';
  return [toPath(points), ...holes.map(toPath)].join(' ');
}

function lPoints(detail: Detail) {
  const g = detail.geometry;
  const ow = g.outerWidth ?? 1200;
  const oh = g.outerHeight ?? 900;
  const ih = g.innerHorizontal ?? 500;
  const iv = g.innerVertical ?? 400;
  return [{ x: 0, y: 0 }, { x: ow, y: 0 }, { x: ow, y: oh - iv }, { x: ih, y: oh - iv }, { x: ih, y: oh }, { x: 0, y: oh }];
}

function uPoints(detail: Detail) {
  const g = detail.geometry;
  const w = g.width ?? 1600;
  const h = g.height ?? 900;
  const cutW = g.innerCutWidth ?? 600;
  const cutD = g.innerCutDepth ?? 400;
  const offset = g.innerCutOffset ?? 400;
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: offset + cutW, y: h }, { x: offset + cutW, y: h - cutD }, { x: offset, y: h - cutD }, { x: offset, y: h }, { x: 0, y: h }];
}

function detailPoints(detail: Detail) {
  const g = detail.geometry;
  if (g.customPoints?.length) return { points: g.customPoints, holes: g.customHoles ?? [] };
  if (g.outerWidth && g.outerHeight) return { points: lPoints(detail), holes: [] };
  if (g.innerCutWidth && g.innerCutDepth) return { points: uPoints(detail), holes: [] };
  const w = g.width ?? g.ellipseWidth ?? g.diameter ?? 600;
  const h = g.height ?? g.ellipseHeight ?? g.diameter ?? 400;
  return { points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], holes: [] };
}

function detailDims(detail: Detail, language?: UiLanguage) {
  const mm = translateStaticUiText(language, 'мм');
  const g = detail.geometry;
  if (g.customPoints?.length) {
    const bounds = pointsBoundsWithPadding(g.customPoints);
    return `${Math.round(bounds.width)}×${Math.round(bounds.height)} ${mm}`;
  }
  if (g.diameter) return `Ø ${g.diameter} ${mm}`;
  if (g.ellipseWidth || g.ellipseHeight) return `${g.ellipseWidth ?? 0}×${g.ellipseHeight ?? 0} ${mm}`;
  if (g.outerWidth || g.outerHeight) return `${g.outerWidth ?? 0}×${g.outerHeight ?? 0} ${mm}`;
  return `${g.width ?? 0}×${g.height ?? 0} ${mm}`;
}

function SlabThumb({ slab }: { slab: SlabInstance }) {
  const ratio = slab.width / Math.max(slab.height, 1);
  const width = ratio >= 1 ? 86 : Math.max(38, 86 * ratio);
  const height = ratio >= 1 ? Math.max(30, 60 / ratio) : 60;
  return (
    <svg className="list-thumb" viewBox="0 0 96 68" aria-hidden="true">
      <rect x={(96 - width) / 2} y={(68 - height) / 2} width={width} height={height} rx={4} />
    </svg>
  );
}

function DetailThumb({ detail }: { detail: Detail }) {
  const { points, holes } = detailPoints(detail);
  const bounds = pointsBoundsWithPadding(points);
  const pad = Math.max(bounds.width, bounds.height) * 0.08;
  return (
    <svg className="list-thumb" viewBox={`${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`} aria-hidden="true">
      {detail.geometry.diameter ? (
        <circle cx={bounds.minX + bounds.width / 2} cy={bounds.minY + bounds.height / 2} r={Math.min(bounds.width, bounds.height) / 2} />
      ) : detail.geometry.ellipseWidth || detail.geometry.ellipseHeight ? (
        <ellipse cx={bounds.minX + bounds.width / 2} cy={bounds.minY + bounds.height / 2} rx={bounds.width / 2} ry={bounds.height / 2} />
      ) : (
        <path d={polygonPath(points, holes)} fillRule="evenodd" />
      )}
    </svg>
  );
}

export function ListsPanel({ activeTab }: { activeTab?: 'details' | 'slabs' }) {
  const { project, deleteSlab, deleteDetail, startEditDetail, selectedSlabId, setSelectedSlabId, selectedDetailId, setSelectedDetailId, setSelectedPlacementIds } = useProjectStore();
  const [openList, setOpenList] = useState<'slabs' | 'details' | null>(null);
  const language = project.uiLanguage ?? 'uk';
  const ui = (value: string) => translateStaticUiText(language, value);
  const listedDetails = useMemo(
    () => project.details.filter((detail) => !(detail.parentDetailId && (detail.importRole === 'thickening' || detail.importRole === 'fold'))),
    [project.details],
  );

  const editDetail = (detailId: string) => {
    setOpenList(null);
    startEditDetail(detailId);
  };

  return (
    <>
      <section className="panel lists-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {(!activeTab || activeTab === 'slabs') && (
          <div>
            <div className="list-title-row">
              <h3>Список слебів</h3>
              <button type="button" onClick={() => setOpenList('slabs')}>Відкрити</button>
            </div>
            <div className="list-box">
              {project.slabs.length ? project.slabs.map((slab) => {
                const isSelected = selectedSlabId === slab.id;
                return (
                <div key={slab.id} 
                     className={`list-item flex flex-col gap-3 p-3 cursor-pointer transition-colors border ${isSelected ? 'bg-blue-50/40 border-blue-200 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                     onClick={() => setSelectedSlabId(slab.id)}>
                  <div className="w-full flex items-center justify-center py-3 bg-[#fcfdfd] rounded-[3px] border border-slate-100/80">
                    <SlabThumb slab={slab} />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <strong className="truncate block text-[15px] font-bold text-[#1e2d3d] mb-1">{slab.serialNumber}</strong>
                      <span className="truncate block text-[13px] text-[#536b7a] mb-0.5">{slab.width}×{slab.height} {ui('мм')}</span>
                      <span className="truncate block text-[13px] text-[#536b7a]">{ui(slab.material)} / {slab.decor || ui('без декору')}</span>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button className="delete-button w-9 h-9 flex items-center justify-center rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:brightness-95 transition-all" onClick={(e) => { e.stopPropagation(); deleteSlab(slab.id); }} title="Видалити">
                        <Trash className="w-[17px] h-[17px] stroke-[2.2]" />
                      </button>
                    </div>
                  </div>
                </div>
              )}) : <div className="list-item muted">Слебів ще немає</div>}
            </div>
          </div>
        )}
        {(!activeTab || activeTab === 'details') && (
          <div>
            <div className="list-title-row">
              <h3>Список усіх деталей</h3>
              <button type="button" onClick={() => setOpenList('details')}>Відкрити</button>
            </div>
            <div className="list-box">
              {listedDetails.length ? listedDetails.map((detail, index) => {
                const isSelected = selectedDetailId === detail.id;
                return (
                <div key={detail.id} 
                     className={`list-item flex flex-col gap-3 p-3 cursor-pointer transition-colors border ${isSelected ? 'bg-blue-50/40 border-blue-200 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                     onClick={() => { setSelectedDetailId(detail.id); setSelectedPlacementIds([]); }}>
                  <div className="w-full flex items-center justify-center py-3 bg-[#fcfdfd] rounded-[3px] border border-slate-100/80">
                    <DetailThumb detail={detail} />
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <strong className="truncate block text-[15px] font-bold text-[#1e2d3d] mb-1">{detail.label || `${detail.type} ${index + 1}`}</strong>
                      <span className="truncate block text-[13px] text-[#536b7a] mb-0.5">{ui(detail.shape)} / {detailDims(detail, language)}</span>
                      <span className="truncate block text-[13px] text-[#536b7a]">{ui('Кількість')}: {detail.quantity}</span>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button className="w-9 h-9 flex items-center justify-center rounded-sm bg-white border border-slate-200 text-[#1e2d3d] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-slate-50 hover:border-slate-300 transition-colors" onClick={(e) => { e.stopPropagation(); editDetail(detail.id); }} title="Редагувати">
                        <Edit2 className="w-[17px] h-[17px] stroke-[2.2]" />
                      </button>
                      <button className="delete-button w-9 h-9 flex items-center justify-center rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:brightness-95 transition-all" onClick={(e) => { e.stopPropagation(); deleteDetail(detail.id); }} title="Видалити">
                        <Trash className="w-[17px] h-[17px] stroke-[2.2]" />
                      </button>
                    </div>
                  </div>
                </div>
              )}) : <div className="list-item muted">Деталей ще немає</div>}
            </div>
          </div>
        )}
      </section>

      {openList && (
        <div className="modal-backdrop" role="presentation">
          <div className="detail-modal list-modal" role="dialog" aria-modal="true" aria-label={openList === 'slabs' ? 'Список слебів' : 'Список деталей'}>
            <div className="detail-modal-header">
              <div>
                <h2>{openList === 'slabs' ? 'Список слебів' : 'Список усіх деталей'}</h2>
                <p>{openList === 'slabs' ? `${project.slabs.length} ${ui('слібів у проєкті')}` : `${listedDetails.length} ${ui('деталей у проєкті')}`}</p>
              </div>
              <button type="button" className="icon-button" aria-label="Закрити" onClick={() => setOpenList(null)}>×</button>
            </div>

            <div className="list-modal-grid">
              {openList === 'slabs' && (project.slabs.length ? project.slabs.map((slab) => (
                <div key={slab.id} className="list-modal-card">
                  <SlabThumb slab={slab} />
                  <div className="list-modal-info">
                    <strong>{slab.serialNumber}</strong>
                    <span>{slab.width}×{slab.height} {ui('мм')}</span>
                    <span>{ui(slab.material)} / {slab.decor || ui('без декору')}</span>
                    <span>{ui('Мін. відступ')}: {slab.minMargin} {ui('мм')}</span>
                  </div>
                  <div className="list-actions flex-shrink-0">
                    <button className="icon-button flex items-center justify-center" onClick={() => { setSelectedSlabId(slab.id); setOpenList(null); }} title="Вибрати">
                      <Check className="w-[18px] h-[18px] stroke-[2.5]" />
                    </button>
                    <button className="delete-button icon-button flex items-center justify-center" onClick={() => deleteSlab(slab.id)} title="Видалити">
                      <Trash className="w-[18px] h-[18px] stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              )) : <div className="list-item muted">Слебів ще немає</div>)}

              {openList === 'details' && (listedDetails.length ? listedDetails.map((detail, index) => {
                return (
                  <div key={detail.id} className="list-modal-card">
                    <DetailThumb detail={detail} />
                    <div className="list-modal-info">
                      <strong>{detail.label || `${detail.type} ${index + 1}`}</strong>
                      <span>{ui(detail.shape)} / {detailDims(detail, language)}</span>
                      <span>{ui('Кількість')}: {detail.quantity}</span>
                      {detail.importRole && <span>{ui('Роль')}: {detail.importRole}</span>}
                    </div>
                    <div className="list-actions flex-shrink-0">
                      <button className="icon-button flex items-center justify-center" onClick={() => editDetail(detail.id)} title="Редагувати">
                        <Edit2 className="w-[18px] h-[18px] stroke-[2.5]" />
                      </button>
                      <button className="delete-button icon-button flex items-center justify-center" onClick={() => deleteDetail(detail.id)} title="Видалити">
                        <Trash className="w-[18px] h-[18px] stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                );
              }) : <div className="list-item muted">Деталей ще немає</div>)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

