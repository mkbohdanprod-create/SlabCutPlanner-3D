import { describe, it, expect, vi } from 'vitest';
import { attachContextLossRecovery, isContextLost, waitForLiveContext } from '../webglContextRecovery';

describe('webglContextRecovery (FG-08 / SC-36)', () => {
  it('attachContextLossRecovery calls preventDefault on webglcontextlost — без цього браузер не відновлює контекст', () => {
    const listeners = new Map<string, EventListener>();
    const canvas = {
      addEventListener: vi.fn((type: string, cb: EventListener) => listeners.set(type, cb)),
      removeEventListener: vi.fn(),
    } as unknown as HTMLCanvasElement;

    const onLost = vi.fn();
    const detach = attachContextLossRecovery(canvas, onLost);

    const preventDefault = vi.fn();
    listeners.get('webglcontextlost')!({ preventDefault } as unknown as Event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onLost).toHaveBeenCalledTimes(1);

    detach();
    expect(canvas.removeEventListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
    expect(canvas.removeEventListener).toHaveBeenCalledWith('webglcontextrestored', expect.any(Function));
  });

  it('attachContextLossRecovery calls onRestored on webglcontextrestored', () => {
    const listeners = new Map<string, EventListener>();
    const canvas = {
      addEventListener: vi.fn((type: string, cb: EventListener) => listeners.set(type, cb)),
      removeEventListener: vi.fn(),
    } as unknown as HTMLCanvasElement;

    const onRestored = vi.fn();
    attachContextLossRecovery(canvas, undefined, onRestored);
    listeners.get('webglcontextrestored')!({} as Event);

    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it('isContextLost reflects the underlying WebGL context state', () => {
    const live = { getContext: () => ({ isContextLost: () => false }) };
    const lost = { getContext: () => ({ isContextLost: () => true }) };
    const missing = { getContext: () => null };

    expect(isContextLost(live as never)).toBe(false);
    expect(isContextLost(lost as never)).toBe(true);
    expect(isContextLost(missing as never)).toBe(true);
  });

  it('isContextLost treats a throwing getContext as lost, not as a crash', () => {
    const broken = { getContext: () => { throw new Error('no gl'); } };
    expect(isContextLost(broken as never)).toBe(true);
  });

  it('waitForLiveContext resolves immediately when the context is already live', async () => {
    const live = { getContext: () => ({ isContextLost: () => false }) };
    const result = await waitForLiveContext(live as never, 5, 1);
    expect(result).toBe(true);
  });

  it('waitForLiveContext polls until the context recovers within the attempt budget', async () => {
    let losts = 2; // "втрачено" перші 2 перевірки, потім відновлюється
    const gl = { getContext: () => ({ isContextLost: () => { const l = losts > 0; if (losts > 0) losts--; return l; } }) };
    const result = await waitForLiveContext(gl as never, 5, 1);
    expect(result).toBe(true);
  });

  it('waitForLiveContext gives up and reports false if the context never recovers — не знімаємо порожній кадр мовчки', async () => {
    const stillLost = { getContext: () => ({ isContextLost: () => true }) };
    const result = await waitForLiveContext(stillLost as never, 3, 1);
    expect(result).toBe(false);
  });
});
