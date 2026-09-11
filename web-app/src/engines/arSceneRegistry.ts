// =====================================================================
//  src/engines/arSceneRegistry.ts
//  №177 · Доступ до живої 3D-сцени з інших вкладок.
//
//  Пакет для МЕС збирається у вкладці «Документи», а модель виробу живе
//  у «3D Підборі»: інша вкладка, інше піддерево React. Тягнути 3D у
//  збирач пакета не можна (важко і повільно), тому Viewer3D лишає тут
//  посилання на групу з виробом, поки він змонтований.
//
//  Це НЕ стор і не кеш: жодного стану, лише вказівник на живий об'єкт
//  сцени. Прибирається при розмонтуванні — інакше експорт мовчки
//  віддавав би модель від попереднього замовлення, а це гірше, ніж
//  чесна відсутність моделі.
// =====================================================================

import type * as THREE from 'three';

let liveScene: THREE.Object3D | null = null;
let liveOrderNumber = '';

/** Viewer3D викликає це при монтуванні і з null при розмонтуванні. */
export function registerArScene(scene: THREE.Object3D | null, orderNumber: string): void {
  liveScene = scene;
  liveOrderNumber = scene ? orderNumber : '';
}

/**
 * Зняти реєстрацію ЛИШЕ своєї сцени. Потрібно, коли Viewer3D змонтовано
 * двічі (основна вкладка + прихований експорт для пакета МЕС, №179):
 * розмонтування прихованого не повинно стирати сцену основного.
 */
export function unregisterArScene(scene: THREE.Object3D | null): void {
  if (scene && liveScene !== scene) return;
  liveScene = null;
  liveOrderNumber = '';
}

/**
 * Сцена для експорту — тільки якщо вона від ТОГО САМОГО замовлення і в
 * ній справді є геометрія. Порожню групу (3D ще не домалював) повертати
 * не можна: далі вона стане порожнім GLB.
 */
export function getArScene(orderNumber: string): THREE.Object3D | null {
  if (!liveScene) return null;
  if (liveOrderNumber !== orderNumber) return null;
  return liveScene.children.length ? liveScene : null;
}
