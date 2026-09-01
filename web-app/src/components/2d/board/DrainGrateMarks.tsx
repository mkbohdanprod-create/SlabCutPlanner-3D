import type { DetailPart, Placement, DrainGrate } from '../../../domain/types';

/**
 * РЕШІТКА ЗЛИВУ НА КАРТІ КРОЮ (28.08).
 *
 * Цех має бачити контур різу там само, де ріже верстат — на «круглій
 * деталі дна». Малюємо тією ж математикою, що будує різаки в 3D
 * (`engines/drainGrate`), тому картинка на дошці, картинка в 3D і
 * траєкторія води — одне й те саме.
 *
 * Лінія тонка й пунктирна: це РІЗ, а не контур деталі, і сплутати їх
 * на друкованій карті не можна.
 */
export function DrainGrateMarks({ part, placement, grate, scale }: {
  part: DetailPart;
  placement: Placement;
  grate: DrainGrate | undefined;
  scale: number;
}) {
  // Ріже лише круглу деталь дна — ту саму, що в 3D
  if (!grate || !/кругла деталь дна/i.test(part.name ?? '')) return null;

  const cx = (placement.x + part.width / 2 + grate.offsetX) * scale;
  const cy = (placement.y + part.height / 2 + grate.offsetY) * scale;

  const paths: string[] = [];
  for (let ring = 0; ring < grate.rings; ring += 1) {
    const r = (grate.outerDiameter / 2 - ring * grate.ringGap) * scale;
    if (r <= 0) continue;
    const step = 360 / Math.max(1, grate.segmentsPerRing);
    const twist = ring * grate.twistDeg;
    for (let seg = 0; seg < grate.segmentsPerRing; seg += 1) {
      const a0 = ((twist + seg * step + grate.bridgeDeg / 2) * Math.PI) / 180;
      const a1 = ((twist + (seg + 1) * step - grate.bridgeDeg / 2) * Math.PI) / 180;
      if (a1 <= a0) continue;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      paths.push(
        `M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`,
      );
    }
  }
  if (!paths.length) return null;

  return (
    <g className="drain-grate-marks" pointerEvents="none">
      {paths.map((d, index) => (
        <path
          key={index}
          d={d}
          fill="none"
          stroke="#1f5f87"
          strokeWidth={Math.max(0.8, grate.slotWidth * scale)}
          strokeLinecap="butt"
        />
      ))}
    </g>
  );
}
