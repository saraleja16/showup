import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AppStateStatus,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import {
  checkInToEvent,
  confirmParticipantAttendance,
  confirmEventResult,
  disputeEventResult,
  getApiErrorMessage,
  getEventById,
  getEventLive,
  getEventResult,
  getResultApiErrorMessage,
  isCheckInTooFar,
  isNetworkError,
  markParticipantAbsent,
  submitEventResult,
  type EventItem,
  type EventResultSummary,
  type EventSportDetails,
  type SubmitEventResultPayload,
} from '@/src/api';
import {
  getEventEndMs,
  isWithinCheckInWindow,
  phaseStatusLabel,
  resolveEventPhase,
  type GamePhase,
  type ResultLifecycle,
} from '@/src/live/gamePhase';
import { useServerClock } from '@/src/live/useServerClock';
import { loadEventRoster, splitSides, type RosterMember } from '@/src/live/roster';
import {
  attendanceVerificationBadge,
  mapLiveAttendanceToStatus,
  parseVerificationMethod,
} from '@/src/live/attendanceLabels';
import { normalizeSportKey } from '@/lib/sport-match';
import {
  defaultLinesForSport,
  isSupportedScoreSport,
  nextLineLabel,
  type ScoreLine,
  type SupportedScoreSport,
} from '@/src/live/resultStore';
import { EventCountdown } from '@/src/components/event-status/EventCountdown';
import { LiveEventStatus } from '@/src/components/event-status/LiveEventStatus';
import { SportScoreDisplay } from '@/src/components/event-status/SportScoreDisplay';
import { SportIcon } from '@/src/components/SportIcon';

type Variant = 'my-games' | 'profile' | 'home' | 'detail' | 'map';

type Props = {
  eventId: string;
  scheduledAt: string;
  scheduledEnd?: string | null;
  sport: string;
  sportDetails?: EventSportDetails | null;
  title: string;
  locationLabel: string;
  playersLabel: string;
  isHost: boolean;
  userId: string;
  variant: Variant;
  /** When true, card starts expanded (My Games live/finished). */
  initiallyExpanded?: boolean;
  onOpenDetail?: () => void;
  compactDatetime?: string;
  myStatus?: EventItem['myStatus'];
  seedEvent?: EventItem | null;
  /** Outside viewers: hide attendance/score editing controls. */
  readOnly?: boolean;
  /** Optional seed status from portfolio/live list. */
  serverStatus?: string | null;
  seedResult?: EventResultSummary | null;
  presentCount?: number | null;
  participantCount?: number | null;
  /** Called after a result is successfully submitted/confirmed/disputed so lists can refetch. */
  onResultChanged?: () => void;
};

function Avatar({ uri, name, dimmed }: { uri: string | null; name: string; dimmed?: boolean }) {
  const initial = (name.trim()[0] || '?').toUpperCase();
  return (
    <View style={[styles.avatar, dimmed && styles.avatarDimmed]}>
      {uri ? (
        <Image source={{ uri }} style={styles.avatarImage} />
      ) : (
        <Text style={styles.avatarInitial}>{initial}</Text>
      )}
    </View>
  );
}

function StatusPill({ phase, isHost }: { phase: GamePhase; isHost: boolean }) {
  const live = phase === 'live';
  const soon = phase === 'starting_soon';
  const label =
    live
      ? '● LIVE NOW'
      : soon
        ? 'STARTING SOON'
        : phaseStatusLabel(phase, isHost ? 'hosting' : 'joined');
  return (
    <View
      style={[
        styles.statusPill,
        live && styles.statusPillLive,
        soon && styles.statusPillSoon,
        phase === 'finished' && styles.statusPillFinished,
        phase === 'completed' && styles.statusPillCompleted,
        phase === 'result_pending' && styles.statusPillPending,
      ]}
    >
      {live ? <View style={styles.liveDot} /> : null}
      <Text style={[styles.statusPillText, live && styles.statusPillTextLive, soon && styles.statusPillTextSoon]}>
        {label}
      </Text>
    </View>
  );
}

export function LiveGameCardContent({
  eventId,
  scheduledAt,
  scheduledEnd,
  sport,
  sportDetails,
  title,
  locationLabel,
  playersLabel,
  isHost,
  userId,
  variant,
  initiallyExpanded,
  onOpenDetail,
  compactDatetime,
  myStatus,
  seedEvent,
  readOnly = false,
  serverStatus,
  seedResult,
  presentCount: seedPresentCount,
  participantCount: seedParticipantCount,
  onResultChanged,
}: Props) {
  const { nowMs, syncFromServerNow } = useServerClock();
  const [expanded, setExpanded] = useState(Boolean(initiallyExpanded) || variant === 'detail');
  const [event, setEvent] = useState<EventItem | null>(seedEvent ?? null);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [result, setResult] = useState<EventResultSummary | null>(
    seedResult ?? seedEvent?.resultSummary ?? null
  );
  const [liveStatus, setLiveStatus] = useState<string | null>(
    serverStatus ?? seedEvent?.liveStatus ?? null
  );
  const [livePresentCount, setLivePresentCount] = useState<number | null>(seedPresentCount ?? null);
  const [livePendingCount, setLivePendingCount] = useState<number | null>(null);
  const [liveParticipantCount, setLiveParticipantCount] = useState<number | null>(
    seedParticipantCount ?? null
  );
  const [scheduledEndIso, setScheduledEndIso] = useState<string | null>(
    scheduledEnd ?? seedEvent?.scheduledEnd ?? null
  );
  const [loadingLive, setLoadingLive] = useState(false);
  const [checkInState, setCheckInState] = useState<string | null>(null);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);
  const [canManageAttendance, setCanManageAttendance] = useState(Boolean(isHost));
  const [draftLines, setDraftLines] = useState<ScoreLine[]>([]);
  const [resultBusy, setResultBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const autoCheckInAttempted = useRef(false);

  useEffect(() => {
    const next = seedResult ?? seedEvent?.resultSummary ?? null;
    if (next) setResult(normalizeResultSummary(next));
  }, [seedEvent?.resultSummary, seedResult]);

  const interactive = !readOnly && Boolean(userId) && (isHost || Boolean(myStatus));
  const details = event?.sportDetails ?? sportDetails ?? null;
  const sportKey = event?.sport ?? sport;
  // Only derive result lifecycle from the saved result — never from liveStatus
  // (server "Completed" without a result was incorrectly showing FINAL RESULT).
  const resultLifecycle: ResultLifecycle = (() => {
    const s = normalizeResultStatus(result?.status);
    if (s === 'confirmed') return 'confirmed';
    if (s === 'pendingconfirmation') return 'submitted';
    if (s === 'disputed') return 'disputed';
    return 'none';
  })();

  const startIso = event?.scheduledAt ?? scheduledAt;
  const phase: GamePhase = resolveEventPhase({
    scheduledAt: startIso,
    scheduledEnd: scheduledEndIso ?? event?.scheduledEnd,
    sport: sportKey,
    sportDetails: details,
    nowMs,
    serverStatus: liveStatus ?? event?.liveStatus ?? serverStatus,
    resultLifecycle,
  });

  const startMs = new Date(startIso).getTime();
  const endMs = scheduledEndIso
    ? new Date(scheduledEndIso).getTime()
    : getEventEndMs(startIso, sportKey, details);
  const showLiveChrome =
    phase === 'live' ||
    phase === 'starting_soon' ||
    phase === 'finished' ||
    phase === 'result_pending' ||
    phase === 'completed';

  const refreshLive = useCallback(async () => {
    setLoadingLive(true);
    try {
      const [fresh, live, savedResult] = await Promise.all([
        getEventById(eventId, userId || undefined).catch(() => seedEvent ?? null),
        getEventLive(eventId, userId || undefined).catch(() => null),
        getEventResult(eventId).catch(() => null),
      ]);
      if (fresh) setEvent(fresh);
      if (live) {
        syncFromServerNow(live.serverNow);
        setLiveStatus(live.status);
        setLivePresentCount(live.presentCount);
        setLivePendingCount(live.pendingCount);
        setLiveParticipantCount(live.participantCount);
        setScheduledEndIso(live.scheduledEnd);
        setCanManageAttendance(Boolean(live.permissions?.canManageAttendance));
      }
      // Authoritative result: prefer GET /results, then live/detail summaries.
      const authoritative =
        savedResult ??
        live?.resultSummary ??
        fresh?.resultSummary ??
        null;
      if (authoritative) {
        setResult(normalizeResultSummary(authoritative));
      }
      const base = fresh ?? seedEvent;
      if (live?.participants?.length) {
        setRoster(
          live.participants.map((p) => {
            const status = mapLiveAttendanceToStatus(p.attendanceStatus);
            const verification =
              status === 'Attended'
                ? parseVerificationMethod(p.verificationMethod) ?? 'auto'
                : null;
            return {
              userId: p.userId,
              displayName: p.displayName?.trim() || 'Player',
              avatarUrl: p.avatarUrl ?? null,
              team: null,
              status,
              statusUpdatedAt: null,
              verification,
              verificationMethod: p.verificationMethod ?? null,
            };
          })
        );
      } else if (base) {
        const members = await loadEventRoster(base, userId);
        setRoster(members);
      }
      // Never re-seed zero drafts when a saved backend result exists.
      const hasBackendResult = Boolean(
        authoritative &&
          (authoritative.resultId ||
            authoritative.summary ||
            authoritative.scoreA != null ||
            (authoritative.sets && authoritative.sets.length) ||
            (authoritative.games && authoritative.games.length))
      );
      if (
        base &&
        !hasBackendResult &&
        isSupportedScoreSport(base.sport ?? sport) &&
        draftLines.length === 0
      ) {
        setDraftLines(defaultLinesForSport(normalizeSupported(base.sport ?? sport)));
      }
    } finally {
      setLoadingLive(false);
    }
  }, [draftLines.length, eventId, seedEvent, sport, syncFromServerNow, userId]);

  useEffect(() => {
    if (phase === 'live') {
      setExpanded(true);
      return;
    }
    // Finished/result-pending scoring UI only auto-expands on the detail page —
    // list cards (my-games/profile/home) show a compact CTA instead.
    if ((phase === 'finished' || phase === 'result_pending') && variant === 'detail') {
      setExpanded(true);
    }
  }, [phase, variant]);

  useEffect(() => {
    if (variant === 'map') return;
    if (!showLiveChrome && variant === 'home' && phase === 'upcoming') {
      // Still tick locally; light refresh for upcoming.
    }
    void refreshLive();
    const intervalMs =
      phase === 'live' || phase === 'starting_soon' ? 30_000 : phase === 'upcoming' ? 60_000 : 45_000;
    const id = setInterval(() => void refreshLive(), intervalMs);
    return () => clearInterval(id);
  }, [phase, refreshLive, showLiveChrome, variant]);

  const hereCount =
    livePresentCount ?? roster.filter((m) => m.status === 'Attended').length;
  const pendingCount =
    livePendingCount ??
    roster.filter((m) => m.status === 'Registered' || m.status === 'Unknown').length;
  const activeCount =
    liveParticipantCount ??
    roster.filter(
      (m) => m.status === 'Registered' || m.status === 'Attended' || m.status === 'NoShow'
    ).length;
  const sides = useMemo(() => splitSides(roster), [roster]);
  const myRosterStatus = roster.find((m) => m.userId === userId)?.status ?? myStatus;
  const iAmPresent = myRosterStatus === 'Attended';
  const hostCanManage = canManageAttendance || isHost;

  const runLocationCheckIn = useCallback(
    async (opts?: { manual?: boolean }) => {
      if (!interactive || !userId) return;
      if (iAmPresent) {
        setCheckInState('✓ Auto checked in');
        return;
      }
      if (!opts?.manual && autoCheckInAttempted.current) return;

      if (!opts?.manual) autoCheckInAttempted.current = true;
      setCheckInBusy(true);
      setCheckInState('Checking location...');

      try {
        if (Platform.OS === 'web') {
          // Web: try browser geolocation; many browsers block without HTTPS.
          const { status: perm } = await Location.requestForegroundPermissionsAsync();
          if (perm !== 'granted') {
            setCheckInState('Location permission denied');
            return;
          }
        } else {
          const { status: perm } = await Location.requestForegroundPermissionsAsync();
          if (perm !== 'granted') {
            setCheckInState('Location permission denied');
            return;
          }
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude, longitude, accuracy } = position.coords;

        const response = await checkInToEvent(eventId, {
          userId,
          latitude,
          longitude,
          accuracyMeters:
            typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : undefined,
        });

        const method = (response.verificationMethod ?? '').toLowerCase();
        setCheckInState(
          method.includes('host') ? '✓ Host Confirmed' : '✓ Auto checked in'
        );
        await refreshLive();
      } catch (err) {
        if (isCheckInTooFar(err)) {
          setCheckInState('Too far from venue');
        } else if (isNetworkError(err) || !navigatorOnLine()) {
          setCheckInState('No internet/data');
          // Allow another automatic attempt when connectivity returns.
          autoCheckInAttempted.current = false;
        } else if (
          err instanceof Error &&
          /location|permission|unavailable/i.test(err.message)
        ) {
          setCheckInState('Location unavailable');
        } else {
          setCheckInState('Waiting for manual confirmation');
        }
      } finally {
        setCheckInBusy(false);
      }
    },
    [eventId, iAmPresent, interactive, refreshLive, userId]
  );

  const runAutoCheckIn = useCallback(async () => {
    if (!interactive || !userId) return;
    if (iAmPresent) return;
    const at = event?.scheduledAt ?? scheduledAt;
    if (!isWithinCheckInWindow(at, nowMs) && phase !== 'live' && phase !== 'starting_soon') {
      return;
    }
    await runLocationCheckIn({ manual: false });
  }, [
    event?.scheduledAt,
    iAmPresent,
    interactive,
    nowMs,
    phase,
    runLocationCheckIn,
    scheduledAt,
    userId,
  ]);

  useEffect(() => {
    if (!interactive) return;
    if (variant === 'home' || variant === 'map') return;
    if (phase === 'live' || phase === 'starting_soon') {
      void runAutoCheckIn();
    }
  }, [interactive, phase, runAutoCheckIn, variant]);

  useEffect(() => {
    if (!interactive) return;
    if (variant === 'home' || variant === 'map') return;
    if (phase !== 'live' && phase !== 'starting_soon') return;

    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      if (iAmPresent) return;
      // Retry location check when returning to foreground (e.g. after enabling data).
      autoCheckInAttempted.current = false;
      void runAutoCheckIn();
      void refreshLive();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [iAmPresent, interactive, phase, refreshLive, runAutoCheckIn, variant]);

  function confirmMemberAttendance(member: RosterMember) {
    if (!userId) return;
    if (member.userId === userId) {
      Alert.alert('Attendance', 'You cannot manually confirm yourself.');
      return;
    }
    if (!hostCanManage) {
      Alert.alert('Attendance', 'Only the host can manually confirm attendance.');
      return;
    }

    Alert.alert(
      'Confirm attendance',
      `Confirm ${member.displayName} is physically present at this event?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: () => {
            void (async () => {
              setConfirmingUserId(member.userId);
              try {
                await confirmParticipantAttendance(eventId, {
                  hostUserId: userId,
                  targetUserId: member.userId,
                  status: 'Present',
                });
                await refreshLive();
              } catch (err) {
                Alert.alert(
                  'Attendance',
                  getApiErrorMessage(err, 'Could not confirm attendance.')
                );
              } finally {
                setConfirmingUserId(null);
              }
            })();
          },
        },
      ]
    );
  }

  function markMemberAbsent(member: RosterMember) {
    if (!userId || !hostCanManage) return;
    if (member.userId === userId) {
      Alert.alert('Attendance', 'You cannot mark yourself absent this way.');
      return;
    }
    Alert.alert('Mark not present', `Mark ${member.displayName} as not present?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Absent',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setConfirmingUserId(member.userId);
            try {
              await markParticipantAbsent(eventId, userId, member.userId);
              await refreshLive();
            } catch (err) {
              Alert.alert(
                'Attendance',
                getApiErrorMessage(err, 'Could not update attendance.')
              );
            } finally {
              setConfirmingUserId(null);
            }
          })();
        },
      },
    ]);
  }

  async function handleSubmitResult(lines?: ScoreLine[]) {
    // setSubmitError alongside Alert.alert on every early-out below — Alert is a
    // no-op on web, so without visible text these guards look like a dead button.
    if (!interactive) {
      const message = 'You cannot submit a result for this game.';
      setSubmitError(message);
      Alert.alert('Result', message);
      return;
    }
    if (!userId) {
      const message = 'You must be signed in to submit a result.';
      setSubmitError(message);
      Alert.alert('Result', message);
      return;
    }
    if (!isSupportedScoreSport(sportKey)) {
      const message = 'Scoring is only available for Tennis, Soccer, Pickleball and Volleyball.';
      setSubmitError(message);
      Alert.alert('Result', message);
      return;
    }
    const payloadLines = lines && lines.length ? lines : draftLines;
    if (!payloadLines.length) return;
    setResultBusy(true);
    setSubmitError(null);
    try {
      const sportNorm = normalizeSupported(sportKey);
      const payload = buildSubmitPayload(
        sportNorm,
        userId,
        sides.sideAName,
        sides.sideBName,
        payloadLines
      );
      const submitted = await submitEventResult(eventId, payload, { sport: sportNorm });
      setResult(normalizeResultSummary(submitted));
      // Authoritative refetch — do not treat local draft as the saved result.
      const authoritative = await getEventResult(eventId).catch(() => null);
      if (authoritative) {
        setResult(normalizeResultSummary(authoritative));
      }
      await refreshLive();
      onResultChanged?.();
    } catch (err) {
      const message = getResultApiErrorMessage(err, 'Could not submit result.');
      setSubmitError(message);
      Alert.alert('Result submit failed', message);
    } finally {
      setResultBusy(false);
    }
  }

  async function handleConfirmResult() {
    if (!interactive || !result) return;
    setResultBusy(true);
    setSubmitError(null);
    try {
      const next = normalizeResultSummary(await confirmEventResult(eventId, userId));
      setResult(next);
      const authoritative = await getEventResult(eventId).catch(() => null);
      if (authoritative) setResult(normalizeResultSummary(authoritative));
      await refreshLive();
      onResultChanged?.();
    } catch (err) {
      const message = getResultApiErrorMessage(err, 'Could not confirm result.');
      setSubmitError(message);
      Alert.alert('Result', message);
    } finally {
      setResultBusy(false);
    }
  }

  async function handleDisputeResult() {
    if (!interactive || !result) return;
    setResultBusy(true);
    setSubmitError(null);
    try {
      const next = normalizeResultSummary(await disputeEventResult(eventId, userId));
      setResult(next);
      const authoritative = await getEventResult(eventId).catch(() => null);
      if (authoritative) setResult(normalizeResultSummary(authoritative));
      await refreshLive();
      onResultChanged?.();
    } catch (err) {
      const message = getResultApiErrorMessage(err, 'Could not dispute result.');
      setSubmitError(message);
      Alert.alert('Result', message);
    } finally {
      setResultBusy(false);
    }
  }

  const headerRight = <StatusPill phase={phase} isHost={isHost} />;
  const hasSavedResult = isSavedBackendResult(result);
  const resultStatusNorm = normalizeResultStatus(result?.status);
  const canConfirmResult =
    interactive &&
    hasSavedResult &&
    resultStatusNorm === 'pendingconfirmation' &&
    Boolean(result?.submittedByUserId) &&
    result?.submittedByUserId !== userId;
  const scoreCtaLabel = (() => {
    if (!hasSavedResult) return interactive ? 'Score your game' : 'Waiting for score';
    if (resultStatusNorm === 'confirmed') return 'See result';
    if (canConfirmResult) return 'Confirm result';
    return 'See details';
  })();
  const resultScoreLabel =
    result?.unitsWonA != null && result?.unitsWonB != null
      ? `${result.unitsWonA} — ${result.unitsWonB}`
      : result?.scoreA != null && result?.scoreB != null
        ? `${result.scoreA} — ${result.scoreB}`
        : null;

  const content = (
    <>
      <View style={styles.cardTopRow}>
        <View style={styles.sportTag}>
          <SportIcon sportId={sport} size={12} color="#6ee7b7" />
          <Text style={styles.sportTagText}>{String(sport).toUpperCase()}</Text>
        </View>
        {headerRight}
      </View>

      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.cardIconRow}>
        <Ionicons name="location-outline" size={13} color="#a7f3d0" />
        <Text style={styles.cardLocation} numberOfLines={1}>{locationLabel}</Text>
      </View>

      {phase === 'upcoming' || phase === 'starting_soon' || phase === 'live' ? (
        <>
          <View style={styles.cardIconRow}>
            <Ionicons name="time-outline" size={13} color="#a7f3d0" />
            <Text style={styles.cardDate}>
              {compactDatetime ? compactDatetime : formatWhen(startIso)}
            </Text>
          </View>
          <View style={styles.cardBottomRow}>
            <View style={styles.metaBadge}>
              <Ionicons name="people-outline" size={13} color="#ecfdf5" />
              <Text style={styles.metaText}>{playersLabel}</Text>
            </View>
          </View>
          <EventCountdown
            phase={phase}
            startMs={startMs}
            endMs={endMs}
            nowMs={nowMs}
            compact={variant === 'map'}
          />
          {phase === 'live' || phase === 'starting_soon' ? (
            <LiveEventStatus
              phase={phase}
              presentCount={hereCount}
              pendingCount={pendingCount}
              totalCount={activeCount}
              avatars={roster.map((m) => ({
                id: m.userId,
                name: m.displayName,
                avatarUrl: m.avatarUrl,
                present: m.status === 'Attended',
              }))}
            />
          ) : null}
          {checkInState && interactive ? (
            <View style={styles.checkInBlock}>
              <Text style={styles.checkInHint}>{checkInState}</Text>
              {checkInState === 'No internet/data' ||
              checkInState === 'Location permission denied' ||
              checkInState === 'Location unavailable' ||
              checkInState === 'Waiting for manual confirmation' ? (
                <Text style={styles.checkInSubHint}>
                  Attendance Pending — Could not verify automatically. Ask someone at the event to
                  confirm you.
                </Text>
              ) : null}
              {checkInState === 'Too far from venue' ? (
                <Text style={styles.checkInSubHint}>You&apos;re outside the check-in area.</Text>
              ) : null}
              {!iAmPresent && (phase === 'live' || phase === 'starting_soon') ? (
                <Pressable
                  disabled={checkInBusy}
                  onPress={() => void runLocationCheckIn({ manual: true })}
                  style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.smallBtnText}>
                    {checkInBusy ? 'Checking…' : 'Check In'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      {phase === 'finished' || phase === 'result_pending' || phase === 'completed' ? (
        <View>
          <LiveEventStatus
            phase={phase}
            resultLabel={resultScoreLabel}
            resultStatus={result?.status}
          />
          {variant === 'detail' ? (
            result && !(interactive && expanded) ? (
              <SportScoreDisplay
                sport={sportKey}
                result={result}
                sideAName={result.sideALabel || sides.sideAName}
                sideBName={result.sideBLabel || sides.sideBName}
              />
            ) : !result ? (
              <Text style={styles.hint}>{interactive ? 'Add Result when ready.' : 'Result pending'}</Text>
            ) : null
          ) : variant !== 'map' ? (
            <Pressable
              onPress={onOpenDetail}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.primaryBtnText}>{scoreCtaLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {interactive && expanded && showLiveChrome && variant !== 'map' ? (
        <View style={styles.expandBlock}>
          {loadingLive ? <ActivityIndicator color="#a8ff3e" style={{ marginVertical: 8 }} /> : null}

          {(phase === 'live' || phase === 'starting_soon') && (
            <>
              <Text style={styles.sectionLabel}>ATTENDANCE</Text>
              <Text style={styles.hint}>
                {hereCount} / {activeCount} HERE
                {pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
              </Text>
              {roster.map((member) => {
                const attended = member.status === 'Attended';
                const pending =
                  member.status === 'Registered' || member.status === 'Unknown';
                const badge = attendanceVerificationBadge({
                  attendanceStatus:
                    member.status === 'Attended'
                      ? 'Present'
                      : member.status === 'NoShow'
                        ? 'Absent'
                        : 'Pending',
                  verificationMethod: member.verificationMethod,
                });
                const canConfirmThis =
                  interactive &&
                  hostCanManage &&
                  pending &&
                  member.userId !== userId;
                const rowBusy = confirmingUserId === member.userId;

                return (
                  <View key={member.userId} style={styles.memberRow}>
                    <Avatar
                      uri={member.avatarUrl}
                      name={member.displayName}
                      dimmed={!attended}
                    />
                    <View style={styles.memberMeta}>
                      <Text style={styles.memberName}>{member.displayName}</Text>
                      <Text style={styles.memberStatus}>{badge}</Text>
                    </View>
                    {canConfirmThis ? (
                      <View style={{ gap: 4 }}>
                        <Pressable
                          disabled={rowBusy || confirmingUserId != null}
                          onPress={() => confirmMemberAttendance(member)}
                          style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.smallBtnText}>
                            {rowBusy ? 'Saving…' : 'Confirm Attendance'}
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={rowBusy || confirmingUserId != null}
                          onPress={() => markMemberAbsent(member)}
                          style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.smallBtnText}>Mark Not Present</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {!hostCanManage && interactive ? (
                <Text style={styles.hint}>
                  Only the host can manually confirm other players. If you cannot check in, ask the
                  host at the event.
                </Text>
              ) : null}
              {interactive && !iAmPresent ? (
                <Pressable
                  disabled={checkInBusy}
                  onPress={() => void runLocationCheckIn({ manual: true })}
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryBtnText}>
                    {checkInBusy ? 'Checking location…' : 'Check In with location'}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}

          {variant === 'detail' &&
          (phase === 'finished' || phase === 'result_pending' || phase === 'completed') &&
          isSupportedScoreSport(sportKey) ? (
            <ResultSection
              sport={normalizeSupported(sportKey)}
              sides={sides}
              result={result}
              draftLines={draftLines}
              setDraftLines={setDraftLines}
              busy={resultBusy}
              userId={userId}
              apiError={submitError}
              onSubmit={(lines) => void handleSubmitResult(lines)}
              onConfirm={() => void handleConfirmResult()}
              onDispute={() => void handleDisputeResult()}
            />
          ) : null}

          {onOpenDetail ? (
            <Pressable onPress={onOpenDetail} style={styles.detailLink}>
              <Text style={styles.detailLinkText}>Open game details</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );

  if (variant === 'detail') {
    return <View>{content}</View>;
  }

  return (
    <Pressable
      onPress={() => {
        if (variant === 'home' || variant === 'map') {
          onOpenDetail?.();
          return;
        }
        // Only attendance chrome (live/starting-soon) toggles inline expand in list
        // cards. Finished/result-pending/completed always route to the detail page —
        // scoring lives there, not in the compact card.
        if (interactive && showLiveChrome && (phase === 'live' || phase === 'starting_soon')) {
          setExpanded((v) => !v);
          return;
        }
        onOpenDetail?.();
      }}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}


function ResultSection({
  sport,
  sides,
  result,
  draftLines,
  setDraftLines,
  busy,
  userId,
  apiError,
  onSubmit,
  onConfirm,
  onDispute,
}: {
  sport: SupportedScoreSport;
  sides: ReturnType<typeof splitSides>;
  result: EventResultSummary | null;
  draftLines: ScoreLine[];
  setDraftLines: (lines: ScoreLine[]) => void;
  busy: boolean;
  userId: string;
  apiError?: string | null;
  onSubmit: (lines: ScoreLine[]) => void;
  onConfirm: () => void;
  onDispute: () => void;
}) {
  const a = sides.sideA[0];
  const b = sides.sideB[0];
  const sideAName =
    result?.sideALabel?.trim() ||
    a?.displayName?.trim() ||
    sides.sideAName?.trim() ||
    'Side A';
  const sideBName =
    result?.sideBLabel?.trim() ||
    b?.displayName?.trim() ||
    sides.sideBName?.trim() ||
    'Side B';
  const finalA = result?.unitsWonA ?? result?.scoreA ?? null;
  const finalB = result?.unitsWonB ?? result?.scoreB ?? null;
  const status = normalizeResultStatus(result?.status);
  const hasSaved = isSavedBackendResult(result);

  // String draft while typing — never coerce empty -> 0 mid-edit.
  const [editLines, setEditLines] = useState<{ label: string; sideA: string; sideB: string }[]>(
    () =>
      (draftLines.length ? draftLines : defaultLinesForSport(sport)).map((line) => ({
        label: line.label,
        sideA: String(line.sideA ?? ''),
        sideB: String(line.sideB ?? ''),
      }))
  );
  const [formError, setFormError] = useState<string | null>(null);
  const seededFromResult = useRef(false);

  useEffect(() => {
    if (seededFromResult.current) return;
    if (!result || hasSaved) return;
    const parsed = parseScoreLinesFromResult(sport, result);
    if (parsed.length) {
      setEditLines(
        parsed.map((line) => ({
          label: line.label,
          sideA: String(line.sideA),
          sideB: String(line.sideB),
        }))
      );
      setDraftLines(parsed);
      seededFromResult.current = true;
    }
  }, [hasSaved, result, setDraftLines, sport]);

  if (hasSaved && status === 'confirmed') {
    return (
      <View>
        <Text style={styles.sectionLabel}>✓ FINAL RESULT</Text>
        <ScoreColumns
          left={{ uri: a?.avatarUrl ?? null, name: sideAName }}
          right={{ uri: b?.avatarUrl ?? null, name: sideBName }}
          rows={
            sport === 'soccer'
              ? [
                  {
                    label: 'Final',
                    left: String(finalA ?? '—'),
                    right: String(finalB ?? '—'),
                  },
                ]
              : parseScoreLinesFromResult(sport, result).map((line) => ({
                  label: line.label,
                  left: String(line.sideA),
                  right: String(line.sideB),
                }))
          }
          readOnly
          finalScore={
            finalA != null && finalB != null ? `${finalA} — ${finalB}` : null
          }
        />
      </View>
    );
  }

  if (hasSaved) {
    const canRespond =
      result != null &&
      Boolean(result.submittedByUserId) &&
      result.submittedByUserId !== userId &&
      status === 'pendingconfirmation';
    return (
      <View>
        <Text style={styles.sectionLabel}>
          {status === 'disputed' ? 'RESULT DISPUTED' : 'RESULT SUBMITTED'}
        </Text>
        <ScoreColumns
          left={{ uri: a?.avatarUrl ?? null, name: sideAName }}
          right={{ uri: b?.avatarUrl ?? null, name: sideBName }}
          rows={
            sport === 'soccer'
              ? [
                  {
                    label: 'Final',
                    left: String(finalA ?? '—'),
                    right: String(finalB ?? '—'),
                  },
                ]
              : parseScoreLinesFromResult(sport, result).map((line) => ({
                  label: line.label,
                  left: String(line.sideA),
                  right: String(line.sideB),
                }))
          }
          readOnly
          finalScore={
            finalA != null && finalB != null ? `${finalA} — ${finalB}` : null
          }
        />
        {apiError ? <Text style={styles.formError}>{apiError}</Text> : null}
        {status === 'disputed' ? (
          <Text style={styles.hint}>Result disputed</Text>
        ) : canRespond ? (
          <View style={styles.rowBtns}>
            <Pressable
              disabled={busy}
              onPress={onConfirm}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.primaryBtnText}>{busy ? 'Saving result...' : 'Confirm Result'}</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onDispute}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryBtnText}>Dispute</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.hint}>Waiting for confirmation</Text>
        )}
      </View>
    );
  }

  function updateCell(index: number, side: 'sideA' | 'sideB', raw: string) {
    const cleaned = sanitizeScoreInput(raw);
    setFormError(null);
    setEditLines((prev) => {
      const next = prev.map((line, i) =>
        i === index ? { ...line, [side]: cleaned } : line
      );
      return next;
    });
  }

  function addLine() {
    setEditLines((prev) => [
      ...prev,
      { label: nextLineLabel(sport, prev.length), sideA: '', sideB: '' },
    ]);
  }

  function removeLine(index: number) {
    setFormError(null);
    setEditLines((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Relabel sequentially so labels stay "Set 1, Set 2, ..." after a removal.
      return next.map((line, i) => ({ ...line, label: nextLineLabel(sport, i) }));
    });
  }

  function handleSubmitPress() {
    const converted: ScoreLine[] = [];
    for (const line of editLines) {
      const sideA = parseOptionalScore(line.sideA);
      const sideB = parseOptionalScore(line.sideB);
      if (sideA == null || sideB == null) {
        setFormError('Enter a whole number (0–99) for every score box before submitting.');
        return;
      }
      converted.push({ label: line.label, sideA, sideB });
    }
    if (sport === 'soccer' && converted.length < 1) {
      setFormError('Enter the final soccer score.');
      return;
    }
    if (sport !== 'soccer' && converted.length < 2) {
      setFormError(`Add at least two ${sport === 'pickleball' ? 'games' : 'set'} scores.`);
      return;
    }
    setDraftLines(converted);
    setFormError(null);
    onSubmit(converted);
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>ADD RESULT</Text>
      <ScoreColumns
        left={{ uri: a?.avatarUrl ?? null, name: sideAName }}
        right={{ uri: b?.avatarUrl ?? null, name: sideBName }}
        rows={editLines.map((line, index) => ({
          label: line.label,
          left: line.sideA,
          right: line.sideB,
          onChangeLeft: (t: string) => updateCell(index, 'sideA', t),
          onChangeRight: (t: string) => updateCell(index, 'sideB', t),
          onRemove: sport !== 'soccer' && editLines.length > 2 ? () => removeLine(index) : undefined,
        }))}
        readOnly={false}
      />

      {sport !== 'soccer' && editLines.length < 5 ? (
        <Pressable onPress={addLine} accessibilityRole="button">
          <Text style={styles.addSet}>+ Add {sport === 'pickleball' ? 'Game' : 'Set'}</Text>
        </Pressable>
      ) : null}

      {formError ? <Text style={styles.formError}>{formError}</Text> : null}
      {apiError ? <Text style={styles.formError}>{apiError}</Text> : null}

      <Pressable
        disabled={busy}
        onPress={handleSubmitPress}
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
      >
        <Text style={styles.primaryBtnText}>{busy ? 'Saving result...' : 'Submit Result'}</Text>
      </Pressable>
    </View>
  );
}

type ScoreColumnRow = {
  label: string;
  left: string;
  right: string;
  onChangeLeft?: (text: string) => void;
  onChangeRight?: (text: string) => void;
  /** When set, a small remove control renders next to the row label. */
  onRemove?: () => void;
};

function ScoreColumns({
  left,
  right,
  rows,
  readOnly,
  finalScore,
}: {
  left: { uri: string | null; name: string };
  right: { uri: string | null; name: string };
  rows: ScoreColumnRow[];
  readOnly: boolean;
  finalScore?: string | null;
}) {
  return (
    <View style={styles.scoreGrid}>
      <View style={styles.scoreGridHeader}>
        <View style={styles.scoreCol}>
          <Avatar uri={left.uri} name={left.name} />
          <Text style={styles.scoreColName} numberOfLines={2}>
            {left.name}
          </Text>
        </View>
        <View style={styles.scoreMid}>
          <Text style={styles.vs}>{finalScore ? finalScore : 'vs'}</Text>
        </View>
        <View style={styles.scoreCol}>
          <Avatar uri={right.uri} name={right.name} />
          <Text style={styles.scoreColName} numberOfLines={2}>
            {right.name}
          </Text>
        </View>
      </View>

      {rows.map((row) => (
        <View key={row.label} style={styles.scoreGridRow}>
          <View style={styles.scoreRowLabelRow}>
            <Text style={styles.scoreRowLabel}>{row.label}</Text>
            {row.onRemove ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${row.label}`}
                onPress={row.onRemove}
                hitSlop={8}
                style={({ pressed }) => [styles.removeSetBtn, pressed && styles.pressed]}
              >
                <Ionicons name="close-circle" size={16} color="#fca5a5" />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.scoreGridHeader}>
            <View style={styles.scoreCol}>
              {readOnly || !row.onChangeLeft ? (
                <Text style={styles.scoreReadValue}>{row.left}</Text>
              ) : (
                <TextInput
                  style={styles.scoreInput}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={row.left}
                  placeholder="0"
                  placeholderTextColor="#6b7280"
                  maxLength={2}
                  selectTextOnFocus
                  onChangeText={row.onChangeLeft}
                />
              )}
            </View>
            <View style={styles.scoreMid}>
              <Text style={styles.vs}>—</Text>
            </View>
            <View style={styles.scoreCol}>
              {readOnly || !row.onChangeRight ? (
                <Text style={styles.scoreReadValue}>{row.right}</Text>
              ) : (
                <TextInput
                  style={styles.scoreInput}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={row.right}
                  placeholder="0"
                  placeholderTextColor="#6b7280"
                  maxLength={2}
                  selectTextOnFocus
                  onChangeText={row.onChangeRight}
                />
              )}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Allow empty while typing; digits only; max 2 chars. */
function sanitizeScoreInput(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, 2);
}

function parseOptionalScore(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 0 || n > 99) return null;
  return n;
}

function parseScoreLinesFromResult(
  sport: SupportedScoreSport,
  result: EventResultSummary | null
): ScoreLine[] {
  if (!result) return [];
  if (sport === 'soccer') {
    const a = result.scoreA;
    const b = result.scoreB;
    if (a == null || b == null) return [];
    return [{ label: 'Final', sideA: a, sideB: b }];
  }

  const fromArrays =
    sport === 'pickleball'
      ? result.games?.length
        ? result.games
        : result.sets
      : result.sets?.length
        ? result.sets
        : result.games;
  if (fromArrays?.length) {
    return fromArrays.map((p, i) => ({
      label: nextLineLabel(sport, i),
      sideA: p.sideA,
      sideB: p.sideB,
    }));
  }

  const head = (result.summary ?? '').split('(')[0] ?? '';
  const parts = head
    .split(',')
    .map((p) => p.trim())
    .map((p) => {
      const m = p.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
      if (!m) return null;
      return { sideA: Number(m[1]), sideB: Number(m[2]) };
    })
    .filter((x): x is { sideA: number; sideB: number } => x != null);
  if (!parts.length) return [];
  return parts.map((p, i) => ({
    label: nextLineLabel(sport, i),
    sideA: p.sideA,
    sideB: p.sideB,
  }));
}

function normalizeResultStatus(status?: string | null): string {
  return (status ?? '').replace(/[\s_-]/g, '').toLowerCase();
}

function isSavedBackendResult(result: EventResultSummary | null | undefined): boolean {
  if (!result) return false;
  const status = normalizeResultStatus(result.status);
  if (status === 'confirmed' || status === 'pendingconfirmation' || status === 'disputed') {
    return true;
  }
  if (result.resultId && result.resultId !== '00000000-0000-0000-0000-000000000000') {
    return true;
  }
  if (result.summary && result.summary.trim()) return true;
  if (result.scoreA != null || result.scoreB != null) return true;
  if (result.unitsWonA != null || result.unitsWonB != null) return true;
  if (result.sets && result.sets.length > 0) return true;
  if (result.games && result.games.length > 0) return true;
  return false;
}

function normalizeResultSummary(
  raw: EventResultSummary & { submittedBy?: string; resultId?: string }
): EventResultSummary {
  return {
    ...raw,
    resultId: raw.resultId ?? '',
    submittedByUserId: raw.submittedByUserId || raw.submittedBy || '',
    status: raw.status ?? '',
  };
}

function buildSubmitPayload(
  sport: SupportedScoreSport,
  userId: string,
  sideALabel: string,
  sideBLabel: string,
  lines: ScoreLine[]
): SubmitEventResultPayload {
  const base = {
    submittedByUserId: userId,
    sideALabel,
    sideBLabel,
  };
  if (sport === 'soccer') {
    return {
      ...base,
      scoreA: lines[0]?.sideA ?? 0,
      scoreB: lines[0]?.sideB ?? 0,
    };
  }
  const rows = lines.map((l) => ({ sideA: l.sideA, sideB: l.sideB }));
  if (sport === 'pickleball') {
    return { ...base, games: rows };
  }
  return { ...base, sets: rows };
}

function formatWhen(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Date TBD';
  return d.toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function navigatorOnLine(): boolean {
  try {
    // RN may not always expose navigator.onLine
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  } catch {
    return true;
  }
}

function normalizeSupported(sport: string): SupportedScoreSport {
  const key = normalizeSportKey(sport);
  if (key === 'pickleball' || key === 'volleyball' || key === 'soccer' || key === 'tennis') {
    return key;
  }
  return 'tennis';
}

const EMERALD = '#047857';
const EMERALD_SOFT_BORDER = 'rgba(167, 243, 208, 0.45)';

const styles = StyleSheet.create({
  pressed: { opacity: 0.88 },
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
    backgroundColor: EMERALD,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: EMERALD_SOFT_BORDER,
  },
  sportTagText: {
    color: '#ecfdf5',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statusPill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: EMERALD_SOFT_BORDER,
    backgroundColor: EMERALD,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusPillLive: {
    backgroundColor: '#14532d',
    borderColor: '#a8ff3e',
  },
  statusPillSoon: {
    backgroundColor: 'rgba(168, 255, 62, 0.18)',
    borderColor: '#a8ff3e',
  },
  statusPillFinished: {
    backgroundColor: '#1f2937',
  },
  statusPillCompleted: {
    backgroundColor: EMERALD,
  },
  statusPillPending: {
    backgroundColor: '#3f3f1a',
    borderColor: '#a8ff3e',
  },
  statusPillText: {
    color: '#ecfdf5',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statusPillTextLive: {
    color: '#a8ff3e',
  },
  statusPillTextSoon: {
    color: '#a8ff3e',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#a8ff3e',
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  cardLocation: {
    color: '#a7f3d0',
    fontSize: 13,
    flexShrink: 1,
  },
  cardDate: {
    color: '#a7f3d0',
    fontSize: 13,
    marginBottom: 12,
  },
  cardBottomRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
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
  countdownWrap: {
    marginTop: 4,
  },
  countdownLabel: {
    color: '#a7f3d0',
    fontSize: 12,
    fontWeight: '600',
  },
  countdownValue: {
    color: '#a8ff3e',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  liveBlock: {
    marginTop: 8,
    gap: 6,
  },
  liveLine: {
    color: '#a8ff3e',
    fontSize: 13,
    fontWeight: '700',
  },
  hereCount: {
    color: '#ecfdf5',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  finishedLabel: {
    color: '#a8ff3e',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  checkInHint: {
    color: '#a7f3d0',
    fontSize: 12,
    fontWeight: '600',
  },
  checkInBlock: {
    marginTop: 8,
    alignItems: 'center',
    gap: 6,
  },
  checkInSubHint: {
    color: '#8a8aa0',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  avatarRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: EMERALD_SOFT_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarDimmed: {
    opacity: 0.45,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    color: '#a8ff3e',
    fontWeight: '800',
  },
  expandBlock: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(167, 243, 208, 0.25)',
    paddingTop: 12,
    gap: 8,
  },
  sectionLabel: {
    color: '#a8ff3e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  memberMeta: {
    flex: 1,
  },
  memberName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  memberStatus: {
    color: '#a7f3d0',
    fontSize: 11,
    marginTop: 2,
  },
  smallBtn: {
    borderWidth: 1,
    borderColor: '#a8ff3e',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  smallBtnText: {
    color: '#a8ff3e',
    fontSize: 11,
    fontWeight: '700',
  },
  hint: {
    color: '#8a8aa0',
    fontSize: 12,
    marginTop: 4,
  },
  formError: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  scoreGrid: {
    marginBottom: 8,
  },
  scoreGridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreGridRow: {
    marginTop: 10,
  },
  scoreRowLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 6,
  },
  scoreRowLabel: {
    color: '#a7f3d0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  removeSetBtn: {
    padding: 2,
  },
  scoreCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  scoreMid: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreColName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  scoreReadValue: {
    color: '#a8ff3e',
    fontSize: 20,
    fontWeight: '900',
    minWidth: 48,
    textAlign: 'center',
  },
  vs: {
    color: '#a7f3d0',
    fontWeight: '700',
    textAlign: 'center',
  },
  scoreInput: {
    backgroundColor: '#111827',
    color: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: EMERALD_SOFT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 56,
    width: 64,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 18,
  },
  addSet: {
    color: '#a8ff3e',
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: '#a8ff3e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#1a1a2e',
    fontWeight: '800',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#a8ff3e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    flex: 1,
  },
  secondaryBtnText: {
    color: '#a8ff3e',
    fontWeight: '800',
  },
  rowBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  lineRead: {
    color: '#ecfdf5',
    fontSize: 13,
    marginBottom: 2,
  },
  detailLink: {
    marginTop: 8,
    alignItems: 'center',
  },
  detailLinkText: {
    color: '#a8ff3e',
    fontSize: 12,
    fontWeight: '700',
  },
});
