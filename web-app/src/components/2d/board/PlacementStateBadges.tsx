import type { Placement } from '../../../domain/types';

export function PlacementStateBadges({ placement, x, y }: { placement: Placement; x: number; y: number }) {
  const badges = [
    placement.pinnedToSlab ? { key: 'pin', label: 'P' } : undefined,
    placement.manualLocked ? { key: 'lock', label: 'L' } : undefined,
    /* «T» янтарний — товщина деталі ≠ товщині слеба. Попередження, не
       заборона: деталь лежить, але про розбіжність видно прямо на дошці,
       а повний текст із числами — у підказці при наведенні. */
    placement.thicknessWarning ? { key: 'thickness', label: 'T', warn: true, title: placement.thicknessWarning } : undefined,
  ].filter(Boolean) as Array<{ key: string; label: string; warn?: boolean; title?: string }>;
  if (!badges.length) return null;
  return (
    <g className="placement-state-badges">
      {badges.map((badge, index) => (
        <g key={badge.key} transform={`translate(${x},${y + index * 16})`} className={badge.warn ? 'badge-warn' : undefined}>
          {badge.title && <title>{badge.title}</title>}
          <rect x={0} y={0} width={14} height={14} rx={4} />
          <text x={7} y={10} textAnchor="middle">{badge.label}</text>
        </g>
      ))}
    </g>
  );
}