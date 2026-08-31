import { Image, StyleSheet, Text, View } from 'react-native';

import type { GamePhase } from '@/src/live/gamePhase';
import { formatAttendanceSummary } from '@/src/live/attendanceLabels';

type AvatarItem = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  present?: boolean;
};

type Props = {
  phase: GamePhase;
  presentCount?: number;
  pendingCount?: number;
  totalCount?: number;
  avatars?: AvatarItem[];
  resultLabel?: string | null;
  /** Backend result status when known (PendingConfirmation | Confirmed | Disputed). */
  resultStatus?: string | null;
};

function MiniAvatar({ item }: { item: AvatarItem }) {
  const initial = (item.name.trim()[0] || '?').toUpperCase();
  return (
    <View style={[styles.avatar, item.present === false && styles.avatarDimmed]}>
      {item.avatarUrl ? (
        <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
      ) : (
        <Text style={styles.avatarInitial}>{initial}</Text>
      )}
    </View>
  );
}

function normalizeStatus(status?: string | null): string {
  return (status ?? '').replace(/[\s_-]/g, '').toLowerCase();
}

export function LiveEventStatus({
  phase,
  presentCount,
  pendingCount,
  totalCount,
  avatars,
  resultLabel,
  resultStatus,
}: Props) {
  const status = normalizeStatus(resultStatus);

  if (phase === 'finished') {
    return (
      <View style={styles.block}>
        <Text style={styles.finished}>FINISHED</Text>
        <Text style={styles.muted}>{resultLabel ?? 'Result pending'}</Text>
      </View>
    );
  }

  if (phase === 'result_pending') {
    if (status === 'disputed') {
      return (
        <View style={styles.block}>
          <Text style={styles.disputed}>RESULT DISPUTED</Text>
          {resultLabel ? <Text style={styles.muted}>{resultLabel}</Text> : null}
        </View>
      );
    }
    return (
      <View style={styles.block}>
        <Text style={styles.pending}>RESULT SUBMITTED</Text>
        <Text style={styles.muted}>{resultLabel ?? 'Waiting for confirmation'}</Text>
      </View>
    );
  }

  if (phase === 'completed') {
    return (
      <View style={styles.block}>
        <Text style={styles.final}>✓ FINAL RESULT</Text>
        {resultLabel ? <Text style={styles.finalScore}>{resultLabel}</Text> : null}
      </View>
    );
  }

  if (phase !== 'live' && phase !== 'starting_soon') return null;

  const present = presentCount ?? 0;
  const total = totalCount ?? 0;
  const pending =
    typeof pendingCount === 'number' ? pendingCount : Math.max(0, total - present);
  const showCounts = total > 0;

  return (
    <View style={styles.liveExtras}>
      {showCounts ? (
        <Text style={styles.here}>{formatAttendanceSummary(present, pending, total)}</Text>
      ) : null}
      {avatars && avatars.length > 0 ? (
        <View style={styles.avatarRow}>
          {avatars.slice(0, 6).map((a) => (
            <MiniAvatar key={a.id} item={a} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 10, alignItems: 'center', gap: 4 },
  finished: { color: '#c5c5d4', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  pending: { color: '#f59e0b', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  disputed: { color: '#f87171', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  final: { color: '#a8ff3e', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  finalScore: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
  muted: { color: '#8a8aa0', fontSize: 12, fontWeight: '600' },
  liveExtras: { marginTop: 8, gap: 8 },
  here: { color: '#c5c5d4', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  avatarRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarDimmed: { opacity: 0.45 },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: '#a8ff3e', fontSize: 11, fontWeight: '800' },
});
