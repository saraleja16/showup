import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadows, spacing, typography } from '@/src/constants/theme';

type Props = {
  visible: boolean;
  name: string;
  onClose: () => void;
  onOpenChat?: () => void;
};

export function MutualMatchModal({ visible, name, onClose, onOpenChat }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconWrap}>
            <Ionicons name="heart" size={36} color={colors.background} />
          </View>
          <Text style={styles.title}>It&apos;s a match</Text>
          <Text style={styles.body}>
            You and {name} are now connected.
          </Text>

          {onOpenChat ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open chat"
              onPress={onOpenChat}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>Open Chat</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keep matching"
            onPress={onClose}
            style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
          >
            <Text style={styles.ghostText}>Keep matching</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 8, 18, 0.78)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xxl,
    width: '100%',
    ...shadows.card,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    marginBottom: spacing.lg,
    width: 72,
    ...shadows.glow,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
    textAlign: 'center',
    ...typography.body,
  },
  primary: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: '100%',
  },
  primaryText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  ghost: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    width: '100%',
  },
  ghostText: {
    color: colors.accent,
    ...typography.label,
  },
  pressed: {
    opacity: 0.8,
  },
});
