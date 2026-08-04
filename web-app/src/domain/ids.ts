export function buildElementPath(productId: string, elementSlot: string): string {
  return `prod_${productId}/element:${elementSlot}`;
}

export function buildDetailPath(productId: string, elementSlot: string, detailSlot: string): string {
  return `${buildElementPath(productId, elementSlot)}/detail:${detailSlot}`;
}
export function toSlot(id: string | null | undefined): string {
  if (!id) return 'main';
  const m = id.match(/\/element:([^/]+)/);
  const slot = m ? m[1] : id;
  return slot.includes('element:main') || slot === 'main' ? 'main' : slot;
}

/**
 * Знайти деталь за ідентифікатором у будь-якій із двох форм.
 *
 * Контекстне меню в 3D-редакторі віддає короткий слот (`main`,
 * `skirting_A`), а `flattenProductToDetails` будує повні шляхи
 * `prod_1/element:skirting_A/detail:main`. Пряме порівняння не збігалося
 * ніколи — і вікно «Параметри та список обробок» мовчки не відкривалось:
 * компонент не знаходив деталь і повертав null.
 */
export function findDetailByPathOrSlot<T extends { id: string }>(
  details: T[] | undefined,
  detailId: string | null | undefined,
): T | undefined {
  if (!details?.length || !detailId) return undefined;
  const exact = details.find((detail) => detail.id === detailId);
  if (exact) return exact;
  const target = toSlot(detailId);
  return details.find((detail) => toSlot(detail.id) === target);
}
