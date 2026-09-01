import type { Detail } from '../../domain/types';
import { draftFromDetail, type ProductEditorSession } from '../forms/utils/draftHelpers';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useStore';

/**
 * ДІЇ НАД ВИБРАНОЮ ДЕТАЛЛЮ — спільні для списку і компактної панелі.
 *
 * Винесено з ListsPanel 27.08: у просунутому режимі списку деталей на
 * екрані немає (вибір — кліком по деталі на дошці), а олівець і кошик
 * лишаються. Логіка відкриття редактора нетривіальна (збірка сесії з
 * дітей виробу), і тримати її у двох місцях означає, що одне з них
 * відстане — тому одна правда тут, а обидві панелі її викликають.
 */

/** Відкриває редактор для деталі: виріб — свою сесію, сирота — свій редактор */
export function openDetailEditor(detail: Detail, allDetails: Detail[]): void {
  const { startEditDetail } = useProjectStore.getState();
  const setProductEditorSession = useUIStore.getState().setProductEditorSession;

  let productToEdit: Detail | undefined;
  let targetActiveSlot = 'main';

  if (detail.isProduct) {
    productToEdit = detail;
  } else if (detail.parentDetailId) {
    const parent = allDetails.find((d) => d.id === detail.parentDetailId);
    if (parent && parent.isProduct) {
      productToEdit = parent;
      targetActiveSlot = detail.slot || detail.id;
      if (detail.type === 'Стінова панель' && detail.parentDetailSide) {
        targetActiveSlot = `wall_panel_${detail.parentDetailSide}`;
      } else if (detail.type === 'Опора' && detail.parentDetailSide) {
        targetActiveSlot = `leg_${detail.parentDetailSide}`;
      }
    }
  }

  if (!productToEdit) {
    startEditDetail(detail.id);
    return;
  }

  const children = allDetails.filter((d) => d.parentDetailId === productToEdit!.id);
  const editingProductId = productToEdit.id.split('__')[0];
  // Матеріал виробу (01.09) живе на Product, не на розгорнутій деталі —
  // дістаємо з проєкту, щоб редактор давав товщини цього матеріалу.
  const editedProduct = useProjectStore.getState().project.products?.find((p) => p.id === editingProductId);
  const productMaterial = editedProduct?.material;
  const session: ProductEditorSession = {
    editingProductId,
    material: productMaterial,
    scenePlacement: editedProduct?.scenePlacement,
    activeDetailId: targetActiveSlot,
    mainDetail: { ...draftFromDetail(productToEdit), skirtings: productToEdit.skirtings || {}, wallPanels: {}, legs: {} },
    subDetails: {},
  };

  children.forEach((child) => {
    const draft = draftFromDetail(child);
    if (child.type === 'Стінова панель' && child.parentDetailSide) {
      session.mainDetail!.wallPanels![child.parentDetailSide] = {
        edgeId: child.parentDetailSide,
        height: draft.height,
        thickness: draft.thickness,
        offset: child.importOffsetX || 0,
      } as never;
      session.subDetails[`wall_panel_${child.parentDetailSide}`] = draft;
    } else if (child.type === 'Опора' && child.parentDetailSide) {
      const isCorner = draft.shape === 'Г-подібна';
      session.mainDetail!.legs![child.parentDetailSide] = {
        edgeId: child.parentDetailSide,
        width: draft.width,
        height: draft.height,
        size: isCorner ? `${draft.outerWidth}x${draft.outerHeight}` : String(draft.width),
        offset: child.importOffsetX || 0,
        jointType: '',
      } as never;
      session.subDetails[`leg_${child.parentDetailSide}`] = draft;
    } else {
      session.subDetails[child.slot || child.id] = draft;
    }
  });

  setProductEditorSession(session);
}

/** Видаляє деталь; якщо це виріб (чи корінь виробу) — видаляє виріб цілком */
export function deleteDetailOrProduct(detail: Detail): void {
  const { project, removeProduct, deleteDetail } = useProjectStore.getState();
  const product = (project.products || []).find(
    (p) => detail.id === p.id || detail.id.startsWith(`prod_${p.id}/`) || detail.id.startsWith(`${p.id}/`),
  );
  if (product) removeProduct(product.id);
  else deleteDetail(detail.id);
}
