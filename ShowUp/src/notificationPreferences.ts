import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@showup/notificationsMuted';

export async function getNotificationsMuted(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setNotificationsMuted(muted: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, muted ? 'true' : 'false');
  } catch {
    // silently fail — preferences are best-effort
  }
}
