/**
 * ТЕСТОВЕ ЗАМОВЛЕННЯ «Кухня Г-подібна» — фікстура для набору креслень (06.09.2026).
 *
 * Вигаданий виріб (не з кейсів), у якому є все, що показує набір:
 * Г-стільниця 2600×1600, сторони A і F — до стін, лицьові C і D — з
 * підворотами 100 під 45° (наскрізна текстура), торці B і E — водоспадні
 * опори 880 до підлоги (вузол 1-1, з'єднання під 45°), кромка AR20 на
 * видимих ребрах, виріз під варильну, змішувач і дозатор, мийка з каменю
 * 500×400×200 (вклейка знизу), стінова панель 1400×600 на стіні A (стик
 * монтажний). Потовщень нема — ця кухня на підворотах.
 *
 * Дані замовника — умовні, без реальних ПІБ/телефонів (правило «без
 * персональних даних у коді»).
 */
import { buildProductFromSession } from '../../components/ui/ProductEditorWorkspace';
import { createDraft } from '../../components/forms/utils/draftHelpers';
import type { DetailDraft } from '../../components/forms/utils/draftHelpers';
import type { Product, Project } from '../../domain/types';

const draft = (type: string, patch: Partial<DetailDraft> = {}): DetailDraft => ({ ...createDraft(), kind: 'rect', type: type as DetailDraft['type'], thickness: 20, ...patch });

export const SAMPLE_ORDER_NUMBER = '81-0000001';
export const SAMPLE_PRODUCT_NAME = 'Кухня Г-подібна (тест)';

/** Сесія редактора виробу — так само її бачить `buildProductFromSession` після «Зберегти». */
export function sampleKitchenSession(): Parameters<typeof buildProductFromSession>[0] {
  return {
    activeDetailId: 'main',
    mainDetail: {
      ...createDraft(),
      kind: 'l' as const,
      type: 'Стільниця' as const,
      thickness: 20,
      outerWidth: 2600, outerHeight: 1600, innerHorizontal: 600, innerVertical: 1000,
      // A (2600) і F (1600) — до стін; B (600) і E (600) — торці під опори; C (2000) і D (1000) — лицьові під підвороти.
      // Кромка на лицьових ребрах C і D — це ребро підвороту (як «Кромка 4» на Стільниці 3 у 81-2009298); торці B/E — стик 45°.
      edgeProfiles: { C: 'ar_20', D: 'ar_20' },
      cutouts: {
        hob: { id: 'hob', shape: 'rect', type: 'custom', bindCorner: 'FA', x: 1700, y: 55, width: 560, height: 490, cornerRadius: 5 },
        faucet: { id: 'faucet', shape: 'circle', type: 'faucet', bindCorner: 'FA', x: 1000, y: 70, radius: 17.5 },
        dispenser: { id: 'dispenser', shape: 'circle', type: 'custom', bindCorner: 'FA', x: 1150, y: 70, radius: 15 },
      } as never,
      sinks: { s1: { id: 's1', kind: 'rect', bindCorner: 'FA', x: 700, y: 120, width: 500, height: 400, depth: 200 } },
    } as DetailDraft,
    subDetails: {
      fold_C: draft('Підворот', { width: 2000, height: 100 }),
      fold_D: draft('Підворот', { width: 1000, height: 100 }),
      // опора: C — стик зі стільницею, A — низ (підлога), B і D — вертикальні ребра з кромкою
      leg_B: draft('Опора', { width: 600, height: 880, edgeProfiles: { B: 'ar_20', D: 'ar_20' } }),
      leg_E: draft('Опора', { width: 600, height: 880, edgeProfiles: { B: 'ar_20', D: 'ar_20' } }),
      wall_panel_A: draft('Стінова панель', { width: 1400, height: 600, attachOffset: 600, edgeProfiles: { A: 'polished_straight' } }),
    },
  } as Parameters<typeof buildProductFromSession>[0];
}

export function buildSampleKitchenProduct(productId = 'kitchen_l_sample', material: Project['projectMaterial'] = 'Кварцит'): Product {
  const product = buildProductFromSession(sampleKitchenSession(), productId, material);
  return { ...product, name: SAMPLE_PRODUCT_NAME };
}

/** Шапка тестового замовлення — умовні дані. */
export const SAMPLE_PROJECT_HEADER: Partial<Project> = {
  orderNumber: SAMPLE_ORDER_NUMBER,
  customer: 'Тестовий Замовник',
  customerContactPhone: '(0xx) xxx-xx-xx',
  projectMaterial: 'Кварцит',
  projectThickness: 20,
};
