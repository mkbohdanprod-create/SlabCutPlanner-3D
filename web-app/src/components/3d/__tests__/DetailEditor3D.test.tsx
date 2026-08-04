/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailEditor3D } from '../DetailEditor3D';
import { useUIStore } from '../../../store/useStore';
import { useProjectStore } from '../../../store/useProjectStore';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  Settings2: () => <div data-testid="icon-settings" />,
  X: () => <div data-testid="icon-x" />
}));

describe('DetailEditor3D Inputs', () => {
  beforeEach(() => {
    // Setup stores
    useUIStore.setState({ selectedId3d: 'pl1' });
    useProjectStore.setState({
      project: {
        id: 'proj1',
        placements: [
          {
            id: 'pl1',
            partId: 'p1',
            slabId: 's1',
            x: 0, y: 0, rotation: 0, manualLocked: false,
            transform3d: { x: 10, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
          }
        ],
        slabs: [{ id: 's1', thickness: 20 } as any],
        textureLayouts: [],
        createdAt: '', updatedAt: '', name: '', orderNumber: '', materialId: '', parts: [], details: [], groups: [], textureFrames: []
      },
      parts: [
        { id: 'p1', name: 'Test Part', width: 1000, height: 600 } as any
      ],
      currentDbProjectId: null
    });
  });

  it('allows typing negative numbers and decimals without prematurely updating the store with 0', () => {
    render(<DetailEditor3D />);

    // The component renders 6 inputs. We want the first one (X axis).
    // The initial value should be 10000 (10mm * 1000)
    const inputs = screen.getAllByRole('textbox'); // We used type="text"
    const inputX = inputs[0] as HTMLInputElement;
    
    expect(inputX.value).toBe('10000');

    // 1. Enter "-"
    fireEvent.change(inputX, { target: { value: '-' } });
    expect(inputX.value).toBe('-'); // Local state holds '-'
    // Store should NOT be updated because parseFloat('-') is NaN
    expect(useProjectStore.getState().project.placements[0].transform3d?.x).toBe(10);

    // 2. Enter "-1"
    fireEvent.change(inputX, { target: { value: '-1' } });
    expect(inputX.value).toBe('-1'); // Local state holds '-1'
    // Store SHOULD be updated because parseFloat('-1') is -1
    // toMm uses fromMm which is value / 1000 = -0.001
    expect(useProjectStore.getState().project.placements[0].transform3d?.x).toBe(-0.001);

    // 3. Enter "-1."
    fireEvent.change(inputX, { target: { value: '-1.' } });
    expect(inputX.value).toBe('-1.'); // Local state holds '-1.'
    // Store should stay -0.001 because parseFloat('-1.') is -1
    expect(useProjectStore.getState().project.placements[0].transform3d?.x).toBe(-0.001);

    // 4. Enter "-1.5"
    fireEvent.change(inputX, { target: { value: '-1.5' } });
    expect(inputX.value).toBe('-1.5'); // Local state holds '-1.5'
    // Store should update to -1.5 / 1000 = -0.0015
    expect(useProjectStore.getState().project.placements[0].transform3d?.x).toBe(-0.0015);

    // 5. Blur the input
    fireEvent.blur(inputX);
    // On blur, local state is cleared, so it reads from the store (which is -0.0015 -> toMm -> -1.5)
    // Actually, toMm uses Math.round(-0.0015 * 1000) = -1.5 -> Math.round(-1.5) = -1
    expect(inputX.value).toBe('-1'); // Math.round(-1.5) is -1 in JS
  });
});
