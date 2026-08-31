import type { EventItem, Venue } from '@/src/api';
import {
  filterEventsBySport,
  matchesSport,
  normalizeSportKey,
  sportIconEmoji,
  sportLabel,
} from '@/lib/sport-match';
import type { MarkerSource } from '@/lib/map-marker-style';

// Re-export shared sport helpers so existing imports keep working.
export {
  filterEventsBySport,
  matchesSport,
  normalizeSportKey,
  sportIconEmoji,
  sportLabel,
} from '@/lib/sport-match';

export const SYDNEY_CENTER = { lat: -33.8688, lng: 151.2093 };

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export type MapMarkerKind = 'event' | 'venue';

export type HomeMapMarker = {
  id: string;
  kind: MapMarkerKind;
  source: MarkerSource;
  lat: number;
  lng: number;
  name: string;
  sport: string;
  sportId: string;
  location: string;
  emoji: string;
  eventId?: string;
  venueId?: string;
  scheduledAt?: string;
  skillLevel?: string;
  spotsLeft?: number;
  participantCount?: number;
  maxPlayers?: number;
};

export function sportEmoji(sportId?: string | null): string {
  return sportIconEmoji(sportId);
}

export function venueSportsList(sports: Venue['sports']): string[] {
  if (Array.isArray(sports)) {
    return sports.flatMap((s) => String(s).split(/[,|/]/)).map((x) => x.trim()).filter(Boolean);
  }
  if (typeof sports === 'string' && sports.trim()) {
    return sports.split(/[,|/]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function venueMatchesSport(venue: Venue, filter: string): boolean {
  const sports = venueSportsList(venue.sports);
  if (sports.length === 0) return true;
  return sports.some((s) => matchesSport(s, filter));
}

export function parseCoord(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function hasValidCoords(lat: unknown, lng: unknown): boolean {
  const a = parseCoord(lat);
  const b = parseCoord(lng);
  if (a === null || b === null) return false;
  if (a < -90 || a > 90 || b < -180 || b > 180) return false;
  return true;
}

export function filterVenuesBySport(venues: Venue[], sportFilter: string): Venue[] {
  return venues.filter((v) => venueMatchesSport(v, sportFilter));
}

function venueKey(id: string | number | undefined | null): string | null {
  if (id === undefined || id === null || id === '') return null;
  return String(id);
}

/**
 * - Every EventItem is a created/booked activity → emerald (centre_booked)
 * - Venue with no matching Event.venueId → available centre (blue)
 * - Does not require event-centre fields for events to appear
 */
export function eventsAndVenuesToMarkers(
  events: EventItem[],
  venues: Venue[],
  sportFilter: string,
): { eventMarkers: HomeMapMarker[]; venueMarkers: HomeMapMarker[] } {
  const filteredEvents = filterEventsBySport(events, sportFilter);
  const filteredVenues = filterVenuesBySport(venues, sportFilter);

  const venueById = new Map<string, Venue>();
  for (const v of filteredVenues) {
    venueById.set(String(v.id), v);
  }

  const bookedVenueIds = new Set<string>();
  for (const e of filteredEvents) {
    const key = venueKey(e.venueId);
    if (key) bookedVenueIds.add(key);
  }

  const eventMarkers: HomeMapMarker[] = [];
  for (const event of filteredEvents) {
    const lat = parseCoord(event.latitude);
    const lng = parseCoord(event.longitude);
    if (lat === null || lng === null || !hasValidCoords(lat, lng)) continue;

    const sportId = normalizeSportKey(event.sport) || 'unknown';
    const vKey = venueKey(event.venueId);
    const linkedVenue = vKey ? venueById.get(vKey) : undefined;

    // Created/booked events always use green status styling
    const source: MarkerSource = 'centre_booked';

    eventMarkers.push({
      id: `event-${event.id}`,
      kind: 'event',
      source,
      lat,
      lng,
      name: event.title,
      sport: sportLabel(sportId || event.sport),
      sportId,
      location: event.venueName ?? linkedVenue?.name ?? 'Nearby',
      emoji: sportIconEmoji(sportId || event.sport),
      eventId: event.id,
      venueId: vKey ?? undefined,
      scheduledAt: event.scheduledAt,
      skillLevel: event.sportDetails?.skillLevel,
      spotsLeft: Math.max(0, (event.maxPlayers ?? 0) - (event.participantCount ?? 0)),
      participantCount: event.participantCount,
      maxPlayers: event.maxPlayers,
    });
  }

  const venueMarkers: HomeMapMarker[] = [];
  for (const venue of filteredVenues) {
    const key = String(venue.id);
    if (bookedVenueIds.has(key)) continue;

    const lat = parseCoord(venue.latitude);
    const lng = parseCoord(venue.longitude);
    if (lat === null || lng === null || !hasValidCoords(lat, lng)) continue;

    const sports = venueSportsList(venue.sports);
    const matched = sports.find((s) => matchesSport(s, sportFilter));
    const sportId = normalizeSportKey(matched ?? sportFilter ?? sports[0]);

    venueMarkers.push({
      id: `venue-${venue.id}`,
      kind: 'venue',
      source: 'centre_available',
      lat,
      lng,
      name: venue.name,
      sport: sportLabel(sportId),
      sportId,
      location: venue.address,
      emoji: sportIconEmoji(sportId),
      venueId: key,
      skillLevel: sports.map((s) => sportLabel(s)).join(' · ') || 'Venue',
    });
  }

  return { eventMarkers, venueMarkers };
}

export type LatLng = { lat: number; lng: number };

/** Approximate map region for a searched place + radius (km). */
export function regionForRadius(
  centre: LatLng,
  radiusKm: number,
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } {
  const r = Math.max(radiusKm, 1);
  // ~111 km per degree latitude; pad so the radius circle is comfortably visible.
  const latitudeDelta = Math.min(Math.max((r * 2.4) / 111, 0.035), 0.45);
  const cosLat = Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.2);
  const longitudeDelta = Math.min(Math.max(latitudeDelta / cosLat, 0.035), 0.55);
  return {
    latitude: centre.lat,
    longitude: centre.lng,
    latitudeDelta,
    longitudeDelta,
  };
}

/**
 * Prefer fitting markers; always honour a searched centre + radius as a minimum span
 * so empty or sparse results still show the intended search area.
 */
export function regionForSearch(
  points: LatLng[],
  centre: LatLng | null,
  radiusKm: number | null | undefined,
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } {
  const radius = radiusKm != null && radiusKm > 0 ? radiusKm : 10;

  if (centre && points.length === 0) {
    return regionForRadius(centre, radius);
  }

  if (centre && points.length > 0) {
    const fitted = regionForPoints([...points, centre], centre);
    const byRadius = regionForRadius(centre, radius);
    return {
      latitude: fitted.latitude,
      longitude: fitted.longitude,
      latitudeDelta: Math.max(fitted.latitudeDelta, byRadius.latitudeDelta * 0.85),
      longitudeDelta: Math.max(fitted.longitudeDelta, byRadius.longitudeDelta * 0.85),
    };
  }

  if (points.length > 0) {
    return regionForPoints(points, points[0]);
  }

  return regionForPoints([], SYDNEY_CENTER);
}

export function regionForPoints(
  points: LatLng[],
  fallback: LatLng,
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } {
  if (points.length === 0) {
    return {
      latitude: fallback.lat,
      longitude: fallback.lng,
      latitudeDelta: 0.06,
      longitudeDelta: 0.06,
    };
  }

  if (points.length === 1) {
    return {
      latitude: points[0].lat,
      longitude: points[0].lng,
      latitudeDelta: 0.045,
      longitudeDelta: 0.045,
    };
  }

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }

  const latSpan = Math.max(maxLat - minLat, 0.02);
  const lngSpan = Math.max(maxLng - minLng, 0.02);
  const pad = 1.45;

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.min(Math.max(latSpan * pad, 0.035), 0.22),
    longitudeDelta: Math.min(Math.max(lngSpan * pad, 0.035), 0.22),
  };
}
