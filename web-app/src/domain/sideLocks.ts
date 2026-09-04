/**
 * ЗАМКИ НА СТОРОНАХ (04.09.2026, задум власника).
 *
 * Проблема, яку це лікує. У Г- і П-подібної сторони не незалежні: вони
 * зв'язані рівнянням. У П по горизонталі це `A = G + E + C` — габарит
 * дорівнює лівій нозі, вирізу і правій нозі. Тому змінити A «просто так»
 * неможливо: хтось із трьох мусить поступитись. Досі вибір робив КОД —
 * завжди той самий, зашитий у switch. Власник: «прадокс який унеможливлює
 * роботу»: хочеш посунути виріз — їде нога, хочеш ногу — їде виріз, і
 * керувати цим ніяк.
 *
 * Рішення — замочок біля кожного розміру. Замок означає рівно одне:
 * **це число не змінюється — ні руками, ні само**. Тоді зміну поглинає
 * перший НЕзамкнений розмір рівняння. Приклад власника: закрили G і C,
 * міняємо A → їде E. Закрили E і G → їде C.
 *
 * Тут лежить ЛИШЕ алгебра рівнянь: які розміри в одній групі, хто кому
 * поступається першим і як порахувати новий набір. Довжини сторін і поля
 * чернетки цей модуль не знає — їх подає `draftHelpers.applySideEdit`,
 * єдиний, хто перекладає сторони в поля деталі. Так математика лишається
 * в одному місці (див. `01_МЕЙН/ОДНА_МАТЕМАТИКА_ДЕТАЛІ.md`).
 */

/**
 * λ — глибина верхньої перекладини П-подібної. Торцем вона не є, тому
 * літери A–H не має; але в рівняннях висот стоїть нарівні зі сторонами:
 * H = F + λ і B = D + λ. Тому й замок їй потрібен такий самий.
 *
 * Позначка, а не слово (рішення власника 04.09): у кресленні «Ширина»
 * плуталася з габаритом і з'їдала місце. Грецькі літери — наші КОНСТАНТИ
 * деталі, те, що не є стороною: λ перша, далі буде решта.
 */
export const WIDTH_SIDE = 'λ';

/**
 * ГАБАРИТИ КРУГЛИХ ФОРМ. Теж не торці — у кола й овалу сторони A–D це
 * квадранти дуги, а не прямі ребра, і задавати форму ними неможливо.
 * Рівнянь між ними немає, отже й замикати нічого: ці ключі існують лише
 * для того, щоб розмір на кресленні можна було відредагувати тією самою
 * дорогою, що й сторони (getSideSize / applySideEdit).
 */
export const DIAMETER_SIDE = 'Ø';
export const ELLIPSE_W_SIDE = 'овал-ширина';
export const ELLIPSE_H_SIDE = 'овал-висота';

export interface SideGroup {
  /** Габарит групи: дорівнює сумі часток. */
  total: string;
  /** Частки, на які габарит розкладається. */
  parts: string[];
  /**
   * Кого рухаємо першим, коли замків немає. Порядок НЕ вигаданий — це
   * дослівно сьогоднішня поведінка applySideEdit, зафіксована списком.
   * Замки лише пропускають тих, хто закритий.
   */
  priority: string[];
}

interface ShapeLike { kind?: string; mirrorL?: boolean }

/**
 * Рівняння форми. Прямокутник, коло й овал не мають свободи (A і C — те
 * саме число), тому груп немає і замки їм ні до чого.
 */
export function sideGroupsFor(draft: ShapeLike): SideGroup[] {
  if (draft.kind === 'l') {
    const horizontal: SideGroup = { total: 'A', parts: ['E', 'C'], priority: ['C', 'A', 'E'] };
    // Дзеркальна Г: літери йдуть за обходом контуру, тому повна вертикаль —
    // B, а коротка — F (див. getSideSize, гілка mirrorL).
    const vertical: SideGroup = draft.mirrorL
      ? { total: 'B', parts: ['D', 'F'], priority: ['D', 'B', 'F'] }
      : { total: 'F', parts: ['D', 'B'], priority: ['D', 'F', 'B'] };
    return [horizontal, vertical];
  }

  if (draft.kind === 'u') {
    return [
      { total: 'A', parts: ['G', 'E', 'C'], priority: ['A', 'C', 'E', 'G'] },
      { total: 'H', parts: ['F', WIDTH_SIDE], priority: ['F', 'H', WIDTH_SIDE] },
      { total: 'B', parts: ['D', WIDTH_SIDE], priority: ['D', 'B', WIDTH_SIDE] },
    ];
  }

  return [];
}

export function groupMembers(group: SideGroup): string[] {
  return [group.total, ...group.parts];
}

/** Група, у якій бере участь цей розмір (або нічого). */
export function groupOfSide(draft: ShapeLike, side: string): SideGroup | undefined {
  return sideGroupsFor(draft).find((g) => groupMembers(g).includes(side));
}

/**
 * Чи можна взагалі повісити замок на цей розмір. Замок має сенс тільки
 * там, де є рівняння: на прямокутнику замикати нічого.
 */
export function sideIsLockable(draft: ShapeLike, side: string): boolean {
  return Boolean(groupOfSide(draft, side));
}

/**
 * Чи можна редагувати цей розмір при таких замках. Не можна у двох
 * випадках: він сам замкнений, або в його рівнянні всі інші замкнені —
 * тоді зміні нікуди подітись, і чесніше не пускати, ніж мовчки зламати
 * чужий замок.
 */
export function sideEditable(draft: ShapeLike, side: string, locked: ReadonlySet<string>): boolean {
  const group = groupOfSide(draft, side);
  if (!group) return true; // форма без рівнянь — обмежень немає
  if (locked.has(side)) return false;
  return groupMembers(group).some((m) => m !== side && !locked.has(m));
}

/** Хто саме поступиться, якщо зараз змінити цей розмір (для підказки). */
export function donorForSide(draft: ShapeLike, side: string, locked: ReadonlySet<string>): string | undefined {
  const group = groupOfSide(draft, side);
  if (!group || locked.has(side)) return undefined;
  const members = groupMembers(group);
  return group.priority.find((m) => m !== side && members.includes(m) && !locked.has(m));
}

/**
 * Порахувати новий набір розмірів групи після правки однієї сторони.
 *
 * `values` — поточні довжини всіх членів групи (їх подає той, хто вміє
 * читати чернетку). Повертає новий набір або `null`, якщо правка
 * неможлива: поле замкнене, або поступитись нема кому.
 *
 * Мінімум: жоден розмір не падає нижче `min`. Якщо донор упирається в
 * мінімум — затискаємо його і перераховуємо САМУ відредаговану сторону,
 * щоб рівняння лишилось правдивим (поле «клацне» в найближче можливе
 * число, а не тихо зламає геометрію).
 */
export function solveGroupEdit(
  group: SideGroup,
  values: Readonly<Record<string, number>>,
  side: string,
  rawValue: number,
  locked: ReadonlySet<string>,
  min = 1,
): Record<string, number> | null {
  const members = groupMembers(group);
  if (!members.includes(side) || locked.has(side)) return null;

  const donor = group.priority.find((m) => m !== side && members.includes(m) && !locked.has(m));
  if (!donor) return null;

  const value = Math.max(min, Math.round(rawValue));
  const delta = value - values[side];
  if (delta === 0) return null;

  const next: Record<string, number> = {};
  members.forEach((m) => { next[m] = values[m]; });
  next[side] = value;

  // Габарит росте разом із часткою і навпаки; дві частки ділять габарит
  // між собою, тому рухаються назустріч.
  const oppositeSigns = side !== group.total && donor !== group.total;
  next[donor] = values[donor] + (oppositeSigns ? -delta : delta);

  if (next[donor] < min) {
    next[donor] = min;
    // Відновлюємо рівняння коштом того, що щойно ввели.
    if (side === group.total) {
      next[side] = group.parts.reduce((sum, p) => sum + next[p], 0);
    } else {
      const others = group.parts.filter((p) => p !== side).reduce((sum, p) => sum + next[p], 0);
      next[side] = next[group.total] - others;
    }
    if (next[side] < min) return null; // фізично неможливо — не чіпаємо нічого
  }

  return next;
}
