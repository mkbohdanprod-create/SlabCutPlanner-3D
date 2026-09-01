import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Нижня шухляда (bottom sheet) — мобільна заміна бокової панелі.
 *
 * Чому знизу, а не збоку: великий палець дістає до низу екрана, до верху —
 * ні. Тому все, що людина відкриває часто, живе внизу.
 *
 * Дві висоти замість плавного перетягування: «половина» (працюєш і бачиш
 * креслення) і «повна» (заповнюєш форму). Плавне тягання виглядає гарно в
 * демо, але на реальному пальці постійно промахується повз потрібну висоту.
 */

export type SheetHeight = 'half' | 'full';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Початкова висота при відкритті */
  initial?: SheetHeight;
}

export function MobileSheet({ open, title, onClose, children, initial = 'half' }: Props) {
  const [height, setHeight] = useState<SheetHeight>(initial);
  const startY = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // При кожному відкритті починаємо з тієї висоти, яку просили
  useEffect(() => {
    if (open) setHeight(initial);
  }, [open, initial]);

  // Escape закриває — на планшеті з клавіатурою це очікувано
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Тіло сторінки не скролимо, поки шухляда відкрита
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const onHandleDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHandleUp = (e: React.PointerEvent) => {
    if (startY.current === null) return;
    const delta = e.clientY - startY.current;
    startY.current = null;
    // Поріг 40 px: менше — це тремтіння пальця, а не намір
    if (delta > 40) {
      if (height === 'full') setHeight('half');
      else onClose();
    } else if (delta < -40) {
      setHeight('full');
    }
  };

  return (
    <>
      <div
        className={`m-sheet-backdrop${open ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`m-sheet m-sheet--${height}${open ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="m-sheet__grip"
          onPointerDown={onHandleDown}
          onPointerUp={onHandleUp}
        >
          <div className="m-sheet__bar" />
        </div>

        <div className="m-sheet__head">
          <span className="m-sheet__title">{title}</span>
          <button className="m-sheet__close" onClick={onClose} aria-label="Закрити">
            <X size={20} />
          </button>
        </div>

        <div className="m-sheet__body" ref={bodyRef}>
          {children}
        </div>
      </div>
    </>
  );
}
