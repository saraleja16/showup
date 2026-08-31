import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

export type MatchCoords = {
  latitude: number;
  longitude: number;
};

export type LocationPermissionPhase =
  | 'checking'
  | 'prompt'
  | 'denied'
  | 'granted'
  | 'unavailable';

const LOCATION_TIMEOUT_MS = 12_000;

export class LocationTimeoutError extends Error {
  constructor(message = 'Location request timed out.') {
    super(message);
    this.name = 'LocationTimeoutError';
  }
}

export async function getForegroundLocationPermission(): Promise<{
  status: Location.PermissionStatus;
  canAskAgain: boolean;
  granted: boolean;
}> {
  const existing = await Location.getForegroundPermissionsAsync();
  return {
    status: existing.status,
    canAskAgain: existing.canAskAgain,
    granted: existing.granted,
  };
}

export async function requestForegroundLocationPermission(): Promise<{
  status: Location.PermissionStatus;
  canAskAgain: boolean;
  granted: boolean;
}> {
  const result = await Location.requestForegroundPermissionsAsync();
  return {
    status: result.status,
    canAskAgain: result.canAskAgain,
    granted: result.granted,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new LocationTimeoutError(`${label} timed out after ${ms}ms.`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function getCurrentMatchLocation(): Promise<MatchCoords> {
  try {
    const position = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      LOCATION_TIMEOUT_MS,
      'Current location'
    );
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch (err) {
    // Fallback: last known fix (avoids endless spinner when GPS never returns).
    try {
      const last = await withTimeout(
        Location.getLastKnownPositionAsync({
          maxAge: 1000 * 60 * 30,
          requiredAccuracy: 5000,
        }),
        5_000,
        'Last known location'
      );
      if (last?.coords) {
        return {
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
        };
      }
    } catch {
      // fall through
    }
    throw err;
  }
}

export async function openAppSettings(): Promise<void> {
  if (Platform.OS === 'ios') {
    await Linking.openURL('app-settings:');
    return;
  }
  await Linking.openSettings();
}
