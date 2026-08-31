const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

export async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  if (!address.trim()) return null;
  const encoded = encodeURIComponent(address.trim());
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GOOGLE_MAPS_API_KEY}`;
  try {
    console.log('[geocode] searching location:', address.trim());
    const res = await fetch(url);
    const json = await res.json();
    console.log('[geocode] Google status:', json.status);
    console.log('[geocode] Google error_message:', json.error_message ?? null);
    console.log('[geocode] results returned:', json.results?.length ?? 0);
    if (json.status !== 'OK' || !json.results?.length) return null;
    const { lat, lng } = json.results[0].geometry.location;
    return { latitude: lat, longitude: lng };
  } catch {
    return null;
  }
}
