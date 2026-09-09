import { describe, it, expect } from 'vitest';
import { shrinkInsetAttachment, edgeNeighbours, shrunkAttachmentDraft, type ShrinkableDraft } from '../attachmentShrink';

/**
 * Б-170 — правило власника 09.09, слово в слово:
 * «якщо деталь-нога на краю — примикає під 45°; якщо втоплена — зменшується
 * в розмірі на товщину стільниці і ноги справа і примикає перпендикулярно
 * торцем до них». Рахує система, користувач вводить круглі числа.
 */

const BASE = {
  width: 2000,
  height: 900,
  attachOffset: 0,
  sideLength: 2000,
  parentThickness: 20,
  neighbourAtStart: 20,
  neighbourAtEnd: 20,
  attachGap: 0,
  growsDown: true,
  trimSides: true,
};

describe('Б-170 · усадка втопленого доповнення', () => {
  it('нога на кромці не чіпається зовсім', () => {
    const r = shrinkInsetAttachment({ ...BASE, inset: 0 });
    expect(r).toMatchObject({ width: 2000, height: 900, attachOffset: 0, attachGap: 0, shrunk: false });
  });

  it('втоплена нога: мінус товщина стільниці по висоті, мінус сусіди по довжині', () => {
    const r = shrinkInsetAttachment({ ...BASE, inset: 200 });
    expect(r.height).toBe(880);          // 900 − 20 (стільниця)
    expect(r.width).toBe(1960);          // 2000 − 20 − 20 (дві сусідні ноги)
    expect(r.attachOffset).toBe(20);     // зсув на товщину сусіда зліва
    expect(r.attachGap).toBe(20);        // і сама нога опускається під плиту
    expect(r.shrunk).toBe(true);
  });

  it('немає сусіда з одного боку — з того боку не коротшає', () => {
    const r = shrinkInsetAttachment({ ...BASE, inset: 200, neighbourAtEnd: 0 });
    expect(r.width).toBe(1980);
    expect(r.attachOffset).toBe(20);
  });

  it('немає сусідів взагалі — коротшає тільки висота', () => {
    const r = shrinkInsetAttachment({ ...BASE, inset: 200, neighbourAtStart: 0, neighbourAtEnd: 0 });
    expect(r.width).toBe(2000);
    expect(r.height).toBe(880);
    expect(r.attachOffset).toBe(0);
  });

  it('нога коротша за сторону і стоїть посередині — сусідів не торкається', () => {
    const r = shrinkInsetAttachment({ ...BASE, inset: 200, width: 1000, attachOffset: 400 });
    expect(r.width).toBe(1000);          // по довжині нічого не знято
    expect(r.attachOffset).toBe(400);
    expect(r.height).toBe(880);          // а низ стільниці нікуди не дівся
  });

  it('нога впирається лише в лівого сусіда', () => {
    const r = shrinkInsetAttachment({ ...BASE, inset: 200, width: 1000, attachOffset: 0 });
    expect(r.width).toBe(980);
    expect(r.attachOffset).toBe(20);
  });

  it('№172: кромка без втоплення ріже тільки висоту — по довжині деталь ціла', () => {
    // Стик став прямим через кромку, але деталь лишилась на своєму ребрі:
    // вона нікуди не зсунулась, отже в сусідів не впирається.
    const r = shrinkInsetAttachment({ ...BASE, inset: 1, trimSides: false });
    expect(r.width).toBe(2000);
    expect(r.attachOffset).toBe(0);
    expect(r.height).toBe(880);
    expect(r.attachGap).toBe(20);
  });

  it('панель, що росте ВГОРУ, по висоті не міняється — тільки по довжині', () => {
    const r = shrinkInsetAttachment({ ...BASE, inset: 200, growsDown: false });
    expect(r.height).toBe(900);          // стоїть на верхній площині, як стояла
    expect(r.attachGap).toBe(0);
    expect(r.width).toBe(1960);
  });

  it('товщі сусіди — глибша усадка (30 мм камінь)', () => {
    const r = shrinkInsetAttachment({
      ...BASE, inset: 100, parentThickness: 30, neighbourAtStart: 30, neighbourAtEnd: 30,
    });
    expect(r.height).toBe(870);
    expect(r.width).toBe(1940);
  });
});

describe('Б-170 · сусіди сторони по контуру', () => {
  it('прямокутник: у кожної сторони два сусіди і замкнене коло', () => {
    const n = edgeNeighbours({ kind: 'rect', width: 2000, height: 600, thickness: 20 });
    const sides = Object.keys(n);
    expect(sides.length).toBe(4);
    for (const side of sides) {
      expect(n[side].prev).toBeTruthy();
      expect(n[side].next).toBeTruthy();
      expect(n[side].prev).not.toBe(side);
      expect(n[side].next).not.toBe(side);
    }
    // Обхід замкнений: від будь-якої сторони за чотири кроки повертаємось.
    let cur = sides[0];
    for (let i = 0; i < 4; i += 1) cur = n[cur].next!;
    expect(cur).toBe(sides[0]);
  });

  it('зіпсований контур не валить розрахунок — просто немає сусідів', () => {
    expect(edgeNeighbours(undefined)).toEqual({});
    expect(edgeNeighbours({} as never)).toBeTypeOf('object');
  });
});

describe('Б-170/№172 · втоплений сусід у куті не стоїть', () => {
  it('сусід із «в глиб» не вкорочує нашу деталь', () => {
    // Власник 09.09: «поставив кромку, а деталь зменшилась не лише по висоті,
    // а й по ширині — можливо, бо зчитало ту втоплену ногу». Так і було.
    const parse = (slot: string) => ({
      kind: 'leg',
      sideId: slot.replace('leg_', ''),
      ownerSlot: undefined as string | undefined,
    });
    const owner = { kind: 'rect', width: 1200, height: 600, thickness: 20,
      edgeProfiles: { B: { top: { profileId: 'r_3' } } } };
    const subDetails: Record<string, ShrinkableDraft> = {
      leg_B: { width: 600, height: 900, thickness: 20, attachOffset: 0, attachInset: 0 },
      leg_C: { width: 1200, height: 900, thickness: 20, attachOffset: 0, attachInset: 200 },
    };
    const b = shrunkAttachmentDraft({ slot: 'leg_B', draft: subDetails.leg_B, ownerDetail: owner, subDetails, parse });
    expect(b.attachStraight).toBe(true);   // кромка на B → прямий стик
    expect(b.height).toBe(880);            // під плиту
    expect(b.width).toBe(600);             // і НІЯКОГО вкорочення по довжині
    expect(b.attachOffset).toBe(0);
  });

  it('без кромки і без втоплення деталь не чіпається зовсім', () => {
    const parse = (slot: string) => ({ kind: 'leg', sideId: slot.replace('leg_', ''), ownerSlot: undefined });
    const owner = { kind: 'rect', width: 1200, height: 600, thickness: 20 };
    const draft: ShrinkableDraft = { width: 600, height: 900, thickness: 20, attachOffset: 0, attachInset: 0 };
    const r = shrunkAttachmentDraft({ slot: 'leg_B', draft, ownerDetail: owner, subDetails: { leg_B: draft }, parse });
    expect(r).toBe(draft);
  });
});
