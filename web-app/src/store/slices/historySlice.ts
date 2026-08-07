import type { StateCreator } from 'zustand';
import type { ProjectState } from '../useProjectStore';
import type { DetailPart, Project } from '../../domain/types';
import { persist } from '../persistence';

/**
 * ГЛОБАЛЬНИЙ UNDO/REDO — один стек на весь проєкт.
 *
 * До 07.08.2026 історія запам'ятовувала лише рух деталей на слябі
 * (MovementSnapshot: placements + textureLayouts). Тепер знімок — це ПАРА
 * посилань `{project, parts}`, тому скасовується будь-що: розміри, вирізи,
 * кромки, додавання й видалення виробів, зміна припусків, перерозкрій.
 *
 * Три рішення, на яких це тримається:
 *
 * 1. ЗНІМОК — ЦЕ ПОСИЛАННЯ, НЕ КОПІЯ. Стор працює через immer: кожен стан
 *    іммутабельний, незмінені частини (включно з фото слябів у base64 — це
 *    95% ваги проєкту) шеряться між знімками безкоштовно. Deep-clone тут
 *    заборонений: JSON.stringify проєкту з фото — це сотні мегабайт і фриз.
 *    Саме тому глибина може бути 50, а не «2-3 кроки».
 *
 * 2. ПАРА project+parts ВІДНОВЛЮЄТЬСЯ РАЗОМ. Парти — похідна від проєкту;
 *    відновлювати одне без іншого означає розсинхрон карти крою з деревом
 *    виробів. Зберігаємо обидва посилання — undo миттєвий, без перерозкрою.
 *
 * 3. UNDO ВБИВАЄ ВІДПОВІДІ ВОРКЕРА, ЩО ЛЕТЯТЬ. Розкрій асинхронний: якщо
 *    користувач змінив розмір і одразу натиснув Ctrl+Z, відповідь воркера
 *    для нового розміру прийшла б ПІСЛЯ відкату і перезаписала правильний
 *    стан. Тому кожен undo/redo інкрементує packingRequestId — обробник
 *    відповіді воркера звіряє id і застарілу відповідь мовчки викидає
 *    (той самий механізм, що захищає звичайні перерахунки).
 *
 * Звідки беруться знімки (одна дія користувача = один крок):
 *   · triggerPackingAsync — єдиний конвеєр усіх змін складу виробів/деталей
 *     (інваріант 2.4) — кладе знімок ДО застосування зміни;
 *   · операції руху на слябі й у текстурі кличуть pushHistorySnapshot
 *     на початку жесту (як і раніше кликали pushMovementSnapshot);
 *   · відповідь воркера знімка НЕ кладе — це продовження того ж кроку.
 */

export interface ProjectSnapshot {
  project: Project;
  parts: DetailPart[];
}

const HISTORY_DEPTH = 50;

export interface HistorySlice {
  history: ProjectSnapshot[];
  future: ProjectSnapshot[];
  pushHistorySnapshot: () => void;
  undo: () => void;
  redo: () => void;
  /** Старі імена — щоб не чіпати SlabBoard і TextureLayoutPanel */
  pushMovementSnapshot: () => void;
  undoLastMovement: () => void;
  redoMovement: () => void;
}

export const createHistorySlice: StateCreator<
  ProjectState,
  [['zustand/immer', never]],
  [],
  HistorySlice
> = (set, get) => {
  // Посилання беремо через get() ДО set(): усередині immer state.project — це
  // драфт-проксі, і порівняння «збережене посилання === драфт» завжди хибне.
  // Дедуп працює тільки на фіналізованих посиланнях.
  const push = () => {
    const { history, project, parts } = get();
    const last = history[history.length - 1];
    if (last && last.project === project && last.parts === parts) return;
    set((state) => {
      state.history.push({ project, parts } as never);
      if (state.history.length > HISTORY_DEPTH) state.history.shift();
      state.future = [];
    });
  };

  const restore = (direction: 'undo' | 'redo') => {
    const stack = direction === 'undo' ? get().history : get().future;
    if (!stack.length) return;
    const snap = stack[stack.length - 1];
    const current: ProjectSnapshot = { project: get().project, parts: get().parts };

    set((state) => {
      if (direction === 'undo') {
        state.history.pop();
        state.future.push(current);
      } else {
        state.future.pop();
        state.history.push(current);
      }
      state.project = snap.project as never;
      state.parts = snap.parts as never;
      // Відсікаємо відповіді воркера, запущені до відкату (рішення №3 вище)
      state.packingRequestId += 1;
      state.isPacking = false;
    });

    // Без негайного запису F5 показав би стан, який щойно скасували
    persist(get().project, get().currentDbProjectId);
  };

  return {
    history: [],
    future: [],

    pushHistorySnapshot: push,
    undo: () => restore('undo'),
    redo: () => restore('redo'),

    pushMovementSnapshot: push,
    undoLastMovement: () => restore('undo'),
    redoMovement: () => restore('redo'),
  };
};
