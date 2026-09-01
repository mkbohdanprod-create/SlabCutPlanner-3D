import { createDraft } from './components/forms/utils/draftHelpers';
import { buildProductFromSession } from './components/ui/ProductEditorWorkspace';
import { useProjectStore } from './store/useProjectStore';
import type { Product } from './domain/types';

/**
 * ЗБІРКА ФОТОЗОНИ (робочий інструмент, 27.08.2026).
 *
 * Складає композицію з ТЗ власника — подіум у три яруси, вертикальний фон
 * і серце — як набір виробів проєкту, щоб вона з'явилась не лише в
 * розкрої, а й у 3D-збірці (а звідти пішла в AR).
 *
 * Чому виробами, а не деталями: сцена 3D читає `project.products`.
 * Окремі `details` (як їх кладе DXF чи бланк) у розкрій потрапляють, а в
 * збірку — ні; саме на цьому перша версія проєкту показала порожню сцену.
 *
 * Виріб будується тією ж функцією, що й редактор при збереженні
 * (`buildProductFromSession`) — інакше структура розійшлася б із тим, що
 * очікує решта програми.
 */

const THICK = 20;

/** Один плаский елемент композиції: тип, габарит, висота установки */
function makeProduct(
  id: string,
  name: string,
  opts: {
    type: 'Стільниця' | 'Стінова панель' | 'Довільний елемент';
    width: number;
    height: number;
    elevation: number;
    points?: Array<{ x: number; y: number }>;
    place: { x: number; z: number; rotationYDeg: number };
    /** Вертикальні плити на ребрах стільниці — фон і серце тримаються саме так */
    wallPanels?: Record<string, { edgeId: string; material: string; width: number; height: number; offset: number; thickness: number }>;
    /** Контур для стінової панелі (серце) */
    panelPoints?: Array<{ x: number; y: number }>;
  },
): Product {
  const draft = {
    ...createDraft(),
    type: opts.type,
    kind: 'rect' as const,
    label: name,
    thickness: THICK,
    elevation: opts.elevation,
    width: opts.width,
    height: opts.height,
    ...(opts.points ? { customPoints: opts.points } : {}),
    ...(opts.wallPanels ? { wallPanels: opts.wallPanels } : {}),
  };

  const subDetails: Record<string, unknown> = {};
  Object.entries(opts.wallPanels ?? {}).forEach(([side, panel]) => {
    subDetails[`wall_panel_${side}`] = {
      ...createDraft(),
      type: 'Стінова панель',
      kind: 'rect',
      thickness: THICK,
      width: panel.width,
      height: panel.height,
      elevation: 0,
      ...(opts.panelPoints ? { customPoints: opts.panelPoints } : {}),
    };
  });

  const product = buildProductFromSession(
    { mainDetail: draft as never, subDetails: subDetails as never, activeDetailId: 'main', editingProductId: id },
    id,
    'Натуральний камінь',
  );
  product.name = name;
  product.scenePlacement = opts.place;
  return product;
}

declare global {
  interface Window {
    buildFotozona?: (heart: Array<{ x: number; y: number }>) => string;
  }
}

window.buildFotozona = (heart) => {
  const store = useProjectStore.getState();
  store.newProject();

  /*
   * ЯК ЦЕ СТАЄ ВЕРТИКАЛЬНО.
   *
   * Програма ставить плиту сторч тільки в одному випадку — коли це
   * СТІНОВА ПАНЕЛЬ, прив'язана до ребра стільниці. Окремий виріб, хай
   * навіть типу «Стінова панель», лягає плазом: перша спроба зібрати
   * фотозону з п'яти самостійних виробів дала купу плит на підлозі.
   *
   * Тому композиція будується так, як її бачить програма:
   *   · ярус 1 — стільниця, і саме до її ЗАДНЬОГО ребра (сторона A)
   *     чіпляється фон висотою 2400 (ширина ребра 1600 — рівно за ТЗ);
   *   · яруси 2 і 3 — окремі вироби, вони й мають лежати плазом;
   *   · серце — стінова панель ярусу 3 з контуром серця: вертикальна
   *     плита перед фоном.
   */
  /*
   * ВСІ ЯРУСИ В ОДНІЙ ТОЧЦІ ПІДЛОГИ, різниця тільки у ВИСОТІ.
   *
   * Перша спроба зсувала вироби по z, щоб «поставити один за одним» — і
   * композиція роз'їхалась: фон опинився збоку, серце окремо. Насправді
   * стос будується висотою установки (`elevation` — низ деталі від
   * підлоги), а плити самі стоять співвісно, бо кожна центрована.
   *
   * Заднє ребро в них різне за довжиною — тому фон (панель ярусу 1,
   * 1600 мм) стоїть позаду, а серце (панель ярусу 3, 850 мм) виходить
   * ближче до глядача. Саме та відстань, що на референсі.
   */
  const podium = makeProduct('prod_tier1', 'Ярус 1 + фон', {
    type: 'Стільниця', width: 1600, height: 1600, elevation: 0,
    place: { x: 0, z: 0, rotationYDeg: 0 },
    wallPanels: { A: { edgeId: 'A', material: '', width: 1600, height: 2400, offset: 0, thickness: THICK } },
  });

  const tier2 = makeProduct('prod_tier2', 'Ярус 2 · 1200×1200', {
    type: 'Стільниця', width: 1200, height: 1200, elevation: 130,
    place: { x: 0, z: 0, rotationYDeg: 0 },
  });

  const tier3 = makeProduct('prod_tier3', 'Ярус 3 + СЕРЦЕ', {
    type: 'Стільниця', width: 850, height: 850, elevation: 260,
    place: { x: 0, z: 0, rotationYDeg: 0 },
    wallPanels: { A: { edgeId: 'A', material: '', width: 1200, height: 1600, offset: -175, thickness: THICK } },
    panelPoints: heart,
  });

  const products: Product[] = [podium, tier2, tier3];

  store.updateProject({ products } as never);
  store.updateProjectHeader({
    orderNumber: 'ФОТОЗОНА-01',
    customer: 'Фотозона · салон',
    textureSelectionEnabled: true,
  });

  return JSON.stringify(useProjectStore.getState().project);
};
