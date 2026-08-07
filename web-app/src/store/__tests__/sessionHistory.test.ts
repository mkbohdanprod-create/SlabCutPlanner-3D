/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useUIStore } from '../useStore';
import type { ProductEditorSession } from '../../components/forms/utils/draftHelpers';

/**
 * Ctrl+Z всередині редактора виробу.
 *
 * Правила (рішення власника 07.08):
 *  · кроком є лише РЕАЛЬНА дія — зміна mainDetail або subDetails;
 *  · вибір активної деталі кроком НЕ є;
 *  · серія швидких правок (набір числа) зливається в один крок;
 *  · вхід/вихід із редактора скидає стек.
 */

const detailA = { width: 1000 } as never;
const detailB = { width: 1200 } as never;
const detailC = { width: 1500 } as never;

function session(mainDetail: never, activeDetailId = 'main'): ProductEditorSession {
  return { mainDetail, subDetails: {}, activeDetailId } as never;
}

describe('історія сесії редактора виробу', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    useUIStore.setState({ productEditorSession: null, sessionHistory: [], sessionFuture: [] });
    useUIStore.getState().setProductEditorSession(session(detailA)); // вхід у редактор
  });
  afterEach(() => vi.useRealTimers());

  const edit = (s: ProductEditorSession) => {
    vi.advanceTimersByTime(1000); // поза вікном злиття серій
    useUIStore.getState().setProductEditorSession(s);
  };

  it('вхід у редактор не створює кроку', () => {
    expect(useUIStore.getState().sessionHistory.length).toBe(0);
  });

  it('реальна дія створює крок, undo повертає попередній стан', () => {
    edit(session(detailB));
    expect(useUIStore.getState().sessionHistory.length).toBe(1);
    useUIStore.getState().undoSession();
    expect(useUIStore.getState().productEditorSession?.mainDetail).toBe(detailA);
    useUIStore.getState().redoSession();
    expect(useUIStore.getState().productEditorSession?.mainDetail).toBe(detailB);
  });

  it('вибір активної деталі — НЕ крок (ракурс/виділення байдуже)', () => {
    const current = useUIStore.getState().productEditorSession!;
    edit({ ...current, activeDetailId: 'skirting_A' });
    expect(useUIStore.getState().sessionHistory.length).toBe(0);
    expect(useUIStore.getState().productEditorSession?.activeDetailId).toBe('skirting_A');
  });

  it('серія швидких правок зливається в один крок', () => {
    vi.advanceTimersByTime(1000);
    // «Набрав 1-2-0-0»: чотири зміни поспіль у межах 800 мс
    useUIStore.getState().setProductEditorSession(session({ width: 1 } as never));
    vi.advanceTimersByTime(100);
    useUIStore.getState().setProductEditorSession(session({ width: 12 } as never));
    vi.advanceTimersByTime(100);
    useUIStore.getState().setProductEditorSession(session({ width: 120 } as never));
    vi.advanceTimersByTime(100);
    useUIStore.getState().setProductEditorSession(session(detailB));
    expect(useUIStore.getState().sessionHistory.length).toBe(1);
    useUIStore.getState().undoSession();
    expect(useUIStore.getState().productEditorSession?.mainDetail).toBe(detailA);
  });

  it('нова дія після undo стирає майбутнє', () => {
    edit(session(detailB));
    useUIStore.getState().undoSession();
    expect(useUIStore.getState().sessionFuture.length).toBe(1);
    edit(session(detailC));
    expect(useUIStore.getState().sessionFuture.length).toBe(0);
  });

  it('вихід із редактора скидає стеки', () => {
    edit(session(detailB));
    useUIStore.getState().setProductEditorSession(null);
    expect(useUIStore.getState().sessionHistory.length).toBe(0);
    expect(useUIStore.getState().sessionFuture.length).toBe(0);
  });

  it('undo без історії або поза редактором — нічого не робить', () => {
    useUIStore.getState().undoSession(); // історія порожня
    expect(useUIStore.getState().productEditorSession?.mainDetail).toBe(detailA);
    useUIStore.getState().setProductEditorSession(null);
    useUIStore.getState().undoSession(); // редактор закритий
    expect(useUIStore.getState().productEditorSession).toBeNull();
  });
});
