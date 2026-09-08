/**
 * Інструмент «Замір» v2 (07.09.2026, №126): 3D-DXF за ЗК-21/51/52, дублети
 * ЗК-11, кінці обходу ЗК-30, панель зі стіни ЗК-17/54, переріз ЗК-32,
 * лазер ЗК-25, хвиля ЗК-22, ZIP iCONtrades ЗК-1. Живі файли з кейсів у
 * репозиторій не кладемо (персональні дані) — фікстури синтетичні, але
 * повторюють структуру справжніх: `INSERT RAW-POINT` + вертикальна `LINE`,
 * `POLYLINE` з прапорцем 8 і `VERTEX` із z, назви шарів `\U+XXXX`.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { decodeDxfText, parseLeicaDxf, planContourOf } from '../measure/leicaDxf';
import {
  applyDoublets, findDoublets, laserHorizon, longestEdgeIndex, matchRaw, panelFromWall, PANEL_DEFAULTS,
  processPlanContour, rotateModel, rotationToAxisDeg, sectionAtHeight, stitchSegments, wallWave, waveStats,
  chainGaps, stitchStats, detectMarkChains, markSegmentIds,
} from '../measure/measureOps';
import { readMeasureZip } from '../measure/measureZip';

// ── Фікстури ──────────────────────────────────────────────────────────

function dxf(entities: string, acadver = 'AC1024'): string {
  return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', acadver, '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', entities.trim(), '0', 'ENDSEC', '0', 'EOF'].join('\n');
}
/** 3D-полілінія як у приладі: POLYLINE(70=8) + VERTEX(10/20/30) + SEQEND. */
function poly3(layer: string, pts: Array<[number, number, number]>, closed = false): string {
  const v = pts.map(([x, y, z]) => `0\nVERTEX\n8\n${layer}\n10\n${x}\n20\n${y}\n30\n${z}\n70\n32`).join('\n');
  return `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n${8 | (closed ? 1 : 0)}\n${v}\n0\nSEQEND\n8\n${layer}\n`;
}
function rawPoint(x: number, y: number, z: number, label?: string, quality?: number): string {
  let s = `0\nINSERT\n8\nСырые измерения\n2\nRAW-POINT\n10\n${x}\n20\n${y}\n30\n${z}\n41\n25\n42\n25\n43\n25\n`;
  s += `0\nLINE\n8\nСырые измерения\n10\n${x}\n20\n${y}\n30\n${z}\n11\n${x}\n21\n${y}\n31\n0\n`;
  if (label) s += `0\nTEXT\n8\nСырые измерения\n10\n${x}\n20\n${y + 12.5}\n30\n${z}\n1\n${label}\n`;
  if (quality !== undefined) s += `0\nTEXT\n8\nСырые измерения\n10\n${x}\n20\n${y + 56}\n30\n${z}\n1\n${String(quality).replace('.', ',')} mm\n`;
  return s;
}
function point(layer: string, x: number, y: number, z: number): string {
  return `0\nPOINT\n8\n${layer}\n10\n${x}\n20\n${y}\n30\n${z}\n`;
}

/**
 * Кімната 3000×2000: план на Layer 0 (відкритий контур із дублетом 6 мм
 * у куті (3000,0)), стіна «Стінова 1» уздовж y = 0 висотою 620 з обходом,
 * що починається й закінчується посеред низу (ЗК-30), розетка 200×65 на
 * z = 134…199, лазер на z ≈ 114, сирі точки з підписами.
 */
function room3d(): string {
  const plan = poly3('Layer 0', [[0, 0, 0], [1500, 0, 0], [2996, 0, 0], [3000, 4, 0], [3000, 2000, 0], [0, 2000, 0]]);
  const wall = poly3('Стінова 1', [
    [1200, 0, 1], [0, 0, 1], [3, 0, -3], [3, 0, 300], [3, 0, 612], [45, 0, 619], [1500, 0, 619], [2997, 0, 619], [3000, 0, 610], [3000, 0, 300], [3000, 0, 5], [1210, 0, 1],
  ]);
  const socket = poly3('Стінова 1', [[900, 0, 134], [1100, 0, 134], [1100, 0, 199], [900, 0, 199]], true);
  const laser = poly3('Лінія лазера', [[0, 0, 113.6], [3000, 0, 114.4]]);
  const raws = rawPoint(0, 0, 0, 'RAW_P_001', 28.2) + rawPoint(1500, 0, 12, 'RAW_P_002') + rawPoint(1500, 3, 300, 'RAW_P_003')
    + rawPoint(1500, 25, 500, 'RAW_P_004') + rawPoint(3000, 2000, -2, 'RAW_P_005');
  return dxf(plan + wall + socket + laser + raws);
}

describe('parseLeicaDxf — 3D (ЗК-21, ЗК-51, ЗК-52)', () => {
  it('ЗМ-Т19: декодує \\U+XXXX і #UXXXX у назвах', () => {
    expect(decodeDxfText('\\U+0421\\U+0442\\U+0456\\U+043D\\U+043E\\U+0432\\U+0430 1')).toBe('Стінова 1');
    expect(decodeDxfText('#U041f#U0440#U043e#U0435#U043a#U0442 1_3D.dxf')).toBe('Проект 1_3D.dxf');
  });

  it('упізнає 3D: сирі точки з підписами, вертикальні опускання геть, площина стіни з розеткою, лазер', () => {
    const m = parseLeicaDxf(room3d(), 'Проект 1_3D.dxf');
    expect(m.variant).toBe('3d');
    expect(m.acadVersion).toBe('AC1024');
    expect(m.rawPoints).toHaveLength(5);
    expect(m.rawPoints[0].label).toBe('RAW_P_001');
    expect(m.rawPoints[0].qualityMm).toBeCloseTo(28.2, 6);
    expect(m.verticalDrops).toBe(5);
    expect(m.walls).toHaveLength(1);
    const w = m.walls[0];
    expect(w.layer).toBe('Стінова 1');
    expect(w.uMax - w.uMin).toBeCloseTo(3000, 3);
    expect(w.zMax).toBeCloseTo(619, 6);
    expect(w.planeRmsMm).toBeLessThan(1e-6);
    expect(w.sockets).toHaveLength(1);
    expect(w.sockets[0].uMax - w.sockets[0].uMin).toBeCloseTo(200, 6);
    expect(w.sockets[0].zMin).toBeCloseTo(134, 6);
    expect(m.laser?.spreadMm).toBeCloseTo(0.8, 6);
    expect(m.laser?.zMean).toBeCloseTo(114, 6);
    // контур стіни на план не проєктується «туди-назад» — лише слід uMin→uMax
    expect(m.segments.filter((s) => s.layer === 'Стінова 1')).toHaveLength(1);
    expect(m.polylines.map((p) => p.role).sort()).toEqual(['laser', 'plan', 'socket', 'wall']);
  });

  it('AC1018: назви шарів з escape, сирі точки як POINT', () => {
    const src = dxf(poly3('\\U+0421\\U+0442\\U+0456\\U+043D\\U+043E\\U+0432\\U+0430 2', [[0, 0, 1], [0, 0, 620], [1900, 0, 620], [1900, 0, 1]]) + point('Layer 0', 10, 10, -5) + point('Layer 0', 20, 10, 3), 'AC1018');
    const m = parseLeicaDxf(src);
    expect(m.layers).toContain('Стінова 2');
    expect(m.walls[0].layer).toBe('Стінова 2');
    expect(m.rawPoints).toHaveLength(2);
    expect(m.rawPoints[0].source).toBe('point');
  });

  it('ЗК-53: вершини плану = сирі точки; дублет — ні', () => {
    const m = parseLeicaDxf(room3d());
    const plan = planContourOf(m)!;
    expect(plan.layer).toBe('Layer 0');
    const match = matchRaw(plan.points, m.rawPoints, 0.05);
    expect(match[0].raw?.label).toBe('RAW_P_001');
    expect(match[1].raw?.label).toBe('RAW_P_002');
    expect(match[2].raw).toBeUndefined();
  });
});

describe('measureOps — план (ЗК-10…15)', () => {
  const pts = [{ x: 0, y: 0 }, { x: 1500, y: 0 }, { x: 2996, y: 0 }, { x: 3000, y: 4 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }];

  it('ЗК-11: дублет 5,7 мм у куті → перетин (3000, 0); проміжна точка 1500 не чіпається (ЗК-13)', () => {
    const d = findDoublets(pts, 20, false);
    expect(d).toHaveLength(1);
    expect(d[0].i).toBe(2);
    expect(d[0].count).toBe(2);
    expect(d[0].intersection?.x).toBeCloseTo(3000, 6);
    expect(d[0].intersection?.y).toBeCloseTo(0, 6);
    const r = applyDoublets(pts, d);
    expect(r.replaced).toBe(1);
    expect(r.points).toHaveLength(5);
    expect(r.points[1]).toEqual({ x: 1500, y: 0 });
    expect(r.provenance[2]).toEqual({ index: 2, kind: 'intersection', from: [2, 3] });
  });

  it('ЗК-11: триплет у куті (три точки в 8 мм) — один перетин', () => {
    const tri = [{ x: 0, y: 143 }, { x: 0, y: 7 }, { x: 1, y: 0 }, { x: 3, y: 0 }, { x: 691, y: 1 }, { x: 691, y: 600 }, { x: 0, y: 600 }];
    const d = findDoublets(tri, 20, true);
    const corner = d.find((x) => x.i === 1);
    expect(corner?.count).toBe(3);
    expect(corner?.intersection?.x).toBeCloseTo(0, 0);
    expect(corner?.intersection?.y).toBeCloseTo(0, 0);
    const r = applyDoublets(tri, d);
    expect(r.points).toHaveLength(tri.length - 2 - (d.length - 1));
  });

  it('ЗК-13: короткий крок на прямій (не кут) — не дублет', () => {
    const step = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1010, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 500 }];
    expect(findDoublets(step, 20, false)).toHaveLength(0);
  });

  it('ЗК-14: контур після дублетів лишається відкритим; провенанс — кожна вершина знає сиру (ЗК-31)', () => {
    const m = parseLeicaDxf(room3d());
    const pc = processPlanContour(planContourOf(m)!, 20);
    expect(pc.closed).toBe(false);
    expect(pc.replaced).toBe(1);
    expect(pc.provenance.filter((p) => p.kind === 'raw')).toHaveLength(4);
  });

  it('ЗК-15: зшивання з порогом 5 мм замикає розсипану нішу', () => {
    const seg = (id: string, a: [number, number], b: [number, number]) => ({ id, layer: 'Layer 0', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });
    const segs = [seg('a', [0, 0], [500, 0]), seg('b', [503, 2], [500, 300]), seg('c', [500, 304], [0, 300]), seg('d', [-3, 297], [0, 3])];
    expect(stitchSegments(segs, 1.5).filter((c) => c.closed)).toHaveLength(0);
    const st = stitchSegments(segs, 5);
    expect(st).toHaveLength(1);
    expect(st[0].closed).toBe(true);
  });

  it('ЗК-10: доворот по найдовшому ребру — увесь замір, стіни перераховуються', () => {
    const tilted = [{ x: 0, y: 0 }, { x: 2999.99, y: -7.07 }, { x: 3000, y: 2000 }];
    const li = longestEdgeIndex(tilted, false);
    expect(li).toBe(0);
    expect(rotationToAxisDeg(tilted[0], tilted[1])).toBeCloseTo(0.135, 2);
    const m = parseLeicaDxf(room3d());
    const r = rotateModel(m, 90);
    expect(r.walls).toHaveLength(1);
    expect(r.ops[0]).toContain('доворот');
    expect(Math.abs(r.walls[0].dir.x)).toBeLessThan(1e-6);
    expect(r.rawPoints[1].y).toBeCloseTo(1500, 6);
  });
});

describe('measureOps — 3D (ЗК-17, ЗК-22, ЗК-25, ЗК-30, ЗК-32, ЗК-54)', () => {
  const model = parseLeicaDxf(room3d());

  it('ЗК-30/54: панель зі стіни — кінці обходу геть, дублети → кути, база −43, розетка з висотою', () => {
    const p = panelFromWall(model.walls[0], PANEL_DEFAULTS);
    expect(p.droppedEnds).toBe(2);
    // 10 вершин обходу − 3 дублети = 7: чотири кути + три проміжні точки (ЗК-13 — їх не чіпаємо)
    expect(p.polygon).toHaveLength(7);
    expect(p.doubletsReplaced).toBe(3);
    expect(Math.abs(p.widthMm - 3000)).toBeLessThan(4); // ліві кути — перетини ліній через (3,·), тож ≈ 2997
    expect(Math.abs(p.heightMm - 620)).toBeLessThan(3);
    expect(p.angles.every((a) => a !== undefined && (Math.abs(a - 90) < 0.6 || Math.abs(a - 180) < 0.6))).toBe(true);
    expect(p.angles.filter((a) => a !== undefined && Math.abs(a - 90) < 0.6)).toHaveLength(4);
    expect(p.socketCount).toBe(1);
    expect(p.sockets[0].vMin).toBeCloseTo(134 - 43, 6);
    expect(p.sockets[0].uMin).toBeCloseTo(900 - 3, 0);
    expect(p.baseZ).toBe(43);
  });

  it('ЗК-54: нуль «підлога» і своє число міняють базу панелі', () => {
    expect(panelFromWall(model.walls[0], { ...PANEL_DEFAULTS, zeroMode: 'custom', zZeroMm: 100, baseMm: 43 }).sockets[0].vMin).toBeCloseTo(134 - 143, 6);
    expect(panelFromWall(model.walls[0], { ...PANEL_DEFAULTS, zeroMode: 'floor', baseMm: 900 }).sockets[0].vMin).toBeCloseTo(134 - 900, 6);
  });

  it('ЗК-32: переріз на висоті — відрізок у площині стіни між її краями', () => {
    const sec = sectionAtHeight(model, 300);
    expect(sec).toHaveLength(1);
    expect(Math.abs(sec[0].b.x - sec[0].a.x)).toBeCloseTo(2997, 0);
    expect(sec[0].a.y).toBeCloseTo(0, 6);
    expect(sectionAtHeight(model, 900)).toHaveLength(0);
  });

  it('ЗК-25/34: горизонт по лазеру — розкид 0,8 мм і нахил у площині стіни', () => {
    const h = laserHorizon(model)!;
    expect(h.spreadMm).toBeCloseTo(0.8, 6);
    expect(h.perWall).toHaveLength(1);
    expect(h.perWall[0].mmPerM).toBeCloseTo(0.8 / 3, 3);
  });

  it('ЗК-22/33: карта хвилі — сирі точки біля стіни з відхиленням; поріг рахує «поза»', () => {
    const w = wallWave(model, 60);
    const devs = w.map((s) => Math.round(s.devMm));
    expect(devs).toContain(3);
    expect(devs).toContain(25);
    const st = waveStats(w, 10);
    expect(st.over).toBe(1);
    expect(st.maxMm).toBeCloseTo(25, 6);
  });
});

describe('readMeasureZip — ZIP iCONtrades (ЗК-1, ЗМ-Т22)', () => {
  it('розкладає пари 2D/3D по проєктах, панораму — до свого проєкту, декодує #U-імена', async () => {
    const zip = new JSZip();
    const root = 'iCONtrades_81-0000000 #U0422#U0435#U0441#U0442_Exports/';
    zip.file(root + '#U041f#U0440#U043e#U0435#U043a#U0442 1_3D.dxf', room3d());
    zip.file(root + '#U041f#U0440#U043e#U0435#U043a#U0442 1_2D.dxf', dxf(''));
    zip.file(root + '#U041f#U0440#U043e#U0435#U043a#U0442 1_Panorama/panorama.jpg', new Uint8Array([1, 2, 3]));
    zip.file(root + 'Острів_3D.dxf', dxf(''));
    const buf = await zip.generateAsync({ type: 'uint8array' });
    const r = await readMeasureZip(buf, 'test.zip');
    expect(r.projects.map((p) => p.name)).toEqual(['Острів', 'Проект 1']);
    const p1 = r.projects.find((p) => p.name === 'Проект 1')!;
    expect(p1.dxf3d?.path).toContain('Проект 1_3D.dxf');
    expect(p1.dxf2d).toBeDefined();
    expect(p1.panorama).toHaveLength(1);
    expect(parseLeicaDxf(p1.dxf3d!.text).walls).toHaveLength(1);
  });
});

describe('ЗК-15: зшивання — монотонність і розриви (№129)', () => {
  // Чотири шматки прямокутника 1000×600 із розривами 3 і 14 мм — так само,
  // як у 81-1430086, де зазори лягають двома купками (2,4…4,8 і 12,3…42,8).
  const seg = (id: string, a: [number, number], b: [number, number]) => ({ id, layer: 'External', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });
  const pieces = [
    seg('s1', [0, 0], [1000, 0]),
    seg('s2', [1003, 0], [1000, 600]),      // розрив 3 мм
    seg('s3', [1000, 614], [0, 600]),       // розрив 14 мм
    seg('s4', [0, 597], [0, 3]),            // розриви 3 і 3 мм
  ];

  it('поріг ловить лише свою купку розривів', () => {
    expect(stitchSegments(pieces, 1.5)).toHaveLength(4);
    // поріг 5 закриває три розриви по 3 мм — лишається один контур,
    // ще розірваний на 14 мм, тому НЕ замкнений
    const five = stitchSegments(pieces, 5);
    expect(five).toHaveLength(1);
    expect(five[0].closed).toBe(false);
    expect(five[0].points).toHaveLength(5);
    // поріг 20 добирає останні 14 мм — контур замикається
    expect(stitchSegments(pieces, 20)[0].closed).toBe(true);
  });

  it('монотонність: більший поріг НІКОЛИ не дає більше ланцюгів (баг №129)', () => {
    let prev = Infinity;
    for (const tol of [1.5, 3, 5, 8, 10, 13, 16, 20, 30, 45]) {
      const n = stitchStats(pieces, tol).chains;
      expect(n).toBeLessThanOrEqual(prev);
      prev = n;
    }
  });

  it('розриви показуються з реальною відстанню і без дублів пар', () => {
    const g = chainGaps(stitchSegments(pieces, 1.5));
    expect(g.map((x) => Math.round(x.distMm))).toEqual([3, 3, 3, 14]);
    expect(g.every((x) => x.fromChain !== x.toChain)).toBe(true);
  });
});

describe('ЗК-16 / МТ-1: мітки монтажника «М» і «В» — не геометрія (№130)', () => {
  const seg = (id: string, a: [number, number], b: [number, number]) => ({ id, layer: 'External', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });
  // Стіна 4 м, поруч літера «М» чотирма штрихами в коробці 200×250 і
  // перегородка тумби — одинокий прямий відрізок 312 мм (не мітка!).
  const wall = [seg('w1', [0, 0], [4000, 0]), seg('w2', [4000, 0], [4000, 600])];
  const letterM = [
    seg('m1', [900, 100], [917, 350]),
    seg('m2', [920, 355], [1010, 220]),
    seg('m3', [1014, 216], [1100, 350]),
    seg('m4', [1104, 354], [1120, 105]),
  ];
  const divider = [seg('d1', [2000, 0], [2000, 312])];

  it('ловить літеру і не чіпає ані стіну, ані одинокий відрізок', () => {
    const chains = stitchSegments([...wall, ...letterM, ...divider], 1.5);
    const marks = detectMarkChains(chains);
    const markSegs = markSegmentIds(chains, marks);
    expect([...markSegs].sort()).toEqual(['m1', 'm2', 'm3', 'm4']);
    // перегородка і стіна лишаються геометрією
    const geom = [...wall, ...letterM, ...divider].filter((s) => !markSegs.has(s.id));
    expect(geom.map((s) => s.id).sort()).toEqual(['d1', 'w1', 'w2']);
  });

  it('без міток розриви рахуються тільки по геометрії', () => {
    const all = stitchSegments([...wall, ...letterM, ...divider], 1.5);
    const marks = detectMarkChains(all);
    const geomChains = all.filter((c) => !marks.has(c.id));
    // усередині літери три розриви по 4–5 мм — вони більше не в списку
    expect(chainGaps(all).some((g) => g.distMm < 6)).toBe(true);
    expect(chainGaps(geomChains).every((g) => g.distMm > 6)).toBe(true);
  });
});
