import type { DetailDraft } from '../forms/utils/draftHelpers';
import { getSideSize, applySideEdit } from '../forms/utils/draftHelpers';
import { useCommittedNumber } from './useCommittedNumber';
import { EdgeProfileThumb } from '../forms/editors/EdgeProfileThumb';
import { CATALOG_OPTION_VALUE, EdgeProfileOptionGroups } from '../forms/editors/EdgeProfileOptions';
import { openEdgeCatalog } from '../../store/useEdgeCatalog';
import { topProfileId } from '../../domain/edgeTreatment';
import type { EdgeProfileType, EdgeProfileDef, MaterialType } from '../../../domain/types';

interface DimensionsTableProps {
  draft: DetailDraft;
  updateDetail: (patch: Partial<DetailDraft>) => void;
  sides: string[];
  edgeProfiles: EdgeProfileDef[];
  material?: MaterialType;
  /** Сторони, закриті ногою/потовщенням/підворотом — форму не обрати (domain/edgeOccupancy). */
  occupiedSides?: Record<string, string>;
}

/**
 * Поле розміру сторони. Значення йде в модель на Enter або втраті фокуса —
 * див. useCommittedNumber: інакше кожна набрана цифра встигає стати розміром.
 */
function SideSizeInput({ length, readOnly, onCommit }: { length: number; readOnly: boolean; onCommit: (val: number) => void }) {
  const field = useCommittedNumber(length, onCommit);
  return (
    <input
      type="number"
      {...(readOnly ? { value: Math.round(length), readOnly: true } : field)}
      disabled={readOnly}
      title={readOnly ? 'Цей розмір розраховується автоматично' : 'Enter або клік поза полем — застосувати, Esc — скасувати'}
      className={`w-[80px] px-2 py-1 border rounded outline-none font-mono text-sm ${readOnly ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : 'border-slate-300 bg-white focus:border-[#1f93ef]'}`}
    />
  );
}

export function DimensionsTable({ draft, updateDetail, sides, edgeProfiles, material, occupiedSides }: DimensionsTableProps) {
  // Довжину сторони рахує СПІЛЬНА getSideSize із draftHelpers — тут жила її
  // повна копія, і на Г-подібній вони розійшлися (B і D навхрест). Дві копії
  // одного мапінгу — це і є механізм таких багів: виправляють одну, друга
  // лишається. Тому копію видалено, а не полагоджено.
  const getSideLength = (side: string): number => getSideSize(draft, side);

  // Запис розміру — теж СПІЛЬНА функція (applySideEdit), дзеркало getSideSize.
  // Тут жила своя копія формул, і саме в ній глибина стільниці «пливла»
  // від зміни габариту.
  const handleSizeChange = (side: string, val: number) => {
    const patch = applySideEdit(draft, side, val);
    if (Object.keys(patch).length > 0) updateDetail(patch);
  };

  const setSideProfile = (side: string, profile: EdgeProfileType | '') => {
    const nextProfiles = { ...draft.edgeProfiles };
    if (profile === '') delete nextProfiles[side];
    else nextProfiles[side] = profile;
    updateDetail({ edgeProfiles: nextProfiles });
  };
  
  const toggleFeature = (side: string, featureName: 'thickening' | 'fold') => {
    const feature = draft[featureName];
    const isChecked = feature.sides.includes(side);
    const nextSides = isChecked ? feature.sides.filter(s => s !== side) : [...feature.sides, side];
    updateDetail({ [featureName]: { ...feature, enabled: nextSides.length > 0, sides: nextSides } });
  };

  return (
    <div className="bg-white text-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[#b3d4f0] text-slate-700 font-medium text-xs">
            <th className="py-2 px-2 border-b border-[#a3c4e0] text-center w-10"></th>
            <th className="py-2 px-2 border-b border-[#a3c4e0]">Сторони</th>
            <th className="py-2 px-2 border-b border-[#a3c4e0]" title="Габарит заготовки для розкрою (+допуски)">Розкрій</th>
            <th className="py-2 px-2 border-b border-[#a3c4e0]">Обробка</th>
          </tr>
        </thead>
        <tbody>
          {sides.map((side) => {
            const length = getSideLength(side);
            // Крайка може бути і рядком, і повною EdgeTreatment — читаємо
            // спільним нормалізатором, а не розбираємо union на місці.
            const profile = topProfileId(draft.edgeProfiles[side]);
            // Легасі-галочки потовщення/підворота цього ж драфту теж закривають торець
            const occupiedBy = occupiedSides?.[side]
              ?? (draft.fold?.enabled && draft.fold.sides?.includes(side) ? `Потовщення (${side})` : undefined)
              ?? (draft.thickening?.enabled && draft.thickening.sides?.includes(side) ? `Підворот (${side})` : undefined);
            
            return (
              <tr key={side} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                <td className="py-1 px-2 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded text-sm bg-[#1f93ef] text-white font-bold">{side}</span>
                </td>
                <td className="py-1 px-2">
                  <SideSizeInput
                    length={length}
                    readOnly={draft.kind === 'u' && (side === 'D' || side === 'E' || side === 'F')}
                    onCommit={(val) => handleSizeChange(side, val)}
                  />
                </td>
                <td className="py-1 px-2">
                  {(() => {
                    if (!material || !['Керамограніт', 'Кварцит', 'Натуральний камінь'].includes(material)) return null;
                    const allowance = profile ? (edgeProfiles.find((p) => p.id === profile)?.allowance ?? 0) : 0;
                    if (allowance === 0) return null;
                    return (
                      <div className="text-xs text-slate-500 font-mono" title="Розмір з урахуванням допуску на обробку">
                        {Math.round(length + allowance)} мм
                      </div>
                    );
                  })()}
                </td>
                <td className="py-1 px-2">
                  <div className="flex items-center gap-1">
                    <EdgeProfileThumb profileId={profile} height={24} />
                    <select
                      disabled={Boolean(occupiedBy)}
                      title={occupiedBy ? `Торець закриває ${occupiedBy} — форму тут не обрати` : undefined}
                      value={profile ?? ''}
                      onChange={(e) => {
                        if (e.target.value === CATALOG_OPTION_VALUE) {
                          openEdgeCatalog({ title: `Сторона ${side}`, material, value: profile, allowNone: true,
                            onSelect: (id) => setSideProfile(side, id as EdgeProfileType | '') });
                          return;
                        }
                        setSideProfile(side, e.target.value as EdgeProfileType | '');
                      }}
                      className="border border-slate-300 rounded py-1 px-1 focus:border-[#1f93ef] outline-none w-[180px] text-xs truncate bg-white"
                    >
                      <option value="">Без фрезерування</option>
                      <EdgeProfileOptionGroups profiles={edgeProfiles} material={material} />
                    </select>
                    {occupiedBy && <span className="text-[10px] text-amber-700 whitespace-nowrap" title="Нога, потовщення чи підворот закриває торець">зайнято</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
