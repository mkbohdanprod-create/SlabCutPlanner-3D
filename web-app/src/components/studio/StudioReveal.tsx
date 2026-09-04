import { useEffect, useRef, useState } from 'react';

/**
 * ПРОВАЛЮЄМОСЬ У СТУДІЮ (04.09.2026, задум власника).
 *
 * Після правильної фрази екран накриває кам'яна плита — і відсувається,
 * а студія за нею наближається, ніби ми провалюємось усередину. Три такти:
 *
 *   1. НАКРИЛО  (0 → 420 мс)   плита падає згори, коротко «сідає»;
 *   2. ВІДСУВ   (700 → 1400)   плита їде вбік із легким нахилом;
 *   3. ПАДІННЯ                 студія під нею йде з 1.18 у 1 (у StudioHome).
 *
 * Плита — справжній сляб із фото (`public/studio/slab.jpg`), а не градієнт:
 * це впізнаваний камінь, з яким працюють, і в тому вся сіль пасхалки.
 *
 * `prefers-reduced-motion` вимикає виставу: людям, яким рух незручний,
 * студія просто відкривається.
 */

const SLAB = '/studio/slab.jpg';

/** Скільки триває вся вистава — після цього шар знімається. */
export const REVEAL_MS = 1500;

export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function StudioReveal({ onDone }: { onDone: () => void }) {
  // Плиту показуємо лише коли картинка готова: інакше перший кадр —
  // порожній прямокутник, і «камінь» перетворюється на сіру шторку.
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);
  /* `onDone` приходить інлайн-стрілкою з App, тобто НОВОЮ функцією на
     кожен рендер. Якби вона стояла в залежностях ефекту, той щоразу
     перезапускався б і гасив власний таймер — плита лишалась би на
     екрані назавжди (спіймано зондом 04.09). Тримаємо її в ref, а ефект
     запускаємо рівно один раз. */
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = () => { if (!doneRef.current) { doneRef.current = true; onDoneRef.current(); } };

  // Завантаження картинки: поки не готова — на екрані нічого.
  useEffect(() => {
    const image = new Image();
    if (image.complete && image.naturalWidth > 0) { setReady(true); return; }
    image.onload = () => setReady(true);
    // Не завантажилась (офлайн, порожній кеш) — не тримаємо людину перед
    // порожнім екраном, одразу віддаємо студію.
    image.onerror = () => finish();
    image.src = SLAB;
    // Запобіжник: картинка мовчить довше за все розумне — знімаємо шар.
    const guard = window.setTimeout(() => { if (!doneRef.current) finish(); }, 4000);
    return () => window.clearTimeout(guard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Відлік вистави починається ВІД ПОЯВИ ПЛИТИ, а не від монтування:
     інакше повільне завантаження з'їдало б кінець відсуву. */
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(finish, REVEAL_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[400] overflow-hidden bg-transparent">
      <style>{`
        @keyframes vsSlabIn {
          0%   { transform: translateY(-102%) scale(1.06); }
          70%  { transform: translateY(0) scale(1.06); }
          82%  { transform: translateY(1.2%) scale(1.055); }
          100% { transform: translateY(0) scale(1.05); }
        }
        @keyframes vsSlabAway {
          0%   { transform: translate3d(0,0,0) rotate(0deg) scale(1.05); }
          18%  { transform: translate3d(2.5%,0.6%,0) rotate(0.5deg) scale(1.05); }
          100% { transform: translate3d(-118%,-7%,0) rotate(-5.5deg) scale(1.05); }
        }
        /* Тонка смуга світла в щілині, що відкривається, — щоб рух читався
           як «плиту зсунули», а не «картинка поїхала». */
        @keyframes vsSlabGlow {
          0%   { opacity: 0; }
          25%  { opacity: 0.9; }
          85%  { opacity: 0.5; }
          100% { opacity: 0; }
        }
        @keyframes vsSlabDust {
          0%, 45%  { opacity: 0; transform: translateY(0) scale(1); }
          62%      { opacity: 0.5; }
          100%     { opacity: 0; transform: translateY(26px) scale(1.15); }
        }
      `}</style>

      {ready && (
        <>
          {/*
            ДВА ШАРИ, А НЕ ОДИН. Дві CSS-анімації трансформу на одному
            елементі не складаються: пізніша перебиває ранішу з першого ж
            кадру, і «падіння» плити глядач не бачив узагалі (спіймано
            покадровим зондом 04.09). Тому падіння — на зовнішньому шарі,
            відсув — на внутрішньому.
          */}
          <div
            className="absolute inset-0 will-change-transform"
            style={{ animation: 'vsSlabIn 420ms cubic-bezier(.22,1,.36,1) both' }}
          >
            <div
              className="absolute inset-0 will-change-transform"
              style={{ animation: 'vsSlabAway 800ms cubic-bezier(.7,0,.28,1) 700ms both' }}
            >
              <img src={SLAB} alt="" className="h-full w-full object-cover" draggable={false} />
              {/* Товщина каменю: темний торець і глибина по краю, щоб плита
                  читалась як плита, а не як шпалери. */}
              <div className="absolute inset-x-0 bottom-0 h-[10px] bg-gradient-to-b from-black/70 to-black" />
              <div className="absolute inset-0 shadow-[inset_0_0_140px_rgba(0,0,0,0.55)]" />
              {/* Світло на краю, що відходить, — їде разом із плитою, тому
                  читається як щілина, що відкривається, а не як пляма. */}
              <div
                className="absolute inset-y-0 -right-[70px] w-[70px]"
                style={{
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.55) 0%, rgba(150,205,255,0.30) 45%, rgba(0,132,255,0) 100%)',
                  filter: 'blur(9px)',
                  animation: 'vsSlabGlow 800ms ease-out 700ms both',
                }}
              />
            </div>
          </div>

          {/* Кам'яний пил услід */}
          <div
            className="absolute inset-x-0 top-0 h-[46%]"
            style={{
              background: 'radial-gradient(60% 100% at 40% 0%, rgba(214,196,170,0.30), rgba(214,196,170,0) 70%)',
              filter: 'blur(10px)',
              animation: 'vsSlabDust 900ms ease-out 700ms both',
            }}
          />
        </>
      )}
    </div>
  );
}
