import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import HomeMiniMap, { type MapSearchCentre } from '@/components/HomeMiniMap';
import { EventStatusCard } from '@/src/components/event-status';
import {
  aiSearchEvents,
  getApiErrorMessage,
  getEvents,
  getUnreadNotificationCount,
  getVenues,
  isApiError,
  isNetworkError,
  joinEvent,
  type EventItem,
  type InterpretedEventFilters,
  type Venue,
} from '@/src/api';
import { useSession } from '@/src/auth';
import { CHECK_IN_WINDOW_CLOSE_MS, CHECK_IN_WINDOW_OPEN_MS } from '@/src/constants/checkInWindow';
import NotificationsModal from '@/src/components/NotificationsModal';
import { SportIcon } from '@/src/components/SportIcon';
import { filterEventsBySport, normalizeSportKey, sportLabel } from '@/lib/sport-match';
import { ENABLED_SPORTS, SPORTS } from '@/src/sports/registry';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_FILTER_ID = '';
const FILTERS = [
  { id: ALL_FILTER_ID, label: 'All' },
  ...ENABLED_SPORTS.map((id) => ({ id, label: SPORTS[id].label })),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayCount(e: EventItem): number {
  return e.hasPositions ? (e.claimedCount ?? 0) : e.participantCount;
}

function calcSpotsLeft(e: EventItem): number {
  return e.maxPlayers - displayCount(e);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Now';
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return '<1m';
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days >= 1) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function shortLocationLabel(name?: string | null, fallback?: string | null): string | null {
  const raw = (name ?? fallback ?? '').trim();
  if (!raw) return null;
  // "Wollongong NSW, Australia" → "Wollongong"
  return raw.split(',')[0]?.trim() || raw;
}

function formatAiFilterSummary(filters: InterpretedEventFilters): string {
  const parts: string[] = [];
  const sportId = normalizeSportKey(filters.sport);
  if (sportId) parts.push(sportLabel(sportId));

  const place = shortLocationLabel(filters.resolvedLocation?.name, filters.locationQuery);
  if (place) parts.push(place);

  if (filters.date) {
    try {
      const d = new Date(`${filters.date}T12:00:00Z`);
      const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      if (filters.startTime === '17:00' && filters.endTime === '22:00') {
        parts.push(`${day} evening`);
      } else {
        parts.push(day);
        if (filters.startTime || filters.endTime) {
          if (filters.startTime && filters.endTime) parts.push(`${filters.startTime}–${filters.endTime}`);
          else if (filters.startTime) parts.push(`from ${filters.startTime}`);
          else if (filters.endTime) parts.push(`until ${filters.endTime}`);
        }
      }
    } catch {
      parts.push(filters.date);
    }
  } else if (filters.startTime || filters.endTime) {
    if (filters.startTime === '17:00' && filters.endTime === '22:00') parts.push('Evening');
    else if (filters.startTime && filters.endTime) parts.push(`${filters.startTime}–${filters.endTime}`);
    else if (filters.startTime) parts.push(`from ${filters.startTime}`);
    else if (filters.endTime) parts.push(`until ${filters.endTime}`);
  }

  if (filters.radiusKm != null) parts.push(`${filters.radiusKm} km`);
  if (filters.skillLevel) parts.push(String(filters.skillLevel));

  return parts.length > 0 ? parts.join(' · ') : 'Nearby games';
}

function isVenueIntent(intent?: string | null): boolean {
  const t = (intent ?? '').toLowerCase();
  return t === 'venue' || t === 'eventcentre' || t === 'event_centre' || t === 'eventcenter';
}

function emptyAiResultMessage(filters: InterpretedEventFilters | null, venueMode: boolean): string {
  const place =
    shortLocationLabel(filters?.resolvedLocation?.name, filters?.locationQuery) ?? 'that location';
  const sportId = normalizeSportKey(filters?.sport);
  const sportName = sportId ? sportLabel(sportId) : null;
  if (venueMode) {
    return sportName
      ? `No ${sportName} venues found near ${place}.`
      : `No venues found near ${place}.`;
  }
  return sportName
    ? `No ${sportName} games found near ${place}.`
    : `No matching games found near ${place}.`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Header({ unreadCount, onBellPress }: { unreadCount: number; onBellPress: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.logoRow}>
        <Text style={styles.logoWhite}>SHOW</Text>
        <Text style={styles.logoGreen}>UP</Text>
      </View>
      <Pressable onPress={onBellPress} hitSlop={12} style={styles.bellWrap}>
        <Ionicons name="notifications-outline" size={22} color="#e5e7eb" />
        {unreadCount > 0 && (
          <View style={styles.bellBadge}>
            <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function SearchBar({
  value,
  onChangeText,
  onSubmit,
  loading,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <View style={styles.searchBar}>
      <Ionicons name="search" size={16} color="#6b7280" style={styles.searchIcon} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder='Try "tennis within 5 km"…'
        placeholderTextColor="#6b7280"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        editable={!loading}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      {loading ? (
        <ActivityIndicator size="small" color="#a8ff3e" />
      ) : (
        <Ionicons name="sparkles" size={16} color="rgba(168, 255, 62, 0.55)" />
      )}
    </View>
  );
}

function FilterChips({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsRow}
    >
      {FILTERS.map((f) => {
        const active = f.id === selected;
        return (
          <TouchableOpacity
            key={f.id}
            onPress={() => onSelect(f.id)}
            style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function EmptyNearby({ sportId, onCreate }: { sportId: string; onCreate: () => void }) {
  const label = sportId ? sportLabel(sportId).toLowerCase() : null;
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyText}>
        {label ? `No ${label} games nearby yet` : 'No games nearby yet'}
      </Text>
      <Text style={styles.emptySub}>Be the first to put one on the map.</Text>
      <Pressable
        onPress={onCreate}
        style={({ pressed }) => [styles.emptyCta, pressed && styles.emptyCtaPressed]}
      >
        <Text style={styles.emptyCtaText}>
          {label ? `Create ${sportLabel(sportId)} event` : 'Create event'}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Upcoming action area ──────────────────────────────────────────────────────

function UpcomingActions({
  event,
  now,
  userId,
}: {
  event: EventItem;
  now: number;
  userId: string;
}) {
  const router = useRouter();

  if (event.myStatus === 'Attended') {
    return (
      <View style={[styles.actionButton, styles.actionAttended]}>
        <Ionicons name="checkmark" size={16} color="#1a1a2e" />
        <Text style={styles.actionAttendedText}>Checked in</Text>
      </View>
    );
  }

  const startMs = new Date(event.scheduledAt).getTime();
  const windowOpen = startMs - CHECK_IN_WINDOW_OPEN_MS;
  const windowClose = startMs + CHECK_IN_WINDOW_CLOSE_MS;
  const isCreator = event.creatorId === userId;

  // Check-in window is open and user is a registered participant (not the creator)
  if (
    !isCreator &&
    event.myStatus === 'Registered' &&
    now >= windowOpen &&
    now <= windowClose
  ) {
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
        style={({ pressed }) => [styles.actionButton, styles.actionCta, pressed && styles.pressed]}
      >
        <Text style={styles.actionCtaText}>Check in</Text>
      </Pressable>
    );
  }

  const msUntil = startMs - now;
  const pendingCount = isCreator ? (event.pendingRequestCount ?? 0) : 0;

  return (
    <View>
      {pendingCount > 0 && (
        <View style={[styles.actionButton, styles.actionHostBadge]}>
          <Ionicons name="person-add-outline" size={13} color="#1a1a2e" />
          <Text style={styles.actionHostBadgeText}>
            {pendingCount} pending {pendingCount === 1 ? 'request' : 'requests'}
          </Text>
        </View>
      )}
      <View style={[styles.countdownWrap, pendingCount > 0 && { marginTop: 8 }]}>
        {msUntil > 0 ? (
          <>
            <Text style={styles.countdownLabel}>Starts in</Text>
            <Text style={styles.countdownValue}>{formatCountdown(msUntil)}</Text>
          </>
        ) : (
          <Text style={styles.countdownValue}>Underway</Text>
        )}
      </View>
    </View>
  );
}

// ── Pending-request action area ───────────────────────────────────────────────

function PendingActions({ event, now }: { event: EventItem; now: number }) {
  const startMs = new Date(event.scheduledAt).getTime();
  const msUntil = startMs - now;
  return (
    <View>
      {msUntil > 0 && (
        <View style={[styles.countdownWrap, { marginBottom: 10 }]}>
          <Text style={styles.countdownLabel}>Starts in</Text>
          <Text style={styles.countdownValue}>{formatCountdown(msUntil)}</Text>
        </View>
      )}
      <View style={[styles.actionButton, styles.actionPending]}>
        <Text style={styles.actionPendingText}>Pending request</Text>
      </View>
    </View>
  );
}

// ── Near You action area ──────────────────────────────────────────────────────

function NearYouActions({ event, onLegacyJoin }: { event: EventItem; onLegacyJoin: () => void }) {
  const router = useRouter();
  const spotsLeft = calcSpotsLeft(event);

  if (spotsLeft <= 0) {
    return (
      <View style={[styles.actionButton, styles.actionFull]}>
        <Text style={styles.actionFullText}>Full</Text>
      </View>
    );
  }

  if (event.hasPositions) {
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
        style={({ pressed }) => [styles.actionButton, styles.actionCta, pressed && styles.pressed]}
      >
        <Text style={styles.actionCtaText}>Request a spot</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onLegacyJoin}
      style={({ pressed }) => [styles.actionButton, styles.actionCta, pressed && styles.pressed]}
    >
      <Text style={styles.actionCtaText}>Join</Text>
    </Pressable>
  );
}

// ── Unified event card ────────────────────────────────────────────────────────

function EventCard({
  event,
  section,
  now,
  userId,
  onLegacyJoin,
}: {
  event: EventItem;
  section: 'upcoming' | 'near-you' | 'pending';
  now: number;
  userId: string;
  onLegacyJoin?: () => void;
}) {
  const router = useRouter();
  const spotsLeft = calcSpotsLeft(event);

  const scheduledDate = new Date(event.scheduledAt).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const scheduledTime = new Date(event.scheduledAt)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();

  const sportKey = normalizeSportKey(event.sport);
  const sportConfig = sportKey ? SPORTS[sportKey] : null;
  const label = sportConfig?.label ?? sportLabel(event.sport);
  const metaLine = sportConfig?.eventCardMeta(event.sportDetails ?? null) ?? '';
  const count = displayCount(event);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
      style={({ pressed }) => [
        styles.card,
        section === 'pending' && styles.cardPending,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.sportTag}>
          <SportIcon sportId={event.sport} size={12} color="#6ee7b7" />
          <Text style={styles.sportTagText}>{label.toUpperCase()}</Text>
        </View>
        <Text style={styles.matchScore}>{scheduledDate} · {scheduledTime}</Text>
      </View>

      <Text style={styles.cardTitle}>{event.title}</Text>

      {event.venueName ? (
        <View style={styles.cardVenueRow}>
          <Ionicons name="location-outline" size={13} color="#a7f3d0" />
          <Text style={styles.cardVenue} numberOfLines={1}>{event.venueName}</Text>
        </View>
      ) : null}

      {metaLine ? (
        <Text style={styles.cardMeta} numberOfLines={1}>{metaLine}</Text>
      ) : null}

      <View style={styles.cardBottomRow}>
        <View style={styles.metaBadge}>
          <Ionicons name="people-outline" size={13} color="#ecfdf5" />
          <Text style={styles.metaText}>{count}/{event.maxPlayers} players</Text>
        </View>
        <View style={styles.metaBadge}>
          <Text style={styles.metaText}>{spotsLeft} spots left</Text>
        </View>
      </View>

      {section === 'upcoming' ? (
        <UpcomingActions event={event} now={now} userId={userId} />
      ) : section === 'pending' ? (
        <PendingActions event={event} now={now} />
      ) : (
        <NearYouActions event={event} onLegacyJoin={onLegacyJoin ?? (() => {})} />
      )}
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useSession();

  const [activeFilter, setActiveFilter] = useState<string>(ALL_FILTER_ID);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifVisible, setNotifVisible] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [searchQuery, setSearchQuery] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiEvents, setAiEvents] = useState<EventItem[]>([]);
  const [aiVenues, setAiVenues] = useState<Venue[]>([]);
  const [aiFilters, setAiFilters] = useState<InterpretedEventFilters | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [searchCentre, setSearchCentre] = useState<MapSearchCentre | null>(null);
  const aiSearchLock = useRef(false);

  // 30-second ticker for time-gated transitions
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch events on tab focus; first load shows spinner, subsequent are silent
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function fetchEvents() {
        try {
          const data = await getEvents(user?.id);
          if (!cancelled) {
            setEvents(data);
            setNow(Date.now());
          }
        } catch (err) {
          console.error('fetchEvents error:', err);
        } finally {
          if (!cancelled) setEventsLoading(false);
        }
      }

      fetchEvents();
      return () => { cancelled = true; };
    }, [user?.id])
  );

  // Fetch venues when sport filter changes (skip for "All" and while AI location search is active)
  useEffect(() => {
    if (aiMode) {
      return;
    }
    if (!activeFilter) {
      setVenues([]);
      return;
    }
    let cancelled = false;
    getVenues(activeFilter)
      .then((data) => { if (!cancelled) setVenues(data); })
      .catch(() => { if (!cancelled) setVenues([]); });
    return () => { cancelled = true; };
  }, [activeFilter, aiMode]);

  // Fetch unread notification count
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getUnreadNotificationCount(user.id)
      .then((count) => { if (!cancelled) setUnreadCount(count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  const clearAiSearch = useCallback(() => {
    setAiMode(false);
    setAiEvents([]);
    setAiVenues([]);
    setAiFilters(null);
    setAiMessage(null);
    setSearchCentre(null);
  }, []);

  const handleSportSelect = useCallback((id: string) => {
    setActiveFilter(id);
    // Manual chip selection exits AI result mode and restores normal discovery.
    clearAiSearch();
  }, [clearAiSearch]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (!text.trim()) {
      clearAiSearch();
    }
  }, [clearAiSearch]);

  const handleAiSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query || aiSearchLock.current) return;

    aiSearchLock.current = true;
    setAiSearching(true);
    setAiMessage(null);
    // Enter AI mode immediately with empty results so stale GPS/home markers don't flash.
    setAiMode(true);
    setAiEvents([]);
    setAiVenues([]);
    setAiFilters(null);

    try {
      const result = await aiSearchEvents(query);
      const sportId = normalizeSportKey(result.interpretedFilters.sport);
      if (sportId && ENABLED_SPORTS.includes(sportId as (typeof ENABLED_SPORTS)[number])) {
        setActiveFilter(sportId);
      } else if (!result.interpretedFilters.sport) {
        setActiveFilter(ALL_FILTER_ID);
      }

      const resolved = result.interpretedFilters.resolvedLocation;
      if (
        resolved &&
        Number.isFinite(resolved.latitude) &&
        Number.isFinite(resolved.longitude)
      ) {
        setSearchCentre({
          lat: Number(resolved.latitude),
          lng: Number(resolved.longitude),
          name: shortLocationLabel(resolved.name, result.interpretedFilters.locationQuery) ?? undefined,
          radiusKm: result.interpretedFilters.radiusKm ?? 10,
        });
      } else {
        setSearchCentre(null);
      }

      setAiFilters(result.interpretedFilters);
      setAiEvents(result.events);
      setAiVenues(
        (result.venues ?? []).map((v) => ({
          id: Number(v.id),
          name: v.name,
          address: v.address,
          latitude: Number(v.latitude),
          longitude: Number(v.longitude),
          sports: v.sports,
        }))
      );
      setAiMessage(null);
    } catch (err) {
      clearAiSearch();
      if (isNetworkError(err)) {
        setAiMessage('Unable to connect. Check your connection and try again.');
      } else if (isApiError(err) && err.response?.status === 503) {
        setAiMessage('AI search is temporarily unavailable. You can still use the filters.');
      } else if (isApiError(err) && err.response?.status === 400) {
        const msg = getApiErrorMessage(err, "Couldn't find that location.");
        setAiMessage(
          /location could not be found/i.test(msg) ? "Couldn't find that location." : msg
        );
      } else {
        setAiMessage(
          getApiErrorMessage(err, 'AI search is temporarily unavailable. You can still use the filters.')
        );
      }
    } finally {
      setAiSearching(false);
      aiSearchLock.current = false;
    }
  }, [searchQuery, clearAiSearch]);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    try {
      const data = await getEvents(user.id);
      setEvents(data);
      setNow(Date.now());
      if (aiMode && searchQuery.trim()) {
        try {
          const result = await aiSearchEvents(searchQuery.trim());
          setAiFilters(result.interpretedFilters);
          setAiEvents(result.events);
          setAiVenues(
            (result.venues ?? []).map((v) => ({
              id: Number(v.id),
              name: v.name,
              address: v.address,
              latitude: Number(v.latitude),
              longitude: Number(v.longitude),
              sports: v.sports,
            }))
          );
          const resolved = result.interpretedFilters.resolvedLocation;
          if (resolved && Number.isFinite(resolved.latitude) && Number.isFinite(resolved.longitude)) {
            setSearchCentre({
              lat: Number(resolved.latitude),
              lng: Number(resolved.longitude),
              name: shortLocationLabel(resolved.name, result.interpretedFilters.locationQuery) ?? undefined,
              radiusKm: result.interpretedFilters.radiusKm ?? 10,
            });
          } else {
            setSearchCentre(null);
          }
          setAiMessage(null);
        } catch {
          // keep previous AI results on refresh failure
        }
      }
    } catch {
      // silently fail
    } finally {
      setRefreshing(false);
    }
  }, [user?.id, aiMode, searchQuery]);

  // Legacy join (non-position events only)
  const handleLegacyJoin = useCallback(async (eventId: string) => {
    if (!user) return;
    try {
      await joinEvent(eventId, { userId: user.id });
      // Refresh list silently so count updates
      const data = await getEvents(user.id);
      setEvents(data);
      if (aiMode) {
        setAiEvents((prev) =>
          prev.map((e) =>
            e.id === eventId
              ? { ...e, participantCount: e.participantCount + 1, myStatus: 'Registered' }
              : e
          )
        );
      }
    } catch (err) {
      Alert.alert(
        'Could not join',
        getApiErrorMessage(err, 'This event may be full or you already joined.')
      );
    }
  }, [user, aiMode]);

  // Position-aware map join handler
  const handleMapJoin = useCallback((eventId: string) => {
    const event = (aiMode ? aiEvents : events).find((e) => e.id === eventId)
      ?? events.find((e) => e.id === eventId);
    if (!event) return;
    if (event.hasPositions) {
      router.push({ pathname: '/event/[id]', params: { id: eventId } });
    } else {
      handleLegacyJoin(eventId);
    }
  }, [events, aiEvents, aiMode, handleLegacyJoin, router]);

  const handleCountChange = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  // Section derivation
  const { upcoming, nearYou, pending, filteredAll } = useMemo(() => {
    const filtered = aiMode
      ? aiEvents
      : filterEventsBySport(events, activeFilter);
    const upcoming: EventItem[] = [];
    const nearYou: EventItem[] = [];
    const pending: EventItem[] = [];

    for (const e of filtered) {
      const startMs = new Date(e.scheduledAt).getTime();

      // Pending requests disappear at T−10 (backend expires them then; same window as check-in open)
      if (e.myRequestStatus === 'pending') {
        if (now < startMs - CHECK_IN_WINDOW_OPEN_MS) {
          pending.push(e);
        }
        continue; // never also show in nearYou
      }

      const isUserRelated =
        e.creatorId === user?.id ||
        (e.myStatus != null &&
          e.myStatus !== 'CancelledEarly' &&
          e.myStatus !== 'CancelledLate');

      if (aiMode) {
        // Browsing feed: never show events that already started or start within the
        // check-in window (T-10), even if the event is the user's own. Past events
        // for events the user hosted/attended only belong in the Profile section.
        if (now < startMs - CHECK_IN_WINDOW_OPEN_MS) {
          nearYou.push(e);
        }
        continue;
      }

      if (isUserRelated) {
        if (now < startMs + CHECK_IN_WINDOW_CLOSE_MS) {
          upcoming.push(e);
        }
      } else {
        if (now < startMs - CHECK_IN_WINDOW_OPEN_MS) {
          nearYou.push(e);
        }
      }
    }

    return {
      upcoming,
      nearYou,
      pending,
      // Map pins should mirror the lists above — never show markers for events
      // that already started, start within 10 minutes, or are otherwise filtered out.
      filteredAll: [...upcoming, ...nearYou, ...pending],
    };
  }, [events, aiEvents, aiMode, activeFilter, now, user?.id]);

  const userId = user?.id ?? '';
  const aiSummary = aiFilters ? formatAiFilterSummary(aiFilters) : null;
  const venueSearchMode = aiMode && isVenueIntent(aiFilters?.intentType);
  const mapVenues = aiMode ? (venueSearchMode ? aiVenues : []) : venues;
  const mapEvents = aiMode ? (venueSearchMode ? [] : filteredAll) : filteredAll;
  const mapBadge =
    searchCentre?.name != null
      ? venueSearchMode
        ? `${aiVenues.length} venue${aiVenues.length === 1 ? '' : 's'} near ${searchCentre.name}`
        : `${nearYou.length} game${nearYou.length === 1 ? '' : 's'} near ${searchCentre.name}`
      : null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#a8ff3e"
            colors={['#a8ff3e']}
          />
        }
      >
        <Header unreadCount={unreadCount} onBellPress={() => setNotifVisible(true)} />
        <SearchBar
          value={searchQuery}
          onChangeText={handleSearchChange}
          onSubmit={handleAiSearch}
          loading={aiSearching}
        />
        {aiSummary && aiMode ? (
          <View style={styles.aiSummaryRow}>
            <Text style={styles.aiSummary} numberOfLines={2}>
              AI search: {aiSummary}
            </Text>
            {searchCentre ? (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  clearAiSearch();
                }}
                hitSlop={8}
                accessibilityLabel="Use my location"
              >
                <Text style={styles.myLocationBtn}>My Location</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {aiMessage ? (
          <Text style={styles.aiMessage} numberOfLines={3}>
            {aiMessage}
          </Text>
        ) : null}
        <FilterChips selected={activeFilter} onSelect={handleSportSelect} />

        <HomeMiniMap
          sportFilter={activeFilter}
          events={mapEvents}
          venues={mapVenues}
          height={180}
          onJoinEvent={handleMapJoin}
          searchCentre={searchCentre}
          searchActive={aiMode}
          badgeLabel={mapBadge}
        />

        {/* ── Upcoming Games ─────────────────────────────────────────────── */}
        {!aiMode && upcoming.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>UPCOMING GAMES</Text>
            {upcoming.map((e) =>
              userId ? (
                <EventStatusCard
                  key={e.id}
                  source="event"
                  event={e}
                  variant="home"
                  userId={userId}
                  isHost={e.creatorId === userId}
                  readOnly={!(e.creatorId === userId || Boolean(e.myStatus))}
                />
              ) : (
                <EventCard
                  key={e.id}
                  event={e}
                  section="upcoming"
                  now={now}
                  userId={userId}
                />
              )
            )}
          </>
        )}

        {/* ── Pending Requests ───────────────────────────────────────────── */}
        {!aiMode && pending.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>PENDING REQUESTS</Text>
            {pending.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                section="pending"
                now={now}
                userId={userId}
              />
            ))}
          </>
        )}

        {/* ── Games / Venues Near You ─────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, (!aiMode && (upcoming.length > 0 || pending.length > 0)) && styles.sectionTitleSpaced]}>
          {venueSearchMode ? 'VENUES NEAR YOU' : 'GAMES NEAR YOU'}
        </Text>

        {eventsLoading && !aiMode ? (
          <ActivityIndicator color="#a8ff3e" style={{ marginTop: 24 }} />
        ) : aiSearching && aiMode ? (
          <ActivityIndicator color="#a8ff3e" style={{ marginTop: 24 }} />
        ) : venueSearchMode ? (
          aiVenues.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {emptyAiResultMessage(aiFilters, true)}
              </Text>
              <Text style={styles.emptySub}>Try another place or sport.</Text>
            </View>
          ) : (
            aiVenues.map((v) => (
              <View key={v.id} style={styles.venueCard}>
                <Text style={styles.venueName}>{v.name}</Text>
                {v.address ? <Text style={styles.venueAddress}>{v.address}</Text> : null}
                {v.sports ? (
                  <Text style={styles.venueSports}>
                    {Array.isArray(v.sports) ? v.sports.join(', ') : v.sports}
                  </Text>
                ) : null}
              </View>
            ))
          )
        ) : nearYou.length === 0 ? (
          aiMode ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {emptyAiResultMessage(aiFilters, false)}
              </Text>
              <Text style={styles.emptySub}>Try another search or use the sport filters.</Text>
            </View>
          ) : (
            <EmptyNearby
              sportId={activeFilter}
              onCreate={() => router.push('/(tabs)/create')}
            />
          )
        ) : (
          nearYou.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              section="near-you"
              now={now}
              userId={userId}
              onLegacyJoin={() => handleLegacyJoin(e.id)}
            />
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(tabs)/create')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>

      {user && (
        <NotificationsModal
          visible={notifVisible}
          userId={user.id}
          onClose={() => setNotifVisible(false)}
          onCountChange={handleCountChange}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  logoWhite: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  logoGreen: {
    color: '#a8ff3e',
    fontSize: 28,
    fontWeight: '900',
  },
  bellWrap: {
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#a8ff3e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#1a1a2e',
  },
  bellBadgeText: {
    color: '#1a1a2e',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 13,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 10,
  },
  searchIcon: {
    opacity: 0.9,
  },
  searchInput: {
    flex: 1,
    color: '#f3f4f6',
    fontSize: 14,
    paddingVertical: 4,
  },
  searchPlaceholder: {
    color: '#6b7280',
    fontSize: 14,
  },
  aiSummary: {
    color: 'rgba(168, 255, 62, 0.75)',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    paddingHorizontal: 2,
  },
  aiSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -8,
    marginBottom: 10,
  },
  myLocationBtn: {
    color: '#a8ff3e',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  aiMessage: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: -6,
    marginBottom: 10,
    paddingHorizontal: 2,
    lineHeight: 16,
  },
  venueCard: {
    backgroundColor: '#252540',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  venueName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  venueAddress: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  venueSports: {
    color: 'rgba(168, 255, 62, 0.8)',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
  },

  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
    marginBottom: 20,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: '#a8ff3e',
    borderColor: '#a8ff3e',
  },
  chipInactive: {
    backgroundColor: '#111827',
    borderColor: 'rgba(168, 255, 62, 0.3)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#1a1a2e',
  },
  chipTextInactive: {
    color: '#6b7280',
  },

  sectionTitle: {
    color: '#a8ff3e',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 14,
    marginTop: 20,
  },
  sectionTitleSpaced: {
    marginTop: 28,
  },

  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  emptyText: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  emptyCta: {
    marginTop: 16,
    backgroundColor: 'rgba(168, 255, 62, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.45)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyCtaPressed: {
    opacity: 0.8,
  },
  emptyCtaText: {
    color: '#a8ff3e',
    fontSize: 13,
    fontWeight: '800',
  },

  card: {
    backgroundColor: 'rgba(4, 120, 87, 0.22)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(167, 243, 208, 0.45)',
    padding: 16,
    marginBottom: 14,
  },
  cardPressed: {
    opacity: 0.88,
  },
  cardPending: {
    backgroundColor: 'rgba(4, 120, 87, 0.10)',
    borderColor: 'rgba(168, 255, 62, 0.35)',
    borderStyle: 'dashed',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sportTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#047857',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(167, 243, 208, 0.45)',
  },
  sportTagText: {
    color: '#ecfdf5',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  matchScore: {
    color: '#a7f3d0',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardVenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  cardVenue: {
    color: '#a7f3d0',
    fontSize: 13,
    flexShrink: 1,
  },
  cardMeta: {
    color: '#6ee7b7',
    fontSize: 12,
    marginBottom: 12,
  },
  cardBottomRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(6, 78, 59, 0.55)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaText: {
    color: '#ecfdf5',
    fontSize: 12,
    fontWeight: '500',
  },

  actionButton: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 6,
  },
  actionCta: {
    backgroundColor: '#a8ff3e',
  },
  actionCtaText: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '800',
  },
  actionAttended: {
    backgroundColor: '#a8ff3e',
  },
  actionAttendedText: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '800',
  },
  actionHostBadge: {
    backgroundColor: '#a8ff3e',
  },
  actionHostBadgeText: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '800',
  },
  actionFull: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(167, 243, 208, 0.3)',
  },
  actionFullText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  actionPending: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.35)',
    opacity: 0.6,
  },
  actionPendingText: {
    color: '#a8ff3e',
    fontSize: 14,
    fontWeight: '700',
  },

  countdownWrap: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  countdownLabel: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  countdownValue: {
    color: '#a8ff3e',
    fontSize: 18,
    fontWeight: '800',
  },

  pressed: {
    opacity: 0.8,
  },

  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#a8ff3e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#a8ff3e',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabIcon: {
    color: '#1a1a2e',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
});
