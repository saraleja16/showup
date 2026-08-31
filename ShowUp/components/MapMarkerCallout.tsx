import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { HomeMapMarker } from '@/lib/home-map-data';
import { resolveMarkerStyle } from '@/lib/map-marker-style';
import { Ionicons } from '@expo/vector-icons';
import { SportIcon } from '@/src/components/SportIcon';
import { EventCountdown } from '@/src/components/event-status/EventCountdown';
import { getEventEndMs, resolveEventPhase } from '@/src/live/gamePhase';
import { useServerClock } from '@/src/live/useServerClock';

type Props = {
  marker: HomeMapMarker;
  onClose: () => void;
  onOpenEvent?: (eventId: string) => void;
  onJoinEvent?: (eventId: string) => void;
};

function formatWhen(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();
  return `${date} · ${time}`;
}

export function MapMarkerCallout({ marker, onClose, onOpenEvent, onJoinEvent }: Props) {
  const visual = resolveMarkerStyle(marker.source, marker.sportId);
  const when = formatWhen(marker.scheduledAt);
  const spots =
    marker.kind === 'event' && marker.spotsLeft != null
      ? `${marker.spotsLeft} spot${marker.spotsLeft === 1 ? '' : 's'} left`
      : null;
  const { nowMs } = useServerClock({ tick: Boolean(marker.scheduledAt) });
  const startMs = marker.scheduledAt ? new Date(marker.scheduledAt).getTime() : NaN;
  const endMs = marker.scheduledAt ? getEventEndMs(marker.scheduledAt, marker.sportId) : NaN;
  const phase =
    marker.kind === 'event' && marker.scheduledAt
      ? resolveEventPhase({
          scheduledAt: marker.scheduledAt,
          sport: marker.sportId,
          nowMs,
        })
      : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View
            style={[
              styles.emojiWrap,
              {
                backgroundColor: visual.backgroundColor,
                borderColor: visual.borderColor,
              },
            ]}
          >
            <SportIcon sportId={marker.sportId} size={18} color={visual.iconColor} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.sport}>{marker.sport.toUpperCase()}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {marker.name}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.xBtn}>
            <Ionicons name="close" size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.statusPill,
            { borderColor: visual.borderColor, backgroundColor: `${visual.backgroundColor}cc` },
          ]}
        >
          <Text style={styles.statusText}>
            {phase === 'live'
              ? '● LIVE NOW'
              : phase === 'starting_soon'
                ? 'STARTING SOON'
                : phase === 'finished' || phase === 'result_pending' || phase === 'completed'
                  ? phase.replace('_', ' ').toUpperCase()
                  : visual.statusLabel}
          </Text>
        </View>

        <View style={styles.iconRow}>
          <Ionicons name="location-outline" size={12} color="#9ca3af" />
          <Text style={styles.rowInline} numberOfLines={1}>
            {marker.location}
          </Text>
        </View>
        {when ? <Text style={styles.row}>{when}</Text> : null}
        {phase && Number.isFinite(startMs) ? (
          <EventCountdown phase={phase} startMs={startMs} endMs={endMs} nowMs={nowMs} compact />
        ) : null}
        {marker.kind === 'venue' && marker.skillLevel ? (
          <Text style={styles.row} numberOfLines={1}>
            {marker.skillLevel}
          </Text>
        ) : null}
        {spots ? <Text style={styles.spots}>{spots}</Text> : null}

        <View style={styles.actions}>
          {marker.eventId && onOpenEvent ? (
            <TouchableOpacity
              onPress={() => onOpenEvent(marker.eventId!)}
              style={styles.secondaryBtn}
              hitSlop={6}
            >
              <Text style={styles.secondaryText}>View</Text>
            </TouchableOpacity>
          ) : null}
          {marker.eventId && onJoinEvent ? (
            <TouchableOpacity
              onPress={() => onJoinEvent(marker.eventId!)}
              style={styles.primaryBtn}
              hitSlop={6}
            >
              <Text style={styles.primaryText}>Join</Text>
            </TouchableOpacity>
          ) : null}
          {!marker.eventId ? (
            <TouchableOpacity onPress={onClose} style={styles.secondaryBtn} hitSlop={6}>
              <Text style={styles.secondaryText}>Close</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    zIndex: 20,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.4)',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emojiWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  rowInline: { color: '#9ca3af', fontSize: 12, flexShrink: 1 },
  headerText: { flex: 1, minWidth: 0 },
  sport: { color: '#a8ff3e', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  name: { color: '#fff', fontSize: 15, fontWeight: '700' },
  xBtn: { padding: 4 },
  xText: { color: '#9ca3af', fontSize: 16, fontWeight: '700' },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { color: '#e5e7eb', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  row: { color: '#9ca3af', fontSize: 12, marginTop: 8 },
  spots: { color: '#a8ff3e', fontSize: 12, fontWeight: '700', marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#a8ff3e',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryText: { color: '#111827', fontWeight: '800', fontSize: 13 },
  secondaryBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.45)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: { color: '#a8ff3e', fontWeight: '800', fontSize: 13 },
});
