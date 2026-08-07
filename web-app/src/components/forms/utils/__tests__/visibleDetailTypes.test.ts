import { describe, it, expect } from 'vitest';
import { visibleDetailTypes, detailTypes, TYPE_METAL, TYPE_COUNTERTOP } from '../draftHelpers';

/**
 * «Металопрокат» — прихована вертикаль (MVP Viyar Metal).
 * Менеджер не має бачити цей тип у жодній випадачці;
 * супер-адмін (щит + PIN) бачить повний список.
 */
describe('visibleDetailTypes (метал під супер-адміном)', () => {
  it('менеджеру металопрокат не показується', () => {
    const visible = visibleDetailTypes(false);
    expect(visible).not.toContain(TYPE_METAL);
    expect(visible).toHaveLength(detailTypes.length - 1);
  });

  it('супер-адміну видно повний список, включно з металопрокатом', () => {
    expect(visibleDetailTypes(true)).toEqual(detailTypes);
  });

  it('деталь, що ВЖЕ є металопрокатом, не втрачає свою опцію без адміна', () => {
    expect(visibleDetailTypes(false, TYPE_METAL)).toContain(TYPE_METAL);
  });

  it('звичайні типи не зникають ні в кого', () => {
    expect(visibleDetailTypes(false)).toContain(TYPE_COUNTERTOP);
    expect(visibleDetailTypes(true)).toContain(TYPE_COUNTERTOP);
  });
});
