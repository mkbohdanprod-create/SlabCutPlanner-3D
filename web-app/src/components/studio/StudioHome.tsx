import { useEffect, useState } from 'react';
import { useUIStore } from '../../store/useStore';
import { ArrowLeft, Box, Ruler, Building2, PackageCheck, Boxes, Factory, FlaskConical } from 'lucide-react';
import { prefersReducedMotion } from './StudioReveal';

/**
 * VIYAR STONE STUDIO — стартова лінійки продуктів (04.09.2026).
 *
 * Поки що ЗАГЛУШКА: показує, з чого складається лінійка і на яке питання
 * відповідає кожен продукт. Перші версії самих продуктів — окремо.
 * Тексти й статуси взяті з `04_ВІЗІЯ_АРХІТЕКТУРИ/ВІЗІЯ_АРХІТЕКТУРА.md`,
 * `10_VIYAR_STONE_КОНСТРУКТОР/ВІЗІЯ_КОНСТРУКТОРА.md` і
 * `01_МЕЙН/ВІЗІЯ_ПРОДУКТІВ_VS.md` — тут нічого не вигадано.
 *
 * Відкривається пасхалкою (клік по «stone» у шапці → фраза), див.
 * `StudioGate.tsx`. Застосунок під нею лишається змонтованим: студія —
 * шар поверх, вихід повертає рівно туди, де людина була.
 */

type Status = 'live' | 'soon' | 'external';

interface Product {
  id: string;
  name: string;
  question: string;
  what: string;
  icon: typeof Box;
  status: Status;
  /** Тільки в того продукту, який справді можна відкрити. */
  onOpen?: () => void;
}

const STATUS_LABEL: Record<Status, string> = {
  live: 'працює',
  soon: 'перша версія — в роботі',
  external: 'окрема програма',
};

const STATUS_CLASS: Record<Status, string> = {
  live: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30',
  soon: 'bg-amber-400/15 text-amber-300 ring-amber-400/30',
  external: 'bg-slate-400/15 text-slate-300 ring-slate-400/30',
};

function ProductCard({ product, index }: { product: Product; index: number }) {
  const Icon = product.icon;
  const openable = Boolean(product.onOpen);
  return (
    <div
      role={openable ? 'button' : undefined}
      tabIndex={openable ? 0 : undefined}
      onClick={product.onOpen}
      onKeyDown={(e) => { if (openable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); product.onOpen?.(); } }}
      className={`group relative flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-all duration-200 ${
        openable
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-[#0084ff]/60 hover:bg-white/[0.06] hover:shadow-[0_10px_40px_-12px_rgba(0,132,255,0.45)]'
          : 'cursor-default'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${openable ? 'bg-[#0084ff]' : 'bg-white/10'}`}>
            <Icon className="h-[22px] w-[22px] text-white" strokeWidth={1.8} />
          </div>
          <div>
            <div className="text-[19px] font-bold leading-tight text-white">{product.name}</div>
            <div className="text-[13.5px] text-[#5eb4ff]">«{product.question}»</div>
          </div>
        </div>
        <span className="pointer-events-none select-none text-[13px] font-mono text-white/20">0{index}</span>
      </div>

      <p className="mt-4 flex-1 text-[14.5px] leading-relaxed text-slate-300/90">{product.what}</p>

      <div className="mt-5 flex items-center justify-between">
        <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wide ring-1 ring-inset ${STATUS_CLASS[product.status]}`}>
          {STATUS_LABEL[product.status]}
        </span>
        {openable && (
          <span className="text-[13.5px] font-semibold text-white/60 transition-colors group-hover:text-white">
            Відкрити →
          </span>
        )}
      </div>
    </div>
  );
}

export function StudioHome({ onClose }: { onClose: () => void }) {
  /* Вхід «провалюємось»: студія народжується меншою і наближається, поки
     плита їде вбік (`StudioReveal`). Рішення ухвалюється РАЗ, на монтуванні,
     інакше зняття плити смикнуло б картинку вдруге. */
  const [entering] = useState(() => !prefersReducedMotion());

  // Esc — вихід у застосунок, звична дія для повноекранного шару.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const products: Product[] = [
    {
      id: 'vs3d',
      name: 'Viyar Stone Studio',
      question: 'Скільки це коштує',
      what: 'Менеджер збирає виріб, програма рахує розкрій, матеріал і послуги — на виході КП, бланк погодження, карти крою і AR для клієнта.',
      icon: Box,
      status: 'live',
      onOpen: onClose,
    },
    {
      id: 'constructor',
      name: 'Viyar Stone CAD',
      question: 'Як це зробити',
      what: 'CAD для каменю: від заміру до завдання цеху. Погоджений проєкт зустрічається з реальним заміром — підгонка під фактичні стіни, метал і фанера, перевірка по ТУ. На виході не КП, а пакет для цеху.',
      icon: Ruler,
      status: 'live',
      // Перша версія 04.09.2026: режим конструктора поверх VS3D — усі
      // вкладки VS3D лишаються, додаються замір / метал / фанера /
      // зведення / формування доків / документи.
      onOpen: () => {
        const ui = useUIStore.getState();
        ui.setConstructorMode(true);
        ui.setMainView('measure');
        onClose();
      },
    },
    {
      id: 'architecture',
      name: 'Viyar Stone BUILDING',
      question: 'Скільки коштує облицювати об’єкт',
      what: 'BUILDING: камінь на об’єкті. Приміщення, поверхні й розкладки — підлоги, стіни, пано, сходи. КП, відомість обсягів і монтажна схема з одних даних.',
      icon: Building2,
      // Перша версія 06.09.2026: режим архітектора на тому самому ядрі —
      // план (PDF + масштаб + обведення) → розкладки → відомість; вироби
      // лишаються, конструкторські вкладки сховані.
      status: 'live',
      onOpen: () => {
        const ui = useUIStore.getState();
        ui.setArchitectureMode(true);
        ui.setMainView('plan');
        onClose();
      },
    },
    {
      id: 'packing',
      name: 'Пакування',
      question: 'Як це довезти цілим',
      what: 'Короб і тура, габарит, вага, орієнтація, покрокова інструкція пакувальнику. Зроблено окремо — пришивається на спільне ядро.',
      icon: PackageCheck,
      status: 'external',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[300] overflow-y-auto bg-[#0e1621] text-white"
      style={entering ? { animation: 'vsStudioFall 900ms cubic-bezier(.16,.84,.44,1) 620ms both' } : undefined}
    >
      <style>{`
        @keyframes vsStudioFall {
          0%   { opacity: 0; transform: scale(0.88); filter: blur(14px) brightness(0.6); }
          45%  { opacity: 1; }
          100% { opacity: 1; transform: scale(1);    filter: blur(0)    brightness(1); }
        }
      `}</style>
      {/* М'яке підсвічування згори — щоб темний екран не був пласким */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: 'radial-gradient(1100px 380px at 50% -120px, rgba(0,132,255,0.22), transparent 70%)' }}
      />

      <div className="relative mx-auto flex min-h-full w-full max-w-[1180px] flex-col px-8 py-10">
        {/* Шапка студії */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="flex items-baseline text-white">
              <span className="text-[34px] font-medium leading-none tracking-tighter">viyar</span>
              <span className="ml-2 text-[34px] font-normal leading-none tracking-tight">stone</span>
              <span className="ml-2.5 text-[15px] font-bold leading-none tracking-[0.3em] text-[#5eb4ff]">STUDIO</span>
            </h1>
            <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed text-slate-300/85">
              Одне ядро, яке знає камінь, — і програми, кожна зі своїм питанням.
            </p>
          </div>

          <button
            onClick={onClose}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-white/15 !bg-white/5 px-4 py-2.5 text-[14px] font-semibold !text-white/80 shadow-none transition-colors hover:!bg-white/10 hover:!text-white"
            title="Повернутись у застосунок (Esc)"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад у 3D
          </button>
        </div>

        {/* Продукти */}
        <div className="mt-9 grid grid-cols-1 gap-5 md:grid-cols-2">
          {products.map((product, i) => (
            <ProductCard key={product.id} product={product} index={i + 1} />
          ))}
        </div>

        {/* Що вміє спільне ядро — щоб було видно, на чому все стоїть */}
        <div className="mt-9 rounded-xl border border-white/10 bg-white/[0.02] px-6 py-5">
          <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/40">Спільне ядро</div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-slate-300/85">
            {['геометрія деталей', 'розкрій по слябах', 'стики', 'кромки з прайсу', 'текстура по фото каменю', 'ТУ цеху', 'формат проєкту з версією'].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-[#0084ff]" />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Суміжні системи — не наші продукти, але в тому самому контурі.
            MES — окрема система (Smart Factory MES/APS, Python + Next.js), не
            продовження VS3D (рішення власника 06.09): звідси лише посилання.
            Адреса — VITE_MES_URL; без неї — /mes/load/: статичний експорт фронту MES
            лежить у web-app/public/mes (той самий Vercel), повний MES — Python-сервер на 8082.
            Лабораторія — окремий застосунок (06.09): правила обучалочки, кейси з кресленнями,
            кімнати питань і бали. Публічна збірка лежить у web-app/public/lab (той самий
            Vercel, /lab/) — у ній ПІБ/телефони/адреси замовників прибрано, штампи на
            кресленнях замальовано; версія зі спільною базою — приватний артефакт claude.ai.
            Адресу можна перекрити через VITE_LAB_URL.
            07.09 (№128): посилання веде на `/lab/index.html`, а не на теку `/lab/`.
            Причина — dev-сервер Vite не перетворює запит на теку в index.html і
            віддає SPA-fallback, тобто САМ VS3D: власник тричі бачив, як
            «Лабораторія вилітає назад у Студію», хоча краху не було. Плагін
            `public-dir-index` у vite.config це лікує, але він потребує
            перезапуску dev-сервера; пряма адреса файла працює завжди й усюди
            (на Vercel теж — файл лежить рівно там). */}
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            { icon: Boxes, name: 'Склад слябів (WMS)', what: 'Комірки, задачі, заявки на виробництво — до буфера цеху.', href: (import.meta.env.VITE_WMS_URL as string | undefined) || undefined },
            { icon: Factory, name: 'Виробництво (MES)', what: 'Окрема система: термінали операторів, карта цеху, буфери, навантаження. Фундамент збирається на кейсах.', href: (import.meta.env.VITE_MES_URL as string | undefined) || '/mes/load/' },
            { icon: FlaskConical, name: 'Лабораторія', what: 'Правила з обучалочки, бібліотека кейсів з кресленнями, кімнати питань по галузях, бали за відповіді.', href: (import.meta.env.VITE_LAB_URL as string | undefined) || '/lab/index.html' },
          ].map(({ icon: Icon, name, what, href }) => {
            const inner = (
              <>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.07]">
                  <Icon className="h-[18px] w-[18px] text-white/70" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-white/90">{name}{href ? <span className="ml-2 text-[11px] font-medium tracking-wide text-[#5eb4ff]">ВІДКРИТИ →</span> : null}</div>
                  <div className="text-[13.5px] text-slate-400">{what}</div>
                </div>
              </>
            );
            const cls = 'flex items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-4';
            return href ? (
              <a key={name} href={href} target="_blank" rel="noopener noreferrer" className={`${cls} transition-colors hover:bg-white/[0.05] hover:border-white/[0.14]`}>{inner}</a>
            ) : (
              <div key={name} className={cls}>{inner}</div>
            );
          })}
        </div>

        <div className="mt-auto pt-10 text-[12.5px] text-white/30">
          Viyar Stone Studio · заглушка 04.09.2026 · Esc — назад у застосунок
        </div>
      </div>
    </div>
  );
}
