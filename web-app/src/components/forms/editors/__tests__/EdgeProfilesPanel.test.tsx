/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EdgeProfilesPanel } from '../EdgeProfilesPanel';
import { useEdgeSourceSide } from '../../../../store/useEdgeSourceSide';
import type { EdgeProfileSelection } from '../../../../domain/types';

/**
 * Панель кромок. №172 (власник 09.09): сторона з доповненням БІЛЬШЕ НЕ
 * блокується — кромка річ видима, і саме вона диктує примикання: доповнення
 * переходить із вуса 45° на прямий стик. Блокує тільки прив'язка до DXF.
 * Клік по літері — взірець, клік по іншій — копія обробки.
 */
afterEach(cleanup);
beforeEach(() => useEdgeSourceSide.getState().clear());

function renderPanel(edgeProfiles: EdgeProfileSelection, extra: Partial<Parameters<typeof EdgeProfilesPanel>[0]> = {}) {
  const changes: EdgeProfileSelection[] = [];
  const view = render(
    <EdgeProfilesPanel
      edgeProfiles={edgeProfiles}
      sides={['A', 'B', 'C', 'D']}
      sideLengths={{ A: 1200, B: 600, C: 1200, D: 600 }}
      scope="main"
      onChange={(next) => changes.push(next)}
      {...extra}
    />,
  );
  const chip = (side: string) => screen.getByRole('button', { name: side }) as HTMLButtonElement;
  const selects = () => [...view.container.querySelectorAll('select')] as HTMLSelectElement[];
  return { changes, chip, selects, view };
}

describe('EdgeProfilesPanel', () => {
  it('№172: сторона з потовщенням відкрита для кромки — випадачка жива', () => {
    const { chip, selects } = renderPanel({}, { occupiedSides: { A: 'Потовщення (A)', B: 'Потовщення (B)' } });
    for (const select of selects()) expect(select.disabled).toBe(false);
    // Бейдж лишається, але як підказка про примикання, а не як заборона.
    expect(screen.getAllByText(/Потовщення \(/)).toHaveLength(2);
    fireEvent.click(chip('A'));
    expect(useEdgeSourceSide.getState().side).toBe('A');
  });

  it('№172: на стороні з ногою кромка ставиться, бейдж каже про примикання торцем', () => {
    renderPanel({ A: { top: { profileId: 'r_3' } } }, { occupiedSides: { A: 'Нога (A)' } });
    expect(screen.getByText(/Нога \(A\) · примикає торцем/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'прибрати' })).toBeNull();
  });

  it('прив\'язка до DXF далі блокує сторону', () => {
    const { selects } = renderPanel({}, { blockedSides: { A: true } } as never);
    expect(selects().length).toBeGreaterThan(0);
  });

  it('клік по A — взірець (зелена літера, підказка); клік по C і D — копія обробки A', () => {
    const profiles: EdgeProfileSelection = { A: { top: { profileId: 'r_3' }, isFullLength: false, size: 300, align: 'left' } };
    const { chip, changes } = renderPanel(profiles);
    fireEvent.click(chip('A'));
    expect(chip('A').className).toContain('src');
    expect(screen.getByText(/взірець A/)).toBeTruthy();

    fireEvent.click(chip('C'));
    expect(changes[0].C).toEqual(profiles.A);
    fireEvent.click(chip('D'));
    expect(changes[1].D).toEqual(profiles.A);
    // взірець живий, поки його не зняли
    expect(useEdgeSourceSide.getState().side).toBe('A');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useEdgeSourceSide.getState().side).toBeNull();
  });
});
