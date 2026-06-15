export const MM_TO_M2 = 1_000_000;

export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function mm2ToM2(value: number): number {
  return round(value / MM_TO_M2, 3);
}
