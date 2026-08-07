import React from 'react';

/**
 * Немодальне вікно, яке можна пересунути за шапку.
 *
 * Навіщо: вікна обробки (виріз, кут, нога, бортик, панель) редагують те, що
 * стоїть ПІД ними на 3D-полотні. Затемнення фону і фіксоване положення по
 * центру означали, що менеджер задає розмір вирізу наосліп: сама деталь
 * заслонена власним вікном. Тепер вікно можна відсунути й одразу бачити,
 * що виходить.
 *
 * Два свідомі рішення:
 *   · немає підложки на весь екран — інакше вона ковтала б кліки по 3D,
 *     навіть будучи прозорою;
 *   · позиція тримається в стані компонента, а не в сторі — це положення
 *     вікна на екрані, воно не має потрапляти в проєкт і в персист.
 *
 * Тягнути можна лише за шапку: клік по полю введення не має рухати вікно.
 */
export function DraggableDialog({
  title,
  onClose,
  width = 360,
  children,
  headerClassName = 'bg-[#1f93ef] text-white',
  className = 'bg-[#c6e6fc]',
  z = 200,
}: {
  title: React.ReactNode;
  onClose?: () => void;
  width?: number;
  children: React.ReactNode;
  headerClassName?: string;
  className?: string;
  z?: number;
}) {
  // null = «ще не рухали», вікно стоїть по центру екрана
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const dragRef = React.useRef<{ dx: number; dy: number } | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    // Перший же захват фіксує поточне місце — далі вікно живе в координатах,
    // а не в центруванні, інакше воно стрибне на перший піксель руху.
    setPos({ x: rect.left, y: rect.top });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const box = boxRef.current;
    if (!drag || !box) return;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    // Не даємо вивезти вікно за екран так, щоб шапку вже не було чим спіймати.
    const x = Math.min(Math.max(e.clientX - drag.dx, 8 - w + 80), window.innerWidth - 80);
    const y = Math.min(Math.max(e.clientY - drag.dy, 8), window.innerHeight - 40);
    setPos({ x, y });
  };

  const endDrag = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const style: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, width, zIndex: z }
    : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width, zIndex: z };

  return (
    <div ref={boxRef} style={style} className={`${className} shadow-2xl rounded-sm flex flex-col`}>
      <div
        className={`${headerClassName} px-4 py-2 flex items-center justify-between cursor-move select-none touch-none`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <h2 className="font-bold text-sm">{title}</h2>
        {onClose && (
          <button
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="hover:bg-white/20 p-1 rounded-full transition-colors"
            aria-label="Закрити"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
