import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/src/constants/theme';

interface MaxPlayersSelectorProps {
  value: number;
  onChange: (value: number) => void;
}

export function MaxPlayersSelector({ value, onChange }: MaxPlayersSelectorProps) {
  return (
    <View>
      <Text style={styles.label}>Max players</Text>
      <View style={styles.shell}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(Math.max(2, value - 1))}
          style={({ pressed }) => [styles.stepper, pressed && styles.pressed]}
        >
          <Ionicons name="remove" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.valueWrap}>
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.caption}>players</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(Math.min(30, value + 1))}
          style={({ pressed }) => [styles.stepper, styles.stepperActive, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={20} color={colors.background} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    color: colors.textMuted,
    ...typography.small,
  },
  label: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    ...typography.label,
  },
  pressed: {
    opacity: 0.78,
  },
  shell: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    padding: spacing.sm,
  },
  stepper: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  stepperActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  value: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  valueWrap: {
    alignItems: 'center',
    flex: 1,
  },
});
