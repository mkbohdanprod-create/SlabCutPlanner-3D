/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { referenceData } from '../../../../domain/defaults';
import { EdgeProfileOptionGroups } from '../EdgeProfileOptions';

// Випадачка «форма кромки» (01.09): опції розкладені по optgroup —
// універсальні → матеріал у товщині → матеріал з потовщенням → операції →
// інші матеріали → спадок. Тут перевіряємо саме DOM селекта, бо цей
// компонент стоїть у чотирьох селектах редактора і має давати один порядок.

afterEach(cleanup);

function renderSelect(material?: string | null) {
  const { container } = render(
    <select defaultValue="">
      <option value="">Без кромки</option>
      <EdgeProfileOptionGroups profiles={referenceData.edgeProfiles} material={material} />
    </select>,
  );
  const select = container.querySelector('select')!;
  return {
    groups: [...select.querySelectorAll('optgroup')].map((g) => g.label),
    options: [...select.querySelectorAll('option')].map((o) => o.value),
    firstOfGroup: (label: string) => select.querySelector(`optgroup[label="${label}"] option`) as HTMLOptionElement,
  };
}

describe('EdgeProfileOptionGroups', () => {
  it('на кварциті борт 40 стоїть окремою групою «лише з потовщенням», серія 12 — в «Інших матеріалах»', () => {
    const s = renderSelect('Кварцит');
    expect(s.groups).toEqual([
      'Універсальні',
      'Кварцит — у товщині плити',
      'Кварцит — лише з потовщенням (зрощення плит)',
      'Операції торця (не форма)',
      'Інші матеріали',
      'Спадок — у каталозі цеху нема',
    ]);
    // «Без кромки» + «Каталог з розрізами…» + усі 70 профілів, жодного загубленого
    expect(s.options.length).toBe(2 + (referenceData.edgeProfiles?.length ?? 0));
    expect(s.options[1]).toBe('__catalog__');
    expect(s.firstOfGroup('Кварцит — лише з потовщенням (зрощення плит)').value).toBe('h_40');
    expect(s.firstOfGroup('Інші матеріали').value).toBe('d_12');
    // підказка на option — матеріали і спосіб виконання
    expect(s.firstOfGroup('Кварцит — лише з потовщенням (зрощення плит)').title).toContain('дві плити 20');
  });

  it('без матеріалу — групи по кожному матеріалу, універсальні першими', () => {
    const s = renderSelect(null);
    expect(s.groups[0]).toBe('Універсальні');
    expect(s.groups).toContain('Керамограніт — у товщині плити');
    expect(s.groups).toContain('Акрил — лише з потовщенням (зрощення плит)');
    expect(s.options.length).toBe(2 + (referenceData.edgeProfiles?.length ?? 0));
  });
});
