import type { DetailPart, Placement, Project } from '../domain/types';
import { DEFAULT_ALLOWANCES, defaultCommercialQuoteSettings, mergeBuiltinEdgeProfiles, referenceData } from '../domain/defaults';
import { explodeDetails } from '../engines/geometry';
import { detectConflicts } from '../engines/packing';

/**
 * Нога (опора) клеїться під 45° — «водоспад». Старі проєкти створені до
 * цього правила несуть на стику ноги type:'butt': інтерфейс вибору типу
 * стику не мав, тож це не могло бути свідомим рішенням користувача —
 * мігруємо мовчки. Стики бортиків, панелей і підворотів не чіпаємо.
 */
function fixLegJoints(products: Project['products']): Project['products'] {
  if (!products?.length) return products ?? [];
  const fixElement = (element: any): any => ({
    ...element,
    joints: (element.joints ?? []).map((joint: any) => (
      typeof joint?.id === 'string' && joint.id.startsWith('joint_leg_') && joint.type === 'butt'
        ? { ...joint, type: 'miter45' }
        : joint
    )),
    additions: (element.additions ?? []).map(fixElement),
  });
  return products.map((product) => ({
    ...product,
    elements: (product.elements ?? []).map(fixElement),
  }));
}

export function normalizeProject(project: Project): Project {
  return {
    ...project,
    products: fixLegJoints(project.products),
    // Довідник профілів їде разом із проєктом — доливаємо нові вбудовані,
    // інакше старі проєкти ніколи не побачать AR12/D20/ZS20 у випадачках.
    referenceData: {
      ...referenceData,
      ...(project.referenceData ?? {}),
      edgeProfiles: mergeBuiltinEdgeProfiles(project.referenceData?.edgeProfiles),
    },
    uiLanguage: project.uiLanguage ?? 'uk', 
    textureFrames: project.textureFrames ?? [], 
    manualDimensions: project.manualDimensions ?? [], 
    allowances: { ...DEFAULT_ALLOWANCES, ...(project.allowances ?? {}) },
    commercialQuote: {
      ...defaultCommercialQuoteSettings,
      ...(project.commercialQuote ?? {}),
      edgePrices: {
        ...defaultCommercialQuoteSettings.edgePrices,
        ...(project.commercialQuote?.edgePrices ?? {}),
      },
      manualLines: project.commercialQuote?.manualLines ?? [],
      lineOverrides: project.commercialQuote?.lineOverrides ?? {},
    }
  };
}

export function calcStatus(project: Project, placements: Placement[]) {
  const hasConflict = placements.some((p) => p.conflict);
  return hasConflict ? 'error' : project.calculationStatus;
}

export function loadWithoutPacking(project: Project) {
  const normalized = normalizeProject(project);
  
  // Clear legacy fold and thickening for details generated from Products
  // so they don't produce duplicate edge parts in the cutting engine.
  // We do this here rather than in flattenProductToDetails so the Editor
  // can still reconstruct its session using getAllProjectDetails().
  // ВАЖЛИВО: беремо ВСІ деталі — сироти (DXF, бланк, ручні) ПЛЮС розгорнуті вироби.
  // Раніше тут стояло тільке normalized.details, тому після перезавантаження сторінки
  // вироби зникали з розкрою і поверталися лише після повторного збереження виробу
  // (бо addProduct/updateProduct викликають пакування вже через getAllProjectDetails).
  const detailsForNesting = getAllProjectDetails(normalized).map(d => {
    if (d.id.includes('prod_')) {
      return { 
        ...d, 
        fold: d.fold ? { ...d.fold, enabled: false } : undefined, 
        thickening: d.thickening ? { ...d.thickening, enabled: false } : undefined 
      };
    }
    return d;
  });
  
  const parts = explodeDetails(detailsForNesting, normalized.allowances);
  const placements = detectConflicts(normalized, parts, normalized.placements);
  const nextProject = { ...normalized, placements } as Project;
  nextProject.calculationStatus = calcStatus(nextProject, placements);
  return { project: nextProject, parts };
}

export function partIdentity(part: DetailPart) {
  const kind = part.isMain ? 'main' : part.edgeKind ?? 'part';
  const side = part.edgeSide ?? 'body';
  const group = part.textureGroupLabel ?? part.parentLabel;
  const offsetX = Math.round(part.textureOffsetX ?? 0);
  const offsetY = Math.round(part.textureOffsetY ?? 0);
  return [part.detailId, kind, side, group, offsetX, offsetY].join('|');
}

export function remapStoredPartReferences(project: Project, previousParts: DetailPart[], nextParts: DetailPart[]): Project {
  if (!previousParts.length) return project;
  const nextIds = new Set(nextParts.map((part) => part.id));
  const previousById = new Map(previousParts.map((part) => [part.id, part]));
  const nextIdByIdentity = new Map(nextParts.map((part) => [partIdentity(part), part.id]));
  const remapPartId = (partId: string) => {
    if (nextIds.has(partId)) return partId;
    const previousPart = previousById.get(partId);
    return previousPart ? nextIdByIdentity.get(partIdentity(previousPart)) ?? partId : partId;
  };
  const unplacedReasons = Object.fromEntries(
    Object.entries(project.unplacedReasons ?? {}).map(([partId, reason]) => [remapPartId(partId), reason]),
  );
  return {
    ...project,
    placements: project.placements.map((placement) => ({ ...placement, partId: remapPartId(placement.partId) })),
    textureLayouts: project.textureLayouts.map((layout) => ({ ...layout, partId: remapPartId(layout.partId) })),
    unplacedPartIds: project.unplacedPartIds.map(remapPartId),
    unplacedReasons,
  } as Project;
}

export function genitiveLabel(label: string) {
  const words = label.trim().split(/\s+/);
  if (!words.length) return label;
  const typedForms: Array<[RegExp, string]> = [
    [/^Стільниця\b/i, 'стільниці'],
    [/^Стінова панель\b/i, 'стінової панелі'],
    [/^Мийка\b/i, 'мийки'],
    [/^Фасад\b/i, 'фасаду'],
    [/^Опора\b/i, 'опори'],
  ];
  const typed = typedForms.find(([pattern]) => pattern.test(label));
  if (typed) return label.replace(typed[0], typed[1]);

  return words.map((word, index) => {
    const lower = word[0].toLocaleLowerCase('uk-UA') + word.slice(1);
    if (index === 0 && lower.endsWith('ий')) return `${lower.slice(0, -2)}ого`;
    if (index === 0 && lower.endsWith('ій')) return `${lower.slice(0, -2)}ього`;
    if (index === words.length - 1 && /[бвгґджзклмнпрстфхцчшщ]$/i.test(lower)) return `${lower}у`;
    return lower;
  }).join(' ');
}

export function partNameForLabel(part: DetailPart, label: string) {
  if (part.isMain || !part.edgeKind || !part.edgeSide) return label;
  const prefix = part.edgeKind === 'fold' ? 'Підворот' : 'Потовщення';
  return `${prefix} ${genitiveLabel(label)} сторона ${part.edgeSide}`;
}

import { elementToDetail } from '../domain/elementToDetail';
import type { Product, ProductElement, Detail } from '../domain/types';

/**
 * Текстурні кластери виробу (§7.1).
 *
 * Вершини графа — Елементи, ребра — стики з `textureContinuity: true`.
 * Зв'язні компоненти й є групами, які нестинг має класти разом: бортик зі
 * стільницею тримає малюнок, нога під столом — ні.
 *
 * Мітка навмисно з префіксом `tg:` — за ним `packing.ts` розуміє, що це
 * кластер ВИРОБУ, який перетинає межі окремих деталей, і не має права
 * дописувати до ключа `detailId`.
 *
 * Цикл у графі (П-подібна стільниця) не ламає обхід — просто дає один
 * компонент. Де саме рвати малюнок у циклі, вирішує вже розгортка (§7.2).
 */
function textureClusterLabels(product: Product): Map<string, string> {
  const adjacency = new Map<string, Set<string>>();
  const ensure = (id: string) => {
    if (!adjacency.has(id)) adjacency.set(id, new Set());
    return adjacency.get(id)!;
  };

  const walk = (element: ProductElement) => {
    ensure(element.id);
    (element.joints ?? []).forEach((joint) => {
      if (!joint.textureContinuity) return;
      const a = joint.a?.elementPath;
      const b = joint.b?.elementPath;
      if (!a || !b || a === b) return;
      ensure(a).add(b);
      ensure(b).add(a);
    });
    (element.additions ?? []).forEach(walk);
  };
  (product.elements ?? []).forEach(walk);

  const labels = new Map<string, string>();
  let componentIndex = 0;

  adjacency.forEach((_, startId) => {
    if (labels.has(startId)) return;
    const label = `tg:${product.id}:${componentIndex}`;
    componentIndex += 1;

    const queue = [startId];
    labels.set(startId, label);
    while (queue.length) {
      const current = queue.shift()!;
      (adjacency.get(current) ?? new Set<string>()).forEach((next) => {
        if (labels.has(next)) return;
        labels.set(next, label);
        queue.push(next);
      });
    }
  });

  return labels;
}

export function flattenProductToDetails(product: Product): Detail[] {
  const details: Detail[] = [];
  if (!product.elements || product.elements.length === 0) return details;

  const clusterLabels = textureClusterLabels(product);

  // Рекурсивний обхід доповнень (additions)
  const processAdditions = (element: ProductElement, parentDetailId: string, currentDepth: number = 1) => {
    if (currentDepth > 1 && element.additions.length > 0) {
      console.warn(`[flattenProductToDetails] Увага: виявлено вкладеність доповнень більшу за 1 (елемент ${element.id}). ` +
        `Рушій explodeDetails не підтримує importMeta для глибокої вкладеності. Можливі помилки розкрою/позиціонування.`);
    }

    element.additions.forEach(addition => {
      // Find the root detail's quantity for this subtree
      const additionDetail = elementToDetail(addition, 1, false, parentDetailId);
      additionDetail.textureGroupLabel = clusterLabels.get(addition.id);
      details.push(additionDetail);

      processAdditions(addition, additionDetail.id, currentDepth + 1);
    });
  };

  // Обходимо всі елементи верхнього рівня (наприклад, Стільниця, Опора, Стінова панель)
  product.elements.forEach(mainElement => {
    const isRoot = mainElement.id.endsWith(':main');
    const rootDetail = elementToDetail(mainElement, 1, isRoot, undefined, undefined, isRoot ? product.name : undefined);
    rootDetail.textureGroupLabel = clusterLabels.get(mainElement.id);
    details.push(rootDetail);

    processAdditions(mainElement, rootDetail.id);
  });
  
  return details;
}

export function getAllProjectDetails(project: Project): Detail[] {
  const legacyDetails = project.details || [];
  const productDetails = (project.products || []).flatMap(flattenProductToDetails);
  return [...legacyDetails, ...productDetails];
}

export function explodeDetailsWrapped(details: any[], allowances: any = { cut: 5, edge: 2 }) {
  const detailsForNesting = details.map(d => {
    if (d.id && d.id.includes('prod_')) {
      return { 
        ...d, 
        fold: d.fold ? { ...d.fold, enabled: false } : undefined, 
        thickening: d.thickening ? { ...d.thickening, enabled: false } : undefined 
      };
    }
    return d;
  });

  const parts = explodeDetails(detailsForNesting, allowances);
  
  const derivedJoints: any[] = [];
  
  details.forEach(detail => {
    if (detail.shape === 'Г-подібна') {
      const g = detail.geometry as any;
      if (!g.wholeDetail) {
        const nominalOW = g.outerWidth ?? 1800;
        const nominalOH = g.outerHeight ?? 1200;
        const ih = Math.min(g.innerHorizontal ?? 900, nominalOW - 20);
        const iv = Math.min(g.innerVertical ?? 500, nominalOH - 20);
        
        let length = 0;
        if (g.jointDirection === 'vertical') {
          length = iv; 
        } else {
          length = ih; 
        }
        
        derivedJoints.push({
          id: `joint_derived_${detail.id}`,
          origin: 'derived',
          a: { elementPath: detail.id, sideId: 'derived_A', from: 0, to: length },
          b: { elementPath: detail.id, sideId: 'derived_B', from: 0, to: length },
          type: 'butt',
          dominant: 'a',
          textureContinuity: true
        });
      }
    }
  });

  return { parts, derivedJoints };
}
