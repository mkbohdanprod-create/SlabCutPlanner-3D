// =====================================================================
//  src/engines/partsGlb.ts
//  №177 · GLB заготовок — щоб модель у пакеті для МЕС була ЗАВЖДИ.
//
//  Головна модель береться з живої 3D-сцени (arSceneRegistry): там виріб
//  зібраний, з текстурами й стиками. Але «Зберегти для МЕС» тиснуть з
//  вкладки «Документи», і 3D може бути просто не відкрите — а власник
//  просив ОДНУ кнопку, після якої в архіві вже все. Тому тут — чесний
//  запасний варіант: кожна заготовка окремим вузлом, з тим самим
//  контуром і вирізами, що в розкрої.
//
//  Що це НЕ є: не зібраний виріб. Деталі лежать плоско поруч, як на
//  столі. Для зіставлення «вузол GLB ↔ деталь у розкрої» цього досить —
//  саме цього просив МЕС, — а видавати плоску розкладку за модель виробу
//  ми не будемо: у manifest вона підписана `parts-flat`.
// =====================================================================

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { DetailPart } from '../domain/types';

/** Проміжок між заготовками в розкладці, мм. */
const GAP_MM = 60;
const DEFAULT_THICKNESS_MM = 20;

export interface PartsGlbResult {
  bytes: Uint8Array;
  /** Скільки заготовок реально потрапило в модель. */
  nodes: number;
  geometryState: 'parts-flat';
}

function shapeFromPart(part: DetailPart): THREE.Shape | null {
  const points = part.points ?? [];
  if (points.length < 3) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));

  const shape = new THREE.Shape(points.map((point) => new THREE.Vector2(point.x - minX, point.y - minY)));

  // Вирізи (мийка, варильна, отвори) — ті самі, що в розкрої. Обхід
  // реверсимо: three вимагає протилежного напрямку для дірки.
  (part.holes ?? []).forEach((hole) => {
    if (!Array.isArray(hole) || hole.length < 3) return;
    const path = new THREE.Path();
    [...hole].reverse().forEach((point, index) => {
      const x = point.x - minX;
      const y = point.y - minY;
      if (index === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    path.closePath();
    shape.holes.push(path);
  });

  return shape;
}

/**
 * Заготовки → GLB. Одиниці — МЕТРИ (стандарт glTF), Y вгору: деталь
 * лежить у площині XZ, товщина йде вгору по Y.
 *
 * Ім'я вузла = instanceId заготовки, `extras` = {instanceId, partId,
 * detailId} — те, за чим МЕС зіставляє деталь у 3D з розкроєм.
 */
export async function buildPartsGlb(parts: DetailPart[]): Promise<PartsGlbResult | null> {
  const root = new THREE.Group();
  root.name = 'parts';
  let cursorMm = 0;
  let nodes = 0;

  for (const part of parts) {
    const shape = shapeFromPart(part);
    if (!shape) continue;
    const thickness = part.thickness ?? DEFAULT_THICKNESS_MM;

    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 24 });
    // Екструзія росте по +Z; кладемо деталь на «підлогу», щоб товщина
    // йшла вгору по Y, як в усіх наших моделях.
    geometry.rotateX(-Math.PI / 2);
    geometry.scale(0.001, 0.001, 0.001);
    geometry.translate(cursorMm * 0.001, 0, 0);
    cursorMm += part.width + GAP_MM;

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: '#d9d4cc', roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide }),
    );
    mesh.name = part.id;
    mesh.userData = { instanceId: part.id, partId: part.detailId, detailId: part.detailId, name: part.name };
    root.add(mesh);
    nodes += 1;
  }

  if (!nodes) return null;

  const scene = new THREE.Scene();
  scene.add(root);
  scene.updateMatrixWorld(true);

  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(
      scene,
      (result) => resolve(result as ArrayBuffer),
      (error) => reject(error),
      { binary: true },
    );
  });

  return { bytes: new Uint8Array(buffer), nodes, geometryState: 'parts-flat' };
}
