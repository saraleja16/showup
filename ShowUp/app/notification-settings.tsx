import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Switch, Text, View } from 'react-native';

import {
  getNotificationsMuted,
  setNotificationsMuted,
} from '@/src/notificationPreferences';

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    getNotificationsMuted().then(setMuted);
  }, []);

  const handleToggle = async (value: boolean) => {
    setMuted(value);
    await setNotificationsMuted(value);
    // Keep the module-level cache in notifications.ts fresh (native only).
    if (Platform.OS !== 'web') {
      const { invalidateMuteCache } = await import('@/src/notifications');
      invalidateMuteCache();
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <View style={styles.backRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Mute all notifications</Text>
          <Switch
            value={muted}
            onValueChange={(v) => void handleToggle(v)}
            trackColor={{ false: 'rgba(168, 255, 62, 0.2)', true: '#a8ff3e' }}
            thumbColor={muted ? '#1a1a2e' : '#8a8aa0'}
          />
        </View>
        <Text style={styles.hint}>
          When muted, ShowUp will not show alerts or play sounds for any push notifications on this
          device.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.2)',
    marginHorizontal: 20,
    marginTop: 8,
    overflow: 'hidden',
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rowLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  hint: {
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.75,
  },
});
