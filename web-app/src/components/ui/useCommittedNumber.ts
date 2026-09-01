import { useState } from 'react';
import type React from 'react';

/**
 * ЧИСЛОВЕ ПОЛЕ, ЯКЕ ЗАСТОСОВУЄТЬСЯ ПІСЛЯ НАБОРУ, А НЕ ПІД ЧАС.
 *
 * Проблема, яку це лікує: поле розміру писало значення на КОЖНЕ натискання
 * клавіші. Стираєш «1600», набираєш «600» — і після першої ж «6» застосувався
 * розмір 6 мм: він затиснувся мінімумом, перерахував сусідні сторони, а поле
 * показало вже оброблене число. Далі «00» дописувались до нього — виходило
 * 601 або 8601. Менеджеру доводилось «вводити першу цифру і стирати останню».
 *
 * Поки поле в роботі, воно живе власним текстом і НЕ приймає зовнішніх змін;
 * значення йде в модель на Enter або при втраті фокуса. Escape — відмовитись
 * від правки. Порожнє поле нічого не застосовує (можна стерти все і подумати).
 */
export function useCommittedNumber(
  value: number,
  onCommit: (next: number) => void,
) {
  // null = «не редагується», показуємо число з моделі
  const [draftText, setDraftText] = useState<string | null>(null);

  const commit = (text: string | null) => {
    setDraftText(null);
    if (text === null) return;
    const trimmed = text.trim();
    if (trimmed === '') return;            // стер усе й пішов — лишаємо як було
    const next = Number(trimmed);
    if (!Number.isFinite(next)) return;
    if (next === Math.round(value)) return; // нічого не змінилось — не смикаємо модель
    onCommit(next);
  };

  return {
    value: draftText ?? String(Math.round(value)),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraftText(e.target.value),
    onBlur: () => commit(draftText),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commit(draftText);
        (e.target as HTMLInputElement).blur();
      } else if (e.key === 'Escape') {
        setDraftText(null);
        (e.target as HTMLInputElement).blur();
      }
    },
  };
}
