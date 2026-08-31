import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/src/constants/theme';

interface SectionTitleProps {
  title: string;
  eyebrow?: string;
}

export function SectionTitle({ title, eyebrow }: SectionTitleProps) {
  return (
    <View style={styles.wrapper}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.accent,
    marginBottom: spacing.xs,
    ...typography.section,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  wrapper: {
    marginBottom: spacing.lg,
  },
});
