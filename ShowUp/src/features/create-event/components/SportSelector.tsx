import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PickleballIcon } from '@/components/PickleballIcon';
import { colors, radii, spacing, typography } from '@/src/constants/theme';
import { ENABLED_SPORTS, SPORTS } from '@/src/sports/registry';

interface SportSelectorProps {
  selectedSport: string;
  onSelectSport: (sport: string) => void;
}

export function SportSelector({ selectedSport, onSelectSport }: SportSelectorProps) {
  return (
    <View>
      <Text style={styles.label}>Sport</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {ENABLED_SPORTS.map((id) => {
          const config = SPORTS[id];
          const selected = id === selectedSport;
          const iconColor = selected ? colors.background : colors.accent;

          return (
            <Pressable
              accessibilityRole="button"
              key={id}
              onPress={() => onSelectSport(id)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.iconBubble, selected && styles.iconBubbleSelected]}>
                {id === 'pickleball' ? (
                  <PickleballIcon size={20} color={iconColor} />
                ) : (
                  <Ionicons
                    name={config.icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={iconColor}
                  />
                )}
              </View>
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {config.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBubble: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  iconBubbleSelected: {
    backgroundColor: colors.accent,
  },
  label: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    ...typography.label,
  },
  option: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    minWidth: 112,
    padding: spacing.md,
  },
  optionSelected: {
    borderColor: colors.accent,
  },
  optionText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  optionTextSelected: {
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.8,
  },
  row: {
    gap: spacing.md,
    paddingRight: spacing.xl,
  },
});
