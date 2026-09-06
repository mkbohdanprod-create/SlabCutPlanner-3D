import { useEffect, useRef, useState } from 'react';

/**
 * ПАСХАЛКА: вхід у Viyar Stone Studio (04.09.2026, задум власника).
 *
 * Кнопки немає: клік по слову «stone» у шапці відкриває це віконце, і
 * лише правильна фраза українською пускає на стартову лінійки продуктів.
 * Фразу тут навмисно не видно у підказках — на те вона й пасхалка;
 * після двох невдач з'являється лише натяк про кількість слів.
 */

/**
 * Ключ. Порівнюємо не буквально: без розділових, зайвих пробілів і
 * регістру. 06.09.2026 — власник змінив фразу на код (цифри + vs3d):
 * стара українська фраза більше не пускає.
 */
const PHRASE = '78907890vs3d';

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[.,!?;:"'’«»()\-–—]/g, ' ')
    // Часта підміна на розкладці: «i» латиниця замість «і» кирилиці.
    .replace(/i/g, 'і')
    .replace(/\s+/g, ' ')
    .trim();

export function StudioGate({ open, onClose, onUnlock }: { open: boolean; onClose: () => void; onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const [tries, setTries] = useState(0);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setValue(''); setTries(0); setShake(false); return; }
    // Фокус одразу: віконце маленьке, людина відразу друкує.
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    if (normalize(value) === PHRASE) { onUnlock(); return; }
    setTries((n) => n + 1);
    setShake(true);
    window.setTimeout(() => setShake(false), 420);
  };

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 p-8 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`w-full max-w-[420px] overflow-hidden rounded-xl bg-[#101a26] shadow-2xl ring-1 ring-white/10 ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}
        style={shake ? { animation: 'vsShake 0.4s ease-in-out' } : undefined}
      >
        <style>{`@keyframes vsShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-7px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(3px)} }`}</style>

        <div className="px-7 pt-7">
          <div className="flex items-baseline text-white/90">
            <span className="text-[22px] font-medium leading-none tracking-tighter">viyar</span>
            <span className="ml-1.5 text-[22px] font-normal leading-none tracking-tight">stone</span>
          </div>
          <p className="mt-3 text-[14.5px] leading-relaxed text-slate-300/80">
            Хто питає — той і відкриває. Скажи як є, українською.
          </p>
        </div>

        <div className="px-7 pb-7 pt-5">
          <input
            ref={inputRef}
            /* Пароль: те, що друкують, закрито кружечками — щоб фраза не
               світилась через плече й на демонстрації екрана. */
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit(); }
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            }}
            placeholder="…"
            /* `!` — бо глобальний стиль інпутів у застосунку світлий */
            className="w-full rounded-lg !border !border-white/15 !bg-[#16212e] px-4 py-3 text-[15px] tracking-[0.18em] !text-white outline-none transition-colors placeholder:tracking-normal placeholder:text-white/25 focus:!border-[#0084ff]"
          />

          <div className="mt-3 h-[18px] text-[13px] text-slate-400">
            {tries > 0 && (tries >= 2 ? 'Не те. Код, не фраза.' : 'Не те.')}
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg !border-transparent !bg-transparent px-4 py-2 text-[14px] !text-white/50 shadow-none transition-colors hover:!text-white/80"
            >
              Закрити
            </button>
            <button
              onClick={submit}
              className="rounded-lg !border-transparent !bg-[#0084ff] px-5 py-2 text-[14px] font-semibold !text-white shadow-none transition-colors hover:!bg-[#006bce]"
            >
              Далі
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
