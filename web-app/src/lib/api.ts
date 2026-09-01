// Клієнт до власного бекенда (server/) — Keycloak-сесія в httpOnly-куці,
// тому всі запити йдуть same-origin з credentials.

import type { QuoteCalcDoc } from '../domain/quoteCalc';
import type { QuoteCalcLine } from '../engines/quoteCalc';

export type AppUser = {
  id: string;
  email: string | null;
  name: string | null;
};

export type ProjectMetadata = {
  id: string;
  name: string;
  updated_at: string;
};

/** Контактна особа контрагента (Customer у Customers Service) */
export type CustomerContact = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  position?: string;
};

/** Контрагент (Organization у Customers Service) */
export type CustomerOrganization = {
  id: string;
  title: string;
  code?: string;
  edrpou?: string;
  phone?: string;
  email?: string;
  address?: string;
  /** Контакт, який сервіс віддав разом з організацією (тоді другий запит не потрібен) */
  contact?: CustomerContact | null;
};

/**
 * Ціна номенклатури з 1С (метод getDiscountPrice).
 *
 * unitPrice — ціна за ОДИНИЦЮ з урахуванням знижки контрагента: сама 1С
 * віддає суму рядка, і бекенд ділить її назад на кількість, бо рядок
 * прорахунку множить на свою кількість сам. sum лишається поруч —
 * це те, що 1С порахувала на передану кількість.
 */
export type Price1c = {
  /** Код номенклатури 1С, за яким ціну просили */
  code: string;
  name: string;
  unitPrice: number;
  sum: number;
  /** Кількість, яку підтвердила 1С (у своїй одиниці виміру) */
  quantity: number;
  /** Числовий код одиниці виміру 1С («001», «003») — його знає тільки ERP */
  unitId: string;
  /** Назва одиниці з довідника номенклатур («шт», «м2») */
  measureName?: string;
  currency: string;
};

export type Prices1cResponse = {
  prices: Record<string, Price1c>;
  /** Коди, на які 1С ціни не дала (немає в довіднику чи в прайсі філії) */
  missing: string[];
};

/**
 * Ціна номенклатури з Cost Service — див. useCostPrices.ts.
 *
 * Інтеграція від'єднана 01.09.2026 (у Cost немає прайсу), типи й виклик
 * лишаються готовими до вмикання назад.
 */
export type CostPrice = {
  code: string;
  name: string;
  unitPrice: number;
  sum: number;
  retailPrice: number;
  discount: number;
  quantity: number;
  measureName: string;
  currency: string;
  priceCategory: string;
};

export type CostPricesResponse = {
  prices: Record<string, CostPrice>;
  /** Питали — прайсу на позицію немає */
  missing: string[];
  /** Навіть не питали: коду немає в довіднику номенклатур */
  unknown: string[];
  /** Код є, але Cost цієї номенклатури не знає («product_db_id not found») */
  failed: string[];
  currency: string;
  /** Пояснення сервісу, чому ціни немає («No retail price found for …») */
  errors: string[];
};

/** Філія з довідника Locations Service — поле «Філія» в прорахунку */
export type Branch = {
  id: string;
  title: string;
  code?: string;
};

/**
 * Замовлення в be-orders-service, створене з підтвердженого прорахунку.
 *
 * externalOrderId (PREFIX-YY-NNNNNN) — це і є номер замовлення: його
 * генерує сам сервіс, і саме він показується менеджеру. Ідентифікатори
 * документів лишаються поруч — за ними замовлення знаходять у сервісі,
 * якщо номер чомусь не згенерувався.
 */
export type CreatedOrder = {
  externalOrderId: string;
  orderId: string;
  orderDetailsId: string;
  prefix: string;
  year: string;
};

/**
 * Виріб прорахунку з ЛЮДСЬКОЮ назвою типу.
 *
 * У документі виріб тримає лише `productTypeId` («countertop_plain»), а
 * підпис до нього знає довідник QUOTE_PRODUCT_TYPES — тут, на фронті.
 * Тому в замовлення виріб їде вже підписаним: у назві позиції й в
 * additional_prop має стояти «Стільниця без потовщень», а не id, і
 * другої копії тієї таблиці на сервері заводити не будемо.
 */
export type OrderItemInfo = {
  id: string;
  /** Підпис типу виробу з довідника */
  product: string;
  shape: string;
  count: number;
  thicknessMm?: number;
  /** Фактична площа/довжина одного виробу з розкрою */
  areaM2?: number;
  lengthM?: number;
  /** Назва деталі проєкту, з якої виріб підтягнуто */
  sourceLabel?: string;
};

/** Що бекенд перетворює на тіло POST {orders}/v2/orders/mixin/ */
export type CreateOrderRequest = {
  project: { id: string; name: string; orderNumber: string };
  quote: QuoteCalcDoc;
  /** Рядки розрахунку — рівно ті, що менеджер бачив і підтвердив */
  lines: QuoteCalcLine[];
  /** Вироби замовлення з підписами типів — див. OrderItemInfo */
  items: OrderItemInfo[];
  total: number;
  /** Контрагент із довідника: без нього замовлення нема на кого виписати */
  organizationId: string;
  /** Підпис способу виготовлення для коментаря замовлення */
  methodLabel: string;
};

/**
 * Помилка з кодом відповіді — інтерфейсу треба відрізняти «немає ролі
 * customers_viewer» (403) і «сервіс не налаштований» (503) від решти.
 *
 * `code` — машинний код із тіла відповіді (prices_erp_unavailable,
 * customers_forbidden…). Статусу не завжди досить: у цін три різні 502 —
 * не відповідає 1С, не відповідає довідник номенклатур, контрагента немає
 * в ERP, — і менеджеру про кожен треба сказати своє.
 */
export class ApiError extends Error {
  // Поля оголошені явно, а не через `constructor(public …)`: у tsconfig
  // увімкнено erasableSyntaxOnly (щоб збірка була чистим стиранням типів),
  // і параметр-властивість там заборонена.
  readonly status: number;

  readonly code: string;

  /**
   * Перелік із тіла відповіді — зараз це рядки прорахунку, через які
   * замовлення не створюється. Без них повідомлення «є позиції поза
   * номенклатурою» не каже менеджеру, ЯКІ саме рядки чіпати.
   */
  readonly details: string[];

  constructor(status: number, message: string, code = '', details: string[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let code = '';
    let details: string[] = [];
    try {
      const parsed = JSON.parse(body) as { error?: unknown; lines?: unknown };
      code = String(parsed.error ?? '');
      if (Array.isArray(parsed.lines)) details = parsed.lines.map(String);
    } catch { /* не JSON — лишається сам текст у message */ }
    throw new ApiError(res.status, `${res.status} ${res.statusText}: ${body}`, code, details);
  }
  return res.json() as Promise<T>;
}

/**
 * Виконання сляба з довідника номенклатур: один артикул = один габарит і
 * одна товщина. Саме за `article` потім питається ціна.
 */
export type Slab1c = {
  /** oid запису в Products Service — знадобиться замовленню */
  oid: string;
  article: string;
  title: string;
  width: number;
  height: number;
  thick: number;
  /** Головне фото (публічний S3-лінк). Порожньо — фото в довіднику немає */
  photo: string;
  photos: string[];
};

export type SlabCatalogResponse = {
  items: Slab1c[];
  /** Скільки позицій під фільтр підпало всього — сторінка може бути вужча */
  totalCount: number;
  pageSize: number;
  /**
   * Чи лишилось щось за межами відповіді.
   *
   * Прогрітий кеш сервера віддає ВЕСЬ матеріал одразу, і тоді питати
   * «уточніть пошук» безглуздо — уточнювати нічого. `true` буває лише
   * поки кеш не прогрівся і запит пішов у довідник наживо, сторінкою.
   */
  truncated: boolean;
};

export const api = {
  // ── auth ────────────────────────────────────────────────────────────
  loginUrl: '/api/auth/login',

  async me(): Promise<AppUser | null> {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const { user } = (await res.json()) as { user: AppUser | null };
    return user;
  },

  async logout(): Promise<void> {
    await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  // ── projects ────────────────────────────────────────────────────────
  listProjects(): Promise<ProjectMetadata[]> {
    return request('/api/projects');
  },

  createProject(name: string, data: unknown): Promise<ProjectMetadata> {
    return request('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, data }),
    });
  },

  getProject(id: string): Promise<{ id: string; name: string; data: unknown }> {
    return request(`/api/projects/${id}`);
  },

  updateProject(id: string, patch: { name?: string; data?: unknown }): Promise<ProjectMetadata> {
    return request(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  async deleteProject(id: string): Promise<void> {
    await request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });
  },

  // ── customers (be-customers-service через наш проксі) ───────────────
  // Токен Keycloak лишається на бекенді, тому браузер ходить same-origin,
  // як і по проєкти.
  async searchOrganizations(query: string, signal?: AbortSignal): Promise<CustomerOrganization[]> {
    const { items } = await request<{ items: CustomerOrganization[] }>(
      `/api/customers/organizations?query=${encodeURIComponent(query)}`,
      { signal },
    );
    return items ?? [];
  },

  async organizationContacts(organizationId: string, signal?: AbortSignal): Promise<CustomerContact[]> {
    const { items } = await request<{ items: CustomerContact[] }>(
      `/api/customers/organizations/${encodeURIComponent(organizationId)}/contacts`,
      { signal },
    );
    return items ?? [];
  },

  // ── ціни (1С getDiscountPrice через наш проксі) ────────────────────
  /**
   * Ціни рядків прорахунку за кодами номенклатур 1С.
   *
   * Кількість передається разом із кодом — від обсягу залежать акції й
   * прайс-матриця. organizationId (контрагент із довідника) вмикає його
   * персональну знижку в ERP; без нього приїде загальний прайс.
   */
  async prices1c(
    items: Array<{ code: string; qty: number }>,
    options: { organizationId?: string } = {},
    signal?: AbortSignal,
  ): Promise<Prices1cResponse> {
    const data = await request<Prices1cResponse>('/api/prices', {
      method: 'POST',
      body: JSON.stringify({ items, ...options }),
      signal,
    });
    return { prices: data.prices ?? {}, missing: data.missing ?? [] };
  },

  // ── каталог слябів (be-products-service через наш проксі) ──────────
  /**
   * Сляби довідника номенклатур для вікна «Додати слеб».
   *
   * Каталог лежить у пам'яті сервера (гріється у фоні при старті), тому
   * відповідь приходить миттєво і містить УСІ позиції матеріалу. Поки
   * кеш не прогрівся, сервер ходить у довідник наживо й віддає сторінку —
   * тоді відповідь приходить із `truncated: true`.
   */
  async slabs1c(
    params: { material: string; query?: string; thickness?: number; page?: number },
    signal?: AbortSignal,
  ): Promise<SlabCatalogResponse> {
    const search = new URLSearchParams({ material: params.material });
    if (params.query) search.set('query', params.query);
    if (params.thickness) search.set('thickness', String(params.thickness));
    if (params.page && params.page > 1) search.set('page', String(params.page));
    const data = await request<SlabCatalogResponse>(`/api/products/slabs?${search}`, { signal });
    return {
      items: data.items ?? [],
      totalCount: data.totalCount ?? 0,
      pageSize: data.pageSize ?? 0,
      truncated: Boolean(data.truncated),
    };
  },

  // ── orders (be-orders-service через наш проксі) ────────────────────
  /**
   * Створити замовлення з підтвердженого «Прорахунку для клієнта».
   *
   * Order + OrderDetails створюються одним атомарним запитом; сервіс
   * повертає номер замовлення (external_order_id). Тіло під контракт
   * Orders Service збирає бекенд — там же лежить і мапінг полів, звірений
   * з живою схемою сервісу (server/src/orders.js).
   */
  createOrder(order: CreateOrderRequest, signal?: AbortSignal): Promise<CreatedOrder> {
    return request<CreatedOrder>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(order),
      signal,
    });
  },

  // ── ціни з Cost Service (від'єднано, див. useCostPrices.ts) ─────────
  async costPrices(
    items: Array<{ code: string; qty: number }>,
    options: { organizationId?: string; customerId?: string; branchId?: string } = {},
    signal?: AbortSignal,
  ): Promise<CostPricesResponse> {
    const data = await request<CostPricesResponse>('/api/cost/prices', {
      method: 'POST',
      body: JSON.stringify({ items, ...options }),
      signal,
    });
    return {
      prices: data.prices ?? {},
      missing: data.missing ?? [],
      unknown: data.unknown ?? [],
      failed: data.failed ?? [],
      currency: data.currency ?? '',
      errors: data.errors ?? [],
    };
  },

  // ── locations (be-locations-service через наш проксі) ───────────────
  /** Увесь довідник філій одним запитом — фільтрується вже на фронті */
  async listBranches(signal?: AbortSignal): Promise<Branch[]> {
    const { items } = await request<{ items: Branch[] }>('/api/locations/branches', { signal });
    return items ?? [];
  },
};
