import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { savePushToken } from './api';
import { getNotificationsMuted } from './notificationPreferences';

// Module-level mute cache — updated whenever the user toggles in the settings
// screen, so the handler never has to await AsyncStorage on the hot path.
let _mutedCache: boolean | null = null;

async function isMuted(): Promise<boolean> {
  if (_mutedCache === null) {
    _mutedCache = await getNotificationsMuted();
  }
  return _mutedCache;
}

/** Call this after the user changes the mute preference so the cache stays fresh. */
export function invalidateMuteCache() {
  _mutedCache = null;
}

Notifications.setNotificationHandler({
  handleNotification: async () => {
    const muted = await isMuted();
    if (muted) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    console.log('[notifications] Push notifications not supported on web');
    return null;
  }

  if (!Device.isDevice) {
    console.warn('[notifications] Push notifications require a physical device');
    return null;
  }

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[notifications] Permission not granted');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;
    if (!projectId) {
      console.error(
        '[notifications] No projectId found. Run "npx eas-cli init" in your project to link an Expo project.',
      );
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    console.log('[notifications] Expo push token:', token);

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#a8ff3e',
      });
    }

    try {
      await savePushToken({ userId, token, platform: Platform.OS });
      console.log('[notifications] Token saved to backend');
    } catch (err) {
      console.warn('[notifications] Failed to save token to backend:', err);
    }

    return token;
  } catch (err) {
    console.error('[notifications] Registration failed:', err);
    return null;
  }
}
