/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EdgeProfileSettingsModal } from '../EdgeProfileSettingsModal';
import { useProjectStore } from '../../../store/useProjectStore';

// Довідник обробок торців (01.09): фільтри по матеріалу, виконанню, виду
// і пошук — рядки групами, розріз у першій колонці.

afterEach(cleanup);

describe('EdgeProfileSettingsModal — фільтри', () => {
  it('матеріал «Акрил» ховає кварцитний борт 40, виконання «лише з потовщенням» лишає BullNose', () => {
    const st = useProjectStore.getState();
    useProjectStore.setState({ project: { ...st.project, projectMaterial: 'Кварцит' as never } });
    render(<EdgeProfileSettingsModal isOpen onClose={() => {}} />);
    expect(screen.getByText('h_40')).toBeTruthy();
    const [materialSel, execSel, kindSel] = screen.getAllByRole('combobox');
    fireEvent.change(materialSel, { target: { value: 'Акрил' } });
    expect(screen.queryByText('h_40')).toBeNull();
    expect(screen.getByText('acr_bullnose_r12')).toBeTruthy();
    // універсальні лишаються при матеріалі
    expect(screen.getByText('chamfer_2x2')).toBeTruthy();
    fireEvent.change(execSel, { target: { value: 'buildup' } });
    expect(screen.queryByText('chamfer_2x2')).toBeNull();
    expect(screen.getByText('acr_bullnose_r12')).toBeTruthy();
    fireEvent.change(kindSel, { target: { value: 'legacy' } });
    expect(screen.getByText(/Нічого не знайдено/)).toBeTruthy();
  });

  it('пошук по коду каталогу знаходить кварцитний R3 як ZR20, «лише з розрізом» ховає стик Z', () => {
    render(<EdgeProfileSettingsModal isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Пошук/), { target: { value: 'ZR20' } });
    expect(screen.getByText('r_3')).toBeTruthy();
    expect(screen.queryByText('zs_20')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Пошук/), { target: { value: '' } });
    expect(screen.getByText('z_12')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/лише з розрізом/));
    expect(screen.queryByText('z_12')).toBeNull();
    expect(screen.getByText('zs_12')).toBeTruthy();
  });
});
