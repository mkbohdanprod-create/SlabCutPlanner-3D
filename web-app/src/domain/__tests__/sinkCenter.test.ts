import { describe, it, expect } from 'vitest';
import { sinkCenter, sinkCutout } from '../productSink';
import { cutoutCenter } from '../cutoutAnchor';
import { anchorContextFor } from '../elementToDetail';
import type { ElementDefinition, ProductSinkDef } from '../types';

/**
 * Чаша мийки і отвір під неї мусять давати ОДИН центр — завжди.
 *
 * Баг 07.08: після переходу координат на «від кута до кута чаші» отвір
 * поїхав за новою формулою, а обидва 3D-рендери чаші читали sink.x/y як
 * центр — чаша висіла зі зсувом у пів габариту від власного вирізу.
 */

const countertop = { kind: 'rect', width: 2000, height: 600, thickness: 20 } as unknown as ElementDefinition;

function sink(patch: Partial<ProductSinkDef> = {}): ProductSinkDef {
  return { id: 's1', kind: 'rect', x: 200, y: 300, width: 300, height: 300, depth: 200, ...patch } as ProductSinkDef;
}

describe('sinkCenter — чаша і отвір збігаються', () => {
  it('центр чаші = центр похідного вирізу (кейс із бага: 200/300, чаша 300×300)', () => {
    const s = sink();
    const bowl = sinkCenter(countertop, s);
    const hole = cutoutCenter(sinkCutout(s), anchorContextFor(countertop));
    expect(bowl).toEqual(hole);
    expect(bowl).toEqual({ cx: 350, cy: 450 }); // кут 200/300 + півчаші 150/150
  });

  it('прив’язка до кута успадковується чашею і отвором однаково', () => {
    const s = sink({ bindCorner: 'BC' }); // правий нижній
    const bowl = sinkCenter(countertop, s);
    const hole = cutoutCenter(sinkCutout(s), anchorContextFor(countertop));
    expect(bowl).toEqual(hole);
    expect(bowl).toEqual({ cx: 2000 - 200 - 150, cy: 600 - 300 - 150 });
  });

  it('на Г-подібній стільниці працює так само', () => {
    const lTop = { kind: 'l', outerWidth: 2000, outerHeight: 900, innerHorizontal: 800, innerVertical: 300, thickness: 20 } as unknown as ElementDefinition;
    const s = sink();
    expect(sinkCenter(lTop, s)).toEqual(cutoutCenter(sinkCutout(s), anchorContextFor(lTop)));
  });
});
