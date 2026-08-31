import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/src/constants/theme';

interface DatePickerFieldProps {
  label: string;
  value: string;
  onPress?: () => void;
}

export function DatePickerField({ label, value, onPress }: DatePickerFieldProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.accent} />
        <Text style={styles.value}>{value}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    ...typography.label,
  },
  pressed: {
    opacity: 0.78,
  },
  value: {
    color: colors.textPrimary,
    flex: 1,
    ...typography.body,
  },
  wrapper: {
    flex: 1,
  },
});
