/**
 * @vitest-environment jsdom
 *
 * FG-32 — «Заблокувати розкрій».
 *
 * Сценарій з життя: менеджер розклав деталі, вручну підібрав малюнок каменю,
 * і тут клієнт просить додати виріз. До замка будь-яка правка виробу йшла
 * через `triggerPackingAsync` і перескладала розкладку з нуля — робота з
 * текстурою зникала. Тест тримає саме цю межу: із замком нічого не рухається,
 * без замка поведінка лишається старою.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../useProjectStore';
import { explodeDetails } from '../../engines/geometry';
import { createEmptyProject, DEFAULT_ALLOWANCES } from '../../domain/defaults';
import type { Detail, Project, SlabInstance, SurfaceCutout, TextureLayout } from '../../domain/types';

const SLAB: SlabInstance = {
  id: 'slab-1',
  width: 3000,
  height: 1500,
  thickness: 20,
  material: 'Керамограніт',
  decor: 'White',
  comment: '',
  minMargin: 10,
  textureTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 1 },
  defects: [],
  serialNumber: 'SN-001',
};

const DETAIL: Detail = {
  id: 'det-1',
  type: 'Стільниця',
  shape: 'Прямокутна',
  quantity: 1,
  geometry: { width: 2000, height: 600 },
  thickness: 20,
  label: 'Стільниця',
};

/** Проєкт із однією розкладеною деталлю і вручну зсунутою текстурою. */
function seed(locked: boolean) {
  const parts = explodeDetails([DETAIL], DEFAULT_ALLOWANCES);
  const partId = parts[0].id;
  const textureLayout: TextureLayout = {
    id: 'tl-1',
    slabId: SLAB.id,
    partId,
    x: 120,
    y: 240,
    rotation: 0,
    sourceX: 0,
    sourceY: 0,
    sourceRotation: 0,
  };
  const project: Project = {
    ...createEmptyProject(),
    slabs: [SLAB],
    details: [DETAIL],
    nestingLocked: locked,
    placements: [{ id: 'pl-1', slabId: SLAB.id, partId, x: 777, y: 333, rotation: 0, manualLocked: false }],
    textureLayouts: [textureLayout],
  };

  useProjectStore.setState({ project, parts, currentDbProjectId: null, history: [], future: [] });
  return partId;
}

/** Та сама деталь, але клієнт попросив виріз під мийку. */
const SINK: SurfaceCutout = {
  id: 'c1',
  shape: 'rect',
  type: 'custom',
  bindCorner: 'DA',
  x: 200,
  y: 100,
  width: 500,
  height: 400,
};

const withCutout: Detail = {
  ...DETAIL,
  geometry: { ...DETAIL.geometry, cutouts: { c1: SINK } },
};

describe('FG-32 · замок розкладки', () => {
  beforeEach(() => {
    useProjectStore.setState({ packingMode: 'economy', isPacking: false });
  });

  it('із замком правка виробу не рухає вже розкладену деталь', () => {
    seed(true);
    useProjectStore.getState().updateDetailRecord('det-1', withCutout);

    const { project } = useProjectStore.getState();
    expect(project.placements).toHaveLength(1);
    expect(project.placements[0].x).toBe(777);
    expect(project.placements[0].y).toBe(333);
    // Пакер не запускався — крутилки «йде розкрій» бути не повинно.
    expect(useProjectStore.getState().isPacking).toBe(false);
  });

  it('із замком підбір текстури лишається на місці', () => {
    seed(true);
    useProjectStore.getState().updateDetailRecord('det-1', withCutout);

    const layouts = useProjectStore.getState().project.textureLayouts;
    expect(layouts).toHaveLength(1);
    expect(layouts[0].x).toBe(120);
    expect(layouts[0].y).toBe(240);
  });

  /*
   * ХВИЛЯ 5, крок 5.3 змінив цю обіцянку — свідомо.
   *
   * Було: при замку нова деталь ОДРАЗУ летіла в буфер, навіть коли поруч
   * пів порожнього слябу («автоматичне докладання — наступний крок», як і
   * писав коментар у packingSlice). Стало: пробуємо покласти її у ВІЛЬНЕ
   * місце, не рухаючи жодної наявної. Не влізла — тоді буфер, як і був.
   */
  it('нова деталь при замку докладається у вільне місце, не рухаючи старі', () => {
    seed(true);
    const second: Detail = { ...DETAIL, id: 'det-2', label: 'Острів' };
    useProjectStore.getState().addDetail(second);

    const { project, parts } = useProjectStore.getState();
    const newPart = parts.find((part) => part.detailId === 'det-2');
    expect(newPart).toBeDefined();

    // Головне: стара деталь стоїть де стояла — заради цього замок і є.
    const old = project.placements.find((item) => item.partId !== newPart!.id)!;
    expect(old.x).toBe(777);
    expect(old.y).toBe(333);

    // Новачок або ліг у вільне місце, або чесно пояснив, чому не зміг.
    const placedNew = project.placements.find((item) => item.partId === newPart!.id);
    if (placedNew) {
      expect(placedNew.slabId).toBe(SLAB.id);
    } else {
      expect(project.unplacedPartIds).toContain(newPart!.id);
      expect(project.unplacedReasons?.[newPart!.id]).toBeTruthy();
    }
  });

  it('якщо місця немає — новачок іде в буфер із поясненням', () => {
    seed(true);
    // Друга деталь на весь сляб: вільного місця для неї не лишилось.
    const huge: Detail = {
      ...DETAIL, id: 'det-3', label: 'Велетень',
      geometry: { width: 2900, height: 1400 },
    };
    useProjectStore.getState().addDetail(huge);

    const { project, parts } = useProjectStore.getState();
    const newPart = parts.find((part) => part.detailId === 'det-3')!;
    expect(project.unplacedPartIds).toContain(newPart.id);
    expect(project.unplacedReasons?.[newPart.id]).toBeTruthy();
    expect(project.placements.find((item) => item.partId !== newPart.id)!.x).toBe(777);
  });

  it('без замка правка виробу запускає перескладання, як і раніше', () => {
    seed(false);
    useProjectStore.getState().updateDetailRecord('det-1', withCutout);

    // Пакер асинхронний, але прапорець «йде розкрій» ставиться синхронно —
    // саме він і відрізняє замкнений шлях від звичайного.
    expect(useProjectStore.getState().isPacking).toBe(true);
  });

  it('зняття замка прибирає «замкові» причини, але не справжні', () => {
    const partId = seed(true);
    useProjectStore.setState((state) => ({
      project: {
        ...state.project,
        unplacedPartIds: [partId, 'p-real'],
        unplacedReasons: {
          [partId]: 'Розкрій заблоковано — покладіть деталь вручну',
          'p-real': 'Не вміщується на жоден сляб',
        },
      },
    }));

    useProjectStore.getState().setNestingLocked(false);

    const { project } = useProjectStore.getState();
    expect(project.nestingLocked).toBe(false);
    expect(project.unplacedReasons?.[partId]).toBeUndefined();
    expect(project.unplacedReasons?.['p-real']).toBe('Не вміщується на жоден сляб');
  });
});
