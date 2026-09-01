import { useState } from 'react';
import type { ReactNode } from 'react';
import { PRODUCT_TEMPLATES, FIREPLACE_ZONES } from '../forms/utils/productTemplates';
import type { ProductTemplate, TemplateValues, TemplateNumberParam, TemplateChoiceParam, TemplateToggleParam } from '../forms/utils/productTemplates';
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
  /** Вмикач: увімкнений або дефолт */
  bool: (key: string) => boolean;
  set: (key: string, value: number | string | boolean) => void;
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

function FireplaceModernSketch({ num, str, set }: SketchApi) {
  // Схема малюється в пропорціях, близьких до заданих, щоб виступ було видно
  // як виступ. Підписи розмірів винесені за контур: усередині вони затуляли
  // саме те, що показують.
  const boxW = Math.max(1, num('boxWidth'));
  const oL = num('overhangLeft');
  const oR = num('overhangRight');
  const total = boxW + oL + oR;
  const px = 380 / total;
  const boxPx = boxW * px;
  const x0 = 150;
  const boxX = x0 + oL * px;
  const podiumTop = 356;
  const podiumBottom = 400;
  const boxTop = 96;
  const boxPxH = podiumTop - boxTop;

  const vents = Math.min(10, Math.max(1, Math.round(num('podiumFront_count'))));
  const zone = (key: string) => str(`${key}_kind`);

  // Вікно топки на схемі — у тих самих пропорціях, що й у виробі
  const fbW = Math.min(boxPx - 16, num('fireboxWidth') * px);
  const hpx = boxPxH / Math.max(1, num('boxHeight'));
  const fbH = Math.min(boxPxH - 30, num('fireboxHeight') * hpx);
  const fbUp = num('fireboxUp') * hpx;
  const fbBottom = podiumTop - fbUp;
  const fbTop = fbBottom - fbH;

  /** Отвір зони: ряд прорізів або одна ніша — те саме, що збереться у виробі */
  const zoneMarks = (key: string, left: number, right: number, bottomY: number, availH: number, id: string) => {
    const kind = zone(key);
    if (kind === 'niche') {
      const nh = Math.min(availH - 8, Math.max(8, num('podiumFront_nicheH') * (availH / 500)));
      const nw = Math.max(10, right - left - 8);
      return (
        <rect
          key={id}
          className="scheme-part inner"
          x={(left + right) / 2 - nw / 2}
          y={bottomY - nh}
          width={nw}
          height={nh}
        />
      );
    }
    if (kind !== 'vent') return null;
    return (
      <g key={id}>
        {Array.from({ length: vents }).map((_, i) => (
          <line key={i} className="scheme-dim" x1={left} y1={bottomY - i * 3.2} x2={right} y2={bottomY - i * 3.2} />
        ))}
      </g>
    );
  };

  return (
    <>
      <text className="scheme-caption centered" x={x0 + (total * px) / 2} y={28}>Вид спереду</text>
      <rect className="scheme-part" x={boxX} y={boxTop} width={boxPx} height={boxPxH} />
      <rect className="scheme-part" x={x0} y={podiumTop} width={total * px} height={podiumBottom - podiumTop} />
      <line className="scheme-dash" x1={x0 - 30} y1={podiumBottom} x2={x0 + total * px + 30} y2={podiumBottom} />

      {/* вікно топки */}
      <rect className="scheme-part inner" x={boxX + (boxPx - fbW) / 2} y={fbTop} width={fbW} height={fbH} />
      {zoneMarks('boxFront', boxX + 14, boxX + boxPx - 14, fbTop - 22, 60, 'zbf')}
      {zoneMarks('podiumFront', x0 + 12, x0 + total * px - 12, podiumBottom - 10, 34, 'zpf')}

      {/* розміри: короб і виступи — підписи за контуром */}
      <line className="scheme-arrow" x1={boxX} y1={72} x2={boxX + boxPx} y2={72} />
      <SvgInput x={boxX + boxPx / 2 - 34} y={40} value={boxW} onChange={(v) => set('boxWidth', v)} />
      <line className="scheme-arrow" x1={x0} y1={422} x2={boxX} y2={422} />
      <SvgInput x={x0 + (boxX - x0) / 2 - 34} y={430} value={oL} onChange={(v) => set('overhangLeft', v)} width={60} />
      <line className="scheme-arrow" x1={boxX + boxPx} y1={422} x2={x0 + total * px} y2={422} />
      <SvgInput x={(boxX + boxPx + x0 + total * px) / 2 - 34} y={430} value={oR} onChange={(v) => set('overhangRight', v)} width={60} />
      <line className="scheme-arrow" x1={x0 - 34} y1={boxTop} x2={x0 - 34} y2={podiumTop} />
      <SvgInput x={x0 - 120} y={boxTop + boxPxH / 2 - 20} value={num('boxHeight')} onChange={(v) => set('boxHeight', v)} />
      <line className="scheme-arrow" x1={x0 + total * px + 34} y1={podiumTop} x2={x0 + total * px + 34} y2={podiumBottom} />
      <SvgInput x={x0 + total * px + 44} y={podiumTop + 2} value={num('podiumHeight')} onChange={(v) => set('podiumHeight', v)} />

      {/* розміри вікна топки: ширина, висота, поріг над подіумом */}
      <line className="scheme-arrow" x1={boxX + (boxPx - fbW) / 2} y1={fbTop - 8} x2={boxX + (boxPx + fbW) / 2} y2={fbTop - 8} />
      <SvgInput x={boxX + boxPx / 2 - 34} y={fbTop - 46} value={num('fireboxWidth')} onChange={(v) => set('fireboxWidth', v)} />
      <text className="scheme-caption centered" x={boxX + boxPx / 2} y={fbTop - 56}>вікно топки</text>
      <line className="scheme-arrow" x1={boxX + (boxPx + fbW) / 2 + 10} y1={fbTop} x2={boxX + (boxPx + fbW) / 2 + 10} y2={fbBottom} />
      <SvgInput x={boxX + (boxPx + fbW) / 2 + 18} y={fbTop + fbH / 2 - 20} value={num('fireboxHeight')} onChange={(v) => set('fireboxHeight', v)} />
      <line className="scheme-arrow" x1={boxX + boxPx / 2} y1={fbBottom} x2={boxX + boxPx / 2} y2={podiumTop} />
      <SvgInput x={boxX + boxPx / 2 - 34} y={fbBottom + 2} value={num('fireboxUp')} onChange={(v) => set('fireboxUp', v)} />

      {/* ── види справа і зліва: виступ уперед і своя зона ── */}
      {[
        { label: 'Вид справа', x: 700, zoneBox: 'boxRight', zonePodium: 'podiumRight', mirrored: false },
        { label: 'Вид зліва', x: 900, zoneBox: 'boxLeft', zonePodium: 'podiumLeft', mirrored: true },
      ].map((view) => {
        const d = Math.max(1, num('boxDepth'));
        const f = num('overhangFront');
        const dpx = 120 / (d + f);
        const boxDpx = d * dpx;
        const frontPx = f * dpx;
        const bx = view.mirrored ? view.x + frontPx : view.x;
        return (
          <g key={view.zoneBox}>
            <text className="scheme-caption centered" x={view.x + (boxDpx + frontPx) / 2} y={28}>{view.label}</text>
            <rect className="scheme-part" x={bx} y={boxTop} width={boxDpx} height={boxPxH} />
            <rect className="scheme-part" x={view.x} y={podiumTop} width={boxDpx + frontPx} height={podiumBottom - podiumTop} />
            <line className="scheme-dash" x1={view.x - 20} y1={podiumBottom} x2={view.x + boxDpx + frontPx + 20} y2={podiumBottom} />
            {zoneMarks(view.zoneBox, bx + 8, bx + boxDpx - 8, boxTop + boxPxH * 0.24, 70, `${view.zoneBox}-m`)}
            {zoneMarks(view.zonePodium, view.x + 8, view.x + boxDpx + frontPx - 8, podiumBottom - 10, 34, `${view.zonePodium}-m`)}
            <line className="scheme-arrow" x1={bx} y1={72} x2={bx + boxDpx} y2={72} />
            <SvgInput x={bx + boxDpx / 2 - 34} y={40} value={d} onChange={(v) => set('boxDepth', v)} />
            <line className="scheme-arrow" x1={view.x} y1={422} x2={view.x + boxDpx + frontPx} y2={422} />
            <SvgInput x={view.x + (boxDpx + frontPx) / 2 - 34} y={430} value={f} onChange={(v) => set('overhangFront', v)} />
          </g>
        );
      })}
      <text className="scheme-caption centered" x={800} y={470}>виступ подіуму вперед</text>
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

/** Ширші схеми (кілька видів) просять свій viewBox */
const ZONE_KIND_LABEL: Record<string, string> = { none: 'немає', vent: 'решітка', niche: 'ніша' };

const SKETCH_VIEWBOX: Record<string, string> = {
  fireplace_modern: '0 0 1060 490',
};

const SKETCHES: Record<string, (api: SketchApi) => ReactNode> = {
  straight_top: (api) => <StraightTopSketch {...api} />,
  l_top: (api) => <LTopSketch {...api} />,
  island_leg: (api) => <IslandSketch {...api} />,
  portal_panels: (api) => <PortalSketch {...api} />,
  fireplace_surround: (api) => <FireplaceSketch {...api} />,
  fireplace_modern: (api) => <FireplaceModernSketch {...api} />,
  window_sill: (api) => <WindowSillSketch {...api} />,
};

export function ProductTemplateModal({
  onClose,
  onCreate,
  initialTemplateId,
  initialValues,
}: {
  onClose: () => void;
  /** Друга віддача — самі значення, щоб їх можна було відкрити повторно */
  onCreate: (session: ProductEditorSession, state: { templateId: string; values: TemplateValues }) => void;
  initialTemplateId?: string;
  initialValues?: TemplateValues;
}) {
  const [selectedId, setSelectedId] = useState(initialTemplateId ?? PRODUCT_TEMPLATES[0].id);
  const [values, setValues] = useState<TemplateValues>(initialValues ?? {});
  const [zoneKey, setZoneKey] = useState<string>('');

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
    bool: (key) => {
      const stored = values[valueKey(key)];
      if (typeof stored === 'boolean') return stored;
      const def = template.params.find((p): p is TemplateToggleParam => p.kind === 'toggle' && p.key === key);
      return def ? def.default : false;
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
  // Опції (вмикачі решіток і їхні налаштування) живуть збоку, а не на схемі:
  // на кресленні їм нема де стояти, а тумблер на розмірній лінії не читається.
  const options = template.params.filter((p) => p.group === 'options');
  // Зони — унікальні ключі серед опційних параметрів, у порядку оголошення
  const zoneOptions = FIREPLACE_ZONES.filter((z) => options.some((p) => p.zone === z.key));
  const activeZone = zoneOptions.some((z) => z.key === zoneKey) ? zoneKey : zoneOptions[0]?.key ?? '';
  // Параметри ніші показуємо лише коли в зоні саме ніша, і навпаки —
  // інакше половина полів у списку нічого не робить.
  const zoneKindNow = activeZone ? api.str(`${activeZone}_kind`) : '';
  const shownOptions = options.filter((p) => {
    if (!p.zone) return true;
    if (p.zone !== activeZone) return false;
    if (p.key.endsWith('_kind')) return true;
    const isNicheParam = p.key.includes('_niche');
    if (zoneKindNow === 'niche') return isNicheParam || p.key.includes('_margin');
    if (zoneKindNow === 'vent') return !isNicheParam;
    return false;
  });

  const numberField = (p: TemplateNumberParam) => (
    <div key={p.key} className="flex items-center justify-between gap-3">
      <label className="text-sm text-slate-600">{p.label}</label>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          min={p.min}
          max={p.max}
          value={api.num(p.key)}
          onChange={(e) => api.set(p.key, e.target.value === '' ? p.default : Number(e.target.value))}
          className="w-20 bg-white border border-transparent focus:border-[#2489d8] rounded-sm px-2 py-1.5 text-sm outline-none shadow-sm text-right"
        />
        <span className="text-xs text-slate-500 w-6">{p.unit}</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/40 p-3" role="presentation">
      <div
        className="w-full h-full bg-[#dcebf5] rounded-sm shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Шаблони виробів"
      >
        {/* Шапка */}
        <div className="bg-[#2489d8] text-white px-5 py-3 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold">Шаблони виробів</h2>
          <button onClick={onClose} className="hover:bg-white/20 p-1.5 rounded-full transition-colors" aria-label="Закрити">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Список шаблонів */}
          <div className="w-[240px] border-r border-[#b8d4ee] py-2 flex flex-col shrink-0 overflow-y-auto">
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

          {/* Ескіз — стиль конструктора мийок: розміри редагуються на схемі */}
          <div className="flex-1 p-4 flex flex-col gap-3 min-w-0">
            <p className="text-sm text-slate-600 leading-snug">{template.description}</p>
            <div className="schema reference-schema flex-1 rounded-sm overflow-hidden min-h-0">
              <svg
                viewBox={SKETCH_VIEWBOX[template.id] ?? '0 0 660 470'}
                className="designer-scheme-svg"
                style={{ width: '98%', maxHeight: '100%' }}
              >
                <ArrowDefs />
                {sketch ? sketch(api) : null}
              </svg>
            </div>
          </div>

          {/* Опції. Якщо параметри розкладені по зонах — показуємо по одній
              деталі: шість наборів одразу читати неможливо. */}
          {options.length > 0 && (
            <div className="w-[340px] border-l border-[#b8d4ee] p-4 flex flex-col gap-3 shrink-0 overflow-y-auto">
              <div className="text-sm font-bold text-slate-700">Опції</div>

              {zoneOptions.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-500">Деталь</label>
                  <select
                    value={activeZone}
                    onChange={(e) => setZoneKey(e.target.value)}
                    className="w-full bg-white border border-transparent focus:border-[#2489d8] rounded-sm px-2 py-2 text-sm outline-none shadow-sm cursor-pointer"
                  >
                    {zoneOptions.map((z) => (
                      <option key={z.key} value={z.key}>
                        {z.label} — {ZONE_KIND_LABEL[api.str(`${z.key}_kind`)] ?? ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {shownOptions.map((p) =>
                p.kind === 'toggle' ? (
                  <label key={p.key} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={api.bool(p.key)}
                      onChange={(e) => api.set(p.key, e.target.checked)}
                      className="w-4 h-4 accent-[#2489d8] cursor-pointer"
                    />
                    <span className="text-sm text-slate-700 group-hover:text-slate-900">{p.label}</span>
                  </label>
                ) : p.kind === 'number' ? (
                  numberField(p)
                ) : (
                  <div key={p.key} className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500">{p.label}</label>
                    <div className="flex rounded-sm overflow-hidden border border-[#2489d8]">
                      {p.options.map((o) => (
                        <button
                          key={o.value}
                          onClick={() => api.set(p.key, o.value)}
                          className={`flex-1 px-2 py-1.5 text-sm font-medium transition-colors ${
                            api.str(p.key) === o.value ? 'bg-[#2489d8] text-white' : 'bg-white text-[#2489d8] hover:bg-[#2489d8]/10'
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        {/* Підвал */}
        <div className="px-5 py-3 border-t border-[#b8d4ee] flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">
            Скасувати
          </button>
          <button
            onClick={() => onCreate(template.build(collectValues()), { templateId: template.id, values })}
            className="px-6 py-2 border border-[#2489d8] text-[#2489d8] text-sm font-bold rounded-sm hover:bg-[#2489d8] hover:text-white transition-colors"
          >
            Створити
          </button>
        </div>
      </div>
    </div>
  );
}
