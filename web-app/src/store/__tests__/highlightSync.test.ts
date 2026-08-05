import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isHighlightMessage,
  toHighlightMessage,
  publishHighlight,
  subscribeHighlight,
  setHighlightChannelForTests,
} from '../highlightSync';

// Друге вікно («відкрити в окремому вікні») — це окремий рантайм із
// власним стором. Єдине, що їх зв'язує, — цей канал. Тому кожна ланка
// перевіряється окремо: формат повідомлення, відправка, приймання
// і — найважливіше — відсутність пінг-понгу між двома вікнами.

type Listener = (event: MessageEvent) => void;

/** Мінімальна модель BroadcastChannel: спільна шина, свої повідомлення не приходять */
function makeBus() {
  const channels: FakeChannel[] = [];
  class FakeChannel {
    listeners: Listener[] = [];
    sent: unknown[] = [];
    constructor() { channels.push(this); }
    postMessage(message: unknown) {
      this.sent.push(message);
      channels.forEach((channel) => {
        if (channel === this) return; // відправник свого повідомлення не отримує
        channel.listeners.forEach((listener) => listener({ data: message } as MessageEvent));
      });
    }
    addEventListener(_type: 'message', listener: Listener) { this.listeners.push(listener); }
    removeEventListener(_type: 'message', listener: Listener) {
      this.listeners = this.listeners.filter((item) => item !== listener);
    }
    close() { this.listeners = []; }
  }
  return { FakeChannel, channels };
}

afterEach(() => setHighlightChannelForTests(undefined));

describe('формат повідомлення', () => {
  it('порожня підсвітка — теж валідне повідомлення (це «зняти виділення»)', () => {
    const message = toHighlightMessage({ serviceId: null, refs: null });
    expect(isHighlightMessage(message)).toBe(true);
  });

  it('undefined нормалізується в null — структурне клонування не любить дірок', () => {
    const message = toHighlightMessage({ serviceId: undefined as never, refs: undefined as never });
    expect(message.serviceId).toBeNull();
    expect(message.refs).toBeNull();
  });

  it('чуже повідомлення в каналі ігнорується', () => {
    expect(isHighlightMessage('sync')).toBe(false);
    expect(isHighlightMessage({ kind: 'інше', serviceId: 'X', refs: [] })).toBe(false);
    expect(isHighlightMessage({ kind: 'highlight', serviceId: 42, refs: [] })).toBe(false);
    expect(isHighlightMessage(null)).toBe(false);
  });
});

describe('передача між вікнами', () => {
  let bus: ReturnType<typeof makeBus>;

  beforeEach(() => {
    bus = makeBus();
    setHighlightChannelForTests(new bus.FakeChannel());
  });

  it('підсвітка доходить до іншого вікна разом із посиланнями', () => {
    const other = new bus.FakeChannel();
    const seen: unknown[] = [];
    other.addEventListener('message', (event) => seen.push(event.data));

    publishHighlight({ serviceId: 'EDGE_ROUND', refs: [{ partId: 'part_1', side: 'B' }] });

    expect(seen).toEqual([{
      kind: 'highlight',
      serviceId: 'EDGE_ROUND',
      refs: [{ partId: 'part_1', side: 'B' }],
    }]);
  });

  it('підписник отримує підсвітку, а після відписки — ні', () => {
    const applied: unknown[] = [];
    const stop = subscribeHighlight((payload) => applied.push(payload));

    const sender = new bus.FakeChannel();
    sender.postMessage(toHighlightMessage({ serviceId: 'CUT_45', refs: null }));
    expect(applied).toEqual([{ serviceId: 'CUT_45', refs: null }]);

    stop();
    sender.postMessage(toHighlightMessage({ serviceId: 'EDGE_ROUND', refs: null }));
    expect(applied).toHaveLength(1);
  });

  it('пінг-понгу немає: отримане не ретранслюється назад', () => {
    // Це головна пастка: якби вікно застосовувало підсвітку через дію
    // стора, воно б знову публікувало її в канал — і два вікна ганяли б
    // повідомлення по колу. Приймач мусить лише застосовувати.
    const mine = new bus.FakeChannel();
    setHighlightChannelForTests(mine);
    const stop = subscribeHighlight(() => {});

    const sender = new bus.FakeChannel();
    sender.postMessage(toHighlightMessage({ serviceId: 'CUT_45', refs: null }));

    expect(mine.sent).toHaveLength(0);
    stop();
  });

  it('канал упав — підсвітка не валить застосунок', () => {
    const broken = new bus.FakeChannel();
    broken.postMessage = () => { throw new Error('channel is closed'); };
    setHighlightChannelForTests(broken);
    expect(() => publishHighlight({ serviceId: 'X', refs: null })).not.toThrow();
  });

  it('без BroadcastChannel (jsdom, SSR) підписка — тихий no-op', () => {
    setHighlightChannelForTests(null);
    const apply = vi.fn();
    const stop = subscribeHighlight(apply);
    expect(() => stop()).not.toThrow();
    expect(apply).not.toHaveBeenCalled();
  });
});
