import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import {
  checkInToEvent,
  isCheckInTooFar,
  isNetworkError,
  getApiErrorMessage,
  type EventItem,
  type ParticipantStatus,
} from '@/src/api';
import { colors, radii, spacing } from '@/src/constants/theme';
import { CHECK_IN_WINDOW_OPEN_MS, CHECK_IN_WINDOW_CLOSE_MS } from '@/src/constants/checkInWindow';

type Props = {
  event: EventItem;
  userId: string;
  participantStatus: ParticipantStatus | null;
};

type FlowState =
  | null
  | { type: 'requesting' }
  | { type: 'too-far'; distanceMeters: number; venueName: string }
  | { type: 'permission-denied'; canAskAgain: boolean }
  | { type: 'error'; message: string }
  | { type: 'attended' };

export function CheckInCard({ event, userId, participantStatus }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [flow, setFlow] = useState<FlowState>(null);

  // Tick every 30 s while the user is Registered and hasn't checked in yet,
  // so the card auto-transitions between pre-window / open / closed stages.
  const shouldTick =
    participantStatus?.status === 'Registered' && flow?.type !== 'attended';

  useEffect(() => {
    if (!shouldTick) return;
    const timerId = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timerId);
  }, [shouldTick]);

  // ── Check-in tap handler ──────────────────────────────────────────────────

  const handleCheckIn = async () => {
    setFlow({ type: 'requesting' });
    try {
      const { status: permStatus, canAskAgain } =
        await Location.requestForegroundPermissionsAsync();

      if (permStatus !== 'granted') {
        setFlow({ type: 'permission-denied', canAskAgain });
        return;
      }

      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      await checkInToEvent(event.id, {
        userId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyMeters:
          typeof coords.accuracy === 'number' && Number.isFinite(coords.accuracy)
            ? coords.accuracy
            : undefined,
      });

      setFlow({ type: 'attended' });
    } catch (err) {
      if (isCheckInTooFar(err)) {
        setFlow({
          type: 'too-far',
          distanceMeters: err.response.data.distanceMeters,
          venueName: err.response.data.venueName,
        });
      } else if (isNetworkError(err)) {
        setFlow({
          type: 'error',
          message:
            'Unable to verify attendance. You can be confirmed manually by someone at the event.',
        });
      } else {
        setFlow({
          type: 'error',
          message: getApiErrorMessage(err, 'Check-in failed. Please try again.'),
        });
      }
    }
  };

  // ── Visibility guard ──────────────────────────────────────────────────────
  // All hooks are above — conditional returns are safe from here.

  if (!participantStatus) return null;

  const { status } = participantStatus;
  if (status === 'CancelledEarly' || status === 'CancelledLate') return null;

  // ── Time window (display only — server response is source of truth) ───────

  const startMs = new Date(event.scheduledAt).getTime();
  const windowOpen = startMs - CHECK_IN_WINDOW_OPEN_MS;
  const windowClose = startMs + CHECK_IN_WINDOW_CLOSE_MS;

  const windowOpenTime = new Date(windowOpen)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();

  // ── Attended (local override or server-confirmed) ─────────────────────────

  if (flow?.type === 'attended' || status === 'Attended') {
    return (
      <View style={[styles.card, styles.cardAttended]}>
        <Ionicons name="checkmark" size={20} color={colors.background} />
        <Text style={styles.attendedText}>You&apos;re checked in</Text>
      </View>
    );
  }

  // ── NoShow → closed unconditionally ──────────────────────────────────────

  if (status === 'NoShow') {
    return (
      <View style={styles.card}>
        <Text style={styles.mutedText}>Check-in closed</Text>
      </View>
    );
  }

  // ── Registered — time-gated stages ───────────────────────────────────────

  if (status === 'Registered') {
    // Pre-window
    if (now < windowOpen) {
      return (
        <View style={styles.card}>
          <Text style={styles.mutedText}>Check-in opens at {windowOpenTime}</Text>
        </View>
      );
    }

    // Window has closed with no successful check-in (let an in-flight request finish)
    if (now > windowClose && flow?.type !== 'requesting') {
      return (
        <View style={styles.card}>
          <Text style={styles.mutedText}>Check-in closed</Text>
        </View>
      );
    }

    // Window open (or request in-flight past window — let it resolve)
    return (
      <View style={styles.card}>
        {flow?.type === 'requesting' ? (
          <ActivityIndicator color={colors.accent} />
        ) : flow?.type === 'too-far' ? (
          <>
            <Text style={styles.feedbackText}>
              You&apos;re {Math.round(flow.distanceMeters)} m from {flow.venueName} — get closer and try
              again
            </Text>
            <Pressable
              style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaPressed]}
              onPress={handleCheckIn}
            >
              <Text style={styles.ctaText}>Try again</Text>
            </Pressable>
          </>
        ) : flow?.type === 'permission-denied' ? (
          <>
            <Text style={styles.feedbackText}>
              {flow.canAskAgain
                ? "Location is needed to confirm you're at the venue."
                : 'Enable location for ShowUp in Settings.'}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaPressed]}
              onPress={flow.canAskAgain ? handleCheckIn : () => Linking.openSettings()}
            >
              <Text style={styles.ctaText}>
                {flow.canAskAgain ? 'Allow location' : 'Open Settings'}
              </Text>
            </Pressable>
          </>
        ) : flow?.type === 'error' ? (
          <>
            <Text style={styles.feedbackText}>{flow.message}</Text>
            <Pressable
              style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaPressed]}
              onPress={handleCheckIn}
            >
              <Text style={styles.ctaText}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaPressed]}
            onPress={handleCheckIn}
          >
            <Text style={styles.ctaText}>I&apos;m here — Check in</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    marginTop: 14,
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardAttended: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    flexDirection: 'row',
  },
  attendedText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  ctaButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
  },
  ctaPressed: {
    opacity: 0.8,
  },
  ctaText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '800',
  },
});
