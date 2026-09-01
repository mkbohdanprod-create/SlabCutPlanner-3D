import * as THREE from 'three';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/**
 * ГЕНЕРАТОР AR-МОДЕЛІ ВИРОБУ (прототип, 27.08.2026).
 *
 * Збирає виріб із каменю і віддає два файли: `.usdz` для айфона
 * (відкриється системним Quick Look) і `.glb` для Android.
 *
 * Одиниці — МЕТРИ. У програмі все в міліметрах, у форматах AR світ
 * метровий; помилка в тисячу разів тут класична, тому переведення
 * робиться один раз, у `mm()`, і більше ніде.
 *
 * Це чернетка під перевірку ідеї на живому клієнті. Коли шлях
 * підтвердиться, ця збірка переїде в застосунок і братиме геометрію з
 * реального виробу, а не з констант нижче.
 */

/** Міліметри → метри. Єдине місце переведення. */
const mm = (value: number) => value / 1000;

/** Габарити острівця — типовий виріб під демонстрацію */
const TOP_W = 2400;
const TOP_D = 900;
const TOP_H = 20;
const LEG_H = 880;
const LEG_T = 20;
const LEG_INSET = 120;

async function stoneMaterial(): Promise<THREE.MeshStandardMaterial> {
  const texture = await new THREE.TextureLoader().loadAsync('/ar-stone.jpg');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.45,
    metalness: 0.0,
  });
}

/**
 * Плита з каменю на своєму місці.
 *
 * Зсув «запікається» ПРЯМО В ГЕОМЕТРІЮ, а не лишається трансформом
 * об'єкта. Причина не в акуратності: USDZExporter не переносить позиції
 * вузлів так, як це робить експорт у glb — на першому ж прототипі всі
 * три плити з'їхали в один центр, і на айфоні виріб виглядав хрестом,
 * тоді як у glb стояв правильно. Запечена геометрія не залежить від
 * того, як конкретний експортер тлумачить дерево сцени.
 */
function slab(width: number, height: number, depth: number, material: THREE.Material, at: THREE.Vector3) {
  const geometry = new THREE.BoxGeometry(mm(width), mm(height), mm(depth));
  geometry.translate(at.x, at.y, at.z);
  return new THREE.Mesh(geometry, material);
}

export async function buildScene(): Promise<THREE.Group> {
  const material = await stoneMaterial();
  const group = new THREE.Group();

  group.add(slab(TOP_W, TOP_H, TOP_D, material,
    new THREE.Vector3(0, mm(LEG_H + TOP_H / 2), 0)));

  // Дві бічні опори з того самого каменю, трохи втоплені під стільницю
  [-1, 1].forEach((side) => {
    group.add(slab(LEG_T, LEG_H, TOP_D - LEG_INSET, material,
      new THREE.Vector3(side * mm(TOP_W / 2 - LEG_T / 2 - LEG_INSET), mm(LEG_H / 2), 0)));
  });

  return group;
}

declare global {
  interface Window {
    __arFiles?: { usdz: string; glb: string };
    __arError?: string;
  }
}

/** Uint8Array → base64 без переповнення стека на великих файлах */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function run() {
  try {
    const group = await buildScene();
    const scene = new THREE.Scene();
    scene.add(group);
    // Матриці мають бути порахованими до експорту — інакше експортер
    // бачить дерево в стані «ще нічого не рухалось».
    scene.updateMatrixWorld(true);

    const usdz = await new USDZExporter().parseAsync(scene);

    const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
      new GLTFExporter().parse(
        scene,
        (result) => resolve(result as ArrayBuffer),
        (error) => reject(error),
        { binary: true },
      );
    });

    window.__arFiles = {
      usdz: toBase64(usdz as Uint8Array),
      glb: toBase64(new Uint8Array(glb)),
    };
    document.title = 'AR READY';
  } catch (error) {
    window.__arError = String(error);
    document.title = 'AR FAILED';
  }
}

run();
