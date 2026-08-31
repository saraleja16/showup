import * as Location from 'expo-location';
import { SYDNEY_CENTER } from './home-map-data';

export type LatLng = { lat: number; lng: number };

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function getMapUserLocation(): Promise<LatLng> {
  try {
    const { status } = await withTimeout(
      Location.requestForegroundPermissionsAsync(),
      5000,
      { status: Location.PermissionStatus.DENIED, expires: 'never' as const, granted: false, canAskAgain: false },
    );
    if (status !== 'granted') {
      console.log('[map-location] Permission denied, using Sydney fallback');
      return SYDNEY_CENTER;
    }

    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      8000,
      null,
    );
    if (!position) {
      console.log('[map-location] Location timed out, using Sydney fallback');
      return SYDNEY_CENTER;
    }
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch (err) {
    console.warn('[map-location] Error getting location, using Sydney fallback:', err);
    return SYDNEY_CENTER;
  }
}
