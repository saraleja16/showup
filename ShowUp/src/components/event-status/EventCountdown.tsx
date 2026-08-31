import { StyleSheet, Text, View } from 'react-native';

import { formatHms, type GamePhase } from '@/src/live/gamePhase';

type Props = {
  phase: GamePhase;
  startMs: number;
  endMs: number;
  nowMs: number;
  compact?: boolean;
};

export function EventCountdown({ phase, startMs, endMs, nowMs, compact }: Props) {
  if (phase === 'upcoming' || phase === 'starting_soon') {
    const remaining = Math.max(0, startMs - nowMs);
    const startingSoon = phase === 'starting_soon';
    return (
      <View style={[styles.wrap, startingSoon && styles.wrapSoon, compact && styles.wrapCompact]}>
        <Text style={[styles.label, startingSoon && styles.labelSoon]}>
          {startingSoon ? 'STARTING SOON' : 'STARTS IN'}
        </Text>
        <Text style={[styles.value, startingSoon && styles.valueSoon]}>{formatHms(remaining)}</Text>
      </View>
    );
  }

  if (phase === 'live') {
    const elapsed = Math.max(0, nowMs - startMs);
    const remaining = Number.isFinite(endMs) ? Math.max(0, endMs - nowMs) : null;
    return (
      <View style={[styles.wrap, styles.wrapLive, compact && styles.wrapCompact]}>
        <Text style={styles.labelLive}>● LIVE NOW</Text>
        <Text style={styles.valueLive}>{formatHms(elapsed)} elapsed</Text>
        {remaining != null && remaining > 0 ? (
          <Text style={styles.sub}>{formatHms(remaining)} remaining</Text>
        ) : null}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(168, 255, 62, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.28)',
    alignItems: 'center',
  },
  wrapCompact: { paddingVertical: 8 },
  wrapSoon: {
    backgroundColor: 'rgba(168, 255, 62, 0.14)',
    borderColor: '#a8ff3e',
  },
  wrapLive: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  label: {
    color: '#8a8aa0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  labelSoon: { color: '#a8ff3e' },
  labelLive: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  value: {
    color: '#a8ff3e',
    fontSize: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  valueSoon: { color: '#c8ff7a' },
  valueLive: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  sub: { color: '#8a8aa0', fontSize: 11, marginTop: 4, fontWeight: '600' },
});
