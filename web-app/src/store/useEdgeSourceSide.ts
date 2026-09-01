import { create } from 'zustand';
import type { EdgeProfileSelection } from '../domain/types';
import { copyEdgeTreatment } from '../domain/edgeTreatment';

/**
 * ВЗІРЕЦЬ ОБРОБКИ ТОРЦЯ (01.09, власник): клік по літері сторони в панелі
 * кромок — вона стає взірцем (мініатюра зеленим), клік по інших літерах
 * копіює на них ті самі налаштування. Стан живе тут, а не в панелі, бо
 * літери є і в 3D (квадратики на сторонах): клік по 3D-літері — те саме,
 * що по літері в панелі, і підсвітка має збігатися.
 *
 * `scope` — id активної деталі (`main` або слот доповнення): взірець з
 * однієї деталі не має «стріляти» в сторони іншої після перемикання.
 */
interface EdgeSourceSideState {
  side: string | null;
  scope: string | null;
  set: (side: string | null, scope?: string | null) => void;
  clear: () => void;
}

export const useEdgeSourceSide = create<EdgeSourceSideState>((set) => ({
  side: null,
  scope: null,
  set: (side, scope = null) => set({ side, scope: side ? scope : null }),
  clear: () => set({ side: null, scope: null }),
}));

/** Взірець для цієї деталі (або null). */
export function edgeSourceFor(scope: string | null | undefined): string | null {
  const s = useEdgeSourceSide.getState();
  return s.side && s.scope === (scope ?? null) ? s.side : null;
}

/**
 * Клік по літері сторони — одна логіка для панелі кромок і для 3D:
 * нема взірця → ця сторона стає взірцем; клік по взірцю → зняти;
 * клік по іншій → скопіювати обробку взірця на неї (`apply` отримує
 * новий набір обробок). Закрита сторона (`locked`) нічого не робить.
 */
export function clickEdgeSideLetter(args: {
  side: string;
  scope: string | null | undefined;
  locked?: boolean;
  profiles: EdgeProfileSelection | undefined;
  apply: (next: EdgeProfileSelection) => void;
}): void {
  const { side, scope, locked, profiles, apply } = args;
  if (locked) return;
  const store = useEdgeSourceSide.getState();
  const source = edgeSourceFor(scope);
  if (!source) { store.set(side, scope ?? null); return; }
  if (source === side) { store.clear(); return; }
  apply(copyEdgeTreatment(profiles, source, side));
}
