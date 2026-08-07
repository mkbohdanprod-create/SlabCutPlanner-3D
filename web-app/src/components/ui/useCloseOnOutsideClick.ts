import { useEffect, useRef } from 'react';

/**
 * Закрити спливне меню кліком повз нього.
 *
 * Виглядає як дрібниця, але саме тут жив баг, через який стик можна було
 * поставити РІВНО ОДИН РАЗ за сесію редагування.
 *
 * Було так (у чотирьох файлах, скопійовано один в один):
 *
 *     const timer = setTimeout(() => {
 *       document.addEventListener('click', handleClickOutside);
 *       return () => document.removeEventListener(...);   // ← нікуди
 *     }, 10);
 *     return () => clearTimeout(timer);                   // ← знімає лише таймер
 *
 * Функція прибирання поверталася з колбека `setTimeout`, а той повернутих
 * значень не читає. Тому слухач вішався на `document` НАЗАВЖДИ і після
 * закриття меню лишався жити разом зі своїм `onClose`. Наступний клік по
 * будь-де в застосунку викликав `onClose` того, вже закритого, меню — і
 * гасив нове меню в тому самому оброблюванні події, ще до відмальовування.
 * Ззовні це виглядало як «кнопка перестала натискатись».
 *
 * Тут же — два виправлення:
 *   · прибирання повертається з `useEffect`, як і має бути;
 *   · сам `onClose` тримаємо в ref, тому підписка живе рівно один монтаж і
 *     не перевішується на кожен рендер батька (інлайнові стрілки в JSX
 *     міняють ідентичність щоразу).
 *
 * Затримка 10 мс лишається: без неї клік, яким меню відкрили, встиг би
 * доплисти до `document` і закрити його миттєво.
 */
export function useCloseOnOutsideClick(onClose: () => void, delayMs = 10) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const handleClickOutside = () => onCloseRef.current();
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, delayMs);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [delayMs]);
}
