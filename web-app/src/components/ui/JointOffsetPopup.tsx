import React from 'react';
import type { CornerProcessing, Point } from '../../domain/types';
import { manualJointPosition, type JointSideSelection } from '../../domain/joints';
import { DraggableDialog } from './DraggableDialog';

interface JointOffsetPopupProps {
  x: number;
  y: number;
  joint: JointSideSelection;
  anchors?: Record<string, Point>;
  corners?: Record<string, CornerProcessing>;
  onCancel: () => void;
  onConfirm: (offset: number) => void;
}

/**
 * Віконечко «на скільки відсунути стик», що відкривається кліком по стороні в 3D.
 *
 * Два правила, виведені болем:
 *
 * 1. `position: fixed` — координати приходять як `clientX/clientY`, тобто від
 *    вікна. При `absolute` меню відлітає на суму двох зсувів (баг №8), тому
 *    `Corner/Edge/Joint/DetailContextMenu` теж усі `fixed`.
 * 2. Попередження про радіус рахує ВИКЛЮЧНО `manualJointPosition` із
 *    `domain/joints.ts` — та сама функція, якою користується рушій розкрою.
 *    Своя копія формули означала б, що користувач бачить одне число, а в
 *    розкрій іде інше.
 */
export function JointOffsetPopup({
  x,
  y,
  joint,
  anchors,
  corners,
  onCancel,
  onConfirm,
}: JointOffsetPopupProps) {
  const [offset, setOffset] = React.useState<number>(joint.axis === 'vertical' ? 600 : 400);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const { requested, snapped } = manualJointPosition(anchors, corners, {
    axis: joint.axis,
    anchorCorner: joint.anchorCorner,
    offset,
  });
  const willBeMoved = Math.abs(snapped - requested) > 0.01;

  return (
    <DraggableDialog
      title={joint.axis === 'vertical' ? 'Вертикальний стик' : 'Горизонтальний стик'}
      onClose={onCancel}
      width={264}
      initialAt={{ x, y }}
      headerClassName="bg-[#3b82f6] text-white"
      className="bg-[#eaf4fc] border border-[#b8d4ee] overflow-hidden"
      z={250}
    >
      <div className="p-3 text-sm">
      <div className="text-slate-700 mb-2">
        Між сторонами <b>{joint.sideId}</b> і <b>{joint.oppositeSideId}</b>
      </div>

      {/* Підписуємо СТОРОНУ, а не кут: рулетку кладуть на край плити, а не в ріг.
          Число те саме — опорний кут лежить на цій же стороні, — тому змінився
          лише підпис, математика в manualJointPosition незмінна. */}
      <label className="block text-xs text-slate-500 mb-1">
        {joint.referenceSideId
          ? <>
              {/* №145: жовтий чип — той самий колір, яким ця сторона зараз
                  підсвічена на моделі. Око зв'язує напис і лінію без слів. */}
              Відступ від сторони{' '}
              <b className="inline-block px-1 rounded-sm bg-amber-400 text-amber-950">
                {joint.referenceSideId}
              </b>
            </>
          : joint.anchorCorner
            ? <>Відступ від кута <b>{joint.anchorCorner}</b></>
            : 'Відступ від краю деталі'}
      </label>
      <div className="flex items-center gap-2 mb-2">
        <input
          ref={inputRef}
          type="number"
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value) || 0)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm(offset);
            if (e.key === 'Escape') onCancel();
          }}
          className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded-sm"
        />
        <span className="text-xs text-slate-500">мм</span>
      </div>

      {willBeMoved && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1.5 mb-2">
          Стик буде посунуто на <b>{Math.round(snapped)} мм</b>: на заданій відстані він
          потрапляє на радіус, деталь звузилась би там у нуль і вістря лопнуло б при різі.
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(offset)}
          className="flex-1 px-3 py-1.5 text-xs font-bold bg-[#0084ff] text-white rounded-sm hover:bg-[#006bce] transition-colors"
        >
          Додати
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-600 rounded-sm hover:bg-slate-50 transition-colors"
        >
          Скасувати
        </button>
      </div>
      </div>
    </DraggableDialog>
  );
}
