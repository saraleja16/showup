import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useRouter } from 'expo-router';
import type { EventItem, Venue } from '@/src/api';
import {
  eventsAndVenuesToMarkers,
  regionForPoints,
  regionForSearch,
  SYDNEY_CENTER,
  type HomeMapMarker,
  type LatLng,
} from '@/lib/home-map-data';
import { getMapUserLocation } from '@/lib/map-location';
import { MapMarkerCallout } from './MapMarkerCallout';
import { MapSportMarker } from './MapSportMarker';

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
  /** When true, hide the "events near you" badge count style for AI search. */
  searchActive?: boolean;
  badgeLabel?: string | null;
};

type MapBodyProps = {
  region: Region;
  eventMarkers: HomeMapMarker[];
  venueMarkers: HomeMapMarker[];
  selected: HomeMapMarker | null;
  onSelect: (marker: HomeMapMarker | null) => void;
  onOpenEvent?: (eventId: string) => void;
  onJoinEvent?: (eventId: string) => void;
  showBadge?: boolean;
  badgeText?: string;
  fitKey: string;
};

function MapBody({
  region,
  eventMarkers,
  venueMarkers,
  selected,
  onSelect,
  onOpenEvent,
  onJoinEvent,
  showBadge,
  badgeText,
  fitKey,
}: MapBodyProps) {
  const mapRef = useRef<MapView>(null);
  const lastFitKey = useRef<string>('');

  useEffect(() => {
    if (fitKey === lastFitKey.current) return;
    lastFitKey.current = fitKey;
    mapRef.current?.animateToRegion(region, 450);
  }, [fitKey, region]);

  const allMarkers = [...eventMarkers, ...venueMarkers];

  return (
    <View style={styles.fill}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'ios' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        mapType="standard"
        scrollEnabled
        zoomEnabled
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation
        showsMyLocationButton
      >
        {allMarkers.map((item) => (
          <Marker
            key={item.id}
            coordinate={{ latitude: item.lat, longitude: item.lng }}
            tracksViewChanges
            onPress={() => onSelect(item)}
          >
            <MapSportMarker source={item.source} sportId={item.sportId} />
          </Marker>
        ))}
      </MapView>
      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {badgeText ??
              `${eventMarkers.length} event${eventMarkers.length === 1 ? '' : 's'} near you`}
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
  searchCentre = null,
  searchActive = false,
  badgeLabel = null,
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
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSelected(null);
    setExpandedSelected(null);
  }, [sportFilter, searchCentre?.lat, searchCentre?.lng]);

  const deviceFallback = userLoc ?? SYDNEY_CENTER;
  const allPoints = useMemo(
    () => [...eventMarkers, ...venueMarkers].map((m) => ({ lat: m.lat, lng: m.lng })),
    [eventMarkers, venueMarkers],
  );

  const region = useMemo(() => {
    if (searchCentre) {
      const centre: LatLng = { lat: searchCentre.lat, lng: searchCentre.lng };
      return regionForSearch(allPoints, centre, searchCentre.radiusKm ?? 10);
    }
    return regionForPoints(allPoints, deviceFallback);
  }, [allPoints, searchCentre, deviceFallback]);

  const fitKey = [
    sportFilter,
    searchCentre ? `${searchCentre.lat.toFixed(4)},${searchCentre.lng.toFixed(4)}` : 'device',
    searchCentre?.radiusKm ?? '',
    eventMarkers.map((m) => m.id).join(','),
    venueMarkers.map((m) => m.id).join(','),
  ].join(':');

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

  const resolvedBadge =
    badgeLabel ??
    (searchActive && searchCentre?.name
      ? `${eventMarkers.length + venueMarkers.length} near ${searchCentre.name}`
      : undefined);

  // While waiting for device GPS, still show map immediately if AI search centre exists.
  const showMap = !locLoading || Boolean(searchCentre);

  return (
    <>
      <View style={[styles.container, { height }]}>
        {!showMap ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#a8ff3e" />
          </View>
        ) : (
          <MapBody
            region={region}
            eventMarkers={eventMarkers}
            venueMarkers={venueMarkers}
            selected={selected}
            onSelect={setSelected}
            onOpenEvent={openEvent}
            onJoinEvent={onJoinEvent ? joinEvent : undefined}
            fitKey={fitKey}
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

      <Modal
        visible={expanded}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setExpanded(false)}
      >
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {searchCentre?.name ? `Near ${searchCentre.name}` : 'Nearby activity'}
            </Text>
            <Pressable onPress={() => setExpanded(false)} hitSlop={12} style={styles.closeModalBtn}>
              <Text style={styles.closeModalText}>Close</Text>
            </Pressable>
          </View>
          <MapBody
            region={region}
            eventMarkers={eventMarkers}
            venueMarkers={venueMarkers}
            selected={expandedSelected}
            onSelect={setExpandedSelected}
            onOpenEvent={openEvent}
            onJoinEvent={onJoinEvent ? joinEvent : undefined}
            showBadge
            badgeText={resolvedBadge}
            fitKey={`expanded:${fitKey}`}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#e8e8e8',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 28,
  },
  fill: { flex: 1 },
  map: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8e8e8',
  },
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
  expandText: {
    color: '#a8ff3e',
    fontSize: 16,
    fontWeight: '700',
  },
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
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
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
