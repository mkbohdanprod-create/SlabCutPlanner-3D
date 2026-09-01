/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SlabCatalogWmsPanel } from '../SlabCatalogWmsPanel';
import * as wms from '../../../lib/wmsStock';

/**
 * Джерело «WMS» у вікні вибору сляба (01.09): пошук за артикулом, чесний
 * стан «відповідь не отримана», лист стає слябом з точним габаритом.
 */
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const sheet: wms.WmsSheet = {
  sheet: 'SLAB-116034-07', width: 1900, height: 900, thickness: 12, state: 'remnant', status: 'free',
  cell: 'B-18', batch: 'L-2211', tone: 'A3', photo: null, updatedAt: null,
};

describe('SlabCatalogWmsPanel', () => {
  it('до натискання «Знайти» склад не смикається; кнопка вимкнена на короткому коді', () => {
    const spy = vi.spyOn(wms, 'fetchWmsSheets');
    render(<SlabCatalogWmsPanel material="Керамограніт" manufacturer="Laminam" onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Введіть артикул/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Наприклад 116034'), { target: { value: '11' } });
    expect((screen.getByRole('button', { name: 'Знайти на складі' }) as HTMLButtonElement).disabled).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('WMS не відповіла — кажемо «відповідь не отримана», а не «порожньо»', async () => {
    vi.spyOn(wms, 'fetchWmsSheets').mockRejectedValue(new wms.WmsError('unreachable', 'WMS недоступна — запит не пройшов'));
    render(<SlabCatalogWmsPanel material="Кварцит" manufacturer="" onPick={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Наприклад 116034'), { target: { value: '116034' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Наприклад 116034'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText(/Відповідь від WMS не отримана/)).toBeTruthy(), { timeout: 2000 });
    expect(screen.queryByText(/на складі немає/)).toBeNull();
  });

  it('лист зі складу → сляб з точним габаритом листа, артикул = код запиту', async () => {
    vi.spyOn(wms, 'fetchWmsSheets').mockResolvedValue({ code: '116034', generatedAt: null, total: 1, truncated: false, sheets: [sheet] });
    const picks: unknown[] = [];
    render(<SlabCatalogWmsPanel material="Керамограніт" manufacturer="Laminam" onPick={(p) => picks.push(p)} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Наприклад 116034'), { target: { value: '116034' } });
    fireEvent.click(screen.getByRole('button', { name: 'Знайти на складі' }));
    await waitFor(() => expect(screen.getByText('SLAB-116034-07')).toBeTruthy(), { timeout: 2000 });
    expect(screen.getByText(/1900 × 900 × 12 мм · залишок/)).toBeTruthy();
    fireEvent.click(screen.getByText('SLAB-116034-07'));
    expect(picks[0]).toMatchObject({
      article: '116034', name: 'Лист SLAB-116034-07', material: 'Керамограніт', manufacturer: 'Laminam',
      width: 1900, height: 900, thickness: 12, needsManualPhoto: true, quantity: 1,
    });
  });
});
