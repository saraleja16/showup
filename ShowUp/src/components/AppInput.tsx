import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/src/constants/theme';

interface AppInputProps extends TextInputProps {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function AppInput({ label, icon, multiline, style, ...props }: AppInputProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputShell, multiline && styles.multilineShell]}>
        {icon ? <Ionicons name={icon} size={20} color={colors.accent} /> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          multiline={multiline}
          style={[styles.input, multiline && styles.multilineInput, style]}
          {...props}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    color: colors.textPrimary,
    flex: 1,
    minHeight: 24,
    padding: 0,
    ...typography.body,
  },
  inputShell: {
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
  multilineInput: {
    minHeight: 112,
    textAlignVertical: 'top',
  },
  multilineShell: {
    alignItems: 'flex-start',
    minHeight: 140,
    paddingVertical: spacing.lg,
  },
  wrapper: {
    width: '100%',
  },
});
