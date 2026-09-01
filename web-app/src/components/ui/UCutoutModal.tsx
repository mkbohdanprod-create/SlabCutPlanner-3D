import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  U_CUTOUT_MIN_BRIDGE_MM,
  applyUCutout,
  uCutoutAreaM2,
  uCutoutAvailableDepthMm,
  uCutoutProblemsOnContour,
  uCutoutWallIds,
} from '../../domain/uCutout';
import type { UCutoutSpec } from '../../domain/uCutout';
import { contourEdges, edgeNamedContour } from '../../domain/baseContour';

/**
 * П-ПОДІБНИЙ ВИРІЗ (ніша) — ХВИЛЯ 4, крок 4.4 (FG-34).
 *
 * Три числа: відступ від кута, ширина, глибина. Сторону користувач уже
 * обрав кліком по ребру.
 *
 * РЕМОНТ 19.08: модалка працює на РЕАЛЬНОМУ контурі деталі, а не на
 * прямокутнику з габариту. Довжина сторони і доступна глибина беруться з
 * форми: на Г-подібній деталі «вглиб» упирається у внутрішній виріз, і
 * число в підказці чесно про це каже.
 *
 * Модалка НЕ мовчить, коли ніша неможлива: рушій у такому разі просто
 * поверне порожньо і деталь лишиться як була, а менеджер вважатиме, що
 * все зберіглось. Тому причина показується текстом, а «Зберегти»
 * блокується — краще пояснити, ніж тихо не зробити.
 */
export function UCutoutModal({
  side,
  detail,
  initialData,
  onSave,
  onRemove,
  onClose,
}: {
  side: string;
  /** Чернетка деталі — з неї береться реальний базовий контур форми. */
  detail: {
    kind?: string;
    width?: number;
    height?: number;
    outerWidth?: number;
    outerHeight?: number;
    innerHorizontal?: number;
    innerVertical?: number;
    leftLegHeight?: number;
    rightLegHeight?: number;
    innerCutWidth?: number;
    innerCutDepth?: number;
    innerCutOffset?: number;
  };
  initialData?: UCutoutSpec;
  onSave: (spec: UCutoutSpec) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const basePoints = useMemo(() => edgeNamedContour(detail), [detail]);
  const hostEdge = useMemo(
    () => (basePoints ? contourEdges(basePoints).find((edge) => edge.name === side) : undefined),
    [basePoints, side],
  );
  const along = Math.round(hostEdge?.lengthMm ?? 0);

  const [offsetMm, setOffset] = useState(initialData?.offsetMm ?? Math.max(U_CUTOUT_MIN_BRIDGE_MM, Math.round(along / 4)));
  const [widthMm, setWidth] = useState(initialData?.widthMm ?? Math.max(50, Math.round(along / 2)));
  const spec0: UCutoutSpec = { side, offsetMm, widthMm, depthMm: 0 };
  const available = basePoints ? uCutoutAvailableDepthMm(basePoints, spec0) : undefined;
  const [depthMm, setDepth] = useState(
    initialData?.depthMm ?? Math.max(100, Math.round((available ?? 600) / 2)),
  );

  const spec: UCutoutSpec = { side, offsetMm, widthMm, depthMm };
  const problems = basePoints
    ? uCutoutProblemsOnContour(basePoints, spec)
    : [{ code: 'no_side' as const, message: 'Ця форма не підтримує нішу.' }];
  const walls = uCutoutWallIds(side);
  const preview = basePoints && problems.length === 0 ? applyUCutout(basePoints, spec) : undefined;

  const field = (label: string, value: number, set: (v: number) => void, hint: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-600">{label}</span>
      <input
        type="number"
        className="border border-slate-300 rounded px-2 py-1 text-sm"
        value={value}
        onChange={(e) => set(Number(e.target.value) || 0)}
      />
      <span className="text-[11px] text-slate-400">{hint}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[420px] p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="font-semibold text-slate-800">Ніша (П-подібний виріз)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Сторона {side} · довжина ребра {along} мм
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {field('Відступ, мм', offsetMm, setOffset, `від початку сторони ${side}`)}
          {field('Ширина, мм', widthMm, setWidth, 'уздовж сторони')}
          {field('Глибина, мм', depthMm, setDepth,
            available !== undefined
              ? `вглиб; тут є ${Math.max(0, Math.round(available - U_CUTOUT_MIN_BRIDGE_MM))} мм`
              : 'вглиб деталі')}
        </div>

        {problems.length > 0 ? (
          <ul className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 flex flex-col gap-1">
            {problems.map((problem) => <li key={problem.code}>{problem.message}</li>)}
          </ul>
        ) : (
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
            Мінус {uCutoutAreaM2(spec).toFixed(3)} м² матеріалу.
            {available !== undefined && (
              <> Перемичка за нішею: {Math.round(available - depthMm)} мм (мінімум {U_CUTOUT_MIN_BRIDGE_MM}).</>
            )}
            <br />
            Торці ніші стають окремими сторонами: <b>{walls.join(', ')}</b> — на них можна
            задати обробку кромки й повісити панелі.
            {preview && (
              <>
                <br />
                Контур деталі: {preview.length} вершин, форма збережена.
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 justify-end pt-1">
          {onRemove && initialData && (
            <button
              className="mr-auto text-sm text-rose-600 hover:bg-rose-50 rounded px-2 py-1 flex items-center gap-1"
              onClick={() => { onRemove(); onClose(); }}
            >
              <Trash2 className="w-4 h-4" /> Прибрати нішу
            </button>
          )}
          <button className="text-sm px-3 py-1.5 rounded border border-slate-300" onClick={onClose}>
            Скасувати
          </button>
          <button
            className="text-sm px-3 py-1.5 rounded bg-sky-600 text-white disabled:bg-slate-300"
            disabled={problems.length > 0}
            onClick={() => { onSave(spec); onClose(); }}
          >
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}
