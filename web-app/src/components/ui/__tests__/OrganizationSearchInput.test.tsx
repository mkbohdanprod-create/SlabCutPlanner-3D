/**
 * @vitest-environment jsdom
 */
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { OrganizationSearchInput, MIN_ORG_QUERY_LENGTH, ORG_SEARCH_DEBOUNCE_MS } from '../OrganizationSearchInput';
import type { CustomerContact, CustomerOrganization } from '../../../lib/api';

// Пошук контрагента: перевіряємо саме умови, за яких запит летить у
// Customers Service (довжина + пауза), і те, що вибір зі списку віддає
// контактну особу з телефоном.

const searchOrganizations = vi.fn<(query: string, signal?: AbortSignal) => Promise<CustomerOrganization[]>>();
const organizationContacts = vi.fn<(id: string, signal?: AbortSignal) => Promise<CustomerContact[]>>();

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return {
    ...actual,
    api: {
      searchOrganizations: (...args: [string, AbortSignal?]) => searchOrganizations(...args),
      organizationContacts: (...args: [string, AbortSignal?]) => organizationContacts(...args),
    },
  };
});

const ORG: CustomerOrganization = { id: 'o1', title: 'СКАЙ ІНТЕРІОР', edrpou: '12345678' };
const CONTACT: CustomerContact = { id: 'c1', name: 'Богдан Дулиш', phone: '+380001112233' };

function Harness({ onPick }: { onPick: (org: CustomerOrganization, contact: CustomerContact | null) => void }) {
  const [value, setValue] = useState('');
  return (
    <OrganizationSearchInput
      value={value}
      onChange={setValue}
      onPick={(organization, contact) => {
        setValue(organization.title);
        onPick(organization, contact);
      }}
    />
  );
}

const type = (text: string) => {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: text } });
};

const wait = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

describe('поле «Контрагент» з пошуком', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchOrganizations.mockReset().mockResolvedValue([ORG]);
    organizationContacts.mockReset().mockResolvedValue([CONTACT]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('один символ довідник не турбує', async () => {
    render(<Harness onPick={vi.fn()} />);
    type('с');
    await wait(ORG_SEARCH_DEBOUNCE_MS * 3);
    expect(searchOrganizations).not.toHaveBeenCalled();
  });

  it('від двох символів і після паузи летить рівно один запит', async () => {
    render(<Harness onPick={vi.fn()} />);
    type('ск');
    expect(MIN_ORG_QUERY_LENGTH).toBe(2);
    // Пауза ще не витримана — запиту немає
    await wait(ORG_SEARCH_DEBOUNCE_MS - 50);
    expect(searchOrganizations).not.toHaveBeenCalled();

    await wait(60);
    expect(searchOrganizations).toHaveBeenCalledTimes(1);
    expect(searchOrganizations.mock.calls[0][0]).toBe('ск');
  });

  it('швидкий набір схлопується в один запит з останнім текстом', async () => {
    render(<Harness onPick={vi.fn()} />);
    type('ск');
    await wait(100);
    type('ска');
    await wait(100);
    type('скай');
    await wait(ORG_SEARCH_DEBOUNCE_MS + 50);
    expect(searchOrganizations).toHaveBeenCalledTimes(1);
    expect(searchOrganizations.mock.calls[0][0]).toBe('скай');
  });

  it('вибір організації підставляє назву, контактну особу й телефон', async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    type('скай');
    await wait(ORG_SEARCH_DEBOUNCE_MS + 50);

    const option = screen.getByRole('option', { name: /СКАЙ ІНТЕРІОР/ });
    await act(async () => {
      fireEvent.click(option);
    });

    expect(organizationContacts).toHaveBeenCalledWith('o1');
    expect(onPick).toHaveBeenCalledWith(ORG, CONTACT);
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'СКАЙ ІНТЕРІОР');
  });

  it('вибір зі списку не запускає новий пошук по підставленій назві', async () => {
    render(<Harness onPick={vi.fn()} />);
    type('скай');
    await wait(ORG_SEARCH_DEBOUNCE_MS + 50);
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /СКАЙ ІНТЕРІОР/ }));
    });
    await wait(ORG_SEARCH_DEBOUNCE_MS * 3);
    expect(searchOrganizations).toHaveBeenCalledTimes(1);
  });

  it('контакт, вкладений у саму організацію, не потребує другого запиту', async () => {
    const onPick = vi.fn();
    searchOrganizations.mockResolvedValue([{ ...ORG, contact: CONTACT }]);
    render(<Harness onPick={onPick} />);
    type('скай');
    await wait(ORG_SEARCH_DEBOUNCE_MS + 50);
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /СКАЙ ІНТЕРІОР/ }));
    });
    expect(organizationContacts).not.toHaveBeenCalled();
    expect(onPick.mock.calls[0][1]).toEqual(CONTACT);
  });

  it('недоступний довідник не блокує ручне введення', async () => {
    searchOrganizations.mockRejectedValue(new Error('502'));
    render(<Harness onPick={vi.fn()} />);
    type('скай');
    await wait(ORG_SEARCH_DEBOUNCE_MS + 50);
    expect(screen.getByText(/введіть контрагента вручну/)).toBeTruthy();
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'скай');
  });

  it('контрагент без контакту в довіднику не ламає вибір', async () => {
    const onPick = vi.fn();
    organizationContacts.mockResolvedValue([]);
    render(<Harness onPick={onPick} />);
    type('скай');
    await wait(ORG_SEARCH_DEBOUNCE_MS + 50);
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: /СКАЙ ІНТЕРІОР/ }));
    });
    expect(onPick).toHaveBeenCalledWith(ORG, null);
  });
});
