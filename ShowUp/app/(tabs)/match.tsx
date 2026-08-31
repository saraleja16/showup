import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  connectMatchCandidate,
  getApiErrorMessage,
  getApiErrorStatus,
  getMatchCandidates,
  getMatchRequestCounts,
  isNetworkError,
  skipMatchCandidate,
  updateMyLocation,
  updateMySkillLevel,
  type MatchCandidate,
} from '@/src/api';
import { useSession } from '@/src/auth';
import { AppButton } from '@/src/components/AppButton';
import { colors, radii, spacing, typography } from '@/src/constants/theme';
import {
  SkillSelector,
  type SkillLevel,
} from '@/src/features/create-event/components/SkillSelector';
import { DiscoveryView } from '@/src/features/match/DiscoveryView';
import { MatchesListModal } from '@/src/features/match/MatchesListModal';
import {
  MatchFiltersSheet,
  type MatchFilters,
} from '@/src/features/match/MatchFiltersSheet';
import { recordSentMatchRequest, markSentAccepted } from '@/src/features/match/matchRequestStore';
import { ProfileCarousel } from '@/src/features/match/ProfileCarousel';
import { MutualMatchModal } from '@/src/features/match/MutualMatchModal';
import {
  getCurrentMatchLocation,
  getForegroundLocationPermission,
  LocationTimeoutError,
  openAppSettings,
  requestForegroundLocationPermission,
  type MatchCoords,
} from '@/src/features/match/location';
import {
  DEFAULT_MATCH_RADIUS_KM,
  MATCH_PAGE_SIZE,
  MATCH_PREFETCH_THRESHOLD,
} from '@/src/features/match/utils';

type MatchMode = 'swipe' | 'discovery';

type ScreenPhase =
  | 'boot'
  | 'need_permission'
  | 'denied'
  | 'locating'
  | 'need_skill'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error'
  | 'offline';

function nextLargerRadius(current: number): number {
  if (current < 10) return 10;
  if (current < 25) return 25;
  if (current < 50) return 50;
  return 100;
}

export default function MatchScreen() {
  const router = useRouter();
  const { user, accessToken, updateUser } = useSession();

  const [coords, setCoords] = useState<MatchCoords | null>(null);
  const [filters, setFilters] = useState<MatchFilters>({
    sportId: null,
    radiusKm: DEFAULT_MATCH_RADIUS_KM,
  });
  const [queue, setQueue] = useState<MatchCandidate[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [activeAction, setActiveAction] = useState<{ userId: string; kind: 'connect' | 'skip' } | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [phase, setPhase] = useState<ScreenPhase>('boot');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [mode, setMode] = useState<MatchMode>('swipe');
  const [requestsRefreshToken, setRequestsRefreshToken] = useState(0);
  const [incomingRequestCount, setIncomingRequestCount] = useState(0);
  const [mutualName, setMutualName] = useState<string | null>(null);
  const [mutualConnectionId, setMutualConnectionId] = useState<string | null>(null);
  const [skillDraft, setSkillDraft] = useState<SkillLevel>('Intermediate');
  const [skillSaving, setSkillSaving] = useState(false);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const fetchGenRef = useRef(0);
  const pagingRef = useRef(false);
  const mountedRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersRef = useRef(filters);
  const coordsRef = useRef(coords);
  const queueLenRef = useRef(0);
  const hasMoreRef = useRef(true);
  const nextCursorRef = useRef<string | null>(null);

  filtersRef.current = filters;
  coordsRef.current = coords;
  queueLenRef.current = queue.length;
  hasMoreRef.current = hasMore;
  nextCursorRef.current = nextCursor;

  const current = queue[focusedIndex] ?? null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fetchGenRef.current += 1;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setToast(null);
    }, 2200);
  }, []);

  const refreshIncomingCount = useCallback(async () => {
    try {
      const counts = await getMatchRequestCounts();
      if (mountedRef.current) setIncomingRequestCount(counts.incomingCount);
    } catch {
      // Non-critical — badge just won't update this cycle.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshIncomingCount();
    }, [refreshIncomingCount])
  );

  useEffect(() => {
    void refreshIncomingCount();
  }, [requestsRefreshToken, refreshIncomingCount]);

  // Refresh the badge after the matches modal closes, since the user may have
  // accepted/rejected incoming requests while it was open.
  const prevMatchesOpenRef = useRef(false);
  useEffect(() => {
    if (prevMatchesOpenRef.current && !matchesOpen) {
      void refreshIncomingCount();
    }
    prevMatchesOpenRef.current = matchesOpen;
  }, [matchesOpen, refreshIncomingCount]);

  const mergeCandidates = useCallback((items: MatchCandidate[], append: boolean) => {
    const fresh: MatchCandidate[] = [];
    for (const item of items) {
      if (!item?.userId) continue;
      if (seenIdsRef.current.has(item.userId)) continue;
      seenIdsRef.current.add(item.userId);
      fresh.push(item);
    }
    setQueue((prev) => {
      const next = append ? [...prev, ...fresh] : fresh;
      return next;
    });
    return fresh.length;
  }, []);

  const handleFetchError = useCallback(
    (err: unknown, append: boolean) => {
      if (isNetworkError(err)) {
        if (!append) {
          setPhase('offline');
          setErrorMessage('You appear to be offline. Check your connection and try again.');
        } else {
          showToast('Network error — try again shortly.');
        }
        return;
      }

      const status = getApiErrorStatus(err);
      if (status === 403) {
        setPhase('error');
        setErrorMessage(
          getApiErrorMessage(err, 'Matchmaking is unavailable for this account.')
        );
        return;
      }

      if (status === 400) {
        const msg = getApiErrorMessage(err, 'Unable to load candidates.');
        if (msg.toLowerCase().includes('skill')) {
          setPhase('need_skill');
          setErrorMessage(msg);
          return;
        }
        setPhase('error');
        setErrorMessage(msg);
        return;
      }

      if (status === 429) {
        setPhase('error');
        setErrorMessage('Too many requests. Please wait a moment and try again.');
        return;
      }

      if (!append) {
        setPhase('error');
        setErrorMessage(getApiErrorMessage(err, 'Could not load nearby players.'));
      } else {
        showToast(getApiErrorMessage(err, 'Could not load more players.'));
      }
    },
    [showToast]
  );

  const fetchPage = useCallback(
    async (location: MatchCoords, cursor: string | null, append: boolean) => {
      if (!accessToken) {
        setPhase('error');
        setErrorMessage('Please sign out and sign in again to enable Match.');
        return;
      }

      const activeFilters = filtersRef.current;
      const gen = ++fetchGenRef.current;
      if (!append) {
        setPhase('loading');
        setErrorMessage(null);
      }

      try {
        const response = await getMatchCandidates({
          latitude: location.latitude,
          longitude: location.longitude,
          radiusKm: activeFilters.radiusKm,
          sportId: activeFilters.sportId ?? undefined,
          pageSize: MATCH_PAGE_SIZE,
          cursor,
        });

        if (!mountedRef.current || gen !== fetchGenRef.current) return;

        setNextCursor(response.nextCursor);
        setHasMore(Boolean(response.nextCursor));
        const added = mergeCandidates(response.items, append);

        if (!append) {
          setPhase(added > 0 ? 'ready' : 'empty');
        } else if (added === 0 && !response.nextCursor && queueLenRef.current === 0) {
          setPhase('empty');
        }
      } catch (err) {
        if (!mountedRef.current || gen !== fetchGenRef.current) return;
        handleFetchError(err, append);
      } finally {
        pagingRef.current = false;
      }
    },
    [accessToken, handleFetchError, mergeCandidates]
  );

  useEffect(() => {
    if (phase !== 'ready' && phase !== 'empty') return;
    if (queue.length === 0 && !hasMore) {
      setPhase('empty');
    } else if (queue.length > 0) {
      setPhase('ready');
    }
  }, [queue.length, hasMore, phase]);

  // The queue ran dry (waiting on prefetch or truly empty) — there's no meaningful
  // "current position" to preserve, so start the next batch from the top.
  useEffect(() => {
    if (queue.length === 0) setFocusedIndex(0);
  }, [queue.length]);

  const prefetchIfNeeded = useCallback(() => {
    const location = coordsRef.current;
    if (!location) return;
    if (!hasMoreRef.current || !nextCursorRef.current) return;
    if (pagingRef.current) return;
    if (queueLenRef.current > MATCH_PREFETCH_THRESHOLD) return;
    pagingRef.current = true;
    void fetchPage(location, nextCursorRef.current, true);
  }, [fetchPage]);

  useEffect(() => {
    if (phase === 'ready') prefetchIfNeeded();
  }, [phase, queue.length, prefetchIfNeeded]);

  const startWithLocation = useCallback(
    async (location: MatchCoords) => {
      setCoords(location);
      try {
        await updateMyLocation(location.latitude, location.longitude);
      } catch {
        // Non-fatal — still request candidates
      }
      seenIdsRef.current = new Set();
      setQueue([]);
      setFocusedIndex(0);
      setActiveAction(null);
      setNextCursor(null);
      setHasMore(true);
      await fetchPage(location, null, false);
    },
    [fetchPage]
  );

  const startWithLocationRef = useRef(startWithLocation);
  startWithLocationRef.current = startWithLocation;

  const bootstrap = useCallback(async () => {
    if (!user) return;

    if (!accessToken) {
      setPhase('error');
      setErrorMessage('Please sign out and sign in again to enable Match.');
      return;
    }

    if (!user.skillLevel?.trim()) {
      setPhase('need_skill');
      return;
    }

    setPhase('boot');

    try {
      const existing = await getForegroundLocationPermission();
      if (!mountedRef.current) return;

      if (existing.granted) {
        setPhase('locating');
        try {
          const location = await getCurrentMatchLocation();
          if (!mountedRef.current) return;
          await startWithLocationRef.current(location);
        } catch (locErr) {
          if (!mountedRef.current) return;
          setPhase('error');
          setErrorMessage(
            locErr instanceof LocationTimeoutError
              ? 'Location timed out. Check GPS/Wi‑Fi Location and try again.'
              : 'Could not read your location. Try again.'
          );
        }
        return;
      }

      if (existing.status === 'denied' && !existing.canAskAgain) {
        setPhase('denied');
        return;
      }

      setPhase('need_permission');
    } catch {
      if (!mountedRef.current) return;
      setPhase('error');
      setErrorMessage('Location is unavailable on this device.');
    }
  }, [accessToken, user]);

  useFocusEffect(
    useCallback(() => {
      void bootstrap();
    }, [bootstrap])
  );

  const handleRequestPermission = async () => {
    setPhase('locating');
    try {
      const result = await requestForegroundLocationPermission();
      if (!result.granted) {
        setPhase(result.canAskAgain ? 'need_permission' : 'denied');
        return;
      }
      const location = await getCurrentMatchLocation();
      await startWithLocation(location);
    } catch (err) {
      setPhase('error');
      setErrorMessage(
        err instanceof LocationTimeoutError
          ? 'Location timed out. Check GPS/Wi‑Fi Location and try again.'
          : 'Could not read your location. Try again.'
      );
    }
  };

  const reloadFromStart = async (nextFilters?: MatchFilters) => {
    if (nextFilters) {
      setFilters(nextFilters);
      filtersRef.current = nextFilters;
    }

    const location = coordsRef.current;
    if (!location) {
      await bootstrap();
      return;
    }

    seenIdsRef.current = new Set();
    setQueue([]);
    setFocusedIndex(0);
    setActiveAction(null);
    setNextCursor(null);
    setHasMore(true);
    await fetchPage(location, null, false);
  };

  /** Remove a decided candidate from the browsable queue. The carousel keeps the same
   * scroll offset, so whichever card was next slides into the freed spot automatically. */
  const removeCandidate = (userId: string) => {
    setQueue((prev) => prev.filter((c) => c.userId !== userId));
  };

  /** Fires once the ProfileCarousel's connect/skip flourish finishes playing. */
  const handleActionComplete = useCallback((userId: string) => {
    removeCandidate(userId);
    setActiveAction(null);
    setActionBusy(false);
  }, []);

  const handleSkip = async () => {
    if (!current || actionBusy) return;
    setActionBusy(true);
    const decided = current;
    try {
      await skipMatchCandidate(decided.userId);
      // Keep the card in the queue and play its "skipped" animation — it's removed
      // (and actionBusy released) once ProfileCarousel reports it finished, via
      // handleActionComplete.
      setActiveAction({ userId: decided.userId, kind: 'skip' });
    } catch (err) {
      const status = getApiErrorStatus(err);
      if (status === 404) {
        removeCandidate(decided.userId);
        setActionBusy(false);
        return;
      }
      if (status === 409) {
        showToast('Already decided — refreshing.');
        setActionBusy(false);
        await reloadFromStart();
        return;
      }
      if (status === 429) {
        showToast('Slow down — wait a moment and retry.');
        setActionBusy(false);
        return;
      }
      showToast(getApiErrorMessage(err, 'Skip failed. Try again.'));
      setActionBusy(false);
    }
  };

  const handleConnect = async () => {
    if (!current || actionBusy) return;
    setActionBusy(true);
    const decided = current;
    const name = decided.displayName;
    try {
      const result = await connectMatchCandidate(decided.userId);
      if (user?.id) {
        if (result.isMutualMatch) {
          await markSentAccepted(user.id, decided.userId);
        } else {
          await recordSentMatchRequest(user.id, decided);
        }
        setRequestsRefreshToken((n) => n + 1);
      }
      if (result.isMutualMatch) {
        setMutualConnectionId(result.connectionId);
        setMutualName(name);
      } else {
        showToast('Request sent — see Sent.');
      }
      // Keep the card in the queue and play its "sent" animation — the card is
      // removed (and actionBusy released) once ProfileCarousel reports it finished,
      // via handleActionComplete.
      setActiveAction({ userId: decided.userId, kind: 'connect' });
    } catch (err) {
      const status = getApiErrorStatus(err);
      if (status === 404) {
        removeCandidate(decided.userId);
        setActionBusy(false);
        return;
      }
      if (status === 409) {
        showToast('Already connected — refreshing.');
        setActionBusy(false);
        await reloadFromStart();
        return;
      }
      if (status === 429) {
        showToast('Slow down — wait a moment and retry.');
        setActionBusy(false);
        return;
      }
      showToast(getApiErrorMessage(err, 'Connect failed. Try again.'));
      setActionBusy(false);
    }
  };

  const handleSaveSkill = async () => {
    setSkillSaving(true);
    try {
      const { skillLevel } = await updateMySkillLevel(skillDraft);
      await updateUser({ skillLevel });
      await bootstrap();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not save skill level.'));
    } finally {
      setSkillSaving(false);
    }
  };

  const preferredSports = user?.preferredSports ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      <View style={styles.header}>
        <Text style={styles.title}>Match</Text>
        {mode === 'swipe' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open match filters"
            onPress={() => setFiltersOpen(true)}
            style={({ pressed }) => [styles.filterBtn, pressed && styles.pressed]}
            hitSlop={8}
          >
            <Ionicons name="options-outline" size={20} color={colors.accent} />
            <Text style={styles.filterLabel}>Filters</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.modeRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Swipe to match nearby players"
          onPress={() => setMode('swipe')}
          style={[styles.modePill, mode === 'swipe' && styles.modePillActive]}
        >
          <Ionicons
            name="shuffle-outline"
            size={16}
            color={mode === 'swipe' ? colors.background : colors.textSecondary}
          />
          <Text style={[styles.modePillText, mode === 'swipe' && styles.modePillTextActive]}>
            Swipe
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search players to match directly"
          onPress={() => setMode('discovery')}
          style={[styles.modePill, mode === 'discovery' && styles.modePillActive]}
        >
          <Ionicons
            name="search-outline"
            size={16}
            color={mode === 'discovery' ? colors.background : colors.textSecondary}
          />
          <Text style={[styles.modePillText, mode === 'discovery' && styles.modePillTextActive]}>
            Discovery
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            incomingRequestCount > 0
              ? `View your matches, ${incomingRequestCount} incoming requests`
              : 'View your matches'
          }
          onPress={() => setMatchesOpen(true)}
          style={styles.modePill}
        >
          <View>
            <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
            {incomingRequestCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {incomingRequestCount > 9 ? '9+' : incomingRequestCount}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.modePillText}>Matches</Text>
        </Pressable>
      </View>

      {toast ? (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {mode === 'swipe' && phase === 'ready' ? (
        // Rendered outside the ScrollView below: the carousel owns its own vertical
        // scroll, and nesting two same-axis scrollers causes gesture conflicts.
        <View style={styles.deck}>
          {current ? (
            <ProfileCarousel
              candidates={queue}
              focusedIndex={focusedIndex}
              onFocusedIndexChange={setFocusedIndex}
              activeAction={activeAction}
              onActionComplete={handleActionComplete}
              onSkip={() => void handleSkip()}
              onConnect={() => void handleConnect()}
              actionBusy={actionBusy}
            />
          ) : (
            <View style={styles.stateBlock}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.stateText}>Loading next players…</Text>
            </View>
          )}
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {mode === 'discovery' ? (
          <DiscoveryView
            ownerUserId={user?.id ?? null}
            onToast={showToast}
            onMutualMatch={(name, connectionId) => {
              setMutualConnectionId(connectionId);
              setMutualName(name);
            }}
            onRequestSent={() => setRequestsRefreshToken((n) => n + 1)}
          />
        ) : null}

        {mode === 'swipe' && (phase === 'boot' || phase === 'locating' || phase === 'loading') && (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.stateText}>
              {phase === 'locating' ? 'Getting your location…' : 'Finding players nearby…'}
            </Text>
          </View>
        )}

        {mode === 'swipe' && phase === 'need_permission' && (
          <View style={styles.stateBlock}>
            <Text style={styles.stateTitle}>Location needed</Text>
            <Text style={styles.stateText}>
              ShowUp uses your location once to find players near you. Your coordinates are never
              shown on this screen.
            </Text>
            <AppButton label="Allow location" onPress={() => void handleRequestPermission()} />
          </View>
        )}

        {mode === 'swipe' && phase === 'denied' && (
          <View style={styles.stateBlock}>
            <Text style={styles.stateTitle}>Location permission denied</Text>
            <Text style={styles.stateText}>
              Enable location access in Settings, then return here to match with nearby players.
            </Text>
            <AppButton label="Open Settings" onPress={() => void openAppSettings()} />
            <AppButton
              label="Try again"
              variant="ghost"
              onPress={() => void handleRequestPermission()}
              style={styles.secondaryBtn}
            />
          </View>
        )}

        {mode === 'swipe' && phase === 'need_skill' && (
          <View style={styles.stateBlock}>
            <Text style={styles.stateTitle}>Set your skill level</Text>
            <Text style={styles.stateText}>
              Matchmaking needs your skill level so we can find compatible players.
            </Text>
            <SkillSelector selectedSkill={skillDraft} onSelectSkill={setSkillDraft} />
            <AppButton
              label={skillSaving ? 'Saving…' : 'Save & continue'}
              onPress={() => void handleSaveSkill()}
              disabled={skillSaving}
              style={styles.secondaryBtn}
            />
          </View>
        )}

        {mode === 'swipe' && (phase === 'error' || phase === 'offline') && (
          <View style={styles.stateBlock}>
            <Text style={styles.stateTitle}>
              {phase === 'offline' ? 'Offline' : 'Something went wrong'}
            </Text>
            <Text style={styles.stateText}>{errorMessage}</Text>
            <AppButton label="Retry" onPress={() => void reloadFromStart()} />
          </View>
        )}

        {mode === 'swipe' && phase === 'empty' && (
          <View style={styles.stateBlock}>
            <Text style={styles.stateTitle}>No suitable players nearby right now.</Text>
            <Text style={styles.stateText}>Try increasing distance or refreshing in a bit.</Text>
            <AppButton
              label="Increase distance"
              onPress={() => {
                const next = {
                  ...filtersRef.current,
                  radiusKm: nextLargerRadius(filtersRef.current.radiusKm),
                };
                void reloadFromStart(next);
              }}
            />
            <AppButton
              label="Refresh"
              variant="ghost"
              onPress={() => void reloadFromStart()}
              style={styles.secondaryBtn}
            />
          </View>
        )}

      </ScrollView>
      )}

      <MatchFiltersSheet
        visible={filtersOpen}
        filters={filters}
        preferredSports={preferredSports}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFiltersOpen(false);
          void reloadFromStart(next);
        }}
      />

      <MutualMatchModal
        visible={Boolean(mutualName)}
        name={mutualName ?? ''}
        onClose={() => {
          setMutualName(null);
          setMutualConnectionId(null);
        }}
        onOpenChat={() => {
          setMutualName(null);
          if (mutualConnectionId) {
            router.push({ pathname: '/chat/[connectionId]', params: { connectionId: mutualConnectionId } });
          } else {
            router.push('/(tabs)/chat');
          }
          setMutualConnectionId(null);
        }}
      />

      <MatchesListModal
        visible={matchesOpen}
        onClose={() => setMatchesOpen(false)}
        userId={user?.id ?? null}
        onMutualMatch={(name, connectionId) => {
          setMutualName(name);
          setMutualConnectionId(connectionId);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: '#1a1a2e',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
  },
  filterBtn: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterLabel: {
    color: colors.accent,
    ...typography.small,
    fontWeight: '800',
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  modePill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  modePillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modePillText: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: '800',
  },
  modePillTextActive: {
    color: colors.background,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: '800',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  deck: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
  },
  stateBlock: {
    alignItems: 'stretch',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  stateText: {
    color: colors.textSecondary,
    textAlign: 'center',
    ...typography.body,
  },
  secondaryBtn: {
    marginTop: spacing.xs,
  },
  toast: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  toastText: {
    color: colors.accent,
    ...typography.small,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
});
