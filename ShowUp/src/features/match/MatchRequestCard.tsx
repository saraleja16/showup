import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { SportIcon } from '@/src/components/SportIcon';
import { colors, radii, spacing } from '@/src/constants/theme';
import type { MatchRequestItem, MatchRequestStatus } from '@/src/features/match/matchRequestStore';
import { ReliabilityCircle } from '@/src/features/match/ReliabilityCircle';
import { formatApproxDistanceKm } from '@/src/features/match/utils';
import { SPORTS } from '@/src/sports/registry';

type Props = {
  item: MatchRequestItem;
  variant: 'sent' | 'incoming';
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

function statusLabel(status: MatchRequestStatus): string {
  if (status === 'accepted') return 'ACCEPTED';
  if (status === 'rejected') return 'REJECTED';
  return 'PENDING';
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function MatchRequestCard({
  item,
  variant,
  busy,
  onAccept,
  onReject,
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = getInitials(item.displayName);
  const showImage = Boolean(item.profileImageUrl) && !imageFailed;
  const sports = (item.sharedSports?.length ? item.sharedSports : [item.primarySharedSport])
    .filter(Boolean)
    .slice(0, 3) as string[];
  const distance =
    item.approximateDistanceKm != null
      ? formatApproxDistanceKm(item.approximateDistanceKm)
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.avatarRing}>
          {showImage ? (
            <Image
              source={{ uri: item.profileImageUrl! }}
              style={styles.avatarImage}
              contentFit="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </View>
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={2}>
            {item.displayName}
          </Text>
          {item.skillLevel ? <Text style={styles.skill}>{item.skillLevel}</Text> : null}
          <View style={styles.sportsRow}>
            {sports.map((sportId) => {
              const cfg = SPORTS[sportId];
              return (
                <View key={sportId} style={styles.sportChip}>
                  <SportIcon sportId={sportId} size={12} color={colors.accent} />
                  <Text style={styles.sportLabel}>{cfg?.label ?? sportId}</Text>
                </View>
              );
            })}
          </View>
          {distance ? (
            <View style={styles.distanceRow}>
              <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.distance}>{distance}</Text>
            </View>
          ) : null}
          <Text style={styles.when}>{formatWhen(item.updatedAt)}</Text>
        </View>
        <ReliabilityCircle score={item.reliabilityScore} />
      </View>

      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusPill,
            item.status === 'pending' && styles.statusPending,
            item.status === 'accepted' && styles.statusAccepted,
            item.status === 'rejected' && styles.statusRejected,
          ]}
        >
          <Text style={styles.statusText}>{statusLabel(item.status)}</Text>
        </View>
      </View>

      {variant === 'incoming' && item.status === 'pending' ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onAccept}
            style={({ pressed }) => [styles.acceptBtn, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.acceptText}>Accept</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onReject}
            style={({ pressed }) => [styles.rejectBtn, pressed && styles.pressed]}
          >
            <Text style={styles.rejectText}>Reject</Text>
          </Pressable>
        </View>
      ) : null}

      {variant === 'sent' && item.status === 'pending' ? (
        <Text style={styles.hint}>Waiting for them to accept. Cancel is not available yet.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.2)',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  topRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.accent,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  meta: { flex: 1, gap: 4 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  skill: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  sportsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  sportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(168, 255, 62, 0.1)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sportLabel: { color: colors.textPrimary, fontSize: 11, fontWeight: '700' },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  distance: { color: colors.textSecondary, fontSize: 12 },
  when: { color: colors.textSecondary, fontSize: 11 },
  statusRow: { marginTop: spacing.sm },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(138,138,160,0.25)',
  },
  statusPending: { backgroundColor: 'rgba(245, 158, 11, 0.2)' },
  statusAccepted: { backgroundColor: 'rgba(168, 255, 62, 0.2)' },
  statusRejected: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
  statusText: { color: colors.textPrimary, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  acceptBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  acceptText: { color: colors.background, fontWeight: '800' },
  rejectBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  rejectText: { color: colors.accent, fontWeight: '800' },
  hint: { color: colors.textSecondary, fontSize: 12, marginTop: spacing.sm },
  pressed: { opacity: 0.85 },
});
