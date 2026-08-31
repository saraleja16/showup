import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { EventItem, getApiErrorMessage, getEvents } from '@/src/api';
import { useSession } from '@/src/auth';
import { EventStatusCard } from '@/src/components/event-status';
import { normalizeSportKey } from '@/lib/sport-match';
import { resolveEventPhase, type GamePhase, type ResultLifecycle } from '@/src/live/gamePhase';
import { SPORTS } from '@/src/sports/registry';

// ─── Data Helpers ─────────────────────────────────────────────────────────────

const UPCOMING_PHASES: GamePhase[] = ['upcoming', 'starting_soon', 'live'];
const PAST_PHASES: GamePhase[] = ['finished', 'result_pending', 'completed'];
const NOT_INVOLVED_STATUSES = new Set(['CancelledEarly', 'CancelledLate']);
const PREVIEW_COUNT = 2;

function normalizeStatus(status?: string | null): string {
  return (status ?? '').replace(/[\s_-]/g, '').toLowerCase();
}

function resultLifecycleFor(event: EventItem): ResultLifecycle {
  const status = normalizeStatus(event.resultSummary?.status);
  if (status === 'confirmed') return 'confirmed';
  if (status === 'pendingconfirmation') return 'submitted';
  if (status === 'disputed') return 'disputed';
  return 'none';
}

function phaseFor(event: EventItem, nowMs: number): GamePhase {
  return resolveEventPhase({
    scheduledAt: event.scheduledAt,
    scheduledEnd: event.scheduledEnd,
    sport: event.sport,
    sportDetails: event.sportDetails,
    nowMs,
    serverStatus: event.liveStatus,
    resultLifecycle: resultLifecycleFor(event),
  });
}

function isMine(event: EventItem, userId: string): boolean {
  if (event.creatorId === userId) return true;
  if (!event.myStatus) return false;
  return !NOT_INVOLVED_STATUSES.has(event.myStatus);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventCard({ event, userId }: { event: EventItem; userId: string }) {
  return (
    <EventStatusCard
      source="event"
      event={event}
      variant="my-games"
      userId={userId}
      isHost={event.creatorId === userId}
    />
  );
}

function EmptyInline({ text }: { text: string }) {
  return <Text style={styles.emptyInline}>{text}</Text>;
}

function GameSection({
  label,
  events,
  userId,
  expanded,
  onToggle,
  emptyText,
}: {
  label: string;
  events: EventItem[];
  userId: string;
  expanded: boolean;
  onToggle: () => void;
  emptyText: string;
}) {
  const visible = expanded ? events : events.slice(0, PREVIEW_COUNT);
  const remaining = events.length - PREVIEW_COUNT;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      {events.length === 0 ? (
        <EmptyInline text={emptyText} />
      ) : (
        <>
          {visible.map((event) => (
            <EventCard key={event.id} event={event} userId={userId} />
          ))}
          {remaining > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={onToggle}
              style={({ pressed }) => [styles.seeMoreBtn, pressed && styles.pressed]}
            >
              <Text style={styles.seeMoreText}>
                {expanded ? 'Show less' : `See more (${remaining})`}
              </Text>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#a8ff3e"
              />
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

function TemplateCard({
  event,
  onCreatePress,
}: {
  event: EventItem;
  onCreatePress: () => void;
}) {
  const sportKey = normalizeSportKey(event.sport) || event.sport || 'Event';
  const sportConfig = SPORTS[sportKey];
  const sportLabel = sportConfig?.label ?? sportKey;
  const meta = sportConfig?.eventCardMeta(event.sportDetails) ?? null;

  return (
    <View style={styles.templateCard}>
      <View style={styles.templateTopRow}>
        <View style={styles.sportTag}>
          <Text style={styles.sportTagText}>{sportLabel.toUpperCase()}</Text>
        </View>
        <Text style={styles.templateHint}>Your latest setup</Text>
      </View>

      <Text style={styles.templateTitle} numberOfLines={2}>
        {event.title}
      </Text>

      {meta ? <Text style={styles.templateMeta}>{meta}</Text> : null}

      <View style={styles.templateIconRow}>
        <Ionicons name="location-outline" size={13} color="#a7f3d0" />
        <Text style={styles.templateVenue} numberOfLines={1}>
          {event.venueName ?? 'Location TBD'}
        </Text>
      </View>

      <Text style={styles.templateSubtext}>
        Reuses this sport, venue, and format. Just set the date, time, and invite your friends.
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={onCreatePress}
        style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
      >
        <Text style={styles.createButtonText}>Create this game</Text>
      </Pressable>
    </View>
  );
}

function EmptyState({ onCreatePress }: { onCreatePress: () => void }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>No games yet.</Text>
      <Pressable accessibilityRole="button" onPress={onCreatePress}>
        <Text style={styles.emptyLink}>Create one!</Text>
      </Pressable>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MyGamesScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [pastExpanded, setPastExpanded] = useState(false);

  const goToCreateForm = () => router.push('/create-form');
  const goToTemplateCreate = (templateEventId: string) =>
    router.push({ pathname: '/create-form', params: { templateEventId } });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadEvents() {
        if (!user?.id) {
          setEvents([]);
          setIsLoading(false);
          return;
        }

        setIsLoading(true);
        setError(null);

        try {
          const data = await getEvents(user.id);
          if (cancelled) return;
          setEvents(data.filter((e) => isMine(e, user.id)));
        } catch (err) {
          if (!cancelled) {
            setError(getApiErrorMessage(err, 'Could not load your games.'));
            setEvents([]);
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      }

      loadEvents();

      return () => {
        cancelled = true;
      };
    }, [user?.id])
  );

  const { upcoming, past, template } = useMemo(() => {
    const nowMs = Date.now();
    const up: EventItem[] = [];
    const pt: EventItem[] = [];

    for (const event of events) {
      const phase = phaseFor(event, nowMs);
      if (UPCOMING_PHASES.includes(phase)) up.push(event);
      else if (PAST_PHASES.includes(phase)) pt.push(event);
    }

    up.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    pt.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

    const hosted = events
      .filter((e) => e.creatorId === user?.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { upcoming: up, past: pt, template: hosted[0] ?? null };
  }, [events, user?.id]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>My Games</Text>

        <Pressable
          accessibilityRole="button"
          onPress={goToCreateForm}
          style={({ pressed }) => [styles.createButton, styles.headerCreateButton, pressed && styles.pressed]}
        >
          <Text style={styles.createButtonText}>＋ Create a Game</Text>
        </Pressable>

        {isLoading ? (
          <ActivityIndicator color="#a8ff3e" style={styles.loader} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : events.length === 0 ? (
          <EmptyState onCreatePress={goToCreateForm} />
        ) : (
          <>
            <GameSection
              label="UPCOMING GAMES"
              events={upcoming}
              userId={user?.id ?? ''}
              expanded={upcomingExpanded}
              onToggle={() => setUpcomingExpanded((v) => !v)}
              emptyText="No upcoming games."
            />

            <GameSection
              label="PAST GAMES"
              events={past}
              userId={user?.id ?? ''}
              expanded={pastExpanded}
              onToggle={() => setPastExpanded((v) => !v)}
              emptyText="No past games yet."
            />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>QUICK CREATE</Text>
              {template ? (
                <TemplateCard event={template} onCreatePress={() => goToTemplateCreate(template.id)} />
              ) : (
                <EmptyInline text="Host a game to unlock quick create." />
              )}
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={goToCreateForm}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      >
        <Text style={styles.fabIcon}>＋</Text>
      </Pressable>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const EMERALD = '#047857';
const EMERALD_SOFT = 'rgba(4, 120, 87, 0.22)';
const EMERALD_BORDER = 'rgba(167, 243, 208, 0.45)';

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
    paddingTop: 24,
  },

  pageTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 20,
  },

  headerCreateButton: {
    marginBottom: 28,
  },
  createButton: {
    backgroundColor: '#a8ff3e',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  createButtonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: '#a8ff3e',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 14,
  },
  loader: {
    marginTop: 24,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
  },

  seeMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  seeMoreText: {
    color: '#a8ff3e',
    fontSize: 13,
    fontWeight: '700',
  },

  sportTag: {
    backgroundColor: EMERALD,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: EMERALD_BORDER,
    alignSelf: 'flex-start',
  },
  sportTagText: {
    color: '#ecfdf5',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  templateCard: {
    backgroundColor: EMERALD_SOFT,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: EMERALD_BORDER,
    padding: 16,
  },
  templateTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  templateHint: {
    color: '#a7f3d0',
    fontSize: 11,
    fontWeight: '600',
  },
  templateTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  templateMeta: {
    color: '#a7f3d0',
    fontSize: 13,
    marginBottom: 8,
  },
  templateIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
  },
  templateVenue: {
    color: '#a7f3d0',
    fontSize: 13,
  },
  templateSubtext: {
    color: '#8fbfa8',
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 17,
  },

  emptyInline: {
    color: '#8a8aa0',
    fontSize: 14,
    fontWeight: '500',
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 6,
  },
  emptyText: {
    color: '#8a8aa0',
    fontSize: 15,
    fontWeight: '500',
  },
  emptyLink: {
    color: '#a8ff3e',
    fontSize: 15,
    fontWeight: '700',
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

  pressed: {
    opacity: 0.78,
  },
});
