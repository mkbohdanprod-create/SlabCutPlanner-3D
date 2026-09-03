/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DetailPassportModal } from '../DetailPassportModal';
import type { Detail, Project } from '../../../domain/types';

// Регресія на конкретну поломку: пункт «Параметри та список обробок» у
// контекстному меню 3D нічого не відкривав. Меню віддає короткий слот
// (`main`), а деталі приходять повними шляхами
// `prod_1/element:main/detail:main` — компонент не знаходив деталь і
// повертав null, тобто вікна просто не було.

const details: Detail[] = [
  {
    id: 'prod_1/element:main/detail:main',
    label: 'Стільниця',
    type: 'Стільниця',
    shape: 'Прямокутна',
    quantity: 1,
    thickness: 20,
    geometry: { width: 1000, height: 600 },
    edgeProfiles: {},
  },
  {
    id: 'prod_1/element:skirting_A/detail:main',
    label: 'Підворот A',
    type: 'Довільний елемент',
    shape: 'Прямокутна',
    quantity: 1,
    thickness: 20,
    geometry: { width: 1000, height: 100 },
    edgeProfiles: {},
  },
] as unknown as Detail[];

const project = {
  id: 'proj',
  orderNumber: 'test',
  projectMaterial: 'Керамограніт',
  details,
  products: [],
  slabs: [],
  placements: [],
  referenceData: { edgeProfiles: [] },
} as unknown as Project;

const noop = () => {};

beforeEach(() => cleanup());

describe('DetailPassportModal', () => {
  it('відкривається, коли меню віддало короткий слот', () => {
    render(
      <DetailPassportModal
        detailId="main"
        project={project}
        details={details}
        onClose={noop}
        onSave={noop}
      />,
    );
    expect(screen.getByText('Обробки на деталі')).toBeTruthy();
    expect(screen.getByText('Послуги за цією деталлю')).toBeTruthy();
  });

  it('відкривається і за повним шляхом', () => {
    render(
      <DetailPassportModal
        detailId="prod_1/element:main/detail:main"
        project={project}
        details={details}
        onClose={noop}
        onSave={noop}
      />,
    );
    expect(screen.getByText('Обробки на деталі')).toBeTruthy();
  });

  it('слот доповнення знаходить саме своє доповнення', () => {
    render(
      <DetailPassportModal
        detailId="skirting_A"
        project={project}
        details={details}
        onClose={noop}
        onSave={noop}
      />,
    );
    expect(screen.getAllByText(/Підворот A/).length).toBeGreaterThan(0);
  });

  it('неіснуюча деталь нічого не малює і не падає', () => {
    const { container } = render(
      <DetailPassportModal
        detailId="leg_Z"
        project={project}
        details={details}
        onClose={noop}
        onSave={noop}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
