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
