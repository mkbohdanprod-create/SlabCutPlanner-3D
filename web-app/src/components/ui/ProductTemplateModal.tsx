import { useState } from 'react';
import type { ReactNode } from 'react';
import { DraggableDialog } from './DraggableDialog';
import { PRODUCT_TEMPLATES } from '../forms/utils/productTemplates';
import type { ProductTemplate, TemplateValues, TemplateNumberParam, TemplateChoiceParam } from '../forms/utils/productTemplates';
import type { ProductEditorSession } from '../forms/utils/draftHelpers';
import { SvgInput, ArrowDefs } from '../forms/shapes/SvgComponents';

/**
 * Вибір шаблону виробу (адмін-фіча, кнопка «Шаблони» у вікні «Новий виріб»).
 *
 * Зліва — список шаблонів, справа — ЕСКІЗ у стилі конструктора мийок
 * (SinkDesigner): схема зі стрілками розмірів, поля вводу стоять прямо на
 * розмірних лініях. Стилі ті самі (scheme-* із global.css), щоб конструктор
 * шаблонів виглядав рідним братом конструктора мийок.
 *
 * Введені значення тримаємо під ключем `<шаблон>:<параметр>`, щоб перемикання
 * шаблонів не змішувало і не губило цифри. Санітизація значень — у build()
 * шаблону (єдине місце), ескіз лише показує і збирає.
 */

type SketchApi = {
  /** Число параметра: введене або дефолт шаблону */
  num: (key: string) => number;
  /** Рядковий вибір параметра: введений або дефолт */
  str: (key: string) => string;
  set: (key: string, value: number | string) => void;
};

/** Штрихування стіни над горизонтальним ребром (стіна зверху). */
function HatchH({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const lines = [];
  for (let x = x1 + 4; x + 10 <= x2; x += 16) {
    lines.push(<line key={x} className="scheme-dim" x1={x} y1={y} x2={x + 10} y2={y - 10} />);
  }
  return <>{lines}</>;
}

/** Штрихування стіни ліворуч від вертикального ребра. */
function HatchV({ y1, y2, x }: { y1: number; y2: number; x: number }) {
  const lines = [];
  for (let y = y1 + 14; y <= y2; y += 16) {
    lines.push(<line key={y} className="scheme-dim" x1={x} y1={y} x2={x - 10} y2={y - 10} />);
  }
  return <>{lines}</>;
}

function StraightTopSketch({ num, set }: SketchApi) {
  return (
    <>
      <rect className="scheme-part" x={130} y={150} width={400} height={180} />
      <HatchH x1={130} x2={530} y={150} />
      <line className="scheme-dash" x1={140} y1={318} x2={520} y2={318} />
      <text className="scheme-caption centered" x={330} y={365}>Потовщення переднього краю 40 мм</text>
      <line className="scheme-arrow" x1={130} y1={118} x2={530} y2={118} />
      <SvgInput x={296} y={96} value={num('length')} onChange={(v) => set('length', v)} />
      <line className="scheme-arrow" x1={92} y1={150} x2={92} y2={330} />
      <SvgInput x={16} y={222} value={num('depth')} onChange={(v) => set('depth', v)} />
    </>
  );
}

function LTopSketch({ num, set }: SketchApi) {
  return (
    <>
      <path className="scheme-part" d="M140 120 H560 V240 H260 V420 H140 Z" />
      <HatchH x1={140} x2={560} y={120} />
      <HatchV y1={120} y2={420} x={140} />
      {/* потовщення відкритих торців B, C, D, E */}
      <line className="scheme-dash" x1={550} y1={130} x2={550} y2={230} />
      <line className="scheme-dash" x1={270} y1={230} x2={550} y2={230} />
      <line className="scheme-dash" x1={270} y1={250} x2={270} y2={410} />
      <line className="scheme-dash" x1={150} y1={410} x2={250} y2={410} />
      <text className="scheme-caption centered" x={430} y={330}>Потовщення 40 мм</text>
      {/* сторони — як в редакторі: стіни A і F */}
      <text className="scheme-caption centered" x={350} y={142}>A</text>
      <text className="scheme-caption centered" x={536} y={180}>B</text>
      <text className="scheme-caption centered" x={410} y={260}>C</text>
      <text className="scheme-caption centered" x={284} y={330}>D</text>
      <text className="scheme-caption centered" x={200} y={404}>E</text>
      <text className="scheme-caption centered" x={158} y={270}>F</text>
      <line className="scheme-arrow" x1={140} y1={92} x2={560} y2={92} />
      <SvgInput x={316} y={70} value={num('lengthA')} onChange={(v) => set('lengthA', v)} />
      <line className="scheme-arrow" x1={100} y1={120} x2={100} y2={420} />
      <SvgInput x={24} y={252} value={num('lengthF')} onChange={(v) => set('lengthF', v)} />
      <line className="scheme-arrow" x1={584} y1={120} x2={584} y2={240} />
      <SvgInput x={586} y={162} value={num('depth')} onChange={(v) => set('depth', v)} />
      <line className="scheme-arrow" x1={140} y1={444} x2={260} y2={444} />
      <SvgInput x={166} y={400} value={num('depth')} onChange={(v) => set('depth', v)} />
    </>
  );
}

function IslandSketch({ num, str, set }: SketchApi) {
  const left = str('legSide') === 'left';
  const leg = (side: 'left' | 'right', x: number) => {
    const active = left === (side === 'left');
    return (
      <g style={{ cursor: 'pointer' }} onClick={() => set('legSide', side)}>
        <rect className={active ? 'scheme-part' : 'scheme-dash'} x={x} y={168} width={18} height={182} />
        <rect fill="transparent" x={x - 10} y={160} width={38} height={220} />
        <text className="scheme-caption centered" x={x + 9} y={374}>{side === 'left' ? 'Ліва' : 'Права'}</text>
      </g>
    );
  };
  return (
    <>
      <text className="scheme-caption centered" x={225} y={48}>Вид спереду</text>
      <text className="scheme-caption centered" x={560} y={48}>Вид збоку</text>
      <rect className="scheme-part" x={70} y={150} width={310} height={18} />
      <line className="scheme-dash" x1={50} y1={350} x2={400} y2={350} />
      {leg('left', 70)}
      {leg('right', 362)}
      <line className="scheme-arrow" x1={70} y1={120} x2={380} y2={120} />
      <SvgInput x={190} y={98} value={num('length')} onChange={(v) => set('length', v)} />
      <line className="scheme-arrow" x1={44} y1={168} x2={44} y2={350} />
      <SvgInput x={2} y={240} value={num('legHeight')} onChange={(v) => set('legHeight', v)} />
      {/* збоку: глибина плити і потовщення по периметру */}
      <rect className="scheme-part" x={490} y={150} width={140} height={18} />
      <rect className="scheme-part inner" x={612} y={168} width={18} height={26} />
      <rect className="scheme-part inner" x={490} y={168} width={18} height={26} />
      <line className="scheme-arrow" x1={490} y1={120} x2={630} y2={120} />
      <SvgInput x={525} y={98} value={num('depth')} onChange={(v) => set('depth', v)} />
      <text className="scheme-caption centered" x={560} y={228}>Потовщення 40 мм</text>
      <text className="scheme-caption centered" x={560} y={252}>по периметру</text>
      <text className="scheme-caption centered" x={225} y={430}>Нога — «водоспад», зріз 45°</text>
    </>
  );
}

function PortalSketch({ num, set }: SketchApi) {
  return (
    <>
      <text className="scheme-caption centered" x={270} y={40}>Вид спереду</text>
      <rect className="scheme-part inner" x={140} y={90} width={260} height={110} />
      <rect className="scheme-part" x={96} y={200} width={348} height={20} />
      <rect className="scheme-part" x={110} y={220} width={26} height={180} />
      <rect className="scheme-part" x={404} y={220} width={26} height={180} />
      <line className="scheme-dash" x1={60} y1={400} x2={480} y2={400} />
      <text className="scheme-caption centered" x={270} y={320}>топка</text>
      <line className="scheme-arrow" x1={96} y1={64} x2={444} y2={64} />
      <SvgInput x={236} y={42} value={num('width')} onChange={(v) => set('width', v)} />
      <line className="scheme-arrow" x1={70} y1={220} x2={70} y2={400} />
      <SvgInput x={2} y={292} value={num('legHeight')} onChange={(v) => set('legHeight', v)} />
      <line className="scheme-arrow" x1={470} y1={90} x2={470} y2={200} />
      <SvgInput x={486} y={126} value={num('panelHeight')} onChange={(v) => set('panelHeight', v)} />
      {/* збоку: глибина полиці */}
      <text className="scheme-caption centered" x={572} y={300}>Збоку</text>
      <rect className="scheme-part" x={540} y={320} width={64} height={24} />
      <line className="scheme-arrow" x1={540} y1={368} x2={604} y2={368} />
      <SvgInput x={538} y={380} value={num('depth')} onChange={(v) => set('depth', v)} />
    </>
  );
}

function FireplaceSketch({ num, set }: SketchApi) {
  return (
    <>
      <text className="scheme-caption centered" x={270} y={40}>Вид спереду</text>
      <rect className="scheme-part" x={92} y={196} width={356} height={26} />
      <rect className="scheme-part inner" x={110} y={222} width={320} height={60} />
      <rect className="scheme-part" x={110} y={222} width={30} height={178} />
      <rect className="scheme-part" x={400} y={222} width={30} height={178} />
      <path className="scheme-dash" d="M190 400 V282 H350 V400" fill="none" />
      <line className="scheme-dash" x1={60} y1={400} x2={480} y2={400} />
      <text className="scheme-caption centered" x={270} y={348}>топка</text>
      <line className="scheme-arrow" x1={92} y1={64} x2={448} y2={64} />
      <SvgInput x={236} y={42} value={num('width')} onChange={(v) => set('width', v)} />
      <line className="scheme-arrow" x1={66} y1={222} x2={66} y2={400} />
      <SvgInput x={0} y={292} value={num('legHeight')} onChange={(v) => set('legHeight', v)} />
      <line className="scheme-arrow" x1={470} y1={222} x2={470} y2={282} />
      <SvgInput x={486} y={232} value={num('friezeHeight')} onChange={(v) => set('friezeHeight', v)} />
      {/* збоку: глибина полиці */}
      <text className="scheme-caption centered" x={572} y={300}>Збоку</text>
      <rect className="scheme-part" x={540} y={320} width={64} height={24} />
      <line className="scheme-arrow" x1={540} y1={368} x2={604} y2={368} />
      <SvgInput x={538} y={380} value={num('depth')} onChange={(v) => set('depth', v)} />
    </>
  );
}

function WindowSillSketch({ num, set }: SketchApi) {
  return (
    <>
      <rect className="scheme-part" x={150} y={180} width={360} height={120} />
      <HatchH x1={150} x2={510} y={180} />
      <text className="scheme-caption centered" x={330} y={350}>Вид зверху, стіна — за верхнім ребром</text>
      <line className="scheme-arrow" x1={150} y1={148} x2={510} y2={148} />
      <SvgInput x={296} y={126} value={num('length')} onChange={(v) => set('length', v)} />
      <line className="scheme-arrow" x1={110} y1={180} x2={110} y2={300} />
      <SvgInput x={36} y={222} value={num('depth')} onChange={(v) => set('depth', v)} />
    </>
  );
}

const SKETCHES: Record<string, (api: SketchApi) => ReactNode> = {
  straight_top: (api) => <StraightTopSketch {...api} />,
  l_top: (api) => <LTopSketch {...api} />,
  island_leg: (api) => <IslandSketch {...api} />,
  portal_panels: (api) => <PortalSketch {...api} />,
  fireplace_surround: (api) => <FireplaceSketch {...api} />,
  window_sill: (api) => <WindowSillSketch {...api} />,
};

export function ProductTemplateModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (session: ProductEditorSession) => void;
}) {
  const [selectedId, setSelectedId] = useState(PRODUCT_TEMPLATES[0].id);
  const [values, setValues] = useState<TemplateValues>({});

  const template: ProductTemplate = PRODUCT_TEMPLATES.find((t) => t.id === selectedId) ?? PRODUCT_TEMPLATES[0];

  const valueKey = (paramKey: string) => `${template.id}:${paramKey}`;

  const api: SketchApi = {
    num: (key) => {
      const stored = values[valueKey(key)];
      if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
      const def = template.params.find((p): p is TemplateNumberParam => p.kind === 'number' && p.key === key);
      return def ? def.default : 0;
    },
    str: (key) => {
      const stored = values[valueKey(key)];
      if (typeof stored === 'string') return stored;
      const def = template.params.find((p): p is TemplateChoiceParam => p.kind === 'choice' && p.key === key);
      return def ? def.default : '';
    },
    set: (key, value) => setValues({ ...values, [valueKey(key)]: value }),
  };

  const collectValues = (): TemplateValues => {
    const out: TemplateValues = {};
    template.params.forEach((p) => {
      const stored = values[valueKey(p.key)];
      if (stored !== undefined) out[p.key] = stored;
    });
    return out;
  };

  const sketch = SKETCHES[template.id];

  return (
    <DraggableDialog title="Шаблони виробів" onClose={onClose} width={940} z={300} className="bg-[#dcebf5]">
      <div className="flex" style={{ minHeight: 520 }}>
        {/* Список шаблонів */}
        <div className="w-[220px] border-r border-[#b8d4ee] py-2 flex flex-col shrink-0">
          {PRODUCT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`text-left px-4 py-3 transition-colors ${
                t.id === selectedId ? 'bg-[#2489d8]/15 border-l-2 border-[#2489d8]' : 'hover:bg-white/60 border-l-2 border-transparent'
              }`}
            >
              <div className="text-[15px] font-bold text-slate-700">{t.name}</div>
            </button>
          ))}
        </div>

        {/* Ескіз вибраного шаблону — стиль конструктора мийок */}
        <div className="flex-1 p-4 flex flex-col gap-3 min-w-0">
          <p className="text-sm text-slate-600 leading-snug">{template.description}</p>

          <div className="schema reference-schema flex-1 rounded-sm overflow-hidden">
            <svg viewBox="0 0 660 470" className="designer-scheme-svg" style={{ width: '96%' }}>
              <ArrowDefs />
              {sketch ? sketch(api) : null}
            </svg>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              Скасувати
            </button>
            <button
              onClick={() => onCreate(template.build(collectValues()))}
              className="px-5 py-1.5 border border-[#2489d8] text-[#2489d8] text-sm font-bold rounded-sm hover:bg-[#2489d8] hover:text-white transition-colors"
            >
              Створити
            </button>
          </div>
        </div>
      </div>
    </DraggableDialog>
  );
}
