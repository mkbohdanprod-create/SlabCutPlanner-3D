import * as THREE from 'three';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/**
 * ЕКСПОРТ ВИРОБУ В ДОПОВНЕНУ РЕАЛЬНІСТЬ (27.08.2026, задача власника).
 *
 * Бере ту саму збірку, яку менеджер бачить у «3D Підборі», і віддає два
 * файли: `.usdz` — айфон відкриє його системним Quick Look, `.glb` —
 * Android. Клієнт ставить виріб у себе на кухні в натуральну величину.
 *
 * Чому два формати: Apple не пускає веб-сторінку до камери (WebXR на iOS
 * немає і не планується), тому там працює свій системний переглядач зі
 * своїм форматом. Android розуміє загальний glb. Це не наша примха — це
 * стан ринку, і він не обходиться.
 *
 * ОДИНИЦІ. Сцена 3D уже живе в МЕТРАХ (див. `/ 1000` у Viewer3D), і
 * формати AR теж метрові — тому тут переведення немає й бути не повинно.
 * Якщо колись сцена перейде на міліметри, виріб приїде до клієнта
 * розміром із квартал; тому масштаб перевіряється тестом.
 */

/** Більше за це AR-файл стає неприйнятним для мобільного інтернету */
const MAX_TEXTURE = 1024;

export interface ArExportResult {
  glb: Blob;
  usdz: Blob;
  /** Габарит виробу в міліметрах — для підпису і для перевірки масштабу */
  sizeMm: { x: number; y: number; z: number };
}

/**
 * Зменшує текстуру до розумного для телефона розміру.
 *
 * Фото слеба в нас лежить сирим — 2–8 МБ на лист. У AR-модель таке
 * класти не можна: клієнт на мобільному інтернеті просто закриє
 * сторінку, не дочекавшись. Зменшена копія робиться один раз на текстуру
 * і кешується, щоб три деталі з одного слеба не малювали її тричі.
 */
/**
 * Ключ кешу — САМА КАРТИНКА, а не об'єкт текстури: сцена клонує текстуру
 * під кожну деталь, і кеш по об'єктах давав 12 копій того самого каменю
 * в одному файлі (перший експорт фотозони — 17.8 МБ).
 */
const shrunk = new WeakMap<object, THREE.Texture>();

function shrinkTexture(texture: THREE.Texture): THREE.Texture {
  const cacheKey = (texture.image as object) ?? texture;
  const cached = shrunk.get(cacheKey);
  if (cached) return cached;

  const image = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
  const width = (image as HTMLImageElement)?.naturalWidth ?? image?.width ?? 0;
  const height = (image as HTMLImageElement)?.naturalHeight ?? image?.height ?? 0;
  if (!image || !width || (width <= MAX_TEXTURE && height <= MAX_TEXTURE)) return texture;

  const scale = MAX_TEXTURE / Math.max(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return texture;
  ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height);

  const small = new THREE.CanvasTexture(canvas);
  small.colorSpace = texture.colorSpace;
  small.wrapS = texture.wrapS;
  small.wrapT = texture.wrapT;
  small.repeat.copy(texture.repeat);
  small.offset.copy(texture.offset);
  small.center.copy(texture.center);
  small.rotation = texture.rotation;
  small.matrixAutoUpdate = texture.matrixAutoUpdate;
  small.needsUpdate = true;
  shrunk.set(cacheKey, small);
  return small;
}


/**
 * ШИЛЬДИК «VIYAR STONE 3D · AR» (27.08, прохання власника).
 *
 * Невелика табличка на підлозі перед виробом — як музейна: видно, чия це
 * модель і з якого замовлення. Модель, яку клієнт зберіг у себе,
 * подорожує далі без нас: пересилається, показується сусідам, іноді
 * лягає в чужу презентацію. Підпис усередині самої геометрії — єдине,
 * що переживає таку подорож.
 *
 * Текст малюється в canvas і йде текстурою: у форматах AR немає
 * шрифтів, будь-який напис — це або картинка, або тисячі трикутників.
 */
function makeSignPlate(caption: string, subline: string): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#15181b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0084ff';
    ctx.fillRect(0, 0, canvas.width, 8);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4f6f8';
    ctx.font = '700 104px Roboto, Arial, sans-serif';
    ctx.fillText(caption, canvas.width / 2, 132);
    ctx.fillStyle = '#9fb0c0';
    ctx.font = '500 54px Roboto, Arial, sans-serif';
    ctx.fillText(subline, canvas.width / 2, 200);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  // 420 × 105 мм, товщина 12 — розмір справжньої настільної таблички
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.012, 0.105),
    [
      new THREE.MeshStandardMaterial({ color: '#15181b', roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: '#15181b', roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5 }),  // верх — напис
      new THREE.MeshStandardMaterial({ color: '#15181b', roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: '#15181b', roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: '#15181b', roughness: 0.6 }),
    ],
  );
  return plate;
}

/**
 * Готує копію збірки до експорту: запікає трансформи в геометрію,
 * ставить виріб на підлогу і в центр, полегшує текстури.
 *
 * Запікання — не педантизм. USDZExporter переносить позиції вузлів не
 * так, як експорт у glb: на першому прототипі всі плити з'їхали в один
 * центр, і на айфоні виріб виглядав хрестом, тоді як у glb стояв
 * правильно. Запечена геометрія не залежить від тлумачення дерева сцени.
 */
/**
 * Чи належить меш інтерфейсу сцени, а не виробу.
 *
 * У дереві виробів живуть і органи керування: стрілки переміщення,
 * кільця повороту TransformControls і його невидима площина перетягування
 * розміром 100 КІЛОМЕТРІВ. Перший експорт фотозони поїхав у SketchUp
 * разом з усім цим — 119 мешів, габарит 100 км, виріб підкинуло
 * центруванням на 42 км угору, імпорт упав. Тому: (а) гілки
 * TransformControls відсікаються за предками, (б) страхувальна межа —
 * виробів з каменю понад 50 метрів не буває.
 */
function isSceneHelper(node: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = node;
  while (current) {
    if (current.type?.startsWith('TransformControls')) return true;
    if ((current as { isTransformControls?: boolean }).isTransformControls) return true;
    if (current.userData?.helper) return true;
    current = current.parent;
  }
  return false;
}

/** Страхувальна межа розміру одного меша, метри */
const MAX_MESH_SIZE = 50;

function prepare(source: THREE.Object3D, sign?: { caption: string; subline: string }): { root: THREE.Group; sizeMm: ArExportResult['sizeMm'] } {
  source.updateMatrixWorld(true);
  const root = new THREE.Group();

  source.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    // Допоміжні об'єкти сцени (стрілки переміщення, підсвітка вибору)
    // у виріб не входять — клієнт має побачити камінь, а не наш інтерфейс.
    if (!mesh.visible || isSceneHelper(mesh)) return;

    // «Товсті лінії» (контури деталей, стрілки якорів) — технічно теж
    // меші (Line2/LineSegments2), але їхня геометрія — інстансований
    // квад 2×3 м. В експорті фотозони вони давали вісім білих штор і
    // ламали центрування. Лінії — атрибут екрана, не виробу.
    const lineLike = mesh as { isLine2?: boolean; isLineSegments2?: boolean };
    if (lineLike.isLine2 || lineLike.isLineSegments2
      || mesh.type === 'Line2' || mesh.type === 'LineSegments2' || mesh.type === 'Wireframe') return;

    // Прозорі службові меші (хітбокси кліку, площини перетягування)
    // повз фільтр предків: у сцені їх не видно, але нижче ми форсуємо
    // opacity=1 — і в SketchUp вони ставали білими шторами 2×3 м, а їхній
    // габарит ламав центрування. Реальний камінь ніколи не прозорий.
    const probe = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined;
    if (probe && ((probe.transparent && (probe.opacity ?? 1) < 0.5) || probe.colorWrite === false)) return;

    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);

    geometry.computeBoundingBox();
    const meshBox = geometry.boundingBox;
    if (meshBox) {
      const meshSize = meshBox.getSize(new THREE.Vector3());
      if (Math.max(meshSize.x, meshSize.y, meshSize.z) > MAX_MESH_SIZE) return;
    }

    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .map((item) => {
        const material = (item as THREE.MeshStandardMaterial).clone() as THREE.MeshStandardMaterial;
        if (material.map) material.map = shrinkTexture(material.map);
        // Прозорість у Quick Look читається погано і дає «скляний» камінь
        material.transparent = false;
        material.opacity = 1;
        return material;
      });

    root.add(new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials));
  });

  // Виріб на підлогу і в центр: у сцені він стоїть там, куди його поклав
  // менеджер, а в кімнаті клієнта має з'явитись під ногами.
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.children.forEach((child) => {
    (child as THREE.Mesh).geometry.translate(-center.x, -box.min.y, -center.z);
  });

  // Шильдик ставимо ПІСЛЯ центрування виробу — щоб він ліг перед ним на
  // підлозі, а не поїхав разом із геометрією.
  if (sign) {
    const plate = makeSignPlate(sign.caption, sign.subline);
    plate.position.set(0, 0.006, size.z / 2 + 0.14);
    plate.updateMatrixWorld(true);
    plate.geometry.applyMatrix4(plate.matrix);
    plate.position.set(0, 0, 0);
    root.add(plate);
  }

  return {
    root,
    sizeMm: {
      x: Math.round(size.x * 1000),
      y: Math.round(size.y * 1000),
      z: Math.round(size.z * 1000),
    },
  };
}

/** Збирає обидва файли з готової 3D-збірки виробу */
export async function exportForAr(
  source: THREE.Object3D,
  sign?: { caption: string; subline: string },
): Promise<ArExportResult> {
  const { root, sizeMm } = prepare(source, sign);
  if (!root.children.length) throw new Error('У сцені немає жодної деталі для експорту');

  const scene = new THREE.Scene();
  scene.add(root);
  scene.updateMatrixWorld(true);

  const usdzBytes = await new USDZExporter().parseAsync(scene);
  const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(
      scene,
      (result) => resolve(result as ArrayBuffer),
      (error) => reject(error),
      { binary: true },
    );
  });

  return {
    glb: new Blob([glbBuffer], { type: 'model/gltf-binary' }),
    usdz: new Blob([usdzBytes as Uint8Array], { type: 'model/vnd.usdz+zip' }),
    sizeMm,
  };
}

/**
 * Ім'я файлу — ЛИШЕ ЛАТИНИЦЯ.
 *
 * Кирилиця в download-імені перетворюється на «????.glb» (перевірено на
 * Windows), і SketchUp такий файл відмовляється імпортувати. Тому назва
 * транслітерується за українською таблицею, а все, що лишилось поза
 * латиницею й цифрами, — у підкреслення.
 */
const UK_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh',
  з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'e', ъ: '',
};

function translit(value: string): string {
  return Array.from(value).map((ch) => {
    const low = ch.toLowerCase();
    const mapped = UK_TO_LAT[low];
    if (mapped === undefined) return ch;
    return ch === low ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }).join('');
}

export function arFileName(orderNumber: string, productName: string, extension: string) {
  const clean = (value: string) => translit(value.trim())
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${clean(orderNumber) || 'vyrib'}_${clean(productName) || 'AR'}.${extension}`;
}
