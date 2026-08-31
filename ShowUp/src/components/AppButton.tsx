import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, radii, shadows, spacing, typography } from '@/src/constants/theme';

interface AppButtonProps {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'ghost' | 'danger';
  style?: ViewStyle;
  disabled?: boolean;
}

export function AppButton({ label, onPress, icon, variant = 'primary', style, disabled }: AppButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={20}
          color={variant === 'primary' ? colors.background : colors.textPrimary}
        />
      ) : null}
      <Text style={[styles.label, variant === 'primary' && styles.primaryLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  ghost: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
  },
  label: {
    color: colors.textPrimary,
    ...typography.label,
    fontSize: 15,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  primary: {
    backgroundColor: colors.accent,
    ...shadows.glow,
  },
  primaryLabel: {
    color: colors.background,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.5,
  },
});
