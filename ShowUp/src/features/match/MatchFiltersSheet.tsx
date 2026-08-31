import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/src/constants/theme';
import {
  DEFAULT_MATCH_RADIUS_KM,
  MATCH_RADIUS_OPTIONS_KM,
} from '@/src/features/match/utils';
import { SPORTS } from '@/src/sports/registry';

export type MatchFilters = {
  sportId: string | null;
  radiusKm: number;
};

type Props = {
  visible: boolean;
  filters: MatchFilters;
  preferredSports: string[];
  onClose: () => void;
  onApply: (next: MatchFilters) => void;
};

export function MatchFiltersSheet({
  visible,
  filters,
  preferredSports,
  onClose,
  onApply,
}: Props) {
  const sports = preferredSports.filter((id) => Boolean(SPORTS[id] || id));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close filters">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Filters</Text>
          <Text style={styles.hint}>
            Backend ranks by shared sports, similar skill, similar reliability, and distance.
          </Text>

          <Text style={styles.section}>Sport</Text>
          <View style={styles.row}>
            <Chip
              label="All shared"
              selected={filters.sportId == null}
              onPress={() => onApply({ ...filters, sportId: null })}
            />
            {sports.map((id) => (
              <Chip
                key={id}
                label={SPORTS[id]?.label ?? id}
                selected={filters.sportId === id}
                onPress={() => onApply({ ...filters, sportId: id })}
              />
            ))}
          </View>

          <Text style={styles.section}>Distance</Text>
          <View style={styles.row}>
            {MATCH_RADIUS_OPTIONS_KM.map((km) => (
              <Chip
                key={km}
                label={`${km} km`}
                selected={filters.radiusKm === km}
                onPress={() => onApply({ ...filters, radiusKm: km })}
              />
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset filters"
            onPress={() =>
              onApply({ sportId: null, radiusKm: DEFAULT_MATCH_RADIUS_KM })
            }
            style={({ pressed }) => [styles.reset, pressed && styles.pressed]}
          >
            <Text style={styles.resetText}>Reset to defaults</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.lg,
    width: 40,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    marginBottom: spacing.xl,
    ...typography.small,
  },
  section: {
    color: colors.accent,
    marginBottom: spacing.sm,
    ...typography.section,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  chip: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: colors.background,
  },
  reset: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  resetText: {
    color: colors.textSecondary,
    ...typography.label,
  },
  pressed: {
    opacity: 0.75,
  },
});
