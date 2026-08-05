import type { FactRef } from '../engines/productionFacts';

/**
 * Синхронізація підсвітки між вікнами.
 *
 * Кнопка «відкрити в окремому вікні» робить `window.open` — це ОКРЕМИЙ
 * рантайм із власними сторами. Проєкт між вікнами вже ходить через
 * BroadcastChannel + IndexedDB, а стан інтерфейсу — ні. Тому клік по
 * рядку кошторису в одному вікні нічого не підсвічував у другому:
 * рядок ставав активним лише там, де по ньому клікнули.
 *
 * Канал окремий від `slabcutplanner-sync`: там кожне повідомлення
 * змушує вікно перечитати проєкт із бази, а підсвітка — це UI-стан,
 * перечитувати заради неї нічого не треба.
 */

export const HIGHLIGHT_CHANNEL_NAME = 'slabcutplanner-highlight';

export type HighlightPayload = {
  serviceId: string | null;
  refs: FactRef[] | null;
};

type HighlightMessage = HighlightPayload & { kind: 'highlight' };

/** Чи це наше повідомлення. Канал наш, але чужий формат ігноруємо мовчки. */
export function isHighlightMessage(data: unknown): data is HighlightMessage {
  if (!data || typeof data !== 'object') return false;
  const message = data as Partial<HighlightMessage>;
  if (message.kind !== 'highlight') return false;
  const serviceOk = message.serviceId === null || typeof message.serviceId === 'string';
  const refsOk = message.refs === null || Array.isArray(message.refs);
  return serviceOk && refsOk;
}

export function toHighlightMessage(payload: HighlightPayload): HighlightMessage {
  return { kind: 'highlight', serviceId: payload.serviceId ?? null, refs: payload.refs ?? null };
}

type ChannelLike = {
  postMessage: (message: unknown) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  close: () => void;
};

let channel: ChannelLike | null = null;
let channelReady = false;

/** Канал створюємо один раз і ліниво: у тестах та SSR його може не бути взагалі. */
function getChannel(): ChannelLike | null {
  if (channelReady) return channel;
  channelReady = true;
  const Ctor = (globalThis as { BroadcastChannel?: new (name: string) => ChannelLike }).BroadcastChannel;
  channel = Ctor ? new Ctor(HIGHLIGHT_CHANNEL_NAME) : null;
  return channel;
}

/** Підставити канал у тестах (або скинути на справжній, передавши undefined). */
export function setHighlightChannelForTests(next: ChannelLike | null | undefined) {
  channel = next ?? null;
  channelReady = next !== undefined;
}

/** Розповісти іншим вікнам, що підсвічувати. Своє вікно повідомлення не отримує. */
export function publishHighlight(payload: HighlightPayload) {
  try {
    getChannel()?.postMessage(toHighlightMessage(payload));
  } catch {
    // Вікно вже закривається або канал закрито — підсвітка не той привід падати.
  }
}

/**
 * Слухати підсвітку з інших вікон. `apply` мусить класти стан НАПРЯМУ,
 * без publishHighlight — інакше два вікна почнуть пінг-понг.
 */
export function subscribeHighlight(apply: (payload: HighlightPayload) => void): () => void {
  const active = getChannel();
  if (!active) return () => {};
  const listener = (event: MessageEvent) => {
    if (isHighlightMessage(event.data)) apply({ serviceId: event.data.serviceId, refs: event.data.refs });
  };
  active.addEventListener('message', listener);
  return () => active.removeEventListener('message', listener);
}
