import type { SlabInstance } from '../../../domain/types';

/**
 * КОРІНЕЦЬ СЛЕБА (27.08, задача власника).
 *
 * Замість голого рядка тексту над аркушем — язичок, приліплений до
 * каменю з тильного боку: він виступає згори, а нижнім краєм ховається
 * за листом. Під ним на камені лежить м'яка тінь — та сама, що дає
 * реальна наклейка на торці плити. Звідси й відчуття товщини: корінець
 * не намальований на камені, він за ним.
 *
 * Колір за виробником: Antolini підписують чорним із білим текстом — так
 * їх маркують у салоні і на складі, і по корінцю лист упізнається
 * здалеку. Решта — світло-сірий корінець із чорним текстом.
 */

const TAB_HEIGHT = 21;
/** На скільки язичок заходить ПІД камінь: саме це дає ефект «з тилу» */
const TUCK = 5;

function isAntolini(slab: SlabInstance) {
  return (slab.manufacturer ?? '').trim().toLowerCase().includes('antolini');
}

/**
 * Ширина язичка. Одна формула на корінець, його тінь і позначку вибору —
 * інакше тінь розтягувалась на весь аркуш і читалась як рамка зверху,
 * тобто рівно те, від чого ми позбувались.
 */
export function slabTabWidth(text: string, slabWidth: number) {
  return Math.min(Math.max(text.length * 8.4 + 26, 96), Math.max(slabWidth, 96));
}

export function SlabHeaderTab({ slab, text, slabWidth, selected = false }: {
  slab: SlabInstance;
  text: string;
  /** Ширина аркуша на екрані — корінець не може бути ширшим за лист */
  slabWidth: number;
  /**
   * Вибраний слеб. Позначаємо акцентною лінією на стику корінця з каменем —
   * так само, як активну вкладку у вікні. Підкладка навколо аркуша, яка
   * робила це раніше, читалась як рамка навколо фото.
   */
  selected?: boolean;
}) {
  const dark = isAntolini(slab);
  // 8.4 px на символ — прикидка для 12.5px Roboto з кирилицею (вона ширша
  // за латиницю). Плюс обрізання по язичку нижче: якщо декор довгий і
  // прикидка промахнеться, текст сховається під край, а не поповзе на
  // камінь — саме так це виглядало в першій версії.
  const width = slabTabWidth(text, slabWidth);
  const top = -(TAB_HEIGHT - TUCK);
  const clipId = `slab-tab-clip-${slab.id}`;

  return (
    <g className="slab-tab" aria-hidden="true">
      <clipPath id={clipId}>
        <rect x={0} y={top} width={width - 8} height={TAB_HEIGHT + 6} />
      </clipPath>
      <path
        d={`M 0 ${top + 4}
            a 4 4 0 0 1 4 -4
            h ${width - 8}
            a 4 4 0 0 1 4 4
            v ${TAB_HEIGHT}
            h ${-width}
            z`}
        fill={dark ? '#15181b' : '#dde3e9'}
        stroke={dark ? '#000' : '#c6d0d9'}
        strokeWidth={0.8}
      />
      <text
        x={11}
        y={top + TAB_HEIGHT - 7}
        fontSize={12.5}
        fontWeight={600}
        fill={dark ? '#f4f6f8' : '#1e2d3d'}
        clipPath={`url(#${clipId})`}
      >
        {text}
      </text>
      {selected && <rect x={0} y={TUCK - 2.5} width={width} height={2.5} fill="#0084ff" />}
    </g>
  );
}

/**
 * Тінь від корінця на камені. Малюється ПІСЛЯ аркуша, тому лягає зверху
 * на фото — як справжня тінь від наклеєного язичка.
 */
export function SlabTabShadow({ slab, text, slabWidth, id }: {
  slab: SlabInstance;
  text: string;
  slabWidth: number;
  id: string;
}) {
  const downId = `slab-tab-shadow-${id}`;
  const fadeId = `slab-tab-fade-${id}`;
  const width = Math.min(slabTabWidth(text, slabWidth) + 26, slabWidth);
  const ink = isAntolini(slab) ? 'rgba(0,0,0,.36)' : 'rgba(31,45,58,.24)';
  return (
    <g aria-hidden="true">
      <defs>
        {/* Вниз — сама тінь від товщини язичка */}
        <linearGradient id={downId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ink} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
        {/* Вправо — щоб тінь закінчувалась разом із язичком, а не обрубувалась */}
        <linearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="72%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${fadeId}-mask`}>
          <rect x={0} y={0} width={width} height={8} fill={`url(#${fadeId})`} />
        </mask>
      </defs>
      <rect x={0} y={0} width={width} height={7} fill={`url(#${downId})`} mask={`url(#${fadeId}-mask)`} />
    </g>
  );
}
