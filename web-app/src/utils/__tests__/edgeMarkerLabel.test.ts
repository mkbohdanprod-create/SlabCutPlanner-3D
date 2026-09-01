import { describe, it, expect } from 'vitest';
import { edgeMarkerLabel } from '../edgeMarkerLabel';

/**
 * FG-29 — маркери сторін у 3D мусять читатись тими самими літерами, що і в
 * 2D-таблиці розмірів. Тест фіксує саме перетворення id ребра в підпис;
 * висоту напису над кулькою перевіряти нічим, тому вона лишається на око,
 * але без цієї функції там світились технічні рядки на кшталт `AB_chamfer`.
 */
describe('edgeMarkerLabel', () => {
  it('прості сторони показує літерою як є', () => {
    for (const side of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      expect(edgeMarkerLabel(side)).toEqual({ text: side, isCornerSegment: false });
    }
  });

  it('фаску кута показує літерою кута і позначає як відрізок обробки', () => {
    expect(edgeMarkerLabel('AB_chamfer')).toEqual({ text: 'AB', isCornerSegment: true });
    expect(edgeMarkerLabel('DA_chamfer')).toEqual({ text: 'DA', isCornerSegment: true });
  });

  it('обидві полиці Г-подібного зрізу підписані тим самим кутом', () => {
    expect(edgeMarkerLabel('BC_lcut1')).toEqual({ text: 'BC', isCornerSegment: true });
    expect(edgeMarkerLabel('BC_lcut2')).toEqual({ text: 'BC', isCornerSegment: true });
  });

  it('дугу радіуса теж відносить до обробки кута', () => {
    expect(edgeMarkerLabel('CD_radius')).toEqual({ text: 'CD', isCornerSegment: true });
  });

  it('складна форма: суфікс знімається з літери вершини', () => {
    expect(edgeMarkerLabel('A_lcut1')).toEqual({ text: 'A', isCornerSegment: true });
    expect(edgeMarkerLabel('E_chamfer')).toEqual({ text: 'E', isCornerSegment: true });
  });

  it('службові ребра лишаються без підпису — вигадане ім’я гірше за жодне', () => {
    expect(edgeMarkerLabel('close')).toEqual({ text: '', isCornerSegment: false });
    expect(edgeMarkerLabel('start')).toEqual({ text: '', isCornerSegment: false });
    expect(edgeMarkerLabel('edge-3')).toEqual({ text: '', isCornerSegment: false });
    expect(edgeMarkerLabel('close_chamfer')).toEqual({ text: '', isCornerSegment: true });
  });

  it('невідомий id не ламає підпис', () => {
    expect(edgeMarkerLabel('inner1')).toEqual({ text: 'inner1', isCornerSegment: false });
  });
});
