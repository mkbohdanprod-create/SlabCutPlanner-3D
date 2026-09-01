/**
 * @vitest-environment jsdom
 */
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { BranchSelect } from '../BranchSelect';
import { resetBranchesCache } from '../branchesCache';
import type { Branch } from '../../../lib/api';

// Довідник філій маленький — забирається одним запитом і фільтрується вже
// в браузері, без дебаунсу й мережі на кожну літеру (на відміну від
// OrganizationSearchInput). Перевіряємо саме це: один виклик на весь
// компонент, локальний фільтр за назвою й кодом, ручне введення лишається.

const listBranches = vi.fn<() => Promise<Branch[]>>();

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return { ...actual, api: { listBranches: (...args: []) => listBranches(...args) } };
});

const BRANCHES: Branch[] = [
  { id: 'b1', title: 'Луцьк', code: '59' },
  { id: 'b2', title: 'Львів', code: '12' },
  { id: 'b3', title: 'Київ', code: '1' },
];

function Harness({ onPick }: { onPick: (branch: Branch) => void }) {
  const [value, setValue] = useState('');
  return (
    <BranchSelect
      value={value}
      onChange={setValue}
      onPick={(branch) => { setValue(branch.title); onPick(branch); }}
    />
  );
}

const type = (text: string) => fireEvent.change(screen.getByRole('combobox'), { target: { value: text } });
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('поле «Філія» з локальним пошуком', () => {
  beforeEach(() => {
    resetBranchesCache();
    listBranches.mockReset().mockResolvedValue(BRANCHES);
  });

  afterEach(cleanup);

  it('список забирається один раз на весь застосунок', async () => {
    const { unmount } = render(<Harness onPick={vi.fn()} />);
    await flush();
    unmount();
    render(<Harness onPick={vi.fn()} />);
    await flush();
    expect(listBranches).toHaveBeenCalledTimes(1);
  });

  it('фільтр працює локально — без мережі на кожну літеру', async () => {
    render(<Harness onPick={vi.fn()} />);
    await flush();
    fireEvent.focus(screen.getByRole('combobox'));
    type('льв');
    await flush();
    expect(screen.getByText('Львів')).toBeTruthy();
    expect(screen.queryByText('Луцьк')).toBeNull();
    expect(listBranches).toHaveBeenCalledTimes(1);
  });

  it('фільтр працює і за кодом філії', async () => {
    render(<Harness onPick={vi.fn()} />);
    await flush();
    fireEvent.focus(screen.getByRole('combobox'));
    type('59');
    await flush();
    expect(screen.getByText('Луцьк')).toBeTruthy();
  });

  it('вибір зі списку віддає філію повністю', async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await flush();
    fireEvent.focus(screen.getByRole('combobox'));
    type('льв');
    await flush();
    fireEvent.click(screen.getByText('Львів'));
    expect(onPick).toHaveBeenCalledWith(BRANCHES[1]);
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Львів');
  });

  it('довідник недоступний — поле лишається робочим для ручного вводу', async () => {
    listBranches.mockReset().mockRejectedValue(new Error('unavailable'));
    render(<Harness onPick={vi.fn()} />);
    await flush();
    fireEvent.focus(screen.getByRole('combobox'));
    type('Нова філія');
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Нова філія');
  });
});
