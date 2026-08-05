import { useMemo, useState } from 'react';
import { useUIStore } from '../../store/useStore';
import { draftFromDetail } from '../forms/utils/draftHelpers';
import type { ProductEditorSession } from '../forms/utils/draftHelpers';
import type { Detail, Point, SlabInstance, UiLanguage } from '../../domain/types';
import { translateStaticUiText } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import { getAllProjectDetails } from '../../store/projectHelpers';
import { Edit2, Trash, Check, Folder, FileText } from 'lucide-react';
import { toSlot } from '../../domain/ids';

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
  const { project, deleteSlab, deleteDetail, removeProduct, startEditDetail, selectedSlabId, setSelectedSlabId, selectedDetailId, setSelectedDetailId, setSelectedPlacementIds } = useProjectStore();

  const handleDeleteDetail = (detail: Detail) => {
    const product = (project.products || []).find(
      (p) => detail.id === p.id || detail.id.startsWith(`prod_${p.id}/`) || detail.id.startsWith(`${p.id}/`)
    );
    if (product) {
      removeProduct(product.id);
    } else {
      deleteDetail(detail.id);
    }
  };
  const setProductEditorSession = useUIStore(s => s.setProductEditorSession);
  const [openList, setOpenList] = useState<'slabs' | 'details' | null>(null);
  const language = project.uiLanguage ?? 'uk';
  const ui = (value: string) => translateStaticUiText(language, value);
  const allDetails = useMemo(() => getAllProjectDetails(project), [project.details, project.products]);
  const listedDetails = useMemo(
    () => allDetails.filter((detail) => {
      // Показуємо деталь, якщо у неї немає батька АБО батько був видалений (orphan detail)
      if (!detail.parentDetailId) return true;
      const parentExists = allDetails.some(p => p.id === detail.parentDetailId);
      return !parentExists;
    }),
    [allDetails],
  );

  /** Відкриває редактор виробу з дерева розкрою — та сама сесія, що й при створенні. */
  const openProductEditor = (product: any) => {
    const main = product.elements?.[0];
    if (!main) return;
    const subDetails: Record<string, any> = {};
    product.elements.forEach((el: any, idx: number) => {
      // Мийки (слот sink_*) — ПОХІДНІ від mainDetail.sinks: у сесію їх не
      // тягнемо, інакше buildProductFromSession створить їх удруге і мийка
      // дублюватиметься після кожного збереження.
      if (idx > 0 && !toSlot(el.id).startsWith('sink_')) subDetails[toSlot(el.id)] = el.baseDefinition;
      (el.additions || []).forEach((add: any) => {
        if (toSlot(add.id).startsWith('sink_')) return;
        subDetails[toSlot(add.id)] = add.baseDefinition;
      });
    });
    setProductEditorSession({
      editingProductId: product.id,
      activeDetailId: 'main',
      mainDetail: main.baseDefinition,
      subDetails,
    } as ProductEditorSession);
  };

  const editDetail = (detail: Detail) => {
    setOpenList(null);
    
    let productToEdit: Detail | undefined = undefined;
    let targetActiveSlot = 'main';

    if (detail.isProduct) {
      productToEdit = detail;
    } else if (detail.parentDetailId) {
      const parent = allDetails.find(d => d.id === detail.parentDetailId);
      if (parent && parent.isProduct) {
        productToEdit = parent;
        targetActiveSlot = detail.slot || detail.id;
        if (detail.type === 'Стінова панель' && detail.parentDetailSide) {
          targetActiveSlot = `wall_panel_${detail.parentDetailSide}`;
        } else if (detail.type === 'Опора' && detail.parentDetailSide) {
          targetActiveSlot = `leg_${detail.parentDetailSide}`;
        }
      }
    }

    if (productToEdit) {
      const children = allDetails.filter(d => d.parentDetailId === productToEdit!.id);
      const session: ProductEditorSession = {
        editingProductId: productToEdit.id.split('__')[0],
        activeDetailId: targetActiveSlot,
        mainDetail: { ...draftFromDetail(productToEdit), skirtings: productToEdit.skirtings || {}, wallPanels: {}, legs: {} },
        subDetails: {}
      };
      
      children.forEach((child) => {
        const draft = draftFromDetail(child);
        if (child.type === 'Стінова панель' && child.parentDetailSide) {
            session.mainDetail.wallPanels[child.parentDetailSide] = { 
                edgeId: child.parentDetailSide,
                height: draft.height,
                thickness: draft.thickness,
                offset: child.importOffsetX || 0
            };
            session.subDetails[`wall_panel_${child.parentDetailSide}`] = draft;
        } else if (child.type === 'Опора' && child.parentDetailSide) {
            const isCorner = draft.shape === 'Г-подібна';
            session.mainDetail.legs[child.parentDetailSide] = {
                edgeId: child.parentDetailSide,
                width: draft.width,
                height: draft.height,
                size: isCorner ? `${draft.outerWidth}x${draft.outerHeight}` : String(draft.width),
                offset: child.importOffsetX || 0,
                jointType: ''
            };
            session.subDetails[`leg_${child.parentDetailSide}`] = draft;
        } else {
            const slotOrId = child.slot || child.id;
            session.subDetails[slotOrId] = draft;
        }
      });
      
      setProductEditorSession(session);
    } else {
      startEditDetail(detail.id);
    }
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
            {/* Дерево виробів — та сама структура, що в навігації редактора:
                Виріб → Елемент → Деталь / Доповнення. Кнопка редагування відкриває редактор. */}
            <div className="list-box">
              {(project.products || []).map((product: any) => {
                const rowCls = (id: string) =>
                  `flex items-center justify-between py-1 px-1 rounded-sm cursor-pointer ${
                    selectedDetailId === id ? 'bg-blue-50/60 text-[#1f93ef] font-bold' : 'hover:bg-slate-100'
                  }`;
                return (
                  <div key={product.id} className="flex flex-col gap-1 text-sm text-slate-600 mb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="font-bold text-slate-700 truncate">{product.name || 'Виріб'}</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button className="p-1 rounded-sm hover:bg-slate-100 text-slate-500" title="Редагувати виріб"
                          onClick={(e) => { e.stopPropagation(); openProductEditor(product); }}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button className="p-1 rounded-sm hover:bg-red-50 text-red-500" title="Видалити виріб"
                          onClick={(e) => { e.stopPropagation(); removeProduct(product.id); }}>
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {(product.elements || []).map((element: any) => {
                      const elDetailId = `${element.id}/detail:main`;
                      return (
                        <div key={element.id} className="ml-3 pl-3 border-l-2 border-slate-200 flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 mt-1">
                            <Folder className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-600 truncate">{ui(element.type)} (Елемент)</span>
                          </div>
                          <div className="ml-4 pl-3 border-l-2 border-slate-200 flex flex-col gap-0.5 pb-1">
                            <div className={rowCls(elDetailId)}
                              onClick={() => { setSelectedDetailId(elDetailId); setSelectedPlacementIds([]); }}>
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                <span className="truncate">{ui(element.type)} (Деталь)</span>
                              </div>
                              <button className="p-1 rounded-sm hover:bg-slate-100 text-slate-500 shrink-0" title="Редагувати"
                                onClick={(e) => { e.stopPropagation(); openProductEditor(product); }}>
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </div>
                            {(element.additions || []).map((add: any) => {
                              const addDetailId = `${add.id}/detail:main`;
                              return (
                                <div key={add.id} className={rowCls(addDetailId)}
                                  onClick={() => { setSelectedDetailId(addDetailId); setSelectedPlacementIds([]); }}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span className="truncate">{ui(add.type)} ({toSlot(add.id).replace(/^.*_/, '')}) (Доповнення)</span>
                                  </div>
                                  <button className="p-1 rounded-sm hover:bg-slate-100 text-slate-500 shrink-0" title="Редагувати"
                                    onClick={(e) => { e.stopPropagation(); openProductEditor(product); }}>
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Деталі-сироти: DXF, бланк погодження, ручні — показуємо як раніше, картками */}
              {listedDetails.filter((d) => !d.id.startsWith('prod_')).length ? listedDetails.filter((d) => !d.id.startsWith('prod_')).map((detail, index) => {
                const isSelected = selectedDetailId === detail.id;
                const children = allDetails.filter(d => d.parentDetailId === detail.id);
                return (
                <div key={detail.id} className="flex flex-col gap-2">
                  <div className={`list-item flex flex-col gap-3 p-3 cursor-pointer transition-colors border ${isSelected ? 'bg-blue-50/40 border-blue-200 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
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
                        <button className="w-9 h-9 flex items-center justify-center rounded-sm bg-white border border-slate-200 text-[#1e2d3d] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-slate-50 hover:border-slate-300 transition-colors" onClick={(e) => { e.stopPropagation(); editDetail(detail); }} title="Редагувати">
                          <Edit2 className="w-[17px] h-[17px] stroke-[2.2]" />
                        </button>
                        <button className="delete-button w-9 h-9 flex items-center justify-center rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:brightness-95 transition-all" onClick={(e) => { e.stopPropagation(); handleDeleteDetail(detail); }} title="Видалити">
                          <Trash className="w-[17px] h-[17px] stroke-[2.2]" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {children.length > 0 && (
                    <div className="ml-2 pl-3 border-l-2 border-slate-200 flex flex-col gap-2">
                       {children.map((child) => {
                          const isChildSelected = selectedDetailId === child.id;
                          return (
                            <div key={child.id} 
                                 onClick={(e) => { e.stopPropagation(); setSelectedDetailId(child.id); setSelectedPlacementIds([]); }} 
                                 className={`flex items-start gap-3 p-2 rounded-sm cursor-pointer border ${isChildSelected ? 'bg-blue-50/40 border-blue-200 shadow-sm' : 'bg-[#fcfdfd] border-slate-100 hover:bg-slate-50'}`}>
                               <div className="w-[60px] h-[60px] flex items-center justify-center bg-white border border-slate-100 shrink-0 rounded-sm">
                                  <DetailThumb detail={child} />
                               </div>
                               <div className="flex-1 min-w-0">
                                 <strong className="truncate block text-[13px] font-bold text-[#1e2d3d] mb-0.5">{child.label || child.type}</strong>
                                 <span className="truncate block text-[12px] text-[#536b7a] mb-0.5">{ui(child.shape)} / {detailDims(child, language)}</span>
                                 <span className="truncate block text-[12px] text-[#536b7a]">{ui('Кількість')}: {child.quantity}</span>
                               </div>
                            </div>
                          );
                       })}
                    </div>
                  )}
                </div>
              )}) : null}

              {/* Порожньо тільки якщо немає ані виробів, ані деталей-сиріт */}
              {!(project.products || []).length && !listedDetails.filter((d) => !d.id.startsWith('prod_')).length && (
                <div className="list-item muted">Деталей ще немає</div>
              )}
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
                const children = allDetails.filter(d => d.parentDetailId === detail.id);
                return (
                  <div key={detail.id} className="flex flex-col gap-2">
                    <div className="list-modal-card">
                      <DetailThumb detail={detail} />
                      <div className="list-modal-info">
                        <strong>{detail.label || `${detail.type} ${index + 1}`}</strong>
                        <span>{ui(detail.shape)} / {detailDims(detail, language)}</span>
                        <span>{ui('Кількість')}: {detail.quantity}</span>
                        {detail.importRole && <span>{ui('Роль')}: {detail.importRole}</span>}
                      </div>
                      <div className="list-actions flex-shrink-0">
                        <button className="icon-button flex items-center justify-center" onClick={() => editDetail(detail)} title="Редагувати">
                          <Edit2 className="w-[18px] h-[18px] stroke-[2.5]" />
                        </button>
                        {detail.isProduct && (
                          <button
                            className="p-2 text-[#ff4b4b] hover:bg-[#ffe5e5] rounded transition-colors"
                            onClick={() => deleteDetail(detail.id.split('__')[0])}
                            title={ui('Видалити')}
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        )}
                        {!detail.isProduct && (
                          <button
                            className="p-2 text-[#ff4b4b] hover:bg-[#ffe5e5] rounded transition-colors"
                            onClick={() => deleteDetail(detail.id)}
                            title={ui('Видалити')}
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {children.length > 0 && (
                      <div className="ml-4 pl-4 border-l-2 border-slate-200 flex flex-col gap-2">
                         {children.map((child) => (
                            <div key={child.id} className="list-modal-card" style={{ gridTemplateColumns: '80px 1fr auto' }}>
                               <DetailThumb detail={child} />
                               <div className="list-modal-info">
                                 <strong>{child.label || child.type}</strong>
                                 <span>{ui(child.shape)} / {detailDims(child, language)}</span>
                                 <span>{ui('Кількість')}: {child.quantity}</span>
                               </div>
                               <div className="list-actions flex-shrink-0">
                                  <button className="icon-button flex items-center justify-center" onClick={() => editDetail(child)} title="Редагувати">
                                    <Edit2 className="w-[18px] h-[18px] stroke-[2.5]" />
                                  </button>
                               </div>
                            </div>
                         ))}
                      </div>
                    )}
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

