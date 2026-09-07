/**
 * РОЗРІЗИ Й ВУЗЛИ — будівельники `SectionView` для аркушів (06.09.2026).
 *
 * Кожен розріз — маленька картинка в мм аркуша з власним заголовком
 * (КР-3: над «Кромка N» — значок-зигзаг; РЗ-1: «1-1» жирно й підкреслено).
 * Колір заголовка = колір елемента на плані (КЛ-1). Масштаб перерізів —
 * приблизно 1:2 (плита 20 мм → 9 мм на папері), як у кейсах.
 *
 *  · profileSection — розріз кромки: векторне креслення з каталогу цеху
 *    (`domain/edgeProfileDrawings`), якщо є; інакше — плита зі штриховкою
 *    і підписом профілю всередині (ШТ-1/ШТ-2);
 *  · sinkCutSection — «Виріз під мийку»: плита, борт чаші знизу, зазор під
 *    клей (ІНС-2 — СПІРНЕ: 1 або 3–4 мм; пишемо 3–4* і зірочку);
 *  · legNode — «1-1»: водоспадне з'єднання під 45° (ІНС-5);
 *  · thickeningSection — потовщення: дві плити, клей, фаска 2×2;
 *  · foldSection — підворот: смуга під 45°, текстура наскрізна;
 *  · wallPanelSection — стінова панель на стільниці: стик монтажний.
 */
import { edgeProfileDrawing } from '../../domain/edgeProfileDrawings';
import { referenceData } from '../../domain/defaults';
import type { DimEntity, Entity, Pt, SectionView } from './model';
import { fmtMm, rectPts } from './geom';

export const profileLabel = (id: string) => referenceData.edgeProfiles?.find((p) => p.id === id)?.shortLabel ?? id;
export const isR0 = (id: string) => id === 'polished_straight';

/** Масштаб перерізів: мм каменю → мм аркуша. */
const K = 0.45;
const Y0 = 7; // під заголовком

/** Розмір між a і b, зміщений на `offset` мм перпендикулярно (знак — бік). */
export function dim(a: Pt, b: Pt, offset: number, text: string, grey: boolean, rule: string): DimEntity {
  return { kind: 'dim', layer: grey ? 'Размер' : 'Размер робочий', rule, a, b, offset, text, grey };
}

const slab = (c: Pt, w: number, h: number, rule = 'ШТ-1'): Entity => ({ kind: 'polyline', layer: 'Стільниця', rule, points: rectPts(c, w, h), closed: true, fill: 'hatch-stone' });
const glueLine = (a: Pt, b: Pt): Entity => ({ kind: 'polyline', layer: 'Цеховской стык', rule: 'КЛ-1', points: [a, b], closed: false, weight: 0.7, color: '#f0b400' });

/** Розріз кромки: каталожне креслення або умовна плита з підписом. */
export function profileSection(profileId: string, index: number, color: string, thickness: number): SectionView {
  const cat = edgeProfileDrawing(profileId);
  const title = isR0(profileId) ? `Кромка ${index} (R0)` : `Кромка ${index}`;
  // R0 (пряма полірована) — власний розріз плити з підписом, а не каталожна картинка (там акрилова)
  if (cat && !isR0(profileId)) {
    const w = 40; const h = (cat.h / cat.w) * w;
    return {
      title, color, zigzagIcon: !isR0(profileId),
      entities: [
        { kind: 'svg', layer: 'Стільниця', rule: 'КР-3', at: { x: 0, y: Y0 }, w, h, svg: cat.svg },
        { kind: 'text', layer: 'Стільниця', rule: 'ШТ-2', at: { x: w / 2, y: Y0 + h + 3.2 }, text: profileLabel(profileId), style: 'dim', anchor: 'middle' },
      ],
      w: w + 2, h: Y0 + h + 5,
    };
  }
  const t = thickness * K; const w = 30;
  return {
    title, color, zigzagIcon: !isR0(profileId),
    entities: [
      { ...slab({ x: 6 + w / 2, y: Y0 + 2 + t / 2 }, w, t), rx: isR0(profileId) ? 0 : 1 } as Entity,
      { kind: 'polyline', layer: 'Штамп', rule: 'ШТ-2', points: rectPts({ x: 6 + w / 2, y: Y0 + 2 + t / 2 }, 16, 4.4), closed: true, fill: 'white' },
      { kind: 'text', layer: 'Стільниця', rule: 'ШТ-2', at: { x: 6 + w / 2, y: Y0 + 2 + t / 2 + 1 }, text: profileLabel(profileId), style: 'dim', anchor: 'middle' },
      dim({ x: 6, y: Y0 + 2 }, { x: 6, y: Y0 + 2 + t }, -4, fmtMm(thickness), false, 'ШР-3'),
    ],
    w: w + 10, h: Y0 + t + 8,
  };
}

/** «Виріз під мийку»: плита стільниці, під нею борт чаші, зазор під клей. */
export function sinkCutSection(thickness: number, ownSink: boolean, color?: string): SectionView {
  const t = thickness * K; const W = 30; const x0 = 6; const y0 = Y0 + 2;
  const E: Entity[] = [
    slab({ x: x0 + W / 2, y: y0 + t / 2 }, W, t),
    // технічна фаска по вирізу (правий торець — це виріз)
    { kind: 'polyline', layer: 'Стільниця', rule: 'КС-19', points: [{ x: x0 + W - 1.2, y: y0 }, { x: x0 + W, y: y0 + 1.2 }], closed: false },
    dim({ x: x0, y: y0 }, { x: x0, y: y0 + t }, -4, fmtMm(thickness), false, 'ШР-3'),
  ];
  const gap = 2; // 3–4 мм умовно
  const wallX = x0 + W + gap; const wallH = 18;
  if (ownSink) {
    // борт чаші з каменю під плитою + підклейка до плити
    E.push(slab({ x: wallX + t / 2, y: y0 + t + 1 + wallH / 2 }, t, wallH, 'ІНС-1'));
    E.push(slab({ x: wallX + t + 7, y: y0 + t + 1 + t / 2 }, 14, t, 'ІНС-1'));
    E.push(glueLine({ x: x0 + W - 12, y: y0 + t + 0.5 }, { x: wallX + t + 14, y: y0 + t + 0.5 }));
    E.push({ kind: 'leader', layer: 'Виноска', rule: 'ВН-10', at: { x: wallX + t + 4, y: y0 + t + wallH + 2 }, text: 'мийка', targets: [{ x: wallX + t, y: y0 + t + 1 + wallH * 0.7 }] });
    E.push({ kind: 'leader', layer: 'Виноска', rule: 'ІНС-1', at: { x: x0 - 2, y: y0 + t + 10 }, text: 'вклейка знизу', targets: [{ x: x0 + W - 8, y: y0 + t + 0.5 }] });
  } else {
    E.push({ kind: 'polyline', layer: 'Виноска', rule: 'ІНС-1', points: [{ x: wallX, y: y0 + t + 1 }, { x: wallX, y: y0 + t + wallH }, { x: wallX + 16, y: y0 + t + wallH }], closed: false });
    E.push(glueLine({ x: x0 + W - 12, y: y0 + t + 0.5 }, { x: wallX + 12, y: y0 + t + 0.5 }));
    E.push({ kind: 'leader', layer: 'Виноска', rule: 'ВН-10', at: { x: wallX + 4, y: y0 + t + wallH + 4 }, text: 'мийка замовника', targets: [{ x: wallX, y: y0 + t + wallH * 0.7 }] });
    E.push({ kind: 'leader', layer: 'Виноска', rule: 'ІНС-1', at: { x: x0 - 2, y: y0 + t + 10 }, text: 'вклейка знизу', targets: [{ x: x0 + W - 8, y: y0 + t + 0.5 }] });
  }
  E.push(dim({ x: x0 + W, y: y0 + t + 1 }, { x: wallX, y: y0 + t + 1 }, 6, '3–4*', false, 'ІНС-2'));
  E.push({ kind: 'text', layer: 'Размер', rule: 'ВН-11', at: { x: 0, y: y0 + t + wallH + 9 }, text: '* зазор під клей — за техпроцесом', style: 'dim', color: '#808080' });
  return { title: 'Виріз під мийку', color, entities: E, w: 60, h: y0 + t + wallH + 11 };
}

/** Вузол «1-1»: водоспадне з'єднання стільниці з опорою під 45°. */
export function legNode(thickness: number, topName: string, legName: string, ownerBody = 'Корпус'): SectionView {
  const t = thickness * K; const L = 22; const y0 = Y0 + 3; const x0 = 4;
  return {
    title: '1-1',
    entities: [
      { kind: 'polyline', layer: 'Стільниця', rule: 'ІНС-5', points: [{ x: x0, y: y0 }, { x: x0 + L, y: y0 }, { x: x0 + L, y: y0 + t }, { x: x0 + t, y: y0 + t }, { x: x0 + t, y: y0 + L }, { x: x0, y: y0 + L }], closed: true, fill: 'hatch-stone' },
      { kind: 'polyline', layer: 'Цеховской стык', rule: 'КС-15', points: [{ x: x0, y: y0 }, { x: x0 + t, y: y0 + t }], closed: false },
      // корпус замовника — сіра сітка, щоб висота читалась (ВН-10)
      { kind: 'polyline', layer: 'Стены', rule: 'ВН-10', points: rectPts({ x: x0 + t + (L - t) / 2 + 0.5, y: y0 + t + (L - t) / 2 + 0.5 }, L - t - 1, L - t - 1), closed: true, fill: 'hatch-grey' },
      { kind: 'text', layer: 'Стены', rule: 'ВН-10', at: { x: x0 + t + (L - t) / 2 + 0.5, y: y0 + t + (L - t) / 2 + 1.4 }, text: ownerBody, style: 'dim', anchor: 'middle', color: '#808080' },
      { kind: 'leader', layer: 'Виноска', rule: 'ВН-10', at: { x: x0 + L + 3, y: y0 + t / 2 + 1 }, text: topName, targets: [{ x: x0 + L, y: y0 + t / 2 }] },
      { kind: 'leader', layer: 'Виноска', rule: 'ВН-10', at: { x: x0 + t + 3, y: y0 + L + 4 }, text: legName, targets: [{ x: x0 + t / 2, y: y0 + L }] },
      { kind: 'leader', layer: 'Виноска', rule: 'ІНС-5', at: { x: x0 + L + 3, y: y0 - 1 }, text: 'фаска 2×2', targets: [{ x: x0 + 0.6, y: y0 + 0.6 }] },
      dim({ x: x0, y: y0 + L }, { x: x0 + t, y: y0 + L }, 4, fmtMm(thickness), false, 'ШР-3'),
    ],
    w: L + 30, h: y0 + L + 9,
  };
}

/** Потовщення: дві плити одна під одною, клей між ними. */
export function thickeningSection(thickness: number, bandMm: number, miter: boolean, color?: string): SectionView {
  const t = thickness * K; const y0 = Y0 + 2; const x0 = 4; const W = 30; const band = Math.min(W - 6, bandMm * K);
  const E: Entity[] = [
    slab({ x: x0 + W / 2, y: y0 + t / 2 }, W, t),
    slab({ x: x0 + W - band / 2, y: y0 + t + 0.6 + t / 2 }, band, t, 'КС-12'),
    glueLine({ x: x0 + W - band, y: y0 + t + 0.3 }, { x: x0 + W, y: y0 + t + 0.3 }),
    { kind: 'leader', layer: 'Виноска', rule: 'ВН-2', at: { x: x0 - 3, y: y0 + t + 7 }, text: 'клей', targets: [{ x: x0 + W - band + 1, y: y0 + t + 0.3 }], underline: true },
    dim({ x: x0 + W, y: y0 }, { x: x0 + W, y: y0 + 2 * t + 0.6 }, 4, fmtMm(thickness * 2), false, 'ШР-3'),
    dim({ x: x0 + W - band, y: y0 + 2 * t + 0.6 }, { x: x0 + W, y: y0 + 2 * t + 0.6 }, 4, fmtMm(bandMm), false, 'ШР-3'),
    { kind: 'text', layer: 'Размер робочий', rule: 'КС-12', at: { x: 0, y: y0 + 2 * t + 10.5 }, text: miter ? 'стик 45° (керамограніт)' : 'пряма підклейка знизу (кварцит)', style: 'note' },
  ];
  if (miter) E.push({ kind: 'polyline', layer: 'Цеховской стык', rule: 'КС-15', points: [{ x: x0 + W, y: y0 }, { x: x0 + W - t, y: y0 + t }], closed: false });
  return { title: 'Потовщення', color, entities: E, w: W + 14, h: y0 + 2 * t + 13 };
}

/** Підворот: смуга під 45° до плити, текстура наскрізна. */
export function foldSection(thickness: number, dropMm: number, color?: string): SectionView {
  const t = thickness * K; const y0 = Y0 + 3; const x0 = 4; const W = 26; const drop = Math.min(30, dropMm * K);
  return {
    title: 'Підворот', color,
    entities: [
      { kind: 'polyline', layer: 'Стільниця', rule: 'КС-15', points: [{ x: x0, y: y0 }, { x: x0 + W, y: y0 }, { x: x0 + W - t, y: y0 + t }, { x: x0, y: y0 + t }], closed: true, fill: 'hatch-stone' },
      { kind: 'polyline', layer: 'Стільниця', rule: 'КС-15', points: [{ x: x0 + W, y: y0 }, { x: x0 + W, y: y0 + drop }, { x: x0 + W - t, y: y0 + drop }, { x: x0 + W - t, y: y0 + t }], closed: true, fill: 'hatch-stone' },
      { kind: 'polyline', layer: 'Цеховской стык', rule: 'КЛ-1', points: [{ x: x0 + W, y: y0 }, { x: x0 + W - t, y: y0 + t }], closed: false },
      { kind: 'text', layer: 'Размер робочий', rule: 'ОФ-45', at: { x: x0 + W - t - 1, y: y0 + t + 3.2 }, text: '45°', style: 'dim', anchor: 'end' },
      // текстура наскрізна — пунктир уздовж лиця
      { kind: 'polyline', layer: 'Виноска', rule: 'FG-2', points: [{ x: x0 + 2, y: y0 - 1.2 }, { x: x0 + W + 1.2, y: y0 - 1.2 }, { x: x0 + W + 1.2, y: y0 + drop - 1 }], closed: false, dashed: true },
      { kind: 'text', layer: 'Виноска', rule: 'FG-2', at: { x: x0, y: y0 - 2 }, text: 'текстура наскрізна', style: 'note' },
      dim({ x: x0 + W, y: y0 }, { x: x0 + W, y: y0 + drop }, 4, fmtMm(dropMm), false, 'ШР-3'),
      dim({ x: x0 + W - t, y: y0 + drop }, { x: x0 + W, y: y0 + drop }, 4, fmtMm(thickness), false, 'ШР-3'),
    ],
    w: W + 16, h: y0 + drop + 9,
  };
}

/** Стик стільниці й стінової панелі на об'єкті — прямий, монтажний. */
export function wallPanelSection(thickness: number, color?: string): SectionView {
  // заголовок розділу займає верхні ~5 мм — розмір товщини панелі має бути нижче нього
  const t = thickness * K; const y0 = Y0 + 7; const x0 = 4; const W = 26; const H = 22;
  return {
    title: 'Стінова панель', color,
    entities: [
      slab({ x: x0 + W / 2, y: y0 + H + t / 2 }, W, t),
      slab({ x: x0 + W - t / 2, y: y0 + H / 2 }, t, H, 'КС-15'),
      { kind: 'polyline', layer: 'Стены', rule: 'ІНС-4', points: rectPts({ x: x0 + W + 2.5, y: y0 + (H + t) / 2 }, 5, H + t), closed: true, fill: 'hatch-grey' },
      { kind: 'polyline', layer: 'Монтажный стык', rule: 'КЛ-1', points: [{ x: x0 + W - t, y: y0 + H }, { x: x0 + W, y: y0 + H }], closed: false },
      // підпис стику — під плитою стільниці, щоб не лягати на панель (ВН-1)
      { kind: 'leader', layer: 'Виноска', rule: 'ВН-2', at: { x: x0, y: y0 + H + t + 5.5 }, text: 'Стик монтажний', targets: [{ x: x0 + W - t, y: y0 + H }], underline: true },
      { kind: 'text', layer: 'Стільниця', rule: 'ІНС-5', at: { x: x0, y: y0 + H - 1.5 }, text: 'Стільниця', style: 'dim' },
      { kind: 'text', layer: 'Стены', rule: 'ВН-10', at: { x: x0 + W + 2.6, y: y0 + (H + t) / 2 }, text: 'стіна', style: 'dim', anchor: 'middle', rotate: -90, color: '#808080' },
      dim({ x: x0 + W - t, y: y0 }, { x: x0 + W, y: y0 }, -4, fmtMm(thickness), false, 'ШР-3'),
    ],
    w: W + 14, h: y0 + H + t + 8,
  };
}

/** Фаска b×b на ребрі стику 45° — вузол у збільшенні (2:1 від товщини), не каталожна картинка. */
export function chamferSection(thickness: number, size = 2, color?: string): SectionView {
  const k = 0.9; const t = thickness * k; const c = size * k; const W = 26; const x0 = 8; const y0 = Y0 + 6;
  const pts: Pt[] = [{ x: x0, y: y0 }, { x: x0 + W - c, y: y0 }, { x: x0 + W, y: y0 + c }, { x: x0 + W, y: y0 + t }, { x: x0, y: y0 + t }];
  return {
    title: `Фаска ${size}×${size}`, color,
    entities: [
      { kind: 'polyline', layer: 'Стільниця', rule: 'ІНС-5', points: pts, closed: true, fill: 'hatch-stone' },
      dim({ x: x0 + W - c, y: y0 }, { x: x0 + W, y: y0 }, -3.5, fmtMm(size), false, 'ІНС-5'),
      dim({ x: x0 + W, y: y0 }, { x: x0 + W, y: y0 + c }, 3.5, fmtMm(size), false, 'ІНС-5'),
      dim({ x: x0, y: y0 }, { x: x0, y: y0 + t }, -4, fmtMm(thickness), false, 'ШР-3'),
      { kind: 'text', layer: 'Стільниця', rule: 'ІНС-5', at: { x: x0, y: y0 + t + 4.2 }, text: 'на лицьових ребрах стиків 45°', style: 'dim' },
    ],
    w: W + 20, h: y0 + t + 7,
  };
}

/** Бортик (плінтус із каменю) на стільниці: смуга стоїть на плиті вздовж стіни, клей у основі (ОФ-ФП: власний переріз). */
export function skirtingSection(thickness: number, heightMm: number, color?: string): SectionView {
  const t = thickness * K; const H = Math.min(28, heightMm * K); const y0 = Y0 + 7; const x0 = 4; const W = 26;
  const yTop = y0 + H; // низ бортика = верх плити
  return {
    title: 'Бортик', color,
    entities: [
      slab({ x: x0 + W / 2, y: yTop + t / 2 }, W, t),
      slab({ x: x0 + W - t / 2, y: y0 + H / 2 }, t, H, 'ІНС-5'),
      { kind: 'polyline', layer: 'Стены', rule: 'ІНС-4', points: rectPts({ x: x0 + W + 2.5, y: y0 + (H + t) / 2 }, 5, H + t), closed: true, fill: 'hatch-grey' },
      glueLine({ x: x0 + W - t, y: yTop }, { x: x0 + W, y: yTop }),
      { kind: 'leader', layer: 'Виноска', rule: 'ВН-2', at: { x: x0, y: yTop + t + 5.5 }, text: 'клей', targets: [{ x: x0 + W - t / 2, y: yTop }], underline: true },
      { kind: 'text', layer: 'Стільниця', rule: 'ІНС-5', at: { x: x0, y: yTop - 1.5 }, text: 'Стільниця', style: 'dim' },
      { kind: 'text', layer: 'Стены', rule: 'ВН-10', at: { x: x0 + W + 2.6, y: y0 + (H + t) / 2 }, text: 'стіна', style: 'dim', anchor: 'middle', rotate: -90, color: '#808080' },
      dim({ x: x0 + W - t, y: y0 }, { x: x0 + W, y: y0 }, -4, fmtMm(thickness), false, 'ШР-3'),
      dim({ x: x0 + W, y: y0 }, { x: x0 + W, y: yTop }, 9, fmtMm(heightMm), false, 'ШР-3'),
    ],
    w: W + 20, h: yTop + t + 8,
  };
}
