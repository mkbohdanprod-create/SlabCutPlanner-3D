import { describe, it, expect, afterEach, vi } from 'vitest';
import { useUIStore, stopHighlightSync } from '../useStore';
import {
  HIGHLIGHT_CHANNEL_NAME,
  toHighlightMessage,
  setHighlightChannelForTests,
} from '../highlightSync';

// Наскрізна перевірка двовіконного режиму: стор одного вікна ↔ канал ↔
// стор іншого. Тут не мокається нічого зайвого — приймальна сторона
// підписана самим модулем стора, тому шлемо в справжній канал.

afterEach(() => {
  setHighlightChannelForTests(undefined);
  useUIStore.setState({ highlightedServiceId: null, highlightedFactRefs: null });
});

describe('підсвітка у двовіконному режимі', () => {
  it('клік по рядку кошторису йде і в свій стор, і в канал', () => {
    const sent: unknown[] = [];
    setHighlightChannelForTests({
      postMessage: (message) => sent.push(message),
      addEventListener: () => {},
      removeEventListener: () => {},
      close: () => {},
    });

    const refs = [{ partId: 'part_1', side: 'B' }];
    useUIStore.getState().setHighlightedService('EDGE_ROUND', refs);

    expect(useUIStore.getState().highlightedServiceId).toBe('EDGE_ROUND');
    expect(sent).toEqual([{ kind: 'highlight', serviceId: 'EDGE_ROUND', refs }]);
  });

  it('зняття виділення теж їде в інше вікно', () => {
    const sent: unknown[] = [];
    setHighlightChannelForTests({
      postMessage: (message) => sent.push(message),
      addEventListener: () => {},
      removeEventListener: () => {},
      close: () => {},
    });

    useUIStore.getState().setHighlightedService(null, null);
    expect(sent).toEqual([{ kind: 'highlight', serviceId: null, refs: null }]);
  });

  it('підсвітка з іншого вікна лягає в стор цього вікна', async () => {
    const otherWindow = new BroadcastChannel(HIGHLIGHT_CHANNEL_NAME);
    try {
      otherWindow.postMessage(toHighlightMessage({
        serviceId: 'CUT_45',
        refs: [{ partId: 'part_2', side: 'C' }],
      }));
      await vi.waitFor(() => {
        expect(useUIStore.getState().highlightedServiceId).toBe('CUT_45');
      });
      expect(useUIStore.getState().highlightedFactRefs).toEqual([{ partId: 'part_2', side: 'C' }]);
    } finally {
      otherWindow.close();
    }
  });

  it('після stopHighlightSync вікно більше не слухає', async () => {
    stopHighlightSync();
    const otherWindow = new BroadcastChannel(HIGHLIGHT_CHANNEL_NAME);
    try {
      otherWindow.postMessage(toHighlightMessage({ serviceId: 'ІНШЕ', refs: null }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(useUIStore.getState().highlightedServiceId).toBeNull();
    } finally {
      otherWindow.close();
    }
  });
});
