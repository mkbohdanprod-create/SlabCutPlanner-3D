import { create } from 'zustand';

/**
 * КАТАЛОГ КРОМОК — один на весь застосунок (01.09.2026).
 *
 * Модалка з картками розрізів відкривається з чотирьох місць (редактор
 * виробу, дизайнер обробки, властивості розміщення, контекстне меню ребра),
 * і кожне з них тримає свій спосіб «застосувати вибір». Щоб не носити
 * модалку в кожен компонент (а контекстне меню ще й закривається кліком
 * поза ним — модалка всередині нього не вижила б), запит на вибір кладеться
 * сюди, а сама модалка змонтована один раз у App (EdgeProfileCatalogHost).
 */
export interface EdgeCatalogRequest {
  /** Підпис у шапці: «Сторона A · лицьове ребро». */
  title?: string;
  /** Матеріал виробу/проєкту — чиї форми йдуть угорі. */
  material?: string | null;
  /** Поточний профіль (підсвічується). */
  value?: string | null;
  /** Показувати кнопку «Без кромки» (onSelect('')). */
  allowNone?: boolean;
  onSelect: (profileId: string) => void;
}

interface EdgeCatalogState {
  request: EdgeCatalogRequest | null;
  open: (request: EdgeCatalogRequest) => void;
  close: () => void;
}

export const useEdgeCatalog = create<EdgeCatalogState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

export function openEdgeCatalog(request: EdgeCatalogRequest) {
  useEdgeCatalog.getState().open(request);
}
