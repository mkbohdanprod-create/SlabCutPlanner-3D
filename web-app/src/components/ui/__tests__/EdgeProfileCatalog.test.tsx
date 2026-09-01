/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EdgeProfileCatalog } from '../EdgeProfileCatalog';
import { referenceData } from '../../../domain/defaults';
import { EDGE_PROFILE_DRAWING_IDS, edgeProfileDrawing } from '../../../domain/edgeProfileDrawings';
import { useProjectStore } from '../../../store/useProjectStore';

// Каталог кромок (01.09): картки з векторними розрізами, групи по матеріалу,
// пошук, вибір кліком. Перевіряємо DOM, бо це те, що бачить власник.

afterEach(cleanup);

function setMaterial(material: string) {
  const st = useProjectStore.getState();
  useProjectStore.setState({ project: { ...st.project, projectMaterial: material as never } });
}

describe('EdgeProfileCatalog', () => {
  it('усі 56 розрізів каталогу — валідні самодостатні SVG з viewBox', () => {
    expect(EDGE_PROFILE_DRAWING_IDS.length).toBe(56);
    for (const id of EDGE_PROFILE_DRAWING_IDS) {
      const d = edgeProfileDrawing(id)!;
      expect(d.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')).toBe(true);
      expect(d.svg).not.toMatch(/href|<script|<image|url\(/);
      expect(d.w).toBeGreaterThan(10);
      expect(d.h).toBeGreaterThan(5);
    }
    // усі id розрізів існують у довіднику
    const known = new Set((referenceData.edgeProfiles ?? []).map((p) => p.id));
    expect(EDGE_PROFILE_DRAWING_IDS.filter((id) => !known.has(id))).toEqual([]);
  });

  it('на кварциті показує групи з картками, борт 40 — «лише з потовщенням», інші матеріали згорнуті', () => {
    setMaterial('Кварцит');
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<EdgeProfileCatalog request={{ title: 'Сторона A', material: 'Кварцит', value: 'zs_20', allowNone: true, onSelect }} onClose={onClose} />);
    expect(screen.getByText('Каталог кромок')).toBeTruthy();
    expect(screen.getByText('Кварцит — у товщині плити')).toBeTruthy();
    expect(screen.getByText('Кварцит — лише з потовщенням (зрощення плит)')).toBeTruthy();
    // картка H40 видима з розрізом і бейджем виконання
    const h40 = screen.getByText('H40').closest('button')!;
    expect(h40.querySelector('img')).toBeTruthy();
    expect(h40.textContent).toContain('лише з потовщенням');
    // серія 12 — у згорнутій групі «Інші матеріали»: картки не відрендерені
    expect(screen.queryByText('ZS12')).toBeNull();
    fireEvent.click(screen.getByText('Інші матеріали'));
    expect(screen.getByText('ZS12')).toBeTruthy();
    // вибір кліком → onSelect + закриття
    fireEvent.click(h40);
    expect(onSelect).toHaveBeenCalledWith('h_40');
    expect(onClose).toHaveBeenCalled();
  });

  it('пошук знаходить по коду каталогу і по формі, «Без кромки» віддає порожній id', () => {
    setMaterial('Керамограніт');
    const onSelect = vi.fn();
    render(<EdgeProfileCatalog request={{ material: 'Керамограніт', allowNone: true, onSelect }} onClose={() => {}} />);
    const input = screen.getByPlaceholderText(/Пошук/);
    fireEvent.change(input, { target: { value: 'zr20' } });
    // r_3 підписаний кодом каталогу ZR20 (гіпотеза) — знаходиться навіть у згорнутій групі
    expect(screen.getByText('R3').closest('button')!.textContent).toContain('ZR20?');
    fireEvent.change(input, { target: { value: 'увігнутий' } });
    expect(screen.getByText('L20')).toBeTruthy();
    expect(screen.queryByText('ZS12')).toBeNull();
    fireEvent.click(screen.getByText('Без кромки'));
    expect(onSelect).toHaveBeenCalledWith('');
  });
});
