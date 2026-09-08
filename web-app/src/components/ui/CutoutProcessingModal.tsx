import React, { useEffect } from 'react';
import { Check, ArrowLeftRight, ArrowUpDown } from 'lucide-react';
import { DraggableDialog } from './DraggableDialog';
import type { SurfaceCutout } from '../../domain/types';
import { cutoutOutsideContour, type AnchorShapeContext } from '../../domain/cutoutAnchor';
import { translateStaticUiText } from '../../i18n';
import type { UiLanguage } from '../../store/useDictionaryStore';

interface CutoutProcessingModalProps {
  initialData?: Partial<SurfaceCutout>;
  corners: string[]; // List of available corners for binding (e.g., ['AB', 'BC', 'CD', 'DA'])
  onSave: (data: SurfaceCutout) => void;
  onClose: () => void;
  language?: UiLanguage;
  /** Габарит деталі — для перевірки, що виріз не виходить за її межі (FG-16). */
  detailWidth?: number;
  detailHeight?: number;
  /**
   * Форма і геометрія деталі — для перевірки по РЕАЛЬНОМУ контуру (FG-18).
   * На Г- і П-подібній габарит бреше: у виїмці матеріалу немає.
   */
  shapeCtx?: AnchorShapeContext;
}

/**
 * №154 (власник 08.09): «оце переїжає в панель вирізи».
 *
 * Форма вирізу відділена від плаваючого вікна і живе окремим компонентом:
 * у панелі «Вирізи» вона рендериться просто під рядком вирізу, а вікно
 * (`CutoutProcessingModal` нижче) лишилось тільки для СТВОРЕННЯ вирізу з
 * правого меню на поверхні — там зручно ставити виріз по місцю кліку.
 * Розмітка та сама, не копія: обидва входи показують один компонент.
 */
type CutoutProcessingFormProps = CutoutProcessingModalProps & {
  /** У панелі поля вужчі — менші відступи, без зайвого повітря. */
  compact?: boolean;
  /**
   * №155: у панелі виріз уже СТВОРЕНИЙ і стоїть у 3D — правки летять одразу,
   * без «Застосувати». Кнопки внизу тоді не потрібні: закриває форму
   * «Згорнути» в самому рядку вирізу.
   */
  instant?: boolean;
};

/**
 * FG-16: відступ + розмір вирізу мають вміщатись у деталь. Раніше «від кута
 * AB по B = 1000» при вирізі 450 мм мовчки ставив виріз за межі деталі —
 * контур рвався, текстура розлазилась, а помилку помічали вже на кресленні.
 *
 * Геометрія (див. domain/cutoutAnchor.cutoutCenter): x завжди йде вздовж
 * ШИРИНИ деталі, y — вздовж ВИСОТИ, від прив'язаного кута всередину.
 * Для прямокутного вирізу відступ міряється до ближнього кута вирізу,
 * для круглого — до центру отвору.
 */
function cutoutOverflow(
  args: {
    shape: 'circle' | 'rect';
    bindCorner: string;
    x: number; y: number;
    radius: number; width: number; height: number;
    detailWidth?: number; detailHeight?: number;
  },
): string | null {
  const { shape, bindCorner, x, y, radius, width, height, detailWidth, detailHeight } = args;
  if (!detailWidth || !detailHeight) return null;
  // Перевіряємо лише кути габариту: у складних форм (DE, EF…) точка кута
  // залежить від контуру — це зона FG-18, не вгадуємо.
  if (!['DA', 'AB', 'BC', 'CD'].includes(bindCorner)) return null;

  const spanX = shape === 'circle' ? { from: x - radius, to: x + radius } : { from: x, to: x + width };
  const spanY = shape === 'circle' ? { from: y - radius, to: y + radius } : { from: y, to: y + height };

  const overX = Math.max(0, spanX.to - detailWidth, -spanX.from);
  const overY = Math.max(0, spanY.to - detailHeight, -spanY.from);
  if (overX <= 0 && overY <= 0) return null;

  const parts: string[] = [];
  if (overX > 0) parts.push(`по ширині на ${Math.ceil(overX)} мм`);
  if (overY > 0) parts.push(`по висоті на ${Math.ceil(overY)} мм`);
  return `Виріз виходить за межі деталі ${parts.join(' і ')}`;
}

export function CutoutProcessingForm({ initialData, corners, onSave, onClose, language = 'uk', detailWidth, detailHeight, shapeCtx, compact = false, instant = false }: CutoutProcessingFormProps) {
  const ui = (value: string) => translateStaticUiText(language, value);

  /* Форму вирізу задає той, хто його створює (кругла/прямокутна); всередині
     вона не перемикається, тому це константа, а не стан. */
  const shape: 'circle' | 'rect' = initialData?.shape || 'circle';
  const [type, setType] = React.useState<'custom' | 'socket' | 'faucet'>(initialData?.type || 'custom');
  const [bindCorner, setBindCorner] = React.useState<string>(initialData?.bindCorner || corners[0] || '');
  const [x, setX] = React.useState<number>(initialData?.x || 100);
  const [y, setY] = React.useState<number>(initialData?.y || 100);
  const [radius, setRadius] = React.useState<number>(initialData?.radius || 50);
  const [width, setWidth] = React.useState<number>(initialData?.width || 100);
  const [height, setHeight] = React.useState<number>(initialData?.height || 100);
  const [cornerRadius, setCornerRadius] = React.useState<number>(initialData?.cornerRadius || 5);
  const [rotation, setRotation] = React.useState<number>(initialData?.rotation || 0);
  const [edgeProcessing, setEdgeProcessing] = React.useState<string>(initialData?.edgeProcessing || 'Без фрезерування');
  const [isEdgeProcessingEnabled, setIsEdgeProcessingEnabled] = React.useState<boolean>(!!initialData?.edgeProcessing);

  useEffect(() => {
    if (type === 'socket') setRadius(32.5);
    else if (type === 'faucet') setRadius(17.5);
  }, [type]);

  const boxError = cutoutOverflow({
    shape, bindCorner, x, y, radius, width, height, detailWidth, detailHeight,
  });

  /*
   * FG-18. Габаритна перевірка (FG-16) лишається першою — вона дає точне
   * «на скільки міліметрів». Якщо вона мовчить, а форма складна, питаємо
   * контур: виріз може вміщатись у прямокутник і при цьому стояти у
   * виїмці, де каменю немає.
   */
  const outsideContour = shapeCtx ? cutoutOutsideContour(
    { shape, x, y, radius, width, height, bindCorner } as never,
    shapeCtx,
  ) : undefined;

  /*
   * Помилка — це заголовок і уточнення окремо, а не один рядок.
   * Раніше тут різали рядок на частини `replace`-ом, і будь-яке нове
   * формулювання ламало підпис; перекладачу інтерфейсу така склейка теж
   * не давалась.
   */
  const overflowError: { title: string; detail?: string } | null = boxError
    ? { title: 'Виріз виходить за межі деталі', detail: boxError.replace('Виріз виходить за межі деталі ', '') }
    : outsideContour
      ? { title: 'Виріз виходить за контур деталі', detail: 'у цьому місці немає матеріалу' }
      : null;

  const build = (): SurfaceCutout => ({
    id: initialData?.id || `cutout_${Date.now()}`,
    shape,
    type,
    bindCorner,
    x,
    y,
    radius: shape === 'circle' ? radius : undefined,
    width: shape === 'rect' ? width : undefined,
    height: shape === 'rect' ? height : undefined,
    cornerRadius: shape === 'rect' ? cornerRadius : undefined,
    // №156: у кола поворот сенсу не має — не пишемо його зовсім.
    rotation: shape === 'rect' && rotation ? rotation : undefined,
    edgeProcessing: isEdgeProcessingEnabled ? edgeProcessing : undefined,
  } as SurfaceCutout);

  const handleSave = () => {
    if (overflowError) return;
    onSave(build());
  };

  /*
   * №155: у панелі правка застосовується одразу — виріз уже стоїть у 3D, і
   * чекати «Застосувати» безглуздо. Перший рендер пропускаємо: інакше саме
   * відкриття форми писало б у деталь те саме значення й засмічувало історію.
   * Помилкове значення (виріз за межами) не пишемо — воно б розірвало контур.
   */
  const firstRender = React.useRef(true);
  useEffect(() => {
    if (!instant) return;
    if (firstRender.current) { firstRender.current = false; return; }
    if (overflowError) return;
    onSave(build());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instant, shape, type, bindCorner, x, y, radius, width, height, cornerRadius, rotation, edgeProcessing, isEdgeProcessingEnabled]);

  return (
    <>
        {/* №154: червона смуга «Мінімальний радіус 5 мм» прибрана (власник:
            «червоне попередження не надо»). Обмеження лишилось у самому полі
            радіуса кутів: `min=5` і сірий підпис під ним. */}
        <div className={`${compact ? 'p-3 gap-3' : 'p-4 gap-4'} flex flex-col text-[13px] text-slate-800`}>
          <div className="flex flex-col gap-1">
            <label className="text-slate-600 font-medium">Тип вирізу</label>
            <select 
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] bg-white font-medium"
            >
              <option value="custom">{ui('Довільний виріз')}</option>
              <option value="socket">{ui('Під розетки')}</option>
              <option value="faucet">{ui('Під крани')}</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-600 font-medium">Прив'язка до сторін</label>
            <select 
              value={bindCorner}
              onChange={(e) => setBindCorner(e.target.value)}
              className="border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] bg-white font-medium"
            >
              {corners.map(c => (
                <option key={c} value={c}>{c.length === 2 ? `${c[0]} і ${c[1]}` : c}</option>
              ))}
            </select>
          </div>

          {/* Прямокутник міряється до КУТА вирізу (рулеткою, як у цеху), коло —
              до ЦЕНТРУ отвору (у кола кута немає, на кресленнях так і задають).
              Підпис прибирає найчастіше питання менеджера: «це до центру чи до краю?» */}
          <div className="text-[11px] leading-tight text-slate-600 bg-white/70 rounded-sm px-2 py-1">
            {/* №156 (власник: «не від кута, а від сторони»): міряємо від САМИХ
                сторін. Відступ уздовж сторони A — це відстань від сторони B, і
                навпаки; тому в підписах літери саме такі. */}
            {ui('Відстань від сторін')} <b>{bindCorner ? `${bindCorner[0]} і ${bindCorner[1]}` : '—'}</b>{' '}
            {shape === 'circle' ? ui('до центру отвору') : ui('до найближчого кута вирізу')}
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-slate-600 font-medium">
                {shape === 'circle'
                  ? ui(`Центр від сторони ${bindCorner.charAt(1) || 'Y'}`)
                  : ui(`Від сторони ${bindCorner.charAt(1) || 'Y'}`)}
              </label>
              <div className="relative flex items-center">
                <input 
                  type="number"
                  value={x}
                  onChange={e => setX(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] font-bold"
                />
                <ArrowLeftRight className="absolute right-2 w-4 h-4 text-[#1f93ef]" />
              </div>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-slate-600 font-medium">
                {shape === 'circle'
                  ? ui(`Центр від сторони ${bindCorner.charAt(0) || 'X'}`)
                  : ui(`Від сторони ${bindCorner.charAt(0) || 'X'}`)}
              </label>
              <div className="relative flex items-center">
                <input 
                  type="number"
                  value={y}
                  onChange={e => setY(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] font-bold"
                />
                <ArrowUpDown className="absolute right-2 w-4 h-4 text-[#1f93ef]" />
              </div>
            </div>
          </div>

          {shape === 'circle' ? (
            <div className="flex flex-col gap-1">
              <label className="text-slate-600 font-medium">Радіус</label>
              <div className="relative">
                <input 
                  type="number"
                  step="0.5"
                  value={radius}
                  onChange={e => setRadius(parseFloat(e.target.value) || 0)}
                  className="w-[120px] border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] font-bold"
                />
                <span className="absolute left-[125px] top-1/2 -translate-y-1/2 text-slate-500 font-medium">ММ.</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex gap-4">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-slate-600 font-medium">Ширина</label>
                  <div className="relative">
                    <input 
                      type="number"
                      value={width}
                      onChange={e => setWidth(parseFloat(e.target.value) || 0)}
                      className="w-full border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] font-bold"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 font-medium">ММ.</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-slate-600 font-medium">Висота</label>
                  <div className="relative">
                    <input 
                      type="number"
                      value={height}
                      onChange={e => setHeight(parseFloat(e.target.value) || 0)}
                      className="w-full border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] font-bold"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 font-medium">ММ.</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-600 font-medium">Радіус кутів</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="5"
                    value={cornerRadius}
                    onChange={e => setCornerRadius(parseFloat(e.target.value) || 0)}
                    className="w-[120px] border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] font-bold"
                  />
                  <span className="absolute left-[125px] top-1/2 -translate-y-1/2 text-slate-500 font-medium">ММ.</span>
                </div>
                <span className="text-[11px] text-slate-500">Мінімум 5 мм — менший кут фреза не обробить.</span>
              </div>
              {/* №156: поворот вирізу навколо власного центру, градуси. */}
              <div className="flex flex-col gap-1">
                <label className="text-slate-600 font-medium">Поворот</label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    value={rotation}
                    onChange={e => setRotation(parseFloat(e.target.value) || 0)}
                    className="w-[120px] border border-slate-300 rounded-sm h-8 px-2 outline-none focus:border-[#1f93ef] font-bold"
                  />
                  <span className="absolute left-[125px] top-1/2 -translate-y-1/2 text-slate-500 font-medium">°</span>
                </div>
                <span className="text-[11px] text-slate-500">Проти годинникової, навколо центру вирізу.</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={`w-5 h-5 rounded-sm border flex items-center justify-center transition-colors ${isEdgeProcessingEnabled ? 'bg-[#1f93ef] border-[#1f93ef]' : 'bg-white border-slate-300 group-hover:border-[#1f93ef]'}`}>
                <input 
                  type="checkbox"
                  className="hidden"
                  checked={isEdgeProcessingEnabled}
                  onChange={e => setIsEdgeProcessingEnabled(e.target.checked)}
                />
                {isEdgeProcessingEnabled && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-slate-700 font-medium whitespace-nowrap">Обробка торців</span>
            </label>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-slate-500 text-[11px] font-medium leading-none">Фрезерування</label>
              <select 
                disabled={!isEdgeProcessingEnabled}
                value={edgeProcessing}
                onChange={e => setEdgeProcessing(e.target.value)}
                className="border border-slate-300 rounded-sm h-7 px-2 outline-none focus:border-[#1f93ef] bg-white font-medium disabled:opacity-50 text-slate-700"
              >
                <option value="Без фрезерування">Без фрезерування</option>
                <option value="Стандарт">Стандарт</option>
              </select>
            </div>
          </div>

          {overflowError && (
            <div className="bg-red-50 border border-red-300 text-red-700 text-xs font-medium rounded-sm px-3 py-2">
              <span>{ui(overflowError.title)}</span>
              {overflowError.detail && <>{': '}<span>{overflowError.detail}</span>{'.'}</>}
              {' '}
              <span>{ui('Зменшіть відступ або розмір вирізу')}</span>
            </div>
          )}

          {/* №155: у панелі кнопок немає — правки летять одразу в деталь і в 3D. */}
          {!instant && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={onClose}
                className="flex-1 h-9 border border-[#1f93ef] text-[#1f93ef] font-bold rounded-sm hover:bg-[#1f93ef]/10 transition-colors"
              >
                Скасувати
              </button>
              <button
                onClick={handleSave}
                disabled={!!overflowError}
                className="flex-1 h-9 bg-transparent border border-[#1f93ef] text-[#1f93ef] font-bold rounded-sm hover:bg-[#1f93ef]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Застосувати
              </button>
            </div>
          )}
        </div>
    </>
  );
}

/**
 * Плаваюче вікно вирізу. Лишилось для СТВОРЕННЯ вирізу з правого меню на
 * поверхні (рішення власника 08.09): там виріз ставлять по місцю кліку, і
 * тягнути погляд у праву панель незручно. Редагування вже створеного вирізу
 * живе в панелі «Вирізи» — тим самим компонентом форми.
 */
export function CutoutProcessingModal(props: CutoutProcessingModalProps) {
  const ui = (value: string) => translateStaticUiText(props.language ?? 'uk', value);
  const shape = props.initialData?.shape || 'circle';
  return (
    <DraggableDialog
      title={shape === 'circle' ? ui('Круглий виріз') : ui('Прямокутний виріз')}
      onClose={props.onClose}
    >
      <CutoutProcessingForm {...props} />
    </DraggableDialog>
  );
}
