import { TIER_COLORS } from './customerBook';
import { tierName } from '../../services/tierNames';

export const TierBadge = ({ tier }) => {
  const t = tier || 'Silver';
  const color = TIER_COLORS[t] || TIER_COLORS.Silver;
  return (
    <span
      role="status"
      aria-label={`${tierName(t)} tier`}
      title={`${tierName(t)} tier`}
      style={{
        display: 'inline-block',
        width: '9px',
        height: '9px',
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: `0 0 0 2px var(--surface-color), 0 0 0 3px color-mix(in srgb, ${color} 40%, transparent)`,
        verticalAlign: 'middle',
        flexShrink: 0,
        cursor: 'default',
      }}
    />
  );
};
