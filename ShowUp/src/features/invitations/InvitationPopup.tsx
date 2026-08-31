import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  acceptEventInvitation,
  declineEventInvitation,
  getPendingInvitations,
  type EventInvitation,
} from '@/src/api';
import { useSession } from '@/src/auth';
import { colors, radii, shadows, spacing, typography } from '@/src/constants/theme';

const POLL_INTERVAL_MS = 15000;

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function InvitationPopup() {
  const { user } = useSession();
  const router = useRouter();

  const [queue, setQueue] = useState<EventInvitation[]>([]);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const handledIdsRef = useRef<Set<string>>(new Set());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = queue[0] ?? null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const poll = useCallback(async () => {
    try {
      const items = await getPendingInvitations();
      if (!mountedRef.current) return;
      const fresh = items.filter(
        (inv) => !handledIdsRef.current.has(inv.invitationId)
      );
      setQueue(fresh);
    } catch {
      // Silent — this is a background poll, not a user-initiated action.
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setQueue([]);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    void poll();
    pollTimerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [user?.id, poll]);

  function dismissCurrent(invitationId: string) {
    handledIdsRef.current.add(invitationId);
    setQueue((prev) => prev.filter((inv) => inv.invitationId !== invitationId));
  }

  async function handleAccept() {
    if (!current || busy) return;
    setBusy('accept');
    setAcceptError(null);
    try {
      await acceptEventInvitation(current.eventId, current.invitationId);
      const eventId = current.eventId;
      dismissCurrent(current.invitationId);
      router.push({ pathname: '/event/[id]', params: { id: eventId } });
    } catch {
      // Show an error and leave the popup open so the user can retry or decline.
      if (mountedRef.current) setAcceptError('Could not accept — please try again.');
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  }

  async function handleDecline() {
    if (!current || busy) return;
    setBusy('decline');
    try {
      await declineEventInvitation(current.eventId, current.invitationId);
    } catch {
      // Non-fatal — dismiss locally regardless.
    } finally {
      dismissCurrent(current.invitationId);
      if (mountedRef.current) setBusy(null);
    }
  }

  return (
    <Modal visible={Boolean(current)} animationType="fade" transparent>
      {current ? (
        <View style={styles.overlay}>
          <View style={styles.card} accessibilityViewIsModal>
            <View style={styles.iconWrap}>
              <Ionicons name="mail-open-outline" size={30} color={colors.background} />
            </View>

            <Text style={styles.title}>Game invitation</Text>
            <Text style={styles.subtitle}>
              {current.inviterDisplayName} invited you to join
            </Text>

            <View style={styles.eventCard}>
              <Text style={styles.eventTitle} numberOfLines={2}>{current.eventTitle}</Text>
              <View style={styles.eventRow}>
                <Ionicons name="basketball-outline" size={14} color={colors.textMuted} />
                <Text style={styles.eventDetail}>{current.sport}</Text>
              </View>
              <View style={styles.eventRow}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={styles.eventDetail}>{formatWhen(current.scheduledAt)}</Text>
              </View>
              {current.venueName ? (
                <View style={styles.eventRow}>
                  <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.eventDetail}>{current.venueName}</Text>
                </View>
              ) : null}
              {current.slotRole ? (
                <View style={styles.eventRow}>
                  <Ionicons name="body-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.eventDetail}>{current.slotRole}</Text>
                </View>
              ) : null}
            </View>

            {acceptError ? (
              <Text style={styles.errorText}>{acceptError}</Text>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reject invitation"
                disabled={Boolean(busy)}
                onPress={() => void handleDecline()}
                style={({ pressed }) => [
                  styles.declineBtn,
                  (pressed || busy) && styles.pressed,
                ]}
              >
                {busy === 'decline' ? (
                  <ActivityIndicator color={colors.textSecondary} size="small" />
                ) : (
                  <Text style={styles.declineText}>Decline</Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Accept invitation"
                disabled={Boolean(busy)}
                onPress={() => void handleAccept()}
                style={({ pressed }) => [
                  styles.acceptBtn,
                  (pressed || busy) && styles.pressed,
                ]}
              >
                {busy === 'accept' ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text style={styles.acceptText}>Accept</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 8, 18, 0.78)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xxl,
    width: '100%',
    ...shadows.card,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    marginBottom: spacing.lg,
    width: 64,
    ...shadows.glow,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
    ...typography.body,
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    marginBottom: spacing.xxl,
    padding: spacing.lg,
    width: '100%',
  },
  eventTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  eventRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  eventDetail: {
    color: colors.textSecondary,
    ...typography.small,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  declineBtn: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  declineText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '800',
  },
  acceptBtn: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  acceptText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.8,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
});
