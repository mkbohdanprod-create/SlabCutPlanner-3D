import type { EdgeProfileDef } from '../../../domain/types';
import { edgeProfileHint, groupEdgeProfiles } from '../../../domain/edgeProfileClasses';

/**
 * Значення пункту «Каталог з розрізами…» у випадачці (01.09, власник:
 * «кнопка з'їжджає звідси і з'являється у випадачці»). Обробник onChange
 * має перехопити його: відкрити каталог і НЕ записувати як профіль.
 */
export const CATALOG_OPTION_VALUE = '__catalog__';
export const CATALOG_OPTION_LABEL = '⊞  Каталог з розрізами…';

/**
 * Опції випадачки «форма кромки», розкладені по групах матеріалу і способу
 * виконання (domain/edgeProfileClasses.ts): універсальні → цей матеріал у
 * товщині плити → цей матеріал лише з потовщенням → операції → інші
 * матеріали → спадок. Один компонент на всі чотири селекти (редактор виробу,
 * дизайнер обробки, властивості розміщення), щоб порядок скрізь був той самий.
 *
 * Нічого не ховає — «Інші матеріали» лишаються внизу списку (рішення
 * власника 26.08: показувати все). Підказка option — матеріали, спосіб
 * виконання і як робиться в цеху.
 */
export function EdgeProfileOptionGroups({
  profiles,
  material,
  short = true,
  withCatalog = true,
}: {
  profiles: EdgeProfileDef[] | undefined;
  /** Матеріал виробу (або проєкту) — визначає, чиї форми йдуть угорі. */
  material?: string | null;
  /** Коротка назва (shortLabel) замість повної. */
  short?: boolean;
  /** Перший пункт «Каталог з розрізами…» (CATALOG_OPTION_VALUE). */
  withCatalog?: boolean;
}) {
  const groups = groupEdgeProfiles(profiles, material);
  return (
    <>
      {withCatalog && <option value={CATALOG_OPTION_VALUE}>{CATALOG_OPTION_LABEL}</option>}
      {groups.map((group) => (
        <optgroup key={`${group.key}:${group.label}`} label={group.label}>
          {group.profiles.map((opt) => (
            <option key={opt.id} value={opt.id} title={edgeProfileHint(opt.id)}>
              {short ? (opt.shortLabel || opt.label) : opt.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
