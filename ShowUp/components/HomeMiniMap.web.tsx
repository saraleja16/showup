import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { EventItem, Venue } from '@/src/api';
import {
  eventsAndVenuesToMarkers,
  SYDNEY_CENTER,
  type HomeMapMarker,
} from '@/lib/home-map-data';
import { getMapUserLocation } from '@/lib/map-location';
import { resolveMarkerStyle } from '@/lib/map-marker-style';
import { normalizeSportKey } from '@/lib/sport-match';
import { MapMarkerCallout } from './MapMarkerCallout';
import { pickleballSvgMarkup } from './PickleballIcon';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

function loadGoogleMapsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.google?.maps) {
      resolve();
      return;
    }
    const existing = document.getElementById('google-maps-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google Maps script failed')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps script failed'));
    document.head.appendChild(script);
  });
}

export type MapSearchCentre = {
  lat: number;
  lng: number;
  name?: string;
  radiusKm?: number | null;
};

type Props = {
  sportFilter: string;
  events: EventItem[];
  venues: Venue[];
  height?: number;
  onJoinEvent?: (eventId: string) => void;
  /** Backend-resolved AI search centre. Overrides device GPS while active. */
  searchCentre?: MapSearchCentre | null;
  /** When true, apply AI-search badge style instead of "events near you" count. */
  searchActive?: boolean;
  badgeLabel?: string | null;
};

type GoogleMapPaneProps = {
  mapId: string;
  center: { lat: number; lng: number };
  zoom: number;
  eventMarkers: HomeMapMarker[];
  venueMarkers: HomeMapMarker[];
  selected: HomeMapMarker | null;
  onSelect: (marker: HomeMapMarker | null) => void;
  onOpenEvent?: (eventId: string) => void;
  onJoinEvent?: (eventId: string) => void;
  showBadge?: boolean;
  badgeText?: string;
  fitKey: string;
  searchCentre?: { lat: number; lng: number } | null;
};

function buildPinElement(item: HomeMapMarker): HTMLButtonElement {
  const visual = resolveMarkerStyle(item.source, item.sportId);
  const wrap = document.createElement('button');
  wrap.type = 'button';
  wrap.setAttribute('aria-label', item.name);
  wrap.style.cssText = `
    position:relative;width:${visual.size}px;height:${visual.size}px;padding:0;margin:0;
    border-radius:50%;background:${visual.backgroundColor};border:1.5px solid ${visual.borderColor};
    cursor:pointer;display:flex;align-items:center;justify-content:center;
    box-shadow:0 0 8px ${visual.glowColor}66;font-size:${Math.round(visual.size * 0.42)}px;
  `;

  const iconSize = Math.round(visual.size * 0.46);
  if (normalizeSportKey(item.sportId) === 'pickleball') {
    const icon = document.createElement('span');
    icon.style.cssText = 'line-height:0;pointer-events:none;display:flex;';
    icon.innerHTML = pickleballSvgMarkup(visual.iconColor, iconSize);
    wrap.appendChild(icon);
  } else {
    const icon = document.createElement('span');
    icon.textContent = item.emoji;
    icon.style.cssText = 'line-height:1;pointer-events:none;';
    wrap.appendChild(icon);
  }

  if (visual.badge) {
    const badge = document.createElement('span');
    badge.textContent = visual.badge === 'booked' ? '✓' : '+';
    badge.style.cssText = `
      position:absolute;right:-2px;bottom:-2px;width:14px;height:14px;border-radius:50%;
      background:${visual.badge === 'booked' ? '#064e3b' : '#1e3a8a'};color:#fff;
      font-size:8px;font-weight:900;display:flex;align-items:center;justify-content:center;
      border:1px solid #0b1220;line-height:1;
    `;
    wrap.appendChild(badge);
  }

  return wrap;
}

function GoogleMapPane({
  mapId,
  center,
  zoom,
  eventMarkers,
  venueMarkers,
  selected,
  onSelect,
  onOpenEvent,
  onJoinEvent,
  showBadge,
  badgeText,
  fitKey,
  searchCentre,
}: GoogleMapPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const lastFitKey = useRef('');

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
          center,
          zoom,
          mapId,
          disableDefaultUI: false,
          zoomControl: true,
          gestureHandling: 'greedy',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;
        setMapReady(true);
      })
      .catch((err) => {
        console.error('[home-map] Google Maps failed to load:', err);
      });

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => { m.map = null; });
      markersRef.current = [];
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (fitKey === lastFitKey.current) return;
    lastFitKey.current = fitKey;

    const points = [...eventMarkers, ...venueMarkers];
    if (points.length === 0) {
      map.panTo(center);
      map.setZoom(zoom);
      return;
    }
    if (points.length === 1) {
      map.panTo({ lat: points[0].lat, lng: points[0].lng });
      map.setZoom(13);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 48);
    const listener = google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
      const z = map.getZoom();
      if (z != null && z > 14) map.setZoom(14);
      if (z != null && z < 11) map.setZoom(11);
    });
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [mapReady, fitKey, eventMarkers, venueMarkers, center, zoom]);

  // Pan to AI search centre when it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !searchCentre) return;
    map.panTo({ lat: searchCentre.lat, lng: searchCentre.lng });
    map.setZoom(13);
  }, [mapReady, searchCentre]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    markersRef.current.forEach((m) => { m.map = null; });
    markersRef.current = [];

    const attach = (item: HomeMapMarker) => {
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: item.lat, lng: item.lng },
        content: buildPinElement(item),
        title: item.name,
      });
      marker.addListener('click', () => onSelect(item));
      markersRef.current.push(marker);
    };

    eventMarkers.forEach(attach);
    venueMarkers.forEach(attach);
  }, [mapReady, eventMarkers, venueMarkers, onSelect]);

  return (
    <View style={styles.fill}>
      <View
        ref={(node) => {
          containerRef.current = node as unknown as HTMLDivElement | null;
        }}
        style={styles.mapDiv}
      />
      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {badgeText ?? `${eventMarkers.length} event${eventMarkers.length === 1 ? '' : 's'} near you`}
          </Text>
        </View>
      ) : null}
      {selected ? (
        <MapMarkerCallout
          marker={selected}
          onClose={() => onSelect(null)}
          onOpenEvent={onOpenEvent}
          onJoinEvent={onJoinEvent}
        />
      ) : null}
    </View>
  );
}

export default function HomeMiniMap({
  sportFilter,
  events,
  venues,
  height = 180,
  onJoinEvent,
  searchCentre,
  searchActive,
  badgeLabel,
}: Props) {
  const router = useRouter();
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<HomeMapMarker | null>(null);
  const [expandedSelected, setExpandedSelected] = useState<HomeMapMarker | null>(null);
  const [locLoading, setLocLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const { eventMarkers, venueMarkers } = useMemo(
    () => eventsAndVenuesToMarkers(events, venues, sportFilter),
    [events, venues, sportFilter],
  );

  useEffect(() => {
    let active = true;
    getMapUserLocation().then((loc) => {
      if (active) {
        setUserLoc(loc);
        setLocLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setSelected(null);
    setExpandedSelected(null);
  }, [sportFilter]);

  const center = searchCentre
    ? { lat: searchCentre.lat, lng: searchCentre.lng }
    : (userLoc ?? SYDNEY_CENTER);
  const fitKey = `${sportFilter}:${eventMarkers.map((m) => m.id).join(',')}:${venueMarkers.map((m) => m.id).join(',')}`;

  const openEvent = (eventId: string) => {
    setExpanded(false);
    setSelected(null);
    setExpandedSelected(null);
    router.push({ pathname: '/event/[id]', params: { id: eventId } });
  };

  const joinEvent = (eventId: string) => {
    setSelected(null);
    setExpandedSelected(null);
    onJoinEvent?.(eventId);
  };

  return (
    <>
      <View style={[styles.container, { height }]}>
        {locLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#a8ff3e" />
          </View>
        ) : (
          <GoogleMapPane
            mapId="showup-home-map"
            center={center}
            zoom={12}
            eventMarkers={eventMarkers}
            venueMarkers={venueMarkers}
            selected={selected}
            onSelect={setSelected}
            onOpenEvent={openEvent}
            onJoinEvent={onJoinEvent ? joinEvent : undefined}
            fitKey={fitKey}
            searchCentre={searchCentre ?? null}
            showBadge={searchActive || Boolean(badgeLabel)}
            badgeText={badgeLabel ?? undefined}
          />
        )}
        <Pressable
          style={styles.expandBtn}
          onPress={() => setExpanded(true)}
          hitSlop={8}
          accessibilityLabel="Expand map"
        >
          <Text style={styles.expandText}>⛶</Text>
        </Pressable>
      </View>

      <Modal visible={expanded} animationType="slide" onRequestClose={() => setExpanded(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nearby activity</Text>
            <Pressable onPress={() => setExpanded(false)} hitSlop={12} style={styles.closeModalBtn}>
              <Text style={styles.closeModalText}>Close</Text>
            </Pressable>
          </View>
          <GoogleMapPane
            mapId="showup-home-map-expanded"
            center={center}
            zoom={12}
            eventMarkers={eventMarkers}
            venueMarkers={venueMarkers}
            selected={expandedSelected}
            onSelect={setExpandedSelected}
            onOpenEvent={openEvent}
            onJoinEvent={onJoinEvent ? joinEvent : undefined}
            showBadge
            badgeText={badgeLabel ?? undefined}
            fitKey={`expanded:${fitKey}`}
            searchCentre={searchCentre ?? null}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111827',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 28,
  },
  fill: { flex: 1, position: 'relative' },
  mapDiv: { width: '100%', height: '100%' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  expandBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  expandText: { color: '#a8ff3e', fontSize: 16, fontWeight: '700' },
  badge: {
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    borderColor: 'rgba(168, 255, 62, 0.3)',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 32,
    paddingHorizontal: 16,
    paddingVertical: 8,
    position: 'absolute',
    alignSelf: 'center',
  },
  badgeText: { color: '#a8ff3e', fontSize: 13, fontWeight: '700' },
  modalRoot: { flex: 1, backgroundColor: '#1a1a2e' },
  modalHeader: {
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168, 255, 62, 0.25)',
  },
  modalTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  closeModalBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  closeModalText: { color: '#a8ff3e', fontSize: 14, fontWeight: '700' },
});
