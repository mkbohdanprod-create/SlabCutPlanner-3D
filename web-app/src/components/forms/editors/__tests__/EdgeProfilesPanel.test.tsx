/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EdgeProfilesPanel } from '../EdgeProfilesPanel';
import { useEdgeSourceSide } from '../../../../store/useEdgeSourceSide';
import type { EdgeProfileSelection } from '../../../../domain/types';

/**
 * Панель кромок (01.09): сторона з доповненням заблокована; клік по літері —
 * взірець, клік по іншій — копія обробки.
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
  it('сторона з потовщенням: випадачка вимкнена, бейдж «зайнято», літера не стає взірцем', () => {
    const { chip, selects } = renderPanel({}, { occupiedSides: { A: 'Потовщення (A)', B: 'Потовщення (B)' } });
    const [a, b, c] = selects();
    expect(a.disabled).toBe(true);
    expect(b.disabled).toBe(true);
    expect(c.disabled).toBe(false);
    expect(screen.getAllByText(/зайнято: Потовщення/)).toHaveLength(2);
    fireEvent.click(chip('A'));
    expect(useEdgeSourceSide.getState().side).toBeNull();
  });

  it('форма, що лишилась на зайнятій стороні, показана і прибирається однією кнопкою', () => {
    const { changes } = renderPanel({ A: { top: { profileId: 'r_3' } } }, { occupiedSides: { A: 'Нога (A)' } });
    expect(screen.getByText(/форма лишилась/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'прибрати' }));
    expect(changes).toEqual([{}]);
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
