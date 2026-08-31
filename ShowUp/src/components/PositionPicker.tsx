import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  getFormations,
  getMyConnections,
  type Connection,
  type FormationSlot,
  type LiveSlot,
} from '@/src/api';
import { colors, radii, spacing, typography } from '@/src/constants/theme';

// ─── Public types ─────────────────────────────────────────────────────────────

export type PendingClaim =
  | { type: 'self' }
  | { type: 'friend'; friendName: string }
  | { type: 'match'; matchUserId: string; matchName: string };

// ─── Design tokens ────────────────────────────────────────────────────────────

const LINE_COLOR = colors.accent;
const SLOT_RING = colors.accent;
const SLOT_FILL = colors.background;
const SLOT_D = 30;
const SLOT_R = SLOT_D / 2;

/** Maps backend 0-100 → 5-95 % so edge slots are never clipped */
function toPercent(v: number): `${number}%` {
  return `${5 + (v / 100) * 90}%`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type CreateProps = {
  mode: 'create';
  /** Sport id (e.g. 'soccer') — used to fetch the formation template. */
  sport: string;
  /** Format id (e.g. '5-a-side'). Pass 'custom' to render nothing. */
  format: string;
  /**
   * Fires whenever the organizer adds or removes a claim.
   * Called with an empty object when format changes (slot IDs would be stale).
   */
  onClaimsChange?: (claims: Record<string, PendingClaim>) => void;
  /** Court/field line markings for this sport. Receives the container width. */
  silhouette?: React.ComponentType<{ width: number }>;
};

type LiveProps = {
  mode: 'live';
  /** Live slot states from GET /events/{id}/positions — parent owns fetch & refresh. */
  positions: LiveSlot[];
  /** Current viewer's user id. */
  viewerId: string;
  /** True when the viewer is the event creator. */
  isOrganizer: boolean;
  /** Called when the viewer claims an open slot for themselves. */
  onClaimSelf: (slotId: string) => void;
  /** Called when the organizer claims an open slot for a named friend. */
  onClaimFriend: (slotId: string, friendName: string) => void;
  /** Called when the organizer picks one of their matches to invite into an open slot. */
  onInviteMatch?: (slotId: string, matchUserId: string, matchName: string) => void;
  /** Called when the viewer releases their own slot, or the organizer releases any slot. */
  onRelease: (slotId: string) => void;
  /** Called when a non-host player taps an open slot to send a join request. */
  onRequestSlot: (slotId: string) => void;
  /** Called when the host taps a slot that has pending requests. Stage 5 wires to the request list. */
  onViewPendingRequests?: (slotId: string) => void;
  /** Court/field line markings for this sport. Receives the container width. */
  silhouette?: React.ComponentType<{ width: number }>;
};

type Props = CreateProps | LiveProps;

// ─── Component ────────────────────────────────────────────────────────────────

export function PositionPicker(props: Props) {
  const mode = props.mode; // kept as direct alias so TypeScript aliased narrowing works throughout

  // ── Runtime guard ─────────────────────────────────────────────────────────────
  // Metro strips TS types without type-checking, so a call site can omit the
  // required `mode` prop and the build won't fail. Detect that here and make
  // the failure loud (dev error + null render) rather than a silent empty court.
  const modeIsValid =
    (mode as string | undefined) === 'create' ||
    (mode as string | undefined) === 'live';

  if (__DEV__ && !modeIsValid) {
    console.error(
      `[PositionPicker] "mode" prop is required ("create" | "live"). ` +
      `Got: ${JSON.stringify(mode as unknown)}. ` +
      `Add mode="create" or mode="live" at the call site.`
    );
  }

  // ── Shared state ─────────────────────────────────────────────────────────────
  const [courtWidth, setCourtWidth] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [sheetStep, setSheetStep] = useState<'options' | 'name-input' | 'match-picker'>('options');
  const [friendNameDraft, setFriendNameDraft] = useState('');

  // ── Match-picker state (live mode only) ──────────────────────────────────────
  const [matches, setMatches] = useState<Connection[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const nameInputRef = useRef<TextInput>(null);

  // ── Create-mode state ─────────────────────────────────────────────────────────
  const [slots, setSlots] = useState<FormationSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pendingClaims, setPendingClaims] = useState<Record<string, PendingClaim>>({});

  // ── Live-mode state ───────────────────────────────────────────────────────────
  const [liveSheetType, setLiveSheetType] = useState<'organizer-open' | 'claimed-info' | null>(null);

  // ── Live-mode derived ─────────────────────────────────────────────────────────
  const livePositions = mode === 'live' ? props.positions : [];
  const viewerId = mode === 'live' ? props.viewerId : '';
  const isOrganizer = mode === 'live' ? props.isOrganizer : false;
  const myLiveSlot = livePositions.find((p) => p.claimedByUserId === viewerId) ?? null;
  const myPendingSlot = livePositions.find((p) => p.isMyPendingRequest) ?? null;
  const activeLiveSlot = livePositions.find((p) => p.slotId === activeSlotId) ?? null;

  // Stable create-mode values — '' in live mode
  const createFormat = props.mode === 'create' ? props.format : '';
  const createSport = props.mode === 'create' ? props.sport : '';

  // Silhouette component (same reference in both modes)
  const Silhouette = props.silhouette;

  // ── Formation fetch (create mode only) ───────────────────────────────────────

  useEffect(() => {
    if (mode !== 'create') return;
    if (!createFormat || createFormat === 'custom') {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    getFormations(createSport, createFormat)
      .then((data) => { if (!cancelled) setSlots(data); })
      .catch(() => { if (!cancelled) setFetchError('Could not load formation.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [createFormat, createSport, mode]);

  // Wipe claims when format changes (create mode only — stale slot IDs become invalid)
  useEffect(() => {
    if (props.mode !== 'create') return;
    setPendingClaims({});
    props.onClaimsChange?.({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createFormat]);

  // ── Sheet open/close animation ────────────────────────────────────────────────

  useEffect(() => {
    if (!sheetVisible) {
      sheetAnim.setValue(0);
      backdropAnim.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(sheetAnim, {
        toValue: 1,
        damping: 22,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [sheetVisible, sheetAnim, backdropAnim]);

  function animateClose(onFinished?: () => void) {
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        setSheetVisible(false);
        setActiveSlotId(null);
        setLiveSheetType(null);
        setFriendNameDraft('');
        setMatches([]);
        setMatchesError(null);
        setInvitingUserId(null);
      }
      onFinished?.();
    });
  }

  // Auto-focus name field when the sheet switches to name-input step
  useEffect(() => {
    if (sheetStep !== 'name-input') return;
    const t = setTimeout(() => nameInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [sheetStep]);

  // Fetch matches when the sheet switches to the match-picker step (live mode only)
  useEffect(() => {
    if (sheetStep !== 'match-picker') return;
    let cancelled = false;
    setMatchesLoading(true);
    setMatchesError(null);
    getMyConnections()
      .then((items) => { if (!cancelled) setMatches(items); })
      .catch(() => { if (!cancelled) setMatchesError('Could not load your matches.'); })
      .finally(() => { if (!cancelled) setMatchesLoading(false); });
    return () => { cancelled = true; };
  }, [sheetStep]);

  // ── Create-mode slot actions ───────────────────────────────────────────────────

  function claimAsSelfCreate() {
    if (!activeSlotId || mode !== 'create') return;
    const next: Record<string, PendingClaim> = {
      ...pendingClaims,
      [activeSlotId]: { type: 'self' },
    };
    setPendingClaims(next);
    if (props.mode === 'create') props.onClaimsChange?.(next);
    animateClose();
  }

  function claimAsFriendCreate() {
    const name = friendNameDraft.trim();
    if (!name || !activeSlotId || mode !== 'create') return;
    const next: Record<string, PendingClaim> = {
      ...pendingClaims,
      [activeSlotId]: { type: 'friend', friendName: name },
    };
    setPendingClaims(next);
    if (props.mode === 'create') props.onClaimsChange?.(next);
    animateClose();
  }

  function claimAsMatchCreate(match: Connection) {
    if (!activeSlotId || mode !== 'create') return;
    const next: Record<string, PendingClaim> = {
      ...pendingClaims,
      [activeSlotId]: { type: 'match', matchUserId: match.userId, matchName: match.displayName },
    };
    setPendingClaims(next);
    if (props.mode === 'create') props.onClaimsChange?.(next);
    animateClose();
  }

  // ── Live-mode slot actions ─────────────────────────────────────────────────────

  function claimAsSelfLive() {
    if (props.mode !== 'live' || !activeSlotId) return;
    const cb = props.onClaimSelf;
    const slotId = activeSlotId;
    animateClose(() => cb(slotId));
  }

  function claimAsFriendLive() {
    const name = friendNameDraft.trim();
    if (props.mode !== 'live' || !name || !activeSlotId) return;
    const cb = props.onClaimFriend;
    const slotId = activeSlotId;
    animateClose(() => cb(slotId, name));
  }

  function inviteMatchLive(match: Connection) {
    if (props.mode !== 'live' || !activeSlotId || invitingUserId) return;
    const cb = props.onInviteMatch;
    if (!cb) return;
    const slotId = activeSlotId;
    setInvitingUserId(match.userId);
    cb(slotId, match.userId, match.displayName);
    animateClose();
  }

  // ── Slot press handler ─────────────────────────────────────────────────────────

  function handleSlotPress(slotId: string) {
    if (mode === 'create') {
      if (pendingClaims[slotId]) {
        // Tap claimed slot → un-claim immediately, no sheet
        const next = { ...pendingClaims };
        delete next[slotId];
        setPendingClaims(next);
        if (props.mode === 'create') props.onClaimsChange?.(next);
        return;
      }
      setActiveSlotId(slotId);
      setSheetStep('options');
      setFriendNameDraft('');
      setSheetVisible(true);
      return;
    }

    // Live mode
    const slot = livePositions.find((p) => p.slotId === slotId);
    if (!slot) return;

    if (slot.status === 'claimed') {
      setActiveSlotId(slotId);
      setLiveSheetType('claimed-info');
      setSheetVisible(true);
      return;
    }

    // Open slot — non-organizer sends a join request
    if (!isOrganizer) {
      if (slot.isMyPendingRequest) {
        Alert.alert(
          'Request pending',
          'You\u2019ve already requested this spot. To withdraw, use the event detail page.'
        );
        return;
      }
      if (myPendingSlot) {
        Alert.alert(
          'Request pending',
          'You already have a pending request on this event. Withdraw it from the event detail page first.'
        );
        return;
      }
      if (myLiveSlot) {
        Alert.alert('You already have a spot', 'Release your current spot first.');
        return;
      }
      const requestCb = props.onRequestSlot;
      const otherCount = slot.pendingRequestCount ?? 0;
      const contention = otherCount > 0
        ? `\n\n${otherCount} other ${otherCount === 1 ? 'player is' : 'players are'} also waiting for this spot.`
        : '';
      Alert.alert(
        'Request this spot?',
        `${slot.role}${contention}\n\nThe host will review your request and confirm your spot.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send Request', onPress: () => requestCb(slotId) },
        ]
      );
      return;
    }

    // Organizer taps open slot — if there are pending requests, delegate to onViewPendingRequests
    if ((slot.pendingRequestCount ?? 0) > 0 && props.onViewPendingRequests) {
      props.onViewPendingRequests(slotId);
      return;
    }
    setActiveSlotId(slotId);
    setLiveSheetType('organizer-open');
    setSheetStep('options');
    setFriendNameDraft('');
    setSheetVisible(true);
  }

  // ── Derived display data ───────────────────────────────────────────────────────

  const displaySlots: FormationSlot[] = mode === 'live' ? livePositions : slots;

  function getSlotVisualState(slotId: string): 'open' | 'has-pending' | 'my-pending' | 'claimed' {
    if (mode !== 'live') {
      return pendingClaims[slotId] ? 'claimed' : 'open';
    }
    const s = livePositions.find((p) => p.slotId === slotId);
    if (s?.status === 'claimed') return 'claimed';
    if (s?.isMyPendingRequest) return 'my-pending';
    if ((s?.pendingRequestCount ?? 0) > 0) return 'has-pending';
    return 'open';
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  // All hooks have run above (Rules of Hooks). Now safe to bail out if mode is invalid.
  if (!modeIsValid) return null;

  return (
    <>
      {/* ── Court ──────────────────────────────────────────────────────────── */}
      <View
        style={styles.courtOuter}
        onLayout={(e) => setCourtWidth(e.nativeEvent.layout.width)}
      >
        {/* Sport-specific court markings */}
        {Silhouette ? <Silhouette width={courtWidth} /> : null}

        {/* Formation slots */}
        {(mode === 'create' ? !loading && !fetchError : true) &&
          displaySlots.map((slot) => {
            const vs = getSlotVisualState(slot.slotId);
            const pendingCount = mode === 'live'
              ? (livePositions.find(p => p.slotId === slot.slotId)?.pendingRequestCount ?? 0)
              : 0;
            const accessLabel =
              vs === 'claimed' ? `${slot.role} — claimed, tap for info`
              : vs === 'my-pending' ? `${slot.role} — your request is pending`
              : vs === 'has-pending' ? `${slot.role} — open, ${pendingCount} request${pendingCount === 1 ? '' : 's'} pending`
              : `${slot.role} — open`;
            return (
              <View
                key={slot.slotId}
                style={[styles.slotWrapper, { left: toPercent(slot.x), top: toPercent(slot.y) }]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={accessLabel}
                  onPress={() => handleSlotPress(slot.slotId)}
                  style={({ pressed }) => [
                    styles.slot,
                    vs === 'claimed' && styles.slotClaimed,
                    vs === 'my-pending' && styles.slotMyPending,
                    vs === 'has-pending' && styles.slotHasPending,
                    pressed && styles.slotPressed,
                  ]}
                >
                  {vs === 'claimed' ? (
                    <Ionicons name="checkmark" size={15} color={colors.background} />
                  ) : vs === 'my-pending' ? (
                    <Ionicons name="hourglass-outline" size={13} color={colors.accent} />
                  ) : (
                    <Ionicons name="add" size={15} color={colors.accent} />
                  )}
                </Pressable>
                {vs === 'has-pending' && pendingCount > 0 && (
                  <Text style={styles.slotPendingCount}>{pendingCount}</Text>
                )}
              </View>
            );
          })}

        {/* Create-mode overlays */}
        {mode === 'create' && loading && (
          <View style={styles.overlay}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        )}

        {mode === 'create' && !loading && fetchError && (
          <View style={styles.overlay}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.textMuted} />
            <Text style={styles.errorText}>{fetchError}</Text>
          </View>
        )}
      </View>

      {/* ── Claim / info sheet ─────────────────────────────────────────────── */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="none"
        onRequestClose={() => animateClose()}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={sheet.root}
        >
          <Pressable style={sheet.backdropPressable} onPress={() => animateClose()}>
            <Animated.View style={[sheet.backdrop, { opacity: backdropAnim }]} />
          </Pressable>

          <Animated.View
            style={[
              sheet.panel,
              {
                transform: [
                  {
                    translateY: sheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [260, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={sheet.handle} />

            {/* ── CREATE MODE ── */}
            {mode === 'create' && (
              <>
                <View style={sheet.titleRow}>
                  {(sheetStep === 'name-input' || sheetStep === 'match-picker') && (
                    <Pressable
                      style={sheet.backButton}
                      onPress={() => setSheetStep(sheetStep === 'match-picker' ? 'name-input' : 'options')}
                      accessibilityRole="button"
                      accessibilityLabel="Back"
                    >
                      <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
                    </Pressable>
                  )}
                  <Text style={sheet.title}>
                    {sheetStep === 'options'
                      ? 'CLAIM SLOT'
                      : sheetStep === 'name-input'
                      ? 'ADD A FRIEND'
                      : 'INVITE A MATCH'}
                  </Text>
                  {(sheetStep === 'name-input' || sheetStep === 'match-picker') && (
                    <View style={sheet.titleSpacer} />
                  )}
                </View>

                {sheetStep === 'options' && (
                  <>
                    <Pressable
                      style={({ pressed }) => [sheet.option, pressed && sheet.optionPressed]}
                      onPress={claimAsSelfCreate}
                      accessibilityRole="button"
                    >
                      <View style={sheet.optionIcon}>
                        <Ionicons name="person-circle-outline" size={22} color={colors.accent} />
                      </View>
                      <View style={sheet.optionBody}>
                        <Text style={sheet.optionLabel}>This is me</Text>
                        <Text style={sheet.optionSub}>Reserve this spot for yourself</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [sheet.option, pressed && sheet.optionPressed]}
                      onPress={() => setSheetStep('name-input')}
                      accessibilityRole="button"
                    >
                      <View style={sheet.optionIcon}>
                        <Ionicons name="person-add-outline" size={22} color={colors.accent} />
                      </View>
                      <View style={sheet.optionBody}>
                        <Text style={sheet.optionLabel}>Add a friend</Text>
                        <Text style={sheet.optionSub}>Reserve for someone you&apos;re bringing</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </Pressable>
                  </>
                )}

                {sheetStep === 'name-input' && (
                  <>
                    <View style={sheet.inputShell}>
                      <Pressable
                        onPress={() => setSheetStep('match-picker')}
                        accessibilityRole="button"
                        accessibilityLabel="Choose from your matches"
                        hitSlop={8}
                      >
                        <Ionicons name="person-add-outline" size={20} color={colors.accent} />
                      </Pressable>
                      <TextInput
                        ref={nameInputRef}
                        style={sheet.nameInput}
                        placeholder="Friend's name"
                        placeholderTextColor={colors.textMuted}
                        selectionColor={colors.accent}
                        value={friendNameDraft}
                        onChangeText={setFriendNameDraft}
                        returnKeyType="done"
                        onSubmitEditing={claimAsFriendCreate}
                        maxLength={50}
                        autoCorrect={false}
                      />
                    </View>
                    <TouchableOpacity
                      style={[sheet.addButton, !friendNameDraft.trim() && sheet.addButtonDisabled]}
                      onPress={claimAsFriendCreate}
                      disabled={!friendNameDraft.trim()}
                      activeOpacity={0.85}
                    >
                      <Text style={sheet.addButtonText}>Add</Text>
                    </TouchableOpacity>

                    <Pressable
                      style={({ pressed }) => [sheet.matchPickerLink, pressed && sheet.optionPressed]}
                      onPress={() => setSheetStep('match-picker')}
                      accessibilityRole="button"
                    >
                      <Ionicons name="people-outline" size={16} color={colors.accent} />
                      <Text style={sheet.matchPickerLinkText}>Choose from your matches</Text>
                    </Pressable>
                  </>
                )}

                {sheetStep === 'match-picker' && (
                  <>
                    {matchesLoading ? (
                      <View style={sheet.matchStateBlock}>
                        <ActivityIndicator color={colors.accent} />
                      </View>
                    ) : matchesError ? (
                      <View style={sheet.matchStateBlock}>
                        <Text style={sheet.matchStateText}>{matchesError}</Text>
                      </View>
                    ) : matches.length === 0 ? (
                      <View style={sheet.matchStateBlock}>
                        <Ionicons name="heart-outline" size={22} color={colors.textMuted} />
                        <Text style={sheet.matchStateText}>
                          You don&apos;t have any matches yet. Match with players first, then invite them here.
                        </Text>
                      </View>
                    ) : (
                      matches.map((match) => (
                        <Pressable
                          key={match.connectionId}
                          style={({ pressed }) => [sheet.option, pressed && sheet.optionPressed]}
                          onPress={() => claimAsMatchCreate(match)}
                          accessibilityRole="button"
                          accessibilityLabel={`Invite ${match.displayName}`}
                        >
                          <View style={sheet.optionIcon}>
                            <Ionicons name="person-circle-outline" size={22} color={colors.accent} />
                          </View>
                          <View style={sheet.optionBody}>
                            <Text style={sheet.optionLabel}>{match.displayName}</Text>
                            {match.skillLevel ? (
                              <Text style={sheet.optionSub}>{match.skillLevel}</Text>
                            ) : null}
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        </Pressable>
                      ))
                    )}
                  </>
                )}
              </>
            )}

            {/* ── LIVE MODE — organizer taps an open slot ── */}
            {mode === 'live' && liveSheetType === 'organizer-open' && (
              <>
                <View style={sheet.titleRow}>
                  {(sheetStep === 'name-input' || sheetStep === 'match-picker') && (
                    <Pressable
                      style={sheet.backButton}
                      onPress={() => setSheetStep(sheetStep === 'match-picker' ? 'name-input' : 'options')}
                      accessibilityRole="button"
                      accessibilityLabel="Back"
                    >
                      <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
                    </Pressable>
                  )}
                  <Text style={sheet.title}>
                    {sheetStep === 'options'
                      ? 'CLAIM SLOT'
                      : sheetStep === 'name-input'
                      ? 'ADD A FRIEND'
                      : 'INVITE A MATCH'}
                  </Text>
                  {(sheetStep === 'name-input' || sheetStep === 'match-picker') && (
                    <View style={sheet.titleSpacer} />
                  )}
                </View>

                {sheetStep === 'options' && (
                  <>
                    {/* "This is me" only when organizer doesn't hold a slot yet */}
                    {!myLiveSlot && (
                      <Pressable
                        style={({ pressed }) => [sheet.option, pressed && sheet.optionPressed]}
                        onPress={claimAsSelfLive}
                        accessibilityRole="button"
                      >
                        <View style={sheet.optionIcon}>
                          <Ionicons name="person-circle-outline" size={22} color={colors.accent} />
                        </View>
                        <View style={sheet.optionBody}>
                          <Text style={sheet.optionLabel}>This is me</Text>
                          <Text style={sheet.optionSub}>Reserve this spot for yourself</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      </Pressable>
                    )}

                    <Pressable
                      style={({ pressed }) => [sheet.option, pressed && sheet.optionPressed]}
                      onPress={() => setSheetStep('name-input')}
                      accessibilityRole="button"
                    >
                      <View style={sheet.optionIcon}>
                        <Ionicons name="person-add-outline" size={22} color={colors.accent} />
                      </View>
                      <View style={sheet.optionBody}>
                        <Text style={sheet.optionLabel}>Add a friend</Text>
                        <Text style={sheet.optionSub}>Reserve for someone you&apos;re bringing</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </Pressable>
                  </>
                )}

                {sheetStep === 'name-input' && (
                  <>
                    <View style={sheet.inputShell}>
                      {props.mode === 'live' && props.onInviteMatch ? (
                        <Pressable
                          onPress={() => setSheetStep('match-picker')}
                          accessibilityRole="button"
                          accessibilityLabel="Choose from your matches"
                          hitSlop={8}
                        >
                          <Ionicons name="person-add-outline" size={20} color={colors.accent} />
                        </Pressable>
                      ) : (
                        <Ionicons name="person-add-outline" size={20} color={colors.accent} />
                      )}
                      <TextInput
                        ref={nameInputRef}
                        style={sheet.nameInput}
                        placeholder="Friend's name"
                        placeholderTextColor={colors.textMuted}
                        selectionColor={colors.accent}
                        value={friendNameDraft}
                        onChangeText={setFriendNameDraft}
                        returnKeyType="done"
                        onSubmitEditing={claimAsFriendLive}
                        maxLength={50}
                        autoCorrect={false}
                      />
                    </View>
                    <TouchableOpacity
                      style={[sheet.addButton, !friendNameDraft.trim() && sheet.addButtonDisabled]}
                      onPress={claimAsFriendLive}
                      disabled={!friendNameDraft.trim()}
                      activeOpacity={0.85}
                    >
                      <Text style={sheet.addButtonText}>Add</Text>
                    </TouchableOpacity>

                    {props.mode === 'live' && props.onInviteMatch ? (
                      <Pressable
                        style={({ pressed }) => [sheet.matchPickerLink, pressed && sheet.optionPressed]}
                        onPress={() => setSheetStep('match-picker')}
                        accessibilityRole="button"
                      >
                        <Ionicons name="people-outline" size={16} color={colors.accent} />
                        <Text style={sheet.matchPickerLinkText}>Choose from your matches</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}

                {sheetStep === 'match-picker' && (
                  <>
                    {matchesLoading ? (
                      <View style={sheet.matchStateBlock}>
                        <ActivityIndicator color={colors.accent} />
                      </View>
                    ) : matchesError ? (
                      <View style={sheet.matchStateBlock}>
                        <Text style={sheet.matchStateText}>{matchesError}</Text>
                      </View>
                    ) : matches.length === 0 ? (
                      <View style={sheet.matchStateBlock}>
                        <Ionicons name="heart-outline" size={22} color={colors.textMuted} />
                        <Text style={sheet.matchStateText}>
                          You don&apos;t have any matches yet. Match with players first, then invite them here.
                        </Text>
                      </View>
                    ) : (
                      matches.map((match) => (
                        <Pressable
                          key={match.connectionId}
                          style={({ pressed }) => [sheet.option, pressed && sheet.optionPressed]}
                          onPress={() => inviteMatchLive(match)}
                          disabled={Boolean(invitingUserId)}
                          accessibilityRole="button"
                          accessibilityLabel={`Invite ${match.displayName}`}
                        >
                          <View style={sheet.optionIcon}>
                            <Ionicons name="person-circle-outline" size={22} color={colors.accent} />
                          </View>
                          <View style={sheet.optionBody}>
                            <Text style={sheet.optionLabel}>{match.displayName}</Text>
                            {match.skillLevel ? (
                              <Text style={sheet.optionSub}>{match.skillLevel}</Text>
                            ) : null}
                          </View>
                          {invitingUserId === match.userId ? (
                            <ActivityIndicator color={colors.accent} size="small" />
                          ) : (
                            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                          )}
                        </Pressable>
                      ))
                    )}
                  </>
                )}
              </>
            )}

            {/* ── LIVE MODE — viewer taps a claimed slot ── */}
            {mode === 'live' && liveSheetType === 'claimed-info' && activeLiveSlot && (
              <>
                <View style={sheet.titleRow}>
                  <Text style={sheet.title}>SPOT TAKEN</Text>
                </View>

                <View style={sheet.infoRow}>
                  <Ionicons name="person-circle-outline" size={24} color={colors.accent} />
                  <View style={sheet.infoBody}>
                    <Text style={sheet.infoName}>
                      {activeLiveSlot.claimedByDisplayName ?? 'Player'}
                    </Text>
                    <Text style={sheet.infoRole}>{activeLiveSlot.role}</Text>
                  </View>
                </View>

                {(isOrganizer || activeLiveSlot.claimedByUserId === viewerId) && (
                  <Pressable
                    style={({ pressed }) => [sheet.releaseButton, pressed && sheet.optionPressed]}
                    onPress={() => {
                      if (props.mode !== 'live') return;
                      const releaseCb = props.onRelease;
                      const slotId = activeLiveSlot.slotId;
                      const isOwn = activeLiveSlot.claimedByUserId === viewerId;
                      const name = activeLiveSlot.claimedByDisplayName ?? 'This player';
                      Alert.alert(
                        isOwn ? 'Leave this spot?' : 'Remove from spot?',
                        isOwn
                          ? 'You\u2019ll be removed from this position.'
                          : `${name} will be removed from this position.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: isOwn ? 'Leave' : 'Remove',
                            style: 'destructive',
                            onPress: () => animateClose(() => releaseCb(slotId)),
                          },
                        ]
                      );
                    }}
                    accessibilityRole="button"
                  >
                    <Ionicons name="remove-circle-outline" size={18} color="#ff6b6b" />
                    <Text style={sheet.releaseButtonText}>
                      {activeLiveSlot.claimedByUserId === viewerId
                        ? 'Leave spot'
                        : 'Remove from spot'}
                    </Text>
                  </Pressable>
                )}
              </>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ─── Court styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  courtOuter: {
    aspectRatio: 2 / 3,
    borderColor: LINE_COLOR,
    borderRadius: radii.md,
    borderWidth: 3,
    overflow: 'hidden',
    width: '100%',
  },
  slotWrapper: {
    alignItems: 'center',
    marginLeft: -SLOT_R,
    marginTop: -SLOT_R,
    position: 'absolute',
  },
  slot: {
    alignItems: 'center',
    backgroundColor: SLOT_FILL,
    borderColor: SLOT_RING,
    borderRadius: SLOT_R,
    borderWidth: 3,
    height: SLOT_D,
    justifyContent: 'center',
    width: SLOT_D,
  },
  slotClaimed: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  slotMyPending: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  slotHasPending: {
    opacity: 0.65,
  },
  slotPendingCount: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  slotPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.88 }],
  },
  overlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  errorText: {
    color: colors.textMuted,
    marginTop: spacing.xs,
    ...typography.small,
  },
});

// ─── Sheet styles ─────────────────────────────────────────────────────────────

const sheet = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    backgroundColor: colors.surface,
    borderTopColor: colors.borderStrong,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxxl : spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: 3,
    height: 4,
    marginBottom: spacing.md,
    width: 42,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  backButton: {
    left: 0,
    padding: spacing.xs,
    position: 'absolute',
  },
  titleSpacer: {
    position: 'absolute',
    right: 0,
    width: 28,
  },
  title: {
    ...typography.label,
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  option: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  optionPressed: {
    opacity: 0.75,
  },
  optionIcon: {
    alignItems: 'center',
    width: 28,
  },
  optionBody: {
    flex: 1,
  },
  optionLabel: {
    color: colors.textPrimary,
    ...typography.body,
  },
  optionSub: {
    color: colors.textMuted,
    marginTop: 1,
    ...typography.small,
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  nameInput: {
    color: colors.textPrimary,
    flex: 1,
    padding: 0,
    ...typography.body,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
  },
  matchPickerLink: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  matchPickerLinkText: {
    color: colors.accent,
    ...typography.small,
    fontWeight: '700',
  },
  matchStateBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  matchStateText: {
    color: colors.textSecondary,
    textAlign: 'center',
    ...typography.small,
  },
  // ── Live mode: claimed-slot info sheet ──
  infoRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoBody: {
    flex: 1,
  },
  infoName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  infoRole: {
    color: colors.textMuted,
    marginTop: 2,
    ...typography.small,
  },
  releaseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderColor: 'rgba(255, 107, 107, 0.3)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  releaseButtonText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '700',
  },
});
