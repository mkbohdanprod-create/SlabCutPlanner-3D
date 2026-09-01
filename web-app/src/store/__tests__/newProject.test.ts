/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../useProjectStore';

/**
 * НОВИЙ ПРОЄКТ — це знищення поточного, тому найнебезпечніша частина не в
 * очищенні, а в прив'язці до кабінету: якщо лишити `currentDbProjectId`,
 * перший же автозапис покладе порожній проєкт ПОВЕРХ збереженого.
 */

describe('створення нового проєкту', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: {
        ...useProjectStore.getState().project,
        orderNumber: '81-0077777',
        customer: 'Перший Олег',
        details: [{ id: 'det_1' }] as never,
        products: [{ id: 'prod_1', name: 'Виріб', elements: [] }] as never,
      },
      currentDbProjectId: 'db_42',
      history: [{} as never],
      future: [{} as never],
    });
  });

  it('очищає вміст проєкту', () => {
    useProjectStore.getState().newProject();
    const { project } = useProjectStore.getState();
    expect(project.details).toHaveLength(0);
    expect(project.products ?? []).toHaveLength(0);
    expect(project.orderNumber ?? '').toBe('');
  });

  it('рве прив\'язку до кабінету — інакше затре збережений проєкт', () => {
    useProjectStore.getState().newProject();
    expect(useProjectStore.getState().currentDbProjectId).toBeNull();
  });

  it('обнуляє історію — Ctrl+Z не має перелазити межу проєктів', () => {
    useProjectStore.getState().newProject();
    expect(useProjectStore.getState().history).toHaveLength(0);
    expect(useProjectStore.getState().future).toHaveLength(0);
  });
});
