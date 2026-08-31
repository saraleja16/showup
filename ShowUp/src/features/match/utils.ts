/** Matches backend ReliabilityCalculator.TierForScore */
export function reliabilityTierForScore(
  score: number
): 'excellent' | 'good' | 'at_risk' | 'unreliable' {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'at_risk';
  return 'unreliable';
}

export const RELIABILITY_TIER_COLORS: Record<
  ReturnType<typeof reliabilityTierForScore>,
  { label: string; color: string }
> = {
  excellent: { label: 'Excellent', color: '#a8ff3e' },
  good: { label: 'Good', color: '#4ade80' },
  at_risk: { label: 'At risk', color: '#f59e0b' },
  unreliable: { label: 'Unreliable', color: '#ef4444' },
};

export function formatApproxDistanceKm(km: number): string {
  const rounded = Math.round(km * 10) / 10;
  if (rounded < 0.1) return '~0.1 km';
  return `~${rounded} km`;
}

export const MATCH_RADIUS_OPTIONS_KM = [5, 10, 25, 50, 100] as const;
export const DEFAULT_MATCH_RADIUS_KM = 50;
export const MATCH_PAGE_SIZE = 10;
export const MATCH_PREFETCH_THRESHOLD = 3;
