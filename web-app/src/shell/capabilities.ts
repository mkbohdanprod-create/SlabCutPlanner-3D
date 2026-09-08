/**
 * КАРТА ПРАВ — «що можна в цьому робочому просторі» (03.09.2026).
 *
 * Рішення власника: одне ядро — кілька дочок (VS3D менеджеру, Конструктор
 * технологу першим, Архітектура паралельно). До цього дня кожен екран
 * сам вирішував, що означає «адмін»: 46 перевірок `isAdminUnlocked` у 12
 * файлах, і кожна нова функція обучалочки додавала б ще одну дірку в тому
 * самому екрані. Тепер компонент питає `can('metal')`, а не «чи введено
 * ПІН», — і відповідь залежить від того, ЯКА дочка відкрита і ЯКА роль.
 *
 * Це шар оболонки, не ядра: ядро (engines/domain) про права не знає і
 * знати не має (тест `__tests__/coreBoundary.test.ts`).
 */

/** Що взагалі можна вмикати/вимикати. Імена — з карти ЩО_ВИНОСИМО_З_VS3D.md. */
export type Capability =
  /** Тип «Металопрокат», ланцюги профілів, шаблони каркасів. */
  | 'metal'
  /** Вкладка «Послуги для виробництва» — повний перелік операцій із кодами. */
  | 'estimate'
  /** Припуски розкрою (рішення технолога). */
  | 'allowances'
  /** Імпорт DXF (замір, креслення). */
  | 'importDxf'
  /** Імпорт зі SketchUp. */
  | 'importSketchup'
  /** Імпорт бланка погодження з паперу (OCR). */
  | 'importApproval'
  /** Старий редактор деталей (`project.details`), «Додати деталь». */
  | 'legacyDetails'
  /** Паспорт деталі з контекстного меню. */
  | 'detailPassport'
  /** Плаваюче 3D-прев'ю. */
  | 'preview3d'
  /** Кнопка «Сервіс»: аналіз баг-репортів, відомі баги, кеш воркера. */
  | 'serviceDialog'
  /** Прототипи: анімація обробки, скидання збірки. */
  | 'prototypes'
  /** Налаштування цін, кодів 1С, прив'язки послуг; калібрування ручної ціни. */
  | 'priceSettings'
  /** Шаблони виробів (адмін). */
  | 'productTemplates'
  /** Вкладка «Приміщення». */
  | 'room';

export type WorkspaceId = 'vs3d' | 'constructor' | 'architecture';

export interface WorkspaceDefinition {
  id: WorkspaceId;
  /** Як дочка зветься в шапці — замість «3D». */
  badge: string;
  title: string;
  /** Одне речення: на яке питання відповідає. */
  question: string;
  /** Права, які дочка дає всім своїм користувачам. */
  grants: readonly Capability[];
  /** Права, які в цій дочці додатково відкриває ПІН супер-адміна. */
  adminGrants: readonly Capability[];
}

/**
 * Усе, що ПІН відкривав у VS3D до розділення, — лишається за ПІНом там
 * само, щоб у тих, хто ним користується, нічого не зникло. Менеджер без
 * ПІНа втрачає рівно те, чого в карті нема в `grants`: «Сервіс»,
 * припуски, імпорт DXF/SketchUp, старий редактор, метал, прототипи.
 */
const ALL_ADMIN: readonly Capability[] = [
  'metal', 'estimate', 'allowances', 'importDxf', 'importSketchup', 'legacyDetails',
  'preview3d', 'serviceDialog', 'prototypes', 'priceSettings', 'productTemplates',
];

export const WORKSPACES: Record<WorkspaceId, WorkspaceDefinition> = {
  vs3d: {
    id: 'vs3d',
    badge: 'Studio',
    title: 'Viyar Stone Studio',
    question: 'Скільки це коштує',
    // Менеджер: зібрати виріб, показати клієнту, порахувати гроші, віддати далі.
    // «Приміщення», паспорт деталі та OCR-імпорт лишено до відповіді власника
    // (ЩО_ВИНОСИМО_З_VS3D.md, питання 1–3).
    grants: ['room', 'detailPassport', 'importApproval'],
    adminGrants: ALL_ADMIN,
  },
  constructor: {
    id: 'constructor',
    badge: 'CAD',
    title: 'Viyar Stone CAD',
    question: 'Як це зробити',
    // Технолог: усе з §2.2 карти — без ПІНа. Ціни (priceSettings) тут не
    // потрібні за візією («гроші лишаються в продажу»).
    grants: [
      'metal', 'estimate', 'allowances', 'importDxf', 'importSketchup', 'importApproval',
      'legacyDetails', 'detailPassport', 'preview3d', 'room',
    ],
    adminGrants: ['serviceDialog', 'prototypes', 'productTemplates'],
  },
  architecture: {
    id: 'architecture',
    badge: 'BUILDING',
    title: 'Viyar Stone BUILDING',
    question: 'Скільки коштує облицювати об’єкт',
    // Заведено як каркас під паралельну роботу: сьогодні — той самий
    // застосунок із «Приміщенням»; свої сутності (поверхні, розкладки, BOQ)
    // з'являться у власній теці workspaces/architecture.
    grants: ['room', 'detailPassport', 'importApproval', 'importDxf'],
    adminGrants: ALL_ADMIN,
  },
};

export const DEFAULT_WORKSPACE: WorkspaceId = 'vs3d';

/** `?workspace=constructor` — той самий прийом, що `?module=` у пакуванні Antigravity. */
export function workspaceIdFromLocation(search: string = typeof window === 'undefined' ? '' : window.location.search): WorkspaceId {
  const raw = new URLSearchParams(search).get('workspace');
  return raw && raw in WORKSPACES ? (raw as WorkspaceId) : DEFAULT_WORKSPACE;
}

let activeWorkspace: WorkspaceId = workspaceIdFromLocation();

/** Дочка, що відкрита зараз. Визначається один раз на завантаження сторінки. */
export function currentWorkspace(): WorkspaceDefinition {
  return WORKSPACES[activeWorkspace];
}

/** Для тестів і оболонки: перемкнути дочку без перезавантаження. */
export function setActiveWorkspace(id: WorkspaceId) {
  activeWorkspace = id;
}

/** Чиста відповідь «можна?» — без React і без стору, щоб її можна було тестувати. */
export function can(capability: Capability, adminUnlocked: boolean, workspace: WorkspaceDefinition = currentWorkspace()): boolean {
  if (workspace.grants.includes(capability)) return true;
  return adminUnlocked && workspace.adminGrants.includes(capability);
}
