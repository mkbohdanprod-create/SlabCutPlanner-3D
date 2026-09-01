/**
 * ТУ ЦЕХУ ПО МАТЕРІАЛАХ (28.08.2026).
 *
 * Джерело — «Деякі ТУ для стільниць зі штучного каменю. Все кромки»
 * від 26.03.2025. Це не наші припущення, а межі, які цех підтвердив
 * кресленнями, тому файл — єдине місце, де ці числа живуть.
 *
 * ⚠️ ГОЛОВНЕ ПРАВИЛО ПОВОДЖЕННЯ (рішення власника): порушення ТУ —
 * ПОПЕРЕДЖЕННЯ, а не блокування. Менеджер має бачити межу і мати змогу
 * свідомо через неї переступити, звірившись із технологом. Блокуємо
 * тільки те, що фізично неможливо (наскрізний різ замість фрезерування).
 *
 * Матеріали в програмі: 'Керамограніт' | 'Кварцит' | 'Акрил' |
 * 'Натуральний камінь'. Натуральний камінь ТУ окремо не описують —
 * беремо межі кварциту як найближчі.
 */

export type RuleMaterial = 'Керамограніт' | 'Кварцит' | 'Акрил';

export interface MaterialRules {
  material: RuleMaterial;
  /**
   * Мінімальний радіус ВНУТРІШНЬОГО кута при підрізці без подальшої
   * обробки. Кераміка R5 — менше заборонено ВИРОБНИКОМ плити, не нами.
   */
  minInnerCornerR: number;
  /** Внутрішній кут Г-подібної суцільної стільниці, фрезерований */
  lShapeInnerR: {
    /** Мінімум при фрезеруванні кромковою фрезою */
    milled: number;
    /** Ручна доводка — до якого радіуса реально доводять руками */
    handMin?: number;
    /** Особливий випадок: товщина 40 мм і кромки U40/H40/O40/LV40 */
    thick40R?: number;
    note: string;
  };
  /** Максимальний габарит суцільної Г-подібної стільниці, мм */
  lShapeMax?: { width: number; height: number; note?: string };
  /** Мінімальний радіус кутів вирізу під мийку нижнього монтажу */
  minSinkCutoutR: number;
  /** Мінімальна відстань від вирізу до КРАЮ деталі, мм */
  minCutoutToEdge: number;
  /** Мінімальна відстань МІЖ двома вирізами, мм */
  minCutoutToCutout: number;
  /** Проточки під батареї: гранична довжина зони, мм */
  batteryGrooveMaxLength: number;
  /** Проточки під батареї: радіус фрези */
  batteryGrooveR: number;
}

/** Максимальний габарит деталі, який бере фрезерувальний NC300, мм. */
export const NC300_MAX_PART = { width: 3000, height: 1600 } as const;

/** Максимальне нависання стільниці без опори над корпусом, мм. */
export const MAX_OVERHANG_MM = 300;

/**
 * Стик стільниць: мінімальна відстань від вирізу під варильну/мийку.
 * Стик ПО КРАЮ вирізу заборонений категорично; по центру вирізу під
 * варильну — можливо, але небажано і лише з опорами.
 */
export const MIN_JOINT_TO_CUTOUT_MM = 100;

/** Проміжок між стільницею і стіною/пеналом, мм (варіанти 1–5 ТУ). */
export const WALL_GAP_MM = 2;

/**
 * Мийка ViyarStone у модулі: відстані до стінок корпусу.
 * Пряма петля — 10 мм звідусіль; накладна бокова петля — 35 мм з боку
 * петлі. Вклейка на об'єкті — 50 мм для зручності монтажу.
 */
export const SINK_TO_MODULE_MM = {
  straightHinge: 10,
  overlayHingeSide: 35,
  otherSides: 10,
  frontRail: 10,
  gluedOnSite: 50,
} as const;

/** Кейл: 10 мм від крила мийки, 25 мм від стійки модуля (до центру). */
export const KEIL_MM = { fromSinkWing: 10, fromModuleWall: 25 } as const;

/** Акрил: від стінки мийки до початку чверті під сифон, мм. */
export const ACRYL_SIPHON_MIN_MM = 70;

/**
 * Отвір під аксесуар біля вирізу: чим більший отвір, тим далі його
 * тримають від вирізу і краю. Джерело — остання сторінка ТУ.
 */
export const ACCESSORY_HOLE_RULES = [
  { maxDiameter: 40, toCutout: 20, toEdge: 20 },
  { maxDiameter: 60, toCutout: 50, toEdge: 50 },
  { maxDiameter: Infinity, toCutout: 100, toEdge: 50 },
] as const;

export const MATERIAL_RULES: Record<RuleMaterial, MaterialRules> = {
  'Керамограніт': {
    material: 'Керамограніт',
    minInnerCornerR: 5,
    lShapeInnerR: {
      milled: 60,
      note: 'Фрезерування фрезою для кромки, >R60. Менше R5 у керамограніті заборонено виробником плити.',
    },
    lShapeMax: { width: 3000, height: 1500, note: 'Iris 1500 / Neolith 1600 — за декором' },
    minSinkCutoutR: 15,
    minCutoutToEdge: 50,
    minCutoutToCutout: 100,
    batteryGrooveMaxLength: 300,
    batteryGrooveR: 5,
  },
  'Кварцит': {
    material: 'Кварцит',
    minInnerCornerR: 3,
    lShapeInnerR: {
      milled: 60,
      handMin: 0,
      thick40R: 70,
      note: 'R0 робиться ВРУЧНУ (залежно від майстра R0–R3). Фрезерована — >R60. Товщина 40 мм із кромками U40/H40/O40/LV40 — у внутрішньому куті R70, або євростик і тоді R0.',
    },
    lShapeMax: { width: 3000, height: 1440 },
    minSinkCutoutR: 15,
    minCutoutToEdge: 50,
    minCutoutToCutout: 100,
    batteryGrooveMaxLength: 600,
    batteryGrooveR: 5,
  },
  'Акрил': {
    material: 'Акрил',
    minInnerCornerR: 4,
    lShapeInnerR: {
      milled: 10,
      note: 'Внутрішній кут Г-подібної — R10 мінімум.',
    },
    minSinkCutoutR: 10,
    minCutoutToEdge: 50,
    minCutoutToCutout: 150,
    batteryGrooveMaxLength: 500,
    batteryGrooveR: 6.5,
  },
};

/**
 * Правила для матеріалу проєкту. Натуральний камінь ТУ окремо не має —
 * ведемо його по кварциту (найближча технологія обробки).
 */
export function rulesForMaterial(material?: string | null): MaterialRules | undefined {
  if (!material) return undefined;
  if (material === 'Натуральний камінь') return MATERIAL_RULES['Кварцит'];
  return MATERIAL_RULES[material as RuleMaterial];
}

/**
 * КЛАСИФІКАЦІЯ КРОМОК ПО МАТЕРІАЛУ І ПРИЗНАЧЕННЮ (ТУ 26.03.2025,
 * розділи «Крайка Керамограніт / Кварцит / Акрил»).
 *
 * Одна форма кромки живе в РІЗНИХ контекстах, і це не те саме:
 * ZS20 на стільниці і ZS20 на мийці ріжуть по-різному (у мийки під
 * профілем іде 3–4 мм звису під чашу). Тому класифікуємо по парі
 * «матеріал + застосування».
 *
 * ⚠️ БОРТИК/ПЛІНТУС — ВИНЯТОК ДЛЯ ВСІХ КАТЕГОРІЙ (вимога власника):
 * на бортику доступний свій, коротший набір форм, бо це вузька смуга
 * на ребрі, а не торець плити. За ТУ там лише фаска 2×2 і радіуси.
 */
const TU = 'ТУ цеху 26.03.2025';

export type EdgeUsage = 'worktop' | 'skirting' | 'sink' | 'hob';

export const EDGE_USAGE_LABEL: Record<EdgeUsage, string> = {
  worktop: 'Стільниця',
  skirting: 'Бортик / стінова панель',
  sink: 'Мийка',
  hob: 'Варильна поверхня',
};

/**
 * Які профілі цех ріже на цьому матеріалі в цьому застосуванні.
 * Порожній список = обмежень немає (показуємо весь довідник).
 */
export const EDGE_PROFILES_BY_USAGE: Record<RuleMaterial, Partial<Record<EdgeUsage, string[]>>> = {
  'Керамограніт': {
    // ВИНЯТОК: на бортику лише фаска 2×2 і R2 — ширших форм там нема
    skirting: ['chamfer_2x2', 'r2_top', 'tech_chamfer'],
    worktop: ['tech_chamfer', 'ar_12', 't_12', 'zr_12', 'zs_12', 'd_12', 'z_12'],
    sink: ['ar_12', 't_12', 'zr_12', 'zs_12'],
    hob: ['tech_chamfer', 'zs_12'],
  },
  'Кварцит': {
    // ВИНЯТОК: бортик — фаска 2×2 і R3
    skirting: ['chamfer_2x2', 'r_3', 'tech_chamfer'],
    worktop: ['tech_chamfer', 'zs_20', 'zr_20', 'a20r5', 'a_20', 'l_20', 'xd_20', 'lv_40', 'lv_40_inv', 'o_40', 'u_40', 'h_40'],
    sink: ['zs_20', 'zr_20', 'a20r5'],
    hob: ['tech_chamfer', 'zs_20'],
  },
  'Акрил': {
    // ВИНЯТОК: плінтус акрилу — окремий ряд радіусів і галтель
    skirting: ['acr_r2', 'acr_r3', 'acr_r6', 'acr_r12', 'acr_fillet_r10r12'],
    worktop: [
      'tech_chamfer', 'acr_r3', 'acr_r6', 'acr_r12', 'acr_r20',
      'acr_r3_3', 'acr_r6_6', 'acr_bullnose_r12',
      'acr_ch_5x5', 'acr_ch_10x10', 'acr_ch_10x10_10x10',
      'acr_cove_r6', 'acr_cove_r6_6', 'acr_modern', 'acr_spill_stop',
    ],
    sink: ['acr_r3', 'acr_r6'],
    hob: ['tech_chamfer'],
  },
};

/**
 * Профілі, доречні для матеріалу і застосування. Список НЕ ховає решту
 * силою: це підказка «що зазвичай ріжуть», а не заборона — правило
 * власника про попередження діє й тут.
 */
export function edgeProfilesFor(material: string | null | undefined, usage: EdgeUsage): string[] {
  const rules = rulesForMaterial(material);
  if (!rules) return [];
  return EDGE_PROFILES_BY_USAGE[rules.material]?.[usage] ?? [];
}

/** Профіль незвичний для цього застосування — попередження, не заборона. */
export function checkEdgeProfileUsage(
  profileId: string,
  material: string | null | undefined,
  usage: EdgeUsage,
): RuleIssue[] {
  const allowed = edgeProfilesFor(material, usage);
  if (!allowed.length || allowed.includes(profileId)) return [];
  const rules = rulesForMaterial(material);
  return [{
    level: 'warning',
    message: `Профіль «${profileId}» не з типового набору для «${rules?.material}» у застосуванні «${EDGE_USAGE_LABEL[usage]}». Звіртесь із технологом.`,
    source: TU,
  }];
}

export type RuleIssue = {
  level: 'error' | 'warning';
  message: string;
  /** Звідки правило — щоб менеджер бачив, що це не наша вигадка */
  source?: string;
};


/** Внутрішній кут (радіус, Г-виріз) проти меж матеріалу. */
export function checkInnerCorner(radius: number, material?: string | null): RuleIssue[] {
  const rules = rulesForMaterial(material);
  if (!rules || radius <= 0) return [];
  const out: RuleIssue[] = [];

  if (radius < rules.minInnerCornerR) {
    out.push({
      level: 'warning',
      message: `Внутрішній радіус R${radius} менший за мінімум для «${rules.material}» (R${rules.minInnerCornerR}). ${
        rules.material === 'Керамограніт' ? 'Менше R5 заборонено виробником плити.' : 'Знадобиться ручна доводка.'
      }`,
      source: TU,
    });
  }
  return out;
}

/** Кут Г-подібної СУЦІЛЬНОЇ стільниці — окремі, суворіші межі. */
export function checkLShapeInnerCorner(
  radius: number,
  material?: string | null,
  thicknessMm?: number,
  edgeProfileIds: string[] = [],
): RuleIssue[] {
  const rules = rulesForMaterial(material);
  if (!rules) return [];
  const out: RuleIssue[] = [];
  const spec = rules.lShapeInnerR;

  // Товста плита з важкими кромками — свій радіус
  const heavyEdge = edgeProfileIds.some((id) => /^(u_40|h_40|o_40|lv_40)/.test(id));
  if (spec.thick40R && (thicknessMm ?? 0) >= 40 && heavyEdge) {
    if (radius > 0 && radius < spec.thick40R) {
      out.push({
        level: 'warning',
        message: `Плита 40 мм із кромкою U40/H40/O40/LV40: у внутрішньому куті потрібен R${spec.thick40R}, задано R${radius}. Або робимо євростик — тоді в куті R0.`,
        source: TU,
      });
    }
    return out;
  }

  if (radius > 0 && radius < spec.milled) {
    const hand = spec.handMin !== undefined;
    out.push({
      level: 'warning',
      message: `Г-подібна суцільна, «${rules.material}»: фрезерована кромка дає ≥R${spec.milled}, задано R${radius}. ${
        hand ? 'Такий радіус робиться ВРУЧНУ — залежить від майстра (R0–R3) і додає ручну операцію.' : spec.note
      }`,
      source: TU,
    });
  }
  return out;
}

/** Габарит суцільної Г-подібної і межа фрезерувального станка. */
export function checkPartSize(widthMm: number, heightMm: number, material?: string | null): RuleIssue[] {
  const out: RuleIssue[] = [];
  const rules = rulesForMaterial(material);

  const big = Math.max(widthMm, heightMm);
  const small = Math.min(widthMm, heightMm);
  if (big > NC300_MAX_PART.width || small > NC300_MAX_PART.height) {
    out.push({
      level: 'warning',
      message: `Деталь ${Math.round(widthMm)}×${Math.round(heightMm)} мм більша за стіл NC300 (${NC300_MAX_PART.width}×${NC300_MAX_PART.height}). Фрезерування такої деталі узгоджують окремо з керівником цеху.`,
      source: TU,
    });
  }

  if (rules?.lShapeMax && (big > rules.lShapeMax.width || small > rules.lShapeMax.height)) {
    out.push({
      level: 'warning',
      message: `Суцільна Г-подібна з «${rules.material}» обмежена ${rules.lShapeMax.width}×${rules.lShapeMax.height} мм${
        rules.lShapeMax.note ? ` (${rules.lShapeMax.note})` : ''
      }. Знадобиться стик.`,
      source: TU,
    });
  }
  return out;
}

/** Виріз: радіуси кутів і відступи від краю. */
export function checkCutout(
  cornerRadius: number | undefined,
  distanceToEdgeMm: number | undefined,
  material?: string | null,
  isSink = true,
): RuleIssue[] {
  const rules = rulesForMaterial(material);
  if (!rules) return [];
  const out: RuleIssue[] = [];

  if (isSink && cornerRadius !== undefined && cornerRadius > 0 && cornerRadius < rules.minSinkCutoutR) {
    out.push({
      level: 'warning',
      message: `Кути вирізу під мийку нижнього монтажу: для «${rules.material}» мінімум R${rules.minSinkCutoutR}, задано R${cornerRadius}.`,
      source: TU,
    });
  }

  if (distanceToEdgeMm !== undefined && distanceToEdgeMm < rules.minCutoutToEdge) {
    out.push({
      level: 'warning',
      message: `Від вирізу до краю деталі ${Math.round(distanceToEdgeMm)} мм — менше за ${rules.minCutoutToEdge} мм із ТУ. Ризик тріщини.`,
      source: TU,
    });
  }
  return out;
}

/** Перемичка між двома вирізами. */
export function checkCutoutSpacing(gapMm: number, material?: string | null): RuleIssue[] {
  const rules = rulesForMaterial(material);
  if (!rules) return [];
  if (gapMm >= rules.minCutoutToCutout) return [];
  return [{
    level: 'warning',
    message: `Між вирізами ${Math.round(gapMm)} мм — для «${rules.material}» потрібно ${rules.minCutoutToCutout} мм.`,
    source: TU,
  }];
}

/** Отвір під аксесуар біля вирізу і краю. */
export function checkAccessoryHole(
  diameterMm: number,
  toCutoutMm: number | undefined,
  toEdgeMm: number | undefined,
): RuleIssue[] {
  const rule = ACCESSORY_HOLE_RULES.find((item) => diameterMm <= item.maxDiameter)!;
  const out: RuleIssue[] = [];
  if (toCutoutMm !== undefined && toCutoutMm < rule.toCutout) {
    out.push({
      level: 'warning',
      message: `Отвір Ø${diameterMm}: до вирізу ${Math.round(toCutoutMm)} мм, за ТУ ${rule.toCutout} мм.`,
      source: TU,
    });
  }
  if (toEdgeMm !== undefined && toEdgeMm < rule.toEdge) {
    out.push({
      level: 'warning',
      message: `Отвір Ø${diameterMm}: до краю ${Math.round(toEdgeMm)} мм, за ТУ ${rule.toEdge} мм.`,
      source: TU,
    });
  }
  return out;
}

/** Нависання стільниці без опори. */
export function checkOverhang(overhangMm: number): RuleIssue[] {
  if (overhangMm <= MAX_OVERHANG_MM) return [];
  return [{
    level: 'warning',
    message: `Нависання ${Math.round(overhangMm)} мм без опори — за ТУ максимум ${MAX_OVERHANG_MM} мм. Камінь трісне, потрібна опора.`,
    source: TU,
  }];
}

/** Стик стільниць відносно вирізу під мийку / варильну. */
export function checkJointNearCutout(
  distanceToCutoutMm: number,
  cutoutKind: 'sink' | 'hob',
): RuleIssue[] {
  if (distanceToCutoutMm >= MIN_JOINT_TO_CUTOUT_MM) return [];
  const isEdge = distanceToCutoutMm <= 0;
  if (cutoutKind === 'sink') {
    return [{
      level: 'warning',
      message: isEdge
        ? 'Стик по краю або центру вирізу під мийку категорично заборонений ТУ. Перенесіть стик на ≥100 мм убік.'
        : `Стик за ${Math.round(distanceToCutoutMm)} мм від вирізу під мийку — за ТУ потрібно ≥${MIN_JOINT_TO_CUTOUT_MM} мм.`,
      source: TU,
    }];
  }
  return [{
    level: 'warning',
    message: isEdge
      ? 'Стик по КРАЮ вирізу під варильну заборонений ТУ. По центру — можливо, але лише з опорами спереду і ззаду модуля.'
      : `Стик за ${Math.round(distanceToCutoutMm)} мм від вирізу під варильну — за ТУ потрібно ≥${MIN_JOINT_TO_CUTOUT_MM} мм.`,
    source: TU,
  }];
}
