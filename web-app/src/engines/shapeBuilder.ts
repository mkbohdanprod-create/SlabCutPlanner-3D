import * as THREE from 'three';
import type { DetailDraft } from '../components/forms/utils/draftHelpers';
import { cutoutCenter } from '../domain/cutoutAnchor';
import { anchorContextFor } from '../domain/elementToDetail';
import { applyUCutout } from '../domain/uCutout';
import { edgeNamedContour, curvedContour } from '../domain/baseContour';
import type { UCutoutSpec } from '../domain/uCutout';
import type { Point } from '../domain/types';

/**
 * FG-11 ДЛЯ 3D: обробка кута не може з'їсти більше, ніж є ребра.
 *
 * Розкрій це правило вже знає (geometry.buildComplexPolygonPoints), а 3D
 * читав радіуси як є: два радіуси по 450 на стороні 900 давали нульове
 * ребро, а більші — самоперетин контуру, і «математика ламалась» рівно
 * так, як показала фокус-група. Правило те саме, що в розкрої: два сусідні
 * вторгнення на одному ребрі стискаються пропорційно; радіус після
 * стискання бере мінімум зі своїх двох напрямків, щоб дуга лишилась дугою.
 *
 * Кути шукаються за id точки — і для прямокутника (DA/AB/…), і для
 * складних форм (start/A/…) це той самий ключ, яким кут записано.
 */
function clampCornersToPoints(
  corners: Record<string, any>,
  points: Array<{ id?: string; x: number; y: number }>,
): Record<string, any> {
  const len = points.length;
  if (len < 3 || !Object.keys(corners).length) return corners;

  const edgeLen: number[] = new Array(len);
  for (let i = 0; i < len; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % len];
    edgeLen[i] = Math.hypot(b.x - a.x, b.y - a.y);
  }

  const effPrev: number[] = new Array(len).fill(0);
  const effNext: number[] = new Array(len).fill(0);
  for (let i = 0; i < len; i += 1) {
    const c = corners[points[i].id || ''];
    if (!c) continue;
    if (c.type === 'radius') {
      effPrev[i] = effNext[i] = Math.max(0, c.radius || 0);
    } else if (c.type === 'chamfer' || c.type === 'l-cut') {
      effPrev[i] = Math.max(0, c.sizeB || 0);
      effNext[i] = Math.max(0, c.sizeC || 0);
    }
  }
  for (let i = 0; i < len; i += 1) {
    const j = (i + 1) % len;
    const a = effNext[i];
    const b = effPrev[j];
    const L = edgeLen[i];
    if (a + b <= L || a + b <= 0) continue;
    const k = L / (a + b);
    effNext[i] = a * k;
    effPrev[j] = b * k;
  }

  const out: Record<string, any> = { ...corners };
  for (let i = 0; i < len; i += 1) {
    const key = points[i].id || '';
    const c = corners[key];
    if (!c) continue;
    if (c.type === 'radius') {
      const r = Math.min(effPrev[i], effNext[i]);
      if (r !== (c.radius || 0)) out[key] = { ...c, radius: r };
    } else if (c.type === 'chamfer' || c.type === 'l-cut') {
      if (effPrev[i] !== (c.sizeB || 0) || effNext[i] !== (c.sizeC || 0)) {
        out[key] = { ...c, sizeB: effPrev[i], sizeC: effNext[i] };
      }
    }
  }
  return out;
}

export function buildDetailShape(detail: DetailDraft, points: any[], bounds: any) {
  const shape = new THREE.Shape();
    const edgeMap: Record<number, string> = {};

    /*
     * СИНХРОНІЗАЦІЯ МАПИ ІМЕН З РЕАЛЬНИМ МАСИВОМ КРИВИХ (ремонт 19.08).
     *
     * Стара мапа рахувала «одна крива на виклик» власним лічильником. Але
     * THREE.Path.absellipse нишком вставляє з'єднувальний відрізок, коли
     * кінець попередньої кривої не збігається з початком дуги ДО ОСТАННЬОГО
     * БІТА — а при неквадратних габаритах (нормалізація по X і Y різна)
     * float це гарантує. Кожна така вставка зсувала ВСІ подальші імена на
     * одне: дуга ставала «стороною D», сторона F — «дугою», і половина
     * ребер втрачала маркери. Тому індекс завжди читається з
     * shape.curves.length, а службові вставки лишаються безіменними — їх
     * відфільтровує перевірка item.id.
     */
    const addLine = (id: string, x: number, y: number) => {
      // Вироджене ребро (обробка кута з'їла сторону повністю): не емітимо —
      // нульовий відрізок отримував маркер і кріплення з кутом atan2(0,0),
      // і додане на нього доповнення малювалось «планкою в повітрі».
      const cur = shape.currentPoint;
      if (cur && Math.abs(cur.x - x) < 1e-6 && Math.abs(cur.y - y) < 1e-6) return;
      shape.lineTo(x, y);
      edgeMap[shape.curves.length - 1] = id;
    };
    const addEllipse = (
      id: string,
      x: number,
      y: number,
      xRadius: number,
      yRadius: number,
      aStartAngle: number,
      aEndAngle: number,
      aClockwise: boolean,
      aRotation: number,
    ) => {
      shape.absellipse(
        x,
        y,
        xRadius,
        yRadius,
        aStartAngle,
        aEndAngle,
        aClockwise,
        aRotation,
      );
      // Ім'я — САМІЙ дузі (останній кривій), а не позиції лічильника:
      // absellipse міг щойно вставити безіменний з'єднувальний відрізок.
      edgeMap[shape.curves.length - 1] = id;
    };

    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;

    // Helper to get mapped coordinates
    const getCoords = (p: { x: number; y: number }) => ({
      nx: (p.x - bounds.minX) / (w || 1),
      ny: (p.y - bounds.minY) / (h || 1),
    });

    const corners = clampCornersToPoints(detail.corners || {}, points);

    /**
     * Довільний контур має пріоритет над `kind`. Деталь із `customPoints`
     * лишається `rect` за типом (це та сама обшивка подіуму), але форма в неї
     * П-подібна — ніша під дрова ріжеться до підлоги. Без цієї перевірки
     * гілка нижче будувала прямокутник, і виріз просто зникав.
     */
    const hasCustomContour = Boolean(
      (detail as { customPoints?: unknown[] }).customPoints?.length
      || (detail as { geometry?: { customPoints?: unknown[] } }).geometry?.customPoints?.length
      // Ніша (крок 4.4) теж робить контур довільним, хоч `kind` лишається
      // `rect`. Без цього рядка гілка прямокутника малювала б деталь цілою,
      // і ніша була б у розкрої, але не в 3D.
      || (detail as { uCutout?: unknown }).uCutout,
    );

    /*
     * МАРШРУТИЗАЦІЯ (ремонт 19.08). Раніше довільний контур ішов «простою»
     * гілкою без логіки кутів — радіуси на деталі з нішею мовчки зникали.
     * Тепер:
     *   · непалігональні форми (коло, овал) — проста гілка, як і були;
     *   · чистий прямокутник — своя гілка (імена кутів AB/BC/…);
     *   · усе інше, ВКЛЮЧНО з довільним контуром і нішею, — загальна
     *     гілка з обробкою кутів: кути шукаються за id точки, тож радіуси
     *     Г-форми переживають нішу.
     */
    if (!hasCustomContour && detail.kind !== "rect" && detail.kind !== "l" && detail.kind !== "u") {
      points.forEach((p, i) => {
        const { nx, ny } = getCoords(p);
        if (i === 0) shape.moveTo(nx, ny);
        else addLine(p.id || `edge-${i}`, nx, ny);
      });
      // Замикальне ребро (остання → перша) — явною лінією з іменем за
      // угодою (closeId ?? id першої), як у гілках прямокутника й полігона.
      // Без нього остання хорда кола не мала кривої в edgeMap і різак
      // торця на стороні D зупинявся за одну хорду до кінця.
      if (points.length > 2) {
        const first = points[0];
        const { nx, ny } = getCoords(first);
        addLine(first.closeId || first.id || 'close', nx, ny);
      }
    } else if (detail.kind === "rect" && !hasCustomContour) {
        const cornerDA = corners["DA"];
        const cornerAB = corners["AB"];
        const cornerBC = corners["BC"];
        const cornerCD = corners["CD"];

        const rDA = cornerDA?.type === "radius" ? cornerDA.radius || 0 : 0;
        const rAB = cornerAB?.type === "radius" ? cornerAB.radius || 0 : 0;
        const rBC = cornerBC?.type === "radius" ? cornerBC.radius || 0 : 0;
        const rCD = cornerCD?.type === "radius" ? cornerCD.radius || 0 : 0;

        // Bottom edge (DA to AB)
        shape.moveTo(0 + rDA / w, 0);

        if (cornerAB?.type === "chamfer") {
          addLine("A", 1 - (cornerAB.sizeB || 0) / w, 0);
          addLine("AB_chamfer", 1, (cornerAB.sizeC || 0) / h);
        } else if (cornerAB?.type === "l-cut") {
          addLine("A", 1 - (cornerAB.sizeB || 0) / w, 0);
          addLine(
            "AB_lcut1",
            1 - (cornerAB.sizeB || 0) / w,
            (cornerAB.sizeC || 0) / h,
          );
          addLine("AB_lcut2", 1, (cornerAB.sizeC || 0) / h);
        } else if (rAB > 0) {
          addLine("A", 1 - rAB / w, 0);
          addEllipse(
            "AB_radius",
            1 - rAB / w,
            rAB / h,
            rAB / w,
            rAB / h,
            -Math.PI / 2,
            0,
            false,
            0,
          );
        } else {
          addLine("A", 1, 0);
        }

        // Right edge (AB to BC)
        if (cornerBC?.type === "chamfer") {
          addLine("B", 1, 1 - (cornerBC.sizeB || 0) / h);
          addLine("BC_chamfer", 1 - (cornerBC.sizeC || 0) / w, 1);
        } else if (cornerBC?.type === "l-cut") {
          addLine("B", 1, 1 - (cornerBC.sizeB || 0) / h);
          addLine(
            "BC_lcut1",
            1 - (cornerBC.sizeC || 0) / w,
            1 - (cornerBC.sizeB || 0) / h,
          );
          addLine("BC_lcut2", 1 - (cornerBC.sizeC || 0) / w, 1);
        } else if (rBC > 0) {
          addLine("B", 1, 1 - rBC / h);
          addEllipse(
            "BC_radius",
            1 - rBC / w,
            1 - rBC / h,
            rBC / w,
            rBC / h,
            0,
            Math.PI / 2,
            false,
            0,
          );
        } else {
          addLine("B", 1, 1);
        }

        // Top edge (BC to CD)
        if (cornerCD?.type === "chamfer") {
          addLine("C", (cornerCD.sizeB || 0) / w, 1);
          addLine("CD_chamfer", 0, 1 - (cornerCD.sizeC || 0) / h);
        } else if (cornerCD?.type === "l-cut") {
          addLine("C", (cornerCD.sizeB || 0) / w, 1);
          addLine(
            "CD_lcut1",
            (cornerCD.sizeB || 0) / w,
            1 - (cornerCD.sizeC || 0) / h,
          );
          addLine("CD_lcut2", 0, 1 - (cornerCD.sizeC || 0) / h);
        } else if (rCD > 0) {
          addLine("C", 0 + rCD / w, 1);
          addEllipse(
            "CD_radius",
            rCD / w,
            1 - rCD / h,
            rCD / w,
            rCD / h,
            Math.PI / 2,
            Math.PI,
            false,
            0,
          );
        } else {
          addLine("C", 0, 1);
        }

        // Left edge (CD to DA)
        if (cornerDA?.type === "chamfer") {
          addLine("D", 0, (cornerDA.sizeB || 0) / h);
          addLine("DA_chamfer", (cornerDA.sizeC || 0) / w, 0);
        } else if (cornerDA?.type === "l-cut") {
          addLine("D", 0, (cornerDA.sizeB || 0) / h);
          addLine(
            "DA_lcut1",
            (cornerDA.sizeC || 0) / w,
            (cornerDA.sizeB || 0) / h,
          );
          addLine("DA_lcut2", (cornerDA.sizeC || 0) / w, 0);
        } else if (rDA > 0) {
          addLine("D", 0, 0 + rDA / h);
          addEllipse(
            "DA_radius",
            rDA / w,
            rDA / h,
            rDA / w,
            rDA / h,
            Math.PI,
            Math.PI * 1.5,
            false,
            0,
          );
        } else {
          addLine("D", 0, 0);
        }
      } else {
        // Generic corner rendering for any axis-aligned polygon
        const len = points.length;
        if (len > 2) {
          // Move to the start point, but adjust if the first corner has a processing
          const startPt = points[0];
          const prevStartPt = points[len - 1];
          const nextStartPt = points[1];
          const { nx: sX, ny: sY } = getCoords(startPt);
          
          const sCorner = corners[startPt.id || ""] || {};
          if (sCorner.type === 'radius' || sCorner.type === 'chamfer' || sCorner.type === 'l-cut') {
             // For the first point, if it has a corner, we shouldn't just moveTo it, we must moveTo the start of its curve
             const { nx: psX, ny: psY } = getCoords(prevStartPt);
             const lenPrev = Math.hypot(psX - sX, psY - sY);
             const dirPrev = { x: (psX - sX) / (lenPrev || 1), y: (psY - sY) / (lenPrev || 1) };
             
             let sDist = 0;
             if (sCorner.type === 'radius') sDist = sCorner.radius || 0;
             if (sCorner.type === 'chamfer') sDist = sCorner.sizeB || 0;
             if (sCorner.type === 'l-cut') sDist = sCorner.sizeB || 0;
             
             shape.moveTo(sX + dirPrev.x * (sDist / w), sY + dirPrev.y * (sDist / h));
          } else {
             shape.moveTo(sX, sY);
          }

          for (let i = 0; i < len; i++) {
            const p = points[i];
            const pPrev = points[(i - 1 + len) % len];
            const pNext = points[(i + 1) % len];
            
            const corner = corners[p.id || ""] || {};
            const { nx: px, ny: py } = getCoords(p);
            const { nx: pxPrev, ny: pyPrev } = getCoords(pPrev);
            const { nx: pxNext, ny: pyNext } = getCoords(pNext);
            
            const lenPrev = Math.hypot(pxPrev - px, pyPrev - py);
            const lenNext = Math.hypot(pxNext - px, pyNext - py);
            
            const dirPrev = { x: (pxPrev - px) / (lenPrev || 1), y: (pyPrev - py) / (lenPrev || 1) };
            const dirNext = { x: (pxNext - px) / (lenNext || 1), y: (pyNext - py) / (lenNext || 1) };

            const edgeId = p.id || `edge-${i}`;

            if (corner.type === 'radius' && (corner.radius || 0) > 0) {
              const Rx = (corner.radius || 0) / w;
              const Ry = (corner.radius || 0) / h;
              
              const S = { x: px + dirPrev.x * Rx, y: py + dirPrev.y * Ry };
              const E = { x: px + dirNext.x * Rx, y: py + dirNext.y * Ry };
              const C = { x: px + dirPrev.x * Rx + dirNext.x * Rx, y: py + dirPrev.y * Ry + dirNext.y * Ry };
              
              // Only draw line to S if it's not the very first move (which is handled above)
              if (i !== 0) addLine(edgeId, S.x, S.y);
              
              const startAngle = Math.atan2((S.y - C.y) / Ry, (S.x - C.x) / Rx);
              const endAngle = Math.atan2((E.y - C.y) / Ry, (E.x - C.x) / Rx);
              const cross = (S.x - C.x) * (E.y - C.y) - (S.y - C.y) * (E.x - C.x);
              const clockwise = cross < 0;
              
              addEllipse(`${edgeId}_radius`, C.x, C.y, Rx, Ry, startAngle, endAngle, clockwise, 0);
            }
            else if (corner.type === 'chamfer') {
              const sizeB = corner.sizeB || 0;
              const sizeC = corner.sizeC || 0;
              const S = { x: px + dirPrev.x * (sizeB / w), y: py + dirPrev.y * (sizeB / h) };
              const E = { x: px + dirNext.x * (sizeC / w), y: py + dirNext.y * (sizeC / h) };
              
              if (i !== 0) addLine(edgeId, S.x, S.y);
              addLine(`${edgeId}_chamfer`, E.x, E.y);
            }
            else if (corner.type === 'l-cut') {
              const sizeB = corner.sizeB || 0;
              const sizeC = corner.sizeC || 0;
              const S = { x: px + dirPrev.x * (sizeB / w), y: py + dirPrev.y * (sizeB / h) };
              const E = { x: px + dirNext.x * (sizeC / w), y: py + dirNext.y * (sizeC / h) };
              const M = { x: px + dirPrev.x * (sizeB / w) + dirNext.x * (sizeC / w), y: py + dirPrev.y * (sizeB / h) + dirNext.y * (sizeC / h) };
              
              if (i !== 0) addLine(edgeId, S.x, S.y);
              addLine(`${edgeId}_lcut1`, M.x, M.y);
              addLine(`${edgeId}_lcut2`, E.x, E.y);
            }
            else {
              if (i !== 0) addLine(edgeId, px, py);
            }
          }
          
          // Close shape properly
          const lastPt = points[points.length - 1];
          const firstPt = points[0];
          const fCorner = corners[firstPt.id || ""] || {};
          let _endX = sX, _endY = sY;
          if (fCorner.type === 'radius') {
            _endX = sX + ((firstPt.x - lastPt.x) > 0 ? -1 : (firstPt.x - lastPt.x) < 0 ? 1 : 0) * ((fCorner.radius || 0) / w);
            _endY = sY + ((firstPt.y - lastPt.y) > 0 ? -1 : (firstPt.y - lastPt.y) < 0 ? 1 : 0) * ((fCorner.radius || 0) / h);
            // Actually, we can just let it close to the first moveTo coordinate
            // Wait, we already did shape.moveTo to the Start of the curve.
            // So if we just lineTo the Start of the curve, it will close perfectly!
            // The Start of the curve was calculated at the beginning!
          }
          
          // we don't need to explicitly close because shape.closePath() usually handles it?
          // Wait, Detail3DPreview uses a custom addLine function which maps id to points
          // Let's add a closing line to the initial moveTo point just in case.
          
          // Wait, if we just lineTo the start point, it's fine.
          // But we need the correct id for the closing edge!
          // The closing edge is from lastPt to firstPt.
          /*
           * Замикальне ребро: у розкладок Г/П ім'я лежить у closeId, у
           * довільного контуру (угода customPoints) — в id першої точки.
           * Раніше тут стояло голе "close", і замикальна сторона контуру
           * з нішею лишалась без імені — без кромки і без кріплень.
           */
          const closeId = firstPt.closeId || firstPt.id || "close";
          
          // Let's just find the start of the curve for the first point again
          const { nx: psX, ny: psY } = getCoords(points[len - 1]);
          const lenPrev = Math.hypot(psX - sX, psY - sY);
          const dirPrev = { x: (psX - sX) / (lenPrev || 1), y: (psY - sY) / (lenPrev || 1) };
          let sDist = 0;
          if (fCorner.type === 'radius') sDist = fCorner.radius || 0;
          if (fCorner.type === 'chamfer') sDist = fCorner.sizeB || 0;
          if (fCorner.type === 'l-cut') sDist = fCorner.sizeB || 0;
          
          addLine(closeId, sX + dirPrev.x * (sDist / w), sY + dirPrev.y * (sDist / h));
        }
    }

    if (detail.cutouts) {
      Object.values(detail.cutouts).forEach((cutout) => {
        // Прив'язку рахує спільний резолвер — той самий, яким користується
        // розкрій. Раніше тут жила власна копія математики, і вона мовчки не
        // працювала: точки контуру не несуть імен кутів, тому пошук bindCorner
        // ніколи не знаходив кут і виріз лягав від початку координат.
        const { cx: absX, cy: absY } = cutoutCenter(cutout, anchorContextFor(detail as never));
        const cx = (absX - bounds.minX) / (w || 1);
        const cy = (absY - bounds.minY) / (h || 1);

        /*
         * №156 (власник 08.09): «вводимо кут у градусах» — виріз і чаша мийки
         * можуть стояти під кутом. Повертати вже НОРМОВАНИЙ шлях не можна:
         * x нормується шириною, y — висотою, і прямокутник перекосило б.
         * Тому повернутий виріз малюємо полігоном у міліметрах навколо його
         * центру і нормуємо кожну точку окремо. Порядок обходу той самий, що
         * й у неповернутого — від нього залежить, чи THREE вважає шлях діркою.
         */
        const rotDeg = (cutout as { rotation?: number }).rotation ?? 0;
        const rot = (rotDeg * Math.PI) / 180;

        const hole = new THREE.Path();
        if (cutout.shape === "rect" && Math.abs(rotDeg) > 0.01) {
          const cwMm = cutout.width || 0;
          const chMm = cutout.height || 0;
          const rMm = Math.max(0, Math.min(cutout.cornerRadius || 0, cwMm / 2, chMm / 2));
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          const put = (mmX: number, mmY: number, first: boolean) => {
            const rx = mmX * cos - mmY * sin;
            const ry = mmX * sin + mmY * cos;
            const nx = (absX + rx - bounds.minX) / (w || 1);
            const ny = (absY + ry - bounds.minY) / (h || 1);
            if (first) hole.moveTo(nx, ny); else hole.lineTo(nx, ny);
          };
          const hw = cwMm / 2;
          const hh = chMm / 2;
          const SEG = 6;
          // Кути за годинниковою стрілкою у координатах деталі: (-,-) → (-,+) →
          // (+,+) → (+,-). Дуга кута — SEG відрізків; при r = 0 виходить
          // звичайний прямокутник без зайвих гілок у коді.
          const corners: Array<{ cx: number; cy: number; from: number }> = [
            { cx: -hw + rMm, cy: -hh + rMm, from: Math.PI * 1.5 },
            { cx: -hw + rMm, cy: hh - rMm, from: Math.PI },
            { cx: hw - rMm, cy: hh - rMm, from: Math.PI / 2 },
            { cx: hw - rMm, cy: -hh + rMm, from: 0 },
          ];
          let first = true;
          corners.forEach(({ cx: ccx, cy: ccy, from }) => {
            for (let i = 0; i <= SEG; i += 1) {
              // Обхід за годинниковою — кут спадає.
              const a = from - (Math.PI / 2) * (i / SEG);
              put(ccx + Math.cos(a) * rMm, ccy + Math.sin(a) * rMm, first);
              first = false;
            }
          });
          hole.closePath();
        } else if (cutout.shape === "circle") {
          const cr = (cutout.radius || 0) / w;
          // true means clockwise
          hole.absarc(cx, cy, cr, 0, Math.PI * 2, true);
        } else if (cutout.shape === "rect") {
          const cw = (cutout.width || 0) / w;
          const ch = (cutout.height || 0) / h;
          const rad = cutout.cornerRadius || 0;
          const rx = Math.min(rad / w, cw / 2);
          const ry = Math.min(rad / h, ch / 2);

          // Draw hole in clockwise direction to ensure THREE.js recognizes it as a hole
          if (rad > 0) {
            hole.moveTo(cx - cw / 2 + rx, cy - ch / 2);
            hole.absellipse(
              cx - cw / 2 + rx,
              cy - ch / 2 + ry,
              rx,
              ry,
              Math.PI * 1.5,
              Math.PI,
              true,
              0,
            );
            hole.lineTo(cx - cw / 2, cy + ch / 2 - ry);
            hole.absellipse(
              cx - cw / 2 + rx,
              cy + ch / 2 - ry,
              rx,
              ry,
              Math.PI,
              Math.PI / 2,
              true,
              0,
            );
            hole.lineTo(cx + cw / 2 - rx, cy + ch / 2);
            hole.absellipse(
              cx + cw / 2 - rx,
              cy + ch / 2 - ry,
              rx,
              ry,
              Math.PI / 2,
              0,
              true,
              0,
            );
            hole.lineTo(cx + cw / 2, cy - ch / 2 + ry);
            hole.absellipse(
              cx + cw / 2 - rx,
              cy - ch / 2 + ry,
              rx,
              ry,
              0,
              -Math.PI / 2,
              true,
              0,
            );
            hole.lineTo(cx - cw / 2 + rx, cy - ch / 2);
          } else {
            hole.moveTo(cx - cw / 2, cy - ch / 2);
            hole.lineTo(cx - cw / 2, cy + ch / 2);
            hole.lineTo(cx + cw / 2, cy + ch / 2);
            hole.lineTo(cx + cw / 2, cy - ch / 2);
            hole.lineTo(cx - cw / 2, cy - ch / 2);
          }
        }
        shape.holes.push(hole);
      });
    }

    return { shape, edgeMap, curves: shape.curves };
  
  
  return { shape, edgeMap, curves: shape.curves };
}

/**
 * Контур деталі, заданий НЕ параметрами форми, а точками.
 *
 * Два джерела, і порядок між ними важливий:
 *   1. `customPoints` — «сира» форма з імпорту DXF або шаблону; вона
 *      головніша, бо там точки і є єдиною правдою про деталь;
 *   2. `uCutout` — П-подібна ніша (крок 4.4). Зберігається параметрами,
 *      контур виводиться щоразу, тому ніша переживає зміну габариту.
 *
 * ЄДИНЕ місце цієї логіки. Раніше вона жила лише в `elementToDetail`, на
 * межі «редактор → розкрій», тому ніша була в розкрої, але не в 3D:
 * рендер бачив чернетку з `uCutout` і малював прямокутник.
 */
export function contourPointsFor(detail: {
  customPoints?: Point[];
  uCutout?: UCutoutSpec;
  kind?: string;
  width?: number;
  height?: number;
  diameter?: number;
  ellipseWidth?: number;
  ellipseHeight?: number;
}): Point[] | undefined {
  if (detail.customPoints?.length) return detail.customPoints;
  // Коло й овал (01.09): контур із квадрантами A–D — інакше всі копії
  // «точок деталі» падали в гілку прямокутника і кругла стільниця в 3D
  // та на кресленні була прямокутною.
  const curved = curvedContour(detail);
  if (curved) return curved;
  if (!detail.uCutout) return undefined;
  // РЕМОНТ 19.08: ніша вставляється в РЕАЛЬНИЙ базовий контур форми
  // (rect/Г/П), а не в прямокутник із габариту — інакше Г-подібна деталь
  // мовчки перетворювалась на прямокутну з нішею.
  const base = edgeNamedContour(detail as never);
  if (!base) return undefined;
  return applyUCutout(base, detail.uCutout);
}

export function getDetailPointsAndBounds(detail: DetailDraft) {
  const getPoints = () => {

    let pts = contourPointsFor(detail) || [];
    if (pts.length > 0) return pts;

    let width = detail.width || 1000;
    let height = detail.height || 600;

    if (detail.kind === "l") {
      width = detail.outerWidth || 1200;
      height = detail.outerHeight || 1200;
      const iw = detail.innerHorizontal || 600;
      const ih = detail.innerVertical || 600;
            if (detail.mirrorL) {
        /* ЛІВА Г (26.08): виріз ліворуч — обхід BL, як у lShapePoints
           рушія. Літери йдуть за обходом, тому в лівої B — повна права
           сторона, E — внутрішня горизонталь вирізу, F — коротка ліва.
           На кресленні (y вниз) виріз опиняється внизу ліворуч. */
        return [
          { id: "start", closeId: "F", x: 0, y: 0 },
          { id: "A", x: width, y: 0 },
          { id: "B", x: width, y: height },
          { id: "C", x: iw, y: height },
          { id: "D", x: iw, y: height - ih },
          { id: "E", x: 0, y: height - ih },
        ];
      }
      return [
        // Сторони Г-подібної названі буквами A..F — так само, як у
        // редакторі, у списку сторін і в ключах доповнень (`leg_A`,
        // `wall_panel_F`). Доти тут жила стара нотація AB/inner/CD/DA,
        // і жодне доповнення на Г-подібній не знаходило свого ребра.
        { id: "start", closeId: "F", x: 0, y: 0 },
        { id: "A", x: width, y: 0 },
        { id: "B", x: width, y: height - ih },
        { id: "C", x: iw, y: height - ih },
        { id: "D", x: iw, y: height },
        { id: "E", x: 0, y: height },
      ];
    }

    if (detail.kind === "u") {
      width = detail.width || 2400;
      height = detail.height || 1200;
      const leftH = detail.leftLegHeight ?? height;
      const rightH = detail.rightLegHeight ?? height;
      const cutW = detail.innerCutWidth || 1200;
      const cutD = detail.innerCutDepth || 600;
      const cutOff = detail.innerCutOffset || 600;

      const topBarHeight = Math.max(0, height - cutD);

      return [
        { id: "start", closeId: "H", x: 0, y: 0 },
        { id: "A", x: width, y: 0 },
        { id: "B", x: width, y: rightH },
        { id: "C", x: cutOff + cutW, y: rightH },
        { id: "D", x: cutOff + cutW, y: topBarHeight },
        { id: "E", x: cutOff, y: topBarHeight },
        { id: "F", x: cutOff, y: leftH },
        { id: "G", x: 0, y: leftH },
      ];
    }

    return [
      { id: "DA", x: 0, y: 0 },
      { id: "AB", x: width, y: 0 },
      { id: "BC", x: width, y: height },
      { id: "CD", x: 0, y: height },
    ];
  }
  const points = getPoints();
  
  const getBounds = () => {

    if (points.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return {
      minX: Math.min(...points.map((p: any) => p.x)),
      minY: Math.min(...points.map((p: any) => p.y)),
      maxX: Math.max(...points.map((p: any) => p.x)),
      maxY: Math.max(...points.map((p: any) => p.y)),
    };
  }
  const bounds = getBounds();
  
  return { points, bounds };
}

export function buildDetailGeometry(detail: DetailDraft, points: any[], bounds: any) {
  const s = 0.001;
  if ((detail.type as string) === 'Бортик') {
    const length = (detail.width || 1000) * s;
    const height = (detail.height || 50) * s;
    const depth = (detail.thickness || 20) * s;
    
    const shape = new THREE.Shape();
    const r = Math.min(3 * s, height, depth);
    shape.moveTo(-depth, 0);
    shape.lineTo(0, 0);
    shape.lineTo(0, height);
    shape.lineTo(-depth + r, height);
    shape.quadraticCurveTo(-depth, height, -depth, height - r);
    shape.lineTo(-depth, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: length,
      bevelEnabled: false,
    });
    geometry.translate(0, 0, -length / 2);
    geometry.rotateY(Math.PI / 2);
    
    return { geometry, edgeMap: {}, curves: [] };
  }
  
  const { shape, edgeMap, curves } = buildDetailShape(detail, points, bounds);
  const thickness = (detail.thickness || 20) * s;
  
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 32,
  });
  
  return { geometry, edgeMap, curves };
}

/**
 * КОНТУР ДЛЯ РІЗАКІВ ТОРЦІВ У РЕДАКТОРІ (01.09.2026).
 *
 * До цього редактор віддавав різакам `contourPointsFor` — вершини БЕЗ дуг
 * (кут гострий), тому різак ішов прямо по дотичній, а плита під ним була
 * кругла: профіль обривався перед радіусом, сам радіус лишався сирим, і
 * в збірці той самий виріб виглядав інакше.
 *
 * Тут беруться РІВНО ті вершини, що `ExtrudeGeometry` кладе в меш: те
 * саме правило поділу кривих, що в three (`CurvePath.getPoints`: еліпс —
 * divisions·2 точок, пряма — 1, без сусідніх дублікатів), у мм по
 * габариту деталі. Плюс `sideSegments` за `edgeMap` — щоб
 * `sideContourRange` ділив дуги між сторонами так само, як у розкрої.
 * Отвори — контури вирізів у тому ж порядку, що `detail.cutouts`.
 */
export function contourForCutters(
  shape: THREE.Shape,
  edgeMap: Record<number, string>,
  w: number,
  h: number,
  divisions = 32,
): {
  points: Array<{ x: number; y: number }>;
  sideSegments: Record<string, { start: { x: number; y: number }; end: { x: number; y: number } }>;
  holes: Array<Array<{ x: number; y: number }>>;
} {
  const points: Array<{ x: number; y: number }> = [];
  const sideSegments: Record<string, { start: { x: number; y: number }; end: { x: number; y: number } }> = {};
  // Ребра Г-зарізу (`*_lcut1/2`) з 07.09.2026 (Б-002) — повноцінні
  // сторони: вони отримують власний сегмент, щоб різак торця знаходив
  // свою ділянку. Дуги і фаски лишаються «кутовими переходами», які
  // діляться між сусідніми сторонами.
  const isSideId = (id: string | undefined): id is string =>
    Boolean(id) && !/_(radius|chamfer)$/.test(id!);

  let last: THREE.Vector2 | undefined;
  shape.curves.forEach((curve, index) => {
    const c = curve as THREE.Curve<THREE.Vector2> & { isEllipseCurve?: boolean; isLineCurve?: boolean };
    const resolution = c.isEllipseCurve ? divisions * 2 : c.isLineCurve ? 1 : divisions;
    const pts = c.getPoints(resolution);
    let firstMm: { x: number; y: number } | undefined;
    let lastMm: { x: number; y: number } | undefined;
    for (const p of pts) {
      const mm = { x: p.x * w, y: p.y * h };
      if (!firstMm) firstMm = mm;
      lastMm = mm;
      if (last && last.equals(p)) continue;
      points.push(mm);
      last = p;
    }
    const id = edgeMap[index];
    if (isSideId(id) && firstMm && lastMm) {
      if (!sideSegments[id]) sideSegments[id] = { start: firstMm, end: lastMm };
      else sideSegments[id].end = lastMm;
    }
  });
  if (points.length > 1) {
    const a = points[0];
    const b = points[points.length - 1];
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) points.pop();
  }

  const holes = shape.holes.map((hole) => {
    const ring = hole.getPoints(divisions).map((p) => ({ x: p.x * w, y: p.y * h }));
    if (ring.length > 1) {
      const a = ring[0];
      const b = ring[ring.length - 1];
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) ring.pop();
    }
    return ring;
  });

  return { points, sideSegments, holes };
}

/**
 * Щільний контур деталі в НОРМОВАНИХ координатах (0..1 по габариту) —
 * з дугами, розібраними на точки.
 *
 * Навіщо окремо: список вершин деталі (`points`) НЕ містить дуг — кут там
 * лишається гострим. Перевірка «точка в матеріалі?» по такому контуру бреше
 * рівно в зоні скруглення: зрізаний ріг вона ще вважає матеріалом. Саме на
 * цьому обпікся бандаж гнутого елемента — на опуклому куті проба падала в
 * зрізаний ріг і вирішувала, що кут увігнутий.
 */
export function sampleContourPoints(
  curves: Array<{ type: string; getPoints?: (n: number) => Array<{ x: number; y: number }>; v1?: { x: number; y: number }; v2?: { x: number; y: number } }>,
  arcSegments = 8,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const curve of curves ?? []) {
    if (curve.type === 'LineCurve' && curve.v1) {
      out.push({ x: curve.v1.x, y: curve.v1.y });
    } else if (curve.getPoints) {
      const pts = curve.getPoints(arcSegments);
      // Останню точку не кладемо — вона ж перша точка наступної кривої.
      for (let i = 0; i < pts.length - 1; i++) out.push({ x: pts[i].x, y: pts[i].y });
    }
  }
  return out;
}
