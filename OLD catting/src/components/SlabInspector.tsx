import { ChangeEvent, useState } from 'react';
import { uid } from '../domain/defaults';
import { DefectZone, Point } from '../domain/types';
import { translateStaticUiText } from '../i18n';
import { useProjectStore } from '../store/useProjectStore';
import { readFileAsDataUrl } from '../utils/file';

function defaultPolygon(x: number, y: number, width: number, height: number): Point[] {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

export function SlabInspector() {
  const { project, selectedSlabId, setSelectedSlabId, updateSlab, addDefect, updateDefect, deleteDefect } = useProjectStore();
  const language = project.uiLanguage ?? 'uk';
  const ui = (value: string) => translateStaticUiText(language, value);
  const [newDefectShape, setNewDefectShape] = useState<DefectZone['shapeType']>('rect');
  const slab = project.slabs.find((s) => s.id === selectedSlabId) ?? project.slabs[0];
  if (!slab) return null;

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const photo = await readFileAsDataUrl(file);
    updateSlab(slab.id, { photo });
  };

  const addDefectClick = (shapeType: DefectZone['shapeType']) => {
    const defect: DefectZone = { id: uid('defect'), shapeType, x: 120, y: 120, width: 180, height: 100, comment: 'Дефект', points: defaultPolygon(120, 120, 180, 100) };
    addDefect(slab.id, defect);
  };

  return (
    <section className="panel compact-panel">
      <div className="toolbar compact"><h3>Інспектор слеба</h3><select value={slab.id} onChange={(e) => setSelectedSlabId(e.target.value)}>{project.slabs.map((item) => <option key={item.id} value={item.id}>{item.serialNumber}</option>)}</select></div>
      <div className="form-grid compact small-grid">
        <div><label>Масштаб фото</label><input type="number" step="0.1" value={slab.textureTransform.scale} onChange={(e) => updateSlab(slab.id, { textureTransform: { ...slab.textureTransform, scale: Number(e.target.value) } })} /></div>
        <div><label>Offset X</label><input type="number" value={slab.textureTransform.offsetX} onChange={(e) => updateSlab(slab.id, { textureTransform: { ...slab.textureTransform, offsetX: Number(e.target.value) } })} /></div>
        <div><label>Offset Y</label><input type="number" value={slab.textureTransform.offsetY} onChange={(e) => updateSlab(slab.id, { textureTransform: { ...slab.textureTransform, offsetY: Number(e.target.value) } })} /></div>
        <div><label>Прозорість</label><input type="number" step="0.05" min="0" max="1" value={slab.textureTransform.opacity} onChange={(e) => updateSlab(slab.id, { textureTransform: { ...slab.textureTransform, opacity: Number(e.target.value) } })} /></div>
      </div>
      <div className="toolbar compact"><label className="file-field short"><span>Фото</span><input type="file" accept="image/*" onChange={onPhoto} /></label><button onClick={() => updateSlab(slab.id, { textureTransform: { ...slab.textureTransform, rotation: (((slab.textureTransform.rotation + 90) % 360) as 0 | 90 | 180 | 270) } })}>Поворот фото 90°</button></div>
      <div className="toolbar compact">
        <span className="muted">Дефекти:</span>
        <div className="defect-add-control">
          <select value={newDefectShape} onChange={(event) => setNewDefectShape(event.target.value as DefectZone['shapeType'])}>
            <option value="rect">{ui('Прямокутник')}</option>
            <option value="circle">{ui('Коло')}</option>
            <option value="triangle">{ui('Трикутник')}</option>
            <option value="polygon">{ui('Полігон')}</option>
          </select>
          <button onClick={() => addDefectClick(newDefectShape)}>{ui('Дефект')}</button>
        </div>
      </div>
      {slab.defects.map((defect) => (
        <div key={defect.id} className="mini-panel defect-editor">
          <div className="mini-panel-header">
            <strong>{ui(defect.comment || 'Дефект')}</strong>
            <button className="delete-button" onClick={() => deleteDefect(slab.id, defect.id)}>Видалити</button>
          </div>
          <div className="form-grid compact small-grid">
            <div><label>X</label><input type="number" value={defect.x} onChange={(e) => updateDefect(slab.id, defect.id, { x: Number(e.target.value) })} /></div>
            <div><label>Y</label><input type="number" value={defect.y} onChange={(e) => updateDefect(slab.id, defect.id, { y: Number(e.target.value) })} /></div>
            <div><label>Ширина</label><input type="number" value={defect.width} onChange={(e) => updateDefect(slab.id, defect.id, { width: Number(e.target.value) })} /></div>
            <div><label>Висота</label><input type="number" value={defect.height} onChange={(e) => updateDefect(slab.id, defect.id, { height: Number(e.target.value) })} /></div>
            <div><label>Коментар</label><input value={defect.comment || ''} onChange={(e) => updateDefect(slab.id, defect.id, { comment: e.target.value })} /></div>
            <div><label>Форма</label><select value={defect.shapeType} onChange={(e) => updateDefect(slab.id, defect.id, { shapeType: e.target.value as DefectZone['shapeType'] })}><option value="rect">{ui('Прямокутник')}</option><option value="circle">{ui('Коло')}</option><option value="triangle">{ui('Трикутник')}</option><option value="polygon">{ui('Полігон')}</option></select></div>
          </div>
          {defect.shapeType === 'polygon' && <div><label>Точки полігону (x,y через ;)</label><input value={(defect.points ?? []).map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join('; ')} onChange={(e) => updateDefect(slab.id, defect.id, { points: e.target.value.split(';').map((item) => item.trim()).filter(Boolean).map((item) => { const [x, y] = item.split(',').map(Number); return { x, y }; }) })} /></div>}
        </div>
      ))}
    </section>
  );
}
