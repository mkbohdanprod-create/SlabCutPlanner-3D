import { useMemo, useState } from 'react';
import type { Detail, Point, SlabInstance, UiLanguage } from '../../domain/types';
import { translateStaticUiText } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';

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

export function ListsPanel() {
  const { project, deleteSlab, deleteDetail, startEditDetail, setSelectedSlabId } = useProjectStore();
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
      <section className="panel lists-panel">
        <div>
          <div className="list-title-row">
            <h3>Список слебів</h3>
            <button type="button" onClick={() => setOpenList('slabs')}>Відкрити</button>
          </div>
          <div className="list-box">
            {project.slabs.length ? project.slabs.map((slab) => (
              <div key={slab.id} className="list-item list-row">
                <div>
                  <strong>{slab.serialNumber}</strong>
                  <span>{slab.width}×{slab.height} {ui('мм')}</span>
                  <span>{ui(slab.material)} / {slab.decor || ui('без декору')}</span>
                </div>
                <button className="delete-button" onClick={() => deleteSlab(slab.id)}>Видалити</button>
              </div>
            )) : <div className="list-item muted">Слебів ще немає</div>}
          </div>
        </div>
        <div>
          <div className="list-title-row">
            <h3>Список усіх деталей</h3>
            <button type="button" onClick={() => setOpenList('details')}>Відкрити</button>
          </div>
          <div className="list-box">
            {listedDetails.length ? listedDetails.map((detail, index) => (
              <div key={detail.id} className="list-item list-row">
                <div>
                  <strong>{detail.label || `${detail.type} ${index + 1}`}</strong>
                  <span>{ui(detail.shape)} / {detailDims(detail, language)}</span>
                  <span>{ui('Кількість')}: {detail.quantity}</span>
                </div>
                <div className="list-actions">
                  <button onClick={() => editDetail(detail.id)}>Редагувати</button>
                  <button className="delete-button" onClick={() => deleteDetail(detail.id)}>Видалити</button>
                </div>
              </div>
            )) : <div className="list-item muted">Деталей ще немає</div>}
          </div>
        </div>
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
                  <div className="list-actions">
                    <button onClick={() => { setSelectedSlabId(slab.id); setOpenList(null); }}>Вибрати</button>
                    <button className="delete-button" onClick={() => deleteSlab(slab.id)}>Видалити</button>
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
                    <div className="list-actions">
                      <button onClick={() => editDetail(detail.id)}>Редагувати</button>
                      <button className="delete-button" onClick={() => deleteDetail(detail.id)}>Видалити</button>
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

