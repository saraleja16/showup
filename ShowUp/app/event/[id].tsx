import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  getEventById,
  joinEvent,
  getEventPositions,
  claimEventPosition,
  releaseEventPosition,
  requestSlot,
  withdrawRequest,
  acceptRequest,
  declineRequest,
  getSlotRequests,
  inviteToEvent,
  getApiErrorMessage,
  getApiErrorStatus,
  getParticipantStatus,
  isHttpError,
  type EventItem,
  type LiveSlot,
  type ParticipantStatus,
  type SlotRequestGroup,
  type SlotRequestRow,
} from '@/src/api';
import { useSession } from '@/src/auth';
import { SPORTS } from '@/src/sports/registry';
import { CheckInCard } from '@/src/components/CheckInCard';
import { EventStatusCard } from '@/src/components/event-status';
import { PositionPicker } from '@/src/components/PositionPicker';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Old join flow (non-pitch events)
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  // Live pitch state
  const [positions, setPositions] = useState<LiveSlot[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState<string | null>(null);

  // Participant status — drives check-in card visibility and state
  const [participantStatus, setParticipantStatus] = useState<ParticipantStatus | null>(null);

  // Host request list
  const [slotRequests, setSlotRequests] = useState<SlotRequestGroup[]>([]);

  // Refs for scroll-to-requests behaviour
  const scrollViewRef = useRef<ScrollView>(null);
  const requestsSectionY = useRef(0);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const [data, pStatus] = await Promise.all([
          getEventById(id!, user?.id),
          user?.id
            ? getParticipantStatus(id!, user.id).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setEvent(data);
        setParticipantStatus(pStatus);
        setLoading(false);

        // Always fetch positions and, for the host, the pending request list.
        // Pass callerId so the backend populates isMyPendingRequest / pendingRequestCount.
        setPositionsLoading(true);
        const isHost = !!user?.id && data.creatorId === user.id;
        try {
          const [pos, groups] = await Promise.all([
            getEventPositions(data.id, user?.id),
            isHost
              ? getSlotRequests(data.id, user!.id).catch(() => [] as SlotRequestGroup[])
              : Promise.resolve([] as SlotRequestGroup[]),
          ]);
          if (!cancelled) {
            setPositions(pos);
            setSlotRequests(groups);
            setPositionsLoading(false);
          }
        } catch (posErr) {
          if (!cancelled) {
            setPositionsError(getApiErrorMessage(posErr, 'Could not load positions.'));
            setPositionsLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message = getApiErrorStatus(err) === 404
            ? 'This event is private. You need to match with the host to view it.'
            : getApiErrorMessage(err, 'Could not load event details.');
          setError(message);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
    // Reload when route id or signed-in user changes (avoid depending on whole user object).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user?.id is the intentional dependency
  }, [id, user?.id]);

  // ── Pull-to-refresh ─────────────────────────────────────────────────────────

  async function handleRefresh() {
    if (!id) return;
    setRefreshing(true);
    try {
      const userId = user?.id;
      const [data, pos, pStatus] = await Promise.all([
        getEventById(id, userId),
        getEventPositions(id, userId),
        userId ? getParticipantStatus(id, userId).catch(() => null) : Promise.resolve(null),
      ]);
      setEvent(data);
      setPositions(pos);
      setParticipantStatus(pStatus);
      setPositionsError(null);
      if (userId && data.creatorId === userId) {
        const groups = await getSlotRequests(id, userId).catch(() => [] as SlotRequestGroup[]);
        setSlotRequests(groups);
      }
    } catch {
      // silently fail — user can pull again
    } finally {
      setRefreshing(false);
    }
  }

  // ── Positions helpers ───────────────────────────────────────────────────────

  // callerId defaults to the current user but callers should pass an explicit
  // value captured before any await to avoid stale-closure / null-user issues.
  async function refreshPositions(callerId = user?.id) {
    if (!id) return;
    const data = await getEventPositions(id, callerId);
    setPositions(data);
  }

  async function refreshRequests() {
    if (!id || !user?.id || !isCreator) return;
    const groups = await getSlotRequests(id, user.id);
    setSlotRequests(groups);
  }

  async function handleAccept(requestId: string) {
    if (!user || !id) return;
    try {
      // Capture which slot this request belongs to before the await
      const group = slotRequests.find((g) => g.requests.some((r) => r.requestId === requestId));
      const acceptedReq = group?.requests.find((r) => r.requestId === requestId);

      await acceptRequest(id, requestId, user.id);

      // Optimistic: remove all requests for this slot (accepted + auto-declined competitors)
      setSlotRequests((prev) =>
        prev
          .map((g) =>
            g.slotId === group?.slotId ? { ...g, requests: [] } : g
          )
          .filter((g) => g.requests.length > 0)
      );

      // Optimistic: flip the slot to claimed
      if (group?.slotId) {
        setPositions((prev) =>
          prev.map((p) =>
            p.slotId === group.slotId
              ? {
                  ...p,
                  status: 'claimed' as const,
                  claimedByDisplayName: acceptedReq?.displayName ?? null,
                  isMyPendingRequest: false,
                  pendingRequestCount: 0,
                }
              : p
          )
        );
      }

      // Background refresh — pass captured userId so callerId is never undefined
      const userId = user.id;
      void Promise.all([refreshPositions(userId), refreshRequests()]).catch((err) => {
        console.warn('[handleAccept] refresh failed', err);
      });
    } catch (err) {
      Alert.alert('Could not accept', getApiErrorMessage(err));
    }
  }

  async function handleDecline(requestId: string) {
    if (!user || !id) return;
    try {
      await declineRequest(id, requestId, user.id);

      // Optimistic: remove just this request row
      setSlotRequests((prev) =>
        prev
          .map((g) => ({ ...g, requests: g.requests.filter((r) => r.requestId !== requestId) }))
          .filter((g) => g.requests.length > 0)
      );

      // Update pending count on the slot
      const group = slotRequests.find((g) => g.requests.some((r) => r.requestId === requestId));
      if (group?.slotId) {
        setPositions((prev) =>
          prev.map((p) =>
            p.slotId === group.slotId
              ? { ...p, pendingRequestCount: Math.max(0, (p.pendingRequestCount ?? 1) - 1) }
              : p
          )
        );
      }

      const userId = user.id;
      void Promise.all([refreshPositions(userId), refreshRequests()]).catch((err) => {
        console.warn('[handleDecline] refresh failed', err);
      });
    } catch (err) {
      Alert.alert('Could not decline', getApiErrorMessage(err));
    }
  }

  function handleViewPendingRequests(_slotId: string) {
    scrollViewRef.current?.scrollTo({ y: requestsSectionY.current - 16, animated: true });
  }

  async function handleClaimSelf(slotId: string) {
    if (!user || !id) return;
    setPositionsError(null);
    const userId = user.id;
    try {
      await claimEventPosition(id, slotId, userId);
      await refreshPositions(userId);
    } catch (err) {
      if (isHttpError(err, 409)) {
        setPositionsError('That spot was just taken.');
        await refreshPositions(userId);
      } else {
        setPositionsError(getApiErrorMessage(err, 'Could not claim this spot.'));
      }
    }
  }

  async function handleClaimFriend(slotId: string, friendName: string) {
    if (!user || !id) return;
    setPositionsError(null);
    const userId = user.id;
    try {
      await claimEventPosition(id, slotId, userId, { friendName });
      await refreshPositions(userId);
    } catch (err) {
      if (isHttpError(err, 409)) {
        setPositionsError('That spot was just taken.');
        await refreshPositions(userId);
      } else {
        setPositionsError(getApiErrorMessage(err, 'Could not claim this spot.'));
      }
    }
  }

  async function handleInviteMatch(slotId: string, matchUserId: string, matchName: string) {
    if (!id) return;
    try {
      await inviteToEvent(id, matchUserId, slotId);
      Alert.alert('Invitation sent', `${matchName} will see a request to join this game.`);
    } catch (err) {
      Alert.alert('Could not send invitation', getApiErrorMessage(err));
    }
  }

  async function handleRequestSlot(slotId: string) {
    if (!user || !id) return;
    setPositionsError(null);
    const userId = user.id;
    try {
      const result = await requestSlot(id, userId, slotId);
      // Optimistic: mark slot as my-pending immediately
      setPositions((prev) =>
        prev.map((p) =>
          p.slotId === slotId
            ? { ...p, isMyPendingRequest: true, requestId: result.requestId }
            : p
        )
      );
      // Background refresh — pass captured userId so callerId is never undefined
      void refreshPositions(userId).catch((err) => {
        console.warn('[handleRequestSlot] refresh failed', err);
      });
    } catch (err) {
      setPositionsError(getApiErrorMessage(err, 'Could not send join request.'));
    }
  }

  async function handleWithdraw() {
    if (!user || !id || !myRequestId) return;
    setPositionsError(null);
    const rid = myRequestId;
    const userId = user.id;
    try {
      await withdrawRequest(id, rid, userId);
      // Optimistic: clear pending state on the slot
      setPositions((prev) =>
        prev.map((p) =>
          p.isMyPendingRequest ? { ...p, isMyPendingRequest: false, requestId: null } : p
        )
      );
      await refreshPositions(userId);
    } catch (err) {
      setPositionsError(getApiErrorMessage(err, 'Could not withdraw request.'));
    }
  }

  async function handleRelease(slotId: string) {
    if (!id) return;
    setPositionsError(null);
    const userId = user?.id;
    try {
      await releaseEventPosition(id, slotId);
      await refreshPositions(userId);
    } catch (err) {
      if (isHttpError(err, 409)) {
        await refreshPositions(userId);
      } else {
        setPositionsError(getApiErrorMessage(err, 'Could not release this spot.'));
      }
    }
  }

  // ── Old join flow (non-pitch events) ────────────────────────────────────────

  async function handleJoin() {
    if (!user || !event) return;
    setJoining(true);
    try {
      await joinEvent(event.id, { userId: user.id });
      setJoined(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not join. This event may be full or you already joined.'));
    } finally {
      setJoining(false);
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const sportConfig = event?.sport ? SPORTS[event.sport] : null;
  const metaLine = sportConfig?.eventCardMeta(event?.sportDetails ?? null) ?? '';
  const spotsLeft = event ? event.maxPlayers - event.participantCount : 0;
  const isCreator = user?.id === event?.creatorId;
  const myPendingSlot = positions.find((p) => p.isMyPendingRequest) ?? null;
  const myRequestId = myPendingSlot?.requestId ?? null;

  const scheduledDate = event
    ? new Date(event.scheduledAt).toLocaleDateString('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';
  const scheduledTime = event
    ? new Date(event.scheduledAt)
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        .toUpperCase()
    : '';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      {/* Back button */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color="#a8ff3e" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#a8ff3e" style={styles.loader} />
      ) : error && !event ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : event ? (
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#a8ff3e"
              colors={['#a8ff3e']}
            />
          }
        >
          {/* Sport tag */}
          <View style={styles.sportTagRow}>
            <View style={styles.sportTag}>
              <Text style={styles.sportTagText}>
                {sportConfig?.label.toUpperCase() ?? (event.sport?.toUpperCase() ?? 'EVENT')}
              </Text>
            </View>
            {event.isPrivate ? (
              <View style={styles.privateTag}>
                <Ionicons name="lock-closed" size={11} color="#ff4757" />
                <Text style={styles.privateTagText}>PRIVATE · MATCHES ONLY</Text>
              </View>
            ) : null}
          </View>

          {/* Title */}
          <Text style={styles.title}>{event.title}</Text>

          {user?.id ? (
            <EventStatusCard
              source="event"
              event={event}
              variant="detail"
              userId={user.id}
              isHost={event.creatorId === user.id}
              readOnly={!(event.creatorId === user.id || Boolean(event.myStatus))}
              initiallyExpanded
              onResultChanged={() => {
                void handleRefresh();
              }}
            />
          ) : null}

          {/* Meta line */}
          {metaLine ? (
            <Text style={styles.metaLine}>{metaLine}</Text>
          ) : null}

          {/* Info rows */}
          <View style={styles.infoCard}>
            <InfoRow icon="calendar-outline" label="Date" value={scheduledDate} />
            <InfoRow icon="time-outline" label="Time" value={scheduledTime} />
            {event.venueName ? (
              <InfoRow icon="location-outline" label="Venue" value={event.venueName} accent />
            ) : null}
            {event.sportDetails?.notes ? (
              <InfoRow icon="chatbubble-outline" label="Venue address" value={event.sportDetails.notes} />
            ) : null}
            <InfoRow
              icon="people-outline"
              label="Players"
              value={`${event.participantCount}/${event.maxPlayers} joined · ${spotsLeft} spots left`}
            />
          </View>

          {/* Sport details card */}
          {event.sportDetails ? (
            <View style={styles.infoCard}>
              <Text style={styles.sectionLabel}>GAME DETAILS</Text>
              {event.sportDetails.format ? (
                <InfoRow icon="tennisball-outline" label="Format" value={event.sportDetails.format.charAt(0).toUpperCase() + event.sportDetails.format.slice(1)} />
              ) : null}
              {event.sportDetails.sessionType ? (
                <InfoRow icon="fitness-outline" label="Session" value={event.sportDetails.sessionType} />
              ) : null}
              {event.sportDetails.skillLevel ? (
                <InfoRow icon="ribbon-outline" label="Skill level" value={event.sportDetails.skillLevel} />
              ) : null}
              {event.sportDetails.durationMinutes ? (
                <InfoRow icon="hourglass-outline" label="Duration" value={`${event.sportDetails.durationMinutes} min`} />
              ) : null}
              {event.sportDetails.bringingBall ? (
                <InfoRow icon="checkmark-circle-outline" label="Balls" value="Organiser is bringing balls" />
              ) : null}
              {event.sportDetails.notes ? (
                <InfoRow icon="document-text-outline" label="Notes" value={event.sportDetails.notes} />
              ) : null}
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* ── Join / positions section ────────────────────────────────────
               While positions are loading: show a spinner (neither control),
               so a user cannot tap Join before we know whether this event
               uses position-based joining (which would create a participant
               without a slot). Once resolved: picker if slots exist, join
               button otherwise. Custom/old events return [] → join flow.   */}
          {positionsLoading ? (
            <ActivityIndicator color="#a8ff3e" style={styles.positionsLoader} />
          ) : positions.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>POSITIONS</Text>

              {positionsError ? (
                <Text style={styles.errorText}>{positionsError}</Text>
              ) : null}

              <PositionPicker
                mode="live"
                silhouette={sportConfig?.silhouette}
                positions={positions}
                viewerId={user?.id ?? ''}
                isOrganizer={isCreator}
                onClaimSelf={handleClaimSelf}
                onClaimFriend={handleClaimFriend}
                onInviteMatch={handleInviteMatch}
                onRelease={handleRelease}
                onRequestSlot={handleRequestSlot}
                onViewPendingRequests={handleViewPendingRequests}
              />

              {/* Legacy participants who joined before position-claiming was introduced */}
              {(() => {
                const claimedCount = positions.filter((p) => p.status === 'claimed').length;
                const others = event.participantCount - claimedCount;
                if (others <= 0) return null;
                return (
                  <Text style={styles.othersNote}>
                    + {others} other {others === 1 ? 'player' : 'players'} joined
                  </Text>
                );
              })()}

              {/* Withdraw button — visible only to the requester, never to the host */}
              {myRequestId && !isCreator && (
                <Pressable
                  onPress={handleWithdraw}
                  style={({ pressed }) => [styles.withdrawButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Ionicons name="remove-circle-outline" size={18} color="#ff4757" />
                  <Text style={styles.withdrawButtonText}>Withdraw request</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Pressable
              onPress={handleJoin}
              disabled={joining || joined || spotsLeft === 0}
              style={({ pressed }) => [
                styles.joinButton,
                (joining || joined || spotsLeft === 0) && styles.joinButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.joinButtonText}>
                {joined ? 'Joined!' : joining ? 'Joining…' : spotsLeft === 0 ? 'Event Full' : 'Join Event'}
              </Text>
            </Pressable>
          )}

          {/* ── Host request list ──────────────────────────────────────────
               Rendered only for the host when there are pending requests.
               Positioned between the picker and the check-in card so the host
               can see who wants in and act without leaving the screen.         */}
          {isCreator && slotRequests.length > 0 && (
            <View
              style={styles.requestsSection}
              onLayout={(e) => { requestsSectionY.current = e.nativeEvent.layout.y; }}
            >
              <Text style={styles.sectionLabel}>PENDING REQUESTS</Text>
              {slotRequests.map((group) => (
                <View key={group.slotId ?? 'legacy'} style={styles.requestGroup}>
                  {group.team != null && group.role != null && (
                    <View style={styles.requestGroupHeader}>
                      <Text style={styles.requestGroupTeam}>{group.team.toUpperCase()}</Text>
                      <Text style={styles.requestGroupRole}>{group.role}</Text>
                    </View>
                  )}
                  {group.requests.map((req) => (
                    <RequestRow
                      key={req.requestId}
                      request={req}
                      onAccept={() => handleAccept(req.requestId)}
                      onDecline={() => handleDecline(req.requestId)}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}

          {event && user && (
            <CheckInCard
              event={event}
              userId={user.id}
              participantStatus={participantStatus}
            />
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

// ── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={accent ? '#a8ff3e' : '#6b7280'} />
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, accent && styles.infoValueAccent]}>{value}</Text>
      </View>
    </View>
  );
}

// ── Request list helpers ──────────────────────────────────────────────────────

function tierColor(tier: SlotRequestRow['reliabilityTier']): string {
  switch (tier) {
    case 'excellent':  return '#a8ff3e';
    case 'good':       return '#9ca3af';
    case 'at_risk':    return '#f59e0b';
    case 'unreliable': return '#ff4757';
  }
}

function tierLabel(tier: SlotRequestRow['reliabilityTier']): string {
  switch (tier) {
    case 'excellent':  return 'Excellent';
    case 'good':       return 'Good';
    case 'at_risk':    return 'At risk';
    case 'unreliable': return 'Unreliable';
  }
}

function PlayerAvatar({ uri, displayName, size = 36 }: {
  uri: string | null;
  displayName: string;
  size?: number;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  const initials = displayName
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#162033',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#9ca3af', fontSize: Math.floor(size * 0.38), fontWeight: '700' }}>
        {initials}
      </Text>
    </View>
  );
}

function RequestRow({ request, onAccept, onDecline }: {
  request: SlotRequestRow;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.requestRow}>
      <PlayerAvatar uri={request.avatarUrl} displayName={request.displayName} />
      <View style={styles.requestRowBody}>
        <View style={styles.requestRowNameLine}>
          <Text style={styles.requestRowName} numberOfLines={1}>{request.displayName}</Text>
          {request.previouslyDeclined && (
            <Text style={styles.requestRowPrevDeclined}>prev. declined</Text>
          )}
        </View>
        <Text style={[styles.requestRowTier, { color: tierColor(request.reliabilityTier) }]}>
          {tierLabel(request.reliabilityTier)}
        </Text>
      </View>
      <View style={styles.requestRowActions}>
        <Pressable
          onPress={onAccept}
          style={({ pressed }) => [styles.requestAcceptBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Accept ${request.displayName}`}
        >
          <Ionicons name="checkmark" size={16} color="#1a1a2e" />
        </Pressable>
        <Pressable
          onPress={onDecline}
          style={({ pressed }) => [styles.requestDeclineBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Decline ${request.displayName}`}
        >
          <Ionicons name="close" size={16} color="#ff4757" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  backText: {
    color: '#a8ff3e',
    fontSize: 15,
    fontWeight: '700',
  },
  loader: {
    flex: 1,
    alignSelf: 'center',
    marginTop: 80,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sportTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  privateTag: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 71, 87, 0.16)',
    borderColor: 'rgba(255, 71, 87, 0.4)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  privateTagText: {
    color: '#ff4757',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  sportTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(168, 255, 62, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.4)',
  },
  sportTagText: {
    color: '#a8ff3e',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 8,
    lineHeight: 32,
  },
  metaLine: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 20,
  },
  sectionLabel: {
    color: '#a8ff3e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
    marginTop: 4,
  },
  infoCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.2)',
    padding: 16,
    marginBottom: 14,
    gap: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  infoValueAccent: {
    color: '#a8ff3e',
    fontWeight: '700',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 12,
  },
  positionsLoader: {
    marginVertical: 24,
  },
  othersNote: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 10,
    textAlign: 'center',
  },
  joinButton: {
    backgroundColor: '#a8ff3e',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
  },

  // ── Withdraw ─────────────────────────────────────────────────────────────────
  withdrawButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 71, 87, 0.08)',
    borderColor: 'rgba(255, 71, 87, 0.4)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 14,
  },
  withdrawButtonText: {
    color: '#ff4757',
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Host request list ────────────────────────────────────────────────────────
  requestsSection: {
    marginTop: 20,
  },
  requestGroup: {
    marginBottom: 14,
  },
  requestGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  requestGroupTeam: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  requestGroupRole: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  requestRow: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    marginBottom: 8,
  },
  requestRowBody: {
    flex: 1,
    gap: 3,
  },
  requestRowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  requestRowName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  requestRowPrevDeclined: {
    color: '#ff4757',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  requestRowTier: {
    fontSize: 11,
    fontWeight: '700',
  },
  requestRowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  requestAcceptBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#a8ff3e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestDeclineBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#ff4757',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
