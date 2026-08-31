import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/src/constants/theme';

const SKILLS = ['Beginner', 'Intermediate', 'Advanced'] as const;

export type SkillLevel = (typeof SKILLS)[number];

interface SkillSelectorProps {
  selectedSkill: SkillLevel;
  onSelectSkill: (skill: SkillLevel) => void;
}

export function SkillSelector({ selectedSkill, onSelectSkill }: SkillSelectorProps) {
  return (
    <View>
      <Text style={styles.label}>Skill level</Text>
      <View style={styles.segmented}>
        {SKILLS.map((skill) => {
          const selected = skill === selectedSkill;

          return (
            <Pressable
              accessibilityRole="button"
              key={skill}
              onPress={() => onSelectSkill(skill)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {skill}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    ...typography.label,
  },
  option: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  optionSelected: {
    backgroundColor: colors.gold,
  },
  optionText: {
    color: colors.textMuted,
    ...typography.small,
  },
  optionTextSelected: {
    color: colors.background,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
  segmented: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
});
