import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SportIcon } from '@/src/components/SportIcon';
import { colors, radii, shadows, spacing, typography } from '@/src/constants/theme';
import type { MatchCandidate } from '@/src/api';
import { ReliabilityCircle } from '@/src/features/match/ReliabilityCircle';
import { formatApproxDistanceKm } from '@/src/features/match/utils';
import { SPORTS } from '@/src/sports/registry';

type Props = {
  candidate: MatchCandidate;
  /** True when this card is the centered/selected one in a carousel — gives it an accent outline. */
  focused?: boolean;
  /**
   * Skip / Connect handlers. When both are provided the card renders its own
   * action footer — decisions live on the card they act on, so only the focused
   * card in a carousel should receive them.
   */
  onSkip?: () => void;
  onConnect?: () => void;
  /** Disables both actions while a decision is in flight. */
  actionsBusy?: boolean;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || '?';
}

function SportBadge({ sportId }: { sportId: string }) {
  const config = SPORTS[sportId];
  const label = config?.label ?? sportId;

  return (
    <View
      accessible
      accessibilityLabel={`Shared sport ${label}`}
      style={styles.sportBadge}
    >
      <SportIcon sportId={sportId} size={14} color={colors.accent} />
      <Text style={styles.sportLabel} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

export function MatchCandidateCard({
  candidate,
  focused = false,
  onSkip,
  onConnect,
  actionsBusy = false,
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = getInitials(candidate.displayName);
  const showImage = Boolean(candidate.profileImageUrl) && !imageFailed;
  const distance = formatApproxDistanceKm(candidate.approximateDistanceKm);
  const skill = candidate.skillLevel?.trim() ? candidate.skillLevel.trim() : null;
  const showActions = Boolean(onSkip && onConnect);

  return (
    <View
      style={[styles.card, focused && styles.cardFocused]}
      accessibilityRole="summary"
    >
      <View style={styles.topRow}>
        <View style={styles.avatarRing}>
          {showImage ? (
            <Image
              source={{ uri: candidate.profileImageUrl! }}
              style={styles.avatarImage}
              contentFit="cover"
              onError={() => setImageFailed(true)}
              accessibilityLabel={`${candidate.displayName} profile photo`}
            />
          ) : (
            <View
              style={styles.avatarFallback}
              accessible
              accessibilityLabel={`${candidate.displayName} avatar initials ${initials}`}
            >
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </View>

        <View style={styles.nameBlock}>
          <Text style={styles.name} maxFontSizeMultiplier={1.4} numberOfLines={2}>
            {candidate.displayName}
          </Text>
          {skill ? (
            <View
              accessible
              accessibilityLabel={`Skill level ${skill}`}
              style={styles.skillBadge}
            >
              <Text style={styles.skillText}>{skill}</Text>
            </View>
          ) : null}
        </View>

        <ReliabilityCircle score={candidate.reliabilityScore} />
      </View>

      <View style={styles.infoBlock}>
        <View style={styles.distanceRow}>
          <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
          <Text
            style={styles.distance}
            accessibilityLabel={`Approximate distance ${distance}`}
            maxFontSizeMultiplier={1.3}
          >
            {distance}
          </Text>
        </View>

        <View style={styles.sportsRow}>
          {(candidate.sharedSports?.length
            ? candidate.sharedSports
            : candidate.primarySharedSport
              ? [candidate.primarySharedSport]
              : []
          ).map((sportId) => (
            <SportBadge key={sportId} sportId={sportId} />
          ))}
        </View>
      </View>

      {showActions ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Skip ${candidate.displayName}`}
            disabled={actionsBusy}
            onPress={onSkip}
            style={({ pressed }) => [
              styles.skipBtn,
              pressed && styles.pressed,
              actionsBusy && styles.disabled,
            ]}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Connect with ${candidate.displayName}`}
            disabled={actionsBusy}
            onPress={onConnect}
            style={({ pressed }) => [
              styles.connectBtn,
              pressed && styles.pressed,
              actionsBusy && styles.disabled,
            ]}
          >
            <Ionicons name="heart" size={18} color={colors.background} />
            <Text style={styles.connectText} maxFontSizeMultiplier={1.3}>
              Connect
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xl,
    width: '100%',
  },
  cardFocused: {
    borderColor: colors.accent,
    ...shadows.glow,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatarRing: {
    borderColor: colors.accent,
    borderRadius: 40,
    borderWidth: 2,
    height: 76,
    overflow: 'hidden',
    width: 76,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    flex: 1,
    justifyContent: 'center',
  },
  avatarInitials: {
    color: colors.accent,
    fontSize: 24,
    fontWeight: '800',
  },
  nameBlock: {
    flex: 1,
    gap: spacing.sm,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  skillBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  skillText: {
    color: colors.accent,
    ...typography.small,
    fontWeight: '800',
  },
  infoBlock: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  distance: {
    color: colors.textSecondary,
    ...typography.body,
  },
  sportsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sportBadge: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sportLabel: {
    color: colors.textPrimary,
    ...typography.small,
  },
  actions: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
  },
  skipBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  connectBtn: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 44,
    justifyContent: 'center',
  },
  connectText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.5,
  },
});
